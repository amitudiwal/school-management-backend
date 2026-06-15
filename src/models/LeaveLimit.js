const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const leaveLimitSchema = new mongoose.Schema(
  {
    casual: { type: Number, default: 15 },
    medical: { type: Number, default: 10 },
    maternity: { type: Number, default: 90 },
    paternity: { type: Number, default: 15 },
    sabbatical: { type: Number, default: 30 }
  },
  {
    timestamps: true
  }
);

leaveLimitSchema.plugin(tenantPlugin);

module.exports = mongoose.model('LeaveLimit', leaveLimitSchema);
