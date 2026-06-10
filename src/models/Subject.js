const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true // e.g. "Mathematics", "Science"
    },
    code: {
      type: String,
      required: true,
      trim: true // e.g. "MATH101", "SCI101"
    },
    type: {
      type: String,
      enum: ['THEORY', 'PRACTICAL', 'BOTH'],
      default: 'THEORY'
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    description: String
  },
  {
    timestamps: true
  }
);

subjectSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Subject', subjectSchema);
