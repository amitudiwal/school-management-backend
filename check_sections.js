require('dotenv').config();
const mongoose = require('mongoose');
const models = require('./src/models');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';
  await mongoose.connect(uri);

  const { runWithTenantContext } = require('./src/config/tenantContext');
  await runWithTenantContext({ bypassTenantFilter: true }, async () => {
    const sections = await models.Section.find().populate('classId');
    console.log('=== SECTIONS ===');
    sections.forEach(s => {
      console.log(`ID: ${s._id}, Name: ${s.name}, Class: ${s.classId?.name} (${s.classId?._id})`);
    });
  });

  await mongoose.disconnect();
}

run().catch(console.error);
