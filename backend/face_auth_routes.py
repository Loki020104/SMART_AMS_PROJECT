"""
Flask API endpoints for face registration and face-based login
Integration with face_registration_handler.py
"""
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
import cv2
import numpy as np
from PIL import Image
import io
import logging
from face_registration_handler import FaceRegistrationHandler, FaceLoginVerification

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

face_auth_bp = Blueprint('face_auth', __name__, url_prefix='/api/auth')

# Initialize handlers (will be set when Flask app starts)
face_reg_handler = None
face_login_handler = None

def init_face_handlers(db_connection):
    """Initialize face handlers with database connection"""
    global face_reg_handler, face_login_handler
    face_reg_handler = FaceRegistrationHandler(db_connection)
    face_login_handler = FaceLoginVerification(db_connection)


@face_auth_bp.route('/face-register', methods=['POST'])
def register_face():
    """
    Admin endpoint to register student face and link accounts
    
    Expected form data:
    - roll_number: Student roll number
    - username: Username to link/create
    - face_image: Image file containing student's face
    - admin_id: UUID of admin performing registration
    - require_face_login: Boolean (optional, default false)
    """
    try:
        # Verify admin authentication (add your auth check here)
        admin_id = request.form.get('admin_id')
        if not admin_id:
            return jsonify({
                'success': False,
                'message': '❌ Admin authentication required'
            }), 401
        
        # Get form data
        roll_number = request.form.get('roll_number', '').strip()
        username = request.form.get('username', '').strip()
        require_face_login = request.form.get('require_face_login', 'false').lower() == 'true'
        
        if not roll_number or not username:
            return jsonify({
                'success': False,
                'message': '❌ Roll number and username are required'
            }), 400
        
        # Get face image
        if 'face_image' not in request.files:
            return jsonify({
                'success': False,
                'message': '❌ No face image provided'
            }), 400
        
        image_file = request.files['face_image']
        if image_file.filename == '':
            return jsonify({
                'success': False,
                'message': '❌ No image file selected'
            }), 400
        
        # Read and process image
        try:
            image_data = image_file.read()
            pil_image = Image.open(io.BytesIO(image_data))
            
            # Convert to RGB if necessary
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Convert to numpy array
            face_image = np.array(pil_image)
            
        except Exception as e:
            return jsonify({
                'success': False,
                'message': f'❌ Invalid image format: {str(e)}'
            }), 400
        
        # Register face and link accounts
        success, message, student_id = face_reg_handler.register_face_with_linking(
            roll_number=roll_number,
            username=username,
            face_image=face_image,
            admin_id=admin_id,
            require_face_login=require_face_login
        )
        
        return jsonify({
            'success': success,
            'message': message,
            'student_id': student_id
        }), 200 if success else 400
        
    except Exception as e:
        logger.error(f"Face registration error: {e}")
        return jsonify({
            'success': False,
            'message': f'❌ Server error: {str(e)}'
        }), 500


@face_auth_bp.route('/face-login', methods=['POST'])
def face_login():
    """
    Login with username, password, and face verification
    
    Expected JSON:
    {
        "username": "student_username",
        "password": "student_password",
        "face_image": "base64_encoded_image_or_file"
    }
    """
    try:
        # Get credentials
        data = request.get_json() if request.is_json else {}
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({
                'success': False,
                'message': '❌ Username and password required'
            }), 400
        
        # Get face image
        face_image = None
        
        # Try file upload first
        if 'face_image' in request.files:
            image_file = request.files['face_image']
            try:
                image_data = image_file.read()
                pil_image = Image.open(io.BytesIO(image_data))
                if pil_image.mode != 'RGB':
                    pil_image = pil_image.convert('RGB')
                face_image = np.array(pil_image)
            except Exception as e:
                logger.error(f"Error processing image file: {e}")
        
        # Try base64 image from JSON
        if face_image is None:
            import base64
            image_base64 = data.get('face_image_base64')
            if image_base64:
                try:
                    image_data = base64.b64decode(image_base64)
                    pil_image = Image.open(io.BytesIO(image_data))
                    if pil_image.mode != 'RGB':
                        pil_image = pil_image.convert('RGB')
                    face_image = np.array(pil_image)
                except Exception as e:
                    logger.error(f"Error processing base64 image: {e}")
        
        if face_image is None:
            return jsonify({
                'success': False,
                'message': '❌ No face image provided'
            }), 400
        
        # Verify login with face
        success, message, user_id = face_login_handler.verify_login_with_face(
            username=username,
            password=password,
            face_image=face_image
        )
        
        response = {
            'success': success,
            'message': message,
        }
        
        if success:
            response['user_id'] = user_id
            response['token'] = generate_auth_token(user_id)  # Add JWT token
        
        return jsonify(response), 200 if success else 401
        
    except Exception as e:
        logger.error(f"Face login error: {e}")
        return jsonify({
            'success': False,
            'message': f'❌ Server error: {str(e)}'
        }), 500


@face_auth_bp.route('/traditional-login', methods=['POST'])
def traditional_login():
    """
    Fallback: Login with username and password only
    (for students without face registration)
    """
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({
                'success': False,
                'message': '❌ Username and password required'
            }), 400
        
        # Verify credentials
        user = face_login_handler._verify_credentials(username, password)
        if not user:
            return jsonify({
                'success': False,
                'message': '❌ Invalid username or password'
            }), 401
        
        # Check if face login is required
        student = face_login_handler._get_linked_student(user['id'])
        if student and student.get('require_face_login'):
            return jsonify({
                'success': False,
                'message': '❌ Face recognition is required for this account. Please use face login.',
                'require_face_login': True
            }), 403
        
        # Update last login and return token
        face_login_handler._update_last_login(user['id'])
        
        return jsonify({
            'success': True,
            'message': '✅ Login successful',
            'user_id': user['id'],
            'token': generate_auth_token(user['id'])
        }), 200
        
    except Exception as e:
        logger.error(f"Traditional login error: {e}")
        return jsonify({
            'success': False,
            'message': f'❌ Server error: {str(e)}'
        }), 500


@face_auth_bp.route('/check-face-registration/<username>', methods=['GET'])
def check_face_registration(username):
    """
    Check if a username has face registration
    Used by frontend to determine login method
    """
    try:
        user = face_login_handler._verify_credentials(username, '')
        if not user:
            return jsonify({
                'success': False,
                'has_face_registration': False,
                'require_face_login': False
            }), 200
        
        student = face_login_handler._get_linked_student(user['id'])
        if not student:
            return jsonify({
                'success': True,
                'has_face_registration': False,
                'require_face_login': False
            }), 200
        
        return jsonify({
            'success': True,
            'has_face_registration': student.get('face_registered', False),
            'require_face_login': student.get('require_face_login', False),
            'face_login_enabled': student.get('face_login_enabled', True)
        }), 200
        
    except Exception as e:
        logger.error(f"Error checking face registration: {e}")
        return jsonify({
            'success': False,
            'message': f'❌ Server error: {str(e)}'
        }), 500


@face_auth_bp.route('/verify-student-identity', methods=['POST'])
def verify_student_identity():
    """
    ADMIN: Verify that roll number and username match the same student
    Used during face registration to confirm identity before linking
    """
    try:
        data = request.get_json()
        roll_number = data.get('roll_number', '').strip()
        username = data.get('username', '').strip()
        
        if not roll_number or not username:
            return jsonify({
                'success': False,
                'message': '❌ Roll number and username required'
            }), 400
        
        # Find student by rollno
        student = face_reg_handler._find_student_by_rollno(roll_number)
        if not student:
            return jsonify({
                'success': False,
                'message': f'❌ No student found with roll number: {roll_number}'
            }), 404
        
        # Find or create user
        user = face_reg_handler._find_or_create_user(username, student)
        if not user:
            return jsonify({
                'success': False,
                'message': f'❌ Could not find/create user: {username}'
            }), 400
        
        # Check if already linked
        if student.get('user_id') and student['user_id'] != user['id']:
            return jsonify({
                'success': False,
                'message': '❌ This student is already linked to a different account',
                'linked_username': None
            }), 409
        
        # Return student and user info for admin verification
        return jsonify({
            'success': True,
            'message': '✅ Identity verified',
            'student_info': {
                'id': student['id'],
                'student_id': student['student_id'],
                'roll_number': student['roll_number'],
                'name': f"{student['first_name']} {student.get('last_name', '')}",
                'email': student['email']
            },
            'user_info': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email']
            },
            'already_linked': student.get('user_id') is not None
        }), 200
        
    except Exception as e:
        logger.error(f"Error verifying identity: {e}")
        return jsonify({
            'success': False,
            'message': f'❌ Server error: {str(e)}'
        }), 500


def generate_auth_token(user_id):
    """
    Generate JWT token for authenticated user
    TODO: Implement proper JWT generation
    """
    import jwt
    from datetime import datetime, timedelta
    
    payload = {
        'user_id': user_id,
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(hours=24)
    }
    
    # Use your secret key - should be in environment variables
    secret = 'your-secret-key-here'  # TODO: Move to config
    
    token = jwt.encode(payload, secret, algorithm='HS256')
    return token
