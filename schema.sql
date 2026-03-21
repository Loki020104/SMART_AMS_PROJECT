-- ============================================================
-- SmartAMS — Complete Consolidated Schema
-- Attendance Management System with Face Recognition & QR Code
-- Architecture: single `users` table (student + faculty + admin)
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────
-- 1. DEPARTMENTS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    code        VARCHAR(50) UNIQUE NOT NULL,
    parent_code VARCHAR(50),
    programs    JSONB DEFAULT '[]',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_code VARCHAR(50);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

-- ────────────────────────────────────────────────────────────────────
-- 2. USERS (unified: student + faculty + admin)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(100) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name     VARCHAR(255),
    role          VARCHAR(50) NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student', 'faculty', 'admin')),
    -- student fields
    roll_no       VARCHAR(100) UNIQUE,
    program       VARCHAR(100),
    section       VARCHAR(50),
    year          SMALLINT,
    semester      SMALLINT,
    -- faculty fields
    employee_id   VARCHAR(100) UNIQUE,
    designation   VARCHAR(100),
    subjects      TEXT,
    -- shared
    department    VARCHAR(100),
    phone         VARCHAR(20),
    firebase_uid  VARCHAR(255) UNIQUE,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    last_login    TIMESTAMPTZ
);
-- Upgrade columns (for existing databases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS semester    SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department  TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS section     TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS year        INT  DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT DEFAULT '';

-- ────────────────────────────────────────────────────────────────────
-- 3. ROOMS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_number TEXT UNIQUE NOT NULL,
    capacity    INTEGER DEFAULT 60,
    type        TEXT    DEFAULT 'classroom',
    building    TEXT    DEFAULT '',
    floor       TEXT    DEFAULT '',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 4. SUBJECTS CATALOGUE
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_code TEXT UNIQUE NOT NULL,
    subject_name TEXT NOT NULL,
    department   TEXT NOT NULL,
    program      TEXT DEFAULT 'B.Tech',
    semester     INTEGER NOT NULL,
    weekly_hours INTEGER DEFAULT 3,
    type         TEXT    DEFAULT 'Theory',
    credits      INTEGER DEFAULT 3,
    is_active    BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 5. COURSES
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_code   VARCHAR(100) NOT NULL,
    course_name   VARCHAR(255) NOT NULL,
    faculty_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    department    VARCHAR(100),
    semester      INT,
    academic_year VARCHAR(20),
    credits       INT DEFAULT 3,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns (for existing databases)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS department    VARCHAR(100);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS credits       INT DEFAULT 3;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT true;

-- ────────────────────────────────────────────────────────────────────
-- 6. FACULTY ASSIGNMENTS (access-control lookup table)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faculty_assignments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id         UUID,
    faculty_username   TEXT NOT NULL,
    subject_code       TEXT,
    subject_name       TEXT DEFAULT '',
    course_code        TEXT,
    course_name        TEXT,
    section            TEXT NOT NULL,
    department         TEXT NOT NULL,
    year               INTEGER NOT NULL,
    semester           INTEGER DEFAULT 1,
    academic_year      TEXT    DEFAULT '2025-26',
    is_active          BOOLEAN DEFAULT true,
    created_at         TIMESTAMPTZ DEFAULT now(),
    UNIQUE(faculty_username, subject_code, section, semester, academic_year)
);
ALTER TABLE faculty_assignments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ────────────────────────────────────────────────────────────────────
-- 7. FACE ENCODINGS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS face_encodings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    roll_no       VARCHAR(100) UNIQUE NOT NULL,
    name          TEXT,
    admission_no  VARCHAR(100),
    section       VARCHAR(50),
    academic_year VARCHAR(20),
    encoding      TEXT NOT NULL,
    image         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 8. COURSE ENROLLMENTS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_enrollments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_date TIMESTAMPTZ DEFAULT now(),
    status          VARCHAR(50) DEFAULT 'active'
                      CHECK (status IN ('active', 'dropped', 'completed')),
    UNIQUE (course_id, student_id)
);

-- ────────────────────────────────────────────────────────────────────
-- 9. TIMETABLE
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        TEXT,
    subject_name     TEXT NOT NULL,
    faculty_id       TEXT,
    faculty_name     TEXT,
    batch            TEXT,
    department       TEXT,
    day_of_week      TEXT NOT NULL,
    hour_number      INT  DEFAULT 1,
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    room_number      TEXT,
    section          TEXT    DEFAULT '',
    year             INTEGER DEFAULT 1,
    program          TEXT    DEFAULT 'B.Tech',
    faculty_username TEXT    DEFAULT '',
    period_number    INTEGER DEFAULT 1,
    type             TEXT    DEFAULT 'Theory',
    session_type     TEXT    DEFAULT 'lecture',
    lab_batch        TEXT,
    academic_year    TEXT,
    semester         INTEGER,
    subject_code     TEXT,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns (for existing databases)
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS section          TEXT    DEFAULT '';
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS year             INTEGER DEFAULT 1;
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS program          TEXT    DEFAULT 'B.Tech';
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS department       TEXT    DEFAULT '';
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS faculty_username TEXT    DEFAULT '';
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS period_number    INTEGER DEFAULT 1;
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS type             TEXT    DEFAULT 'Theory';
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS session_type     TEXT    DEFAULT 'lecture';
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS lab_batch        TEXT;
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS academic_year    TEXT;
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS semester         INTEGER;
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS subject_code     TEXT;
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT true;

-- ────────────────────────────────────────────────────────────────────
-- 9b. BREAK & LUNCH SCHEDULE
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS break_schedule (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year    TEXT NOT NULL DEFAULT '2025-26',
    semester         INTEGER NOT NULL DEFAULT 1,
    day_of_week      TEXT NOT NULL,
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    break_type       TEXT NOT NULL,
    description      TEXT DEFAULT '',
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE(academic_year, semester, day_of_week, start_time, end_time)
);
-- Description: Stores break and lunch break times
-- break_type: 'break' (e.g., 10:30-10:45), 'lunch' (e.g., 13:00-14:00)

-- ────────────────────────────────────────────────────────────────────
-- 10. TIMETABLE GENERATION JOB
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_generation_jobs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year    TEXT NOT NULL DEFAULT '2025-26',
    semester         INTEGER NOT NULL DEFAULT 1,
    algorithm        TEXT NOT NULL DEFAULT 'simulated_annealing',
    status           TEXT NOT NULL DEFAULT 'pending',
    generated_slots  JSONB DEFAULT '[]'::jsonb,
    error_message    TEXT DEFAULT '',
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);
-- Description: Tracks timetable generation jobs
-- status: 'pending', 'processing', 'completed', 'failed'

-- ────────────────────────────────────────────────────────────────────
-- 11. ATTENDANCE SESSIONS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course         TEXT,
    session_id     TEXT,
    timetable_id   TEXT,
    subject_name   TEXT,
    faculty_id     TEXT,
    faculty_name   TEXT,
    batch          TEXT,
    method         TEXT DEFAULT 'manual',
    session_type   TEXT DEFAULT 'lecture'
                     CHECK (session_type IN ('lecture','tutorial','practical','seminar')),
    status         TEXT DEFAULT 'open',
    date           DATE NOT NULL DEFAULT CURRENT_DATE,
    department     TEXT,
    section        TEXT,
    total_students INT DEFAULT 0,
    present_count  INT DEFAULT 0,
    absent_count   INT DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS department     TEXT;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS section        TEXT;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS total_students INT DEFAULT 0;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS present_count  INT DEFAULT 0;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS absent_count   INT DEFAULT 0;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS session_type   TEXT DEFAULT 'lecture';

-- ────────────────────────────────────────────────────────────────────
-- 12. ATTENDANCE
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id          UUID REFERENCES courses(id) ON DELETE CASCADE,
    marked_at          TIMESTAMPTZ DEFAULT now(),
    marked_date        DATE,
    date               DATE,
    marked_time        TIME,
    method             VARCHAR(50) DEFAULT 'manual'
                         CHECK (method IN ('face_recognition', 'qr_code', 'manual')),
    status             VARCHAR(50) DEFAULT 'present'
                         CHECK (status IN ('present', 'absent', 'late', 'excused')),
    -- face recognition
    face_confidence    DECIMAL(5,2),
    liveness_detected  BOOLEAN DEFAULT false,
    face_quality_score DECIMAL(5,2),
    encoding_id        UUID REFERENCES face_encodings(id) ON DELETE SET NULL,
    -- QR code
    qr_session_id      UUID,
    qr_code_data       VARCHAR(500),
    -- manual / dynamic session fields
    session_id         TEXT,
    student_name       TEXT,
    subject_name       TEXT,
    session_type       TEXT DEFAULT 'lecture'
                         CHECK (session_type IN ('lecture','tutorial','practical','seminar')),
    batch              TEXT,
    roll_no            TEXT,
    marked_by          TEXT,
    -- extended fields
    department         TEXT,
    section            TEXT,
    semester           SMALLINT,
    academic_year      TEXT,
    -- metadata
    latitude           DECIMAL(10,8),
    longitude          DECIMAL(11,8),
    device_info        VARCHAR(255),
    remarks            TEXT,
    is_verified        BOOLEAN DEFAULT false,
    verified_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS department    TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS section       TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS semester      SMALLINT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS academic_year TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS session_type  TEXT DEFAULT 'lecture';

-- ────────────────────────────────────────────────────────────────────
-- 13. QR SESSIONS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          TEXT UNIQUE NOT NULL,
    course_id           UUID REFERENCES courses(id) ON DELETE CASCADE,
    faculty_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at          TIMESTAMPTZ NOT NULL,
    encrypted_data      TEXT,
    qr_code_data        TEXT,
    validity_minutes    INT DEFAULT 5,
    latitude            DECIMAL(10,8),
    longitude           DECIMAL(11,8),
    gps_radius_meters   INT DEFAULT 100,
    require_face        BOOLEAN DEFAULT true,
    require_location    BOOLEAN DEFAULT true,
    active              BOOLEAN DEFAULT true,
    total_students      INT DEFAULT 0,
    present_count       INT DEFAULT 0,
    session_code        VARCHAR(50),
    session_date        DATE,
    session_time        TIME,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 14. PLACEMENT OPPORTUNITIES
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_opportunities (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name         TEXT NOT NULL,
    role                 TEXT NOT NULL,
    package              TEXT,
    deadline             DATE,
    eligibility_criteria TEXT,
    description          TEXT,
    apply_link           TEXT,
    is_active            BOOLEAN DEFAULT true,
    posted_by            TEXT,
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 15. EXAM REGISTRATIONS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_registrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    TEXT NOT NULL,
    semester      TEXT,
    academic_year TEXT,
    subjects      JSONB DEFAULT '[]',
    status        TEXT DEFAULT 'pending',
    submitted_at  TIMESTAMPTZ DEFAULT now(),
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 16. LIBRARY RESOURCES
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_resources (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT NOT NULL,
    author           TEXT,
    subject          TEXT,
    resource_type    TEXT DEFAULT 'E-Book',
    pdf_link         TEXT,
    available_copies INTEGER DEFAULT 1,
    category         TEXT,
    description      TEXT,
    added_by         TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 17. COURSE MATERIALS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_materials (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject       TEXT,
    file_name     TEXT NOT NULL,
    file_url      TEXT,
    material_type TEXT DEFAULT 'Notes',
    is_public     BOOLEAN DEFAULT true,
    uploaded_by   TEXT,
    topic         TEXT,
    course_code   TEXT DEFAULT '',
    module_number INT  DEFAULT 0,
    unit_name     TEXT DEFAULT '',
    description   TEXT DEFAULT '',
    department    TEXT DEFAULT '',
    uploaded_at   TIMESTAMPTZ DEFAULT now(),
    created_at    TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS course_code   TEXT DEFAULT '';
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS module_number INT  DEFAULT 0;
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS unit_name     TEXT DEFAULT '';
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS description   TEXT DEFAULT '';
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS department    TEXT DEFAULT '';

-- ────────────────────────────────────────────────────────────────────
-- 18. CALENDAR EVENTS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    event_date      DATE NOT NULL,
    end_date        DATE,
    event_type      TEXT DEFAULT 'event',
    description     TEXT,
    target_audience TEXT DEFAULT 'all',
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 19. COMMUNITIES
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_code   TEXT,
    name          TEXT NOT NULL,
    description   TEXT,
    members_count INTEGER DEFAULT 0,
    created_by    TEXT,
    department    TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE communities ADD COLUMN IF NOT EXISTS department TEXT;

-- ────────────────────────────────────────────────────────────────────
-- 20. COMMUNITY POSTS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_posts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id TEXT NOT NULL,
    author_id    TEXT,
    author_name  TEXT,
    content      TEXT NOT NULL,
    post_type    TEXT DEFAULT 'discussion',
    likes        INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 21. STAFF EVALUATIONS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_evaluations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        TEXT NOT NULL,
    faculty_id        TEXT NOT NULL,
    faculty_name      TEXT,
    subject           TEXT,
    teaching_clarity  INTEGER CHECK (teaching_clarity BETWEEN 1 AND 5),
    subject_knowledge INTEGER CHECK (subject_knowledge BETWEEN 1 AND 5),
    overall           INTEGER CHECK (overall BETWEEN 1 AND 5),
    comments          TEXT,
    semester          TEXT,
    academic_year     TEXT,
    submitted_at      TIMESTAMPTZ DEFAULT now(),
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 22. LESSON PLANS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_plans (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id    TEXT,
    subject       TEXT,
    week_number   INTEGER,
    topic         TEXT NOT NULL,
    planned_hours INTEGER DEFAULT 1,
    actual_hours  INTEGER DEFAULT 0,
    status        TEXT DEFAULT 'planned',
    notes         TEXT,
    planned_date  DATE,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 23. NOTIFICATIONS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT,
    target_role       TEXT DEFAULT 'all',
    title             TEXT NOT NULL,
    message           TEXT NOT NULL,
    notification_type TEXT DEFAULT 'info',
    is_read           BOOLEAN DEFAULT false,
    sent_by           TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 24. REPORTS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type           VARCHAR(50) NOT NULL,
    generated_by          UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id             UUID REFERENCES courses(id) ON DELETE SET NULL,
    student_id            UUID REFERENCES users(id) ON DELETE SET NULL,
    report_date           DATE NOT NULL,
    period_start          DATE,
    period_end            DATE,
    total_sessions        INT,
    total_present         INT,
    total_absent          INT,
    total_late            INT,
    attendance_percentage DECIMAL(5,2),
    file_url              VARCHAR(500),
    file_format           VARCHAR(20) DEFAULT 'pdf',
    status                VARCHAR(50) DEFAULT 'completed',
    error_message         TEXT,
    created_at            TIMESTAMPTZ DEFAULT now(),
    accessed_at           TIMESTAMPTZ,
    accessed_by           UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────────────
-- 25. AUDIT LOGS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(100) NOT NULL,
    entity_type  VARCHAR(50),
    entity_id    UUID,
    old_values   JSONB,
    new_values   JSONB,
    ip_address   VARCHAR(50),
    user_agent   VARCHAR(500),
    status       VARCHAR(50) DEFAULT 'success',
    error_details TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 26. SYSTEM SETTINGS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key   VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    data_type     VARCHAR(50) DEFAULT 'string',
    description   TEXT,
    is_system     BOOLEAN DEFAULT false,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 27. ASSESSMENTS & SUBMISSIONS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title             TEXT NOT NULL,
    description       TEXT DEFAULT '',
    type              TEXT NOT NULL DEFAULT 'quiz',
    course_code       TEXT DEFAULT '',
    course_name       TEXT DEFAULT '',
    department        TEXT DEFAULT '',
    section           TEXT DEFAULT '',
    year              INT DEFAULT 1,
    semester          INT DEFAULT 1,
    academic_year     TEXT DEFAULT '2025-26',
    total_marks       INT DEFAULT 100,
    pass_marks        INT DEFAULT 40,
    duration_mins     INT DEFAULT 0,
    start_time        TIMESTAMPTZ,
    end_time          TIMESTAMPTZ,
    status            TEXT DEFAULT 'draft',
    created_by        UUID,
    created_by_role   TEXT DEFAULT 'admin',
    faculty_id        UUID,
    allow_late        BOOLEAN DEFAULT false,
    shuffle_questions BOOLEAN DEFAULT false,
    questions         JSONB DEFAULT '[]'::jsonb,
    answer_key        JSONB DEFAULT '[]'::jsonb,
    source_file       TEXT DEFAULT '',
    marks_format      JSONB DEFAULT '[]'::jsonb,
    attachments       JSONB DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns (for existing databases)
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS department      TEXT DEFAULT '';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS section         TEXT DEFAULT '';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS course_code     TEXT DEFAULT '';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS course_name     TEXT DEFAULT '';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS year            INT DEFAULT 1;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS semester        INT DEFAULT 1;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS academic_year   TEXT DEFAULT '2025-26';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS created_by_role TEXT DEFAULT 'admin';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS faculty_id      UUID;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS allow_late      BOOLEAN DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS attachments     JSONB DEFAULT '[]'::jsonb;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'draft';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS total_marks     INT DEFAULT 100;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pass_marks      INT DEFAULT 40;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS duration_mins   INT DEFAULT 0;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS start_time      TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS end_time        TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS created_by      UUID;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS questions       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS answer_key      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS source_file     TEXT DEFAULT '';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS marks_format    JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS assessment_submissions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL,
    roll_no         TEXT DEFAULT '',
    student_name    TEXT DEFAULT '',
    department      TEXT DEFAULT '',
    section         TEXT DEFAULT '',
    answers         JSONB DEFAULT '[]'::jsonb,
    score           NUMERIC(6,2),
    total_marks     INT,
    status          TEXT DEFAULT 'in_progress',
    started_at      TIMESTAMPTZ DEFAULT now(),
    submitted_at    TIMESTAMPTZ,
    graded_at       TIMESTAMPTZ,
    graded_by       UUID,
    question_scores JSONB DEFAULT '[]'::jsonb,
    feedback        TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns (for existing databases)
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS department    TEXT DEFAULT '';
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS section       TEXT DEFAULT '';
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS roll_no       TEXT DEFAULT '';
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS student_name  TEXT DEFAULT '';
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS feedback      TEXT DEFAULT '';
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'in_progress';
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS score         NUMERIC(6,2);
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS total_marks   INT;
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS answers       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ DEFAULT now();
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ;
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS graded_at     TIMESTAMPTZ;
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS graded_by     UUID;
ALTER TABLE assessment_submissions ADD COLUMN IF NOT EXISTS question_scores JSONB DEFAULT '[]'::jsonb;

-- ────────────────────────────────────────────────────────────────────
-- 28. QUESTION PAPERS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_papers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    course_code     TEXT NOT NULL DEFAULT '',
    course_name     TEXT DEFAULT '',
    department      TEXT DEFAULT '',
    semester        INT DEFAULT 1,
    year            INT DEFAULT 1,
    academic_year   TEXT DEFAULT '',
    exam_type       TEXT DEFAULT 'internal',
    total_marks     INT DEFAULT 100,
    duration_mins   INT DEFAULT 180,
    sections        JSONB DEFAULT '[]'::jsonb,
    modules_used    JSONB DEFAULT '[]'::jsonb,
    instructions    TEXT DEFAULT '',
    generated_by    TEXT DEFAULT '',
    faculty_name    TEXT DEFAULT '',
    subject_code    TEXT DEFAULT '',
    status          TEXT DEFAULT 'draft',
    is_selected     BOOLEAN DEFAULT false,
    selected_by_admin UUID,
    selected_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
-- Upgrade columns (for existing databases)
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS department    TEXT DEFAULT '';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS course_code   TEXT NOT NULL DEFAULT '';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS course_name   TEXT DEFAULT '';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS exam_type     TEXT DEFAULT 'internal';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS sections      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS modules_used  JSONB DEFAULT '[]'::jsonb;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS instructions  TEXT DEFAULT '';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS generated_by  TEXT DEFAULT '';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'draft';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS total_marks   INT DEFAULT 100;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS duration_mins INT DEFAULT 180;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS semester      INT DEFAULT 1;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS year          INT DEFAULT 1;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS selected_by_admin UUID;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS selected_at      TIMESTAMPTZ;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS is_selected      BOOLEAN DEFAULT false;
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS faculty_name     TEXT DEFAULT '';
ALTER TABLE question_papers ADD COLUMN IF NOT EXISTS subject_code     TEXT DEFAULT '';

-- ────────────────────────────────────────────────────────────────────
-- 27b. EXAM MARKS FORMAT (admin-configurable marks structure for mid/end papers)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_marks_format (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_type       TEXT NOT NULL DEFAULT 'midterm',
    title           TEXT NOT NULL DEFAULT 'Default Format',
    course_code     TEXT DEFAULT '',
    department      TEXT DEFAULT '',
    sections        JSONB DEFAULT '[]'::jsonb,
    total_marks     INT DEFAULT 100,
    created_by      UUID,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS exam_type   TEXT NOT NULL DEFAULT 'midterm';
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS title       TEXT NOT NULL DEFAULT 'Default Format';
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS course_code TEXT DEFAULT '';
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS department  TEXT DEFAULT '';
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS sections    JSONB DEFAULT '[]'::jsonb;
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS total_marks INT DEFAULT 100;
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS created_by  UUID;
ALTER TABLE exam_marks_format ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT true;

-- ────────────────────────────────────────────────────────────────────
-- 28. ARCHIVE TABLES (Soft Deletes)
-- ────────────────────────────────────────────────────────────────────
-- Archive table for deleted users
CREATE TABLE IF NOT EXISTS users_archive (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_id   UUID,
    username      VARCHAR(100),
    email         VARCHAR(255),
    password_hash VARCHAR(255),
    full_name     VARCHAR(255),
    role          VARCHAR(50),
    roll_no       VARCHAR(100),
    program       VARCHAR(100),
    section       VARCHAR(50),
    year          SMALLINT,
    semester      SMALLINT,
    employee_id   VARCHAR(100),
    designation   VARCHAR(100),
    subjects      TEXT,
    department    VARCHAR(100),
    phone         VARCHAR(20),
    firebase_uid  VARCHAR(255),
    is_active     BOOLEAN,
    created_at    TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ,
    last_login    TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ DEFAULT now(),
    deleted_by    UUID,
    deletion_reason TEXT DEFAULT ''
);

-- Archive table for deleted timetable entries
CREATE TABLE IF NOT EXISTS timetable_archive (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_id           UUID,
    faculty_id            TEXT,
    faculty_name          TEXT,
    faculty_username      TEXT,
    batch                 TEXT,
    session_type          TEXT,
    subject               TEXT,
    day_of_week           TEXT,
    hour_number           INT,
    start_time            TIME,
    end_time              TIME,
    room_number           TEXT,
    academic_year         TEXT,
    semester              INT,
    mode                  TEXT,
    staff_id              UUID,
    created_at            TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ,
    deleted_at            TIMESTAMPTZ DEFAULT now(),
    deleted_by            UUID,
    deletion_reason       TEXT DEFAULT ''
);

-- ────────────────────────────────────────────────────────────────────
-- 29. INDEXES
-- ────────────────────────────────────────────────────────────────────
-- Users
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_roll_no        ON users(roll_no);
CREATE INDEX IF NOT EXISTS idx_users_employee_id    ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_department     ON users(department);
-- Face encodings
CREATE INDEX IF NOT EXISTS idx_face_enc_roll_no     ON face_encodings(roll_no);
CREATE INDEX IF NOT EXISTS idx_face_enc_user_id     ON face_encodings(user_id);
-- Courses
CREATE INDEX IF NOT EXISTS idx_courses_faculty      ON courses(faculty_id);
CREATE INDEX IF NOT EXISTS idx_courses_dept         ON courses(department);
-- Enrollments
CREATE INDEX IF NOT EXISTS idx_enrollment_student   ON course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_course    ON course_enrollments(course_id);
-- Attendance
CREATE INDEX IF NOT EXISTS idx_att_student          ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_att_course           ON attendance(course_id);
CREATE INDEX IF NOT EXISTS idx_att_date             ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_att_marked_date      ON attendance(marked_date);
CREATE INDEX IF NOT EXISTS idx_att_session_id       ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_att_roll_no          ON attendance(roll_no);
CREATE INDEX IF NOT EXISTS idx_att_lookup           ON attendance(student_id, marked_date, course_id);
CREATE INDEX IF NOT EXISTS idx_att_department       ON attendance(department);
-- Timetable
CREATE INDEX IF NOT EXISTS idx_timetable_day        ON timetable(day_of_week);
CREATE INDEX IF NOT EXISTS idx_timetable_faculty    ON timetable(faculty_id);
CREATE INDEX IF NOT EXISTS idx_timetable_batch      ON timetable(batch);
CREATE INDEX IF NOT EXISTS idx_timetable_section    ON timetable(section, department, year);
CREATE INDEX IF NOT EXISTS idx_timetable_faculty_username ON timetable(faculty_username);
CREATE INDEX IF NOT EXISTS idx_timetable_dept_yr    ON timetable(department, year, section);
-- Attendance sessions
CREATE INDEX IF NOT EXISTS idx_att_sessions_date    ON attendance_sessions(date);
CREATE INDEX IF NOT EXISTS idx_att_sessions_batch   ON attendance_sessions(batch);
-- QR sessions
CREATE INDEX IF NOT EXISTS idx_qr_session_id        ON qr_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_qr_faculty           ON qr_sessions(faculty_id);
CREATE INDEX IF NOT EXISTS idx_qr_active_expires    ON qr_sessions(active, expires_at);
-- Faculty assignments
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_fid      ON faculty_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_username  ON faculty_assignments(faculty_username);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_section   ON faculty_assignments(section, department, year);
-- Rooms & subjects
CREATE INDEX IF NOT EXISTS idx_rooms_number     ON rooms(room_number);
CREATE INDEX IF NOT EXISTS idx_subjects_code    ON subjects(subject_code);
CREATE INDEX IF NOT EXISTS idx_subjects_dept    ON subjects(department, semester);
-- Feature tables
CREATE INDEX IF NOT EXISTS idx_notif_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_role       ON notifications(target_role);
CREATE INDEX IF NOT EXISTS idx_calendar_date    ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_community_posts  ON community_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_eval_faculty     ON staff_evaluations(faculty_id);
CREATE INDEX IF NOT EXISTS idx_lesson_faculty   ON lesson_plans(faculty_id);
CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_logs(entity_type, entity_id);
-- Assessments & submissions
CREATE INDEX IF NOT EXISTS idx_assessments_dept        ON assessments(department, section, year);
CREATE INDEX IF NOT EXISTS idx_assessments_status      ON assessments(status);
CREATE INDEX IF NOT EXISTS idx_submissions_assessment  ON assessment_submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student     ON assessment_submissions(student_id);
-- Course materials
CREATE INDEX IF NOT EXISTS idx_cm_course  ON course_materials(course_code);
CREATE INDEX IF NOT EXISTS idx_cm_module  ON course_materials(course_code, module_number);
-- Question papers
CREATE INDEX IF NOT EXISTS idx_qp_course  ON question_papers(course_code);
CREATE INDEX IF NOT EXISTS idx_qp_faculty ON question_papers(generated_by);
CREATE INDEX IF NOT EXISTS idx_qp_status  ON question_papers(status);
CREATE INDEX IF NOT EXISTS idx_qp_selected ON question_papers(course_code, is_selected);
-- Exam marks format
CREATE INDEX IF NOT EXISTS idx_emf_type   ON exam_marks_format(exam_type);
CREATE INDEX IF NOT EXISTS idx_emf_dept   ON exam_marks_format(department);

-- ────────────────────────────────────────────────────────────────────
-- 30. VIEWS
-- ────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS student_attendance_summary CASCADE;
DROP VIEW IF EXISTS student_overall_attendance CASCADE;
DROP VIEW IF EXISTS faculty_course_summary CASCADE;
DROP VIEW IF EXISTS face_recognition_stats CASCADE;

-- Student attendance by subject (cumulative)
CREATE OR REPLACE VIEW student_attendance_summary AS
SELECT
  u.id,
  u.roll_no     AS student_id,
  u.full_name,
  u.department,
  u.section,
  u.year,
  u.semester    AS student_semester,
  a.subject_name,
  a.session_type,
  COUNT(a.id)                                        AS total_classes,
  COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS total_present,
  COUNT(CASE WHEN a.status = 'absent'  THEN 1 END)  AS total_absent,
  COUNT(CASE WHEN a.status = 'late'    THEN 1 END)  AS total_late,
  ROUND(
    100.0 * COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END)
    / NULLIF(COUNT(a.id), 0), 2)                     AS attendance_percentage
FROM users u
LEFT JOIN attendance a ON u.roll_no = a.roll_no
WHERE u.role = 'student'
GROUP BY u.id, u.roll_no, u.full_name, u.department, u.section,
         u.year, u.semester, a.subject_name, a.session_type;

-- Student overall attendance (aggregate all subjects)
CREATE OR REPLACE VIEW student_overall_attendance AS
SELECT
  u.id,
  u.roll_no,
  u.full_name,
  u.department,
  u.section,
  u.year,
  u.semester,
  COUNT(a.id) AS total_classes,
  COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS total_attended,
  ROUND(
    100.0 * COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END)
    / NULLIF(COUNT(a.id), 0), 2) AS overall_percentage,
  CASE
    WHEN ROUND(100.0 * COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) / NULLIF(COUNT(a.id), 0), 2) < 75 THEN 'SHORTAGE'
    WHEN ROUND(100.0 * COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) / NULLIF(COUNT(a.id), 0), 2) < 85 THEN 'WARNING'
    ELSE 'OK'
  END AS attendance_status
FROM users u
LEFT JOIN attendance a ON u.roll_no = a.roll_no
WHERE u.role = 'student'
GROUP BY u.id, u.roll_no, u.full_name, u.department, u.section, u.year, u.semester;

-- Faculty course summary (from assignments)
CREATE OR REPLACE VIEW faculty_course_summary AS
SELECT
  u.id          AS faculty_id,
  u.employee_id,
  u.full_name   AS faculty_name,
  u.department,
  COUNT(DISTINCT fa.subject_code) AS total_subjects,
  COUNT(DISTINCT fa.section)      AS total_sections,
  STRING_AGG(DISTINCT fa.subject_name, ', ') AS assigned_subjects
FROM users u
LEFT JOIN faculty_assignments fa ON u.username = fa.faculty_username AND fa.is_active = true
WHERE u.role = 'faculty'
GROUP BY u.id, u.employee_id, u.full_name, u.department;

-- Face recognition stats per department
CREATE OR REPLACE VIEW face_recognition_stats AS
SELECT
  u.department,
  COUNT(DISTINCT u.id) AS total_students,
  COUNT(DISTINCT fe.user_id) AS faces_registered,
  ROUND(100.0 * COUNT(DISTINCT fe.user_id) / NULLIF(COUNT(DISTINCT u.id), 0), 1) AS registration_pct
FROM users u
LEFT JOIN face_encodings fe ON u.id = fe.user_id
WHERE u.role = 'student'
GROUP BY u.department;

-- ────────────────────────────────────────────────────────────────────
-- 30. TRIGGERS
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at      ON users;
DROP TRIGGER IF EXISTS trg_courses_updated_at    ON courses;
DROP TRIGGER IF EXISTS trg_attendance_updated_at ON attendance;
DROP TRIGGER IF EXISTS trg_qr_sessions_updated_at ON qr_sessions;
DROP TRIGGER IF EXISTS trg_settings_updated_at   ON system_settings;

CREATE TRIGGER trg_users_updated_at      BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_courses_updated_at    BEFORE UPDATE ON courses         FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON attendance      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_qr_sessions_updated_at BEFORE UPDATE ON qr_sessions   FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_settings_updated_at   BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Prevent duplicate roll numbers
CREATE OR REPLACE FUNCTION check_unique_roll_no()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.roll_no IS NOT NULL AND NEW.roll_no != '' THEN
    IF EXISTS (SELECT 1 FROM users WHERE roll_no = NEW.roll_no AND id != COALESCE(NEW.id, gen_random_uuid())) THEN
      RAISE EXCEPTION 'Roll number % already exists', NEW.roll_no;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_unique_roll ON users;
CREATE TRIGGER trg_users_unique_roll BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION check_unique_roll_no();

-- ────────────────────────────────────────────────────────────────────
-- 31. SEED DATA
-- ────────────────────────────────────────────────────────────────────

-- Default admin user
INSERT INTO users (username, email, password_hash, full_name, role, department, is_active)
VALUES (
  'admin',
  'admin@smartams.local',
  'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
  'System Administrator',
  'admin',
  'Administration',
  true
) ON CONFLICT (username) DO NOTHING;

-- System settings
INSERT INTO system_settings (setting_key, setting_value, data_type, description, is_system) VALUES
  ('face_recognition_threshold',    '0.6',    'float',   'DLib face recognition confidence threshold (0-1)', true),
  ('qr_session_duration_minutes',   '5',      'int',     'QR code session validity in minutes', true),
  ('max_qr_scans_per_student',      '1',      'int',     'Max QR scans per student per session', true),
  ('attendance_percentage_threshold','75',     'float',   'Minimum attendance % required', false),
  ('attendance_percentage_warning',  '75',     'float',   'Warning threshold for attendance %', false),
  ('late_arrival_minutes',          '10',      'int',     'Minutes after start to mark as late', false),
  ('enable_face_recognition',       'true',    'boolean', 'Enable face recognition attendance', true),
  ('enable_qr_attendance',          'true',    'boolean', 'Enable QR code attendance', true),
  ('enable_liveness_detection',     'true',    'boolean', 'Enable liveness detection', true),
  ('university_name',               'PU College','string','University/College name', false),
  ('university_abbr',               'PUC',     'string',  'University abbreviation for emp_id generation', false)
ON CONFLICT (setting_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 32. DEPARTMENT SEED DATA (with 3-letter codes)
-- ════════════════════════════════════════════════════════════════════

-- CSE Department & Specializations
INSERT INTO departments (name, code, parent_code, programs) VALUES
  ('Computer Science & Engineering',           'CSE', NULL,  '[{"name":"B.Tech CSE","code":"CSE","batches":["CSE-A","CSE-B","CSE-C"],"semesters":8}]'),
  ('Artificial Intelligence & Machine Learning','AIM', 'CSE', '[{"name":"B.Tech AIML","code":"AIM","batches":["AIM-A","AIM-B"],"semesters":8}]'),
  ('Data Science',                              'ADS', 'CSE', '[{"name":"B.Tech DS","code":"ADS","batches":["ADS-A","ADS-B"],"semesters":8}]'),
  ('Cyber Security',                            'CBS', 'CSE', '[{"name":"B.Tech CBS","code":"CBS","batches":["CBS-A","CBS-B"],"semesters":8}]'),
  ('Internet of Things',                        'IOT', 'CSE', '[{"name":"B.Tech IoT","code":"IOT","batches":["IOT-A","IOT-B"],"semesters":8}]'),
  ('Cloud Computing',                           'CLC', 'CSE', '[{"name":"B.Tech CC","code":"CLC","batches":["CLC-A","CLC-B"],"semesters":8}]'),
  ('Full Stack Development',                    'FSD', 'CSE', '[{"name":"B.Tech FSD","code":"FSD","batches":["FSD-A","FSD-B"],"semesters":8}]'),
  ('Blockchain Technology',                     'BCT', 'CSE', '[{"name":"B.Tech BCT","code":"BCT","batches":["BCT-A"],"semesters":8}]'),
  ('Robotics & Automation',                     'RAT', 'CSE', '[{"name":"B.Tech RA","code":"RAT","batches":["RAT-A"],"semesters":8}]'),
  ('Big Data Analytics',                        'BDA', 'CSE', '[{"name":"B.Tech BDA","code":"BDA","batches":["BDA-A"],"semesters":8}]'),
  ('DevOps Engineering',                        'DVO', 'CSE', '[{"name":"B.Tech DevOps","code":"DVO","batches":["DVO-A"],"semesters":8}]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, programs = EXCLUDED.programs;

-- ECE Department & Specializations
INSERT INTO departments (name, code, parent_code, programs) VALUES
  ('Electronics & Communication Engineering',   'ECE', NULL,  '[{"name":"B.Tech ECE","code":"ECE","batches":["ECE-A","ECE-B","ECE-C"],"semesters":8}]'),
  ('VLSI Design',                               'VLS', 'ECE', '[{"name":"B.Tech VLSI","code":"VLS","batches":["VLS-A"],"semesters":8}]'),
  ('Embedded Systems',                          'EBS', 'ECE', '[{"name":"B.Tech ES","code":"EBS","batches":["EBS-A"],"semesters":8}]'),
  ('Signal Processing',                         'SGP', 'ECE', '[{"name":"B.Tech SP","code":"SGP","batches":["SGP-A"],"semesters":8}]'),
  ('Wireless Communication',                    'WLC', 'ECE', '[{"name":"B.Tech WC","code":"WLC","batches":["WLC-A"],"semesters":8}]'),
  ('Robotics (ECE)',                            'RBE', 'ECE', '[{"name":"B.Tech Robotics","code":"RBE","batches":["RBE-A"],"semesters":8}]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, programs = EXCLUDED.programs;

-- EEE Department & Specializations
INSERT INTO departments (name, code, parent_code, programs) VALUES
  ('Electrical & Electronics Engineering',      'EEE', NULL,  '[{"name":"B.Tech EEE","code":"EEE","batches":["EEE-A","EEE-B"],"semesters":8}]'),
  ('Power Systems',                             'PWS', 'EEE', '[{"name":"B.Tech PS","code":"PWS","batches":["PWS-A"],"semesters":8}]'),
  ('Control Systems',                           'CTS', 'EEE', '[{"name":"B.Tech CS","code":"CTS","batches":["CTS-A"],"semesters":8}]'),
  ('Electric Vehicles',                         'EVH', 'EEE', '[{"name":"B.Tech EV","code":"EVH","batches":["EVH-A"],"semesters":8}]'),
  ('Renewable Energy Systems',                  'RES', 'EEE', '[{"name":"B.Tech RES","code":"RES","batches":["RES-A"],"semesters":8}]'),
  ('Smart Grid Technology',                     'SGT', 'EEE', '[{"name":"B.Tech SGT","code":"SGT","batches":["SGT-A"],"semesters":8}]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, programs = EXCLUDED.programs;

-- Designing Department & Specializations
INSERT INTO departments (name, code, parent_code, programs) VALUES
  ('Graphic Design',                            'GRD', NULL, '[{"name":"B.Des Graphic","code":"GRD","batches":["GRD-A"],"semesters":8}]'),
  ('UI/UX Design',                              'UIX', NULL, '[{"name":"B.Des UI/UX","code":"UIX","batches":["UIX-A"],"semesters":8}]'),
  ('Animation & VFX',                           'AVX', NULL, '[{"name":"B.Des Animation","code":"AVX","batches":["AVX-A"],"semesters":8}]'),
  ('Game Design & Development',                 'GMD', NULL, '[{"name":"B.Des Game","code":"GMD","batches":["GMD-A"],"semesters":8}]'),
  ('Fashion Design',                            'FDN', NULL, '[{"name":"B.Des Fashion","code":"FDN","batches":["FDN-A"],"semesters":8}]'),
  ('Interior Design',                           'ITD', NULL, '[{"name":"B.Des Interior","code":"ITD","batches":["ITD-A"],"semesters":8}]'),
  ('Textile Design',                            'TXD', NULL, '[{"name":"B.Des Textile","code":"TXD","batches":["TXD-A"],"semesters":8}]'),
  ('Film & Television Production',              'FTV', NULL, '[{"name":"B.Des Film","code":"FTV","batches":["FTV-A"],"semesters":8}]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, programs = EXCLUDED.programs;

-- MBA Department & Specializations
INSERT INTO departments (name, code, parent_code, programs) VALUES
  ('MBA General',                               'MBA', NULL,  '[{"name":"MBA General","code":"MBA","batches":["MBA-A","MBA-B"],"semesters":4}]'),
  ('MBA Finance',                               'MBF', 'MBA', '[{"name":"MBA Finance","code":"MBF","batches":["MBF-A"],"semesters":4}]'),
  ('MBA Human Resource Management',             'MBH', 'MBA', '[{"name":"MBA HRM","code":"MBH","batches":["MBH-A"],"semesters":4}]'),
  ('MBA Marketing',                             'MBM', 'MBA', '[{"name":"MBA Marketing","code":"MBM","batches":["MBM-A"],"semesters":4}]'),
  ('MBA Business Analytics',                    'MBB', 'MBA', '[{"name":"MBA Analytics","code":"MBB","batches":["MBB-A"],"semesters":4}]'),
  ('MBA Operations Management',                 'MBO', 'MBA', '[{"name":"MBA Operations","code":"MBO","batches":["MBO-A"],"semesters":4}]'),
  ('MBA International Business',                'MBI', 'MBA', '[{"name":"MBA IB","code":"MBI","batches":["MBI-A"],"semesters":4}]'),
  ('MBA Entrepreneurship & Innovation',         'MBE', 'MBA', '[{"name":"MBA E&I","code":"MBE","batches":["MBE-A"],"semesters":4}]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, programs = EXCLUDED.programs;

-- BBA Department & Specializations
INSERT INTO departments (name, code, parent_code, programs) VALUES
  ('BBA General',                               'BBA', NULL,  '[{"name":"BBA General","code":"BBA","batches":["BBA-A","BBA-B"],"semesters":6}]'),
  ('BBA Finance',                               'BBF', 'BBA', '[{"name":"BBA Finance","code":"BBF","batches":["BBF-A"],"semesters":6}]'),
  ('BBA Marketing',                             'BBM', 'BBA', '[{"name":"BBA Marketing","code":"BBM","batches":["BBM-A"],"semesters":6}]'),
  ('BBA Human Resource Management',             'BBH', 'BBA', '[{"name":"BBA HRM","code":"BBH","batches":["BBH-A"],"semesters":6}]'),
  ('BBA International Business',                'BBI', 'BBA', '[{"name":"BBA IB","code":"BBI","batches":["BBI-A"],"semesters":6}]'),
  ('BBA Entrepreneurship',                      'BBE', 'BBA', '[{"name":"BBA Entrepreneurship","code":"BBE","batches":["BBE-A"],"semesters":6}]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, parent_code = EXCLUDED.parent_code, programs = EXCLUDED.programs;
