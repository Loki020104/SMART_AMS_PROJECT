-- ═════════════════════════════════════════════════════════════════════════
-- SMART AMS - RBAC Analytics System - Supabase Schema Updates
-- Run these SQL commands in Supabase SQL Editor
-- ═════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1: Add Missing Columns to EXISTING users Table
-- ─────────────────────────────────────────────────────────────────────────
-- Only run these if the columns don't already exist

ALTER TABLE users
ADD COLUMN IF NOT EXISTS school_id VARCHAR(100);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS department_id VARCHAR(100);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS assigned_classes TEXT[] DEFAULT '{}';

-- Ensure roll_no exists (you may already have this)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS roll_no VARCHAR(100) UNIQUE;

-- Ensure role exists (you may already have this)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'student';

-- Add indexes for filtering performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_roll_no ON users(roll_no);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2: Create classes Table (if not exists)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_name VARCHAR(255) NOT NULL,
    section VARCHAR(50),
    department_id VARCHAR(100),
    school_id VARCHAR(100),
    semester INT,
    academic_year VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_department_id ON classes(department_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 3: Create departments Table (for HOD hierarchy)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id VARCHAR(100) UNIQUE NOT NULL,
    department_name VARCHAR(255) NOT NULL,
    school_id VARCHAR(100),
    hod_faculty_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_school_id ON departments(school_id);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 4: Create schools Table (for Dean hierarchy)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id VARCHAR(100) UNIQUE NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    principal_id UUID,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 5: Update attendance Table - Add Missing Columns
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS class_id VARCHAR(100);

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS subject_id VARCHAR(100);

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS faculty_id UUID;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS latitude FLOAT;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS longitude FLOAT;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS in_campus BOOLEAN DEFAULT FALSE;

-- Ensure these core columns exist
ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS roll_no VARCHAR(100);

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS date DATE;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS present BOOLEAN DEFAULT FALSE;

ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- Add indexes for analytics performance
CREATE INDEX IF NOT EXISTS idx_attendance_roll_no ON attendance(roll_no);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_faculty_id ON attendance(faculty_id);
CREATE INDEX IF NOT EXISTS idx_attendance_roll_date ON attendance(roll_no, date);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 6: Create subjects Table
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id VARCHAR(100) UNIQUE NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    department_id VARCHAR(100),
    semester INT,
    credits INT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_department_id ON subjects(department_id);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 7: Create faculty_classes Junction Table
-- ─────────────────────────────────────────────────────────────────────────
-- Links faculty to their assigned classes

CREATE TABLE IF NOT EXISTS faculty_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id VARCHAR(100) NOT NULL,
    subject_id VARCHAR(100),
    assigned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(faculty_id, class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_classes_faculty_id ON faculty_classes(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_classes_class_id ON faculty_classes(class_id);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 8: Create enrollment Table (Students → Classes)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enrollment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_no VARCHAR(100) NOT NULL,
    class_id VARCHAR(100) NOT NULL,
    department_id VARCHAR(100),
    section VARCHAR(50),
    semester INT,
    academic_year VARCHAR(20),
    enrolled_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(roll_no, class_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_roll_no ON enrollment(roll_no);
CREATE INDEX IF NOT EXISTS idx_enrollment_class_id ON enrollment(class_id);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 9: Sample Data (Optional - for testing)
-- ─────────────────────────────────────────────────────────────────────────

-- Insert sample school
INSERT INTO schools (school_id, school_name, location)
VALUES ('SCHOOL001', 'School of Engineering', 'Campus A')
ON CONFLICT (school_id) DO NOTHING;

-- Insert sample department
INSERT INTO departments (department_id, department_name, school_id)
VALUES ('CSE', 'Computer Science & Engineering', 'SCHOOL001')
ON CONFLICT (department_id) DO NOTHING;

-- Insert sample class
INSERT INTO classes (class_name, section, department_id, school_id, semester)
VALUES ('CS-101', 'A', 'CSE', 'SCHOOL001', 1)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 10: Enable Row Level Security (RLS) for Security
-- ─────────────────────────────────────────────────────────────────────────

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow users to see only their own data (students) or data in their scope (admins/deans/etc)
-- This is a basic policy - adjust based on your specific needs
CREATE POLICY "Users can view their own data"
ON users FOR SELECT
USING (
    -- Admin can see all users
    (auth.jwt() ->> 'role')::text = 'admin'
    OR
    -- Users can see themselves
    id = auth.uid()::uuid
);

-- Enable RLS on attendance table
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attendance in their scope"
ON attendance FOR SELECT
USING (
    -- Admin can see all
    (auth.jwt() ->> 'role')::text = 'admin'
    OR
    -- Students can see only their own
    roll_no = (SELECT roll_no FROM users WHERE id = auth.uid()::uuid LIMIT 1)
);

-- Enable RLS on classes table
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view classes in their scope"
ON classes FOR SELECT
USING (
    -- Admin can see all
    (auth.jwt() ->> 'role')::text = 'admin'
    OR
    -- Faculty can see their assigned classes
    id IN (
        SELECT class_id::uuid FROM faculty_classes WHERE faculty_id = auth.uid()::uuid
    )
);


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 11: Create system_config Table (if not exists)
-- Used for storing feature toggles and configuration
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    description VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default configuration values
INSERT INTO system_config (key, value, description)
VALUES 
    ('face_recognition_enabled', 'true', 'Enable/disable face recognition verification'),
    ('attendance_window_start', '08:00', 'Time window - attendance marking starts'),
    ('attendance_window_end', '18:00', 'Time window - attendance marking ends'),
    ('qr_expiry_minutes', '5', 'QR code expiration time in minutes'),
    ('college_lat', '28.5355', 'College latitude for geolocation check'),
    ('college_lng', '77.0992', 'College longitude for geolocation check'),
    ('college_radius_km', '0.5', 'Radius in km for on-campus detection'),
    ('tolerance', '0.45', 'Face verification tolerance (lower = stricter)')
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES - Run these to verify setup
-- ─────────────────────────────────────────────────────────────────────────

-- Check if users table has all required columns
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'users' 
-- ORDER BY ordinal_position;

-- Check if attendance table has all required columns
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'attendance'
-- ORDER BY ordinal_position;

-- Check row counts
-- SELECT 'users' as table_name, COUNT(*) as count FROM users
-- UNION ALL
-- SELECT 'attendance', COUNT(*) FROM attendance
-- UNION ALL
-- SELECT 'classes', COUNT(*) FROM classes;

-- ═════════════════════════════════════════════════════════════════════════
-- HELPFUL NOTES
-- ═════════════════════════════════════════════════════════════════════════
-- 
-- 1. Run all ALTER TABLE commands first - they won't error if columns exist
-- 2. Run CREATE TABLE commands next - they won't error if tables exist
-- 3. Indexes are optional but HIGHLY recommended for performance
-- 4. RLS policies are basic - customize for your exact security requirements
-- 5. Sample data is optional - remove if not needed
-- 6. After running this, update backend.py with RBAC imports/middleware
-- 7. Test with: SELECT * FROM users WHERE role = 'admin' LIMIT 1;
--
-- ═════════════════════════════════════════════════════════════════════════
