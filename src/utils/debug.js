require('dotenv').config();
const mongoose = require('mongoose');
const models = require('../models');
const bcrypt = require('bcryptjs');
const { runWithTenantContext } = require('../config/tenantContext');

const run = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';
    await mongoose.connect(uri);
    console.log('Connected to DB...');

    // Wrap queries in a bypassed tenant context so the plugin does not block the query
    await runWithTenantContext({ bypassTenantFilter: true }, async () => {
      const users = await models.User.find().select('+password');
      console.log(`Found ${users.length} users:`);
      
      for (const u of users) {
        console.log(`\nUser: ${u.email}`);
        console.log(`Role: ${u.role}`);
        console.log(`Stored Password Hash: ${u.password}`);
        
        let testPass = '';
        if (u.role === 'SUPER_ADMIN') testPass = 'super_secure_pass';
        else if (u.role === 'SCHOOL_ADMIN') testPass = 'admin_password';
        else if (u.role === 'TEACHER') testPass = 'teacher_password';

        if (testPass) {
          const isMatch = await u.comparePassword(testPass);
          console.log(`Password comparison check for '${testPass}': ${isMatch}`);
        }
      }
    });

    process.exit(0);
  } catch (err) {
    console.error('Error running test:', err);
    process.exit(1);
  }
};

run();
