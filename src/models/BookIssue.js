const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const bookIssueSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LibraryBooks',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    issueDate: {
      type: Date,
      default: Date.now
    },
    dueDate: {
      type: Date,
      required: true
    },
    returnDate: Date,
    status: {
      type: String,
      enum: ['ISSUED', 'RETURNED', 'OVERDUE'],
      default: 'ISSUED'
    },
    fineAmount: {
      type: Number,
      default: 0
    },
    finePaidStatus: {
      type: String,
      enum: ['PAID', 'UNPAID', 'NO_FINE'],
      default: 'NO_FINE'
    }
  },
  {
    timestamps: true
  }
);

bookIssueSchema.plugin(tenantPlugin);

module.exports = mongoose.model('BookIssue', bookIssueSchema);
