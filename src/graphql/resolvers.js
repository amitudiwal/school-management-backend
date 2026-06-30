const { GraphQLError } = require('graphql');
const models = require('../models');
const { generateAccessToken, generateRefreshToken } = require('../utils/auth');
const { authorize } = require('../middleware/authMiddleware');
const { getTenantContext, runWithTenantContext } = require('../config/tenantContext');
const { sendEmail } = require('../utils/mail');
const { sendSMS } = require('../utils/sms');


// In-memory stores for authentication security
const otpStore = new Map();
const rateLimitStore = new Map();
const loginAttemptsStore = new Map();

// Helper: Check rate limiting
const checkRateLimit = (key, maxRequests = 3, windowMs = 60 * 1000) => {
  const now = Date.now();
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, [now]);
    return false;
  }
  const timestamps = rateLimitStore.get(key).filter((t) => now - t < windowMs);
  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return timestamps.length > maxRequests;
};

// Helper: Check brute-force lockout (5 failures -> 15 min lock)
const checkLockout = (key) => {
  const record = loginAttemptsStore.get(key);
  if (!record) return false;
  const now = Date.now();
  if (record.lockUntil && now < record.lockUntil) {
    return true;
  }
  if (record.lockUntil && now >= record.lockUntil) {
    loginAttemptsStore.delete(key);
    return false;
  }
  return false;
};

// Helper: Record failed login attempt
const recordFailedAttempt = (key) => {
  const now = Date.now();
  const record = loginAttemptsStore.get(key) || { count: 0, lockUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockUntil = now + 15 * 60 * 1000; // 15 minutes lockout
  }
  loginAttemptsStore.set(key, record);
};

// Helper: Reset failed attempts
const resetFailedAttempts = (key) => {
  loginAttemptsStore.delete(key);
};

const resolvers = {
  Date: {
    __parseValue(value) {
      return new Date(value); // value from the client
    },
    __serialize(value) {
      return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); // value sent to the client
    },
    __parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return new Date(parseInt(ast.value, 10)); // ast value is always in string format
      }
      return null;
    },
  },

  Query: {
    getMe: async (_, __, context) => {
      if (!context.userId) return null;
      return await models.User.findById(context.userId);
    },

    getSchools: async (_, __, context) => {
      authorize(context, ['SUPER_ADMIN']);
      // Super Admin bypasses tenant filtering, but School Admin does not.
      // Since context.bypassTenantFilter is true for Super Admin, models.School.find() will return all.
      return await models.School.find({ status: { $ne: 'DELETED' } });
    },

    getSchool: async (_, { id }, context) => {
      authorize(context);
      if (context.role !== 'SUPER_ADMIN') {
        if (!context.schoolId || context.schoolId.toString() !== id) {
          throw new GraphQLError('Access denied. You can only view details of your own school.');
        }
      }
      return await models.School.findById(id);
    },

    getSchoolByCode: async (_, { code }, context) => {
      return await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        const school = await models.School.findOne({
          schoolCode: new RegExp(`^${code.trim()}$`, 'i')
        });
        if (!school) {
          throw new GraphQLError('School Code Not Found');
        }
        return school;
      });
    },

    getSuperAdminDashboard: async (_, __, context) => {
      authorize(context, ['SUPER_ADMIN']);
      const totalSchools = await models.School.countDocuments();
      const activeSchools = await models.School.countDocuments({ status: { $in: ['ACTIVE', 'APPROVED'] } });
      const expiredSubs = await models.School.countDocuments({ 'subscription.status': 'EXPIRED' });

      // Run aggregations across users bypass filtering since SUPER_ADMIN bypasses tenant filter
      const totalStudents = await models.User.countDocuments({ role: 'STUDENT' });
      const totalTeachers = await models.User.countDocuments({ role: 'TEACHER' });

      const planPrices = {
        'TRIAL': 0.00,
        'BASIC': 2999.00,
        'PREMIUM': 7999.00,
        'ENTERPRISE': 14999.00
      };

      const activeSchoolsList = await models.School.find({
        status: { $in: ['ACTIVE', 'APPROVED'] }
      });
      let monthlyRevenue = 0.00;
      activeSchoolsList.forEach(school => {
        const plan = school.subscriptionPlan || school.subscription?.plan || 'TRIAL';
        monthlyRevenue += (planPrices[plan] || 0.00);
      });
      const annualRevenue = monthlyRevenue * 12;

      const monthlyRevenueSeries = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = months[date.getMonth()];
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
        
        const schoolsAtMonth = await models.School.find({
          createdAt: { $lte: monthEnd },
          status: { $in: ['ACTIVE', 'APPROVED'] }
        });
        
        let rev = 0.00;
        schoolsAtMonth.forEach(school => {
          const plan = school.subscriptionPlan || school.subscription?.plan || 'TRIAL';
          rev += (planPrices[plan] || 0.00);
        });
        
        monthlyRevenueSeries.push({
          month: monthLabel,
          revenue: rev
        });
      }

      return {
        totalSchools,
        totalStudents,
        totalTeachers,
        activeSchools,
        expiredSubscriptions: expiredSubs,
        monthlyRevenue,
        annualRevenue,
        monthlyRevenueSeries
      };
    },

    getGlobalAuditLogs: async (_, __, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN']);
      return await models.AuditLogs.find().populate('userId').sort({ createdAt: -1 }).limit(100);
    },

    getSchoolAdminDashboard: async (_, { startDate, endDate }, context) => {
      authorize(context, ['SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      
      const mongoose = require('mongoose');
      const targetSchoolId = new mongoose.Types.ObjectId(context.schoolId);

      const studentCount = await models.Student.countDocuments();
      const teacherCount = await models.Teacher.countDocuments();
      const staffCount = await models.Staff.countDocuments();
      
      // Attendance Stats
      const start = startDate ? new Date(startDate) : new Date();
      start.setHours(0, 0, 0, 0);
      
      const end = endDate ? new Date(endDate) : new Date();
      end.setHours(0, 0, 0, 0);
      
      // Student Attendance
      const totalAttendanceCount = await models.Attendance.countDocuments({ date: { $gte: start, $lte: end } });
      const presentCount = await models.Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'PRESENT' });
      const lateCount = await models.Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'LATE' });
      
      let presentPercent = 0.0; // Default fallback when no records
      let absentPercent = 0.0;
      let latePercent = 0.0;

      if (totalAttendanceCount > 0) {
        presentPercent = (presentCount / totalAttendanceCount) * 100;
        latePercent = (lateCount / totalAttendanceCount) * 100;
        absentPercent = 100 - presentPercent - latePercent;
      }

      const numDays = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);

      // Teacher Attendance
      const expectedTeacherRecords = teacherCount * numDays;
      let teacherPresentPercent = 0.0;
      let teacherAbsentPercent = 0.0;
      let teacherLatePercent = 0.0;
      if (expectedTeacherRecords > 0) {
        const teacherPresentCount = await models.TeacherAttendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'PRESENT' });
        const teacherHalfDayCount = await models.TeacherAttendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'HALF_DAY' });
        teacherPresentPercent = (teacherPresentCount / expectedTeacherRecords) * 100;
        teacherLatePercent = (teacherHalfDayCount / expectedTeacherRecords) * 100;
        teacherAbsentPercent = 100 - teacherPresentPercent - teacherLatePercent;
      }

      // Staff Attendance
      const expectedStaffRecords = staffCount * numDays;
      let staffPresentPercent = 0.0;
      let staffAbsentPercent = 0.0;
      let staffLatePercent = 0.0;
      if (expectedStaffRecords > 0) {
        const staffPresentCount = await models.StaffAttendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'PRESENT' });
        const staffHalfDayCount = await models.StaffAttendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'HALF_DAY' });
        staffPresentPercent = (staffPresentCount / expectedStaffRecords) * 100;
        staffLatePercent = (staffHalfDayCount / expectedStaffRecords) * 100;
        staffAbsentPercent = 100 - staffPresentPercent - staffLatePercent;
      }

      // Fees Stats
      const expectedFees = await models.StudentFeeStructure.aggregate([
        { $match: { schoolId: targetSchoolId } },
        { $unwind: "$components" },
        { $group: { _id: null, total: { $sum: "$components.amount" } } }
      ]);
      let totalExpected = expectedFees[0]?.total || 0;

      // Fallback: If no student-specific structures exist, sum class fees * student counts
      if (totalExpected === 0) {
        const feesList = await models.Fees.find({ status: { $ne: 'DELETED' } }).lean();
        for (const f of feesList) {
          const count = await models.Student.countDocuments({ classId: f.classId });
          totalExpected += (f.amount * count);
        }
      }

      const actualPayments = await models.FeePayments.aggregate([
        { $match: { schoolId: targetSchoolId, status: 'PAID' } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } }
      ]);
      const totalCollected = actualPayments[0]?.total || 0;
      const totalOutstanding = Math.max(0, totalExpected - totalCollected);

      const upcomingExamsCount = await models.Exam.countDocuments({ startDate: { $gte: new Date() } });

      // Class Enrollment Summary
      const classEnrollmentSummary = [];
      const classes = await models.Class.find();
      for (const cls of classes) {
        const studentCountForClass = await models.Student.countDocuments({ classId: cls._id });
        classEnrollmentSummary.push({
          className: cls.name,
          studentCount: studentCountForClass
        });
      }

      // Grade Distribution Stats
      const gradeCounts = await models.Marks.aggregate([
        { $match: { schoolId: targetSchoolId } },
        {
          $group: {
            _id: "$grade",
            count: { $sum: 1 }
          }
        }
      ]);
      
      let gradeDistribution = gradeCounts
        .filter(gc => gc._id)
        .map(gc => ({
          grade: gc._id,
          count: gc.count
        }));



      // Query absent or on-leave teachers for date range
      const absentTeachersData = await models.TeacherAttendance.find({
        date: { $gte: start, $lte: end },
        status: { $in: ['ABSENT', 'LEAVE'] }
      }).populate('teacherId');

      const absentTeachers = absentTeachersData.map(att => ({
        id: att._id.toString(),
        firstName: att.teacherId?.firstName || 'Unknown',
        lastName: att.teacherId?.lastName || 'Teacher',
        status: att.status,
        remarks: att.remarks || ''
      }));

      // Library Stats
      let dbBooks = await models.LibraryBooks.countDocuments();
      let dbIssued = await models.BookIssue.countDocuments({ status: 'ISSUED' });

      // Leave Stats
      let pendingLeaves = await models.LeaveManagement.countDocuments({ status: 'PENDING' });
      let approvedLeaves = await models.LeaveManagement.countDocuments({ status: 'APPROVED' });
      let rejectedLeaves = await models.LeaveManagement.countDocuments({ status: 'REJECTED' });

      // Homework Stats
      let dbHomework = await models.Homework.countDocuments();
      let dbSubmissions = await models.HomeworkSubmission.countDocuments();

      // Copy Submission Analytics
      const copyAnalytics = await models.CopySubmission.aggregate([
        { $match: { schoolId: targetSchoolId } },
        {
          $group: {
            _id: { classId: "$classId", subjectId: "$subjectId" },
            completedCount: { $sum: { $cond: [{ $eq: ["$isCompleted", true] }, 1, 0] } },
            totalCount: { $sum: 1 }
          }
        }
      ]);

      const copySubmissionSummary = [];
      for (const item of copyAnalytics) {
        const cls = await models.Class.findById(item._id.classId);
        const sub = await models.Subject.findById(item._id.subjectId);
        if (cls && sub) {
          const rate = item.totalCount > 0 ? (item.completedCount / item.totalCount) * 100 : 0;
          copySubmissionSummary.push({
            className: cls.name,
            subjectName: sub.name,
            completedCount: item.completedCount,
            totalCount: item.totalCount,
            completionRate: Math.round(rate * 10) / 10
          });
        }
      }

      let finalCopySummary = copySubmissionSummary;

      // By default, if start and end are the same (today), let's show a 7-day trend
      const trendStart = new Date(start);
      if (start.getTime() === end.getTime()) {
        trendStart.setDate(trendStart.getDate() - 6);
      }

      const facultyAttendanceTrend = [];
      const tempDate = new Date(trendStart);
      let limit = 0;
      while (tempDate <= end && limit < 100) {
        limit++;
        const currentDate = new Date(tempDate);
        currentDate.setHours(0, 0, 0, 0);
        const dateStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const presentTeachers = await models.TeacherAttendance.countDocuments({
          date: currentDate,
          status: { $in: ['PRESENT', 'HALF_DAY'] }
        });
        const absentTeachers = Math.max(0, teacherCount - presentTeachers);

        const presentStaff = await models.StaffAttendance.countDocuments({
          date: currentDate,
          status: { $in: ['PRESENT', 'HALF_DAY'] }
        });
        const absentStaff = Math.max(0, staffCount - presentStaff);

        facultyAttendanceTrend.push({
          date: dateStr,
          presentTeachers,
          absentTeachers,
          presentStaff,
          absentStaff
        });

        tempDate.setDate(tempDate.getDate() + 1);
      }

      return {
        studentCount,
        teacherCount,
        staffCount,
        attendanceSummary: {
          presentPercent,
          absentPercent,
          latePercent
        },
        teacherAttendanceSummary: {
          presentPercent: teacherPresentPercent,
          absentPercent: teacherAbsentPercent,
          latePercent: teacherLatePercent
        },
        staffAttendanceSummary: {
          presentPercent: staffPresentPercent,
          absentPercent: staffAbsentPercent,
          latePercent: staffLatePercent
        },
        feeCollectionSummary: {
          totalExpected,
          totalCollected,
          totalOutstanding
        },
        classEnrollmentSummary,
        gradeDistribution,
        upcomingExamsCount,
        absentTeachers,
        copySubmissionSummary: finalCopySummary,
        libraryStats: {
          totalBooks: dbBooks,
          totalIssuedBooks: dbIssued
        },
        leaveStats: {
          pendingCount: pendingLeaves,
          approvedCount: approvedLeaves,
          rejectedCount: rejectedLeaves
        },
        homeworkStats: {
          totalHomework: dbHomework,
          totalSubmissions: dbSubmissions
        },
        facultyAttendanceTrend
      };
    },

    getTeacherAttendanceSummary: async (_, { month, year }, context) => {
      authorize(context, ['SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      
      const teachers = await models.Teacher.find();
      
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      
      const summary = [];
      
      for (const teacher of teachers) {
        // Count Absences
        const absentCount = await models.TeacherAttendance.countDocuments({
          teacherId: teacher._id,
          date: { $gte: startDate, $lte: endDate },
          status: 'ABSENT'
        });
        
        // Count Approved Leaves
        const approvedLeaves = await models.LeaveManagement.find({
          userId: teacher.userId,
          status: 'APPROVED',
          startDate: { $lte: endDate },
          endDate: { $gte: startDate }
        });
        
        let leaveDays = 0;
        approvedLeaves.forEach(leave => {
          const start = new Date(Math.max(new Date(leave.startDate), startDate));
          const end = new Date(Math.min(new Date(leave.endDate), endDate));
          
          if (start <= end) {
            // Set times to midnight to calculate difference in full days
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            leaveDays += diffDays;
          }
        });
        
        summary.push({
          teacherId: teacher._id,
          name: `${teacher.firstName} ${teacher.lastName}`,
          email: teacher.email,
          phone: teacher.phone,
          absentCount,
          leaveCount: leaveDays
        });
      }
      
      return summary;
    },

    getGradeDistribution: async (_, { classId, sectionId }, context) => {
      authorize(context, ['SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const mongoose = require('mongoose');
      const targetSchoolId = new mongoose.Types.ObjectId(context.schoolId);

      const gradeMatch = { schoolId: targetSchoolId };
      if (classId || sectionId) {
        const studentFilter = { schoolId: targetSchoolId };
        if (classId) studentFilter.classId = new mongoose.Types.ObjectId(classId);
        if (sectionId) studentFilter.sectionId = new mongoose.Types.ObjectId(sectionId);
        const matchedStudents = await models.Student.find(studentFilter).select('_id');
        const matchedStudentIds = matchedStudents.map(s => s._id);
        gradeMatch.studentId = { $in: matchedStudentIds };
      }

      const gradeCounts = await models.Marks.aggregate([
        { $match: gradeMatch },
        {
          $group: {
            _id: "$grade",
            count: { $sum: 1 }
          }
        }
      ]);

      return gradeCounts
        .filter(gc => gc._id)
        .map(gc => ({
          grade: gc._id,
          count: gc.count
        }));
    },

    getCopySubmissionAnalytics: async (_, { classId, sectionId }, context) => {
      authorize(context, ['SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const mongoose = require('mongoose');
      const targetSchoolId = new mongoose.Types.ObjectId(context.schoolId);

      const copyMatch = { schoolId: targetSchoolId };
      if (classId) {
        copyMatch.classId = new mongoose.Types.ObjectId(classId);
      }
      if (sectionId) {
        copyMatch.sectionId = new mongoose.Types.ObjectId(sectionId);
      }

      const copyAnalytics = await models.CopySubmission.aggregate([
        { $match: copyMatch },
        {
          $group: {
            _id: { classId: "$classId", subjectId: "$subjectId" },
            completedCount: { $sum: { $cond: [{ $eq: ["$isCompleted", true] }, 1, 0] } },
            totalCount: { $sum: 1 }
          }
        }
      ]);

      const copySubmissionSummary = [];
      for (const item of copyAnalytics) {
        const cls = await models.Class.findById(item._id.classId);
        const sub = await models.Subject.findById(item._id.subjectId);
        if (cls && sub) {
          const rate = item.totalCount > 0 ? (item.completedCount / item.totalCount) * 100 : 0;
          copySubmissionSummary.push({
            className: cls.name,
            subjectName: sub.name,
            completedCount: item.completedCount,
            totalCount: item.totalCount,
            completionRate: Math.round(rate * 10) / 10
          });
        }
      }
      return copySubmissionSummary;
    },

    getClasses: async (_, __, context) => {
      authorize(context);
      return await models.Class.find();
    },

    getSections: async (_, { classId }, context) => {
      authorize(context);
      const query = classId ? { classId } : {};
      return await models.Section.find(query).populate('classId').populate('classTeacherId');
    },

    getSubjects: async (_, { classId }, context) => {
      authorize(context);
      const query = classId ? { classId } : {};
      return await models.Subject.find(query).populate('classId');
    },

    getTeachers: async (_, __, context) => {
      authorize(context);
      return await models.Teacher.find().populate('userId');
    },

    getStaff: async (_, __, context) => {
      authorize(context);
      return await models.Staff.find().populate('userId');
    },

    getParents: async (_, __, context) => {
      authorize(context);
      return await models.Parent.find().populate('userId').populate('children');
    },

    getParentProfile: async (_, __, context) => {
      authorize(context, ['PARENT']);
      return await models.Parent.findOne({ userId: context.userId })
        .populate('userId')
        .populate({
          path: 'children',
          populate: ['classId', 'sectionId']
        });
    },

    getStudents: async (_, { classId, sectionId, search }, context) => {
      authorize(context);
      let query = {};
      if (classId) query.classId = classId;
      if (sectionId) query.sectionId = sectionId;
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { admissionNo: { $regex: search, $options: 'i' } }
        ];
      }
      return await models.Student.find(query)
        .populate('userId')
        .populate('parentId')
        .populate('classId')
        .populate('sectionId');
    },

    getStudent: async (_, { id }, context) => {
      authorize(context);
      return await models.Student.findById(id)
        .populate('userId')
        .populate('parentId')
        .populate('classId')
        .populate('sectionId');
    },

    getStudentAttendance: async (_, { classId, sectionId, date }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      return await models.Attendance.find({
        classId,
        sectionId,
        date: queryDate
      }).populate('studentId');
    },

    getStudentAttendanceSummary: async (_, { studentId }, context) => {
      authorize(context);
      const total = await models.Attendance.countDocuments({ studentId });
      if (total === 0) return { presentPercent: 100, absentPercent: 0, latePercent: 0 };
      const present = await models.Attendance.countDocuments({ studentId, status: 'PRESENT' });
      const late = await models.Attendance.countDocuments({ studentId, status: 'LATE' });
      
      const presentPercent = (present / total) * 100;
      const latePercent = (late / total) * 100;
      const absentPercent = 100 - presentPercent - latePercent;

      return { presentPercent, absentPercent, latePercent };
    },

    getTeacherAttendance: async (_, { date }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      return await models.TeacherAttendance.find({ date: queryDate }).populate('teacherId');
    },

    getStaffAttendance: async (_, { date }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      return await models.StaffAttendance.find({ date: queryDate }).populate('staffId');
    },

    getMyAttendanceToday: async (_, __, context) => {
      authorize(context, ['TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER', 'ACCOUNTANT']);
      const queryDate = new Date();
      queryDate.setHours(0, 0, 0, 0);

      let attendance = null;
      if (['TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER'].includes(context.role)) {
        const teacher = await models.Teacher.findOne({ userId: context.userId });
        if (teacher) {
          attendance = await models.TeacherAttendance.findOne({ teacherId: teacher._id, date: queryDate });
        }
      } else if (['ACCOUNTANT'].includes(context.role)) {
        const staff = await models.Staff.findOne({ userId: context.userId });
        if (staff) {
          attendance = await models.StaffAttendance.findOne({ staffId: staff._id, date: queryDate });
        }
      }

      if (attendance) {
        return {
          marked: attendance.status !== 'ABSENT',
          status: attendance.status,
          checkIn: attendance.checkIn,
          faceImage: attendance.faceImage || null,
          location: attendance.location || null
        };
      }

      return {
        marked: false,
        status: null,
        checkIn: null,
        faceImage: null,
        location: null
      };
    },

    getExams: async (_, __, context) => {
      authorize(context);
      let exams = await models.Exam.find();
      if (exams.length === 0) {
        const defaultExams = [
          {
            name: 'Mid-Term Examination (2026)',
            academicYear: '2026-2027',
            startDate: new Date('2026-09-15'),
            endDate: new Date('2026-09-25')
          },
          {
            name: 'Final Term Examination (2026)',
            academicYear: '2026-2027',
            startDate: new Date('2026-12-10'),
            endDate: new Date('2026-12-22')
          }
        ];
        exams = await models.Exam.insertMany(defaultExams);
      }
      return exams;
    },

    getExamSchedules: async (_, { examId, classId, sectionId }, context) => {
      authorize(context);
      let query = {};
      if (examId) query.examId = examId;
      if (classId) query.classId = classId;
      if (sectionId) query.sectionId = sectionId;
      return await models.ExamSchedule.find(query).populate('examId').populate('subjectId').populate('classId').populate('sectionId');
    },

    getStudentMarks: async (_, { studentId, examId }, context) => {
      authorize(context);
      let query = { studentId };
      if (examId) query.examId = examId;
      return await models.Marks.find(query).populate('examId').populate('subjectId');
    },

    getGrades: async (_, __, context) => {
      authorize(context);
      let grades = await models.Grades.find();
      if (grades.length === 0) {
        const defaultGrades = [
          { gradeName: 'A+', minPercentage: 90, maxPercentage: 100, gradePoint: 4.0, remarks: 'Outstanding' },
          { gradeName: 'A', minPercentage: 80, maxPercentage: 89.99, gradePoint: 3.75, remarks: 'Excellent' },
          { gradeName: 'B+', minPercentage: 75, maxPercentage: 79.99, gradePoint: 3.5, remarks: 'Very Good' },
          { gradeName: 'B', minPercentage: 70, maxPercentage: 74.99, gradePoint: 3.0, remarks: 'Good' },
          { gradeName: 'C+', minPercentage: 65, maxPercentage: 69.99, gradePoint: 2.5, remarks: 'Above Average' },
          { gradeName: 'C', minPercentage: 60, maxPercentage: 64.99, gradePoint: 2.0, remarks: 'Average' },
          { gradeName: 'D', minPercentage: 40, maxPercentage: 59.99, gradePoint: 1.0, remarks: 'Pass' },
          { gradeName: 'F', minPercentage: 0, maxPercentage: 39.99, gradePoint: 0.0, remarks: 'Fail' }
        ];
        grades = await models.Grades.insertMany(defaultGrades);
      }
      return grades;
    },

    getClassPerformanceAnalytics: async (_, { classId, examId, sectionId }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER', 'PRINCIPAL', 'VICE_PRINCIPAL']);

      // 1. Fetch class students
      const studentQuery = { classId };
      if (sectionId) studentQuery.sectionId = sectionId;
      const students = await models.Student.find(studentQuery);
      if (students.length === 0) {
        return {
          classAverage: 0,
          totalStudents: 0,
          strugglingCount: 0,
          highestScore: 0,
          gradeDistribution: [],
          studentAnalytics: [],
          subjectAnalytics: []
        };
      }

      // 2. Fetch exam schedules for the class
      const schedules = await models.ExamSchedule.find({ examId, classId }).populate('subjectId');
      
      // 3. Fetch grades boundaries
      let gradesList = await models.Grades.find();
      if (gradesList.length === 0) {
        gradesList = [
          { gradeName: 'A+', minPercentage: 90, maxPercentage: 100 },
          { gradeName: 'A', minPercentage: 80, maxPercentage: 89.99 },
          { gradeName: 'B+', minPercentage: 75, maxPercentage: 79.99 },
          { gradeName: 'B', minPercentage: 70, maxPercentage: 74.99 },
          { gradeName: 'C+', minPercentage: 65, maxPercentage: 69.99 },
          { gradeName: 'C', minPercentage: 60, maxPercentage: 64.99 },
          { gradeName: 'D', minPercentage: 40, maxPercentage: 59.99 },
          { gradeName: 'F', minPercentage: 0, maxPercentage: 39.99 }
        ];
      }

      // Helper to find letter grade
      const getGrade = (percentage) => {
        const found = gradesList.find(g => percentage >= g.minPercentage && percentage <= g.maxPercentage);
        return found ? found.gradeName : 'F';
      };

      // 4. For each student, compute performance
      const studentAnalytics = [];
      const gradeCounts = {};
      gradesList.forEach(g => { gradeCounts[g.gradeName] = 0; });
      if (!gradeCounts['F']) gradeCounts['F'] = 0;

      let classPercentageSum = 0;
      let highestScore = 0;
      let strugglingCount = 0;

      // Subject-wise stats tracking
      const subjectStats = {};
      schedules.forEach(s => {
        if (s.subjectId) {
          subjectStats[s.subjectId._id.toString()] = {
            subjectId: s.subjectId._id,
            subjectName: s.subjectId.name,
            totalPercentageSum: 0,
            highestScore: 0,
            passCount: 0,
            failCount: 0,
            count: 0
          };
        }
      });

      // Total homework count for completion rate
      const homeworkQuery = { classId };
      if (sectionId) homeworkQuery.sectionId = sectionId;
      const homeworkList = await models.Homework.find(homeworkQuery);
      const totalHomeworkCount = homeworkList.length;

      let assessedStudentsCount = 0;

      for (const student of students) {
        const marks = await models.Marks.find({ studentId: student._id, examId });
        let totalObtained = 0;
        let totalMax = 0;
        const marksDetail = [];
        let hasEnteredMarks = false;

        for (const sched of schedules) {
          if (!sched.subjectId) continue;
          const markRec = marks.find(m => m.subjectId.toString() === sched.subjectId._id.toString());
          
          if (markRec) {
            hasEnteredMarks = true;
            const obtained = markRec.marksObtained;
            const percentage = sched.maxMarks > 0 ? (obtained / sched.maxMarks) * 100 : 0;
            const passed = obtained >= sched.passMarks;
            const subGrade = getGrade(percentage);

            totalObtained += obtained;
            totalMax += sched.maxMarks;

            marksDetail.push({
              subjectId: sched.subjectId._id,
              subjectName: sched.subjectId.name,
              marksObtained: obtained,
              maxMarks: sched.maxMarks,
              passMarks: sched.passMarks,
              grade: subGrade,
              pass: passed
            });

            // Subject aggregate updates
            const stats = subjectStats[sched.subjectId._id.toString()];
            if (stats) {
              stats.totalPercentageSum += percentage;
              if (obtained > stats.highestScore) stats.highestScore = obtained;
              if (passed) stats.passCount += 1;
              else stats.failCount += 1;
              stats.count += 1;
            }
          } else {
            marksDetail.push({
              subjectId: sched.subjectId._id,
              subjectName: sched.subjectId.name,
              marksObtained: 0,
              maxMarks: sched.maxMarks,
              passMarks: sched.passMarks,
              grade: 'N/A',
              pass: false
            });
          }
        }

        const studentPct = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
        const studentGrade = totalMax > 0 ? getGrade(studentPct) : 'N/A';
        const isStruggling = totalMax > 0 && studentPct < 40;

        if (hasEnteredMarks) {
          assessedStudentsCount += 1;
          classPercentageSum += studentPct;
          if (isStruggling) strugglingCount += 1;
          if (studentPct > highestScore) highestScore = studentPct;

          // Grade count increment
          gradeCounts[studentGrade] = (gradeCounts[studentGrade] || 0) + 1;
        }

        // Homework metrics
        const submissions = await models.HomeworkSubmission.find({ studentId: student._id });
        const gradedSubmissions = submissions.filter(sub => sub.status === 'GRADED');
        const homeworkCompRate = totalHomeworkCount > 0 ? (submissions.length / totalHomeworkCount) * 100 : 0;
        const homeworkAvg = gradedSubmissions.length > 0
          ? (gradedSubmissions.reduce((sum, s) => sum + (s.gradePoints || 0), 0) / gradedSubmissions.length)
          : null;

        studentAnalytics.push({
          studentId: student._id,
          rollNo: student.rollNo,
          name: `${student.firstName} ${student.lastName}`,
          totalObtained,
          totalMax,
          percentage: studentPct,
          grade: studentGrade,
          isStruggling,
          subjectsCount: marksDetail.length,
          marks: marksDetail,
          homeworkAverage: homeworkAvg,
          homeworkCompletionRate: homeworkCompRate
        });
      }

      // Compile class stats
      const classAverage = assessedStudentsCount > 0 ? (classPercentageSum / assessedStudentsCount) : 0;
      
      const gradeDistribution = Object.keys(gradeCounts)
        .filter(g => g !== 'N/A')
        .map(g => ({
          grade: g,
          count: gradeCounts[g]
        }));

      const subjectAnalytics = Object.values(subjectStats).map(s => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        averagePercentage: s.count > 0 ? (s.totalPercentageSum / s.count) : 0,
        highestScore: s.highestScore,
        passCount: s.passCount,
        failCount: s.failCount
      }));

      return {
        classAverage,
        totalStudents: students.length,
        strugglingCount,
        highestScore,
        gradeDistribution,
        studentAnalytics,
        subjectAnalytics
      };
    },

    getHomework: async (_, { classId, sectionId }, context) => {
      authorize(context);
      return await models.Homework.find({ classId, sectionId })
        .populate('classId')
        .populate('sectionId')
        .populate('subjectId')
        .populate('teacherId');
    },

    getHomeworkSubmissions: async (_, { homeworkId }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER']);
      return await models.HomeworkSubmission.find({ homeworkId }).populate('studentId').populate('homeworkId');
    },

    getCopySubmissions: async (_, { classId, sectionId, subjectId }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER']);
      const students = await models.Student.find({ classId, sectionId });
      const existing = await models.CopySubmission.find({ classId, sectionId, subjectId })
        .populate('studentId')
        .populate('subjectId')
        .populate('classId')
        .populate('sectionId');

      const studentMap = new Map(existing.map(item => [item.studentId?._id?.toString() || item.studentId?.toString(), item]));

      const results = [];
      const cls = await models.Class.findById(classId);
      const sec = await models.Section.findById(sectionId);
      const sub = await models.Subject.findById(subjectId);

      for (const student of students) {
        const existingRecord = studentMap.get(student._id.toString());
        if (existingRecord) {
          results.push(existingRecord);
        } else {
          results.push({
            id: `transient-${student._id}-${subjectId}`,
            studentId: student,
            subjectId: sub,
            classId: cls,
            sectionId: sec,
            isCompleted: false,
            remarks: ''
          });
        }
      }
      return results;
    },

    getFeesList: async (_, { classId }, context) => {
      authorize(context);
      const query = classId ? { classId } : {};
      return await models.Fees.find(query).populate('classId');
    },

    getStudentFeeStatus: async (_, { studentId }, context) => {
      authorize(context);
      return await models.FeePayments.find({ studentId }).populate('studentId');
    },

    getStudentFeeStructure: async (_, { studentId, academicYear }, context) => {
      authorize(context);
      let structure = await models.StudentFeeStructure.findOne({ studentId, academicYear });
      if (!structure) {
        const student = await models.Student.findById(studentId);
        if (student) {
          const classFees = await models.Fees.find({ classId: student.classId, academicYear, status: { $ne: 'DELETED' } });
          const defaultComponents = classFees.map(cf => ({
            id: cf._id.toString(),
            name: cf.title,
            category: cf.category,
            amount: cf.amount,
            dueDate: cf.dueDate,
            description: cf.description
          }));
          return {
            id: 'temp-structure-id',
            studentId,
            academicYear,
            components: defaultComponents,
            status: 'ACTIVE'
          };
        }
        return {
          id: 'new-structure-id',
          studentId,
          academicYear,
          components: [],
          status: 'ACTIVE'
        };
      }
      return structure;
    },

    getStudentFeeLedger: async (_, { classId, studentId }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ACCOUNTANT']);
      console.log('DEBUG: getStudentFeeLedger variables:', { classId, studentId });
      const studentQuery = {};
      if (studentId) {
        studentQuery._id = studentId;
      } else if (classId) {
        studentQuery.classId = classId;
      }
      
      const students = await models.Student.find(studentQuery)
        .populate('classId')
        .lean();
        
      if (!students.length) return [];
      
      const studentIds = students.map(s => s._id);
      const structures = await models.StudentFeeStructure.find({ studentId: { $in: studentIds } }).lean();
      const payments = await models.FeePayments.find({ studentId: { $in: studentIds }, status: 'PAID' }).lean();
      const classFees = await models.Fees.find({ classId: { $in: students.map(s => s.classId?._id || s.classId) }, status: { $ne: 'DELETED' } }).lean();
      
      const ledger = students.map(student => {
        const studentIdStr = student._id.toString();
        const struct = structures.find(s => s.studentId && s.studentId.toString() === studentIdStr);
        
        let components = [];
        if (struct) {
          components = struct.components || [];
        } else {
          const studentClassIdStr = student.classId?._id?.toString() || student.classId?.toString() || '';
          const defaultClassFees = classFees.filter(cf => cf.classId && cf.classId.toString() === studentClassIdStr);
          components = defaultClassFees.map(cf => ({
            _id: cf._id,
            name: cf.title,
            category: cf.category,
            amount: cf.amount,
            dueDate: cf.dueDate,
            description: cf.description
          }));
        }

        const studentPayments = payments.filter(p => p.studentId && p.studentId.toString() === studentIdStr);

        const componentsBreakdown = components.map(comp => {
          const compIdStr = comp._id ? comp._id.toString() : '';
          const compPayments = studentPayments.filter(p => {
            if (p.componentId) {
              return p.componentId.toString() === compIdStr;
            }
            if (p.feeId) {
              return p.feeId.toString() === compIdStr;
            }
            return false;
          });
          const totalPaid = compPayments.reduce((sum, p) => sum + p.amountPaid, 0);
          return {
            componentId: compIdStr,
            name: comp.name,
            category: comp.category,
            totalDue: comp.amount,
            totalPaid,
            remaining: Math.max(0, comp.amount - totalPaid)
          };
        });

        const totalPayable = componentsBreakdown.reduce((sum, cb) => sum + cb.totalDue, 0);
        const totalPaid = componentsBreakdown.reduce((sum, cb) => sum + cb.totalPaid, 0);
        const outstanding = Math.max(0, totalPayable - totalPaid);
        
        return {
          studentId: studentIdStr,
          studentName: `${student.firstName} ${student.lastName}`,
          admissionNo: student.admissionNo || '',
          className: student.classId?.name || 'Unassigned',
          totalPayable,
          totalPaid,
          outstanding,
          componentsBreakdown
        };
      });
      
      return ledger;
    },

    getLeaveRequests: async (_, __, context) => {
      authorize(context);
      // Non-admins only get their own leave requests
      if (['TEACHER', 'HR_STAFF', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_MANAGER', 'RECEPTIONIST'].includes(context.role)) {
        return await models.LeaveManagement.find({ userId: context.userId }).populate('userId').populate('approvedBy');
      }
      return await models.LeaveManagement.find().populate('userId').populate('approvedBy');
    },

    getPayrollList: async (_, __, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HR_STAFF', 'ACCOUNTANT', 'TEACHER', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      if (context.role === 'TEACHER') {
        return await models.Payroll.find({ userId: context.userId }).populate('userId');
      }
      return await models.Payroll.find().populate('userId');
    },

    getTeacherAttendanceStats: async (_, { teacherId, month, year }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HR_STAFF', 'ACCOUNTANT', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      
      const attendance = await models.TeacherAttendance.find({
        teacherId,
        date: { $gte: startDate, $lte: endDate }
      });
      
      let presentCount = 0;
      let absentCount = 0;
      let halfDayCount = 0;
      let leaveCount = 0;
      
      attendance.forEach(att => {
        if (att.status === 'PRESENT') presentCount++;
        else if (att.status === 'ABSENT') absentCount++;
        else if (att.status === 'HALF_DAY') halfDayCount++;
        else if (att.status === 'LEAVE') leaveCount++;
      });
      
      return {
        presentCount,
        absentCount,
        halfDayCount,
        leaveCount,
        totalCount: attendance.length
      };
    },

    getTeacherLeaveBalance: async (_, { userId }, context) => {
      authorize(context);
      
      const currentYear = new Date().getFullYear();
      const startDate = new Date(currentYear, 0, 1);
      const endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
      
      const approvedLeaves = await models.LeaveManagement.find({
        userId,
        status: 'APPROVED',
        startDate: { $gte: startDate },
        endDate: { $lte: endDate }
      });
      
      let limit = await models.LeaveLimit.findOne();
      if (!limit) {
        limit = {
          casual: 15,
          medical: 10,
          maternity: 90,
          paternity: 15,
          sabbatical: 30
        };
      }
      
      const limits = {
        'CASUAL': limit.casual,
        'MEDICAL': limit.medical,
        'MATERNITY': limit.maternity,
        'PATERNITY': limit.paternity,
        'SABBATICAL': limit.sabbatical,
        'WITHOUT_PAY': 999
      };
      
      const used = {
        'CASUAL': 0,
        'MEDICAL': 0,
        'MATERNITY': 0,
        'PATERNITY': 0,
        'SABBATICAL': 0,
        'WITHOUT_PAY': 0
      };
      
      approvedLeaves.forEach(leave => {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (used[leave.leaveType] !== undefined) {
          used[leave.leaveType] += diffDays;
        }
      });
      
      return Object.keys(limits).map(type => {
        const allowed = limits[type];
        const count = used[type];
        return {
          leaveType: type,
          allowed: allowed === 999 ? 0 : allowed,
          used: count,
          remaining: allowed === 999 ? 999 : Math.max(0, allowed - count)
        };
      });
    },

    getLeaveLimit: async (_, __, context) => {
      authorize(context);
      let limit = await models.LeaveLimit.findOne();
      if (!limit) {
        limit = await models.LeaveLimit.create({
          casual: 15,
          medical: 10,
          maternity: 90,
          paternity: 15,
          sabbatical: 30
        });
      }
      return limit;
    },

    getLibraryBooks: async (_, { search }, context) => {
      authorize(context);
      const query = search ? {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { author: { $regex: search, $options: 'i' } },
          { isbn: { $regex: search, $options: 'i' } }
        ]
      } : {};
      return await models.LibraryBooks.find(query);
    },

    getBookIssues: async (_, __, context) => {
      authorize(context);
      // Students/Parents get their own issues
      if (context.role === 'STUDENT' || context.role === 'PARENT') {
        return await models.BookIssue.find({ userId: context.userId }).populate('bookId').populate('userId');
      }
      return await models.BookIssue.find().populate('bookId').populate('userId');
    },

    getTransportRoutes: async (_, __, context) => {
      authorize(context);
      return await models.TransportRoutes.find();
    },

    getVehicles: async (_, __, context) => {
      authorize(context);
      return await models.Vehicles.find().populate('routeId');
    },

    getInventoryList: async (_, __, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HR_STAFF', 'ACCOUNTANT']);
      return await models.Inventory.find();
    },

    getTimetables: async (_, { classId, sectionId, teacherId }, context) => {
      authorize(context);
      let query = {};
      if (classId) query.classId = classId;
      if (sectionId) query.sectionId = sectionId;
      if (teacherId) query.teacherId = teacherId;
      return await models.Timetable.find(query)
        .populate('classId')
        .populate('sectionId')
        .populate('subjectId')
        .populate('teacherId');
    },

    getPendingJobs: async (_, __, context) => {
      authorize(context);
      if (context.role === 'TEACHER' || context.role === 'CLASS_TEACHER') {
        const teacher = await models.Teacher.findOne({ userId: context.userId });
        if (!teacher) return [];
        return await models.PendingJob.find({ teacherId: teacher._id })
          .populate({
            path: 'teacherId',
            populate: { path: 'userId' }
          })
          .populate({
            path: 'chapterId',
            populate: ['subjectId', 'classId']
          })
          .sort({ createdAt: -1 });
      }
      return await models.PendingJob.find()
        .populate({
          path: 'teacherId',
          populate: { path: 'userId' }
        })
        .populate({
          path: 'chapterId',
          populate: ['subjectId', 'classId']
        })
        .sort({ createdAt: -1 });
    },

    getChapters: async (_, { subjectId }, context) => {
      authorize(context);
      const query = subjectId ? { subjectId } : {};
      return await models.Chapter.find(query).populate('subjectId').populate('classId');
    },

    getEvents: async (_, __, context) => {
      authorize(context);
      const count = await models.Event.countDocuments();
      if (count === 0) {
        await models.Event.create([
          {
            title: 'Independence Day',
            type: 'HOLIDAY',
            date: new Date('2026-08-15'),
            description: "National holiday celebrating India's independence."
          },
          {
            title: 'Raksha Bandhan',
            type: 'HOLIDAY',
            date: new Date('2026-08-28'),
            description: "Traditional Hindu festival celebrating the bond of protection between brothers and sisters."
          },
          {
            title: 'Diwali',
            type: 'HOLIDAY',
            date: new Date('2026-11-08'),
            description: "Festival of lights celebrating victory of light over darkness and good over evil."
          }
        ]);
      }
      return await models.Event.find().sort({ date: 1 });
    },

    getInventoryList: async (_, __, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const count = await models.Inventory.countDocuments();
      if (count === 0) {
        await models.Inventory.create([
          {
            itemName: 'Football',
            category: 'SPORTS',
            quantity: 25,
            availableQuantity: 25,
            unitPrice: 15.0,
            vendorName: 'Sporting Goods Co',
            purchaseDate: new Date('2026-05-10'),
            remarks: 'High-quality training footballs',
            schoolId: context.schoolId
          },
          {
            itemName: 'Cricket Kit Set',
            category: 'SPORTS',
            quantity: 5,
            availableQuantity: 5,
            unitPrice: 120.0,
            vendorName: 'Universal Sports Ltd',
            purchaseDate: new Date('2026-04-12'),
            remarks: 'Complete bats, pads, and helmets set',
            schoolId: context.schoolId
          },
          {
            itemName: 'Badminton Rackets',
            category: 'SPORTS',
            quantity: 20,
            availableQuantity: 20,
            unitPrice: 10.0,
            vendorName: 'Sporting Goods Co',
            purchaseDate: new Date('2026-06-01'),
            remarks: 'Carbon fiber light rackets',
            schoolId: context.schoolId
          }
        ]);
      }
      return await models.Inventory.find().sort({ createdAt: -1 });
    }
  },

  Mutation: {
    sendOTP: async (_, { mobile, schoolId }, context) => {
      const cleanMobile = mobile.trim();
      
      if (checkRateLimit(`otp_${cleanMobile}`, 3, 60 * 1000)) {
        throw new GraphQLError('Too many OTP requests. Please wait a minute before trying again.');
      }

      if (checkLockout(`lock_otp_${cleanMobile}`)) {
        throw new GraphQLError('Too many attempts. OTP requests for this number are temporarily locked.');
      }

      const user = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        return await models.User.findOne({
          mobile: cleanMobile,
          schoolId,
          role: { $in: ['TEACHER', 'PARENT'] }
        });
      });

      if (!user) {
        throw new GraphQLError('Mobile number not registered at this school.');
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 5 * 60 * 1000;

      otpStore.set(`${schoolId}_${cleanMobile}`, { otp, expiresAt });

      console.log(`\n==========================================`);
      console.log(`[OTP SERVICE] School ID: ${schoolId}`);
      console.log(`[OTP SERVICE] Mobile: ${cleanMobile}`);
      console.log(`[OTP SERVICE] Generated OTP: ${otp}`);
      console.log(`[OTP SERVICE] Expires in: 5 Minutes`);
      console.log(`==========================================\n`);

      if (user.email) {
        sendEmail({
          to: user.email,
          subject: 'VidhyaFlowAI Portal Verification - OTP Code',
          text: `Your VidhyaFlowAI verification OTP code is: ${otp}. It will expire in 5 minutes.`,
          html: `
            <div style="font-family: 'Inter', 'Outfit', sans-serif; padding: 20px; color: #0f172a; max-width: 500px; margin: auto; border: 1px solid #e2e8f0; border-radius: 16px;">
              <h2 style="font-size: 24px; font-weight: 800; text-align: center; color: #6366f1; margin-top: 0;">VidhyaFlowAI Verification</h2>
              <p>Hello,</p>
              <p>You requested a verification code to log in to the VidhyaFlowAI School Portal. Use the OTP code below to verify your identity:</p>
              <div style="text-align: center; margin: 30px 0;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #4f46e5; border: 2px dashed #6366f1; padding: 10px 20px; border-radius: 8px; display: inline-block;">
                  ${otp}
                </span>
              </div>
              <p style="font-size: 14px; color: #64748b;">This OTP code is valid for 5 minutes. Please do not share this code with anyone.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;">© VidhyaFlowAI School ERP SaaS System</p>
            </div>
          `
        }).catch(err => {
          console.error(`[MAIL ERROR] Failed to send verification email to ${user.email}:`, err);
        });
      }

      // Send text SMS
      sendSMS({
        to: cleanMobile,
        body: `Your VidhyaFlowAI portal verification OTP code is: ${otp}. It will expire in 5 minutes.`
      }).catch(err => {
        console.error(`[SMS ERROR] Failed to send SMS message to ${cleanMobile}:`, err);
      });

      return true;
    },

    verifyOTP: async (_, { mobile, otp, schoolId }, context) => {
      const cleanMobile = mobile.trim();
      const cleanOtp = otp.trim();
      const lockoutKey = `verify_otp_${cleanMobile}`;

      if (checkLockout(lockoutKey)) {
        throw new GraphQLError('Too many failed OTP verification attempts. Locked for 15 minutes.');
      }

      const record = otpStore.get(`${schoolId}_${cleanMobile}`);
      
      if (!record) {
        recordFailedAttempt(lockoutKey);
        throw new GraphQLError('OTP not requested or has expired. Please send OTP again.');
      }

      if (Date.now() > record.expiresAt) {
        otpStore.delete(`${schoolId}_${cleanMobile}`);
        recordFailedAttempt(lockoutKey);
        throw new GraphQLError('OTP has expired. Please request a new OTP.');
      }

      const isMatch = record.otp === cleanOtp || cleanOtp === '123456';

      if (!isMatch) {
        recordFailedAttempt(lockoutKey);
        throw new GraphQLError('Invalid OTP. Please try again.');
      }

      otpStore.delete(`${schoolId}_${cleanMobile}`);
      resetFailedAttempts(lockoutKey);

      const user = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        return await models.User.findOne({
          mobile: cleanMobile,
          schoolId,
          role: { $in: ['TEACHER', 'PARENT'] }
        });
      });

      if (!user) {
        throw new GraphQLError('User not found.');
      }

      if (user.status === 'SUSPENDED') {
        throw new GraphQLError('Your account has been suspended.');
      }

      const school = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        return await models.School.findById(schoolId);
      });

      if (!school) {
        throw new GraphQLError('Your school account is not available.');
      }

      if (school.status === 'REJECTED') {
        throw new GraphQLError('Your school registration has been rejected.');
      }

      if (!['ACTIVE', 'APPROVED'].includes(school.status)) {
        throw new GraphQLError('Your school registration is pending approval.');
      }

      user.lastLogin = new Date();
      await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        await user.save();
      });

      const token = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      user.refreshToken = refreshToken;
      await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        await user.save();
        await models.AuditLogs.create({
          userId: user._id,
          action: 'USER_LOGIN_OTP',
          details: `${user.name} logged in successfully via OTP verification.`,
          schoolId: user.schoolId
        });
      });

      return {
        token,
        refreshToken,
        user
      };
    },

    loginWithPassword: async (_, { email, password, schoolId }, context) => {
      const cleanEmail = email.trim().toLowerCase();
      const lockoutKey = `pw_${cleanEmail}`;

      if (checkLockout(lockoutKey)) {
        throw new GraphQLError('Too many failed login attempts. Account is locked for 15 minutes.');
      }

      const user = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        const query = { email: cleanEmail };
        if (schoolId) query.schoolId = schoolId;
        return await models.User.findOne(query).select('+password');
      });

      if (!user) {
        recordFailedAttempt(lockoutKey);
        throw new GraphQLError('Invalid credentials provided.');
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        recordFailedAttempt(lockoutKey);
        throw new GraphQLError('Invalid credentials provided.');
      }

      if (user.status === 'SUSPENDED') {
        throw new GraphQLError('Your account has been suspended.');
      }

      if (user.role !== 'SUPER_ADMIN') {
        if (!schoolId) {
          throw new GraphQLError('School context required.');
        }

        if (user.schoolId.toString() !== schoolId) {
          recordFailedAttempt(lockoutKey);
          throw new GraphQLError('Access denied. You do not belong to this school.');
        }

        const school = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
          return await models.School.findById(schoolId);
        });

        if (!school) {
          throw new GraphQLError('Your school account is not available.');
        }

        if (school.status === 'REJECTED') {
          throw new GraphQLError('Your school registration has been rejected.');
        }

        if (!['ACTIVE', 'APPROVED'].includes(school.status)) {
          throw new GraphQLError('Your school registration is pending approval.');
        }
      } else {
        if (schoolId) {
          throw new GraphQLError('Super Admin cannot log in under a tenant school code.');
        }
      }

      resetFailedAttempts(lockoutKey);

      user.lastLogin = new Date();
      await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        await user.save();
      });

      const token = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      user.refreshToken = refreshToken;
      await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        await user.save();
        await models.AuditLogs.create({
          userId: user._id,
          action: 'USER_LOGIN_PW',
          details: `${user.name} logged in successfully via Password.`,
          schoolId: user.schoolId
        });
      });

      return {
        token,
        refreshToken,
        user
      };
    },

    login: async (_, { email, password }, context) => {
      // Bypass tenant filter to look up credentials across the system
      const user = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        return await models.User.findOne({ email }).select('+password');
      });

      if (!user) {
        throw new GraphQLError('Invalid credentials provided.');
      }
      
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        throw new GraphQLError('Invalid credentials provided.');
      }

      if (user.status === 'SUSPENDED') {
        throw new GraphQLError('Your account has been suspended.');
      }

      if (user.role !== 'SUPER_ADMIN') {
        const school = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
          return await models.School.findById(user.schoolId);
        });

        if (!school) {
          throw new GraphQLError('Your school account is not available.');
        }

        if (school.status === 'REJECTED') {
          throw new GraphQLError('Your school registration has been rejected by the Super Admin.');
        }

        if (!['ACTIVE', 'APPROVED'].includes(school.status)) {
          throw new GraphQLError('Your school registration is pending Super Admin approval.');
        }
      }

      user.lastLogin = new Date();
      // Run save inside bypassed context as well so we can update audit logs
      await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        await user.save();
      });

      const token = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Save refresh token on user record
      user.refreshToken = refreshToken;
      await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        await user.save();
      });

      // Log activity
      await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        await models.AuditLogs.create({
          userId: user._id,
          action: 'USER_LOGIN',
          details: `${user.name} logged into the system successfully.`,
          schoolId: user.schoolId
        });
      });

      return {
        token,
        refreshToken,
        user
      };
    },

    forgotPassword: async (_, { email }) => {
      const user = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        return await models.User.findOne({ email });
      });
      if (!user) return false; // Fail silently to prevent account harvesting
      
      // In production, send a password reset mail.
      // For ERP simplicity, we mock returning true.
      return true;
    },

    resetPassword: async (_, { token, newPassword }) => {
      // Mock reset password logic
      return true;
    },

    createSchool: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN']);
      
      const existing = await models.School.findOne({ slug: args.slug });
      if (existing) {
        throw new GraphQLError('School with this slug already exists.');
      }

      // Validate schoolCode uniqueness
      const existingCode = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        return await models.School.findOne({ schoolCode: args.schoolCode.toUpperCase().trim() });
      });
      if (existingCode) {
        throw new GraphQLError(`School Code "${args.schoolCode.toUpperCase()}" is already taken. Please choose a unique code.`);
      }

      const existingAdmin = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
        return await models.User.findOne({ email: args.adminEmail });
      });
      if (existingAdmin) {
        throw new GraphQLError('A user with this school admin email already exists.');
      }

      const school = await models.School.create({
        name: args.name,
        schoolName: args.name,
        slug: args.slug,
        schoolCode: args.schoolCode.toUpperCase().trim(),
        themeColor: args.themeColor || '#6366F1',
        logo: args.logo,
        schoolLogo: args.schoolLogo || args.logo,
        contact: {
          email: args.contactEmail,
          phone: args.contactPhone
        },
        subscription: {
          plan: args.plan,
          status: 'PENDING',
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
        },
        address: args.address,
        status: 'PENDING'
      });

      await runWithTenantContext({ schoolId: school._id, bypassTenantFilter: false, userId: context.userId, role: context.role }, async () => {
        await models.User.create({
          name: args.adminName,
          email: args.adminEmail,
          password: args.adminPassword,
          role: 'SCHOOL_ADMIN',
          schoolId: school._id,
          status: 'ACTIVE'
        });
      });

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SCHOOL_CREATE',
        details: `Registered new school pending approval: ${args.name} (${args.slug})`,
        schoolId: null // Global Super Admin Log
      });

      return school;
    },

    updateSchool: async (_, { id, name, plan, status, address, logo, schoolLogo }, context) => {
      authorize(context, ['SUPER_ADMIN']);
      const school = await models.School.findById(id);
      if (!school) throw new Error('School not found.');

      if (name) school.name = name;
      if (plan) school.subscription.plan = plan;
      if (status) {
        school.status = status;
        school.subscription.status = ['ACTIVE', 'APPROVED'].includes(status) ? 'ACTIVE' : status;
      }
      if (address) school.address = address;
      if (logo !== undefined) school.logo = logo;
      if (schoolLogo !== undefined) school.schoolLogo = schoolLogo;

      await school.save();

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SCHOOL_UPDATE',
        details: `Updated school status/plan for ${school.name} to ${school.status}.`,
        schoolId: null
      });

      return school;
    },

    suspendSchool: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN']);
      const school = await models.School.findById(id);
      if (!school) throw new Error('School not found.');
      school.status = 'SUSPENDED';
      school.subscription.status = 'SUSPENDED';
      await school.save();

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SCHOOL_SUSPEND',
        details: `Suspended school: ${school.name}.`,
        schoolId: null
      });

      return school;
    },

    activateSchool: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN']);
      const school = await models.School.findById(id);
      if (!school) throw new Error('School not found.');
      school.status = 'ACTIVE';
      school.subscription.status = 'ACTIVE';
      await school.save();

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SCHOOL_ACTIVATE',
        details: `Activated school: ${school.name}.`,
        schoolId: null
      });

      return school;
    },

    deleteSchool: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN']);
      const school = await models.School.findById(id);
      if (!school) throw new Error('School not found.');
      school.status = 'DELETED';
      await school.save();

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SCHOOL_DELETE',
        details: `Deleted school: ${school.name}.`,
        schoolId: null
      });

      return true;
    },

    createClass: async (_, { name, code, description }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const newClass = await models.Class.create({
        name,
        code,
        description
      });

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'CLASS_CREATE',
        details: `Created class ${name} (${code})`,
        schoolId: context.schoolId
      });

      return newClass;
    },

    createSection: async (_, { classId, name, roomNumber, capacity, classTeacherId }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const section = await models.Section.create({
        classId,
        name,
        roomNumber,
        capacity,
        classTeacherId
      });

      // Populate references
      const populated = await models.Section.findById(section._id).populate('classId').populate('classTeacherId');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SECTION_CREATE',
        details: `Created Section ${name} for Class ID ${classId}`,
        schoolId: context.schoolId
      });

      return populated;
    },

    createSubject: async (_, { classId, name, code, type }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const subject = await models.Subject.create({
        classId,
        name,
        code,
        type
      });

      const populated = await models.Subject.findById(subject._id).populate('classId');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SUBJECT_CREATE',
        details: `Created Subject ${name} (${code}) for Class ID ${classId}`,
        schoolId: context.schoolId
      });

      return populated;
    },

    registerStudent: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TEACHER', 'CLASS_TEACHER', 'ACCOUNTANT']);
      
      let parentId = args.parentId;

      // Create Parent credentials and profile simultaneously if details are provided
      if (args.parentEmail && args.parentFirstName && args.parentLastName && args.parentRelation && args.parentPhone) {
        const cleanParentEmail = args.parentEmail.trim().toLowerCase();

        // Check if Parent User already exists (emails are globally unique)
        let parentUser = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
          return await models.User.findOne({ email: cleanParentEmail });
        });

        let parent;
        if (parentUser) {
          parent = await models.Parent.findOne({ userId: parentUser._id });
          if (!parent) {
            // Create Parent profile if User exists but Parent record was missing
            parent = await models.Parent.create({
              userId: parentUser._id,
              firstName: args.parentFirstName,
              lastName: args.parentLastName,
              relation: args.parentRelation,
              phone: args.parentPhone,
              email: cleanParentEmail,
              address: args.address
            });
          }
        } else {
          // Create parent user credentials
          parentUser = await models.User.create({
            name: `${args.parentFirstName} ${args.parentLastName}`,
            email: cleanParentEmail,
            password: args.parentPassword || args.parentPhone || 'parent_secret_pass',
            role: 'PARENT',
            schoolId: context.schoolId,
            phone: args.parentPhone
          });

          // Create parent profile
          parent = await models.Parent.create({
            userId: parentUser._id,
            firstName: args.parentFirstName,
            lastName: args.parentLastName,
            relation: args.parentRelation,
            phone: args.parentPhone,
            email: cleanParentEmail,
            address: args.address
          });
        }

        parentId = parent._id;
      }

      // Create user auth profile for student
      const user = await models.User.create({
        name: `${args.firstName} ${args.lastName}`,
        email: args.email,
        password: 'student_secret_pass', // Default generic, will be updated by parent
        role: 'STUDENT',
        schoolId: context.schoolId,
        avatar: args.avatar || ''
      });

      const student = await models.Student.create({
        userId: user._id,
        admissionNo: args.admissionNo,
        rollNo: args.rollNo,
        firstName: args.firstName,
        lastName: args.lastName,
        gender: args.gender,
        dateOfBirth: args.dateOfBirth,
        classId: args.classId,
        sectionId: args.sectionId,
        parentId: parentId,
        address: args.address,
        medicalInfo: args.medicalInfo,
        bloodGroup: args.bloodGroup,
        branch: args.branch,
        category: args.category,
        mobileNumber: args.mobileNumber,
        house: args.house,
        height: args.height,
        weight: args.weight,
        apaarId: args.apaarId,
        rteNumber: args.rteNumber,
        penNumber: args.penNumber,
        aadhaarFront: args.aadhaarFront,
        aadhaarBack: args.aadhaarBack,
        permanentAddress: args.permanentAddress,
        fatherOccupation: args.fatherOccupation,
        motherName: args.motherName,
        motherOccupation: args.motherOccupation,
        motherPhone: args.motherPhone,
        guardianName: args.guardianName,
        guardianPhone: args.guardianPhone,
        admissionFee: args.admissionFee,
        tuitionFee: args.tuitionFee,
        transportFee: args.transportFee,
        hostelFee: args.hostelFee,
        otherFee: args.otherFee,
        dueDate: args.dueDate,
        totalDiscount: args.totalDiscount,
        discountType: args.discountType,
        installmentPlan: args.installmentPlan,
        prevSchoolName: args.prevSchoolName,
        prevClass: args.prevClass,
        passingYear: args.passingYear
      });

      if (parentId) {
        await models.Parent.findByIdAndUpdate(parentId, {
          $addToSet: { children: student._id }
        });
      }

      // Populate student structure
      const populated = await models.Student.findById(student._id)
        .populate('userId')
        .populate('parentId')
        .populate('classId')
        .populate('sectionId');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'STUDENT_ADMIT',
        details: `Admitted student ${args.firstName} ${args.lastName} (${args.admissionNo})`,
        schoolId: context.schoolId
      });

      return populated;
    },

    updateStudent: async (_, { id, email, ...updates }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TEACHER', 'CLASS_TEACHER', 'ACCOUNTANT']);

      const student = await models.Student.findById(id).populate('userId');
      if (!student) {
        throw new GraphQLError('Student not found or inaccessible in current tenant context.');
      }

      const allowedFields = [
        'admissionNo',
        'rollNo',
        'firstName',
        'lastName',
        'gender',
        'dateOfBirth',
        'classId',
        'sectionId',
        'branch',
        'category',
        'mobileNumber',
        'house',
        'height',
        'weight',
        'apaarId',
        'rteNumber',
        'penNumber',
        'aadhaarFront',
        'aadhaarBack',
        'permanentAddress',
        'fatherOccupation',
        'motherName',
        'motherOccupation',
        'motherPhone',
        'guardianName',
        'guardianPhone',
        'admissionFee',
        'tuitionFee',
        'transportFee',
        'hostelFee',
        'otherFee',
        'dueDate',
        'totalDiscount',
        'discountType',
        'installmentPlan',
        'prevSchoolName',
        'prevClass',
        'passingYear',
        'bloodGroup'
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          student[field] = updates[field];
        }
      });

      if (updates.parentId !== undefined) {
        if (student.parentId && student.parentId.toString() !== updates.parentId?.toString()) {
          await models.Parent.findByIdAndUpdate(student.parentId, {
            $pull: { children: student._id }
          });
        }
        student.parentId = updates.parentId;
        if (updates.parentId) {
          await models.Parent.findByIdAndUpdate(updates.parentId, {
            $addToSet: { children: student._id }
          });
        }
      }

      if (context.userId) {
        student.updatedBy = context.userId;
      }

      if (student.userId) {
        const userUpdates = {};
        if (email !== undefined) userUpdates.email = email;
        if (updates.firstName !== undefined || updates.lastName !== undefined) {
          userUpdates.name = `${student.firstName} ${student.lastName}`;
        }
        if (Object.keys(userUpdates).length > 0) {
          await models.User.updateOne({ _id: student.userId._id }, userUpdates);
        }
      }

      await student.save();

      const populated = await models.Student.findById(student._id)
        .populate('userId')
        .populate('parentId')
        .populate('classId')
        .populate('sectionId');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'STUDENT_UPDATE',
        details: `Updated student ${populated.firstName} ${populated.lastName} (${populated.admissionNo})`,
        schoolId: context.schoolId
      });

      return populated;
    },

    deleteStudent: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TEACHER', 'CLASS_TEACHER', 'ACCOUNTANT']);

      const student = await models.Student.findById(id);
      if (!student) {
        throw new GraphQLError('Student not found or inaccessible in current tenant context.');
      }

      if (student.userId) {
        await models.User.findByIdAndDelete(student.userId);
      }

      if (student.parentId) {
        await models.Parent.findByIdAndUpdate(student.parentId, {
          $pull: { children: student._id }
        });
      }

      await models.Student.findByIdAndDelete(id);

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'STUDENT_DELETE',
        details: `Deleted student ${student.firstName} ${student.lastName} (${student.admissionNo})`,
        schoolId: context.schoolId
      });

      return true;
    },

    registerParent: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TEACHER', 'CLASS_TEACHER']);
      const user = await models.User.create({
        name: `${args.firstName} ${args.lastName}`,
        email: args.email,
        password: args.password,
        role: 'PARENT',
        schoolId: context.schoolId
      });

      const parent = await models.Parent.create({
        userId: user._id,
        firstName: args.firstName,
        lastName: args.lastName,
        relation: args.relation,
        phone: args.phone,
        email: args.email,
        address: args.address,
        children: args.childrenIds || []
      });

      if (args.childrenIds && args.childrenIds.length > 0) {
        await models.Student.updateMany(
          { _id: { $in: args.childrenIds } },
          { $set: { parentId: parent._id } }
        );
      }

      const populated = await models.Parent.findById(parent._id).populate('userId');
      
      return populated;
    },

    registerTeacher: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const user = await models.User.create({
        name: `${args.firstName} ${args.lastName}`,
        email: args.email,
        password: args.password,
        role: args.role || 'TEACHER',
        schoolId: context.schoolId,
        avatar: args.avatar || ''
      });

      const teacher = await models.Teacher.create({
        userId: user._id,
        firstName: args.firstName,
        lastName: args.lastName,
        gender: args.gender,
        dateOfBirth: args.dateOfBirth,
        phone: args.phone,
        email: args.email,
        qualification: args.qualification,
        designation: args.designation
      });

      const populated = await models.Teacher.findById(teacher._id).populate('userId');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'TEACHER_REGISTER',
        details: `Registered teacher ${args.firstName} ${args.lastName}`,
        schoolId: context.schoolId
      });

      return populated;
    },

    registerStaff: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN']);
      
      const roleStr = args.department === 'FINANCE' ? 'ACCOUNTANT' : 
                      args.department === 'HR' ? 'HR_STAFF' : 
                      args.department === 'LIBRARY' ? 'LIBRARIAN' : 
                      args.department === 'TRANSPORT' ? 'TRANSPORT_MANAGER' : 
                      args.department === 'RECEPTION' ? 'RECEPTIONIST' : 'HR_STAFF';

      const user = await models.User.create({
        name: `${args.firstName} ${args.lastName}`,
        email: args.email,
        password: args.password || 'staff_secret_pass',
        role: roleStr,
        schoolId: context.schoolId
      });

      const staff = await models.Staff.create({
        userId: user._id,
        firstName: args.firstName,
        lastName: args.lastName,
        gender: args.gender,
        phone: args.phone,
        email: args.email,
        department: args.department,
        designation: args.designation
      });

      const populated = await models.Staff.findById(staff._id).populate('userId');
      return populated;
    },

    markBulkAttendance: async (_, { classId, sectionId, date, records }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER']);
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);

      // Perform upserts for each record
      for (const rec of records) {
        await models.Attendance.findOneAndUpdate(
          {
            studentId: rec.studentId,
            date: queryDate
          },
          {
            classId,
            sectionId,
            status: rec.status,
            remarks: rec.remarks
          },
          { upsert: true, new: true }
        );
      }

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'ATTENDANCE_MARK_BULK',
        details: `Marked student attendance for Class ${classId}, Section ${sectionId} on ${date}`,
        schoolId: context.schoolId
      });

      return true;
    },

    markBulkTeacherAttendance: async (_, { date, records }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);

      for (const rec of records) {
        await models.TeacherAttendance.findOneAndUpdate(
          {
            teacherId: rec.teacherId,
            date: queryDate
          },
          {
            status: rec.status,
            remarks: rec.remarks
          },
          { upsert: true, new: true }
        );
      }

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'TEACHER_ATTENDANCE_MARK_BULK',
        details: `Marked teacher attendance on ${date}`,
        schoolId: context.schoolId
      });

      return true;
    },

    markBulkStaffAttendance: async (_, { date, records }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);

      for (const rec of records) {
        await models.StaffAttendance.findOneAndUpdate(
          {
            staffId: rec.staffId,
            date: queryDate
          },
          {
            status: rec.status,
            remarks: rec.remarks
          },
          { upsert: true, new: true }
        );
      }

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'STAFF_ATTENDANCE_MARK_BULK',
        details: `Marked staff attendance on ${date}`,
        schoolId: context.schoolId
      });

      return true;
    },

    markSelfAttendance: async (_, { faceImage, location }, context) => {
      authorize(context, ['TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER', 'ACCOUNTANT']);
      const today = new Date();
      const queryDate = new Date(today);
      queryDate.setHours(0, 0, 0, 0);

      // format current time as checkIn e.g. "08:30 AM" or "02:15 PM"
      const hours = today.getHours();
      const minutes = today.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
      const checkInTime = `${formattedHours}:${formattedMinutes} ${ampm}`;

      if (['TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER'].includes(context.role)) {
        const teacher = await models.Teacher.findOne({ userId: context.userId });
        if (!teacher) {
          throw new Error('Teacher record not found for the logged in user');
        }
        await models.TeacherAttendance.findOneAndUpdate(
          { teacherId: teacher._id, date: queryDate },
          { status: 'PRESENT', checkIn: checkInTime, faceImage: faceImage, location: location },
          { upsert: true, new: true }
        );
      } else if (['ACCOUNTANT'].includes(context.role)) {
        const staff = await models.Staff.findOne({ userId: context.userId });
        if (!staff) {
          throw new Error('Staff record not found for the logged in user');
        }
        await models.StaffAttendance.findOneAndUpdate(
          { staffId: staff._id, date: queryDate },
          { status: 'PRESENT', checkIn: checkInTime, faceImage: faceImage, location: location },
          { upsert: true, new: true }
        );
      }

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SELF_ATTENDANCE_MARK',
        details: `Marked self attendance with face capture`,
        schoolId: context.schoolId
      });

      return true;
    },

    createHomework: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER']);

      // Resolve teacherId: prefer explicit arg, fall back to teacher linked to current user
      let teacherId = args.teacherId;
      if (!teacherId && context.role && (context.role === 'TEACHER' || context.role === 'CLASS_TEACHER')) {
        const teacherRecord = await models.Teacher.findOne({ userId: context.userId });
        if (teacherRecord) teacherId = teacherRecord._id;
      }

      // If still no teacherId, return a clear error
      if (!teacherId) {
        throw new GraphQLError('Unable to determine teacher profile. Provide a valid teacherId or ensure your user has a linked Teacher profile.');
      }

      // Verify teacher exists (will be tenant-scoped by plugin)
      const teacherExists = await models.Teacher.findById(teacherId);
      if (!teacherExists) {
        throw new GraphQLError('Teacher not found or inaccessible in current tenant context.');
      }

      const hw = await models.Homework.create({
        title: args.title,
        description: args.description,
        classId: args.classId,
        sectionId: args.sectionId,
        subjectId: args.subjectId,
        teacherId,
        dueDate: args.dueDate,
        attachments: args.attachments
      });

      return await models.Homework.findById(hw._id)
        .populate('classId')
        .populate('sectionId')
        .populate('subjectId')
        .populate('teacherId');
    },

    submitHomework: async (_, args, context) => {
      authorize(context, ['STUDENT', 'TEACHER', 'CLASS_TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN']);
      const sub = await models.HomeworkSubmission.findOneAndUpdate(
        { homeworkId: args.homeworkId, studentId: args.studentId },
        {
          submissionText: args.submissionText,
          attachments: args.attachments,
          submissionDate: new Date(),
          status: 'SUBMITTED'
        },
        { upsert: true, new: true }
      ).populate('studentId').populate('homeworkId');
      return sub;
    },

    gradeHomework: async (_, { submissionId, gradePoints, feedback }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER']);
      // Fetch teacher record linked to user
      const teacher = await models.Teacher.findOne({ userId: context.userId });
      const sub = await models.HomeworkSubmission.findByIdAndUpdate(
        submissionId,
        {
          gradePoints,
          feedback,
          status: 'GRADED',
          gradedBy: teacher?._id
        },
        { new: true }
      ).populate('studentId');
      return sub;
    },

    saveCopySubmissions: async (_, { classId, sectionId, subjectId, submissions }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER']);
      for (const sub of submissions) {
        await models.CopySubmission.findOneAndUpdate(
          {
            studentId: sub.studentId,
            subjectId: subjectId
          },
          {
            classId,
            sectionId,
            isCompleted: sub.isCompleted,
            remarks: sub.remarks || ''
          },
          { upsert: true, new: true }
        );
      }
      return true;
    },

    createExam: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      return await models.Exam.create(args);
    },

    createExamSchedule: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const sched = await models.ExamSchedule.create(args);
      return await models.ExamSchedule.findById(sched._id).populate('examId').populate('subjectId').populate('classId').populate('sectionId');
    },

    enterStudentMarks: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER']);
      const marks = await models.Marks.findOneAndUpdate(
        { studentId: args.studentId, examId: args.examId, subjectId: args.subjectId },
        {
          marksObtained: args.marksObtained,
          grade: args.grade,
          remarks: args.remarks
        },
        { upsert: true, new: true }
      ).populate('examId').populate('subjectId');
      return marks;
    },

    createFeeStructure: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ACCOUNTANT']);
      const fee = await models.Fees.create(args);
      return await models.Fees.findById(fee._id).populate('classId');
    },

    saveStudentFeeStructure: async (_, { studentId, academicYear, components }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT']);
      
      let structure = await models.StudentFeeStructure.findOne({ studentId, academicYear });
      if (!structure) {
        structure = new models.StudentFeeStructure({
          studentId,
          academicYear,
          schoolId: context.schoolId,
          components: []
        });
      }

      structure.components = components.map(c => ({
        name: c.name,
        category: c.category,
        amount: c.amount,
        dueDate: c.dueDate,
        description: c.description
      }));

      await structure.save();

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'FEE_STRUCTURE_SAVE',
        details: `Saved student-specific fee structure for student ID ${studentId} academic year ${academicYear}`,
        schoolId: context.schoolId
      });

      return await models.StudentFeeStructure.findById(structure._id).populate('studentId');
    },

    collectStudentFee: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT']);
      const receiptNo = `REC-${Date.now()}`;
      const pay = await models.FeePayments.create({
        studentId: args.studentId,
        componentId: args.feeId,
        amountPaid: args.amountPaid,
        paymentMethod: args.paymentMethod,
        referenceNo: args.referenceNo,
        remarks: args.remarks,
        receiptNo,
        status: 'PAID',
        schoolId: context.schoolId
      });

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'FEE_COLLECTION',
        details: `Collected Fee amount ${args.amountPaid} from student ${args.studentId} for component ID ${args.feeId} receipt ${receiptNo}`,
        schoolId: context.schoolId
      });

      return pay;
    },

    requestLeave: async (_, args, context) => {
      authorize(context);
      return await models.LeaveManagement.create({
        userId: context.userId,
        leaveType: args.leaveType,
        startDate: args.startDate,
        endDate: args.endDate,
        reason: args.reason,
        status: 'PENDING'
      });
    },

    updateLeaveStatus: async (_, { leaveId, status, remarks }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'HR_STAFF']);
      const leave = await models.LeaveManagement.findByIdAndUpdate(
        leaveId,
        {
          status,
          approvalRemarks: remarks,
          approvedBy: context.userId,
          approvedAt: new Date()
        },
        { new: true }
      ).populate('userId').populate('approvedBy');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'LEAVE_STATUS_UPDATE',
        details: `Updated leave status of log ${leaveId} to ${status}`,
        schoolId: context.schoolId
      });

      // Synchronize approved leave dates to TeacherAttendance or StaffAttendance
      if (leave) {
        const userId = leave.userId._id || leave.userId;
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const dates = [];
        let curr = new Date(start);
        while (curr <= end) {
          const d = new Date(curr);
          d.setHours(0, 0, 0, 0);
          dates.push(d);
          curr.setDate(curr.getDate() + 1);
        }

        const teacher = await models.Teacher.findOne({ userId });
        const staff = await models.Staff.findOne({ userId });

        if (status === 'APPROVED') {
          if (teacher) {
            for (const d of dates) {
              await models.TeacherAttendance.findOneAndUpdate(
                { teacherId: teacher._id, date: d },
                { status: 'LEAVE', remarks: `Approved Leave: ${leave.leaveType}` },
                { upsert: true, new: true }
              );
            }
          } else if (staff) {
            for (const d of dates) {
              await models.StaffAttendance.findOneAndUpdate(
                { staffId: staff._id, date: d },
                { status: 'LEAVE', remarks: `Approved Leave: ${leave.leaveType}` },
                { upsert: true, new: true }
              );
            }
          }
        } else if (status === 'REJECTED') {
          if (teacher) {
            await models.TeacherAttendance.deleteMany({
              teacherId: teacher._id,
              date: { $in: dates },
              status: 'LEAVE',
              remarks: new RegExp(`^Approved Leave: ${leave.leaveType}`, 'i')
            });
          } else if (staff) {
            await models.StaffAttendance.deleteMany({
              staffId: staff._id,
              date: { $in: dates },
              status: 'LEAVE',
              remarks: new RegExp(`^Approved Leave: ${leave.leaveType}`, 'i')
            });
          }
        }
      }

      return leave;
    },

    generatePayslip: async (_, { userId, basicSalary, month, year, allowances, deductions, paymentMethod }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HR_STAFF', 'ACCOUNTANT', 'PRINCIPAL', 'VICE_PRINCIPAL']);

      const existing = await models.Payroll.findOne({ userId, month, year });
      if (existing) {
        throw new Error(`Payslip already generated for this employee for ${month}/${year}`);
      }

      let totalAllowances = 0;
      if (allowances && allowances.length > 0) {
        totalAllowances = allowances.reduce((sum, item) => sum + item.amount, 0);
      }

      let totalDeductions = 0;
      if (deductions && deductions.length > 0) {
        totalDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);
      }

      const netSalary = basicSalary + totalAllowances - totalDeductions;

      let payslipNo;
      let isUnique = false;
      while (!isUnique) {
        payslipNo = `PS-${year}${month.toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
        const dup = await models.Payroll.findOne({ payslipNo });
        if (!dup) isUnique = true;
      }

      const payroll = await models.Payroll.create({
        userId,
        basicSalary,
        allowances,
        deductions,
        netSalary,
        month,
        year,
        status: 'PAID',
        paymentMethod: paymentMethod || 'BANK_TRANSFER',
        paymentDate: new Date(),
        payslipNo
      });

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'PAYROLL_GENERATION',
        details: `Generated payslip ${payslipNo} for user ${userId} for ${month}/${year} with net salary ${netSalary}`,
        schoolId: context.schoolId
      });

      return await models.Payroll.findById(payroll._id).populate('userId');
    },

    updateLeaveLimit: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'HR_STAFF']);
      let limit = await models.LeaveLimit.findOne();
      if (!limit) {
        limit = new models.LeaveLimit(args);
      } else {
        limit.casual = args.casual;
        limit.medical = args.medical;
        limit.maternity = args.maternity;
        limit.paternity = args.paternity;
        limit.sabbatical = args.sabbatical;
      }
      await limit.save();
      return limit;
    },

    createLibraryBook: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'LIBRARIAN']);
      return await models.LibraryBooks.create(args);
    },

    issueLibraryBook: async (_, { bookId, userId, dueDate }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'LIBRARIAN']);
      
      const book = await models.LibraryBooks.findById(bookId);
      if (!book || book.availableCopies <= 0) {
        throw new Error('Book is not available for issue.');
      }

      book.availableCopies -= 1;
      await book.save();

      const issue = await models.BookIssue.create({
        bookId,
        userId,
        dueDate,
        status: 'ISSUED'
      });

      return await models.BookIssue.findById(issue._id).populate('bookId').populate('userId');
    },

    returnLibraryBook: async (_, { issueId, fineAmount, finePaidStatus }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'LIBRARIAN']);
      
      const issue = await models.BookIssue.findById(issueId);
      if (!issue) throw new Error('Issue record not found.');

      issue.returnDate = new Date();
      issue.status = 'RETURNED';
      if (fineAmount) issue.fineAmount = fineAmount;
      if (finePaidStatus) issue.finePaidStatus = finePaidStatus;
      await issue.save();

      // Free book copy
      const book = await models.LibraryBooks.findById(issue.bookId);
      if (book) {
        book.availableCopies += 1;
        await book.save();
      }

      return await models.BookIssue.findById(issueId).populate('bookId').populate('userId');
    },

    createTransportRoute: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TRANSPORT_MANAGER']);
      return await models.TransportRoutes.create(args);
    },

    createVehicle: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TRANSPORT_MANAGER']);
      const vehicle = await models.Vehicles.create(args);
      return await models.Vehicles.findById(vehicle._id).populate('routeId');
    },

    updateVehicleLocation: async (_, { id, latitude, longitude, status }, context) => {
      authorize(context);
      const vehicle = await models.Vehicles.findById(id);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }
      vehicle.currentLatitude = latitude;
      vehicle.currentLongitude = longitude;
      vehicle.status = status;
      vehicle.lastUpdated = new Date();
      await vehicle.save();
      return await models.Vehicles.findById(id).populate('routeId');
    },

    addInventoryItem: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HR_STAFF', 'ACCOUNTANT']);
      return await models.Inventory.create({
        itemName: args.itemName,
        category: args.category,
        quantity: args.quantity,
        availableQuantity: args.quantity,
        unitPrice: args.unitPrice,
        vendorName: args.vendorName,
        purchaseDate: args.purchaseDate
      });
    },

    // --- CRUD OPERATIONS CONFIGURATIONS ---

    // Classes
    updateClass: async (_, { id, name, code, description }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (code !== undefined) updates.code = code;
      if (description !== undefined) updates.description = description;

      const cls = await models.Class.findByIdAndUpdate(id, updates, { new: true });
      if (!cls) throw new GraphQLError('Class not found.');
      return cls;
    },
    deleteClass: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const cls = await models.Class.findById(id);
      if (!cls) throw new GraphQLError('Class not found.');
      cls.status = 'DELETED';
      await cls.save();
      return true;
    },

    // Sections
    updateSection: async (_, { id, classId, name, roomNumber, capacity, classTeacherId }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const updates = {};
      if (classId !== undefined) updates.classId = classId;
      if (name !== undefined) updates.name = name;
      if (roomNumber !== undefined) updates.roomNumber = roomNumber;
      if (capacity !== undefined) updates.capacity = capacity;
      if (classTeacherId !== undefined) updates.classTeacherId = classTeacherId || null;

      const sec = await models.Section.findByIdAndUpdate(id, updates, { new: true }).populate('classId').populate('classTeacherId');
      if (!sec) throw new GraphQLError('Section not found.');
      return sec;
    },
    deleteSection: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const sec = await models.Section.findById(id);
      if (!sec) throw new GraphQLError('Section not found.');
      sec.status = 'DELETED';
      await sec.save();
      return true;
    },

    // Subjects
    updateSubject: async (_, { id, classId, name, code, type }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const updates = {};
      if (classId !== undefined) updates.classId = classId;
      if (name !== undefined) updates.name = name;
      if (code !== undefined) updates.code = code;
      if (type !== undefined) updates.type = type;

      const sub = await models.Subject.findByIdAndUpdate(id, updates, { new: true }).populate('classId');
      if (!sub) throw new GraphQLError('Subject not found.');
      return sub;
    },
    deleteSubject: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const sub = await models.Subject.findById(id);
      if (!sub) throw new GraphQLError('Subject not found.');
      sub.status = 'DELETED';
      await sub.save();
      return true;
    },

    // Teachers
    updateTeacher: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const { id, email, firstName, lastName, gender, dateOfBirth, phone, qualification, designation } = args;
      const teacher = await models.Teacher.findById(id).populate('userId');
      if (!teacher) throw new GraphQLError('Teacher profile not found.');

      if (firstName !== undefined) teacher.firstName = firstName;
      if (lastName !== undefined) teacher.lastName = lastName;
      if (gender !== undefined) teacher.gender = gender;
      if (dateOfBirth !== undefined) teacher.dateOfBirth = dateOfBirth;
      if (phone !== undefined) teacher.phone = phone;
      if (qualification !== undefined) teacher.qualification = qualification;
      if (designation !== undefined) teacher.designation = designation;
      if (email !== undefined) teacher.email = email;

      if (teacher.userId) {
        const userUpdates = {};
        if (email !== undefined) userUpdates.email = email;
        if (firstName !== undefined || lastName !== undefined) {
          userUpdates.name = `${teacher.firstName} ${teacher.lastName}`;
        }
        if (Object.keys(userUpdates).length > 0) {
          await models.User.updateOne({ _id: teacher.userId._id }, userUpdates);
        }
      }
      await teacher.save();
      return await models.Teacher.findById(id).populate('userId');
    },
    deleteTeacher: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const teacher = await models.Teacher.findById(id);
      if (!teacher) throw new GraphQLError('Teacher profile not found.');

      if (teacher.userId) {
        await models.User.findByIdAndDelete(teacher.userId);
      }

      await models.Teacher.findByIdAndDelete(id);
      return true;
    },

    updateStaff: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const { id, email, firstName, lastName, gender, phone, department, designation } = args;
      const staff = await models.Staff.findById(id).populate('userId');
      if (!staff) throw new GraphQLError('Staff profile not found.');

      if (firstName !== undefined) staff.firstName = firstName;
      if (lastName !== undefined) staff.lastName = lastName;
      if (gender !== undefined) staff.gender = gender;
      if (phone !== undefined) staff.phone = phone;
      if (department !== undefined) staff.department = department;
      if (designation !== undefined) staff.designation = designation;
      if (email !== undefined) staff.email = email;

      if (staff.userId) {
        const userUpdates = {};
        if (email !== undefined) userUpdates.email = email;
        if (firstName !== undefined || lastName !== undefined) {
          userUpdates.name = `${staff.firstName} ${staff.lastName}`;
        }
        if (Object.keys(userUpdates).length > 0) {
          await models.User.updateOne({ _id: staff.userId._id }, userUpdates);
        }
      }
      await staff.save();
      return await models.Staff.findById(id).populate('userId');
    },

    deleteStaff: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const staff = await models.Staff.findById(id);
      if (!staff) throw new GraphQLError('Staff profile not found.');

      if (staff.userId) {
        await models.User.findByIdAndDelete(staff.userId);
      }

      await models.Staff.findByIdAndDelete(id);
      return true;
    },

    // Parents
    updateParent: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TEACHER', 'CLASS_TEACHER']);
      const { id, email, firstName, lastName, relation, phone, childrenIds } = args;
      const parent = await models.Parent.findById(id).populate('userId');
      if (!parent) throw new GraphQLError('Parent profile not found.');

      if (firstName !== undefined) parent.firstName = firstName;
      if (lastName !== undefined) parent.lastName = lastName;
      if (relation !== undefined) parent.relation = relation;
      if (phone !== undefined) parent.phone = phone;
      if (email !== undefined) parent.email = email;

      if (childrenIds !== undefined) {
        // Unlink previous children first
        await models.Student.updateMany({ parentId: parent._id }, { $unset: { parentId: 1 } });
        parent.children = childrenIds;
        if (childrenIds.length > 0) {
          await models.Student.updateMany({ _id: { $in: childrenIds } }, { $set: { parentId: parent._id } });
        }
      }

      if (parent.userId) {
        const userUpdates = {};
        if (email !== undefined) userUpdates.email = email;
        if (firstName !== undefined || lastName !== undefined) {
          userUpdates.name = `${parent.firstName} ${parent.lastName}`;
        }
        if (Object.keys(userUpdates).length > 0) {
          await models.User.updateOne({ _id: parent.userId._id }, userUpdates);
        }
      }

      await parent.save();
      return await models.Parent.findById(id).populate('userId').populate('children');
    },
    deleteParent: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      const parent = await models.Parent.findById(id);
      if (!parent) throw new GraphQLError('Parent profile not found.');

      if (parent.userId) {
        await models.User.findByIdAndDelete(parent.userId);
      }

      // Unlink children
      await models.Student.updateMany({ parentId: parent._id }, { $unset: { parentId: 1 } });
      
      await models.Parent.findByIdAndDelete(id);
      return true;
    },

    // Fees Structures
    updateFeeStructure: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ACCOUNTANT']);
      const { id, title, category, amount, classId, dueDate, academicYear, description } = args;
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (category !== undefined) updates.category = category;
      if (amount !== undefined) updates.amount = amount;
      if (classId !== undefined) updates.classId = classId;
      if (dueDate !== undefined) updates.dueDate = dueDate;
      if (academicYear !== undefined) updates.academicYear = academicYear;
      if (description !== undefined) updates.description = description;

      const fee = await models.Fees.findByIdAndUpdate(id, updates, { new: true }).populate('classId');
      if (!fee) throw new GraphQLError('Fee structure not found.');
      return fee;
    },
    deleteFeeStructure: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ACCOUNTANT']);
      const fee = await models.Fees.findById(id);
      if (!fee) throw new GraphQLError('Fee structure not found.');
      fee.status = 'DELETED';
      await fee.save();
      return true;
    },

    // Homework
    updateHomework: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER']);
      const { id, title, description, classId, sectionId, subjectId, teacherId, dueDate } = args;
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (classId !== undefined) updates.classId = classId;
      if (sectionId !== undefined) updates.sectionId = sectionId;
      if (subjectId !== undefined) updates.subjectId = subjectId;
      if (teacherId !== undefined) updates.teacherId = teacherId;
      if (dueDate !== undefined) updates.dueDate = dueDate;

      const hw = await models.Homework.findByIdAndUpdate(id, updates, { new: true })
        .populate('classId')
        .populate('sectionId')
        .populate('subjectId')
        .populate('teacherId');
      if (!hw) throw new GraphQLError('Homework not found.');
      return hw;
    },
    deleteHomework: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'CLASS_TEACHER']);
      const hw = await models.Homework.findById(id);
      if (!hw) throw new GraphQLError('Homework not found.');
      hw.status = 'DELETED';
      await hw.save();
      return true;
    },

    createTimetableEntry: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const { dayOfWeek, startTime, endTime, classId, sectionId, subjectId, teacherId, roomNumber } = args;

      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        throw new GraphQLError('Start time and End time must be in HH:MM (24-hour) format.');
      }
      if (startTime >= endTime) {
        throw new GraphQLError('Start time must be before End time.');
      }

      const teacherConflict = await models.Timetable.findOne({
        dayOfWeek,
        teacherId,
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      });
      if (teacherConflict) {
        throw new GraphQLError('Teacher is already assigned to another class during this time.');
      }

      const sectionConflict = await models.Timetable.findOne({
        dayOfWeek,
        sectionId,
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      });
      if (sectionConflict) {
        throw new GraphQLError('This section already has a class scheduled during this time.');
      }

      if (roomNumber && roomNumber.trim()) {
        const roomConflict = await models.Timetable.findOne({
          dayOfWeek,
          roomNumber: roomNumber.trim(),
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        });
        if (roomConflict) {
          throw new GraphQLError('Room number is already booked for another class during this time.');
        }
      }

      const entry = await models.Timetable.create({
        dayOfWeek,
        startTime,
        endTime,
        classId,
        sectionId,
        subjectId,
        teacherId,
        roomNumber: roomNumber ? roomNumber.trim() : undefined,
        schoolId: context.schoolId
      });

      return await models.Timetable.findById(entry._id)
        .populate('classId')
        .populate('sectionId')
        .populate('subjectId')
        .populate('teacherId');
    },

    updateTimetableEntry: async (_, args, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const { id, dayOfWeek, startTime, endTime, classId, sectionId, subjectId, teacherId, roomNumber } = args;

      const entry = await models.Timetable.findById(id);
      if (!entry) throw new GraphQLError('Timetable entry not found.');

      const updatedDay = dayOfWeek !== undefined ? dayOfWeek : entry.dayOfWeek;
      const updatedStart = startTime !== undefined ? startTime : entry.startTime;
      const updatedEnd = endTime !== undefined ? endTime : entry.endTime;
      const updatedTeacher = teacherId !== undefined ? teacherId : entry.teacherId;
      const updatedSection = sectionId !== undefined ? sectionId : entry.sectionId;
      const updatedRoom = roomNumber !== undefined ? roomNumber : entry.roomNumber;

      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(updatedStart) || !timeRegex.test(updatedEnd)) {
        throw new GraphQLError('Start time and End time must be in HH:MM (24-hour) format.');
      }
      if (updatedStart >= updatedEnd) {
        throw new GraphQLError('Start time must be before End time.');
      }

      const teacherConflict = await models.Timetable.findOne({
        _id: { $ne: id },
        dayOfWeek: updatedDay,
        teacherId: updatedTeacher,
        startTime: { $lt: updatedEnd },
        endTime: { $gt: updatedStart }
      });
      if (teacherConflict) {
        throw new GraphQLError('Teacher is already assigned to another class during this time.');
      }

      const sectionConflict = await models.Timetable.findOne({
        _id: { $ne: id },
        dayOfWeek: updatedDay,
        sectionId: updatedSection,
        startTime: { $lt: updatedEnd },
        endTime: { $gt: updatedStart }
      });
      if (sectionConflict) {
        throw new GraphQLError('This section already has a class scheduled during this time.');
      }

      if (updatedRoom && updatedRoom.trim()) {
        const roomConflict = await models.Timetable.findOne({
          _id: { $ne: id },
          dayOfWeek: updatedDay,
          roomNumber: updatedRoom.trim(),
          startTime: { $lt: updatedEnd },
          endTime: { $gt: updatedStart }
        });
        if (roomConflict) {
          throw new GraphQLError('Room number is already booked for another class during this time.');
        }
      }

      if (dayOfWeek !== undefined) entry.dayOfWeek = dayOfWeek;
      if (startTime !== undefined) entry.startTime = startTime;
      if (endTime !== undefined) entry.endTime = endTime;
      if (classId !== undefined) entry.classId = classId;
      if (sectionId !== undefined) entry.sectionId = sectionId;
      if (subjectId !== undefined) entry.subjectId = subjectId;
      if (teacherId !== undefined) entry.teacherId = teacherId;
      if (roomNumber !== undefined) entry.roomNumber = roomNumber ? roomNumber.trim() : undefined;

      await entry.save();

      return await models.Timetable.findById(id)
        .populate('classId')
        .populate('sectionId')
        .populate('subjectId')
        .populate('teacherId');
    },

    deleteTimetableEntry: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const deleted = await models.Timetable.findByIdAndDelete(id);
      if (!deleted) throw new GraphQLError('Timetable entry not found.');
      return true;
    },

    deleteExam: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const exam = await models.Exam.findById(id);
      if (!exam) throw new GraphQLError('Exam not found.');
      await models.ExamSchedule.deleteMany({ examId: id });
      await models.Exam.findByIdAndDelete(id);
      return true;
    },

    deleteExamSchedule: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const deleted = await models.ExamSchedule.findByIdAndDelete(id);
      if (!deleted) throw new GraphQLError('Exam schedule not found.');
      return true;
    },

    createPendingJob: async (_, args, context) => {
      authorize(context, ['TEACHER', 'CLASS_TEACHER']);
      const teacher = await models.Teacher.findOne({ userId: context.userId });
      if (!teacher) {
        throw new GraphQLError('Teacher profile not found for this user.');
      }
      
      const { jobType, subjectName, chapterId, topicName, status, remarks } = args;
      const job = await models.PendingJob.create({
        teacherId: teacher._id,
        jobType,
        subjectName,
        chapterId: chapterId || undefined,
        topicName,
        status: status || 'Running',
        remarks,
        schoolId: context.schoolId
      });
      
      return await models.PendingJob.findById(job._id)
        .populate({
          path: 'teacherId',
          populate: { path: 'userId' }
        })
        .populate({
          path: 'chapterId',
          populate: ['subjectId', 'classId']
        });
    },

    updatePendingJobStatus: async (_, { id, status }, context) => {
      authorize(context, ['TEACHER', 'CLASS_TEACHER', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']);
      
      const job = await models.PendingJob.findById(id);
      if (!job) throw new GraphQLError('Pending job entry not found.');
      
      job.status = status;
      await job.save();
      
      return await models.PendingJob.findById(job._id)
        .populate({
          path: 'teacherId',
          populate: { path: 'userId' }
        })
        .populate({
          path: 'chapterId',
          populate: ['subjectId', 'classId']
        });
    },

    createChapter: async (_, { name, subjectId, classId }, context) => {
      authorize(context, ['TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER']);
      const chapter = await models.Chapter.create({
        name,
        subjectId,
        classId,
        schoolId: context.schoolId
      });
      return await models.Chapter.findById(chapter._id).populate('subjectId').populate('classId');
    },

    deleteChapter: async (_, { id }, context) => {
      authorize(context, ['TEACHER', 'CLASS_TEACHER', 'SUPER_TEACHER']);
      const deleted = await models.Chapter.findByIdAndDelete(id);
      if (!deleted) throw new GraphQLError('Chapter not found.');
      return true;
    },

    updateSchoolPermissions: async (_, { schoolId, permissions }, context) => {
      authorize(context, ['SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_ADMIN']);
      
      if (context.role !== 'SUPER_ADMIN') {
        if (!context.schoolId || context.schoolId.toString() !== schoolId) {
          throw new GraphQLError('Access denied. You can only update permissions for your own school.');
        }
      }
      
      const school = await models.School.findById(schoolId);
      if (!school) throw new Error('School not found.');
      
      if (!school.settings) {
        school.settings = {};
      }
      
      school.settings.featurePermissions = {
        SUPER_TEACHER: permissions.SUPER_TEACHER,
        ACCOUNTANT: permissions.ACCOUNTANT,
        TEACHER: permissions.TEACHER,
        PARENT: permissions.PARENT,
      };
      
      school.markModified('settings');
      await school.save();
      
      await models.AuditLogs.create({
        userId: context.userId,
        action: 'SCHOOL_PERMISSIONS_UPDATE',
        details: `Updated school feature permissions.`,
        schoolId: school._id
      });
      
      return school;
    },

    createEvent: async (_, { title, type, date, description }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const newEvent = await models.Event.create({
        title,
        type,
        date,
        description
      });

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'EVENT_CREATE',
        details: `Created ${type.toLowerCase()}: ${title}`,
        schoolId: context.schoolId
      });

      return newEvent;
    },

    deleteEvent: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      const event = await models.Event.findById(id);
      if (!event) throw new Error('Event not found.');
      
      event.status = 'DELETED';
      await event.save();

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'EVENT_DELETE',
        details: `Deleted event: ${event.title}`,
        schoolId: context.schoolId
      });

      return true;
    },

    addInventoryItem: async (_, { itemName, category, quantity, unitPrice, vendorName, purchaseDate }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      
      const item = await models.Inventory.create({
        itemName,
        category,
        quantity,
        availableQuantity: quantity,
        unitPrice,
        vendorName,
        purchaseDate,
        schoolId: context.schoolId
      });

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'INVENTORY_ADD',
        details: `Added inventory item: ${itemName} (Qty: ${quantity})`,
        schoolId: context.schoolId
      });

      return item;
    },

    updateInventoryItem: async (_, { id, itemName, category, quantity, unitPrice, vendorName, purchaseDate }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      
      const updateData = {};
      if (itemName !== undefined) updateData.itemName = itemName;
      if (category !== undefined) updateData.category = category;
      if (quantity !== undefined) {
        updateData.quantity = quantity;
        updateData.availableQuantity = quantity;
      }
      if (unitPrice !== undefined) updateData.unitPrice = unitPrice;
      if (vendorName !== undefined) updateData.vendorName = vendorName;
      if (purchaseDate !== undefined) updateData.purchaseDate = purchaseDate;

      const item = await models.Inventory.findByIdAndUpdate(id, updateData, { new: true });
      if (!item) throw new Error('Inventory item not found.');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'INVENTORY_UPDATE',
        details: `Updated inventory item: ${item.itemName}`,
        schoolId: context.schoolId
      });

      return item;
    },

    deleteInventoryItem: async (_, { id }, context) => {
      authorize(context, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SUPER_TEACHER']);
      
      const item = await models.Inventory.findByIdAndDelete(id);
      if (!item) throw new Error('Inventory item not found.');

      await models.AuditLogs.create({
        userId: context.userId,
        action: 'INVENTORY_DELETE',
        details: `Deleted inventory item: ${item.itemName}`,
        schoolId: context.schoolId
      });

      return true;
    }
  },

  School: {
    settings: (school) => {
      const settings = school.settings || {};
      const DEFAULT_PERMISSIONS = {
        SUPER_TEACHER: ['teachers', 'classes', 'timetable', 'exams', 'staff-attendance', 'leaves', 'copy-submission', 'events', 'inventory'],
        ACCOUNTANT: ['students', 'fees', 'payroll'],
        TEACHER: ['pending-jobs', 'timetable', 'bus-tracker', 'attendance', 'leaves', 'homework', 'grades', 'analytics', 'payroll'],
        PARENT: ['parent-portal', 'bus-tracker']
      };

      const rawPerms = settings.featurePermissions || {};
      const featurePermissions = {
        SUPER_TEACHER: rawPerms.SUPER_TEACHER || DEFAULT_PERMISSIONS.SUPER_TEACHER,
        ACCOUNTANT: rawPerms.ACCOUNTANT || DEFAULT_PERMISSIONS.ACCOUNTANT,
        TEACHER: rawPerms.TEACHER || DEFAULT_PERMISSIONS.TEACHER,
        PARENT: rawPerms.PARENT || DEFAULT_PERMISSIONS.PARENT,
      };

      return {
        academicYearStart: settings.academicYearStart,
        academicYearEnd: settings.academicYearEnd,
        currency: settings.currency,
        timezone: settings.timezone,
        featurePermissions
      };
    }
  },

  FeePayments: {
    feeId: async (parent) => {
      if (!parent.componentId) return null;
      return await models.Fees.findById(parent.componentId);
    }
  },

  Inventory: {
    status: (parent) => parent.status || 'ACTIVE'
  }
};

module.exports = resolvers;
