-- ========================================================================
-- 🔐 SECURITY ENHANCEMENTS - Schema Update
-- Email Verification & Session Management
-- Date: March 2026
-- ========================================================================

-- ────────────────────────────────────────────────────────────────────
-- 1. ADD EMAIL VERIFICATION SUPPORT
-- ────────────────────────────────────────────────────────────────────

-- Add email verification columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_attempts INTEGER DEFAULT 0;

-- Create email verification tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_verify_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verify_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verify_tokens_expires ON email_verification_tokens(expires_at);

-- ────────────────────────────────────────────────────────────────────
-- 2. PASSWORD SECURITY IMPROVEMENTS
-- ────────────────────────────────────────────────────────────────────

-- Add password history tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_last_reset_at TIMESTAMPTZ;

-- Create password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- ────────────────────────────────────────────────────────────────────
-- 3. LOGIN ATTEMPT TRACKING & RATE LIMITING
-- ────────────────────────────────────────────────────────────────────

-- Track login attempts for rate limiting
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(100),
    attempted_at TIMESTAMPTZ DEFAULT now(),
    success BOOLEAN DEFAULT false,
    ip_address VARCHAR(50),
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_login_attempts_tried_at ON login_attempts(attempted_at);

-- ────────────────────────────────────────────────────────────────────
-- 4. SESSION MANAGEMENT
-- ────────────────────────────────────────────────────────────────────

-- Track active sessions
CREATE TABLE IF NOT EXISTS active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON active_sessions(expires_at);

-- ────────────────────────────────────────────────────────────────────
-- 5. SECURITY AUDIT LOG
-- ────────────────────────────────────────────────────────────────────

-- Track security events for audit
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    event_description TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    status VARCHAR(50), -- 'success', 'failure', 'suspicious'
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON security_audit_log(created_at);

-- ────────────────────────────────────────────────────────────────────
-- 6. ENSURE PASSWORD_HASH IS VARCHAR (NOT HASHED WITH OLD METHOD)
-- ────────────────────────────────────────────────────────────────────

-- Check and fix password_hash column type if needed
-- Note: In Supabase PostgreSQL, this should already be VARCHAR(255)
-- This is just for verification

-- ========================================================================
-- CLEANUP & VERIFICATION
-- ========================================================================

-- Verify the schema changes:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'users' 
-- ORDER BY ordinal_position;

-- Verify email_verified is a boolean:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'users' AND column_name = 'email_verified';

-- ========================================================================
-- END OF SECURITY SCHEMA UPDATE
-- ========================================================================
--
-- CHANGES SUMMARY:
-- ✓ Added email_verified boolean to require email verification
-- ✓ Created email verification tokens table (2-hour expiry)
-- ✓ Created password reset tokens table (2-hour expiry)
-- ✓ Added login attempt tracking for rate limiting
-- ✓ Added session management table
-- ✓ Added security audit log for compliance & monitoring
-- 
-- NEXT STEPS:
-- 1. Update backend code to implement email verification
-- 2. Implement rate limiting with login_attempts table
-- 3. Implement session revocation
-- 4. Set up monitoring on security_audit_log table
