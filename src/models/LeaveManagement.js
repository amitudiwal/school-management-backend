const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const leaveManagementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    leaveType: {
      type: String,
      enum: ['CASUAL', 'MEDICAL', 'MATERNITY', 'PATERNITY', 'SABBATICAL', 'WITHOUT_PAY'],
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvalRemarks: String,
    approvedAt: Date
  },
  {
    timestamps: true
  }
);

leaveManagementSchema.plugin(tenantPlugin);

module.exports = mongoose.model('LeaveManagement', leaveManagementSchema);
