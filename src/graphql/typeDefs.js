const { gql } = require('graphql-tag');

const typeDefs = gql`
  scalar Date

  # Auth Types
  type AuthPayload {
    token: String!
    refreshToken: String!
    user: User!
  }

  type User {
    id: ID!
    name: String!
    firstName: String
    lastName: String
    email: String
    role: String!
    schoolId: ID
    phone: String
    mobile: String
    avatar: String
    lastLogin: Date
    status: String!
  }

  # School & Plan Types
  type Address {
    street: String
    city: String
    state: String
    zipCode: String
    country: String
  }

  input AddressInput {
    street: String
    city: String
    state: String
    zipCode: String
    country: String
  }

  type Contact {
    email: String!
    phone: String!
    website: String
  }

  input ContactInput {
    email: String!
    phone: String!
    website: String
  }

  type Subscription {
    plan: String!
    status: String!
    startDate: Date!
    endDate: Date
  }

  type School {
    id: ID!
    name: String!
    schoolName: String
    slug: String!
    schoolCode: String
    logo: String
    schoolLogo: String
    themeColor: String
    address: Address
    contact: Contact
    subscription: Subscription
    subscriptionPlan: String
    subscriptionStatus: String
    status: String!
    createdAt: Date!
    settings: SchoolSettings
  }

  type RolePermissions {
    SUPER_TEACHER: [String!]!
    ACCOUNTANT: [String!]!
    TEACHER: [String!]!
    PARENT: [String!]!
  }

  type SchoolSettings {
    academicYearStart: String
    academicYearEnd: String
    currency: String
    timezone: String
    featurePermissions: RolePermissions!
  }

  input RolePermissionsInput {
    SUPER_TEACHER: [String!]!
    ACCOUNTANT: [String!]!
    TEACHER: [String!]!
    PARENT: [String!]!
  }

  # Academic Types
  type Class {
    id: ID!
    name: String!
    code: String!
    description: String
    status: String!
  }

  type Section {
    id: ID!
    classId: Class!
    name: String!
    roomNumber: String
    capacity: Int
    classTeacherId: Teacher
    status: String!
  }

  type Subject {
    id: ID!
    name: String!
    code: String!
    type: String!
    classId: Class!
    status: String!
  }

  type Event {
    id: ID!
    title: String!
    type: String!
    date: Date!
    description: String
    status: String!
  }

  # Profile Types
  type Student {
    id: ID!
    userId: User!
    parentId: Parent
    admissionNo: String!
    rollNo: String
    firstName: String!
    lastName: String!
    gender: String!
    dateOfBirth: Date!
    bloodGroup: String
    admissionDate: Date!
    classId: Class!
    sectionId: Section!
    address: Address
    medicalInfo: MedicalInfo
    documents: [Document]
    status: String!
    branch: String
    category: String
    mobileNumber: String
    house: String
    height: Float
    weight: Float
    apaarId: String
    rteNumber: String
    penNumber: String
    aadhaarFront: String
    aadhaarBack: String
    permanentAddress: String
    fatherOccupation: String
    motherName: String
    motherOccupation: String
    motherPhone: String
    guardianName: String
    guardianPhone: String
    admissionFee: Float
    tuitionFee: Float
    transportFee: Float
    hostelFee: Float
    otherFee: Float
    dueDate: Date
    totalDiscount: Float
    discountType: String
    installmentPlan: String
    prevSchoolName: String
    prevClass: String
    passingYear: String
  }

  type MedicalInfo {
    allergies: [String]
    medications: [String]
    conditions: String
    emergencyContactName: String
    emergencyContactPhone: String
  }

  input MedicalInfoInput {
    allergies: [String]
    medications: [String]
    conditions: String
    emergencyContactName: String
    emergencyContactPhone: String
  }

  type Document {
    name: String!
    url: String!
    uploadedAt: Date!
  }

  input DocumentInput {
    name: String!
    url: String!
  }

  type Parent {
    id: ID!
    userId: User!
    firstName: String!
    lastName: String!
    relation: String!
    occupation: String
    phone: String!
    email: String
    address: Address
    children: [Student]
    status: String!
  }

  type BankDetails {
    accountName: String
    accountNo: String
    bankName: String
    ifscCode: String
  }

  type Teacher {
    id: ID!
    userId: User!
    firstName: String!
    lastName: String!
    gender: String!
    dateOfBirth: Date!
    phone: String!
    email: String!
    joinDate: Date!
    qualification: String!
    experienceYears: Int
    designation: String
    assignedSubjects: [Subject]
    assignedClasses: [AssignedClass]
    isClassTeacher: Boolean
    classTeacherOf: AssignedClass
    bankDetails: BankDetails
    status: String!
  }

  type AssignedClass {
    classId: Class!
    sectionId: Section!
  }

  input AssignedClassInput {
    classId: ID!
    sectionId: ID!
  }

  type Staff {
    id: ID!
    userId: User!
    firstName: String!
    lastName: String!
    gender: String!
    phone: String!
    email: String!
    department: String!
    designation: String!
    joinDate: Date!
    status: String!
  }

  # Attendance Types
  type Attendance {
    id: ID!
    studentId: Student!
    classId: Class!
    sectionId: Section!
    date: Date!
    status: String!
    remarks: String
  }

  type TeacherAttendance {
    id: ID!
    teacherId: Teacher!
    date: Date!
    status: String!
    checkIn: String
    checkOut: String
    remarks: String
    faceImage: String
    location: String
  }

  type StaffAttendance {
    id: ID!
    staffId: Staff!
    date: Date!
    status: String!
    checkIn: String
    checkOut: String
    remarks: String
    faceImage: String
    location: String
  }

  type SelfAttendanceStatus {
    marked: Boolean!
    status: String
    checkIn: String
    faceImage: String
    location: String
  }

  # Exam & Grade Types
  type Exam {
    id: ID!
    name: String!
    academicYear: String!
    startDate: Date
    endDate: Date
    description: String
    status: String!
  }

  type ExamSchedule {
    id: ID!
    examId: Exam!
    subjectId: Subject!
    classId: Class!
    sectionId: Section
    date: Date!
    startTime: String!
    endTime: String!
    roomNo: String
    maxMarks: Float!
    passMarks: Float!
  }

  type Marks {
    id: ID!
    studentId: Student!
    examId: Exam!
    subjectId: Subject!
    marksObtained: Float!
    grade: String
    remarks: String
  }

  type Grades {
    id: ID!
    gradeName: String!
    minPercentage: Float!
    maxPercentage: Float!
    gradePoint: Float!
    remarks: String
  }

  type GradeCount {
    grade: String!
    count: Int!
  }

  type SubjectMarksDetail {
    subjectId: ID!
    subjectName: String!
    marksObtained: Float!
    maxMarks: Float!
    passMarks: Float!
    grade: String!
    pass: Boolean!
  }

  type StudentPerformance {
    studentId: ID!
    rollNo: String
    name: String!
    totalObtained: Float!
    totalMax: Float!
    percentage: Float!
    grade: String!
    isStruggling: Boolean!
    subjectsCount: Int!
    marks: [SubjectMarksDetail!]!
    homeworkAverage: Float
    homeworkCompletionRate: Float
  }

  type SubjectPerformance {
    subjectId: ID!
    subjectName: String!
    averagePercentage: Float!
    highestScore: Float!
    passCount: Int!
    failCount: Int!
  }

  type ClassPerformanceAnalytics {
    classAverage: Float!
    totalStudents: Int!
    strugglingCount: Int!
    highestScore: Float!
    gradeDistribution: [GradeCount!]!
    studentAnalytics: [StudentPerformance!]!
    subjectAnalytics: [SubjectPerformance!]!
  }

  # Homework Types
  type Homework {
    id: ID!
    title: String!
    description: String!
    classId: Class!
    sectionId: Section!
    subjectId: Subject!
    teacherId: Teacher
    dueDate: Date!
    attachments: [Document]
    status: String!
  }

  type HomeworkSubmission {
    id: ID!
    homeworkId: Homework!
    studentId: Student!
    submissionText: String
    attachments: [Document]
    submissionDate: Date!
    status: String!
    gradePoints: Float
    feedback: String
  }

  type CopySubmission {
    id: ID!
    studentId: Student!
    subjectId: Subject!
    classId: Class!
    sectionId: Section!
    isCompleted: Boolean!
    remarks: String
  }

  input CopySubmissionInput {
    studentId: ID!
    isCompleted: Boolean!
    remarks: String
  }

  # Fees Types
  type Fees {
    id: ID!
    title: String!
    category: String!
    amount: Float!
    classId: Class!
    dueDate: Date!
    academicYear: String!
    description: String
    status: String!
  }

  type FeeComponent {
    id: ID!
    name: String!
    category: String!
    amount: Float!
    dueDate: Date!
    description: String
  }

  type StudentFeeStructure {
    id: ID!
    studentId: Student!
    academicYear: String!
    components: [FeeComponent!]!
    status: String!
  }

  type FeePayments {
    id: ID!
    studentId: Student!
    componentId: ID!
    amountPaid: Float!
    paymentDate: Date!
    paymentMethod: String!
    status: String!
    referenceNo: String
    receiptNo: String!
    remarks: String
    feeId: Fees
  }

  type ComponentBalance {
    componentId: ID!
    name: String!
    category: String!
    totalDue: Float!
    totalPaid: Float!
    remaining: Float!
  }

  type StudentFeeLedger {
    studentId: ID!
    studentName: String!
    admissionNo: String!
    className: String!
    totalPayable: Float!
    totalPaid: Float!
    outstanding: Float!
    componentsBreakdown: [ComponentBalance!]!
  }

  # HR & Library Types
  type LeaveManagement {
    id: ID!
    userId: User!
    leaveType: String!
    startDate: Date!
    endDate: Date!
    reason: String!
    status: String!
    approvedBy: User
    approvalRemarks: String
    approvedAt: Date
  }

  type PayrollItem {
    name: String!
    amount: Float!
  }

  input PayrollItemInput {
    name: String!
    amount: Float!
  }

  type TeacherAttendanceStats {
    presentCount: Int!
    absentCount: Int!
    halfDayCount: Int!
    leaveCount: Int!
    totalCount: Int!
  }

  type LeaveBalance {
    leaveType: String!
    allowed: Int!
    used: Float!
    remaining: Float!
  }

  type LeaveLimit {
    id: ID!
    casual: Int!
    medical: Int!
    maternity: Int!
    paternity: Int!
    sabbatical: Int!
  }

  type Payroll {
    id: ID!
    userId: User!
    basicSalary: Float!
    allowances: [PayrollItem!]
    deductions: [PayrollItem!]
    netSalary: Float!
    month: Int!
    year: Int!
    status: String!
    payslipNo: String!
    paymentDate: Date
    paymentMethod: String
  }

  type LibraryBook {
    id: ID!
    title: String!
    author: String!
    isbn: String!
    publisher: String
    category: String!
    totalCopies: Int!
    availableCopies: Int!
    rackNo: String
    status: String!
  }

  type BookIssue {
    id: ID!
    bookId: LibraryBook!
    userId: User!
    issueDate: Date!
    dueDate: Date!
    returnDate: Date
    status: String!
    fineAmount: Float!
    finePaidStatus: String!
  }

  # Transport & Inventory Types
  type TransportRoute {
    id: ID!
    routeName: String!
    startLocation: String!
    endLocation: String!
    stops: [Stop]
    routeFee: Float!
    status: String!
  }

  type Stop {
    stopName: String!
    arrivalTime: String!
  }

  input StopInput {
    stopName: String!
    arrivalTime: String!
  }

  type Vehicle {
    id: ID!
    vehicleNo: String!
    model: String
    capacity: Int!
    driverName: String!
    driverPhone: String!
    routeId: TransportRoute
    status: String!
    currentLatitude: Float
    currentLongitude: Float
    lastUpdated: Date
  }

  type Inventory {
    id: ID!
    itemName: String!
    category: String!
    quantity: Int!
    availableQuantity: Int!
    unitPrice: Float
    vendorName: String
    purchaseDate: Date
    status: String!
  }

  type AuditLog {
    id: ID!
    userId: User!
    action: String!
    details: String!
    ipAddress: String
    createdAt: Date!
  }

  type Chapter {
    id: ID!
    name: String!
    subjectId: Subject!
    classId: Class!
    schoolId: ID!
    createdAt: Date!
    updatedAt: Date!
  }

  type PendingJob {
    id: ID!
    teacherId: Teacher!
    jobType: String!
    subjectName: String
    chapterId: Chapter
    topicName: String
    status: String
    remarks: String
    schoolId: ID!
    createdAt: Date!
    updatedAt: Date!
  }

  # Dashboards & Analytics
  type SuperAdminDashboard {
    totalSchools: Int!
    totalStudents: Int!
    totalTeachers: Int!
    activeSchools: Int!
    expiredSubscriptions: Int!
    monthlyRevenue: Float!
    annualRevenue: Float!
    monthlyRevenueSeries: [RevenuePoint]
  }

  type RevenuePoint {
    month: String!
    revenue: Float!
  }

  type ClassEnrollmentPoint {
    className: String!
    studentCount: Int!
  }

  type GradeDistributionPoint {
    grade: String!
    count: Int!
  }

  type AbsentTeacher {
    id: ID!
    firstName: String!
    lastName: String!
    status: String!
    remarks: String
  }

  type CopySubmissionAnalyticPoint {
    className: String!
    subjectName: String!
    completedCount: Int!
    totalCount: Int!
    completionRate: Float!
  }

  type LibraryStats {
    totalBooks: Int!
    totalIssuedBooks: Int!
  }

  type LeaveStatsSummary {
    pendingCount: Int!
    approvedCount: Int!
    rejectedCount: Int!
  }

  type HomeworkStatsSummary {
    totalHomework: Int!
    totalSubmissions: Int!
  }

  type FacultyAttendanceTrendPoint {
    date: String!
    presentTeachers: Int!
    absentTeachers: Int!
    presentStaff: Int!
    absentStaff: Int!
  }

  type SchoolAdminDashboard {
    studentCount: Int!
    teacherCount: Int!
    staffCount: Int!
    attendanceSummary: AttendanceSummary!
    teacherAttendanceSummary: AttendanceSummary!
    staffAttendanceSummary: AttendanceSummary!
    feeCollectionSummary: FeeCollectionSummary!
    classEnrollmentSummary: [ClassEnrollmentPoint!]!
    gradeDistribution: [GradeDistributionPoint!]!
    upcomingExamsCount: Int!
    absentTeachers: [AbsentTeacher!]!
    copySubmissionSummary: [CopySubmissionAnalyticPoint!]!
    libraryStats: LibraryStats!
    leaveStats: LeaveStatsSummary!
    homeworkStats: HomeworkStatsSummary!
    facultyAttendanceTrend: [FacultyAttendanceTrendPoint!]!
  }

  type AttendanceSummary {
    presentPercent: Float!
    absentPercent: Float!
    latePercent: Float!
  }

  type FeeCollectionSummary {
    totalExpected: Float!
    totalCollected: Float!
    totalOutstanding: Float!
  }

  # Bulk Attendance Mark Input
  input BulkAttendanceInput {
    studentId: ID!
    status: String!
    remarks: String
  }

  input BulkTeacherAttendanceInput {
    teacherId: ID!
    status: String!
    remarks: String
  }

  input BulkStaffAttendanceInput {
    staffId: ID!
    status: String!
    remarks: String
  }

  input FeeComponentInput {
    name: String!
    category: String!
    amount: Float!
    dueDate: Date!
    description: String
  }

  type Timetable {
    id: ID!
    dayOfWeek: String!
    startTime: String!
    endTime: String!
    classId: Class!
    sectionId: Section!
    subjectId: Subject!
    teacherId: Teacher!
    roomNumber: String
  }

  type Query {
    # System & Super Admin
    getSchools: [School!]!
    getSchool(id: ID!): School
    getSchoolByCode(code: String!): School
    getSuperAdminDashboard: SuperAdminDashboard!
    getGlobalAuditLogs: [AuditLog!]!

    # School Config & Admin
    getSchoolAdminDashboard(startDate: Date, endDate: Date): SchoolAdminDashboard!
    getGradeDistribution(classId: ID, sectionId: ID): [GradeDistributionPoint!]!
    getCopySubmissionAnalytics(classId: ID, sectionId: ID): [CopySubmissionAnalyticPoint!]!
    getClasses: [Class!]!
    getSections(classId: ID): [Section!]!
    getSubjects(classId: ID): [Subject!]!
    
    # User Profile & Me
    getMe: User
    getParentProfile: Parent
    getTeachers: [Teacher!]!
    getStaff: [Staff!]!
    getParents: [Parent!]!
    
    # Students
    getStudents(classId: ID, sectionId: ID, search: String): [Student!]!
    getStudent(id: ID!): Student
    getTimetables(classId: ID, sectionId: ID, teacherId: ID): [Timetable!]!

    # Attendance
    getStudentAttendance(classId: ID!, sectionId: ID!, date: Date!): [Attendance!]!
    getStudentAttendanceSummary(studentId: ID!): AttendanceSummary!
    getTeacherAttendance(date: Date!): [TeacherAttendance!]!
    getStaffAttendance(date: Date!): [StaffAttendance!]!
    getMyAttendanceToday: SelfAttendanceStatus!
    
    # Exams & Homework
    getExams: [Exam!]!
    getExamSchedules(examId: ID, classId: ID, sectionId: ID): [ExamSchedule!]!
    getStudentMarks(studentId: ID!, examId: ID): [Marks!]!
    getHomework(classId: ID!, sectionId: ID!): [Homework!]!
    getHomeworkSubmissions(homeworkId: ID!): [HomeworkSubmission!]!
    getClassPerformanceAnalytics(classId: ID!, examId: ID!, sectionId: ID): ClassPerformanceAnalytics!
    getGrades: [Grades!]!
    getCopySubmissions(classId: ID!, sectionId: ID!, subjectId: ID!): [CopySubmission!]!

    # Finance & HR
    getFeesList(classId: ID): [Fees!]!
    getStudentFeeStatus(studentId: ID!): [FeePayments!]!
    getStudentFeeLedger(classId: ID, studentId: ID): [StudentFeeLedger!]!
    getStudentFeeStructure(studentId: ID!, academicYear: String!): StudentFeeStructure
    getLeaveRequests: [LeaveManagement!]!
    getPayrollList: [Payroll!]!
    getTeacherAttendanceStats(teacherId: ID!, month: Int!, year: Int!): TeacherAttendanceStats!
    getTeacherLeaveBalance(userId: ID!): [LeaveBalance!]!
    getLeaveLimit: LeaveLimit!

    # Ops
    getLibraryBooks(search: String): [LibraryBook!]!
    getBookIssues: [BookIssue!]!
    getTransportRoutes: [TransportRoute!]!
    getVehicles: [Vehicle!]!
    getInventoryList: [Inventory!]!
    getPendingJobs: [PendingJob!]!
    getChapters(subjectId: ID): [Chapter!]!
    
    # Events & Holidays
    getEvents: [Event!]!
  }

  type Mutation {
    # Auth Mutations
    login(email: String!, password: String!): AuthPayload!
    forgotPassword(email: String!): Boolean!
    resetPassword(token: String!, newPassword: String!): Boolean!
    sendOTP(mobile: String!, schoolId: ID!): Boolean!
    verifyOTP(mobile: String!, otp: String!, schoolId: ID!): AuthPayload!
    loginWithPassword(email: String!, password: String!, schoolId: ID): AuthPayload!

    # Super Admin Operations
    createSchool(name: String!, slug: String!, schoolCode: String!, contactEmail: String!, contactPhone: String!, plan: String!, adminName: String!, adminEmail: String!, adminPassword: String!, themeColor: String, address: AddressInput, logo: String, schoolLogo: String): School!
    updateSchool(id: ID!, name: String, plan: String, status: String, address: AddressInput, logo: String, schoolLogo: String): School!
    suspendSchool(id: ID!): School!
    activateSchool(id: ID!): School!
    deleteSchool(id: ID!): Boolean!

    # School Config Setup
    createClass(name: String!, code: String!, description: String): Class!
    updateClass(id: ID!, name: String, code: String, description: String): Class!
    deleteClass(id: ID!): Boolean!

    createSection(classId: ID!, name: String!, roomNumber: String, capacity: Int, classTeacherId: ID): Section!
    updateSection(id: ID!, classId: ID, name: String, roomNumber: String, capacity: Int, classTeacherId: ID): Section!
    deleteSection(id: ID!): Boolean!

    createSubject(classId: ID!, name: String!, code: String!, type: String!): Subject!
    updateSubject(id: ID!, classId: ID, name: String, code: String, type: String): Subject!
    deleteSubject(id: ID!): Boolean!
    
    # Profile Registrations
    registerStudent(
      email: String!
      admissionNo: String!
      rollNo: String
      firstName: String!
      lastName: String!
      gender: String!
      dateOfBirth: Date!
      classId: ID!
      sectionId: ID!
      parentId: ID
      address: AddressInput
      medicalInfo: MedicalInfoInput
      avatar: String
      parentEmail: String
      parentFirstName: String
      parentLastName: String
      parentRelation: String
      parentPhone: String
      parentPassword: String
      branch: String
      category: String
      mobileNumber: String
      house: String
      height: Float
      weight: Float
      apaarId: String
      rteNumber: String
      penNumber: String
      aadhaarFront: String
      aadhaarBack: String
      permanentAddress: String
      fatherOccupation: String
      motherName: String
      motherOccupation: String
      motherPhone: String
      guardianName: String
      guardianPhone: String
      admissionFee: Float
      tuitionFee: Float
      transportFee: Float
      hostelFee: Float
      otherFee: Float
      dueDate: Date
      totalDiscount: Float
      discountType: String
      installmentPlan: String
      prevSchoolName: String
      prevClass: String
      passingYear: String
      bloodGroup: String
    ): Student!
    updateStudent(
      id: ID!
      email: String
      admissionNo: String
      rollNo: String
      firstName: String
      lastName: String
      gender: String
      dateOfBirth: Date
      classId: ID
      sectionId: ID
      parentId: ID
      branch: String
      category: String
      mobileNumber: String
      house: String
      height: Float
      weight: Float
      apaarId: String
      rteNumber: String
      penNumber: String
      aadhaarFront: String
      aadhaarBack: String
      permanentAddress: String
      fatherOccupation: String
      motherName: String
      motherOccupation: String
      motherPhone: String
      guardianName: String
      guardianPhone: String
      admissionFee: Float
      tuitionFee: Float
      transportFee: Float
      hostelFee: Float
      otherFee: Float
      dueDate: Date
      totalDiscount: Float
      discountType: String
      installmentPlan: String
      prevSchoolName: String
      prevClass: String
      passingYear: String
      bloodGroup: String
    ): Student!
    deleteStudent(id: ID!): Boolean!
    
    registerParent(
      email: String!
      firstName: String!
      lastName: String!
      relation: String!
      phone: String!
      password: String!
      address: AddressInput
      childrenIds: [ID!]
    ): Parent!
    updateParent(
      id: ID!
      email: String
      firstName: String
      lastName: String
      relation: String
      phone: String
      childrenIds: [ID!]
    ): Parent!
    deleteParent(id: ID!): Boolean!
    
    registerTeacher(
      email: String!
      firstName: String!
      lastName: String!
      gender: String!
      dateOfBirth: Date!
      phone: String!
      qualification: String!
      designation: String
      password: String!
      avatar: String
      role: String
    ): Teacher!
    updateTeacher(
      id: ID!
      email: String
      firstName: String
      lastName: String
      gender: String
      dateOfBirth: Date
      phone: String
      qualification: String
      designation: String
    ): Teacher!
    deleteTeacher(id: ID!): Boolean!
    
    registerStaff(
      email: String!
      firstName: String!
      lastName: String!
      gender: String!
      phone: String!
      department: String!
      designation: String!
      password: String
    ): Staff!
    updateStaff(
      id: ID!
      email: String
      firstName: String
      lastName: String
      gender: String
      phone: String
      department: String
      designation: String
    ): Staff!
    deleteStaff(id: ID!): Boolean!

    # Attendance Marking
    markBulkAttendance(classId: ID!, sectionId: ID!, date: Date!, records: [BulkAttendanceInput!]!): Boolean!
    markBulkTeacherAttendance(date: Date!, records: [BulkTeacherAttendanceInput!]!): Boolean!
    markBulkStaffAttendance(date: Date!, records: [BulkStaffAttendanceInput!]!): Boolean!
    checkInTeacherAttendance(teacherId: ID!, checkIn: String!, status: String!): TeacherAttendance!
    checkOutTeacherAttendance(attendanceId: ID!, checkOut: String!): TeacherAttendance!
    markSelfAttendance(faceImage: String!, location: String): Boolean!

    # Homework Assignments
    createHomework(title: String!, description: String!, classId: ID!, sectionId: ID!, subjectId: ID!, teacherId: ID, dueDate: Date!, attachments: [DocumentInput]): Homework!
    updateHomework(id: ID!, title: String, description: String, classId: ID, sectionId: ID, subjectId: ID, teacherId: ID, dueDate: Date): Homework!
    deleteHomework(id: ID!): Boolean!
    submitHomework(homeworkId: ID!, studentId: ID!, submissionText: String, attachments: [DocumentInput]): HomeworkSubmission!
    gradeHomework(submissionId: ID!, gradePoints: Float!, feedback: String!): HomeworkSubmission!
    saveCopySubmissions(classId: ID!, sectionId: ID!, subjectId: ID!, submissions: [CopySubmissionInput!]!): Boolean!

    # Exams & Marks
    createExam(name: String!, academicYear: String!, startDate: Date, endDate: Date, description: String): Exam!
    createExamSchedule(examId: ID!, subjectId: ID!, classId: ID!, date: Date!, startTime: String!, endTime: String!, maxMarks: Float!, passMarks: Float!, roomNo: String, sectionId: ID): ExamSchedule!
    enterStudentMarks(studentId: ID!, examId: ID!, subjectId: ID!, marksObtained: Float!, grade: String, remarks: String): Marks!

    # Fees Management
    createFeeStructure(title: String!, category: String!, amount: Float!, classId: ID!, dueDate: Date!, academicYear: String!, description: String): Fees!
    updateFeeStructure(id: ID!, title: String, category: String, amount: Float, classId: ID, dueDate: Date, academicYear: String, description: String): Fees!
    deleteFeeStructure(id: ID!): Boolean!
    saveStudentFeeStructure(studentId: ID!, academicYear: String!, components: [FeeComponentInput!]!): StudentFeeStructure!
    collectStudentFee(studentId: ID!, feeId: ID!, amountPaid: Float!, paymentMethod: String!, referenceNo: String, remarks: String): FeePayments!

    # HR & Operations
    requestLeave(leaveType: String!, startDate: Date!, endDate: Date!, reason: String!): LeaveManagement!
    updateLeaveStatus(leaveId: ID!, status: String!, remarks: String): LeaveManagement!
    generatePayslip(userId: ID!, basicSalary: Float!, month: Int!, year: Int!, allowances: [PayrollItemInput!], deductions: [PayrollItemInput!], paymentMethod: String): Payroll!
    updateLeaveLimit(casual: Int!, medical: Int!, maternity: Int!, paternity: Int!, sabbatical: Int!): LeaveLimit!

    # Library, Transport & Inventory
    createLibraryBook(title: String!, author: String!, isbn: String!, category: String!, totalCopies: Int!, rackNo: String): LibraryBook!
    issueLibraryBook(bookId: ID!, userId: ID!, dueDate: Date!): BookIssue!
    returnLibraryBook(issueId: ID!, fineAmount: Float, finePaidStatus: String): BookIssue!
    createTransportRoute(routeName: String!, startLocation: String!, endLocation: String!, stops: [StopInput!], routeFee: Float!): TransportRoute!
    createVehicle(vehicleNo: String!, model: String, capacity: Int!, driverName: String!, driverPhone: String!, routeId: ID): Vehicle!
    updateVehicleLocation(id: ID!, latitude: Float!, longitude: Float!, status: String!): Vehicle!
    addInventoryItem(itemName: String!, category: String!, quantity: Int!, unitPrice: Float, vendorName: String, purchaseDate: Date): Inventory!

    # Timetable
    createTimetableEntry(dayOfWeek: String!, startTime: String!, endTime: String!, classId: ID!, sectionId: ID!, subjectId: ID!, teacherId: ID!, roomNumber: String): Timetable!
    updateTimetableEntry(id: ID!, dayOfWeek: String, startTime: String, endTime: String, classId: ID, sectionId: ID, subjectId: ID, teacherId: ID, roomNumber: String): Timetable!
    deleteTimetableEntry(id: ID!): Boolean!
    deleteExam(id: ID!): Boolean!
    deleteExamSchedule(id: ID!): Boolean!
    
    # Pending Jobs
    createPendingJob(jobType: String!, subjectName: String, chapterId: ID, topicName: String, status: String, remarks: String): PendingJob!
    updatePendingJobStatus(id: ID!, status: String!): PendingJob!

    # Chapters
    createChapter(name: String!, subjectId: ID!, classId: ID!): Chapter!
    deleteChapter(id: ID!): Boolean!
    
    # Events & Holidays
    createEvent(title: String!, type: String!, date: Date!, description: String): Event!
    deleteEvent(id: ID!): Boolean!
    
    # Feature Permissions
    updateSchoolPermissions(schoolId: ID!, permissions: RolePermissionsInput!): School!
  }
`;

module.exports = typeDefs;
