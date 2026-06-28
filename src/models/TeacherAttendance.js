const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const teacherAttendanceSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'],
      required: true
    },
    checkIn: String,  // e.g. "08:30 AM"
    checkOut: String, // e.g. "04:30 PM"
    remarks: String,
    faceImage: String,
    location: String
  },
  {
    timestamps: true
  }
);

teacherAttendanceSchema.index({ teacherId: 1, date: 1 }, { unique: true });
teacherAttendanceSchema.plugin(tenantPlugin);

module.exports = mongoose.model('TeacherAttendance', teacherAttendanceSchema);
