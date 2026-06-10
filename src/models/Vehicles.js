const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const vehiclesSchema = new mongoose.Schema(
  {
    vehicleNo: {
      type: String,
      required: true,
      unique: true,
      trim: true // e.g. "NY-1234"
    },
    model: String,
    capacity: {
      type: Number,
      required: true
    },
    driverName: {
      type: String,
      required: true
    },
    driverPhone: {
      type: String,
      required: true
    },
    driverLicense: String,
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TransportRoutes'
    }
  },
  {
    timestamps: true
  }
);

vehiclesSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Vehicles', vehiclesSchema);
