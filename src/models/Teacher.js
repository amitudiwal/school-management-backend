const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const teacherSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    dateOfBirth: { type: Date, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    joinDate: { type: Date, default: Date.now },
    qualification: { type: String, required: true }, // e.g. "M.Sc. in Physics"
    experienceYears: Number,
    designation: String, // e.g. "Senior Teacher", "Head of Dept"
    assignedSubjects: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject'
    }],
    assignedClasses: [{
      classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
      sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' }
    }],
    isClassTeacher: { type: Boolean, default: false },
    classTeacherOf: {
      classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
      sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' }
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    bankDetails: {
      accountName: String,
      accountNo: String,
      bankName: String,
      ifscCode: String
    }
  },
  {
    timestamps: true
  }
);

teacherSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Teacher', teacherSchema);
