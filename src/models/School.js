const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    schoolName: {
      type: String,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    schoolCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true
    },
    logo: String,
    schoolLogo: String,
    themeColor: {
      type: String,
      default: '#6366F1'
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    contact: {
      email: { type: String, required: true },
      phone: { type: String, required: true },
      website: String
    },
    subscription: {
      plan: {
        type: String,
        enum: ['TRIAL', 'BASIC', 'PREMIUM', 'ENTERPRISE'],
        default: 'TRIAL'
      },
      status: {
        type: String,
        enum: ['PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED'],
        default: 'PENDING'
      },
      startDate: { type: Date, default: Date.now },
      endDate: { type: Date }
    },
    subscriptionPlan: {
      type: String,
      enum: ['TRIAL', 'BASIC', 'PREMIUM', 'ENTERPRISE'],
      default: 'TRIAL'
    },
    subscriptionStatus: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED'],
      default: 'PENDING'
    },
    settings: {
      academicYearStart: { type: String, default: '04-01' }, // MM-DD format
      academicYearEnd: { type: String, default: '03-31' },   // MM-DD format
      currency: { type: String, default: 'USD' },
      timezone: { type: String, default: 'UTC' },
      featurePermissions: {
        type: mongoose.Schema.Types.Mixed,
        default: {
          SUPER_TEACHER: ['teachers', 'classes', 'timetable', 'exams', 'staff-attendance', 'leaves', 'copy-submission', 'events'],
          ACCOUNTANT: ['students', 'fees', 'payroll'],
          TEACHER: ['pending-jobs', 'timetable', 'bus-tracker', 'attendance', 'leaves', 'homework', 'grades', 'analytics', 'payroll', 'copy-submission'],
          PARENT: ['parent-portal', 'bus-tracker']
        }
      }
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'INACTIVE', 'SUSPENDED', 'DELETED'],
      default: 'PENDING'
    }
  },
  {
    timestamps: true
  }
);

// Keep legacy fields and new flat fields in sync
schoolSchema.pre('validate', function (next) {
  if (this.name && !this.schoolName) this.schoolName = this.name;
  if (this.schoolName && !this.name) this.name = this.schoolName;
  if (this.logo && !this.schoolLogo) this.schoolLogo = this.logo;
  if (this.schoolLogo && !this.logo) this.logo = this.schoolLogo;
  
  if (this.subscription?.plan && !this.subscriptionPlan) {
    this.subscriptionPlan = this.subscription.plan;
  }
  if (this.subscriptionPlan && (!this.subscription || !this.subscription.plan)) {
    if (!this.subscription) this.subscription = {};
    this.subscription.plan = this.subscriptionPlan;
  }
  
  if (this.subscription?.status && !this.subscriptionStatus) {
    this.subscriptionStatus = this.subscription.status;
  }
  if (this.subscriptionStatus && (!this.subscription || !this.subscription.status)) {
    if (!this.subscription) this.subscription = {};
    this.subscription.status = this.subscriptionStatus;
  }
  
  next();
});

module.exports = mongoose.model('School', schoolSchema);
