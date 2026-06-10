const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    permissions: [{
      type: String // A simple list of permission nodes (e.g. 'STUDENT_CREATE', 'FEES_READ')
    }]
  },
  {
    timestamps: true
  }
);

roleSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Role', roleSchema);
