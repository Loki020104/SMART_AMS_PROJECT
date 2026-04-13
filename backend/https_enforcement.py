"""
HTTPS Enforcement & Security Headers Middleware
Enforces secure communication and protects against common web vulnerabilities
"""

from flask import request, redirect
from functools import wraps
import logging

from backend.secure_config import SecureConfig
from backend.security_logging import LOGGERS, log_suspicious_activity

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware:
    """
    Add security headers to all responses
    Protects against XSS, clickjacking, content sniffing, etc.
    """
    
    def __init__(self, app):
        self.app = app
        app.after_request(self.add_security_headers)
    
    def add_security_headers(self, response):
        """Add security headers to response"""
        
        # Force HTTPS
        if SecureConfig.HTTPS_ONLY and not self.is_secure():
            response.headers["Strict-Transport-Security"] = (
                f"max-age={SecureConfig.HSTS_MAX_AGE}; includeSubDomains; preload"
            )
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = SecureConfig.X_FRAME_OPTIONS
        
        # Prevent content sniffing
        response.headers["X-Content-Type-Options"] = SecureConfig.X_CONTENT_TYPE_OPTIONS
        
        # XSS Protection
        response.headers["X-XSS-Protection"] = SecureConfig.X_XSS_PROTECTION
        
        # Content Security Policy
        response.headers["Content-Security-Policy"] = SecureConfig.CONTENT_SECURITY_POLICY
        
        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions Policy (formerly Feature Policy)
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=()"
        )
        
        # Additional security headers
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        
        return response
    
    @staticmethod
    def is_secure():
        """Check if request is over HTTPS"""
        return (
            request.is_secure or
            request.headers.get("X-Forwarded-Proto") == "https"
        )


class HTTPSRedirectMiddleware:
    """
    Redirect all HTTP requests to HTTPS
    Useful for enforcing secure connections
    """
    
    def __init__(self, app):
        self.app = app
        app.before_request(self.redirect_to_https)
    
    def redirect_to_https(self):
        """Redirect HTTP to HTTPS if configured"""
        
        # Allow health checks without HTTPS redirect
        if request.path in ["/health", "/healthz", "/ready"]:
            return None
        
        # Check if we should redirect
        if not SecureConfig.SSL_REDIRECT:
            return None
        
        # Check if already secure
        if request.is_secure or request.headers.get("X-Forwarded-Proto") == "https":
            return None
        
        # Log the redirect (potential security concern if frequent)
        logger.info(
            f"Redirecting HTTP request to HTTPS: {request.method} {request.path}",
            extra={"ip_address": request.remote_addr, "protocol": "http"}
        )
        
        # Build HTTPS URL
        url = request.url.replace("http://", "https://", 1)
        
        # Redirect with 308 (preserves method)
        return redirect(url, code=308)


def require_https(f):
    """
    Decorator to require HTTPS for specific endpoints
    Useful for sensitive operations (login, payment, etc.)
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if SecureConfig.HTTPS_ONLY:
            if not (request.is_secure or request.headers.get("X-Forwarded-Proto") == "https"):
                log_suspicious_activity(
                    "insecure_sensitive_request",
                    f"Non-HTTPS request to {request.path}",
                    ip_address=request.remote_addr,
                    severity="high"
                )
                return {"success": False, "error": "HTTPS required"}, 403
        
        return f(*args, **kwargs)
    
    return decorated_function


# ══════════════════════════════════════════════════════════════════════════════
# CERTIFICATE & TLS CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

class TLSConfig:
    """
    TLS/SSL Configuration
    Use with gunicorn or other WSGI servers
    """
    
    @staticmethod
    def get_ssl_context():
        """
        Get SSL context for production
        Use with: gunicorn --certfile=cert.pem --keyfile=key.pem
        """
        import ssl
        
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        
        # Modern TLS versions only (1.2+)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.maximum_version = ssl.TLSVersion.TLSv1_3
        
        # Strong cipher suites only
        context.set_ciphers(
            'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!eNULL:!EXPORT:!DSS:!DES:!RC4:!3DES:!MD5:!PSK'
        )
        
        # Enable additional security options
        context.options |= ssl.OP_NO_SSLv2
        context.options |= ssl.OP_NO_SSLv3
        context.options |= ssl.OP_NO_TLSv1
        context.options |= ssl.OP_NO_TLSv1_1
        context.options |= ssl.OP_NO_COMPRESSION
        context.options |= ssl.OP_CIPHER_SERVER_PREFERENCE
        context.options |= ssl.OP_SINGLE_DH_USE
        context.options |= ssl.OP_SINGLE_ECDH_USE
        
        return context
    
    @staticmethod
    def get_gunicorn_config():
        """
        Get Gunicorn configuration string for TLS
        Add to: gunicorn.conf.py
        """
        return """
# TLS Configuration
certfile = "/path/to/your/certificate.pem"
keyfile = "/path/to/your/private.key"
ssl_version = ssl.PROTOCOL_TLSv1_2
ciphers = 'ECDHE+AESGCM:ECDHE+CHACHA20:!aNULL:!eNULL'
ca_certs = "/path/to/ca-bundle.crt"  # Optional

# Security options
forwarded_allow_ips = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
secure_scheme_headers = {
    "X-FORWARDED-PROTOCOL": "ssl",
    "X-FORWARDED-PROTO": "https",
    "X-FORWARDED-SSL": "on",
}
"""


# ══════════════════════════════════════════════════════════════════════════════
# CERTIFICATE CHECKING
# ══════════════════════════════════════════════════════════════════════════════

def validate_ssl_certificate(cert_path, key_path):
    """
    Validate SSL certificate and key
    
    Args:
        cert_path: Path to certificate file
        key_path: Path to private key file
    
    Returns:
        (is_valid, error_message)
    """
    import ssl
    from pathlib import Path
    
    errors = []
    
    # Check files exist
    if not Path(cert_path).exists():
        errors.append(f"Certificate file not found: {cert_path}")
    
    if not Path(key_path).exists():
        errors.append(f"Key file not found: {key_path}")
    
    if errors:
        return False, errors
    
    # Try to load certificate
    try:
        context = ssl.create_default_context()
        context.load_cert_chain(cert_path, key_path)
    except ssl.SSLError as e:
        errors.append(f"SSL error: {e}")
    except Exception as e:
        errors.append(f"Certificate validation error: {e}")
    
    return len(errors) == 0, errors


# ══════════════════════════════════════════════════════════════════════════════
# CORS & ORIGIN VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

class OriginValidation:
    """Validate request origins against whitelist"""
    
    @staticmethod
    def is_valid_origin(request):
        """Check if Origin header is in whitelist"""
        origin = request.headers.get("Origin", "")
        
        if not origin:
            return True  # Allow requests without Origin header
        
        # Check against whitelist
        for allowed_origin in SecureConfig.CORS_ORIGINS:
            if origin == allowed_origin:
                return True
        
        # Log invalid origin
        log_suspicious_activity(
            "invalid_origin",
            f"Request from unauthorized origin: {origin}",
            ip_address=request.remote_addr,
            severity="medium"
        )
        
        return False
    
    @staticmethod
    def validate_cors_request(f):
        """Decorator to validate CORS requests"""
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.method == "OPTIONS":
                return {"success": True}, 200
            
            if not OriginValidation.is_valid_origin(request):
                return {"success": False, "error": "Invalid origin"}, 403
            
            return f(*args, **kwargs)
        
        return decorated


# ══════════════════════════════════════════════════════════════════════════════
# SECURE COOKIES
# ══════════════════════════════════════════════════════════════════════════════

class SecureCookieConfig:
    """Secure cookie configuration for Flask"""
    
    @staticmethod
    def get_session_config():
        """Get secure session configuration"""
        return {
            "SESSION_COOKIE_SECURE": SecureConfig.SESSION_COOKIE_SECURE,
            "SESSION_COOKIE_HTTPONLY": SecureConfig.SESSION_COOKIE_HTTPONLY,
            "SESSION_COOKIE_SAMESITE": SecureConfig.SESSION_COOKIE_SAMESITE,
            "PERMANENT_SESSION_LIFETIME": SecureConfig.SESSION_TIMEOUT,
            "SESSION_REFRESH_EACH_REQUEST": True,
        }
    
    @staticmethod
    def configure_app(app):
        """Configure Flask app with secure cookie settings"""
        config = SecureCookieConfig.get_session_config()
        app.config.update(config)
        
        logger.info("Secure cookie configuration applied")
