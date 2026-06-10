const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const homeworkSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
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
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true
    },
    dueDate: {
      type: Date,
      required: true
    },
    attachments: [{
      name: String,
      url: String
    }]
  },
  {
    timestamps: true
  }
);

homeworkSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Homework', homeworkSchema);
