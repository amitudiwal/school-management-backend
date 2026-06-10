const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const examSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true // e.g. "Final Term Examination", "Mid Term Exam"
    },
    academicYear: {
      type: String,
      required: true // e.g. "2026-2027"
    },
    startDate: Date,
    endDate: Date,
    description: String
  },
  {
    timestamps: true
  }
);

examSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Exam', examSchema);
