const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const feeComponentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['TUITION', 'TRANSPORT', 'EXAMINATION', 'LIBRARY', 'ADMISSION', 'SPORTS', 'UNIFORM', 'BOOKS', 'DISCOUNT', 'FINE', 'OTHER'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  description: String
});

const studentFeeStructureSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    academicYear: {
      type: String,
      required: true
    },
    components: [feeComponentSchema],
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true
  }
);

studentFeeStructureSchema.plugin(tenantPlugin);

// Compound index to ensure unique fee structure per student per academic year per tenant
studentFeeStructureSchema.index({ studentId: 1, academicYear: 1, schoolId: 1 }, { unique: true });

module.exports = mongoose.model('StudentFeeStructure', studentFeeStructureSchema);
