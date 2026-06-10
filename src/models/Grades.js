const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const gradesSchema = new mongoose.Schema(
  {
    gradeName: {
      type: String,
      required: true // e.g. "A+", "A", "B", "C"
    },
    minPercentage: {
      type: Number,
      required: true
    },
    maxPercentage: {
      type: Number,
      required: true
    },
    gradePoint: {
      type: Number,
      required: true // e.g. 4.0, 3.5, etc.
    },
    remarks: String
  },
  {
    timestamps: true
  }
);

gradesSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Grades', gradesSchema);
