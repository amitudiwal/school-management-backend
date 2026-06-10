const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const staffSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    department: {
      type: String,
      enum: ['ADMINISTRATION', 'FINANCE', 'HR', 'LIBRARY', 'RECEPTION', 'TRANSPORT', 'MAINTENANCE', 'OTHER'],
      required: true
    },
    designation: { type: String, required: true }, // e.g. "Account Assistant", "Lead Librarian"
    joinDate: { type: Date, default: Date.now },
    qualification: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    bankDetails: {
      accountName: String,
      accountNo: String,
      bankName: String,
      ifscCode: String
    }
  },
  {
    timestamps: true
  }
);

staffSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Staff', staffSchema);
