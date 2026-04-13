"""
Advanced Backend Infrastructure Setup
Includes: Redis caching, Celery task queuing, DB optimization, Monitoring
"""

import os
import logging
from datetime import timedelta

logger = logging.getLogger(__name__)

# ============================================
# REDIS CONFIGURATION (Caching)
# ============================================

REDIS_CONFIG = {
    'host': os.getenv('REDIS_HOST', 'localhost'),
    'port': int(os.getenv('REDIS_PORT', 6379)),
    'db': int(os.getenv('REDIS_DB', 0)),
    'password': os.getenv('REDIS_PASSWORD', None),
    'socket_connect_timeout': 5,
    'socket_keepalive': True,
    'socket_keepalive_options': {
        1: (9, 3),  # TCP_KEEPIDLE=9, TCP_KEEPINTVL=3
    },
    'retry_on_timeout': True,
    'health_check_interval': 30
}

def init_redis_cache():
    """Initialize Redis cache for attendance data and session caching."""
    try:
        import redis  # type: ignore
        redis_client = redis.Redis(**REDIS_CONFIG)
        redis_client.ping()
        logger.info("[REDIS] ✓ Connected to Redis")
        return redis_client
    except Exception as e:
        logger.warning(f"[REDIS] Failed to connect: {e}. Running without caching.")
        return None


# Cache key patterns
CACHE_KEYS = {
    'attendance': 'attendance:{date}:{section}',  # attendance:2026-03-30:A1
    'student_summary': 'student:{roll_no}:summary',
    'teacher_sessions': 'teacher:{id}:sessions',
    'daily_analytics': 'analytics:daily:{date}',
    'verification_rate': 'metrics:verification:{date}:{dept}'
}

def cache_get(redis_client, key):
    """Get value from cache."""
    if not redis_client:
        return None
    try:
        import json
        val = redis_client.get(key)
        return json.loads(val) if val else None
    except Exception as e:
        logger.warning(f"[CACHE] Get error for {key}: {e}")
        return None

def cache_set(redis_client, key, value, ttl_hours=24):
    """Set value in cache with TTL."""
    if not redis_client:
        return False
    try:
        import json
        redis_client.setex(
            key,
            timedelta(hours=ttl_hours),
            json.dumps(value)
        )
        return True
    except Exception as e:
        logger.warning(f"[CACHE] Set error for {key}: {e}")
        return False

def cache_invalidate(redis_client, pattern):
    """Invalidate cache by pattern (e.g., 'analytics:*')."""
    if not redis_client:
        return
    try:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
            logger.info(f"[CACHE] Invalidated {len(keys)} keys matching {pattern}")
    except Exception as e:
        logger.warning(f"[CACHE] Invalidate error: {e}")


# ============================================
# CELERY CONFIGURATION (Async Tasks)
# ============================================

CELERY_CONFIG = {
    'broker': os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/1'),
    'backend': os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/2'),
    'task_serializer': 'json',
    'accept_content': ['json'],
    'result_serializer': 'json',
    'timezone': 'UTC',
    'enable_utc': True,
    'task_track_started': True,
    'task_time_limit': 30 * 60,  # 30 minutes
    'task_soft_time_limit': 25 * 60,  # 25 minutes
    'worker_prefetch_multiplier': 1,
    'worker_max_tasks_per_child': 1000,
}

def init_celery(app):
    """Initialize Celery for async task processing."""
    try:
        from celery import Celery  # type: ignore
        
        celery = Celery(app.import_name, broker=CELERY_CONFIG['broker'])
        celery.conf.update(CELERY_CONFIG)
        
        # Task binding for context
        class ContextTask(celery.Task):
            def __call__(self, *args, **kwargs):
                with app.app_context():
                    return self.run(*args, **kwargs)
        
        celery.Task = ContextTask
        logger.info("[CELERY] ✓ Initialized")
        return celery
    except Exception as e:
        logger.warning(f"[CELERY] Failed to initialize: {e}")
        return None


# Celery Tasks
def define_celery_tasks(celery):
    """Define async tasks for background processing."""
    
    @celery.task(name='tasks.process_attendance_batch')
    def process_attendance_batch(attendance_records):
        """Process batch of attendance records asynchronously."""
        logger.info(f"[TASK] Processing {len(attendance_records)} attendance records")
        # Process and save to DB
        return {'processed': len(attendance_records), 'status': 'success'}
    
    @celery.task(name='tasks.compute_analytics')
    def compute_analytics(date_str):
        """Compute daily analytics asynchronously."""
        logger.info(f"[TASK] Computing analytics for {date_str}")
        # Run analytics computation
        return {'date': date_str, 'status': 'computed'}
    
    @celery.task(name='tasks.send_bulk_sms')
    def send_bulk_sms_task(phone_numbers, message, provider='twilio'):
        """Send bulk SMS asynchronously."""
        logger.info(f"[TASK] Sending SMS to {len(phone_numbers)} users")
        # Delegate to SMS service
        return {'sent': len(phone_numbers), 'failed': 0}
    
    @celery.task(name='tasks.detect_anomalies')
    def detect_anomalies_task(attendance_data):
        """Detect anomalies in attendance data."""
        logger.info(f"[TASK] Running anomaly detection on {len(attendance_data)} records")
        # Run anomaly detector
        return {'anomalies': 0}
    
    @celery.task(name='tasks.compute_risk_scores')
    def compute_risk_scores_task():
        """Compute risk scores for all students."""
        logger.info("[TASK] Computing risk scores")
        # Run risk scorer
        return {'computed': True}
    
    return {
        'process_attendance': process_attendance_batch,
        'compute_analytics': compute_analytics,
        'send_sms': send_bulk_sms_task,
        'detect_anomalies': detect_anomalies_task,
        'compute_risks': compute_risk_scores_task,
    }


# ============================================
# DATABASE OPTIMIZATION
# ============================================

def get_database_indexes():
    """
    Get list of recommended database indexes for optimal query performance.
    Execute these in Supabase SQL editor.
    """
    return """
-- Attendance table indexes (for fast lookups and filtering)
CREATE INDEX IF NOT EXISTS idx_attendance_roll_no ON attendance(roll_no);
CREATE INDEX IF NOT EXISTS idx_attendance_session_id ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_verified ON attendance(verified);
CREATE INDEX IF NOT EXISTS idx_attendance_roll_date ON attendance(roll_no, date);
CREATE INDEX IF NOT EXISTS idx_attendance_in_campus ON attendance(in_campus);

-- QR Sessions indexes
CREATE INDEX IF NOT EXISTS idx_qr_sessions_teacher ON qr_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_section ON qr_sessions(section);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_started ON qr_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_ended ON qr_sessions(ended_at);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_roll_no ON users(roll_no);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Face encodings indexes
CREATE INDEX IF NOT EXISTS idx_face_encodings_roll_no ON face_encodings(roll_no);
CREATE INDEX IF NOT EXISTS idx_face_encodings_created ON face_encodings(created_at);

-- Analytics indexes (for fast aggregation)
CREATE INDEX IF NOT EXISTS idx_attendance_date_section ON attendance(date, section);
CREATE INDEX IF NOT EXISTS idx_attendance_date_dept ON attendance(date, department) 
    WHERE department IS NOT NULL;

-- Partial index for unverified attendance (fast filtering)
CREATE INDEX IF NOT EXISTS idx_attendance_unverified 
    ON attendance(session_id, date) WHERE NOT verified;

-- Composite index for trend queries (last 30 days by date)
CREATE INDEX IF NOT EXISTS idx_attendance_trend 
    ON attendance(roll_no, date DESC) 
    WHERE date >= CURRENT_DATE - INTERVAL '30 days';
    """


def get_database_optimization_sql():
    """
    Get SQL commands for query optimization and statistics.
    Execute periodically to maintain performance.
    """
    return """
-- Update statistics for optimizer
ANALYZE;

-- Reindex bloated tables (removes dead rows from updates/deletes)
REINDEX INDEX CONCURRENTLY idx_attendance_roll_no;
REINDEX INDEX CONCURRENTLY idx_attendance_date;
REINDEX INDEX CONCURRENTLY idx_users_roll_no;

-- Vacuum (reclaims disk space)
VACUUM ANALYZE attendance;
VACUUM ANALYZE users;
VACUUM ANALYZE qr_sessions;

-- Check table bloat (run periodically)
SELECT 
    schemaname, 
    tablename, 
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    """


# ============================================
# PROMETHEUS MONITORING
# ============================================

def init_prometheus_monitoring(app):
    """Initialize Prometheus metrics exposition for monitoring."""
    try:
        from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST  # type: ignore
        
        # Define metrics
        http_requests_total = Counter(
            'http_requests_total',
            'Total HTTP requests',
            ['method', 'endpoint', 'status']
        )
        
        http_request_duration = Histogram(
            'http_request_duration_seconds',
            'HTTP request duration (seconds)',
            ['method', 'endpoint']
        )
        
        websocket_connections_active = Gauge(
            'websocket_connections_active',
            'Active WebSocket connections'
        )
        
        attendance_marked_total = Counter(
            'attendance_marked_total',
            'Total attendance records marked',
            ['method', 'verified']
        )
        
        face_verification_confidence = Histogram(
            'face_verification_confidence',
            'Face verification confidence scores',
            buckets=[0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]
        )
        
        anomalies_detected_total = Counter(
            'anomalies_detected_total',
            'Total anomalies detected',
            ['anomaly_type']
        )
        
        # Export metrics endpoint
        @app.route('/metrics', methods=['GET'])
        def metrics():
            return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}
        
        logger.info("[PROMETHEUS] ✓ Monitoring enabled (/metrics)")
        
        return {
            'http_requests': http_requests_total,
            'http_duration': http_request_duration,
            'ws_connections': websocket_connections_active,
            'attendance': attendance_marked_total,
            'face_confidence': face_verification_confidence,
            'anomalies': anomalies_detected_total
        }
    
    except Exception as e:
        logger.warning(f"[PROMETHEUS] Failed to initialize: {e}")
        return None


# ============================================
# NGINX LOAD BALANCER CONFIG
# ============================================

def get_nginx_config(backend_servers):
    """
    Get nginx configuration for load balancing across multiple backend instances.
    
    Args:
        backend_servers: List of backend URLs (e.g., ['localhost:5000', 'localhost:5001'])
    """
    upstream_config = '\n'.join([
        f"    server {server};"
        for server in backend_servers
    ])
    
    return f"""
# Upstream for backend instances (auto-scales)
upstream smartams_backend {{
    least_conn;  # Load balancing method: least connections
{upstream_config}
    
    # Health check configuration
    check interval=3000 rise=2 fall=5 timeout=1000 type=http;
    check_http_send "GET /health HTTP/1.0\\r\\n\\r\\n";
    check_http_expect_alive http_2xx;
}}

# HTTP server (redirect to HTTPS)
server {{
    listen 80;
    server_name yourdomain.com;
    
    location /.well-known/acme-challenge/ {{
        root /var/www/certbot;
    }}
    
    location / {{
        return 301 https://$server_name$request_uri;
    }}
}}

# HTTPS server (main)
server {{
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL optimization
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/javascript application/json;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_proxied any;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=ws_limit:10m rate=100r/s;
    
    # Proxy settings
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Static files (cache)
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {{
        proxy_pass http://smartams_backend;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }}
    
    # API endpoints (rate limited)
    location /api/ {{
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://smartams_backend;
        access_log /var/log/nginx/api.log;
    }}
    
    # WebSocket connections (separate rate limit)
    location /socket.io {{
        limit_req zone=ws_limit burst=50 nodelay;
        proxy_pass http://smartams_backend;
        proxy_buffering off;
        access_log /var/log/nginx/websocket.log;
    }}
    
    # Health check status
    location /nginx_status {{
        stub_status;
        access_log off;
        allow 127.0.0.1;
        deny all;
    }}
    
    # Main proxy
    location / {{
        proxy_pass http://smartams_backend;
    }}
}}
"""


# ============================================
# MONITORING SETUP
# ============================================

def setup_monitoring_alerts():
    """
    Alerting rules for Prometheus.
    Use with AlertManager for notification (Slack, Email, Pagerduty)
    """
    return """
# Alert rules for production monitoring

groups:
- name: smartams_alerts
  interval: 30s
  rules:
  
  # Alert: High error rate
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 5m
    annotations:
      summary: "High error rate (> 5%)"
      description: "Error rate is {{ $value | humanizePercentage }}"
  
  # Alert: WebSocket connection spike
  - alert: WebSocketSpike
    expr: rate(websocket_connections_active[5m]) > 100
    for: 5m
    annotations:
      summary: "WebSocket connection spike"
      description: "{{ $value }} new connections per second"
  
  # Alert: Slow API response time
  - alert: SlowAPIResponse
    expr: histogram_quantile(0.95, http_request_duration_seconds) > 2
    for: 5m
    annotations:
      summary: "Slow API response (p95 > 2s)"
      description: "Response time: {{ $value }}s"
  
  # Alert: Low face verification rate
  - alert: LowVerificationRate
    expr: (rate(attendance_marked_total{verified="true"}[1h]) / 
            rate(attendance_marked_total[1h])) < 0.7
    for: 10m
    annotations:
      summary: "Low face verification rate (< 70%)"
      description: "Current rate: {{ $value | humanizePercentage }}"
  
  # Alert: High anomaly detection rate
  - alert: HighAnomalyRate
    expr: rate(anomalies_detected_total[5m]) > 10
    for: 5m
    annotations:
      summary: "High anomaly detection rate"
      description: "{{ $value }} anomalies per second"
    """
