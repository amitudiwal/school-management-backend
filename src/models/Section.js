const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const sectionSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true // e.g. "Section A", "Section B"
    },
    roomNumber: String,
    capacity: Number,
    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher'
    }
  },
  {
    timestamps: true
  }
);

sectionSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Section', sectionSchema);
