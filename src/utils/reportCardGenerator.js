const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const models = require('../models');

// Helper to determine letter grade based on percentage and grades list
const getGradeForPercentage = (percentage, grades) => {
  const matching = grades.find(g => percentage >= g.minPercentage && percentage <= g.maxPercentage);
  return matching ? matching.gradeName : 'F';
};

// Generates an individual student's report card layout on the current PDF document instance
const drawReportCardPage = async (doc, student, exam, school, grades, isMultiPage = false) => {
  // 1. Fetch marks and schedules for this exam and class
  const examSchedules = await models.ExamSchedule.find({ examId: exam._id, classId: student.classId._id }).populate('subjectId');
  const marks = await models.Marks.find({ studentId: student._id, examId: exam._id });

  // 2. Compile marks data
  let totalObtained = 0;
  let totalMax = 0;
  const subjectsData = [];

  for (const sched of examSchedules) {
    if (!sched.subjectId) continue;
    const markRec = marks.find(m => m.subjectId.toString() === sched.subjectId._id.toString());
    const obtained = markRec ? markRec.marksObtained : 0;
    const percentage = sched.maxMarks > 0 ? (obtained / sched.maxMarks) * 100 : 0;
    
    // Find subject grade
    const subGrade = getGradeForPercentage(percentage, grades);
    const passed = obtained >= sched.passMarks;

    totalObtained += obtained;
    totalMax += sched.maxMarks;

    subjectsData.push({
      subjectName: sched.subjectId.name,
      maxMarks: sched.maxMarks,
      passMarks: sched.passMarks,
      marksObtained: obtained,
      grade: subGrade,
      remarks: markRec ? (markRec.remarks || '-') : '-',
      status: passed ? 'PASS' : 'FAIL'
    });
  }

  // 3. Calculate final stats
  const finalPercentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  const finalGrade = getGradeForPercentage(finalPercentage, grades);
  const isStruggling = finalPercentage < 40;
  const passedAll = subjectsData.length > 0 && subjectsData.every(s => s.status === 'PASS');
  const finalStatus = passedAll ? 'PASSED' : 'FAILED';

  // 4. Homework analytics integration
  const totalHomework = await models.Homework.countDocuments({ classId: student.classId._id, sectionId: student.sectionId._id });
  const submissions = await models.HomeworkSubmission.find({ studentId: student._id });
  const gradedSubmissions = submissions.filter(s => s.status === 'GRADED');
  const homeworkCompRate = totalHomework > 0 ? (submissions.length / totalHomework) * 100 : 0;
  const homeworkAvg = gradedSubmissions.length > 0
    ? (gradedSubmissions.reduce((sum, s) => sum + (s.gradePoints || 0), 0) / gradedSubmissions.length)
    : null;

  // 5. Drawing layout elements
  // Logo & School Header
  let logoPath = null;
  const schoolLogo = school.schoolLogo || school.logo;
  if (schoolLogo) {
    const filename = path.basename(schoolLogo);
    const possiblePath = path.join(__dirname, '../../uploads', filename);
    if (fs.existsSync(possiblePath)) {
      logoPath = possiblePath;
    }
  }

  const startY = 40;
  if (logoPath) {
    doc.image(logoPath, 40, startY, { width: 60 });
    doc.fillColor('#4F46E5').fontSize(20).font('Helvetica-Bold').text(school.schoolName || school.name, 115, startY);
    doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(
      `${school.address?.street || ''}, ${school.address?.city || ''}, ${school.address?.state || ''} - ${school.address?.zipCode || ''}`, 
      115, startY + 26
    );
    doc.text(`Email: ${school.contact?.email || '-'} | Phone: ${school.contact?.phone || '-'}`, 115, startY + 38);
  } else {
    doc.fillColor('#4F46E5').fontSize(22).font('Helvetica-Bold').text(school.schoolName || school.name, 40, startY, { align: 'center' });
    doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(
      `${school.address?.street || ''}, ${school.address?.city || ''}, ${school.address?.state || ''} - ${school.address?.zipCode || ''}`,
      40, startY + 26,
      { align: 'center' }
    );
    doc.text(`Email: ${school.contact?.email || '-'} | Phone: ${school.contact?.phone || '-'}`, 40, startY + 38, { align: 'center' });
  }

  // Divider Line
  doc.strokeColor('#E2E8F0').lineWidth(1.5).moveTo(40, startY + 62).lineTo(555, startY + 62).stroke();

  // Report Card Title
  doc.fillColor('#1E293B').fontSize(14).font('Helvetica-Bold').text('STUDENT REPORT CARD', 40, startY + 77, { align: 'center', characterSpacing: 1 });
  doc.fillColor('#4F46E5').fontSize(10).font('Helvetica-Bold').text(exam.name.toUpperCase(), 40, startY + 95, { align: 'center' });

  // Profile Box
  const profileY = startY + 112;
  doc.roundedRect(40, profileY, 515, 76, 6).fillColor('#F8FAFC').fill();
  doc.fillColor('#1E293B').fontSize(9).font('Helvetica');
  
  // Column 1 Text
  doc.font('Helvetica-Bold').text('Student Name:', 55, profileY + 12);
  doc.font('Helvetica').text(`${student.firstName} ${student.lastName}`, 135, profileY + 12);
  doc.font('Helvetica-Bold').text('Admission No:', 55, profileY + 32);
  doc.font('Helvetica').text(student.admissionNo, 135, profileY + 32);
  doc.font('Helvetica-Bold').text('Roll Number:', 55, profileY + 52);
  doc.font('Helvetica').text(student.rollNo || '-', 135, profileY + 52);

  // Column 2 Text
  doc.font('Helvetica-Bold').text('Class & Section:', 305, profileY + 12);
  doc.font('Helvetica').text(`${student.classId?.name || '-'} - ${student.sectionId?.name || '-'}`, 395, profileY + 12);
  doc.font('Helvetica-Bold').text('Academic Year:', 305, profileY + 32);
  doc.font('Helvetica').text(exam.academicYear, 395, profileY + 32);
  doc.font('Helvetica-Bold').text('Date Generated:', 305, profileY + 52);
  doc.font('Helvetica').text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), 395, profileY + 52);

  // Table Header
  const tableTop = profileY + 96;
  doc.rect(40, tableTop, 515, 20).fillColor('#4F46E5').fill();
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
  doc.text('SUBJECT', 50, tableTop + 6, { width: 160 });
  doc.text('MAX MARKS', 220, tableTop + 6, { width: 70, align: 'right' });
  doc.text('PASS MARKS', 300, tableTop + 6, { width: 70, align: 'right' });
  doc.text('MARKS OBTAINED', 380, tableTop + 6, { width: 95, align: 'right' });
  doc.text('GRADE', 485, tableTop + 6, { width: 35, align: 'center' });
  doc.text('STATUS', 520, tableTop + 6, { width: 30, align: 'center' });

  // Table Rows
  let currentY = tableTop + 20;
  doc.font('Helvetica').fontSize(8.5);
  
  if (subjectsData.length === 0) {
    doc.rect(40, currentY, 515, 30).fillColor('#F8FAFC').fill();
    doc.fillColor('#64748B').text('No exam schedules or marks recorded for this exam.', 50, currentY + 10, { align: 'center', width: 495 });
    currentY += 30;
  } else {
    subjectsData.forEach((sub, idx) => {
      // Zebra striping
      if (idx % 2 === 0) {
        doc.rect(40, currentY, 515, 18).fillColor('#F8FAFC').fill();
      }
      
      doc.fillColor('#1E293B');
      doc.text(sub.subjectName, 50, currentY + 5, { width: 160 });
      doc.text(sub.maxMarks.toString(), 220, currentY + 5, { width: 70, align: 'right' });
      doc.text(sub.passMarks.toString(), 300, currentY + 5, { width: 70, align: 'right' });
      doc.text(sub.marksObtained.toString(), 380, currentY + 5, { width: 95, align: 'right' });
      doc.text(sub.grade, 485, currentY + 5, { width: 35, align: 'center' });
      
      // Status Color coding
      if (sub.status === 'PASS') {
        doc.fillColor('#10B981').font('Helvetica-Bold').text('PASS', 520, currentY + 5, { width: 30, align: 'center' }).font('Helvetica');
      } else {
        doc.fillColor('#EF4444').font('Helvetica-Bold').text('FAIL', 520, currentY + 5, { width: 30, align: 'center' }).font('Helvetica');
      }

      // Draw bottom line
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, currentY + 18).lineTo(555, currentY + 18).stroke();
      currentY += 18;
    });
  }

  // Summary Box
  const summaryY = currentY + 12;
  doc.roundedRect(40, summaryY, 515, 72, 6).fillColor('#F1F5F9').fill();
  doc.fillColor('#1E293B').fontSize(9).font('Helvetica');
  
  doc.text('Total Marks:', 55, summaryY + 12);
  doc.font('Helvetica-Bold').text(`${totalObtained} / ${totalMax}`, 135, summaryY + 12);
  doc.font('Helvetica').text('Percentage:', 55, 30 + summaryY);
  doc.font('Helvetica-Bold').text(`${finalPercentage.toFixed(2)}%`, 135, 30 + summaryY);
  doc.font('Helvetica').text('Final Grade:', 55, 48 + summaryY);
  doc.font('Helvetica-Bold').text(finalGrade, 135, 48 + summaryY);

  // Homework stats in summary
  doc.font('Helvetica').text('Homework Average:', 305, summaryY + 12);
  doc.font('Helvetica-Bold').text(homeworkAvg !== null ? `${homeworkAvg.toFixed(1)} / 100` : 'N/A', 435, summaryY + 12);
  doc.font('Helvetica').text('Homework Completion:', 305, summaryY + 30);
  doc.font('Helvetica-Bold').text(`${homeworkCompRate.toFixed(1)}%`, 435, summaryY + 30);
  doc.font('Helvetica').text('Final Status:', 305, summaryY + 48);
  if (finalStatus === 'PASSED') {
    doc.fillColor('#10B981').font('Helvetica-Bold').text('PASSED', 435, summaryY + 48);
  } else {
    doc.fillColor('#EF4444').font('Helvetica-Bold').text('FAILED (SUPPL.)', 435, summaryY + 48);
  }

  // General Remarks
  let remarksY = summaryY + 96;
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(9.5).text("Teacher's General Remarks:", 40, remarksY);
  
  // Choose appropriate default feedback based on score
  let remarkText = "Student has shown good progress and participates well in class.";
  if (isStruggling) {
    remarkText = "Requires immediate attention and regular guidance in all subjects. Needs to spend extra hours on revisions.";
  } else if (finalPercentage >= 85) {
    remarkText = "Outstanding performance! Exhibits exceptional understanding and dedicates great effort to all assignments.";
  } else if (finalPercentage >= 70) {
    remarkText = "Consistent performance. Continues to show steady academic improvement and active class engagement.";
  }

  doc.font('Helvetica').fontSize(9).fillColor('#475569').text(remarkText, 40, remarksY + 16, { width: 515, align: 'left', lineGap: 2 });

  // Signature Area
  const sigY = 740;
  doc.strokeColor('#94A3B8').lineWidth(0.75).moveTo(40, sigY).lineTo(180, sigY).stroke();
  doc.strokeColor('#94A3B8').lineWidth(0.75).moveTo(415, sigY).lineTo(555, sigY).stroke();

  doc.fillColor('#475569').fontSize(8.5).font('Helvetica');
  doc.text('Class Teacher Signature', 40, sigY + 5, { width: 140, align: 'center' });
  doc.text('Principal Signature', 415, sigY + 5, { width: 140, align: 'center' });
};

// Generates PDF buffer for a single student's report card
const generateReportCardPdf = async (studentId, examId, schoolId) => {
  const student = await models.Student.findById(studentId).populate('classId').populate('sectionId').populate('userId');
  if (!student) throw new Error('Student not found');

  const exam = await models.Exam.findById(examId);
  if (!exam) throw new Error('Exam not found');

  const school = await models.School.findById(schoolId);
  if (!school) throw new Error('School not found');

  let grades = await models.Grades.find();
  if (grades.length === 0) {
    // default grades fallback
    grades = [
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

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', err => reject(err));

    drawReportCardPage(doc, student, exam, school, grades, false)
      .then(() => doc.end())
      .catch(err => reject(err));
  });
};

// Generates PDF buffer with report cards for ALL students in a class
const generateClassReportCardsPdf = async (classId, examId, schoolId) => {
  const students = await models.Student.find({ classId }).populate('classId').populate('sectionId').populate('userId');
  if (students.length === 0) throw new Error('No students found in the selected class');

  const exam = await models.Exam.findById(examId);
  if (!exam) throw new Error('Exam not found');

  const school = await models.School.findById(schoolId);
  if (!school) throw new Error('School not found');

  let grades = await models.Grades.find();
  if (grades.length === 0) {
    grades = [
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

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', err => reject(err));

    // Sequential page drawing for each student
    const drawSequentially = async () => {
      for (let i = 0; i < students.length; i++) {
        if (i > 0) {
          doc.addPage();
        }
        await drawReportCardPage(doc, students[i], exam, school, grades, true);
      }
    };

    drawSequentially()
      .then(() => doc.end())
      .catch(err => reject(err));
  });
};

module.exports = {
  generateReportCardPdf,
  generateClassReportCardsPdf
};
