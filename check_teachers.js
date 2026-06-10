require('dotenv').config();
const mongoose = require('mongoose');
const models = require('./src/models');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';
  console.log('Connecting to URI:', uri);
  await mongoose.connect(uri);
  console.log('Connected to DB');
  
  // Bypass tenant context/filters to read raw data
  const { runWithTenantContext } = require('./src/config/tenantContext');
  await runWithTenantContext({ bypassTenantFilter: true }, async () => {
    const teachers = await models.Teacher.find();
    console.log('=== TEACHERS ===');
    teachers.forEach(t => {
      console.log(`ID: ${t._id}, Name: ${t.firstName} ${t.lastName}, Status: ${t.status}, Email: ${t.email}`);
    });
    
    const users = await models.User.find();
    console.log('=== USERS ===');
    users.forEach(u => {
      console.log(`ID: ${u._id}, Name: ${u.name}, Role: ${u.role}, Status: ${u.status}, Email: ${u.email}`);
    });
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
