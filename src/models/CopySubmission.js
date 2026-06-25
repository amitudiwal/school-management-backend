const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const copySubmissionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true
    },
    isCompleted: {
      type: Boolean,
      default: false
    },
    remarks: String
  },
  {
    timestamps: true
  }
);

// Unique compound index so that we only have one submission record per student and subject
copySubmissionSchema.index({ studentId: 1, subjectId: 1 }, { unique: true });
copySubmissionSchema.plugin(tenantPlugin);

module.exports = mongoose.model('CopySubmission', copySubmissionSchema);
