const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
      required: true
    },
    remarks: String
  },
  {
    timestamps: true
  }
);

// Unique composite index for student-date attendance checking
attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
attendanceSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Attendance', attendanceSchema);
