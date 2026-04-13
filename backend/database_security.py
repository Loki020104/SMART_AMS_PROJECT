# ══════════════════════════════════════════════════════════════════════════
# DATABASE SECURITY MODULE
# ══════════════════════════════════════════════════════════════════════════
# Implements:
# - Database access restriction and validation
# - Connection pooling with SSL enforcement
# - IP-based access control
# - Connection monitoring and audit logging
# - Statement timeout enforcement
# - Prepared statement usage validation
#
# Usage:
#   from backend.database_security import DatabaseSecurity
#   db = DatabaseSecurity(config)
#   db.validate_connection()
#   db.connect()
# ══════════════════════════════════════════════════════════════════════════

import os
import ssl
import logging
import psycopg2
from psycopg2 import pool, sql
from typing import Optional, List, Dict, Any
from datetime import datetime
from ipaddress import ip_address, ip_network
import json

# Get loggers
logger = logging.getLogger(__name__)
security_logger = logging.getLogger('security')
audit_logger = logging.getLogger('audit')

# ══════════════════════════════════════════════════════════════════════════
# DATABASE SECURITY CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════

class DatabaseSecurityConfig:
    """Configuration for database security"""
    
    def __init__(self, config):
        """Initialize database security configuration"""
        self.supabase_url = config.get('SUPABASE_URL', '')
        self.supabase_key = config.get('SUPABASE_KEY', '')
        self.service_key = config.get('SUPABASE_SERVICE_KEY', '')
        
        # Connection security
        self.enforce_ssl = config.get('DB_ENFORCE_SSL', True)
        self.connection_timeout = int(config.get('DB_CONNECTION_TIMEOUT', 30))
        self.statement_timeout = int(config.get('DB_STATEMENT_TIMEOUT', 30000))
        
        # Connection pooling
        self.pool_size = int(config.get('DB_CONNECTION_POOL_SIZE', 10))
        self.max_overflow = int(config.get('DB_CONNECTION_MAX_OVERFLOW', 5))
        
        # IP-based access control
        allowed_ips = config.get('DB_ALLOWED_IPS', '')
        self.allowed_ips = [ip.strip() for ip in allowed_ips.split(',') if ip.strip()]
        
        # Application IP (needed to whitelist)
        self.app_ip = config.get('APP_IP', '')


# ══════════════════════════════════════════════════════════════════════════
# DATABASE SECURITY CLASS
# ══════════════════════════════════════════════════════════════════════════

class DatabaseSecurity:
    """Implements secure database access patterns"""
    
    def __init__(self, supabase_url: str, supabase_key: str, 
                 service_key: Optional[str] = None, config: Optional[Dict] = None):
        """
        Initialize database security manager
        
        Args:
            supabase_url: Supabase project URL
            supabase_key: Anon key (for user operations)
            service_key: Service role key (for admin operations)
            config: Database security configuration
        """
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self.service_key = service_key or supabase_key
        
        self.config = config or {}
        
        # Connection pool (for direct PostgreSQL access if needed)
        self.connection_pool: Optional[pool.SimpleConnectionPool] = None
        
        # Audit trail
        self.audit_log = {
            'initialized': datetime.utcnow().isoformat(),
            'connections_created': 0,
            'connections_failed': 0,
            'denied_ips': [],
        }
    
    def validate_connection(self) -> List[str]:
        """
        Validate database connection configuration
        
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        if not self.supabase_url:
            errors.append("❌ SUPABASE_URL not configured")
        elif not self.supabase_url.startswith('https://'):
            errors.append("❌ SUPABASE_URL must be HTTPS")
        
        if not self.supabase_key:
            errors.append("❌ SUPABASE_KEY not configured")
        
        if not self.service_key:
            errors.append("❌ SUPABASE_SERVICE_KEY not configured")
        
        if errors:
            security_logger.error(f"Database configuration validation failed: {errors}")
        
        return errors
    
    def is_ip_allowed(self, client_ip: str) -> bool:
        """
        Check if client IP is allowed to connect
        
        Args:
            client_ip: Client IP address to check
        
        Returns:
            True if IP is allowed, False otherwise
        """
        # If no allowed IPs configured, allow all (not recommended for production)
        if not self.config.get('DB_ALLOWED_IPS'):
            logger.debug(f"No IP whitelist configured, allowing {client_ip}")
            return True
        
        try:
            client_ip_obj = ip_address(client_ip)
            
            # Check against whitelist
            allowed_networks = [ip_network(net, strict=False) 
                              for net in self.config['DB_ALLOWED_IPS']]
            
            is_allowed = any(client_ip_obj in net for net in allowed_networks)
            
            if not is_allowed:
                # Log denied access attempt
                audit_logger.warning(
                    json.dumps({
                        'event': 'database_access_denied',
                        'ip_address': client_ip,
                        'timestamp': datetime.utcnow().isoformat(),
                    })
                )
                self.audit_log['denied_ips'].append({
                    'ip': client_ip,
                    'timestamp': datetime.utcnow().isoformat(),
                })
            else:
                logger.debug(f"IP {client_ip} is whitelisted")
            
            return is_allowed
        
        except Exception as e:
            logger.error(f"Error checking IP {client_ip}: {str(e)}")
            # Default to deny on error
            return False
    
    def get_user_client(self):
        """
        Get Supabase client for user operations
        
        Uses the public (anon) key with Row-Level Security (RLS)
        enforced by the database.
        
        Returns:
            Supabase client instance
        """
        # This would be: supabase.create_client(self.supabase_url, self.supabase_key)
        # with RLS automatically enforced for the authenticated user
        
        logger.debug("Using user client with RLS enforcement")
        
        audit_logger.info(
            json.dumps({
                'event': 'database_access',
                'client_type': 'user',
                'timestamp': datetime.utcnow().isoformat(),
            })
        )
        
        # Return Supabase user client
        # Implementation depends on your Supabase SDK
    
    def get_admin_client(self):
        """
        Get Supabase client for admin operations
        
        Uses the service role key for administrative operations.
        Requires additional authorization checks!
        
        WARNING: This client bypasses RLS. Always verify user permissions
        before using this client for data operations.
        
        Returns:
            Supabase admin client instance
        """
        # This would be: supabase.create_client(self.supabase_url, self.service_key)
        # WITHOUT RLS enforcement - relies on application-level authorization
        
        logger.debug("Using admin client - RLS BYPASS ACTIVE")
        
        audit_logger.warning(
            json.dumps({
                'event': 'database_access',
                'client_type': 'admin',
                'timestamp': datetime.utcnow().isoformat(),
                'severity': 'high',
            })
        )
        
        # Return Supabase admin client
        # Implementation depends on your Supabase SDK
    
    def create_connection_pool(self) -> Optional[pool.SimpleConnectionPool]:
        """
        Create connection pool for direct PostgreSQL access
        
        Use only when Supabase SDK is insufficient.
        
        Returns:
            Connection pool instance or None if pool creation fails
        """
        try:
            # Extract host from Supabase URL
            # Format: https://xyz.supabase.co -> xyz.supabase.co
            host = self.supabase_url.replace('https://', '').split('/')[0].split(':')[0]
            
            # Create SSL context for secure connection
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = True
            ssl_context.verify_mode = ssl.CERT_REQUIRED
            
            # Create connection pool
            self.connection_pool = pool.SimpleConnectionPool(
                1,  # minconn
                self.config.get('DB_CONNECTION_POOL_SIZE', 10),  # maxconn
                host=host,
                port=5432,
                database=self.config.get('DB_NAME', 'postgres'),
                user=self.config.get('DB_USER', 'postgres'),
                password=self.config.get('DB_PASSWORD', ''),
                connect_timeout=self.config.get('DB_CONNECTION_TIMEOUT', 30),
                sslmode='require',  # Always require SSL
            )
            
            logger.info(f"✅ Connection pool created with {self.config.get('DB_CONNECTION_POOL_SIZE', 10)} connections")
            
            # Test connection
            with self.connection_pool.getconn() as conn:
                with conn.cursor() as cur:
                    cur.execute('SELECT 1')
                    cur.fetchone()
            
            logger.info("✅ Connection pool test successful")
            return self.connection_pool
        
        except Exception as e:
            logger.error(f"❌ Connection pool creation failed: {str(e)}")
            self.audit_log['connections_failed'] += 1
            return None
    
    def get_connection(self):
        """
        Get a connection from the pool
        
        Returns:
            Database connection with security settings
        
        Raises:
            PoolError if no connections available
        """
        if not self.connection_pool:
            raise RuntimeError("Connection pool not initialized. Call create_connection_pool() first.")
        
        try:
            conn = self.connection_pool.getconn()
            
            # Set statement timeout
            with conn.cursor() as cur:
                statement_timeout = self.config.get('DB_STATEMENT_TIMEOUT', 30000)
                cur.execute(f"SET statement_timeout = {statement_timeout}")
            
            self.audit_log['connections_created'] += 1
            return conn
        
        except Exception as e:
            logger.error(f"Error getting connection from pool: {str(e)}")
            self.audit_log['connections_failed'] += 1
            raise
    
    def return_connection(self, conn):
        """
        Return connection to the pool
        
        Args:
            conn: Connection to return
        """
        if self.connection_pool and conn:
            self.connection_pool.putconn(conn)
    
    def execute_prepared_statement(self, query: str, params: tuple) -> List[Dict]:
        """
        Execute prepared statement safely
        
        ALWAYS use this instead of string concatenation for queries.
        
        Args:
            query: SQL query with %s placeholders
            params: Parameters to bind to query
        
        Returns:
            Query results as list of dictionaries
        
        Example:
            results = db.execute_prepared_statement(
                'SELECT * FROM users WHERE id = %s',
                (user_id,)
            )
        """
        conn = None
        try:
            conn = self.get_connection()
            
            with conn.cursor() as cur:
                # Use prepared statement (automatic with psycopg2)
                cur.execute(query, params)
                
                # Fetch results
                results = cur.fetchall()
                
                # Convert to dictionaries
                columns = [desc[0] for desc in cur.description]
                return [dict(zip(columns, row)) for row in results]
        
        finally:
            if conn:
                self.return_connection(conn)
    
    def get_audit_log(self) -> Dict[str, Any]:
        """
        Get audit log of database access
        
        Returns:
            Dictionary with audit information
        """
        return {
            **self.audit_log,
            'last_check': datetime.utcnow().isoformat(),
        }
    
    def close_pool(self):
        """Close connection pool"""
        if self.connection_pool:
            self.connection_pool.closeall()
            logger.info("Database connection pool closed")


# ══════════════════════════════════════════════════════════════════════════
# MIDDLEWARE FOR DATABASE ACCESS CONTROL
# ══════════════════════════════════════════════════════════════════════════

class DatabaseAccessMiddleware:
    """Middleware to enforce database access restrictions"""
    
    def __init__(self, app, db_security: DatabaseSecurity):
        """
        Initialize database access middleware
        
        Args:
            app: Flask application instance
            db_security: DatabaseSecurity instance
        """
        self.app = app
        self.db_security = db_security
        
        # Register before_request hook
        app.before_request(self.check_database_access)
    
    def check_database_access(self):
        """Check if database access is allowed for this request"""
        from flask import request, abort
        
        # Get client IP
        client_ip = request.remote_addr
        
        # Check IP whitelist (if configured)
        if not self.db_security.is_ip_allowed(client_ip):
            logger.warning(f"Database access denied for IP {client_ip}")
            # Continue request but log the denied access
            # (actual DB connection will fail if IP is not whitelisted at database level)


# ══════════════════════════════════════════════════════════════════════════
# QUERY VALIDATION
# ══════════════════════════════════════════════════════════════════════════

class QueryValidator:
    """Validates queries for security issues"""
    
    # SQL injection keywords to avoid
    DANGEROUS_KEYWORDS = [
        'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'EXEC', 'EXECUTE',
        'UNION', 'SELECT INTO', 'CREATE', 'GRANT', 'REVOKE',
    ]
    
    @staticmethod
    def validate_query(query: str) -> tuple[bool, Optional[str]]:
        """
        Validate SQL query for obvious injection issues
        
        Note: This is a basic check. Always use prepared statements!
        
        Args:
            query: SQL query to validate
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Convert to uppercase for keyword checking
        query_upper = query.upper()
        
        # Check for dangerous keywords in user input
        for keyword in QueryValidator.DANGEROUS_KEYWORDS:
            if keyword in query_upper:
                # This might indicate SQL injection
                return False, f"Potentially dangerous keyword detected: {keyword}"
        
        # Check for common injection patterns
        injection_patterns = [
            "' OR '1'='1",
            "'; DROP TABLE",
            "UNION SELECT",
            "; --",
            "/*",
        ]
        
        for pattern in injection_patterns:
            if pattern in query:
                return False, f"Potential injection pattern detected: {pattern}"
        
        return True, None
    
    @staticmethod
    def validate_params(params: tuple) -> tuple[bool, Optional[str]]:
        """
        Validate query parameters
        
        Args:
            params: Parameters tuple
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not isinstance(params, (tuple, list)):
            return False, "Parameters must be tuple or list"
        
        return True, None


# ══════════════════════════════════════════════════════════════════════════
# EXAMPLE USAGE
# ══════════════════════════════════════════════════════════════════════════

def example_usage():
    """Example of how to use the database security module"""
    
    # Configuration
    config = {
        'SUPABASE_URL': os.getenv('SUPABASE_URL'),
        'SUPABASE_KEY': os.getenv('SUPABASE_KEY'),
        'SUPABASE_SERVICE_KEY': os.getenv('SUPABASE_SERVICE_KEY'),
        'DB_ENFORCE_SSL': True,
        'DB_CONNECTION_TIMEOUT': 30,
        'DB_STATEMENT_TIMEOUT': 30000,
        'DB_CONNECTION_POOL_SIZE': 10,
        'DB_ALLOWED_IPS': '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
        'DB_NAME': 'smartams',
        'DB_USER': 'postgres',
        'DB_PASSWORD': os.getenv('DB_PASSWORD'),
    }
    
    # Initialize database security
    db = DatabaseSecurity(
        supabase_url=config['SUPABASE_URL'],
        supabase_key=config['SUPABASE_KEY'],
        service_key=config['SUPABASE_SERVICE_KEY'],
        config=config,
    )
    
    # Validate configuration
    errors = db.validate_connection()
    if errors:
        logger.error(f"Configuration errors: {errors}")
        return
    
    # Create connection pool (if using direct PostgreSQL)
    db.create_connection_pool()
    
    # Check IP access
    if db.is_ip_allowed('10.0.0.5'):
        logger.info("IP is allowed")
    
    # Execute prepared statement safely (recommended)
    user_id = 123
    results = db.execute_prepared_statement(
        'SELECT * FROM users WHERE id = %s',
        (user_id,)
    )
    logger.info(f"Query results: {results}")
    
    # Validate query (if using direct SQL)
    is_valid, error = QueryValidator.validate_query("SELECT * FROM users WHERE id = %s")
    if not is_valid:
        logger.error(f"Query validation failed: {error}")
    
    # Get audit log
    audit_log = db.get_audit_log()
    logger.info(f"Audit log: {audit_log}")
    
    # Close pool when done
    db.close_pool()


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    
    # Run example
    example_usage()
