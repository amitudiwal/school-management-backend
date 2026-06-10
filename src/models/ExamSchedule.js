const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const examScheduleSchema = new mongoose.Schema(
  {
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
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    startTime: {
      type: String, // e.g. "09:00 AM"
      required: true
    },
    endTime: {
      type: String, // e.g. "12:00 PM"
      required: true
    },
    roomNo: String,
    maxMarks: {
      type: Number,
      required: true
    },
    passMarks: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true
  }
);

examScheduleSchema.plugin(tenantPlugin);

module.exports = mongoose.model('ExamSchedule', examScheduleSchema);
