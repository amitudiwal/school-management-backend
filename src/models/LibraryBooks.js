const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const libraryBooksSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    author: {
      type: String,
      required: true,
      trim: true
    },
    isbn: {
      type: String,
      required: true,
      trim: true
    },
    publisher: String,
    category: {
      type: String,
      required: true // e.g. "Science", "Fiction", "History"
    },
    totalCopies: {
      type: Number,
      required: true,
      default: 1
    },
    availableCopies: {
      type: Number,
      required: true,
      default: 1
    },
    rackNo: String
  },
  {
    timestamps: true
  }
);

libraryBooksSchema.plugin(tenantPlugin);

module.exports = mongoose.model('LibraryBooks', libraryBooksSchema);
