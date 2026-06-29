require('dotenv').config();
const mongoose = require('mongoose');
const models = require('./src/models');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';
  await mongoose.connect(uri);

  const { runWithTenantContext } = require('./src/config/tenantContext');
  await runWithTenantContext({ bypassTenantFilter: true }, async () => {
    const cls = await models.Class.findOne({ name: 'Grade 1' });
    if (!cls) {
      console.log('No Grade 1 class found');
      return;
    }

    const students = await models.Student.find({ classId: cls._id }).populate('sectionId').populate('userId');
    console.log(`=== ALL STUDENTS IN ${cls.name} ===`);
    students.forEach(s => {
      console.log(`- ID: ${s._id}, Name: ${s.firstName} ${s.lastName}, Section: ${s.sectionId?.name} (${s.sectionId?._id}), Status: ${s.status}`);
    });
  });

  await mongoose.disconnect();
}

run().catch(console.error);
