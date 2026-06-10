const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const notificationsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['ANNOUNCEMENT', 'ALERT', 'CIRCULAR', 'NOTICE'],
      default: 'ANNOUNCEMENT'
    },
    recipientRoles: [{
      type: String
    }],
    recipientUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  {
    timestamps: true
  }
);

notificationsSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Notifications', notificationsSchema);
