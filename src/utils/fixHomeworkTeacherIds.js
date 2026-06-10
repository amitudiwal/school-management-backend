require('dotenv').config();
const mongoose = require('mongoose');
const models = require('../models');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';

async function fix() {
  try {
    await mongoose.connect(MONGODB_URI, { autoIndex: false });
    console.log('Connected to MongoDB for migration.');

    const homeworks = await models.Homework.find().lean();
    console.log(`Found ${homeworks.length} homework records.`);

    let fixedCount = 0;
    let flaggedCount = 0;

    for (const hw of homeworks) {
      let invalid = false;

      if (!hw.teacherId) {
        invalid = true;
      } else {
        const teacher = await models.Teacher.findById(hw.teacherId).lean();
        if (!teacher) invalid = true;
        else if (hw.schoolId && teacher.schoolId && String(hw.schoolId) !== String(teacher.schoolId)) {
          invalid = true;
        }
      }

      if (!invalid) continue;

      // Try to find a replacement teacher for the same school
      let replacement = null;
      if (hw.schoolId) {
        replacement = await models.Teacher.findOne({ schoolId: hw.schoolId }).lean();
      }

      if (replacement) {
        await models.Homework.updateOne({ _id: hw._id }, { $set: { teacherId: replacement._id } });
        console.log(`Assigned teacher ${replacement._id} to homework ${hw._id}`);
        fixedCount++;
        await models.AuditLogs.create({
          userId: null,
          action: 'MIGRATION_ASSIGN_TEACHER',
          details: `Auto-assigned teacher ${replacement._id} to homework ${hw._id} during migration.`,
          schoolId: hw.schoolId
        });
      } else {
        // No replacement found — mark inactive to avoid GraphQL crash
        await models.Homework.updateOne({ _id: hw._id }, { $set: { status: 'INACTIVE' } });
        console.log(`Flagged homework ${hw._id} as INACTIVE (no teacher found).`);
        flaggedCount++;
        await models.AuditLogs.create({
          userId: null,
          action: 'MIGRATION_FLAG_HOMEWORK',
          details: `Flagged homework ${hw._id} as INACTIVE due to missing teacher during migration.`,
          schoolId: hw.schoolId
        });
      }
    }

    console.log(`Migration complete. Fixed: ${fixedCount}, Flagged: ${flaggedCount}`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

fix();
