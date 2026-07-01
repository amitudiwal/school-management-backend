const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { protect } = require('./middleware/authMiddleware');
const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const models = require('./models');
const { exportExcel, exportCSV, exportPDF } = require('./utils/exporter');
const { generateReportCardPdf, generateClassReportCardsPdf } = require('./utils/reportCardGenerator');

const app = express();

// Secure headers (disable Content Security Policy restrictions during GraphQL playground usage in development)
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Static uploads folder for student documents/homework submissions
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// File uploads configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// File Upload endpoint
app.post('/api/upload', protect, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, name: req.file.originalname });
});

// Bulk Import Template Generation
app.get('/api/import/students/template', protect, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Student Template');
    const headers = [
      'Admission No', 'Roll No', 'First Name', 'Last Name', 'Class', 'Section', 
      'Gender', 'Date of Birth', 'Email', 'Password', 'Mobile Number', 'Blood Group', 
      'Branch', 'Category', 'House', 'Height (cm)', 'Weight (kg)', 'Current Address', 
      'Permanent Address', 'Father Name', 'Father Surname', 'Father Occupation', 
      'Mother Name', 'Mother Occupation', 'Mother Phone', 'Guardian Name', 'Guardian Phone', 
      'Parent Relation', 'Parent Phone', 'Parent Email', 'Parent Password', 
      'Admission Fee', 'Tuition Fee', 'Transport Fee', 'Hostel Fee', 'Other Fee', 
      'Due Date', 'Installment Plan', 'Discount Type', 'Total Discount (%)', 
      'APAAR ID', 'RTE Number', 'PEN Number', 'Prev School Name', 'Prev Class', 'Passing Year'
    ];
    worksheet.addRow(headers);
    
    // add an example row
    worksheet.addRow([
      'ADM-2026-EX99', '1', 'John', 'Doe', 'Grade 1', 'Section A', 
      'MALE', '2015-05-15', 'johndoe@example.com', 'stdpass123', '9876543210', 'O+', 
      'Main Branch', 'General', 'Red House', '125', '30', '123 Street Name, City', 
      '123 Street Name, City', 'Robert', 'Doe', 'Engineer', 
      'Mary', 'Doctor', '9876543211', '', '', 
      'FATHER', '9876543212', 'robert.doe@example.com', 'parentpass123', 
      '5000', '15000', '2000', '0', '500', 
      '2026-10-15', '4', 'Scholarship', '10', 
      'APAAR123', 'RTE456', 'PEN789', 'Greenwood Kindergarten', 'UKG', '2025'
    ]);

    // format the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Arial', family: 4, size: 11, bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F46E5' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    
    worksheet.columns.forEach(column => {
      column.width = 18;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=student_import_template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate template: ' + err.message });
  }
});

// Bulk Import Excel Validation
app.post('/api/import/students/validate', protect, upload.single('file'), async (req, res) => {
  if (!req.userId) {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { runWithTenantContext } = require('./config/tenantContext');
  return runWithTenantContext({ 
    userId: req.userId, 
    schoolId: req.schoolId, 
    role: req.role, 
    bypassTenantFilter: req.bypassTenantFilter 
  }, async () => {
    try {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(req.file.path);
      const worksheet = workbook.worksheets[0];

      const headers = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value ? cell.value.toString().trim() : '';
      });

      const getValue = (row, headerName) => {
        const colIndex = headers.indexOf(headerName);
        if (colIndex === -1) return undefined;
        const cell = row.getCell(colIndex);
        if (!cell) return undefined;
        let val = cell.value;
        if (val && typeof val === 'object' && val.text) {
          val = val.text;
        }
        if (val && val instanceof Date) {
          return val.toISOString().split('T')[0];
        }
        return val !== null && val !== undefined ? val.toString().trim() : '';
      };

      const parsedRows = [];
      let validCount = 0;
      let invalidCount = 0;

      const rowsToProcess = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip headers
        
        let isEmpty = true;
        row.eachCell(cell => {
          if (cell.value !== null && cell.value !== undefined && cell.value.toString().trim() !== '') {
            isEmpty = false;
          }
        });
        if (!isEmpty) {
          rowsToProcess.push({ row, rowNumber });
        }
      });

      for (const item of rowsToProcess) {
        const { row, rowNumber } = item;
        const admissionNo = getValue(row, 'Admission No');
        const rollNo = getValue(row, 'Roll No');
        const firstName = getValue(row, 'First Name');
        const lastName = getValue(row, 'Last Name');
        const className = getValue(row, 'Class');
        const sectionName = getValue(row, 'Section');
        const gender = getValue(row, 'Gender');
        const dobVal = getValue(row, 'Date of Birth');
        const email = getValue(row, 'Email');
        const password = getValue(row, 'Password') || 'student_secret_pass';
        const mobileNumber = getValue(row, 'Mobile Number');
        const bloodGroup = getValue(row, 'Blood Group');
        const branch = getValue(row, 'Branch') || 'Main Branch';
        const category = getValue(row, 'Category') || 'General';
        const house = getValue(row, 'House') || 'Red House';
        const height = getValue(row, 'Height (cm)');
        const weight = getValue(row, 'Weight (kg)');
        const currentAddress = getValue(row, 'Current Address');
        const permanentAddress = getValue(row, 'Permanent Address');
        
        const fatherName = getValue(row, 'Father Name');
        const fatherLastName = getValue(row, 'Father Surname');
        const fatherOccupation = getValue(row, 'Father Occupation');
        const motherName = getValue(row, 'Mother Name');
        const motherOccupation = getValue(row, 'Mother Occupation');
        const motherPhone = getValue(row, 'Mother Phone');
        const guardianName = getValue(row, 'Guardian Name');
        const guardianPhone = getValue(row, 'Guardian Phone');
        const parentRelation = getValue(row, 'Parent Relation') || 'FATHER';
        const parentPhone = getValue(row, 'Parent Phone');
        const parentEmail = getValue(row, 'Parent Email');
        const parentPassword = getValue(row, 'Parent Password');
        
        const admissionFee = getValue(row, 'Admission Fee');
        const tuitionFee = getValue(row, 'Tuition Fee');
        const transportFee = getValue(row, 'Transport Fee');
        const hostelFee = getValue(row, 'Hostel Fee');
        const otherFee = getValue(row, 'Other Fee');
        const dueDate = getValue(row, 'Due Date');
        const installmentPlan = getValue(row, 'Installment Plan') || '1';
        const discountType = getValue(row, 'Discount Type') || 'None';
        const totalDiscount = getValue(row, 'Total Discount (%)');
        
        const apaarId = getValue(row, 'APAAR ID');
        const rteNumber = getValue(row, 'RTE Number');
        const penNumber = getValue(row, 'PEN Number');
        const prevSchoolName = getValue(row, 'Prev School Name');
        const prevClass = getValue(row, 'Prev Class');
        const passingYear = getValue(row, 'Passing Year');

        const rowErrors = [];
        if (!admissionNo) rowErrors.push('Admission No is required.');
        if (!firstName) rowErrors.push('First Name is required.');
        if (!lastName) rowErrors.push('Last Name is required.');
        if (!className) rowErrors.push('Class is required.');
        if (!sectionName) rowErrors.push('Section is required.');
        if (!gender) rowErrors.push('Gender is required.');
        else if (!['MALE', 'FEMALE', 'OTHER'].includes(gender.toUpperCase())) {
          rowErrors.push('Gender must be MALE, FEMALE, or OTHER.');
        }
        if (!dobVal) rowErrors.push('Date of Birth is required.');
        if (!email) rowErrors.push('Student Email is required.');
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          rowErrors.push('Invalid student email format.');
        }

        let classId = null;
        let sectionId = null;

        if (className) {
          const classDoc = await models.Class.findOne({ name: { $regex: new RegExp(`^${className.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } });
          if (!classDoc) {
            rowErrors.push(`Class "${className}" not found.`);
          } else {
            classId = classDoc._id.toString();
            if (sectionName) {
              const sectionDoc = await models.Section.findOne({ 
                name: { $regex: new RegExp(`^${sectionName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }, 
                classId: classDoc._id 
              });
              if (!sectionDoc) {
                rowErrors.push(`Section "${sectionName}" not found in class "${className}".`);
              } else {
                sectionId = sectionDoc._id.toString();
              }
            }
          }
        }

        if (admissionNo) {
          const existingStudent = await models.Student.findOne({ admissionNo });
          if (existingStudent) {
            rowErrors.push(`Admission No "${admissionNo}" is already registered.`);
          }
        }

        if (email) {
          const existingUser = await models.User.findOne({ email: email.toLowerCase() });
          if (existingUser) {
            rowErrors.push(`Student Email "${email}" is already registered.`);
          }
        }

        if (parentEmail) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
            rowErrors.push('Invalid parent email format.');
          }
        }

        if (rowErrors.length === 0) validCount++;
        else invalidCount++;

        parsedRows.push({
          rowNumber,
          status: rowErrors.length === 0 ? 'VALID' : 'INVALID',
          errors: rowErrors,
          data: {
            admissionNo,
            rollNo,
            firstName,
            lastName,
            className,
            classId,
            sectionName,
            sectionId,
            gender: gender ? gender.toUpperCase() : '',
            dateOfBirth: dobVal,
            email: email ? email.toLowerCase() : '',
            password,
            mobileNumber,
            bloodGroup,
            branch,
            category,
            house,
            height,
            weight,
            currentAddress,
            permanentAddress,
            fatherName,
            fatherLastName,
            fatherOccupation,
            motherName,
            motherOccupation,
            motherPhone,
            guardianName,
            guardianPhone,
            parentRelation: parentRelation ? parentRelation.toUpperCase() : 'FATHER',
            parentPhone,
            parentEmail: parentEmail ? parentEmail.toLowerCase() : '',
            parentPassword,
            admissionFee: parseFloat(admissionFee) || 0,
            tuitionFee: parseFloat(tuitionFee) || 0,
            transportFee: parseFloat(transportFee) || 0,
            hostelFee: parseFloat(hostelFee) || 0,
            otherFee: parseFloat(otherFee) || 0,
            dueDate: dueDate || null,
            installmentPlan,
            discountType,
            totalDiscount: parseFloat(totalDiscount) || 0,
            apaarId,
            rteNumber,
            penNumber,
            prevSchoolName,
            prevClass,
            passingYear
          }
        });
      }

      res.json({
        success: true,
        summary: {
          total: rowsToProcess.length,
          valid: validCount,
          invalid: invalidCount
        },
        rows: parsedRows
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Excel parsing failed: ' + err.message });
    } finally {
      if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
    }
  });
});

// Bulk Import Excel Confirm Commit
app.post('/api/import/students/confirm', protect, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { students } = req.body;
  if (!students || !Array.isArray(students)) {
    return res.status(400).json({ error: 'Invalid students payload' });
  }

  const { runWithTenantContext } = require('./config/tenantContext');
  return runWithTenantContext({ 
    userId: req.userId, 
    schoolId: req.schoolId, 
    role: req.role, 
    bypassTenantFilter: req.bypassTenantFilter 
  }, async () => {
    const results = {
      total: students.length,
      successCount: 0,
      errors: []
    };

    for (const st of students) {
      try {
        let parentId = null;

        // Create Parent profile if parentEmail and fatherName/parentPhone are provided
        if (st.parentEmail && st.fatherName && st.parentPhone) {
          const cleanParentEmail = st.parentEmail.trim().toLowerCase();

          let parentUser = await runWithTenantContext({ bypassTenantFilter: true }, async () => {
            return await models.User.findOne({ email: cleanParentEmail });
          });

          let parent;
          if (parentUser) {
            parent = await models.Parent.findOne({ userId: parentUser._id });
            if (!parent) {
              parent = await models.Parent.create({
                userId: parentUser._id,
                firstName: st.fatherName,
                lastName: st.fatherLastName || '',
                relation: st.parentRelation || 'FATHER',
                phone: st.parentPhone,
                email: cleanParentEmail,
                address: { street: st.currentAddress || '' }
              });
            }
          } else {
            parentUser = await models.User.create({
              name: `${st.fatherName} ${st.fatherLastName || ''}`.trim(),
              email: cleanParentEmail,
              password: st.parentPassword || st.parentPhone || 'parent_secret_pass',
              role: 'PARENT',
              schoolId: req.schoolId,
              phone: st.parentPhone
            });

            parent = await models.Parent.create({
              userId: parentUser._id,
              firstName: st.fatherName,
              lastName: st.fatherLastName || '',
              relation: st.parentRelation || 'FATHER',
              phone: st.parentPhone,
              email: cleanParentEmail,
              address: { street: st.currentAddress || '' }
            });
          }
          parentId = parent._id;
        }

        // Create student credentials
        const user = await models.User.create({
          name: `${st.firstName} ${st.lastName}`,
          email: st.email.toLowerCase(),
          password: st.password || 'student_secret_pass',
          role: 'STUDENT',
          schoolId: req.schoolId,
          avatar: ''
        });

        // Create Student profile
        const student = await models.Student.create({
          userId: user._id,
          admissionNo: st.admissionNo,
          rollNo: st.rollNo,
          firstName: st.firstName,
          lastName: st.lastName,
          gender: st.gender,
          dateOfBirth: st.dateOfBirth ? new Date(st.dateOfBirth) : new Date(),
          classId: st.classId,
          sectionId: st.sectionId,
          parentId: parentId,
          address: { street: st.currentAddress || '', city: 'City', state: 'State', zipCode: '10001', country: 'Country' },
          bloodGroup: st.bloodGroup,
          branch: st.branch,
          category: st.category,
          mobileNumber: st.mobileNumber,
          house: st.house,
          height: st.height ? parseFloat(st.height) : null,
          weight: st.weight ? parseFloat(st.weight) : null,
          apaarId: st.apaarId,
          rteNumber: st.rteNumber,
          penNumber: st.penNumber,
          permanentAddress: st.permanentAddress,
          fatherOccupation: st.fatherOccupation,
          motherName: st.motherName,
          motherOccupation: st.motherOccupation,
          motherPhone: st.motherPhone,
          guardianName: st.guardianName,
          guardianPhone: st.guardianPhone,
          admissionFee: parseFloat(st.admissionFee) || 0,
          tuitionFee: parseFloat(st.tuitionFee) || 0,
          transportFee: parseFloat(st.transportFee) || 0,
          hostelFee: parseFloat(st.hostelFee) || 0,
          otherFee: parseFloat(st.otherFee) || 0,
          dueDate: st.dueDate ? new Date(st.dueDate) : new Date(),
          totalDiscount: parseFloat(st.totalDiscount) || 0,
          discountType: st.discountType,
          installmentPlan: st.installmentPlan,
          prevSchoolName: st.prevSchoolName,
          prevClass: st.prevClass,
          passingYear: st.passingYear
        });

        if (parentId) {
          await models.Parent.findByIdAndUpdate(parentId, {
            $addToSet: { children: student._id }
          });
        }

        results.successCount++;
      } catch (err) {
        results.errors.push({
          admissionNo: st.admissionNo,
          name: `${st.firstName} ${st.lastName}`,
          error: err.message
        });
      }
    }

    res.json(results);
  });
});

// Reports Export Endpoint: /api/export/:type/:module
// type: excel, pdf, csv
// module: students, teachers, attendance, fees, payroll
app.get('/api/export/:type/:module', protect, async (req, res) => {
  const { type, module } = req.params;
  
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    let headers = [];
    let rows = [];
    let title = '';

    if (module === 'students') {
      title = 'Student Directory';
      headers = ['Admission No', 'Roll No', 'Full Name', 'Gender', 'DOB', 'Class'];
      
      const query = {};
      if (req.query.classId) {
        query.classId = req.query.classId;
      }
      if (req.query.sectionId) {
        query.sectionId = req.query.sectionId;
      }
      if (req.query.search) {
        const searchRegex = { $regex: req.query.search, $options: 'i' };
        query.$or = [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { admissionNo: searchRegex }
        ];
      }
      
      const data = await models.Student.find(query).populate('classId');
      rows = data.map(s => [
        s.admissionNo,
        s.rollNo || '-',
        `${s.firstName} ${s.lastName}`,
        s.gender,
        s.dateOfBirth ? s.dateOfBirth.toISOString().split('T')[0] : '-',
        s.classId?.name || '-'
      ]);
    } else if (module === 'teachers') {
      title = 'Teacher Directory';
      headers = ['Full Name', 'Email', 'Phone', 'Qualification', 'Designation', 'Join Date'];
      const data = await models.Teacher.find();
      rows = data.map(t => [
        `${t.firstName} ${t.lastName}`,
        t.email,
        t.phone,
        t.qualification,
        t.designation || '-',
        t.joinDate ? t.joinDate.toISOString().split('T')[0] : '-'
      ]);
    } else if (module === 'attendance') {
      title = 'Attendance Report';
      headers = ['Student Name', 'Class', 'Date', 'Status', 'Remarks'];
      const data = await models.Attendance.find().populate('studentId').populate('classId');
      rows = data.map(a => [
        a.studentId ? `${a.studentId.firstName} ${a.studentId.lastName}` : '-',
        a.classId?.name || '-',
        a.date ? a.date.toISOString().split('T')[0] : '-',
        a.status,
        a.remarks || '-'
      ]);
    } else if (module === 'fees') {
      title = 'Fee Structure';
      headers = ['Title', 'Category', 'Amount', 'Class', 'Due Date', 'Year'];
      const query = {};
      if (req.query.classId) {
        query.classId = req.query.classId;
      }
      const data = await models.Fees.find(query).populate('classId');
      rows = data.map(f => [
        f.title,
        f.category,
        f.amount,
        f.classId?.name || '-',
        f.dueDate ? f.dueDate.toISOString().split('T')[0] : '-',
        f.academicYear
      ]);
    } else if (module === 'fees-ledger') {
      title = 'Student Fees Ledger';
      headers = ['Student Name', 'Admission No', 'Class', 'Total Payable (INR)', 'Total Paid (INR)', 'Outstanding (INR)', 'Status'];
      const studentQuery = {};
      if (req.query.classId) {
        studentQuery.classId = req.query.classId;
      }
      const students = await models.Student.find(studentQuery).populate('classId').lean();
      const studentIds = students.map(s => s._id);
      
      const structures = await models.StudentFeeStructure.find({ studentId: { $in: studentIds } }).lean();
      const payments = await models.FeePayments.find({ studentId: { $in: studentIds }, status: 'PAID' }).lean();
      const classFees = await models.Fees.find({ classId: { $in: students.map(s => s.classId?._id || s.classId) }, status: { $ne: 'DELETED' } }).lean();
      
      rows = students.map(student => {
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
            if (p.componentId) return p.componentId.toString() === compIdStr;
            if (p.feeId) return p.feeId.toString() === compIdStr;
            return false;
          });
          const totalPaid = compPayments.reduce((sum, p) => sum + p.amountPaid, 0);
          return {
            totalDue: comp.amount,
            totalPaid
          };
        });

        const totalPayable = componentsBreakdown.reduce((sum, cb) => sum + cb.totalDue, 0);
        const totalPaid = componentsBreakdown.reduce((sum, cb) => sum + cb.totalPaid, 0);
        const outstanding = Math.max(0, totalPayable - totalPaid);
        
        let statusText = 'NO FEES';
        if (totalPayable > 0) {
          if (outstanding === 0) statusText = 'PAID';
          else if (totalPaid > 0) statusText = 'PARTIAL';
          else statusText = 'UNPAID';
        }

        return [
          `${student.firstName} ${student.lastName}`,
          student.admissionNo || '',
          student.classId?.name || 'Unassigned',
          totalPayable,
          totalPaid,
          outstanding,
          statusText
        ];
      });
    } else if (module === 'payroll') {
      title = 'Employee Payroll';
      headers = ['Payslip No', 'Employee ID', 'Basic Salary', 'Net Salary', 'Month', 'Year', 'Status'];
      const data = await models.Payroll.find().populate('userId');
      rows = data.map(p => [
        p.payslipNo,
        p.userId ? p.userId.name : '-',
        p.basicSalary,
        p.netSalary,
        p.month,
        p.year,
        p.status
      ]);
    } else {
      return res.status(400).json({ error: 'Invalid module specified' });
    }

    if (type === 'excel') {
      const buffer = await exportExcel(title, headers, rows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${module}-report.xlsx`);
      return res.send(buffer);
    } else if (type === 'csv') {
      const csvStr = exportCSV(headers, rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${module}-report.csv`);
      return res.send(csvStr);
    } else if (type === 'pdf') {
      const buffer = await exportPDF(title, headers, rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${module}-report.pdf`);
      return res.send(buffer);
    } else {
      return res.status(400).json({ error: 'Invalid file format' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error generating document report' });
  }
});

// Report Cards PDF Generation Endpoints
app.get('/api/report-cards/student/:studentId/exam/:examId', protect, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { studentId, examId } = req.params;
  try {
    const buffer = await generateReportCardPdf(studentId, examId, req.schoolId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=report-card-${studentId}.pdf`);
    return res.send(buffer);
  } catch (error) {
    console.error('Error generating student report card PDF:', error);
    res.status(500).json({ error: error.message || 'Server error generating report card' });
  }
});

app.get('/api/report-cards/class/:classId/exam/:examId', protect, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { classId, examId } = req.params;
  const { sectionId } = req.query;
  try {
    const buffer = await generateClassReportCardsPdf(classId, examId, req.schoolId, sectionId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=class-report-cards-${classId}.pdf`);
    return res.send(buffer);
  } catch (error) {
    console.error('Error generating class report cards PDF:', error);
    res.status(500).json({ error: error.message || 'Server error generating class report cards' });
  }
});

// Configure Apollo GraphQL Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (err) => {
    return {
      message: err.message,
      code: err.extensions?.code || 'INTERNAL_SERVER_ERROR'
    };
  }
});

// Export app and server initializer
const initServer = async () => {
  await server.start();
  app.use(
    '/graphql',
    protect,
    expressMiddleware(server, {
      context: async ({ req }) => ({
        userId: req.userId,
        schoolId: req.schoolId,
        role: req.role,
        bypassTenantFilter: req.bypassTenantFilter
      }),
    })
  );
  return app;
};

module.exports = { initServer, uploadsPath };
