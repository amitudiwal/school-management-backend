require('dotenv').config();
const mongoose = require('mongoose');
const models = require('./src/models');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';
  await mongoose.connect(uri);

  const { runWithTenantContext } = require('./src/config/tenantContext');
  await runWithTenantContext({ bypassTenantFilter: true }, async () => {
    const classes = await models.Class.find();
    console.log('=== CLASSES ===');
    classes.forEach(c => {
      console.log(`ID: ${c._id}, Name: ${c.name}`);
    });

    const grade1Class = classes.find(c => c.name === 'Grade 1');
    if (!grade1Class) {
      console.log('No exact Grade 1 class found');
      return;
    }

    // Query students with classId as string
    const classIdStr = grade1Class._id.toString();
    const studentsStr = await models.Student.find({ classId: classIdStr });
    console.log(`Querying by string ${classIdStr}: found ${studentsStr.length} students`);

    // Query students with classId as ObjectId
    const studentsObj = await models.Student.find({ classId: grade1Class._id });
    console.log(`Querying by ObjectId: found ${studentsObj.length} students`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
