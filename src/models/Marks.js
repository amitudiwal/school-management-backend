const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const marksSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    marksObtained: {
      type: Number,
      required: true
    },
    grade: String, // e.g. "A+", "B"
    remarks: String
  },
  {
    timestamps: true
  }
);

// A student can have only one mark record per exam and subject
marksSchema.index({ studentId: 1, examId: 1, subjectId: 1 }, { unique: true });
marksSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Marks', marksSchema);
