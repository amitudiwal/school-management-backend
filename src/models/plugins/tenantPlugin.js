const mongoose = require('mongoose');
const { getTenantContext } = require('../../config/tenantContext');

module.exports = function tenantPlugin(schema) {
  // Ensure the schoolId field is present in the schema (except for School itself, if applied globally)
  if (!schema.paths.schoolId) {
    schema.add({
      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
      }
    });
  }

  // Add auditing audit fields requested: CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, Status
  if (!schema.paths.status) {
    schema.add({
      status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'],
        default: 'ACTIVE',
        index: true
      }
    });
  }
  if (!schema.paths.createdBy) {
    schema.add({
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    });
  }
  if (!schema.paths.updatedBy) {
    schema.add({
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    });
  }

  // Pre-query hook to automatically filter by schoolId
  const filterQueries = function (next) {
    const context = getTenantContext();
    
    // Ignore filtering if bypass is set (e.g. Super Admin actions or background scripts)
    if (context.bypassTenantFilter) {
      // Still filter out DELETED items by default unless explicitly specified
      if (!this.getFilter().status) {
        this.where({ status: { $ne: 'DELETED' } });
      }
      return next();
    }

    if (context.schoolId) {
      this.where({ schoolId: context.schoolId });
    } else {
      // If no school context and not bypassed, we restrict to null or prevent access
      // Except for login/public actions which bypass
      // Here we enforce schoolId match to be safe
      this.where({ _id: null }); // Force no results if no school context is available
    }

    // Soft delete filter: do not return DELETED records by default
    if (!this.getFilter().status) {
      this.where({ status: { $ne: 'DELETED' } });
    }

    next();
  };

  schema.pre('find', filterQueries);
  schema.pre('findOne', filterQueries);
  schema.pre('findOneAndUpdate', filterQueries);
  schema.pre('updateOne', filterQueries);
  schema.pre('updateMany', filterQueries);
  schema.pre('countDocuments', filterQueries);
  schema.pre('estimatedDocumentCount', filterQueries);
  schema.pre('distinct', filterQueries);
  schema.pre('deleteOne', filterQueries);
  schema.pre('deleteMany', filterQueries);

  // Pre-validate hook to populate schoolId and auditing before validation runs
  schema.pre('validate', function (next) {
    const context = getTenantContext();

    if (!context.bypassTenantFilter) {
      if (context.schoolId && !this.schoolId) {
        this.schoolId = context.schoolId;
      }
      if (context.userId) {
        if (this.isNew && !this.createdBy) {
          this.createdBy = context.userId;
        }
        this.updatedBy = context.userId;
      }
    }

    next();
  });
};
