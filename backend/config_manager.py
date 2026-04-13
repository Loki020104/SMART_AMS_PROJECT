"""
Advanced Configuration Management System for Production Academic Management System (AMS)
Handles dynamic system configuration without database hardcoding
"""

from datetime import datetime
import json
import os


class ConfigManager:
    """Centralized configuration management with hot-reload capability"""
    
    # Default configuration structure
    DEFAULT_CONFIG = {
        # Institution Settings
        "institution": {
            "name": "Institution Name",
            "code": "INST001",
            "address": "",
            "phone": "",
            "email": "admin@institution.edu",
            "logo_url": "",
            "website": "",
        },
        
        # Academic Settings
        "academic": {
            "current_semester": 1,
            "current_academic_year": "2024-25",
            "academic_year_start_month": 6,  # June
            "semesters_per_year": 2,
            "max_students_per_class": 50,
            "pass_mark_percentage": 40,
        },
        
        # Financial Settings
        "financial": {
            "currency": "USD",
            "payment_gateway": "razorpay",  # razorpay, stripe, paypal
            "razorpay_key": os.getenv("RAZORPAY_KEY", ""),
            "razorpay_secret": os.getenv("RAZORPAY_SECRET", ""),
            "stripe_key": os.getenv("STRIPE_KEY", ""),
            "paypal_username": os.getenv("PAYPAL_USERNAME", ""),
            "auto_fee_reminder_days": 5,
            "late_fee_enabled": True,
            "late_fee_percentage": 2.5,
            "scholarship_enabled": True,
        },
        
        # Communication Settings
        "communication": {
            "email_provider": "sendgrid",  # sendgrid, nodemailer
            "sendgrid_api_key": os.getenv("SENDGRID_API_KEY", ""),
            "sms_provider": "twilio",  # twilio, aws-sns
            "twilio_account_sid": os.getenv("TWILIO_ACCOUNT_SID", ""),
            "twilio_auth_token": os.getenv("TWILIO_AUTH_TOKEN", ""),
            "twilio_phone": os.getenv("TWILIO_PHONE", ""),
            "firebase_fcm_key": os.getenv("FCM_KEY", ""),
            "enable_email_notifications": True,
            "enable_sms_notifications": True,
            "enable_push_notifications": True,
        },
        
        # Compliance Settings
        "compliance": {
            "gdpr_enabled": True,
            "ferpa_enabled": True,
            "coppa_enabled": False,  # For K-12 systems
            "data_retention_days": 1825,  # 5 years
            "enable_audit_logging": True,
            "audit_retention_days": 2555,  # 7 years
        },
        
        # Security Settings
        "security": {
            "rate_limit_enabled": True,
            "rate_limit_requests_per_minute": 60,
            "brute_force_protection": True,
            "max_login_attempts": 5,
            "lockout_duration_minutes": 15,
            "password_min_length": 8,
            "require_special_chars": True,
            "session_timeout_minutes": 60,
            "enable_two_factor_auth": False,
        },
        
        # Analytics Settings
        "analytics": {
            "enable_predictive_analytics": True,
            "enable_dropout_prediction": True,
            "enable_performance_tracking": True,
            "elasticsearch_enabled": False,
            "elasticsearch_host": "localhost:9200",
        },
        
        # Third-party Integrations
        "integrations": {
            "lms": "canvas",  # canvas, moodle, google-classroom
            "canvas_api_key": os.getenv("CANVAS_API_KEY", ""),
            "zoom_client_id": os.getenv("ZOOM_CLIENT_ID", ""),
            "zoom_client_secret": os.getenv("ZOOM_CLIENT_SECRET", ""),
            "teams_bot_id": os.getenv("TEAMS_BOT_ID", ""),
            "linkedin_api_key": os.getenv("LINKEDIN_API_KEY", ""),
        },
        
        # Face Recognition & QR (Do NOT modify)
        "face_recognition": {
            "enabled": True,
            "tolerance": 0.6,
            "quality_threshold": 50,
            "liveness_detection": True,
        },
        
        # Library Management
        "library": {
            "enable_library_management": True,
            "auto_return_days": 14,
            "max_books_per_student": 5,
            "fine_per_day": 10,  # in institution currency
            "enable_digital_assets": True,
        },
        
        # Hostel Management
        "hostel": {
            "enable_hostel_management": True,
            "auto_room_allocation": True,
            "enable_mess_billing": True,
        },
        
        # Research Management
        "research": {
            "enable_research_tracking": True,
            "enable_irb_workflow": True,
            "enable_grant_tracking": True,
        },
        
        # Proctoring & Assessment
        "proctoring": {
            "enable_virtual_proctoring": True,
            "proctor_provider": "classmarker",  # classmarker, examity
            "enable_plagiarism_detection": True,
            "turnitin_api_key": os.getenv("TURNITIN_API_KEY", ""),
            "enable_ai_proctoring": False,
        },
        
        # Blockchain & Credentials (Optional)
        "blockchain": {
            "enable_blockchain_certificates": False,
            "blockchain_network": "ethereum",  # ethereum, hyperledger
            "enable_ipfs_storage": False,
        },
    }
    
    _instance = None
    _config = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._config is None:
            self._load_config()
    
    def _load_config(self):
        """Load configuration from environment or use defaults"""
        self._config = self.DEFAULT_CONFIG.copy()
        # Allow override from JSON file if exists
        config_file = os.getenv("AMS_CONFIG_FILE", "./config.json")
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    custom_config = json.load(f)
                    self._deep_merge(self._config, custom_config)
            except Exception as e:
                print(f"[CONFIG] Warning: Could not load {config_file}: {e}")
    
    def _deep_merge(self, base, override):
        """Recursively merge override config into base"""
        for key, value in override.items():
            if isinstance(value, dict) and key in base and isinstance(base[key], dict):
                self._deep_merge(base[key], value)
            else:
                base[key] = value
    
    def get(self, key_path, default=None):
        """Get config value using dot notation. E.g., 'financial.currency'"""
        keys = key_path.split('.')
        value = self._config
        try:
            for key in keys:
                value = value[key]
            return value
        except (KeyError, TypeError):
            return default
    
    def set(self, key_path, value):
        """Set config value using dot notation"""
        keys = key_path.split('.')
        current = self._config
        
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        current[keys[-1]] = value
    
    def get_section(self, section):
        """Get entire configuration section"""
        return self._config.get(section, {})
    
    def is_feature_enabled(self, feature_key):
        """Check if a feature is enabled. E.g., 'library.enable_library_management'"""
        return self.get(feature_key, False) is True
    
    def to_dict(self):
        """Export full config (for debugging)"""
        return self._config.copy()
    
    def save_to_file(self, filepath="./config.json"):
        """Save current config to JSON file"""
        try:
            with open(filepath, 'w') as f:
                json.dump(self._config, f, indent=2)
            return True
        except Exception as e:
            print(f"[CONFIG] Error saving config: {e}")
            return False


# Singleton instance
config = ConfigManager()
