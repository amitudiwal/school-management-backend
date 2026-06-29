require('dotenv').config();
const mongoose = require('mongoose');
const models = require('./src/models');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';
  await mongoose.connect(uri);

  const { runWithTenantContext } = require('./src/config/tenantContext');
  await runWithTenantContext({ bypassTenantFilter: true }, async () => {
    const homework = await models.Homework.find().populate('classId').populate('sectionId').populate('subjectId');
    console.log('=== HOMEWORK ===');
    homework.forEach(hw => {
      console.log(`ID: ${hw._id}, Title: "${hw.title}", Class: ${hw.classId?.name} (${hw.classId?._id}), Section: ${hw.sectionId?.name} (${hw.sectionId?._id}), Subject: ${hw.subjectId?.name}`);
    });
  });

  await mongoose.disconnect();
}

run().catch(console.error);
