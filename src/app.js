const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { protect } = require('./middleware/authMiddleware');
const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const models = require('./models');
const { exportExcel, exportCSV, exportPDF } = require('./utils/exporter');

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
      const data = await models.Student.find().populate('classId');
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
      const data = await models.Fees.find().populate('classId');
      rows = data.map(f => [
        f.title,
        f.category,
        f.amount,
        f.classId?.name || '-',
        f.dueDate ? f.dueDate.toISOString().split('T')[0] : '-',
        f.academicYear
      ]);
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
