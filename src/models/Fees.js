const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const feesSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true // e.g. "Tuition Fee - Q1", "Exam Fee"
    },
    category: {
      type: String,
      enum: ['TUITION', 'EXAMINATION', 'TRANSPORT', 'LIBRARY', 'ADMISSION', 'SPORTS', 'OTHER'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    dueDate: {
      type: Date,
      required: true
    },
    academicYear: {
      type: String,
      required: true
    },
    description: String
  },
  {
    timestamps: true
  }
);

feesSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Fees', feesSchema);
