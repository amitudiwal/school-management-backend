const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const payrollSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    basicSalary: {
      type: Number,
      required: true
    },
    allowances: [{
      name: String,
      amount: Number
    }],
    deductions: [{
      name: String,
      amount: Number
    }],
    netSalary: {
      type: Number,
      required: true
    },
    month: {
      type: Number, // 1 - 12
      required: true
    },
    year: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['PAID', 'UNPAID', 'PROCESSING'],
      default: 'UNPAID'
    },
    paymentDate: Date,
    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER', 'CASH', 'CHEQUE']
    },
    payslipNo: {
      type: String,
      required: true,
      unique: true
    }
  },
  {
    timestamps: true
  }
);

payrollSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Payroll', payrollSchema);
