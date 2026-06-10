const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const parentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    relation: { type: String, enum: ['FATHER', 'MOTHER', 'GUARDIAN'], required: true },
    occupation: String,
    education: String,
    income: Number,
    phone: { type: String, required: true },
    email: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    children: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    }]
  },
  {
    timestamps: true
  }
);

parentSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Parent', parentSchema);
