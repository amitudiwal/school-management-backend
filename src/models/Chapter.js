const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const chapterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
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
    }
  },
  {
    timestamps: true
  }
);

chapterSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Chapter', chapterSchema);
