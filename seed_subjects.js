const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const grade10 = await mongoose.connection.db.collection('classes').findOne({ name: /Grade 10/i });
  const grade11 = await mongoose.connection.db.collection('classes').findOne({ name: /Grade 11/i });
  
  // Check existing subjects for Grade 10
  const grade10Subjects = await mongoose.connection.db.collection('subjects').find({ classId: grade10._id }).toArray();
  console.log('Grade 10 subjects:', JSON.stringify(grade10Subjects.map(s => ({ name: s.name, code: s.code, type: s.type })), null, 2));

  // Check existing subjects for Grade 11
  const grade11Subjects = await mongoose.connection.db.collection('subjects').find({ classId: grade11._id }).toArray();
  console.log('Grade 11 subjects:', JSON.stringify(grade11Subjects, null, 2));

  if (grade11Subjects.length === 0) {
    const subjects = [
      { name: 'Mathematics', code: 'MATH-11', type: 'CORE', classId: grade11._id, status: 'ACTIVE', schoolId: grade11.schoolId, createdAt: new Date(), updatedAt: new Date(), __v: 0 },
      { name: 'English', code: 'ENG-11', type: 'CORE', classId: grade11._id, status: 'ACTIVE', schoolId: grade11.schoolId, createdAt: new Date(), updatedAt: new Date(), __v: 0 },
      { name: 'Physics', code: 'PHY-11', type: 'CORE', classId: grade11._id, status: 'ACTIVE', schoolId: grade11.schoolId, createdAt: new Date(), updatedAt: new Date(), __v: 0 },
      { name: 'Chemistry', code: 'CHEM-11', type: 'CORE', classId: grade11._id, status: 'ACTIVE', schoolId: grade11.schoolId, createdAt: new Date(), updatedAt: new Date(), __v: 0 },
      { name: 'Biology', code: 'BIO-11', type: 'CORE', classId: grade11._id, status: 'ACTIVE', schoolId: grade11.schoolId, createdAt: new Date(), updatedAt: new Date(), __v: 0 },
      { name: 'History', code: 'HIST-11', type: 'ELECTIVE', classId: grade11._id, status: 'ACTIVE', schoolId: grade11.schoolId, createdAt: new Date(), updatedAt: new Date(), __v: 0 },
      { name: 'Computer Science', code: 'CS-11', type: 'ELECTIVE', classId: grade11._id, status: 'ACTIVE', schoolId: grade11.schoolId, createdAt: new Date(), updatedAt: new Date(), __v: 0 },
    ];

    const result = await mongoose.connection.db.collection('subjects').insertMany(subjects);
    console.log('Created subjects:', Object.keys(result.insertedIds).length);
    
    const created = await mongoose.connection.db.collection('subjects').find({ classId: grade11._id }).toArray();
    console.log('Grade 11 subjects now:', JSON.stringify(created.map(s => ({ name: s.name, code: s.code, type: s.type })), null, 2));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
