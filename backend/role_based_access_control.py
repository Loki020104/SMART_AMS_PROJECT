"""
RBAC Module - Role-Based Access Control for SMART AMS
Provides decorators and utilities for role-based authorization
"""

from functools import wraps
from flask import request, jsonify
from enum import Enum

# ── Role Definitions ──
class UserRole(Enum):
    """System roles with hierarchy"""
    ADMIN = 1         # Full access to everything
    DEAN = 2          # Access to their school/college data
    HOD = 3           # Access to their department data
    FACULTY = 4       # Access to their class/subject data
    STUDENT = 5       # Access only to their own data

# Role hierarchy: Lower number = higher privilege
ROLE_HIERARCHY = {
    'admin': UserRole.ADMIN,
    'dean': UserRole.DEAN,
    'hod': UserRole.HOD,
    'faculty': UserRole.FACULTY,
    'student': UserRole.STUDENT,
}

# ── Scope Models ──
class DataScope:
    """Defines what data a user can access"""
    def __init__(self, role, user_id=None, department_id=None, school_id=None, class_ids=None):
        self.role = role
        self.user_id = user_id
        self.department_id = department_id  # For HOD
        self.school_id = school_id          # For Dean
        self.class_ids = class_ids or []    # For Faculty
    
    def can_view_user(self, target_user):
        """Check if user can view another user"""
        if self.role == UserRole.ADMIN:
            return True
        if self.role == UserRole.DEAN:
            return target_user.get('school_id') == self.school_id
        if self.role == UserRole.HOD:
            return target_user.get('department_id') == self.department_id
        if self.role == UserRole.FACULTY:
            return target_user.get('id') == self.user_id  # Only their own
        if self.role == UserRole.STUDENT:
            return target_user.get('id') == self.user_id  # Only themselves
        return False
    
    def can_view_analytics(self, analytics_type, target_scope):
        """Check if user can view specific analytics"""
        if self.role == UserRole.ADMIN:
            return True
        if self.role == UserRole.DEAN:
            return target_scope.get('school_id') == self.school_id
        if self.role == UserRole.HOD:
            return target_scope.get('department_id') == self.department_id
        if self.role == UserRole.FACULTY:
            return target_scope.get('class_id') in self.class_ids or \
                   target_scope.get('faculty_id') == self.user_id
        if self.role == UserRole.STUDENT:
            return target_scope.get('roll_no') == self.user_id or \
                   target_scope.get('student_id') == self.user_id
        return False
    
    def get_data_filters(self):
        """Return database filters based on role"""
        filters = {}
        if self.role == UserRole.ADMIN:
            return {}  # No filters
        elif self.role == UserRole.DEAN:
            filters['school_id'] = self.school_id
        elif self.role == UserRole.HOD:
            filters['department_id'] = self.department_id
        elif self.role == UserRole.FACULTY:
            filters['assigned_classes'] = self.class_ids
        elif self.role == UserRole.STUDENT:
            filters['roll_no'] = self.user_id
        return filters


# ── Decorators ──
def require_role(*allowed_roles):
    """Decorator: Require user to have one of the specified roles"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            user_role = user.get('role', 'student').lower()
            if user_role not in [r.lower() for r in allowed_roles]:
                return jsonify(
                    success=False,
                    error=f"Insufficient permissions. Required: {', '.join(allowed_roles)}"
                ), 403
            
            return f(*args, **kwargs)
        return decorated
    return decorator


def require_minimum_role(minimum_role):
    """Decorator: Require user to have at least minimum_role (or higher privilege)"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            user_role_str = user.get('role', 'student').lower()
            user_role = ROLE_HIERARCHY.get(user_role_str)
            min_role = ROLE_HIERARCHY.get(minimum_role.lower())
            
            if not user_role or not min_role:
                return jsonify(success=False, error="Invalid role configuration"), 500
            
            # Lower enum value = higher privilege
            if user_role.value > min_role.value:
                return jsonify(
                    success=False,
                    error=f"Insufficient permissions. Minimum role required: {minimum_role}"
                ), 403
            
            return f(*args, **kwargs)
        return decorated
    return decorator


def rbac_scope_check(data_scope_getter):
    """Decorator: Check if user can access the requested data scope"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = request.user if hasattr(request, 'user') else None
            if not user:
                return jsonify(success=False, error="Unauthorized"), 401
            
            # Get the scope to check
            try:
                target_scope = data_scope_getter(request, *args, **kwargs)
            except Exception as e:
                return jsonify(success=False, error=f"Scope check failed: {str(e)}"), 400
            
            # Create user's scope
            user_scope = DataScope(
                role=ROLE_HIERARCHY.get(user.get('role', 'student').lower()),
                user_id=user.get('id') or user.get('roll_no'),
                department_id=user.get('department_id'),
                school_id=user.get('school_id'),
                class_ids=user.get('assigned_classes', [])
            )
            
            # Check access
            if not user_scope.can_view_analytics('generic', target_scope):
                return jsonify(success=False, error="Access denied to this data"), 403
            
            # Add scope to request for use in handler
            request.user_scope = user_scope
            request.target_scope = target_scope
            
            return f(*args, **kwargs)
        return decorated
    return decorator


# ── Middleware ──
def apply_rbac_middleware(app):
    """Register RBAC middleware with Flask app"""
    
    @app.before_request
    def load_user_context():
        """Load user context from request (auth token, session, etc.)"""
        # This should be called AFTER authentication (Firebase, JWT, etc.)
        # Example: from Firebase token
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            # Extract and verify token
            # For now, we'll set a placeholder if it exists
            request.user = getattr(request, 'firebase_user', None)
        # Also check for session-based auth
        if not hasattr(request, 'user'):
            request.user = None


# ── Helper Functions ──
def get_user_scope(user):
    """Create a DataScope object from user data"""
    if not user:
        return None
    
    role = ROLE_HIERARCHY.get(user.get('role', 'student').lower())
    return DataScope(
        role=role,
        user_id=user.get('id') or user.get('roll_no'),
        department_id=user.get('department_id'),
        school_id=user.get('school_id'),
        class_ids=user.get('assigned_classes', [])
    )


def get_accessible_students(user, sb=None):
    """Get list of students the user can view based on role"""
    if not user or not sb:
        return []
    
    role = user.get('role', 'student').lower()
    
    if role == 'admin':
        # All students
        result = sb.table("users").select("*").eq("role", "student").execute()
        return result.data or []
    
    elif role == 'dean':
        # Students in their school
        result = sb.table("users").select("*").eq("role", "student").eq("school_id", user.get('school_id')).execute()
        return result.data or []
    
    elif role == 'hod':
        # Students in their department
        result = sb.table("users").select("*").eq("role", "student").eq("department_id", user.get('department_id')).execute()
        return result.data or []
    
    elif role == 'faculty':
        # Students in their assigned classes
        assigned_classes = user.get('assigned_classes', [])
        if not assigned_classes:
            return []
        # Query students in assigned classes
        result = sb.table("users").select("*").eq("role", "student").execute()
        students = [s for s in (result.data or []) if s.get('class_id') in assigned_classes]
        return students
    
    else:  # student
        # Only themselves
        return [user]


def get_accessible_classes(user, sb=None):
    """Get list of classes the user can view"""
    if not user or not sb:
        return []
    
    role = user.get('role', 'student').lower()
    
    if role == 'admin':
        result = sb.table("classes").select("*").execute()
        return result.data or []
    
    elif role == 'dean':
        result = sb.table("classes").select("*").eq("school_id", user.get('school_id')).execute()
        return result.data or []
    
    elif role == 'hod':
        result = sb.table("classes").select("*").eq("department_id", user.get('department_id')).execute()
        return result.data or []
    
    elif role == 'faculty':
        # Classes assigned to this faculty
        assigned_classes = user.get('assigned_classes', [])
        if not assigned_classes:
            return []
        result = sb.table("classes").select("*").execute()
        classes = [c for c in (result.data or []) if c.get('id') in assigned_classes]
        return classes
    
    else:  # student
        # Only their class
        class_id = user.get('class_id')
        if not class_id:
            return []
        result = sb.table("classes").select("*").eq("id", class_id).execute()
        return result.data or []


def get_role_dashboard_path(role):
    """Get the dashboard path for a given role"""
    role_dashboard_map = {
        'admin': '/admin-dashboard',
        'dean': '/dean-dashboard',
        'hod': '/hod-dashboard',
        'faculty': '/faculty-dashboard',
        'student': '/student-dashboard',
    }
    return role_dashboard_map.get(role.lower(), '/dashboard')


# ── Permission Levels ──
PERMISSIONS = {
    'admin': {
        'view_all_analytics': True,
        'view_all_students': True,
        'view_all_classes': True,
        'edit_system_config': True,
        'manage_users': True,
        'export_reports': True,
    },
    'dean': {
        'view_all_analytics': True,  # For their school
        'view_all_students': True,    # In their school
        'view_all_classes': True,     # In their school
        'edit_system_config': False,
        'manage_users': True,          # In their school
        'export_reports': True,        # For their school
    },
    'hod': {
        'view_all_analytics': True,   # For their department
        'view_all_students': True,     # In their department
        'view_all_classes': True,      # In their department
        'edit_system_config': False,
        'manage_users': False,         # Can't create users
        'export_reports': True,        # For their department
    },
    'faculty': {
        'view_all_analytics': False,
        'view_all_students': False,    # Only assigned classes
        'view_all_classes': False,     # Only assigned classes
        'edit_system_config': False,
        'manage_users': False,
        'export_reports': True,        # For their classes
    },
    'student': {
        'view_all_analytics': False,
        'view_all_students': False,
        'view_all_classes': False,
        'edit_system_config': False,
        'manage_users': False,
        'export_reports': False,
    },
}


def has_permission(user_role, permission):
    """Check if a role has a specific permission"""
    role_perms = PERMISSIONS.get(user_role.lower(), {})
    return role_perms.get(permission, False)
