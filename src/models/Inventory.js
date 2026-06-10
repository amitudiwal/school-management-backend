const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const inventorySchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      enum: ['STATIONERY', 'FURNITURE', 'LAB_EQUIPMENT', 'SPORTS', 'CLASSROOM', 'COMPUTERS', 'OTHER'],
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      default: 0
    },
    availableQuantity: {
      type: Number,
      required: true,
      default: 0
    },
    unitPrice: Number,
    vendorName: String,
    vendorContact: String,
    purchaseDate: Date,
    remarks: String
  },
  {
    timestamps: true
  }
);

inventorySchema.plugin(tenantPlugin);

module.exports = mongoose.model('Inventory', inventorySchema);
