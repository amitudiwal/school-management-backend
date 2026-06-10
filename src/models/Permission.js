const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // e.g. "student.create"
      trim: true
    },
    module: {
      type: String,
      required: true, // e.g. "Student Management"
      trim: true
    },
    description: String
  },
  {
    timestamps: true
  }
);

permissionSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Permission', permissionSchema);
