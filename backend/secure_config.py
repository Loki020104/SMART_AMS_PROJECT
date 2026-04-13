"""
Secure Configuration Module
Manages environment variables, secrets, and security settings
"""

import os
from pathlib import Path
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

class SecureConfig:
    """
    Centralized configuration management for secure deployment
    Loads from environment variables with validation
    """
    
    # Load environment variables
    _env_file = Path(__file__).parent.parent / ".env"
    if _env_file.exists():
        load_dotenv(_env_file)
    
    # ══════════════════════════════════════════════════════════════════
    # APPLICATION SETTINGS
    # ══════════════════════════════════════════════════════════════════
    
    # Flask configuration
    DEBUG = os.getenv("DEBUG", "False").lower() == "true"  # NEVER True in production
    TESTING = os.getenv("TESTING", "False").lower() == "true"
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")  # development, staging, production
    
    # Application
    APP_NAME = os.getenv("APP_NAME", "SMART-AMS")
    APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
    SECRET_KEY = os.getenv("SECRET_KEY", None)
    
    # ══════════════════════════════════════════════════════════════════
    # SECURITY SETTINGS
    # ══════════════════════════════════════════════════════════════════
    
    # HTTPS/SSL
    HTTPS_ONLY = os.getenv("HTTPS_ONLY", "true").lower() == "true"
    SSL_REDIRECT = os.getenv("SSL_REDIRECT", "true").lower() == "true"
    HSTS_ENABLED = os.getenv("HSTS_ENABLED", "true").lower() == "true"
    HSTS_MAX_AGE = int(os.getenv("HSTS_MAX_AGE", "31536000"))  # 1 year
    
    # Security Headers
    X_FRAME_OPTIONS = os.getenv("X_FRAME_OPTIONS", "DENY")
    X_CONTENT_TYPE_OPTIONS = os.getenv("X_CONTENT_TYPE_OPTIONS", "nosniff")
    X_XSS_PROTECTION = os.getenv("X_XSS_PROTECTION", "1; mode=block")
    CONTENT_SECURITY_POLICY = os.getenv(
        "CONTENT_SECURITY_POLICY",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    )
    
    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "").split(",") or ["http://localhost:3000"]
    CORS_ALLOW_CREDENTIALS = os.getenv("CORS_ALLOW_CREDENTIALS", "true").lower() == "true"
    
    # Rate Limiting
    RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    RATE_LIMIT_STORAGE_URL = os.getenv("RATE_LIMIT_STORAGE_URL", "memory://")
    RATELIMIT_LOGIN_ATTEMPTS = int(os.getenv("RATELIMIT_LOGIN_ATTEMPTS", "5"))
    RATELIMIT_LOGIN_WINDOW = int(os.getenv("RATELIMIT_LOGIN_WINDOW", "900"))  # 15 minutes
    RATELIMIT_API_CALLS = int(os.getenv("RATELIMIT_API_CALLS", "100"))
    RATELIMIT_API_WINDOW = int(os.getenv("RATELIMIT_API_WINDOW", "60"))  # 1 minute
    
    # Session
    SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true"
    SESSION_COOKIE_HTTPONLY = os.getenv("SESSION_COOKIE_HTTPONLY", "true").lower() == "true"
    SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT", "3600"))  # 1 hour
    
    # ══════════════════════════════════════════════════════════════════
    # DATABASE SETTINGS
    # ══════════════════════════════════════════════════════════════════
    
    # Supabase (PostgreSQL)
    SUPABASE_URL = os.getenv("SUPABASE_URL", None)
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", None)
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", None)
    
    # Database Connection
    DB_CONNECTION_TIMEOUT = int(os.getenv("DB_CONNECTION_TIMEOUT", "30"))
    DB_CONNECTION_POOL_SIZE = int(os.getenv("DB_CONNECTION_POOL_SIZE", "10"))
    DB_STATEMENT_TIMEOUT = int(os.getenv("DB_STATEMENT_TIMEOUT", "30000"))  # milliseconds
    
    # Restrict database access to internal network only
    DB_ALLOWED_IPS = os.getenv("DB_ALLOWED_IPS", "").split(",") or []  # e.g., "10.0.0.0/8,172.16.0.0/12"
    DB_ENFORCE_SSL = os.getenv("DB_ENFORCE_SSL", "true").lower() == "true"
    
    # ══════════════════════════════════════════════════════════════════
    # AUTHENTICATION & AUTHORIZATION
    # ══════════════════════════════════════════════════════════════════
    
    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", None)
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", "900"))  # 15 minutes
    JWT_REFRESH_TOKEN_EXPIRES = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES", "604800"))  # 7 days
    
    # Password
    PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", "12"))
    PASSWORD_REQUIRE_UPPERCASE = os.getenv("PASSWORD_REQUIRE_UPPERCASE", "true").lower() == "true"
    PASSWORD_REQUIRE_LOWERCASE = os.getenv("PASSWORD_REQUIRE_LOWERCASE", "true").lower() == "true"
    PASSWORD_REQUIRE_NUMBERS = os.getenv("PASSWORD_REQUIRE_NUMBERS", "true").lower() == "true"
    PASSWORD_REQUIRE_SPECIAL = os.getenv("PASSWORD_REQUIRE_SPECIAL", "true").lower() == "true"
    PASSWORD_EXPIRY_DAYS = int(os.getenv("PASSWORD_EXPIRY_DAYS", "90"))
    
    # ══════════════════════════════════════════════════════════════════
    # LOGGING & MONITORING
    # ══════════════════════════════════════════════════════════════════
    
    # Logging
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT = os.getenv("LOG_FORMAT", "json")  # json or text
    LOG_FILE = os.getenv("LOG_FILE", "/var/log/ams/application.log")
    LOG_MAX_SIZE = int(os.getenv("LOG_MAX_SIZE", "10485760"))  # 10MB
    LOG_BACKUP_COUNT = int(os.getenv("LOG_BACKUP_COUNT", "10"))
    
    # Security Logging
    SECURITY_LOG_FILE = os.getenv("SECURITY_LOG_FILE", "/var/log/ams/security.log")
    AUTH_LOG_FILE = os.getenv("AUTH_LOG_FILE", "/var/log/ams/auth.log")
    AUDIT_LOG_FILE = os.getenv("AUDIT_LOG_FILE", "/var/log/ams/audit.log")
    
    # Monitoring
    MONITOR_ENABLED = os.getenv("MONITOR_ENABLED", "true").lower() == "true"
    MONITOR_INTERVAL = int(os.getenv("MONITOR_INTERVAL", "60"))  # seconds
    ALERT_ON_FAILED_AUTHS = os.getenv("ALERT_ON_FAILED_AUTHS", "true").lower() == "true"
    FAILED_AUTH_THRESHOLD = int(os.getenv("FAILED_AUTH_THRESHOLD", "10"))  # per hour
    ALERT_ON_RATE_LIMIT = os.getenv("ALERT_ON_RATE_LIMIT", "true").lower() == "true"
    RATE_LIMIT_THRESHOLD = int(os.getenv("RATE_LIMIT_THRESHOLD", "50"))  # per minute
    ALERT_ON_UNUSUAL_ACTIVITY = os.getenv("ALERT_ON_UNUSUAL_ACTIVITY", "true").lower() == "true"
    
    # ══════════════════════════════════════════════════════════════════
    # CLOUD & DEPLOYMENT
    # ══════════════════════════════════════════════════════════════════
    
    # Cloud Services
    FIREBASE_CONFIG = os.getenv("FIREBASE_CONFIG", None)
    FIRESTORE_ENABLED = os.getenv("FIRESTORE_ENABLED", "false").lower() == "true"
    RTDB_ENABLED = os.getenv("RTDB_ENABLED", "false").lower() == "true"
    
    # Deployment
    DEPLOYMENT_ENVIRONMENT = os.getenv("DEPLOYMENT_ENVIRONMENT", "local")  # local, docker, cloud-run, k8s
    PORT = int(os.getenv("PORT", "8080"))
    HOST = os.getenv("HOST", "0.0.0.0")
    WORKERS = int(os.getenv("WORKERS", "4"))
    
    # ══════════════════════════════════════════════════════════════════
    # VALIDATION METHODS
    # ══════════════════════════════════════════════════════════════════
    
    @classmethod
    def validate(cls):
        """Validate critical configuration for production"""
        errors = []
        
        # Production checks
        if cls.ENVIRONMENT == "production":
            if cls.DEBUG:
                errors.append("❌ DEBUG cannot be True in production")
            
            if not cls.SECRET_KEY:
                errors.append("❌ SECRET_KEY must be set in production")
            
            if not cls.JWT_SECRET_KEY:
                errors.append("❌ JWT_SECRET_KEY must be set in production")
            
            if not cls.SUPABASE_URL:
                errors.append("❌ SUPABASE_URL must be set in production")
            
            if not cls.SUPABASE_KEY:
                errors.append("❌ SUPABASE_KEY must be set in production")
            
            if not cls.HTTPS_ONLY:
                errors.append("⚠️  HTTPS_ONLY should be True in production")
            
            if not cls.HSTS_ENABLED:
                errors.append("⚠️  HSTS_ENABLED should be True in production")
        
        # General validation
        if cls.PASSWORD_MIN_LENGTH < 12:
            errors.append("⚠️  PASSWORD_MIN_LENGTH should be at least 12")
        
        if cls.SESSION_COOKIE_SECURE == False and cls.ENVIRONMENT == "production":
            errors.append("❌ SESSION_COOKIE_SECURE must be True in production")
        
        return errors
    
    @classmethod
    def log_config(cls):
        """Log current configuration (safe to display)"""
        config_summary = {
            "environment": cls.ENVIRONMENT,
            "https_only": cls.HTTPS_ONLY,
            "debugging": cls.DEBUG,
            "rate_limiting": cls.RATE_LIMIT_ENABLED,
            "hsts_enabled": cls.HSTS_ENABLED,
            "monitoring": cls.MONITOR_ENABLED,
            "log_level": cls.LOG_LEVEL,
        }
        logger.info(f"Configuration loaded: {config_summary}")
        return config_summary


# Validate configuration on module import
_errors = SecureConfig.validate()
if _errors:
    for error in _errors:
        logger.warning(error)
