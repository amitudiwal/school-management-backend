const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true // e.g. "Grade 10", "Grade 11"
    },
    code: {
      type: String,
      required: true,
      trim: true // e.g. "G10", "G11"
    },
    description: String
  },
  {
    timestamps: true
  }
);

classSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Class', classSchema);
