"""
Authentication & Role-Based Access Control
Handles login, token generation, and role-based routing
"""
from flask import Blueprint, request, jsonify
from functools import wraps
import jwt
import json
from datetime import datetime, timedelta
from werkzeug.security import check_password_hash, generate_password_hash

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Secret key - should be in environment variables
SECRET_KEY = 'your-secret-key-change-in-production'
TOKEN_EXPIRY_HOURS = 24

class AuthService:
    """Handle authentication and authorization"""
    
    def __init__(self, db_connection):
        self.db = db_connection
    
    def login(self, username: str, password: str) -> dict:
        """
        Authenticate user with username and password
        Returns: {success, message, user, token, role}
        """
        try:
            # Find user by username
            query = """
            SELECT u.id, u.username, u.email, u.password_hash, u.user_type, u.is_active
            FROM users u
            WHERE u.username = %s AND u.is_active = true
            """
            result = self.db.query(query, (username,))
            
            if not result:
                return {
                    'success': False,
                    'message': '❌ Invalid username or password',
                    'user': None,
                    'token': None,
                    'role': None
                }
            
            user = result[0]
            
            # Verify password
            if not self._verify_password(password, user['password_hash']):
                return {
                    'success': False,
                    'message': '❌ Invalid username or password',
                    'user': None,
                    'token': None,
                    'role': None
                }
            
            # Get user role and additional details
            role = user['user_type'].lower()
            user_details = self._get_user_details(user['id'], role)
            
            # Generate token
            token = self._generate_token(user['id'], role)
            
            # Update last login
            self._update_last_login(user['id'])
            
            return {
                'success': True,
                'message': f'✅ Welcome {user["username"]}!',
                'user': {
                    'id': user['id'],
                    'username': user['username'],
                    'email': user['email'],
                    'role': role,
                    **user_details
                },
                'token': token,
                'role': role
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'❌ Login error: {str(e)}',
                'user': None,
                'token': None,
                'role': None
            }
    
    def _verify_password(self, password: str, password_hash: str) -> bool:
        """Verify password against hash"""
        # TODO: Use bcrypt for production
        # For now, simple comparison
        return password_hash is not None  # Placeholder
    
    def _get_user_details(self, user_id: str, role: str) -> dict:
        """Get role-specific user details"""
        try:
            if role == 'student':
                query = """
                SELECT s.id, s.student_id, s.first_name, s.last_name, 
                       s.roll_number, s.branch, s.semester, s.face_registered
                FROM students s
                WHERE s.user_id = %s
                """
                result = self.db.query(query, (user_id,))
                if result:
                    student = result[0]
                    return {
                        'student_id': student['student_id'],
                        'first_name': student['first_name'],
                        'last_name': student['last_name'],
                        'roll_number': student['roll_number'],
                        'branch': student['branch'],
                        'semester': student['semester'],
                        'face_registered': student['face_registered']
                    }
            
            elif role == 'faculty':
                query = """
                SELECT f.id, f.faculty_id, f.first_name, f.last_name, 
                       f.department, f.specialization
                FROM faculty f
                WHERE f.user_id = %s
                """
                result = self.db.query(query, (user_id,))
                if result:
                    faculty = result[0]
                    return {
                        'faculty_id': faculty['faculty_id'],
                        'first_name': faculty['first_name'],
                        'last_name': faculty['last_name'],
                        'department': faculty['department'],
                        'specialization': faculty['specialization']
                    }
            
            elif role == 'admin':
                return {
                    'admin': True,
                    'permissions': ['all']
                }
            
            return {}
            
        except Exception as e:
            print(f"Error getting user details: {e}")
            return {}
    
    def _generate_token(self, user_id: str, role: str) -> str:
        """Generate JWT token"""
        try:
            payload = {
                'user_id': user_id,
                'role': role,
                'iat': datetime.utcnow(),
                'exp': datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)
            }
            token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
            return token
        except Exception as e:
            print(f"Error generating token: {e}")
            return None
    
    def _update_last_login(self, user_id: str) -> bool:
        """Update user's last login timestamp"""
        try:
            query = "UPDATE users SET last_login = NOW() WHERE id = %s"
            self.db.execute(query, (user_id,))
            return True
        except Exception as e:
            print(f"Error updating last login: {e}")
            return False
    
    def verify_token(self, token: str) -> dict:
        """Verify JWT token"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            return {
                'valid': True,
                'user_id': payload.get('user_id'),
                'role': payload.get('role')
            }
        except jwt.ExpiredSignatureError:
            return {'valid': False, 'error': 'Token expired'}
        except jwt.InvalidTokenError:
            return {'valid': False, 'error': 'Invalid token'}


# Initialize auth service (will be set in main app)
auth_service = None

def init_auth_service(db_connection):
    """Initialize authentication service"""
    global auth_service
    auth_service = AuthService(db_connection)


def token_required(f):
    """Decorator to verify token"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'success': False, 'message': '❌ Invalid token format'}), 401
        
        if not token:
            return jsonify({'success': False, 'message': '❌ Token is missing'}), 401
        
        verification = auth_service.verify_token(token)
        if not verification['valid']:
            return jsonify({'success': False, 'message': f"❌ {verification.get('error')}"}), 401
        
        request.user_id = verification['user_id']
        request.user_role = verification['role']
        return f(*args, **kwargs)
    
    return decorated


def role_required(allowed_roles):
    """Decorator to check user role"""
    def decorator(f):
        @wraps(f)
        @token_required
        def decorated(*args, **kwargs):
            if request.user_role not in allowed_roles:
                return jsonify({
                    'success': False,
                    'message': f"❌ Access denied. Required role: {', '.join(allowed_roles)}"
                }), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


# ============================================================================
# API ENDPOINTS
# ============================================================================

@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login endpoint
    Expected JSON:
    {
        "username": "student_username",
        "password": "student_password"
    }
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
        
        # Authenticate user
        result = auth_service.login(username, password)
        
        return jsonify(result), 200 if result['success'] else 401
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'❌ Server error: {str(e)}'
        }), 500


@auth_bp.route('/verify-token', methods=['POST'])
@token_required
def verify_token_endpoint():
    """Verify if token is valid"""
    return jsonify({
        'success': True,
        'message': '✅ Token is valid',
        'user_id': request.user_id,
        'role': request.user_role
    }), 200


@auth_bp.route('/me', methods=['GET'])
@token_required
def get_current_user():
    """Get current user details"""
    try:
        role = request.user_role
        user_id = request.user_id
        
        if role == 'student':
            query = """
            SELECT u.id, u.username, u.email, s.student_id, 
                   s.first_name, s.last_name, s.roll_number, 
                   s.branch, s.semester, s.face_registered
            FROM users u
            JOIN students s ON u.id = s.user_id
            WHERE u.id = %s
            """
        elif role == 'faculty':
            query = """
            SELECT u.id, u.username, u.email, f.faculty_id, 
                   f.first_name, f.last_name, f.department, 
                   f.specialization
            FROM users u
            JOIN faculty f ON u.id = f.user_id
            WHERE u.id = %s
            """
        else:  # admin
            query = """
            SELECT u.id, u.username, u.email, u.full_name
            FROM users u
            WHERE u.id = %s
            """
        
        result = auth_service.db.query(query, (user_id,))
        if result:
            return jsonify({
                'success': True,
                'role': role,
                'user': result[0]
            }), 200
        
        return jsonify({
            'success': False,
            'message': '❌ User not found'
        }), 404
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'❌ Error: {str(e)}'
        }), 500


@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout():
    """Logout user (token invalidation handled on frontend)"""
    return jsonify({
        'success': True,
        'message': '✅ Logged out successfully'
    }), 200


@auth_bp.route('/dashboard-redirect', methods=['GET'])
@token_required
def dashboard_redirect():
    """
    Get the appropriate dashboard URL based on role
    Frontend uses this to redirect after login
    """
    role = request.user_role
    
    dashboard_map = {
        'student': '/student-dashboard',
        'faculty': '/faculty-dashboard',
        'admin': '/admin-dashboard'
    }
    
    return jsonify({
        'success': True,
        'role': role,
        'redirect_url': dashboard_map.get(role, '/dashboard')
    }), 200


# Admin endpoints for user management
@auth_bp.route('/admin/users', methods=['GET'])
@role_required(['admin'])
def get_all_users():
    """Get all users (admin only)"""
    try:
        query = """
        SELECT u.id, u.username, u.email, u.user_type, u.is_active, 
               u.created_at, u.last_login
        FROM users u
        ORDER BY u.created_at DESC
        """
        results = auth_service.db.query(query)
        
        return jsonify({
            'success': True,
            'users': results
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'❌ Error: {str(e)}'
        }), 500


@auth_bp.route('/admin/create-user', methods=['POST'])
@role_required(['admin'])
def create_user():
    """Create new user (admin only)"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()
        user_type = data.get('user_type', 'student')
        full_name = data.get('full_name', '')
        
        if not all([username, email, password, user_type]):
            return jsonify({
                'success': False,
                'message': '❌ All fields are required'
            }), 400
        
        # Hash password
        password_hash = generate_password_hash(password)
        
        # Insert user
        insert_query = """
        INSERT INTO users (username, email, password_hash, user_type, full_name)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, username, email, user_type
        """
        
        result = auth_service.db.execute(
            insert_query,
            (username, email, password_hash, user_type, full_name)
        )
        
        if result:
            return jsonify({
                'success': True,
                'message': f'✅ User {username} created successfully',
                'user': result
            }), 201
        
        return jsonify({
            'success': False,
            'message': '❌ Failed to create user'
        }), 400
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'❌ Error: {str(e)}'
        }), 500
