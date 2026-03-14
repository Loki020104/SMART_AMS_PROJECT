"""
QR Security & Encryption Module
Handles QR code generation, encryption, validation, device fingerprinting, and fraud detection
"""

import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Tuple
import base64
import hmac

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import qrcode
from io import BytesIO

# Initialize encryption key from environment
QR_ENCRYPTION_KEY = os.getenv("QR_ENCRYPTION_KEY", "default-unsafe-key-change-in-production")
QR_HMAC_SECRET = os.getenv("QR_HMAC_SECRET", "default-unsafe-hmac-change-in-production")

class QREncryption:
    """Handles QR code encryption and decryption"""
    
    @staticmethod
    def derive_key(password: str, salt: bytes = None) -> Tuple[bytes, bytes]:
        """Derive encryption key using PBKDF2"""
        if salt is None:
            salt = os.urandom(16)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        return key, salt
    
    @staticmethod
    def encrypt_qr_data(data: Dict[str, Any]) -> str:
        """Encrypt QR session data"""
        try:
            key, salt = QREncryption.derive_key(QR_ENCRYPTION_KEY)
            cipher = Fernet(key)
            plaintext = json.dumps(data).encode()
            encrypted = cipher.encrypt(plaintext)
            # Return salt + encrypted data in base64
            full_data = base64.urlsafe_b64encode(salt + encrypted)
            return full_data.decode()
        except Exception as e:
            print(f"[QR-ENCRYPT] Error encrypting: {e}")
            return ""
    
    @staticmethod
    def decrypt_qr_data(encrypted_str: str) -> Dict[str, Any]:
        """Decrypt QR session data"""
        try:
            full_data = base64.urlsafe_b64decode(encrypted_str)
            salt = full_data[:16]
            encrypted = full_data[16:]
            
            key, _ = QREncryption.derive_key(QR_ENCRYPTION_KEY, salt)
            cipher = Fernet(key)
            plaintext = cipher.decrypt(encrypted)
            return json.loads(plaintext.decode())
        except Exception as e:
            print(f"[QR-DECRYPT] Error decrypting: {e}")
            return {}
    
    @staticmethod
    def generate_qr_hmac(data: str) -> str:
        """Generate HMAC for QR data integrity"""
        return hmac.new(
            QR_HMAC_SECRET.encode(),
            data.encode(),
            hashlib.sha256
        ).hexdigest()
    
    @staticmethod
    def verify_qr_hmac(data: str, hmac_value: str) -> bool:
        """Verify HMAC for QR data integrity"""
        expected = QREncryption.generate_qr_hmac(data)
        return hmac.compare_digest(expected, hmac_value)


class QRSessionManager:
    """Manages QR session lifecycle and validation"""
    
    @staticmethod
    def generate_session_qr(
        course_id: str,
        faculty_id: str,
        subject: str,
        validity_minutes: int = 5,
        require_face: bool = True,
        require_location: bool = True,
        latitude: float = None,
        longitude: float = None,
        gps_radius: int = 100
    ) -> Dict[str, Any]:
        """Generate a new QR session with encryption"""
        
        session_id = f"QR{uuid.uuid4().hex[:12].upper()}"
        created_at = datetime.utcnow()
        expires_at = created_at + timedelta(minutes=validity_minutes)
        
        qr_data = {
            "session_id": session_id,
            "course_id": course_id,
            "faculty_id": faculty_id,
            "subject": subject,
            "created_at": created_at.isoformat(),
            "expires_at": expires_at.isoformat(),
            "validity_minutes": validity_minutes,
            "require_face": require_face,
            "require_location": require_location,
            "latitude": latitude,
            "longitude": longitude,
            "gps_radius": gps_radius,
            "version": "2.0"  # QR format version
        }
        
        # Encrypt the data
        encrypted_data = QREncryption.encrypt_qr_data(qr_data)
        
        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(f"AMSQR:2.0:{session_id}:{encrypted_data}")
        qr.make(fit=True)
        qr_image = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = BytesIO()
        qr_image.save(buffer, format='PNG')
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return {
            "session_id": session_id,
            "expires_at": expires_at.isoformat(),
            "qr_code_base64": qr_base64,
            "encrypted_data": encrypted_data,
            "subject": subject,
            "validity_seconds": validity_minutes * 60
        }
    
    @staticmethod
    def validate_qr_data(qr_string: str) -> Tuple[bool, Dict[str, Any]]:
        """Validate and decrypt QR code data"""
        try:
            if not qr_string.startswith("AMSQR:"):
                return False, {"error": "Invalid QR format"}
            
            parts = qr_string.split(":", 3)
            if len(parts) < 4:
                return False, {"error": "Malformed QR string"}
            
            prefix, version, session_id, encrypted_data = parts
            
            # Decrypt
            data = QREncryption.decrypt_qr_data(encrypted_data)
            
            if not data:
                return False, {"error": "Decryption failed"}
            
            # Validate expiry
            expires_at = datetime.fromisoformat(data.get("expires_at", ""))
            if expires_at < datetime.utcnow():
                return False, {"error": "QR code expired"}
            
            return True, data
        
        except Exception as e:
            print(f"[QR-VALIDATE] Error: {e}")
            return False, {"error": str(e)}


class DeviceFingerprint:
    """Generates and manages device fingerprints for fraud detection"""
    
    @staticmethod
    def generate_fingerprint(user_agent: str, ip_address: str, additional_data: Dict = None) -> str:
        """Generate device fingerprint hash"""
        fingerprint_data = {
            "user_agent": user_agent,
            "ip_address": ip_address,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        if additional_data:
            fingerprint_data.update(additional_data)
        
        fingerprint_str = json.dumps(fingerprint_data, sort_keys=True)
        return hashlib.sha256(fingerprint_str.encode()).hexdigest()
    
    @staticmethod
    def extract_device_info(user_agent: str) -> Dict[str, str]:
        """Extract OS and browser from user agent"""
        device_info = {
            "os": "Unknown",
            "browser": "Unknown"
        }
        
        ua_lower = user_agent.lower()
        
        # Detect OS
        if "windows" in ua_lower:
            device_info["os"] = "Windows"
        elif "mac" in ua_lower or "osx" in ua_lower:
            device_info["os"] = "macOS"
        elif "android" in ua_lower:
            device_info["os"] = "Android"
        elif "iphone" in ua_lower or "ipad" in ua_lower:
            device_info["os"] = "iOS"
        elif "linux" in ua_lower:
            device_info["os"] = "Linux"
        
        # Detect Browser
        if "chrome" in ua_lower and "edge" not in ua_lower:
            device_info["browser"] = "Chrome"
        elif "firefox" in ua_lower:
            device_info["browser"] = "Firefox"
        elif "safari" in ua_lower and "chrome" not in ua_lower:
            device_info["browser"] = "Safari"
        elif "edge" in ua_lower:
            device_info["browser"] = "Edge"
        
        return device_info


class FraudDetection:
    """Detects fraudulent QR scan attempts"""
    
    @staticmethod
    def check_duplicate_use(session_id: str, student_id: str, usage_logs: list) -> Tuple[bool, str]:
        """Check if student already used this QR code"""
        for log in usage_logs:
            if (log.get("session_id") == session_id and 
                log.get("student_id") == student_id and 
                log.get("status") == "valid"):
                return True, "Duplicate attendance attempt - QR already used by this student"
        return False, ""
    
    @staticmethod
    def check_location_anomaly(
        latitude: float, 
        longitude: float,
        session_latitude: float,
        session_longitude: float,
        gps_radius: int = 100
    ) -> Tuple[bool, str]:
        """Check if location is within allowed radius"""
        from geopy.distance import geodesic
        try:
            session_loc = (session_latitude, session_longitude)
            student_loc = (latitude, longitude)
            distance_m = geodesic(session_loc, student_loc).meters
            
            if distance_m > gps_radius:
                return True, f"Location anomaly: {distance_m:.0f}m from session location"
            return False, ""
        except Exception as e:
            print(f"[FRAUD] GPS error: {e}")
            return False, ""
    
    @staticmethod
    def check_face_confidence(confidence: float, min_threshold: float = 0.85) -> Tuple[bool, str]:
        """Check if face recognition confidence is sufficient"""
        if confidence < min_threshold:
            return True, f"Face confidence too low: {confidence:.2%} (minimum: {min_threshold:.2%})"
        return False, ""
    
    @staticmethod
    def check_rapid_reuse(session_id: str, usage_logs: list, min_seconds: int = 30) -> Tuple[bool, str]:
        """Check for rapid QR reuse attempts (impossible behavior)"""
        recent_logs = [
            log for log in usage_logs 
            if log.get("session_id") == session_id and log.get("status") == "valid"
        ]
        
        if len(recent_logs) >= 2:
            last_usage = datetime.fromisoformat(recent_logs[-1].get("created_at", datetime.min.isoformat()))
            time_diff = (datetime.utcnow() - last_usage).total_seconds()
            if time_diff < min_seconds:
                return True, f"Rapid reuse attempt: {min_seconds}s required between uses"
        
        return False, ""
    
    @staticmethod
    def detect_proxy_attempt(
        face_verified: bool,
        face_confidence: float,
        location_verified: bool,
        device_matched: bool,
        previous_devices: int = 0
    ) -> Tuple[bool, str, str]:  # (is_fraud, reason, severity)
        """Detect proxy/spoofing attempts using multiple signals"""
        
        fraud_signals = 0
        reason = ""
        severity = "low"
        
        # Signal 1: No face verification with location requirement
        if not face_verified and face_confidence < 0.5:
            fraud_signals += 1
            reason += "No clear face detection. "
        
        # Signal 2: Location mismatch
        if not location_verified:
            fraud_signals += 1
            reason += "Location outside permitted range. "
            severity = "high"
        
        # Signal 3: Unusual device pattern
        if not device_matched and previous_devices > 0:
            fraud_signals += 1
            reason += "New device detected. "
        
        # Multiple signals = likely fraud
        if fraud_signals >= 2:
            return True, reason.strip(), "critical"
        elif fraud_signals == 1:
            return True, reason.strip(), "medium"
        
        return False, "", "low"


class AuditTrail:
    """Manages comprehensive audit logging"""
    
    @staticmethod
    def log_qr_event(
        event_type: str,
        user_id: str,
        session_id: str,
        details: Dict[str, Any],
        severity: str = "low",
        ip_address: str = None,
        user_agent: str = None
    ) -> Dict[str, Any]:
        """Create audit trail entry"""
        
        audit_entry = {
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "user_id": user_id,
            "session_id": session_id,
            "details": details,
            "severity": severity,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Log based on severity
        severity_map = {
            "low": "[INFO]",
            "medium": "[WARN]",
            "high": "[ERROR]",
            "critical": "[CRITICAL]"
        }
        
        prefix = severity_map.get(severity, "[INFO]")
        print(f"{prefix} [AUDIT] {event_type} - User: {user_id}, Session: {session_id}")
        
        return audit_entry


# Offline Queue Management
class OfflineQueue:
    """Manages offline attendance storage and sync"""
    
    @staticmethod
    def queue_attendance(
        user_id: str,
        session_id: str,
        roll_no: str,
        face_data: str = None,
        location_data: Dict = None
    ) -> Dict[str, Any]:
        """Queue attendance action for offline storage"""
        
        queue_entry = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "session_id": session_id,
            "roll_no": roll_no,
            "face_data": face_data,
            "location_data": location_data,
            "action_type": "mark_attendance",
            "queued_at": datetime.utcnow().isoformat(),
            "synced": False
        }
        
        return queue_entry
    
    @staticmethod
    def generate_offline_id() -> str:
        """Generate unique offline transaction ID"""
        return f"OFFLINE_{uuid.uuid4().hex[:12].upper()}_{int(datetime.utcnow().timestamp())}"
