const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Parent'
    },
    admissionNo: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    rollNo: String,
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    dateOfBirth: { type: Date, required: true },
    bloodGroup: String,
    admissionDate: { type: Date, default: Date.now },
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
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    medicalInfo: {
      allergies: [String],
      medications: [String],
      conditions: String,
      emergencyContactName: String,
      emergencyContactPhone: String
    },
    documents: [{
      name: String,
      url: String,
      uploadedAt: { type: Date, default: Date.now }
    }],
    promotionHistory: [{
      fromClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
      toClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
      academicYear: String,
      promotedAt: { type: Date, default: Date.now }
    }],
    transferInfo: {
      transferDate: Date,
      reason: String,
      tcNumber: String,
      destinationSchool: String
    }
  },
  {
    timestamps: true
  }
);

studentSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Student', studentSchema);
