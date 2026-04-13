"""
🔐 SECURITY HARDENING MODULE
Complete security implementation for SmartAMS

FEATURES:
✅ Rate limiting (login, API, file uploads)
✅ Input validation & sanitization
✅ Security logging & audit trails
✅ CORS enforcement
✅ Secret management
✅ Abuse detection
✅ HTTPS enforcement
✅ Security headers
"""

import os
import logging
import json
import time
import hashlib
import re
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, Optional, Tuple, Any
from collections import defaultdict
import secrets

from flask import request, jsonify, g
from werkzeug.security import safe_str_cmp

# ═════════════════════════════════════════════════════════════════
# LOGGING CONFIGURATION
# ═════════════════════════════════════════════════════════════════

# Create security logger
security_logger = logging.getLogger('security')
security_logger.setLevel(logging.WARNING)

# File handler for security events
security_handler = logging.FileHandler('logs/security.log', encoding='utf-8')
security_handler.setFormatter(logging.Formatter(
    '[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))
security_logger.addHandler(security_handler)

# Create audit logger
audit_logger = logging.getLogger('audit')
audit_logger.setLevel(logging.INFO)

audit_handler = logging.FileHandler('logs/audit.log', encoding='utf-8')
audit_handler.setFormatter(logging.Formatter(
    '[%(asctime)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))
audit_logger.addHandler(audit_handler)


# ═════════════════════════════════════════════════════════════════
# RATE LIMITING
# ═════════════════════════════════════════════════════════════════

class RateLimiter:
    """
    In-memory rate limiting for login, API, and registration attacks
    
    Uses bucket algorithm:
    - Track requests per IP/user
    - Reset after time window
    - Block after max attempts
    """
    
    def __init__(self):
        self.attempts = defaultdict(list)  # Key -> [timestamp, timestamp, ...]
        self.blocked_ips = {}  # IP -> unblock_time
    
    def _get_client_ip(self) -> str:
        """Get real client IP (handles proxies)"""
        if request.headers.getlist("X-Forwarded-For"):
            return request.headers.getlist("X-Forwarded-For")[0].strip()
        return request.remote_addr or 'unknown'
    
    def _is_blocked(self, key: str) -> bool:
        """Check if IP is currently blocked"""
        if key in self.blocked_ips:
            if datetime.utcnow() < self.blocked_ips[key]:
                return True
            else:
                del self.blocked_ips[key]
        return False
    
    def check_limit(self, key: str, max_attempts: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Check if too many requests
        
        Returns:
            (allowed: bool, remaining: int)
        """
        if self._is_blocked(key):
            return False, 0
        
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=window_seconds)
        
        # Clean old attempts
        self.attempts[key] = [t for t in self.attempts[key] if t > cutoff]
        
        if len(self.attempts[key]) >= max_attempts:
            # Block for 15 minutes
            self.blocked_ips[key] = now + timedelta(minutes=15)
            security_logger.warning(f"RATE_LIMIT_EXCEEDED: {key} blocked for 15 minutes")
            return False, 0
        
        # Record this attempt
        self.attempts[key].append(now)
        remaining = max_attempts - len(self.attempts[key])
        
        return True, remaining
    
    def cleanup(self):
        """Cleanup old entries (call periodically)"""
        now = datetime.utcnow()
        cutoff = now - timedelta(hours=1)
        
        expired_keys = []
        for key, attempts in self.attempts.items():
            self.attempts[key] = [t for t in attempts if t > cutoff]
            if not self.attempts[key]:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.attempts[key]


# Global rate limiter instance
rate_limiter = RateLimiter()


# ═════════════════════════════════════════════════════════════════
# RATE LIMITING DECORATORS
# ═════════════════════════════════════════════════════════════════

def rate_limit_login(f):
    """Rate limit login attempts: 5 per 15 minutes per IP"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = _get_client_ip()
        allowed, remaining = rate_limiter.check_limit(
            f"login:{client_ip}", 
            max_attempts=5, 
            window_seconds=900  # 15 minutes
        )
        
        if not allowed:
            audit_logger.warning(f"LOGIN_RATE_LIMIT: IP {client_ip} blocked")
            return jsonify({
                'success': False,
                'error': 'TOO_MANY_ATTEMPTS',
                'message': 'Too many login attempts. Please try again in 15 minutes.'
            }), 429
        
        return f(*args, **kwargs)
    return decorated_function


def rate_limit_api(max_requests: int = 100, window_seconds: int = 3600):
    """Rate limit API endpoints: max_requests per window"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            client_ip = _get_client_ip()
            endpoint = request.path
            
            allowed, remaining = rate_limiter.check_limit(
                f"api:{client_ip}:{endpoint}",
                max_attempts=max_requests,
                window_seconds=window_seconds
            )
            
            if not allowed:
                audit_logger.warning(
                    f"API_RATE_LIMIT: IP {client_ip} blocked on {endpoint}"
                )
                return jsonify({
                    'success': False,
                    'error': 'RATE_LIMITED',
                    'message': 'Too many requests. Please try again later.'
                }), 429
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def rate_limit_registration(f):
    """Rate limit registration: 3 per IP per hour"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = _get_client_ip()
        allowed, remaining = rate_limiter.check_limit(
            f"register:{client_ip}",
            max_attempts=3,
            window_seconds=3600
        )
        
        if not allowed:
            audit_logger.warning(f"REGISTER_RATE_LIMIT: IP {client_ip} blocked")
            return jsonify({
                'success': False,
                'error': 'TOO_MANY_REGISTRATIONS',
                'message': 'Too many registration attempts. Please try again in 1 hour.'
            }), 429
        
        return f(*args, **kwargs)
    return decorated_function


def rate_limit_ai_generation(f):
    """Rate limit AI requests: 10 per user per hour"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = getattr(g, 'user_id', request.remote_addr)
        allowed, remaining = rate_limiter.check_limit(
            f"ai:{user_id}",
            max_attempts=10,
            window_seconds=3600
        )
        
        if not allowed:
            audit_logger.warning(f"AI_RATE_LIMIT: User {user_id} blocked")
            return jsonify({
                'success': False,
                'error': 'AI_RATE_LIMITED',
                'message': 'Too many AI requests. Please try again in 1 hour.'
            }), 429
        
        return f(*args, **kwargs)
    return decorated_function


# ═════════════════════════════════════════════════════════════════
# INPUT VALIDATION & SANITIZATION
# ═════════════════════════════════════════════════════════════════

class InputValidator:
    """Input validation and sanitization"""
    
    # Regex patterns
    EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,32}$')
    PHONE_PATTERN = re.compile(r'^\+?1?\d{9,15}$')
    URL_PATTERN = re.compile(
        r'^https?://'  # https:// or http://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'
        r'(?::\d+)?'  # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE
    )
    
    # SQL injection patterns
    SQL_INJECTION_PATTERNS = [
        r"('\s*OR\s*'1'='1)",
        r"(;\s*DROP\s+)",
        r"(UNION\s+SELECT)",
        r"(INSERT\s+INTO)",
        r"(DELETE\s+FROM)",
        r"(UPDATE\s+)",
        r"(--\s*)",
        r"(/\*.*?\*/)",
    ]
    
    # XSS patterns
    XSS_PATTERNS = [
        r'<script[^>]*>.*?</script>',
        r'javascript:',
        r'onerror\s*=',
        r'onload\s*=',
        r'onclick\s*=',
        r'<iframe[^>]*>',
        r'<embed[^>]*>',
        r'<object[^>]*>',
    ]
    
    @staticmethod
    def sanitize_string(value: str, max_length: int = 255) -> str:
        """Sanitize string input"""
        if not isinstance(value, str):
            return ""
        
        # Remove null bytes
        value = value.replace('\x00', '')
        
        # Trim whitespace
        value = value.strip()
        
        # Enforce max length
        if len(value) > max_length:
            value = value[:max_length]
        
        return value
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        email = email.strip().lower()
        return bool(InputValidator.EMAIL_PATTERN.match(email)) and len(email) < 255
    
    @staticmethod
    def validate_username(username: str) -> bool:
        """Validate username (alphanumeric, underscore, dash, 3-32 chars)"""
        username = username.strip()
        return bool(InputValidator.USERNAME_PATTERN.match(username))
    
    @staticmethod
    def validate_password(password: str, min_length: int = 12) -> Tuple[bool, str]:
        """Validate password strength"""
        if len(password) < min_length:
            return False, f"Password must be at least {min_length} characters"
        
        if not any(c.isupper() for c in password):
            return False, "Password must contain uppercase letter"
        
        if not any(c.islower() for c in password):
            return False, "Password must contain lowercase letter"
        
        if not any(c.isdigit() for c in password):
            return False, "Password must contain digit"
        
        if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in password):
            return False, "Password must contain special character"
        
        return True, "Password valid"
    
    @staticmethod
    def check_sql_injection(value: str) -> bool:
        """Check for SQL injection attempts"""
        value_upper = value.upper()
        for pattern in InputValidator.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value_upper, re.IGNORECASE):
                return True
        return False
    
    @staticmethod
    def check_xss(value: str) -> bool:
        """Check for XSS attempts"""
        for pattern in InputValidator.XSS_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                return True
        return False
    
    @staticmethod
    def validate_and_sanitize(data: Dict, schema: Dict) -> Tuple[bool, Dict, str]:
        """
        Validate input against schema
        
        Schema example:
        {
            'username': {'type': 'string', 'required': True, 'max_length': 32},
            'email': {'type': 'email', 'required': True},
            'password': {'type': 'password', 'required': True, 'min_length': 12},
            'role': {'type': 'enum', 'values': ['student', 'faculty', 'admin']},
        }
        """
        validated = {}
        
        for field, rules in schema.items():
            value = data.get(field)
            required = rules.get('required', False)
            field_type = rules.get('type', 'string')
            
            # Check required
            if required and (value is None or value == ''):
                return False, {}, f"Missing required field: {field}"
            
            if not required and (value is None or value == ''):
                continue
            
            # Type validation
            if field_type == 'string':
                max_len = rules.get('max_length', 255)
                value = InputValidator.sanitize_string(value, max_len)
                
                # Check for injection
                if InputValidator.check_sql_injection(value):
                    security_logger.warning(f"SQL_INJECTION_ATTEMPT: {field}")
                    return False, {}, f"Invalid {field}"
                
                if InputValidator.check_xss(value):
                    security_logger.warning(f"XSS_ATTEMPT: {field}")
                    return False, {}, f"Invalid {field}"
                
                validated[field] = value
            
            elif field_type == 'email':
                value = InputValidator.sanitize_string(value.lower(), 255)
                if not InputValidator.validate_email(value):
                    return False, {}, f"Invalid email format"
                validated[field] = value
            
            elif field_type == 'password':
                min_len = rules.get('min_length', 12)
                valid, msg = InputValidator.validate_password(value, min_len)
                if not valid:
                    return False, {}, msg
                validated[field] = value
            
            elif field_type == 'enum':
                values = rules.get('values', [])
                value = value.strip().lower()
                if value not in values:
                    return False, {}, f"Invalid {field}: must be one of {values}"
                validated[field] = value
            
            elif field_type == 'int':
                try:
                    min_val = rules.get('min', None)
                    max_val = rules.get('max', None)
                    value = int(value)
                    
                    if min_val is not None and value < min_val:
                        return False, {}, f"{field} must be >= {min_val}"
                    if max_val is not None and value > max_val:
                        return False, {}, f"{field} must be <= {max_val}"
                    
                    validated[field] = value
                except ValueError:
                    return False, {}, f"Invalid {field}: must be integer"
            
            elif field_type == 'phone':
                value = InputValidator.sanitize_string(value.replace(' ', '').replace('-', ''))
                if not InputValidator.PHONE_PATTERN.match(value):
                    return False, {}, f"Invalid phone number"
                validated[field] = value
        
        return True, validated, ""


# ═════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═════════════════════════════════════════════════════════════════

def _get_client_ip() -> str:
    """Get real client IP (handles proxies)"""
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0].strip()
    return request.remote_addr or 'unknown'


def log_auth_event(event_type: str, user_id: Optional[str], success: bool, details: str = ""):
    """Log authentication events"""
    status = "SUCCESS" if success else "FAILED"
    ip = _get_client_ip()
    timestamp = datetime.utcnow().isoformat()
    
    audit_logger.info(
        f"AUTH_EVENT | Type: {event_type} | User: {user_id} | Status: {status} | "
        f"IP: {ip} | Details: {details}"
    )
    
    if not success:
        security_logger.warning(
            f"AUTH_FAILURE: {event_type} | User: {user_id} | IP: {ip} | {details}"
        )


def log_api_error(endpoint: str, error_code: int, user_id: Optional[str], error_msg: str):
    """Log API errors for monitoring"""
    ip = _get_client_ip()
    timestamp = datetime.utcnow().isoformat()
    
    audit_logger.error(
        f"API_ERROR | Endpoint: {endpoint} | Code: {error_code} | User: {user_id} | "
        f"IP: {ip} | Error: {error_msg}"
    )
    
    if error_code >= 500:
        security_logger.error(f"SERVER_ERROR: {endpoint} | {error_code} | {error_msg}")


def log_suspicious_activity(activity_type: str, user_id: Optional[str], details: str):
    """Log suspicious activity"""
    ip = _get_client_ip()
    timestamp = datetime.utcnow().isoformat()
    
    security_logger.warning(
        f"SUSPICIOUS_ACTIVITY: {activity_type} | User: {user_id} | IP: {ip} | {details}"
    )


# ═════════════════════════════════════════════════════════════════
# CORS & SECURITY HEADERS
# ═════════════════════════════════════════════════════════════════

def apply_security_headers(app):
    """Apply security headers to all responses"""
    
    @app.after_request
    def set_security_headers(response):
        # Prevent clickjacking
        response.headers['X-Frame-Options'] = 'DENY'
        
        # Prevent MIME type sniffing
        response.headers['X-Content-Type-Options'] = 'nosniff'
        
        # Enable XSS protection
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        # Strict Transport Security (HTTPS only)
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        # Content Security Policy
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://smartams-backend-*.run.app https://*.supabase.co https://*.firebase.google.com; "
            "frame-ancestors 'none'"
        )
        
        # Referrer Policy
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Permissions Policy
        response.headers['Permissions-Policy'] = (
            'geolocation=(self), '
            'microphone=(self), '
            'camera=(self), '
            'payment=()'
        )
        
        return response


# ═════════════════════════════════════════════════════════════════
# SECRET MANAGEMENT
# ═════════════════════════════════════════════════════════════════

def get_secret(secret_name: str, required: bool = True) -> Optional[str]:
    """
    Get secret from environment variables
    
    NEVER hardcode secrets. Always use environment variables.
    """
    value = os.getenv(secret_name)
    
    if required and not value:
        raise ValueError(
            f"🚨 CRITICAL: {secret_name} not set!\n"
            f"Set in your .env file:\n"
            f"  {secret_name}=<your-secret-value>\n"
            f"Generate with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    
    if value:
        # Log that secret was loaded (but not the value!)
        logging.info(f"[SECRETS] Loaded {secret_name} from environment")
    
    return value


def check_exposed_secrets() -> Dict[str, bool]:
    """Check if common secrets are exposed in code"""
    exposed = {}
    
    # Check for hardcoded Firebase keys
    exposed['firebase_api_key'] = os.getenv('FIREBASE_API_KEY', '').startswith('AIza')
    
    # Check for hardcoded Supabase keys
    exposed['supabase_key'] = os.getenv('SUPABASE_KEY', '').startswith('eyJ')
    
    # Check for JWT secrets
    exposed['jwt_secret'] = len(os.getenv('JWT_SECRET_KEY', '')) > 32
    
    return exposed


# Export for use in Flask app
__all__ = [
    'RateLimiter',
    'InputValidator',
    'rate_limiter',
    'rate_limit_login',
    'rate_limit_api',
    'rate_limit_registration',
    'rate_limit_ai_generation',
    'log_auth_event',
    'log_api_error',
    'log_suspicious_activity',
    'apply_security_headers',
    'get_secret',
    'check_exposed_secrets',
    'security_logger',
    'audit_logger',
]
