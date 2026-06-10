const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const timetableSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: String,
      enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      required: true
    },
    startTime: {
      type: String, // format HH:MM
      required: true
    },
    endTime: {
      type: String, // format HH:MM
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
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true
    },
    roomNumber: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

timetableSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Timetable', timetableSchema);
