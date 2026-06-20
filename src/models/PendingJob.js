const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const pendingJobSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true
    },
    jobType: {
      type: String,
      enum: ['Study', 'Others'],
      required: true
    },
    subjectName: {
      type: String,
      trim: true
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter'
    },
    topicName: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['Running', 'Complete'],
      default: 'Running'
    },
    remarks: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

pendingJobSchema.plugin(tenantPlugin);

module.exports = mongoose.model('PendingJob', pendingJobSchema);
