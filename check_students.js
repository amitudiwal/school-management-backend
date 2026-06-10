require('dotenv').config();
const mongoose = require('mongoose');
const models = require('./src/models');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';
  await mongoose.connect(uri);
  
  const { runWithTenantContext } = require('./src/config/tenantContext');
  await runWithTenantContext({ bypassTenantFilter: true }, async () => {
    const students = await models.Student.find().populate('userId');
    console.log('=== STUDENTS ===');
    students.forEach(s => {
      console.log(`ID: ${s._id}, Name: ${s.firstName} ${s.lastName}, Class: ${s.classId}, Section: ${s.sectionId}, User: ${s.userId?._id}`);
    });
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
