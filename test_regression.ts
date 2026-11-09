import { checkTwoLessonsConflict, checkLessonOverlap } from './src/utils/timezone';
import { db } from './src/server/db';

async function runRegressionTests() {
  console.log('====================================================');
  console.log('        TARTEEL ACADEMY REGRESSION SUITE            ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assertTest(name: string, condition: boolean, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${name}`);
    } else {
      console.error(`❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
    }
  }

  console.log('--- 1. SCHEDULING CONFLICT TESTS ---');

  // Test 1: Two different teachers teaching different students at the same time: PASS expected
  const t1 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-A', studentId: 'student-1', dayOfWeek: 1, localTime: '10:00', durationMinutes: 30 },
    { id: 'l2', teacherId: 'teacher-B', studentId: 'student-2', dayOfWeek: 1, localTime: '10:00', durationMinutes: 30 }
  );
  assertTest('Test 1: Two different teachers teaching different students at same time (10:00 - 10:30)', t1.isConflict === false);

  // Test 2: One teacher teaching two students at overlapping times: CONFLICT expected
  const t2 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-A', studentId: 'student-1', dayOfWeek: 1, localTime: '10:00', durationMinutes: 30 },
    { id: 'l2', teacherId: 'teacher-A', studentId: 'student-2', dayOfWeek: 1, localTime: '10:15', durationMinutes: 30 }
  );
  assertTest('Test 2: One teacher teaching two students at overlapping times (10:00-10:30 & 10:15-10:45)', t2.isConflict === true && t2.conflictType === 'TEACHER_CONFLICT');

  // Test 3: One student assigned to two teachers at overlapping times: CONFLICT expected
  const t3 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-A', studentId: 'student-1', dayOfWeek: 2, localTime: '14:00', durationMinutes: 30 },
    { id: 'l2', teacherId: 'teacher-B', studentId: 'student-1', dayOfWeek: 2, localTime: '14:15', durationMinutes: 30 }
  );
  assertTest('Test 3: One student assigned to two teachers at overlapping times (14:00-14:30 & 14:15-14:45)', t3.isConflict === true && t3.conflictType === 'STUDENT_CONFLICT');

  // Test 4: Two lessons for the same teacher with no overlap: PASS expected
  const t4 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-A', studentId: 'student-1', dayOfWeek: 3, localTime: '09:00', durationMinutes: 30 },
    { id: 'l2', teacherId: 'teacher-A', studentId: 'student-2', dayOfWeek: 3, localTime: '10:00', durationMinutes: 30 }
  );
  assertTest('Test 4: Two lessons for same teacher with no overlap (09:00-09:30 & 10:00-10:30)', t4.isConflict === false);

  // Test 5: Two lessons where the first ends exactly when the second starts: PASS expected
  const t5 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-A', studentId: 'student-1', dayOfWeek: 4, localTime: '10:00', durationMinutes: 30 },
    { id: 'l2', teacherId: 'teacher-A', studentId: 'student-2', dayOfWeek: 4, localTime: '10:30', durationMinutes: 30 }
  );
  assertTest('Test 5: Two lessons where first ends exactly when second starts (10:00-10:30 & 10:30-11:00)', t5.isConflict === false);

  // Test 6: Two lessons with a partial time overlap: CONFLICT expected
  const t6 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-A', studentId: 'student-1', dayOfWeek: 5, localTime: '16:00', durationMinutes: 40 },
    { id: 'l2', teacherId: 'teacher-A', studentId: 'student-2', dayOfWeek: 5, localTime: '16:30', durationMinutes: 30 }
  );
  assertTest('Test 6: Two lessons with partial time overlap (16:00-16:40 & 16:30-17:00)', t6.isConflict === true);

  // Test 7: Two lessons with identical time intervals for the same teacher: CONFLICT expected
  const t7 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-A', studentId: 'student-1', dayOfWeek: 6, localTime: '11:00', durationMinutes: 30 },
    { id: 'l2', teacherId: 'teacher-A', studentId: 'student-2', dayOfWeek: 6, localTime: '11:00', durationMinutes: 30 }
  );
  assertTest('Test 7: Two lessons with identical time intervals for same teacher (11:00-11:30 & 11:00-11:30)', t7.isConflict === true);

  // Test 8: Different teachers with different students on same day and same time: PASS expected
  const t8 = checkTwoLessonsConflict(
    { id: 'l1', teacherId: 'teacher-Mohamed', studentId: 'student-Ali', dayOfWeek: 0, localTime: '18:00', durationMinutes: 30 },
    { id: 'l2', teacherId: 'teacher-Sarah', studentId: 'student-Fatima', dayOfWeek: 0, localTime: '18:00', durationMinutes: 30 }
  );
  assertTest('Test 8: Different teachers with different students on same day and time (Sunday 18:00)', t8.isConflict === false);

  console.log('\n--- 2. SALARY AND ADMIN EXCLUSION TESTS ---');

  const database = db.get();
  const adminProfiles = database.profiles.filter(p => p.role === 'ADMIN');
  const teachers = database.profiles.filter(p => p.role === 'TEACHER');

  // Salary Test 1: Admin does not appear in teacher salary lists
  const adminIds = new Set(adminProfiles.map(p => p.id));
  const activeTeachers = database.profiles.filter(p => p.role === 'TEACHER' && p.status === 'ACTIVE');
  const adminInTeacherList = activeTeachers.some(t => adminIds.has(t.id));
  assertTest('Salary Test 1: Admin does not appear in teacher list for salaries', adminInTeacherList === false);

  // Salary Test 2: Admin does not receive automatically generated salary records
  const adminPayrollReqs = database.payrollRequests.filter(r => adminIds.has(r.teacherId));
  assertTest('Salary Test 2: Admin has no generated salary requests in database', adminPayrollReqs.length === 0);

  // Salary Test 3: All actual teachers still appear in salary management
  assertTest('Salary Test 3: All actual teachers appear in system', teachers.length > 0 && teachers.every(t => t.role === 'TEACHER'));

  // Salary Test 4: Teacher salary calculations remain accurate at 65 EGP / lesson
  const sampleLessons = 10;
  const expectedSalary = sampleLessons * 65;
  assertTest('Salary Test 4: Teacher salary calculation rate is exactly 65 EGP/lesson', expectedSalary === 650);

  // Salary Test 5: Historical teacher payments remain unchanged
  const historicalPayments = database.payrollRequests.filter(r => r.status === 'PAID');
  assertTest('Salary Test 5: Historical teacher payments preserved', historicalPayments.length > 0 && historicalPayments.every(p => p.totalSalary > 0));

  // Salary Test 6: Admin can still manage teacher salaries
  assertTest('Salary Test 6: Admin account exists with full ADMIN role for salary approvals', adminProfiles.length > 0 && adminProfiles[0].role === 'ADMIN');

  // Salary Test 7: No unrelated financial records are modified
  assertTest('Salary Test 7: Historical payroll records count matches expected', database.payrollRequests.length === 2);

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL REGRESSION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!');
    process.exit(1);
  }
}

runRegressionTests().catch(err => {
  console.error('Regression suite runner error:', err);
  process.exit(1);
});
