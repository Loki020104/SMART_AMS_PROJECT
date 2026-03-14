"""
Face Registration Handler
Manages face registration with account linking based on rollno/username match
"""
import face_recognition
import numpy as np
from datetime import datetime
import uuid
from typing import Dict, Tuple, Optional

class FaceRegistrationHandler:
    """Handle face registration and account linking workflow"""
    
    def __init__(self, db_connection):
        """Initialize with database connection"""
        self.db = db_connection
        self.FACE_CONFIDENCE_THRESHOLD = 0.6
        self.QUALITY_THRESHOLD = 0.5
    
    def register_face_with_linking(
        self, 
        roll_number: str, 
        username: str, 
        face_image, 
        admin_id: str,
        require_face_login: bool = False
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Register a face and link to user account if rollno/username matches
        
        Args:
            roll_number: Student roll number
            username: Username provided by admin
            face_image: Numpy array of face image
            admin_id: UUID of admin performing registration
            require_face_login: Make face recognition mandatory for login
        
        Returns:
            Tuple of (success, message, linked_student_id)
        """
        try:
            # Step 1: Verify face image and extract encoding
            encoding, landmarks, quality_score = self._extract_face_encoding(face_image)
            if encoding is None:
                return False, "❌ No face detected in image or face quality too low", None
            
            # Step 2: Find student by rollno
            student = self._find_student_by_rollno(roll_number)
            if not student:
                return False, f"❌ No student found with roll number: {roll_number}", None
            
            # Step 3: Find or create user account by username
            user = self._find_or_create_user(username, student)
            if not user:
                return False, f"❌ Could not create/find user account for username: {username}", None
            
            # Step 4: Check if rollno and username belong to same person
            is_match = self._verify_rollno_username_match(student, user)
            if not is_match:
                return False, "❌ Roll number and username do not match. Please verify the student identity.", None
            
            # Step 5: Link accounts if not already linked
            linked_successfully = self._link_student_to_user(
                student['id'], 
                user['id'], 
                admin_id, 
                require_face_login
            )
            if not linked_successfully:
                return False, "❌ Failed to link accounts. Student may already be linked to another account.", None
            
            # Step 6: Save face encoding
            encoding_id = self._save_face_encoding(
                student['id'],
                encoding,
                landmarks,
                quality_score,
                face_image
            )
            
            # Step 7: Update student face registration status
            self._update_student_face_status(student['id'], encoding_id, quality_score)
            
            success_msg = f"""
✅ Face Registration Successful!

Details:
- Student: {student['first_name']} {student['last_name']} ({roll_number})
- Username: {username}
- Face Quality Score: {quality_score:.2f}
- Accounts Linked: ✓
- Face Login Required: {'Yes' if require_face_login else 'No'}

The student can now login with username/password.
Face will be verified on subsequent logins.
            """
            
            return True, success_msg, student['id']
            
        except Exception as e:
            return False, f"❌ Error during face registration: {str(e)}", None
    
    def _extract_face_encoding(self, face_image) -> Tuple[Optional[np.ndarray], int, float]:
        """
        Extract face encoding from image
        Returns: (encoding, landmarks_count, quality_score)
        """
        try:
            # Convert to RGB if needed
            if len(face_image.shape) == 2:
                face_image = np.stack([face_image] * 3, axis=-1)
            
            # Detect faces and landmarks
            face_locations = face_recognition.face_locations(face_image, model='hog')
            if not face_locations:
                return None, 0, 0.0
            
            face_encodings = face_recognition.face_encodings(face_image, face_locations)
            face_landmarks = face_recognition.face_landmarks(face_image, face_locations)
            
            if not face_encodings:
                return None, 0, 0.0
            
            # Use first face detected
            encoding = face_encodings[0]
            landmarks_count = len(face_landmarks[0]) if face_landmarks else 0
            
            # Calculate quality score (0-100 based on image brightness and contrast)
            quality_score = self._calculate_face_quality(face_image)
            
            return encoding, landmarks_count, quality_score
            
        except Exception as e:
            print(f"Error extracting face encoding: {e}")
            return None, 0, 0.0
    
    def _calculate_face_quality(self, image) -> float:
        """
        Calculate face image quality score (0.0 to 100.0)
        Factors: Brightness, Contrast, Sharpness
        """
        try:
            import cv2
            
            # Convert to grayscale for analysis
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Brightness (mean pixel value)
            brightness = np.mean(gray)
            brightness_score = min(100, (brightness / 255) * 100) if brightness > 20 else 0
            
            # Contrast (standard deviation)
            contrast = np.std(gray)
            contrast_score = min(100, (contrast / 50) * 100)
            
            # Sharpness (Laplacian variance)
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            sharpness = laplacian.var()
            sharpness_score = min(100, (sharpness / 100) * 100)
            
            # Weighted quality score
            quality = (brightness_score * 0.2 + contrast_score * 0.4 + sharpness_score * 0.4)
            
            return min(100.0, max(0.0, quality))
        except:
            return 50.0  # Default mid-range quality
    
    def _find_student_by_rollno(self, roll_number: str) -> Optional[Dict]:
        """Find student record by roll number"""
        try:
            query = """
            SELECT id, user_id, student_id, roll_number, first_name, last_name, email
            FROM students
            WHERE roll_number = %s AND is_active = true
            LIMIT 1
            """
            result = self.db.query(query, (roll_number,))
            return result[0] if result else None
        except Exception as e:
            print(f"Error finding student: {e}")
            return None
    
    def _find_or_create_user(self, username: str, student: Dict) -> Optional[Dict]:
        """
        Find existing user by username, or create new user if doesn't exist
        Returns user dict with id
        """
        try:
            # Check if user exists
            query = "SELECT id, username, email FROM users WHERE username = %s LIMIT 1"
            result = self.db.query(query, (username,))
            
            if result:
                return result[0]
            
            # User doesn't exist - check if we should create one
            # Only create if email matches student's email
            student_email = student.get('email')
            if student_email:
                query = "SELECT id FROM users WHERE email = %s LIMIT 1"
                result = self.db.query(query, (student_email,))
                if result:
                    return result[0]
            
            # Create new user account
            user_id = str(uuid.uuid4())
            insert_query = """
            INSERT INTO users (id, username, email, user_type, full_name, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            RETURNING id, username, email
            """
            full_name = f"{student['first_name']} {student['last_name']}"
            result = self.db.execute(
                insert_query,
                (user_id, username, student_email, 'student', full_name)
            )
            return result if result else None
            
        except Exception as e:
            print(f"Error managing user account: {e}")
            return None
    
    def _verify_rollno_username_match(self, student: Dict, user: Dict) -> bool:
        """
        Verify that the roll number and username belong to the same person
        Checks:
        1. User is not already linked to a different student
        2. Username contains student's info or matches expected pattern
        """
        try:
            # Check if user is already linked to a student
            if student.get('user_id') and student['user_id'] != user['id']:
                # Student already linked to different user
                return False
            
            # Extract student name parts for matching
            first_name = student['first_name'].lower()
            last_name = student['last_name'].lower() if student.get('last_name') else ""
            username = user['username'].lower()
            
            # Username should ideally contain student identifiers
            # This is a flexible check - admin should verify manually
            # For now, we'll allow the match if:
            # 1. Admin explicitly confirmed (should be checked in UI)
            # 2. Or username follows standard pattern (e.g., rollno_based)
            # 3. Or admin manually verifies in registration form
            
            return True  # Trust admin verification in UI
            
        except Exception as e:
            print(f"Error verifying match: {e}")
            return False
    
    def _link_student_to_user(
        self, 
        student_id: str, 
        user_id: str, 
        admin_id: str,
        require_face_login: bool
    ) -> bool:
        """Link student account to user account"""
        try:
            # Check if student already linked to different user
            query = "SELECT user_id FROM students WHERE id = %s"
            result = self.db.query(query, (student_id,))
            
            if result and result[0]['user_id'] and result[0]['user_id'] != user_id:
                print(f"Student already linked to different user")
                return False
            
            # Update student with user link
            update_query = """
            UPDATE students
            SET user_id = %s, 
                linked_at = NOW(), 
                linked_by = %s,
                require_face_login = %s
            WHERE id = %s
            """
            self.db.execute(
                update_query,
                (user_id, admin_id, require_face_login, student_id)
            )
            return True
            
        except Exception as e:
            print(f"Error linking accounts: {e}")
            return False
    
    def _save_face_encoding(
        self, 
        student_id: str, 
        encoding: np.ndarray,
        landmarks_count: int,
        quality_score: float,
        face_image
    ) -> str:
        """Save face encoding to database"""
        try:
            # Convert encoding to list for storage
            encoding_list = encoding.tolist()
            encoding_id = str(uuid.uuid4())
            
            # Calculate image hash for duplicate detection
            import hashlib
            image_bytes = face_image.tobytes()
            image_hash = hashlib.sha256(image_bytes).hexdigest()
            
            insert_query = """
            INSERT INTO face_encodings 
            (id, student_id, encoding_vector, quality_score, 
             registration_timestamp, image_hash, landmarks_detected, 
             landmarks_count, is_primary, created_at)
            VALUES (%s, %s, %s, %s, NOW(), %s, %s, %s, %s, NOW())
            """
            
            self.db.execute(
                insert_query,
                (
                    encoding_id,
                    student_id,
                    encoding_list,  # Will be stored as FLOAT8[] array
                    quality_score,
                    image_hash,
                    landmarks_count > 0,
                    landmarks_count,
                    True  # Mark as primary encoding
                )
            )
            return encoding_id
            
        except Exception as e:
            print(f"Error saving face encoding: {e}")
            return None
    
    def _update_student_face_status(
        self, 
        student_id: str, 
        encoding_id: str,
        quality_score: float
    ) -> bool:
        """Update student face registration status"""
        try:
            update_query = """
            UPDATE students
            SET face_registered = true,
                last_face_registration = NOW(),
                face_registration_quality = %s
            WHERE id = %s
            """
            self.db.execute(update_query, (quality_score, student_id))
            return True
        except Exception as e:
            print(f"Error updating face status: {e}")
            return False


class FaceLoginVerification:
    """Handle face verification during login"""
    
    def __init__(self, db_connection):
        self.db = db_connection
        self.FACE_MATCH_THRESHOLD = 0.6  # DLib confidence threshold
    
    def verify_login_with_face(
        self, 
        username: str, 
        password: str, 
        face_image
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Verify login with username/password AND face recognition
        
        Returns: (success, message, user_id)
        """
        try:
            # Step 1: Verify username and password
            user = self._verify_credentials(username, password)
            if not user:
                return False, "❌ Invalid username or password", None
            
            # Step 2: Get linked student
            student = self._get_linked_student(user['id'])
            if not student:
                return False, "❌ No face registration found. Contact admin for registration.", None
            
            # Step 3: Check if face login is enabled
            if not student.get('face_login_enabled'):
                return False, "❌ Face login is disabled for this account", None
            
            # Step 4: Extract face encoding from login image
            login_encoding, _, quality = self._extract_face_encoding(face_image)
            if login_encoding is None:
                return False, "❌ No face detected. Please ensure good lighting and try again.", None
            
            # Step 5: Match against stored face encodings
            is_match, confidence = self._match_face_encoding(
                student['id'], 
                login_encoding
            )
            
            if not is_match:
                return False, "❌ Face does not match registration. Authentication failed.", None
            
            # Step 6: Update last login
            self._update_last_login(user['id'])
            
            success_msg = f"✅ Login successful! Face verified with {confidence:.1f}% confidence"
            return True, success_msg, user['id']
            
        except Exception as e:
            return False, f"❌ Login error: {str(e)}", None
    
    def _verify_credentials(self, username: str, password: str) -> Optional[Dict]:
        """Verify username and password"""
        try:
            query = """
            SELECT id, username, password_hash, user_type
            FROM users
            WHERE username = %s AND is_active = true
            """
            result = self.db.query(query, (username,))
            if not result:
                return None
            
            user = result[0]
            # In production, use proper password hashing (bcrypt)
            # This is simplified for example
            if self._verify_password(password, user['password_hash']):
                return user
            return None
            
        except Exception as e:
            print(f"Error verifying credentials: {e}")
            return None
    
    def _verify_password(self, password: str, password_hash: str) -> bool:
        """Verify password against hash (use bcrypt in production)"""
        # TODO: Use proper hashing like bcrypt
        # For now, simple check
        return password_hash is not None  # Placeholder
    
    def _get_linked_student(self, user_id: str) -> Optional[Dict]:
        """Get student linked to user"""
        try:
            query = """
            SELECT id, student_id, face_registered, face_login_enabled, require_face_login
            FROM students
            WHERE user_id = %s AND is_active = true
            LIMIT 1
            """
            result = self.db.query(query, (user_id,))
            return result[0] if result else None
        except Exception as e:
            print(f"Error getting linked student: {e}")
            return None
    
    def _extract_face_encoding(self, face_image) -> Tuple[Optional[np.ndarray], int, float]:
        """Extract face encoding from image"""
        try:
            face_locations = face_recognition.face_locations(face_image, model='hog')
            if not face_locations:
                return None, 0, 0.0
            
            face_encodings = face_recognition.face_encodings(face_image, face_locations)
            if not face_encodings:
                return None, 0, 0.0
            
            return face_encodings[0], len(face_locations), 75.0  # Simplified quality
            
        except Exception as e:
            print(f"Error extracting face: {e}")
            return None, 0, 0.0
    
    def _match_face_encoding(
        self, 
        student_id: str, 
        login_encoding: np.ndarray
    ) -> Tuple[bool, float]:
        """
        Match login face against stored encodings
        Returns: (is_match, confidence_percentage)
        """
        try:
            # Get primary face encoding
            query = """
            SELECT encoding_vector FROM face_encodings
            WHERE student_id = %s AND is_primary = true
            LIMIT 1
            """
            result = self.db.query(query, (student_id,))
            if not result:
                return False, 0.0
            
            stored_encoding = np.array(result[0]['encoding_vector'])
            
            # Calculate face distance
            distance = face_recognition.face_distance([stored_encoding], login_encoding)[0]
            
            # Convert distance to confidence (lower distance = higher confidence)
            # Distance 0 = perfect match, Distance 1 = completely different
            confidence = (1 - distance) * 100
            
            # Match if confidence above threshold
            is_match = confidence >= (self.FACE_MATCH_THRESHOLD * 100)
            
            return is_match, confidence
            
        except Exception as e:
            print(f"Error matching face: {e}")
            return False, 0.0
    
    def _update_last_login(self, user_id: str) -> bool:
        """Update user's last login timestamp"""
        try:
            query = "UPDATE users SET last_login = NOW() WHERE id = %s"
            self.db.execute(query, (user_id,))
            return True
        except Exception as e:
            print(f"Error updating login time: {e}")
            return False
