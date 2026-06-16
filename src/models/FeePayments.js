const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const feePaymentsSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    amountPaid: {
      type: Number,
      required: true
    },
    paymentDate: {
      type: Date,
      default: Date.now
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'ONLINE', 'BANK_TRANSFER'],
      required: true
    },
    status: {
      type: String,
      enum: ['PAID', 'PARTIAL', 'FAILED'],
      required: true
    },
    referenceNo: String,
    receiptNo: {
      type: String,
      required: true,
      unique: true
    },
    remarks: String
  },
  {
    timestamps: true
  }
);

feePaymentsSchema.plugin(tenantPlugin);

module.exports = mongoose.model('FeePayments', feePaymentsSchema);
