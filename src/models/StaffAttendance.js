const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const staffAttendanceSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
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
    checkIn: String,
    checkOut: String,
    remarks: String,
    faceImage: String,
    location: String
  },
  {
    timestamps: true
  }
);

staffAttendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.plugin(tenantPlugin);

module.exports = mongoose.model('StaffAttendance', staffAttendanceSchema);
