"""
PostgreSQL Database Connection Module for Smart AMS
Handles all database operations and connection pooling
"""

import os
import psycopg2
from psycopg2 import pool, extras
from psycopg2.extras import RealDictCursor
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseConnection:
    """PostgreSQL database connection handler with connection pooling"""
    
    # Database connection pool (class variable - shared across instances)
    _connection_pool = None
    
    # Default database configuration
    DB_CONFIG = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': os.getenv('DB_PORT', '5432'),
        'database': os.getenv('DB_NAME', 'smartams'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', 'postgres'),
        'minconn': 2,
        'maxconn': 10,
    }
    
    @classmethod
    def get_pool(cls):
        """Get or create the connection pool"""
        if cls._connection_pool is None:
            try:
                cls._connection_pool = psycopg2.pool.SimpleConnectionPool(
                    cls.DB_CONFIG['minconn'],
                    cls.DB_CONFIG['maxconn'],
                    host=cls.DB_CONFIG['host'],
                    port=cls.DB_CONFIG['port'],
                    database=cls.DB_CONFIG['database'],
                    user=cls.DB_CONFIG['user'],
                    password=cls.DB_CONFIG['password']
                )
                logger.info(f"✅ Database connection pool created "
                           f"(host: {cls.DB_CONFIG['host']}, "
                           f"db: {cls.DB_CONFIG['database']})")
            except psycopg2.Error as e:
                logger.error(f"❌ Failed to create connection pool: {e}")
                raise
        return cls._connection_pool
    
    @classmethod
    def get_connection(cls):
        """Get a connection from the pool"""
        try:
            pool = cls.get_pool()
            return pool.getconn()
        except psycopg2.Error as e:
            logger.error(f"❌ Failed to get connection: {e}")
            raise
    
    @classmethod
    def return_connection(cls, conn):
        """Return a connection to the pool"""
        try:
            pool = cls.get_pool()
            if conn:
                pool.putconn(conn)
        except Exception as e:
            logger.error(f"❌ Error returning connection: {e}")
    
    @classmethod
    def execute_query(cls, query, params=None, fetch_one=False):
        """
        Execute a SELECT query
        
        Args:
            query: SQL query string
            params: Query parameters (tuple or dict)
            fetch_one: If True, fetch single row; else fetch all
            
        Returns:
            Single row dict, list of row dicts, or None
        """
        conn = None
        try:
            conn = cls.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(query, params or ())
            
            if fetch_one:
                result = cursor.fetchone()
            else:
                result = cursor.fetchall()
            
            cursor.close()
            return result
            
        except psycopg2.Error as e:
            logger.error(f"❌ Query execution error: {e}\nQuery: {query}")
            return None
        finally:
            cls.return_connection(conn)
    
    @classmethod
    def execute_update(cls, query, params=None):
        """
        Execute an INSERT, UPDATE, or DELETE query
        
        Args:
            query: SQL query string
            params: Query parameters (tuple or dict)
            
        Returns:
            Number of rows affected, or -1 on error
        """
        conn = None
        try:
            conn = cls.get_connection()
            cursor = conn.cursor()
            cursor.execute(query, params or ())
            rows_affected = cursor.rowcount
            conn.commit()
            cursor.close()
            
            return rows_affected
            
        except psycopg2.Error as e:
            if conn:
                conn.rollback()
            logger.error(f"❌ Update execution error: {e}\nQuery: {query}")
            return -1
        finally:
            cls.return_connection(conn)
    
    @classmethod
    def execute_transaction(cls, queries):
        """
        Execute multiple queries in a single transaction
        
        Args:
            queries: List of (query, params) tuples
            
        Returns:
            True on success, False on failure
        """
        conn = None
        try:
            conn = cls.get_connection()
            cursor = conn.cursor()
            
            for query, params in queries:
                cursor.execute(query, params or ())
            
            conn.commit()
            cursor.close()
            return True
            
        except psycopg2.Error as e:
            if conn:
                conn.rollback()
            logger.error(f"❌ Transaction error: {e}")
            return False
        finally:
            cls.return_connection(conn)
    
    @classmethod
    def test_connection(cls):
        """Test the database connection"""
        try:
            conn = cls.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1 as alive")
            result = cursor.fetchone()
            cursor.close()
            cls.return_connection(conn)
            
            if result:
                logger.info("✅ Database connection test successful")
                return True
            return False
        except Exception as e:
            logger.error(f"❌ Database connection test failed: {e}")
            return False
    
    @classmethod
    def close_pool(cls):
        """Close all connections in the pool"""
        if cls._connection_pool:
            try:
                cls._connection_pool.closeall()
                cls._connection_pool = None
                logger.info("✅ Connection pool closed")
            except Exception as e:
                logger.error(f"❌ Error closing connection pool: {e}")


# Convenience functions
def get_user_by_username(username):
    """Get user by username"""
    query = """
    SELECT id, email, username, password_hash, full_name, user_type, 
           is_active, created_at, last_login
    FROM users 
    WHERE username = %s AND is_active = true
    """
    return DatabaseConnection.execute_query(query, (username,), fetch_one=True)


def get_student_by_rollno(roll_number):
    """Get student by roll number"""
    query = """
    SELECT * FROM students 
    WHERE roll_number = %s AND is_active = true
    """
    return DatabaseConnection.execute_query(query, (roll_number,), fetch_one=True)


def get_student_by_user_id(user_id):
    """Get student by user ID"""
    query = """
    SELECT * FROM students 
    WHERE user_id = %s AND is_active = true
    """
    return DatabaseConnection.execute_query(query, (user_id,), fetch_one=True)


def save_user(email, username, password_hash, full_name, user_type='student'):
    """Create a new user"""
    query = """
    INSERT INTO users (email, username, password_hash, full_name, user_type, is_active)
    VALUES (%s, %s, %s, %s, %s, true)
    RETURNING id, email, username, full_name, user_type
    """
    params = (email, username, password_hash, full_name, user_type)
    return DatabaseConnection.execute_query(query, params, fetch_one=True)


def save_face_encoding(student_id, encoding_vector, quality_score, image_hash, landmarks_count, confidence_score, is_primary=True):
    """Save face encoding for a student"""
    query = """
    INSERT INTO face_encodings 
    (student_id, encoding_vector, quality_score, image_hash, landmarks_count, confidence_score, is_primary, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
    RETURNING id, student_id, quality_score, created_at
    """
    params = (student_id, encoding_vector, quality_score, image_hash, landmarks_count, confidence_score, is_primary)
    return DatabaseConnection.execute_query(query, params, fetch_one=True)


def get_face_encoding(student_id):
    """Get primary face encoding for a student"""
    query = """
    SELECT id, student_id, encoding_vector, quality_score, confidence_score
    FROM face_encodings
    WHERE student_id = %s AND is_primary = true
    ORDER BY created_at DESC
    LIMIT 1
    """
    return DatabaseConnection.execute_query(query, (student_id,), fetch_one=True)


def update_user_last_login(user_id):
    """Update user's last login timestamp"""
    query = """
    UPDATE users 
    SET last_login = NOW()
    WHERE id = %s
    """
    return DatabaseConnection.execute_update(query, (user_id,)) > 0


def save_attendance(student_id, course_id, marked_date, marked_time, method='face_recognition', status='present', **kwargs):
    """Save attendance record"""
    query = """
    INSERT INTO attendance 
    (student_id, course_id, marked_at, marked_date, marked_time, method, status, created_at)
    VALUES (%s, %s, NOW(), %s, %s, %s, %s, NOW())
    RETURNING id, student_id, course_id, marked_date, status
    """
    params = (student_id, course_id, marked_date, marked_time, method, status)
    return DatabaseConnection.execute_query(query, params, fetch_one=True)


if __name__ == '__main__':
    # Test the database connection
    print("Testing database connection...")
    if DatabaseConnection.test_connection():
        print("✅ All systems operational!")
    else:
        print("❌ Database connection failed!")
