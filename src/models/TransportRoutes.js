const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const transportRoutesSchema = new mongoose.Schema(
  {
    routeName: {
      type: String,
      required: true,
      trim: true // e.g. "Route A - North City"
    },
    startLocation: {
      type: String,
      required: true
    },
    endLocation: {
      type: String,
      required: true
    },
    stops: [{
      stopName: String,
      arrivalTime: String
    }],
    routeFee: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true
  }
);

transportRoutesSchema.plugin(tenantPlugin);

module.exports = mongoose.model('TransportRoutes', transportRoutesSchema);
