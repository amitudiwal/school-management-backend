const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const tenantPlugin = require('./plugins/tenantPlugin');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: [
        'SUPER_ADMIN',
        'SCHOOL_ADMIN',
        'PRINCIPAL',
        'VICE_PRINCIPAL',
        'SUPER_TEACHER',
        'TEACHER',
        'CLASS_TEACHER',
        'PARENT',
        'STUDENT',
        'ACCOUNTANT',
        'HR_STAFF',
        'LIBRARIAN',
        'RECEPTIONIST',
        'TRANSPORT_MANAGER'
      ],
      required: true
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      // For SUPER_ADMIN, schoolId is null
      required: function() {
        return this.role !== 'SUPER_ADMIN';
      }
    },
    phone: String,
    mobile: {
      type: String,
      trim: true,
      index: true
    },
    avatar: String,
    refreshToken: String,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    lastLogin: Date
  },
  {
    timestamps: true
  }
);

// Keep legacy fields and new flat fields in sync
userSchema.pre('validate', function (next) {
  if (this.firstName || this.lastName) {
    this.name = `${this.firstName || ''} ${this.lastName || ''}`.trim() || 'User';
  } else if (this.name) {
    const parts = this.name.split(' ');
    this.firstName = parts[0] || '';
    this.lastName = parts.slice(1).join(' ') || '';
  }
  
  if (this.mobile && !this.phone) {
    this.phone = this.mobile;
  } else if (this.phone && !this.mobile) {
    this.mobile = this.phone;
  }
  
  next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.plugin(tenantPlugin);

module.exports = mongoose.model('User', userSchema);
