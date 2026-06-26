const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['EVENT', 'HOLIDAY'],
      default: 'EVENT'
    },
    date: {
      type: Date,
      required: true
    },
    description: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

eventSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Event', eventSchema);
