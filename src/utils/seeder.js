require('dotenv').config();
const mongoose = require('mongoose');
const models = require('../models');
const { runWithTenantContext } = require('../config/tenantContext');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';

const seed = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB for seeding...');

    // Clear existing collections
    const collections = Object.keys(mongoose.connection.collections);
    for (const collectionName of collections) {
      await mongoose.connection.collections[collectionName].deleteMany({});
    }
    console.log('Cleared existing database collections.');

    // 1. Create Super Admin (Globally)
    const superAdmin = await models.User.create({
      name: 'Global Super Admin',
      email: 'superadmin@erp.com',
      password: 'super_secure_pass',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    });
    console.log('Super Admin Seeded: superadmin@erp.com');

    // 2. Create School Tenant
    const school = await models.School.create({
      name: 'Greenwood International School',
      slug: 'greenwood',
      schoolCode: 'GREENVALLEY',
      themeColor: '#10B981',
      logo: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&w=120&h=120&q=80',
      address: {
        street: '100 School Lane',
        city: 'Metropolis',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      },
      contact: {
        email: 'info@greenwood.edu',
        phone: '+1-555-0199',
        website: 'www.greenwood.edu'
      },
      subscription: {
        plan: 'PREMIUM',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    console.log('School Tenant Seeded: Greenwood International (GREENVALLEY)');

    // 2b. Create Sunrise Public School Tenant
    const schoolSunrise = await models.School.create({
      name: 'Sunrise Public School',
      slug: 'sunrise',
      schoolCode: 'SUNRISE001',
      themeColor: '#F97316',
      logo: 'https://images.unsplash.com/photo-1577896851231-70ee18881754?auto=format&fit=crop&w=120&h=120&q=80',
      address: {
        street: '200 Sunrise Blvd',
        city: 'Sunnyvale',
        state: 'CA',
        zipCode: '94085',
        country: 'USA'
      },
      contact: {
        email: 'info@sunrisepublic.edu',
        phone: '+1-555-0299',
        website: 'www.sunrisepublic.edu'
      },
      subscription: {
        plan: 'BASIC',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    console.log('School Tenant Seeded: Sunrise Public (SUNRISE001)');

    // 2c. Create Vidya Public School Tenant
    const schoolVidya = await models.School.create({
      name: 'Vidya Public School',
      slug: 'vidyapublic',
      schoolCode: 'VIDYAPUBLIC',
      themeColor: '#3B82F6',
      logo: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=120&h=120&q=80',
      address: {
        street: '300 Vidya Path',
        city: 'New Delhi',
        state: 'DL',
        zipCode: '110001',
        country: 'India'
      },
      contact: {
        email: 'info@vidyapublic.edu',
        phone: '+91-11-5550299',
        website: 'www.vidyapublic.edu'
      },
      subscription: {
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    console.log('School Tenant Seeded: Vidya Public (VIDYAPUBLIC)');

    // 2d. Create Scholar Academy Tenant
    const schoolScholar = await models.School.create({
      name: 'Scholar Academy',
      slug: 'scholaracademy',
      schoolCode: 'SCHOLARACADEMY',
      themeColor: '#8B5CF6',
      logo: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=120&h=120&q=80',
      address: {
        street: '400 Scholar Way',
        city: 'Boston',
        state: 'MA',
        zipCode: '02108',
        country: 'USA'
      },
      contact: {
        email: 'info@scholaracademy.edu',
        phone: '+1-555-0399',
        website: 'www.scholaracademy.edu'
      },
      subscription: {
        plan: 'TRIAL',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    console.log('School Tenant Seeded: Scholar Academy (SCHOLARACADEMY)');

    // Seed Sunrise Public School Admin and users inside its context
    await runWithTenantContext({ schoolId: schoolSunrise._id, bypassTenantFilter: false }, async () => {
      await models.User.create({
        name: 'John Smith (Admin)',
        email: 'admin@sunrise.com',
        password: 'admin_password',
        role: 'SCHOOL_ADMIN',
        schoolId: schoolSunrise._id,
        status: 'ACTIVE'
      });

      // 4. Create Classes for Sunrise
      const class10 = await models.Class.create({
        name: 'Grade 10',
        code: 'G10',
        description: 'Sophomore High School Class'
      });
      const class11 = await models.Class.create({
        name: 'Grade 11',
        code: 'G11',
        description: 'Junior High School Class'
      });

      // 5. Create Sections for Sunrise
      const secA = await models.Section.create({
        classId: class10._id,
        name: 'Section A',
        roomNumber: 'Room 101',
        capacity: 35
      });
      const secB = await models.Section.create({
        classId: class10._id,
        name: 'Section B',
        roomNumber: 'Room 102',
        capacity: 30
      });

      const sunriseTeacherUser = await models.User.create({
        name: 'Richard Feynman',
        email: 'teacher@sunrise.com',
        mobile: '1234567890',
        password: 'teacher_password',
        role: 'TEACHER',
        schoolId: schoolSunrise._id,
        status: 'ACTIVE'
      });
      const teacher = await models.Teacher.create({
        userId: sunriseTeacherUser._id,
        firstName: 'Richard',
        lastName: 'Feynman',
        gender: 'MALE',
        dateOfBirth: new Date('1985-05-11'),
        phone: '1234567890',
        email: 'teacher@sunrise.com',
        qualification: 'Ph.D. in Physics',
        designation: 'Senior Teacher',
        assignedClasses: [{ classId: class10._id, sectionId: secA._id }],
        isClassTeacher: true,
        classTeacherOf: { classId: class10._id, sectionId: secA._id }
      });

      secA.classTeacherId = teacher._id;
      await secA.save();

      const sunriseParentUser = await models.User.create({
        name: 'Albert Einstein',
        email: 'parent@sunrise.com',
        mobile: '9876543210',
        password: 'parent_password',
        role: 'PARENT',
        schoolId: schoolSunrise._id,
        status: 'ACTIVE'
      });
      await models.Parent.create({
        userId: sunriseParentUser._id,
        firstName: 'Albert',
        lastName: 'Einstein',
        relation: 'FATHER',
        phone: '9876543210',
        email: 'parent@sunrise.com'
      });

      console.log('Sunrise Public School specific data seeded.');
    });

    // Now run everything else inside the context of this school tenant
    await runWithTenantContext({ schoolId: school._id, bypassTenantFilter: false }, async () => {
      
      // 3. Create School Admin User
      const schoolAdmin = await models.User.create({
        name: 'Jane Doe (Admin)',
        email: 'admin@greenwood.com',
        password: 'admin_password',
        role: 'SCHOOL_ADMIN',
        schoolId: school._id,
        status: 'ACTIVE'
      });
      console.log('School Admin Seeded: admin@greenwood.com');

      // 4. Create Classes
      const class10 = await models.Class.create({
        name: 'Grade 10',
        code: 'G10',
        description: 'Sophomore High School Class'
      });
      const class11 = await models.Class.create({
        name: 'Grade 11',
        code: 'G11',
        description: 'Junior High School Class'
      });

      // 5. Create Sections
      const secA = await models.Section.create({
        classId: class10._id,
        name: 'Section A',
        roomNumber: 'Room 201',
        capacity: 35
      });
      const secB = await models.Section.create({
        classId: class10._id,
        name: 'Section B',
        roomNumber: 'Room 202',
        capacity: 30
      });

      // 6. Create Subjects
      const math = await models.Subject.create({
        classId: class10._id,
        name: 'Advanced Mathematics',
        code: 'MATH101',
        type: 'THEORY'
      });
      const physics = await models.Subject.create({
        classId: class10._id,
        name: 'Theoretical Physics',
        code: 'PHYS101',
        type: 'BOTH'
      });

      // 7. Create Teachers
      const userTeacher1 = await models.User.create({
        name: 'Robert Oppenheimer',
        email: 'teacher.oppenheimer@greenwood.com',
        mobile: '1122334455',
        password: 'teacher_password',
        role: 'TEACHER',
        schoolId: school._id
      });
      const teacher1 = await models.Teacher.create({
        userId: userTeacher1._id,
        firstName: 'Robert',
        lastName: 'Oppenheimer',
        gender: 'MALE',
        dateOfBirth: new Date('1984-04-22'),
        phone: '+1-555-0210',
        email: 'teacher.oppenheimer@greenwood.com',
        qualification: 'Ph.D. in Astrophysics',
        designation: 'Senior Science Teacher',
        assignedSubjects: [physics._id],
        assignedClasses: [{ classId: class10._id, sectionId: secA._id }],
        isClassTeacher: true,
        classTeacherOf: { classId: class10._id, sectionId: secA._id }
      });

      // Link Teacher 1 as Class Teacher for Sec A
      secA.classTeacherId = teacher1._id;
      await secA.save();

      const userTeacher2 = await models.User.create({
        name: 'Ada Lovelace',
        email: 'teacher.lovelace@greenwood.com',
        password: 'teacher_password',
        role: 'TEACHER',
        schoolId: school._id
      });
      const teacher2 = await models.Teacher.create({
        userId: userTeacher2._id,
        firstName: 'Ada',
        lastName: 'Lovelace',
        gender: 'FEMALE',
        dateOfBirth: new Date('1988-12-10'),
        phone: '+1-555-0220',
        email: 'teacher.lovelace@greenwood.com',
        qualification: 'M.Sc. in Applied Mathematics',
        designation: 'Senior Math Teacher',
        assignedSubjects: [math._id],
        assignedClasses: [{ classId: class10._id, sectionId: secB._id }]
      });

      // 8. Create Accountant Staff
      const userAccountant = await models.User.create({
        name: 'Bill Gates',
        email: 'finance@greenwood.com',
        password: 'finance_password',
        role: 'ACCOUNTANT',
        schoolId: school._id
      });
      await models.Staff.create({
        userId: userAccountant._id,
        firstName: 'Bill',
        lastName: 'Gates',
        gender: 'MALE',
        phone: '+1-555-0310',
        email: 'finance@greenwood.com',
        department: 'FINANCE',
        designation: 'Chief School Accountant'
      });

      // 9. Create Parent
      const userParent = await models.User.create({
        name: 'Marie Curie',
        email: 'parent.curie@gmail.com',
        mobile: '9988776655',
        password: 'parent_password',
        role: 'PARENT',
        schoolId: school._id
      });
      const parent = await models.Parent.create({
        userId: userParent._id,
        firstName: 'Marie',
        lastName: 'Curie',
        relation: 'MOTHER',
        phone: '+1-555-0410',
        email: 'parent.curie@gmail.com'
      });

      // 10. Create Student
      const userStudent = await models.User.create({
        name: 'Irene Curie',
        email: 'irene.curie@student.com',
        password: 'student_password',
        role: 'STUDENT',
        schoolId: school._id
      });
      const student = await models.Student.create({
        userId: userStudent._id,
        parentId: parent._id,
        admissionNo: 'ADM-2026-001',
        rollNo: '10',
        firstName: 'Irene',
        lastName: 'Curie',
        gender: 'FEMALE',
        dateOfBirth: new Date('2011-09-17'),
        bloodGroup: 'O+',
        classId: class10._id,
        sectionId: secA._id
      });

      // Link child on Parent profile
      parent.children.push(student._id);
      await parent.save();

      // 11. Create mock Fees
      const tuitionFee = await models.Fees.create({
        title: 'Q1 Tuition Fee',
        category: 'TUITION',
        amount: 2500,
        classId: class10._id,
        dueDate: new Date('2026-09-01'),
        academicYear: '2026-2027',
        description: 'First installment of annual tuition fees'
      });

      // Mark partial payment
      await models.FeePayments.create({
        studentId: student._id,
        feeId: tuitionFee._id,
        amountPaid: 1500,
        paymentMethod: 'ONLINE',
        status: 'PAID',
        receiptNo: 'REC-2026-0001',
        referenceNo: 'TXN-984210',
        remarks: 'Partially collected online payment'
      });

      // 12. Add mock Library Book
      const book = await models.LibraryBooks.create({
        title: 'Principia Mathematica',
        author: 'Isaac Newton',
        isbn: '978-0198510611',
        publisher: 'Oxford Press',
        category: 'Physics',
        totalCopies: 5,
        availableCopies: 4,
        rackNo: 'A-3'
      });

      // Issue book to Student
      await models.BookIssue.create({
        bookId: book._id,
        userId: userStudent._id,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'ISSUED'
      });

      // 13. Create mock Homework
      const hw = await models.Homework.create({
        title: 'Quantum Mechanics Basics',
        description: 'Solve the Schrodinger equation for a 1D box. Submit answers as PDF.',
        classId: class10._id,
        sectionId: secA._id,
        subjectId: physics._id,
        teacherId: teacher1._id,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      });

      // --- POPULATE REQUESTED DATA FOR GREENVALLEY ---
      console.log('Generating requested data for Greenvalley: 5 grades, 3 sections each, 5 subjects each, 10 teachers, 50 students');

      // 1. Create 5 Grades
      const newClasses = [];
      for (let i = 1; i <= 5; i++) {
        const cls = await models.Class.create({
          name: `Grade ${i}`,
          code: `G${i}`,
          description: `Elementary School Grade ${i}`
        });
        newClasses.push(cls);
      }

      // 2. Create 3 Sections for each Grade (A, B, C) and 5 Subjects for each Grade
      const sectionsList = [];
      const subjectsMap = {}; // classId -> list of subjects

      for (const cls of newClasses) {
        // Sections
        const secNames = ['A', 'B', 'C'];
        for (const sName of secNames) {
          const sec = await models.Section.create({
            classId: cls._id,
            name: `Section ${sName}`,
            roomNumber: `Room ${cls.code.replace('G', '')}0${secNames.indexOf(sName) + 1}`,
            capacity: 30
          });
          sectionsList.push(sec);
        }

        // Subjects
        const subDefs = [
          { name: 'Mathematics', code: `MATH-${cls.code}`, type: 'THEORY' },
          { name: 'Science', code: `SCI-${cls.code}`, type: 'BOTH' },
          { name: 'English', code: `ENG-${cls.code}`, type: 'THEORY' },
          { name: 'Social Studies', code: `SOC-${cls.code}`, type: 'THEORY' },
          { name: 'Computer Science', code: `COMP-${cls.code}`, type: 'PRACTICAL' }
        ];

        subjectsMap[cls._id.toString()] = [];
        for (const s of subDefs) {
          const sub = await models.Subject.create({
            classId: cls._id,
            name: `${s.name} ${cls.name}`,
            code: s.code,
            type: s.type
          });
          subjectsMap[cls._id.toString()].push(sub);
        }
      }

      // 3. Create 10 Teachers
      const teachersList = [];
      const teacherNames = [
        { first: 'Albert', last: 'Einstein', qual: 'Ph.D. in Physics' },
        { first: 'Marie', last: 'Curie', qual: 'Ph.D. in Chemistry' },
        { first: 'Isaac', last: 'Newton', qual: 'Ph.D. in Mathematics' },
        { first: 'Galileo', last: 'Galilei', qual: 'M.Sc. in Astronomy' },
        { first: 'Charles', last: 'Darwin', qual: 'Ph.D. in Biology' },
        { first: 'Nikola', last: 'Tesla', qual: 'B.Sc. in Electrical Eng' },
        { first: 'Stephen', last: 'Hawking', qual: 'Ph.D. in Cosmology' },
        { first: 'Jane', last: 'Goodall', qual: 'Ph.D. in Anthropology' },
        { first: 'Alan', last: 'Turing', qual: 'Ph.D. in Mathematics' },
        { first: 'Richard', last: 'Feynman', qual: 'Ph.D. in Physics' }
      ];

      for (let i = 0; i < 10; i++) {
        const def = teacherNames[i];
        const email = `teacher.demo${i + 1}@greenwood.com`;
        
        const userT = await models.User.create({
          name: `${def.first} ${def.last}`,
          email,
          password: 'teacher_password',
          role: 'TEACHER',
          schoolId: school._id,
          status: 'ACTIVE'
        });

        // Assign some subjects and classes/sections
        // Let's distribute subjects and sections round-robin
        const classIdx = i % newClasses.length;
        const targetClass = newClasses[classIdx];
        const classSubjects = subjectsMap[targetClass._id.toString()] || [];
        const classSections = sectionsList.filter(s => s.classId.toString() === targetClass._id.toString());

        const teacher = await models.Teacher.create({
          userId: userT._id,
          firstName: def.first,
          lastName: def.last,
          gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
          dateOfBirth: new Date(1975 + (i * 2), 4, 15),
          phone: `+1-555-90${i.toString().padStart(2, '0')}`,
          email,
          qualification: def.qual,
          designation: 'Faculty Teacher',
          assignedSubjects: classSubjects.map(sub => sub._id),
          assignedClasses: classSections.map(sec => ({ classId: targetClass._id, sectionId: sec._id }))
        });

        teachersList.push(teacher);
      }

      // 4. Create 50 Students
      for (let i = 1; i <= 50; i++) {
        const email = `student.demo${i}@greenwood.com`;
        const userS = await models.User.create({
          name: `Student Demo ${i}`,
          email,
          password: 'student_password',
          role: 'STUDENT',
          schoolId: school._id,
          status: 'ACTIVE'
        });

        // Pick a section round-robin from our 15 sections
        const secIdx = (i - 1) % sectionsList.length;
        const targetSec = sectionsList[secIdx];

        await models.Student.create({
          userId: userS._id,
          admissionNo: `ADM-2026-VAL${i.toString().padStart(3, '0')}`,
          rollNo: `${Math.ceil(i / sectionsList.length)}`,
          firstName: 'Student',
          lastName: `Demo ${i}`,
          gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
          dateOfBirth: new Date(2012 + (i % 4), (i % 12), (i % 28) + 1),
          classId: targetSec.classId,
          sectionId: targetSec._id
        });
      }

      // 5. Create Exams and Exam Schedules for the 5 Grades and their 5 Subjects
      console.log('Seeding Exam and ExamSchedules for Greenwood school');
      const examMid = await models.Exam.create({
        name: 'Mid-Term Examination (2026)',
        academicYear: '2026-2027',
        startDate: new Date('2026-09-15'),
        endDate: new Date('2026-09-25')
      });
      const examFinal = await models.Exam.create({
        name: 'Final Term Examination (2026)',
        academicYear: '2026-2027',
        startDate: new Date('2026-12-10'),
        endDate: new Date('2026-12-22')
      });

      for (const cls of newClasses) {
        const classSubjects = subjectsMap[cls._id.toString()] || [];
        for (const sub of classSubjects) {
          // Mid-Term schedule
          await models.ExamSchedule.create({
            examId: examMid._id,
            classId: cls._id,
            subjectId: sub._id,
            date: new Date('2026-09-16'),
            startTime: '09:00',
            endTime: '12:00',
            maxMarks: 100,
            passMarks: 40,
            roomNo: 'Exam Hall A'
          });

          // Final Term schedule
          await models.ExamSchedule.create({
            examId: examFinal._id,
            classId: cls._id,
            subjectId: sub._id,
            date: new Date('2026-12-11'),
            startTime: '09:00',
            endTime: '12:00',
            maxMarks: 100,
            passMarks: 40,
            roomNo: 'Exam Hall B'
          });
        }
      }

      console.log('Greenwood School Specific Mock Data Seeded successfully.');
    });

    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seed();
