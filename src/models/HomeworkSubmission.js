const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const homeworkSubmissionSchema = new mongoose.Schema(
  {
    homeworkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Homework',
      required: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    submissionText: String,
    attachments: [{
      name: String,
      url: String
    }],
    submissionDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['SUBMITTED', 'GRADED', 'LATE', 'REJECTED'],
      default: 'SUBMITTED'
    },
    gradePoints: Number,
    feedback: String,
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher'
    }
  },
  {
    timestamps: true
  }
);

homeworkSubmissionSchema.index({ homeworkId: 1, studentId: 1 }, { unique: true });
homeworkSubmissionSchema.plugin(tenantPlugin);

module.exports = mongoose.model('HomeworkSubmission', homeworkSubmissionSchema);
