const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const auditLogsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      required: true // e.g. "USER_LOGIN", "STUDENT_ADMISSION", "FEE_COLLECTION"
    },
    details: {
      type: String,
      required: true
    },
    ipAddress: String,
    userAgent: String,
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: false // Null for SUPER_ADMIN actions
    }
  },
  {
    timestamps: true
  }
);

auditLogsSchema.plugin(tenantPlugin);

module.exports = mongoose.model('AuditLogs', auditLogsSchema);
