-- Shule AI v15 scale indexes. Safe to run manually in PostgreSQL if migrations are unavailable.
-- This script checks table existence before creating indexes so older databases do not abort.

DO $$ BEGIN
  IF to_regclass('public."Users"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_users_school_role ON "Users" ("schoolCode", "role");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Users"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_users_school_active ON "Users" ("schoolCode", "isActive");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Users"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_users_role ON "Users" ("role");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Users"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_users_phone ON "Users" ("phone");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Students"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_students_user_id ON "Students" ("userId");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Students"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_students_grade_status ON "Students" ("grade", "status");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Students"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_students_status ON "Students" ("status");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Students"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_students_approval_status ON "Students" ("approvalStatus");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Teachers"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON "Teachers" ("userId");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Teachers"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_teachers_class_id ON "Teachers" ("classId");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Teachers"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_teachers_department ON "Teachers" ("department");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Teachers"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_teachers_approval_status ON "Teachers" ("approvalStatus");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Parents"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_parents_user_id ON "Parents" ("userId");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Classes"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_classes_school_code ON "Classes" ("schoolCode");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Classes"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_classes_school_grade ON "Classes" ("schoolCode", "grade");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."AcademicRecords"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_records_school_year_term ON "AcademicRecords" ("schoolCode", "year", "term");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."AcademicRecords"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_records_student_year_term ON "AcademicRecords" ("studentId", "year", "term");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."AcademicRecords"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_records_school_subject ON "AcademicRecords" ("schoolCode", "subject");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."AcademicRecords"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_records_school_published ON "AcademicRecords" ("schoolCode", "isPublished");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Attendance"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON "Attendance" ("schoolCode", "date");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Attendance"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON "Attendance" ("studentId", "date");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Attendance"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_attendance_school_status ON "Attendance" ("schoolCode", "status");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Attendances"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_attendances_school_date ON "Attendances" ("schoolCode", "date");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Attendances"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_attendances_student_date ON "Attendances" ("studentId", "date");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Attendances"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_attendances_school_status ON "Attendances" ("schoolCode", "status");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Fees"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fees_school_year_term ON "Fees" ("schoolCode", "year", "term");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Fees"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fees_student_year_term ON "Fees" ("studentId", "year", "term");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Fees"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fees_school_status ON "Fees" ("schoolCode", "status");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Payments"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_payments_school_status ON "Payments" ("schoolCode", "status");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Payments"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_payments_student_id ON "Payments" ("studentId");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Payments"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_payments_parent_id ON "Payments" ("parentId");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Payments"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_payments_type_status ON "Payments" ("paymentType", "status");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Messages"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON "Messages" ("senderId", "createdAt");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Messages"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_messages_receiver_created ON "Messages" ("receiverId", "createdAt");
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public."Alerts"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_alerts_role_created ON "Alerts" ("role", "createdAt");
  END IF;
END $$;
