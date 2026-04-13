"""
Comprehensive Security Logging Module
Logs authentication, API errors, suspicious activity, and audit trails
"""

import logging
import logging.handlers
import json
from datetime import datetime
from pathlib import Path
from functools import wraps
import time

from backend.secure_config import SecureConfig


class JSONFormatter(logging.Formatter):
    """Format logs as JSON for better parsing and monitoring"""
    
    def format(self, record):
        """Convert log record to JSON"""
        log_obj = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add extra fields if present
        if hasattr(record, "extra"):
            log_obj.update(record.extra)
        
        return json.dumps(log_obj)


def setup_logging():
    """
    Configure all loggers for secure deployment
    Creates separate logs for different security concerns
    """
    
    # Create log directory if needed
    log_dir = Path(SecureConfig.LOG_FILE).parent
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine formatter based on config
    if SecureConfig.LOG_FORMAT == "json":
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
    
    # ══════════════════════════════════════════════════════════════════
    # 1. ROOT LOGGER (Application logs)
    # ══════════════════════════════════════════════════════════════════
    
    root_logger = logging.getLogger()
    root_logger.setLevel(SecureConfig.LOG_LEVEL)
    
    # File handler for application logs
    app_fh = logging.handlers.RotatingFileHandler(
        SecureConfig.LOG_FILE,
        maxBytes=SecureConfig.LOG_MAX_SIZE,
        backupCount=SecureConfig.LOG_BACKUP_COUNT
    )
    app_fh.setLevel(SecureConfig.LOG_LEVEL)
    app_fh.setFormatter(formatter)
    root_logger.addHandler(app_fh)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(SecureConfig.LOG_LEVEL)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # ══════════════════════════════════════════════════════════════════
    # 2. AUTHENTICATION LOGGER
    # ══════════════════════════════════════════════════════════════════
    
    auth_logger = logging.getLogger("security.auth")
    auth_logger.setLevel(logging.INFO)
    
    auth_fh = logging.handlers.RotatingFileHandler(
        SecureConfig.AUTH_LOG_FILE,
        maxBytes=SecureConfig.LOG_MAX_SIZE,
        backupCount=SecureConfig.LOG_BACKUP_COUNT
    )
    auth_fh.setLevel(logging.INFO)
    auth_fh.setFormatter(formatter)
    auth_logger.addHandler(auth_fh)
    auth_logger.propagate = False
    
    # ══════════════════════════════════════════════════════════════════
    # 3. SECURITY LOGGER
    # ══════════════════════════════════════════════════════════════════
    
    security_logger = logging.getLogger("security")
    security_logger.setLevel(logging.INFO)
    
    security_fh = logging.handlers.RotatingFileHandler(
        SecureConfig.SECURITY_LOG_FILE,
        maxBytes=SecureConfig.LOG_MAX_SIZE,
        backupCount=SecureConfig.LOG_BACKUP_COUNT
    )
    security_fh.setLevel(logging.INFO)
    security_fh.setFormatter(formatter)
    security_logger.addHandler(security_fh)
    security_logger.propagate = False
    
    # ══════════════════════════════════════════════════════════════════
    # 4. AUDIT LOGGER
    # ══════════════════════════════════════════════════════════════════
    
    audit_logger = logging.getLogger("audit")
    audit_logger.setLevel(logging.INFO)
    
    audit_fh = logging.handlers.RotatingFileHandler(
        SecureConfig.AUDIT_LOG_FILE,
        maxBytes=SecureConfig.LOG_MAX_SIZE,
        backupCount=SecureConfig.LOG_BACKUP_COUNT
    )
    audit_fh.setLevel(logging.INFO)
    audit_fh.setFormatter(formatter)
    audit_logger.addHandler(audit_fh)
    audit_logger.propagate = False
    
    return {
        "root": root_logger,
        "auth": auth_logger,
        "security": security_logger,
        "audit": audit_logger,
    }


# Initialize loggers
LOGGERS = setup_logging()


# ══════════════════════════════════════════════════════════════════════════════
# LOGGING FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def log_authentication_attempt(username, status, reason="", ip_address="", user_agent=""):
    """
    Log authentication attempt
    
    Args:
        username: Username attempting to login
        status: "success", "failure", "locked"
        reason: Why it failed (invalid password, user not found, account locked, etc.)
        ip_address: Client IP address
        user_agent: User agent string
    """
    auth_logger = LOGGERS["auth"]
    
    log_entry = {
        "event": "authentication_attempt",
        "username": username,
        "status": status,
        "reason": reason,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if status == "success":
        auth_logger.info(f"Successful login: {username}", extra=log_entry)
    elif status == "failure":
        auth_logger.warning(f"Failed login: {username} - {reason}", extra=log_entry)
    elif status == "locked":
        auth_logger.warning(f"Account locked: {username}", extra=log_entry)


def log_authorization_check(user_id, action, resource_type, resource_id, 
                            allowed, reason="", ip_address=""):
    """
    Log authorization check (from IDOR fixes)
    
    Args:
        user_id: User attempting the action
        action: READ, CREATE, UPDATE, DELETE
        resource_type: Type of resource being accessed
        resource_id: ID of specific resource
        allowed: True if access granted, False otherwise
        reason: Explanation for the decision
        ip_address: Client IP address
    """
    audit_logger = LOGGERS["audit"]
    
    log_entry = {
        "event": "authorization_check",
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "allowed": allowed,
        "reason": reason,
        "ip_address": ip_address,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if allowed:
        audit_logger.info(f"Authorized: {user_id} {action} {resource_type}", extra=log_entry)
    else:
        audit_logger.warning(f"Denied: {user_id} {action} {resource_type} - {reason}", extra=log_entry)


def log_api_error(endpoint, method, status_code, error_message, ip_address="", 
                  user_id="", request_data=None):
    """
    Log API errors for troubleshooting and security monitoring
    
    Args:
        endpoint: API endpoint that errored
        method: HTTP method
        status_code: HTTP status code
        error_message: Error message
        ip_address: Client IP
        user_id: User making the request
        request_data: Request parameters (sanitized)
    """
    logger = LOGGERS["root"]
    
    log_entry = {
        "event": "api_error",
        "endpoint": endpoint,
        "method": method,
        "status_code": status_code,
        "error": error_message,
        "ip_address": ip_address,
        "user_id": user_id,
        "request_data_keys": list(request_data.keys()) if request_data else [],
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if status_code >= 500:
        logger.error(f"Server error on {method} {endpoint}: {status_code}", extra=log_entry)
    else:
        logger.warning(f"Client error on {method} {endpoint}: {status_code}", extra=log_entry)


def log_suspicious_activity(activity_type, details, ip_address="", user_id="", severity="medium"):
    """
    Log suspicious activity for threat detection
    
    Args:
        activity_type: Type of suspicious activity (brute_force, rate_limit_exceeded, 
                       sql_injection_attempt, unusual_access_pattern, etc.)
        details: Details about the activity
        ip_address: Client IP
        user_id: User involved
        severity: "low", "medium", "high", "critical"
    """
    security_logger = LOGGERS["security"]
    
    log_entry = {
        "event": "suspicious_activity",
        "activity_type": activity_type,
        "details": details,
        "ip_address": ip_address,
        "user_id": user_id,
        "severity": severity,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    if severity == "critical":
        security_logger.critical(f"CRITICAL: {activity_type} from {ip_address}", extra=log_entry)
    elif severity == "high":
        security_logger.error(f"HIGH: {activity_type} from {ip_address}", extra=log_entry)
    elif severity == "medium":
        security_logger.warning(f"MEDIUM: {activity_type} from {ip_address}", extra=log_entry)
    else:
        security_logger.info(f"LOW: {activity_type} from {ip_address}", extra=log_entry)


def log_rate_limit_exceeded(ip_address, endpoint, limit_type, current_count, limit):
    """
    Log when rate limiting is triggered
    
    Args:
        ip_address: Client IP address
        endpoint: API endpoint
        limit_type: Type of limit (login, api_call, etc.)
        current_count: Current request count
        limit: Limit threshold
    """
    log_suspicious_activity(
        "rate_limit_exceeded",
        f"Exceeded {limit_type} limit on {endpoint}: {current_count}/{limit}",
        ip_address=ip_address,
        severity="high"
    )


def log_sql_injection_attempt(endpoint, parameter, value, ip_address="", user_id=""):
    """Log potential SQL injection attempts"""
    log_suspicious_activity(
        "sql_injection_attempt",
        f"Suspicious SQL pattern in {parameter}: {value[:100]}",
        ip_address=ip_address,
        user_id=user_id,
        severity="critical"
    )


def log_data_access(user_id, object_type, object_id, action, ip_address="", success=True):
    """
    Log data access for compliance (GDPR, FERPA)
    
    Args:
        user_id: User accessing data
        object_type: Type of data (user, attendance, grade, etc.)
        object_id: ID of specific data object
        action: READ, UPDATE, DELETE, EXPORT
        ip_address: Client IP
        success: Whether action succeeded
    """
    audit_logger = LOGGERS["audit"]
    
    log_entry = {
        "event": "data_access",
        "user_id": user_id,
        "object_type": object_type,
        "object_id": object_id,
        "action": action,
        "ip_address": ip_address,
        "success": success,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    audit_logger.info(
        f"Data access: {user_id} {action} {object_type}/{object_id}",
        extra=log_entry
    )


def log_compliance_event(event_type, user_id, description, ip_address=""):
    """
    Log compliance-related events (GDPR export, deletion, etc.)
    
    Args:
        event_type: "GDPR_EXPORT", "GDPR_DELETION", "FERPA_ACCESS", etc.
        user_id: User involved
        description: Event description
        ip_address: Client IP
    """
    audit_logger = LOGGERS["audit"]
    
    log_entry = {
        "event": "compliance_event",
        "event_type": event_type,
        "user_id": user_id,
        "description": description,
        "ip_address": ip_address,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    audit_logger.info(f"Compliance: {event_type} for {user_id}", extra=log_entry)


# ══════════════════════════════════════════════════════════════════════════════
# DECORATORS FOR LOGGING
# ══════════════════════════════════════════════════════════════════════════════

def log_endpoint_access(f):
    """Decorator to log all endpoint accesses"""
    @wraps(f)
    def decorated(*args, **kwargs):
        from flask import request
        
        start_time = time.time()
        
        try:
            result = f(*args, **kwargs)
            duration = time.time() - start_time
            
            logger = LOGGERS["root"]
            log_entry = {
                "endpoint": request.path,
                "method": request.method,
                "duration_ms": duration * 1000,
                "ip_address": request.remote_addr,
                "user_agent": request.user_agent.string,
            }
            
            logger.info(f"{request.method} {request.path} - {duration:.2f}s", extra=log_entry)
            
            return result
        except Exception as e:
            duration = time.time() - start_time
            log_api_error(
                request.path,
                request.method,
                500,
                str(e),
                ip_address=request.remote_addr
            )
            raise
    
    return decorated


def detect_unusual_patterns(f):
    """Decorator to detect and log unusual access patterns"""
    @wraps(f)
    def decorated(*args, **kwargs):
        from flask import request
        
        # Check for SQL injection patterns
        for key, value in request.args.items():
            if isinstance(value, str):
                suspicious_patterns = [
                    "' OR '1'='1",
                    "' OR 1=1",
                    "DROP TABLE",
                    "INSERT INTO",
                    "DELETE FROM",
                    "-- OR 1=1",
                    "UNION SELECT",
                ]
                for pattern in suspicious_patterns:
                    if pattern.lower() in value.lower():
                        log_sql_injection_attempt(
                            request.path,
                            key,
                            value,
                            ip_address=request.remote_addr
                        )
        
        # Check for unusual HTTP methods or headers
        if request.method not in ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]:
            log_suspicious_activity(
                "unusual_http_method",
                f"Unusual HTTP method: {request.method}",
                ip_address=request.remote_addr,
                severity="high"
            )
        
        return f(*args, **kwargs)
    
    return decorated


# ══════════════════════════════════════════════════════════════════════════════
# MONITORING & ALERTING
# ══════════════════════════════════════════════════════════════════════════════

class SecurityMonitor:
    """Monitor for suspicious patterns and trigger alerts"""
    
    def __init__(self):
        self.failed_auth_attempts = {}  # {username: [(timestamp, ip), ...]}
        self.rate_limited_ips = {}  # {ip: [(timestamp, endpoint), ...]}
        self.suspicious_activities = []  # List of suspicious events
    
    def record_failed_auth(self, username, ip_address):
        """Record failed authentication attempt"""
        if username not in self.failed_auth_attempts:
            self.failed_auth_attempts[username] = []
        
        self.failed_auth_attempts[username].append((datetime.utcnow(), ip_address))
        
        # Keep only last hour of attempts
        one_hour_ago = datetime.utcnow().timestamp() - 3600
        self.failed_auth_attempts[username] = [
            (ts, ip) for ts, ip in self.failed_auth_attempts[username]
            if ts.timestamp() > one_hour_ago
        ]
        
        # Alert if threshold exceeded
        if len(self.failed_auth_attempts[username]) >= SecureConfig.FAILED_AUTH_THRESHOLD:
            log_suspicious_activity(
                "brute_force_attempt",
                f"Multiple failed login attempts for {username}: "
                f"{len(self.failed_auth_attempts[username])} attempts",
                ip_address=ip_address,
                severity="critical"
            )
            return True
        
        return False
    
    def record_rate_limit(self, ip_address, endpoint):
        """Record rate limit event"""
        if ip_address not in self.rate_limited_ips:
            self.rate_limited_ips[ip_address] = []
        
        self.rate_limited_ips[ip_address].append((datetime.utcnow(), endpoint))
        
        # Keep only last minute
        one_min_ago = datetime.utcnow().timestamp() - 60
        self.rate_limited_ips[ip_address] = [
            (ts, ep) for ts, ep in self.rate_limited_ips[ip_address]
            if ts.timestamp() > one_min_ago
        ]
        
        # Alert if threshold exceeded
        if len(self.rate_limited_ips[ip_address]) >= SecureConfig.RATE_LIMIT_THRESHOLD:
            log_rate_limit_exceeded(
                ip_address,
                endpoint,
                "api_call",
                len(self.rate_limited_ips[ip_address]),
                SecureConfig.RATE_LIMIT_THRESHOLD
            )
            return True
        
        return False


# Global monitor instance
security_monitor = SecurityMonitor() if SecureConfig.MONITOR_ENABLED else None
