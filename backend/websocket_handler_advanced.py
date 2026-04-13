"""
Advanced WebSocket Handler with Compression, Offline Sync, Presence Tracking, 
Message Acknowledgments, Priority Queuing, and Resilient Error Recovery
"""

import os
import json
import time
import zlib
import uuid
import logging
import threading
from datetime import datetime, timedelta
from collections import defaultdict, deque
from typing import Dict, List, Tuple, Any, Optional
from enum import Enum

from flask import request

try:
    from flask_socketio import SocketIO, emit, join_room, leave_room, rooms  # type: ignore
    SOCKETIO_AVAILABLE = True
except ImportError:
    SOCKETIO_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("[WEBSOCKET] flask_socketio not installed - WebSocket features disabled")

try:
    import gevent  # type: ignore
    GEVENT_AVAILABLE = True
except ImportError:
    GEVENT_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("[WEBSOCKET] gevent not installed - async features will use threading")

logger = logging.getLogger(__name__)

# ============================================
# MESSAGE PRIORITY & TYPES
# ============================================

class MessagePriority(Enum):
    """Message priority levels"""
    CRITICAL = 1      # Face verification, security alerts
    HIGH = 2          # Attendance updates, instant notifications
    NORMAL = 3        # Analytics, session updates
    LOW = 4           # Presence, typing indicators


class MessageType(Enum):
    """Message classification"""
    ATTENDANCE = "attendance"
    FACE_MATCH = "face_match"
    PRESENCE = "presence"
    ANALYTICS = "analytics"
    SYSTEM = "system"
    ACKNOWLEDGMENT = "ack"


# ============================================
# COMPRESSION UTILITIES (Deflate)
# ============================================

def compress_message(data: dict, target_size_kb: float = 5.0) -> Tuple[dict, bool]:
    """
    Compress large messages using zlib deflate.
    Only compress if result < target_size_kb and compression_ratio > 20%.
    Returns (possibly_compressed_data, was_compressed).
    """
    try:
        json_str = json.dumps(data)
        original_size = len(json_str.encode('utf-8'))
        
        # Only compress if message > 1 KB
        if original_size < 1024:
            return data, False
        
        compressed = zlib.compress(json_str.encode('utf-8'), level=9)
        compressed_size = len(compressed)
        compression_ratio = (1 - compressed_size / original_size) * 100
        target_bytes = target_size_kb * 1024
        
        # Use compression if: ratio > 20% AND size < target
        if compression_ratio > 20 and compressed_size < target_bytes:
            # Base64 encode for JSON transport
            import base64
            return {
                "_compressed": True,
                "_data": base64.b64encode(compressed).decode('utf-8'),
                "_original_size": original_size,
                "_compressed_size": compressed_size,
                "_ratio": f"{compression_ratio:.1f}%"
            }, True
        
        return data, False
    except Exception as e:
        logger.warning(f"[COMPRESS] Error: {e}")
        return data, False


def decompress_message(data: dict) -> dict:
    """Decompress a zlib-deflated message."""
    try:
        if not data.get("_compressed"):
            return data
        
        import base64
        compressed = base64.b64decode(data["_data"])
        json_str = zlib.decompress(compressed).decode('utf-8')
        return json.loads(json_str)
    except Exception as e:
        logger.error(f"[DECOMPRESS] Error: {e}")
        return data


# ============================================
# MESSAGE ACKNOWLEDGMENT SYSTEM
# ============================================

class MessageAcknowledgment:
    """Track message delivery and retry."""
    
    def __init__(self, msg_id: str, priority: MessagePriority, max_retries: int = 3):
        self.msg_id = msg_id
        self.priority = priority
        self.created_at = datetime.utcnow()
        self.max_retries = max_retries
        self.retry_count = 0
        self.acknowledged = False
        self.failed = False
    
    def mark_acked(self):
        """Message was successfully delivered."""
        self.acknowledged = True
        logger.info(f"[ACK] Message {self.msg_id}: acknowledged after {self.retry_count} retries")
    
    def mark_failed(self):
        """Message delivery failed."""
        self.failed = True
        logger.error(f"[ACK] Message {self.msg_id}: delivery failed after {self.max_retries} retries")
    
    def should_retry(self) -> bool:
        """Check if message should be retried."""
        if self.retry_count >= self.max_retries:
            return False
        # CRITICAL messages: retry aggressively; LOW messages: retry less
        retry_delays = {
            MessagePriority.CRITICAL: 2,  # seconds
            MessagePriority.HIGH: 5,
            MessagePriority.NORMAL: 10,
            MessagePriority.LOW: 30
        }
        elapsed = (datetime.utcnow() - self.created_at).total_seconds()
        return elapsed >= retry_delays.get(self.priority, 10)


# ============================================
# PRIORITY MESSAGE QUEUE
# ============================================

class PriorityMessageQueue:
    """Queue messages by priority. CRITICAL > HIGH > NORMAL > LOW."""
    
    def __init__(self, max_size: int = 10000):
        self.queues = {
            MessagePriority.CRITICAL: deque(maxlen=max_size),
            MessagePriority.HIGH: deque(maxlen=max_size),
            MessagePriority.NORMAL: deque(maxlen=max_size),
            MessagePriority.LOW: deque(maxlen=max_size),
        }
        self.pending_acks = {}  # msg_id -> MessageAcknowledgment
        self.lock = threading.RLock()
    
    def enqueue(self, msg: dict, priority: MessagePriority = MessagePriority.NORMAL) -> str:
        """Add message to priority queue. Returns message ID."""
        with self.lock:
            msg_id = str(uuid.uuid4())
            msg_wrapper = {
                "id": msg_id,
                "priority": priority.name,
                "timestamp": datetime.utcnow().isoformat(),
                "data": msg
            }
            
            self.queues[priority].append(msg_wrapper)
            self.pending_acks[msg_id] = MessageAcknowledgment(msg_id, priority)
            
            return msg_id
    
    def dequeue_next(self) -> Optional[dict]:
        """Dequeue highest-priority message."""
        with self.lock:
            # Check CRITICAL, then HIGH, then NORMAL, then LOW
            for priority in [MessagePriority.CRITICAL, MessagePriority.HIGH, 
                           MessagePriority.NORMAL, MessagePriority.LOW]:
                if self.queues[priority]:
                    return self.queues[priority].popleft()
            return None
    
    def acknowledge(self, msg_id: str):
        """Mark message as successfully delivered."""
        with self.lock:
            if msg_id in self.pending_acks:
                self.pending_acks[msg_id].mark_acked()
                del self.pending_acks[msg_id]
    
    def handle_timeout(self) -> List[str]:
        """Return list of message IDs that need retry."""
        with self.lock:
            to_retry = []
            failed = []
            
            for msg_id, ack in list(self.pending_acks.items()):
                if ack.should_retry():
                    to_retry.append(msg_id)
                    ack.retry_count += 1
                elif ack.should_retry() is False and not ack.acknowledged:
                    failed.append(msg_id)
                    ack.mark_failed()
            
            return to_retry, failed
    
    def size(self) -> Dict[str, int]:
        """Get queue sizes by priority."""
        return {
            "CRITICAL": len(self.queues[MessagePriority.CRITICAL]),
            "HIGH": len(self.queues[MessagePriority.HIGH]),
            "NORMAL": len(self.queues[MessagePriority.NORMAL]),
            "LOW": len(self.queues[MessagePriority.LOW]),
            "pending_acks": len(self.pending_acks)
        }


# ============================================
# OFFLINE MESSAGE BUFFER
# ============================================

class OfflineMessageBuffer:
    """Store messages for offline clients, sync when they reconnect."""
    
    def __init__(self, max_per_user: int = 100, ttl_hours: int = 24):
        self.buffers = defaultdict(deque)  # user_id -> deque of messages
        self.max_per_user = max_per_user
        self.ttl = timedelta(hours=ttl_hours)
        self.lock = threading.RLock()
    
    def add(self, user_id: str, event: str, data: dict):
        """Buffer message for offline user."""
        with self.lock:
            msg = {
                "event": event,
                "data": data,
                "buffered_at": datetime.utcnow().isoformat()
            }
            self.buffers[user_id].append(msg)
    
    def get_and_clear(self, user_id: str) -> List[dict]:
        """Get all buffered messages and clear buffer."""
        with self.lock:
            messages = list(self.buffers[user_id])
            self.buffers[user_id].clear()
            return messages
    
    def cleanup_expired(self):
        """Remove expired messages (older than TTL)."""
        with self.lock:
            now = datetime.utcnow()
            for user_id in list(self.buffers.keys()):
                buffer = self.buffers[user_id]
                while buffer and buffer[0]:
                    buffered_at = datetime.fromisoformat(buffer[0].get("buffered_at", now.isoformat()))
                    if now - buffered_at > self.ttl:
                        buffer.popleft()
                    else:
                        break


# ============================================
# PRESENCE TRACKING
# ============================================

class PresenceTracker:
    """Track online/offline status of users."""
    
    def __init__(self):
        self.online_users = defaultdict(set)  # role -> {user_ids}
        self.user_last_seen = defaultdict(datetime.utcnow)  # user_id -> last_seen
        self.user_roles = {}  # user_id -> role
        self.activity = defaultdict(deque)  # user_id -> deque of (timestamp, action)
        self.lock = threading.RLock()
    
    def add_user(self, user_id: str, role: str) -> bool:
        """Mark user as online. Returns True if newly online."""
        with self.lock:
            was_online = bool(self.online_users[role])
            self.online_users[role].add(user_id)
            self.user_roles[user_id] = role
            self.user_last_seen[user_id] = datetime.utcnow()
            return not was_online
    
    def remove_user(self, user_id: str) -> bool:
        """Mark user as offline. Returns True if now offline."""
        with self.lock:
            role = self.user_roles.get(user_id)
            if role:
                self.online_users[role].discard(user_id)
                return len(self.online_users[role]) == 0
            return False
    
    def get_online_count(self) -> Dict[str, int]:
        """Get count of online users by role."""
        with self.lock:
            return {role: len(users) for role, users in self.online_users.items()}
    
    def get_online_users(self, role: str = None) -> List[str]:
        """Get list of online users (optionally filtered by role)."""
        with self.lock:
            if role:
                return list(self.online_users.get(role, set()))
            return [uid for users in self.online_users.values() for uid in users]
    
    def record_activity(self, user_id: str, action: str):
        """Record user activity (queries to prevent inactive timeout)."""
        with self.lock:
            self.user_last_seen[user_id] = datetime.utcnow()
            self.activity[user_id].append((datetime.utcnow(), action))
            # Keep only last 100 activities
            while len(self.activity[user_id]) > 100:
                self.activity[user_id].popleft()
    
    def get_user_activity(self, user_id: str) -> List[Tuple[str, str]]:
        """Get user's recent activity (timestamp, action)."""
        with self.lock:
            return list(self.activity.get(user_id, []))


# ============================================
# ADVANCED WEBSOCKET HANDLER INITIALIZATION
# ============================================

def init_socketio_advanced(app, redis_client=None):
    """
    Initialize advanced Socket.IO with compression, offline sync, presence tracking.
    
    Args:
        app: Flask application
        redis_client: Redis client for distributed session storage (optional)
    
    Returns:
        SocketIO instance with advanced handlers
    """
    
    socketio = SocketIO(
        app,
        async_mode='gevent',
        ping_timeout=30,
        ping_interval=15,
        max_http_buffer_size=1e6,
        cors_allowed_origins=os.getenv("WEBSOCKET_CORS_ORIGINS", "*").split(","),
        logger=False,
        engineio_logger=False,
        # Enable compression
        engineio_kwargs={
            'compression': 'gzip',
            'compression_threshold': 1024  # Compress payloads > 1KB
        }
    )
    
    # Global state
    socketio.message_queue = PriorityMessageQueue(max_size=10000)
    socketio.offline_buffer = OfflineMessageBuffer(max_per_user=100, ttl_hours=24)
    socketio.presence = PresenceTracker()
    socketio.redis_client = redis_client
    
    # Store active sessions
    socketio.active_sessions = {}  # session_id -> session_data
    socketio.client_to_session = defaultdict(set)  # client_sid -> {session_ids}
    socketio.analytics_buffer = defaultdict(list)
    
    # ========================================
    # CONNECTION HANDLERS
    # ========================================
    
    @socketio.on('connect')
    def on_connect(auth=None):
        """Handle client connection with optional authentication."""
        sid = request.sid
        logger.info(f"[WS] Client connected: {sid}")
        
        emit('connection_response', {
            'status': 'connected',
            'sid': sid,
            'server_time': datetime.utcnow().isoformat(),
            'compression': 'enabled'
        })
    
    @socketio.on('disconnect')
    def on_disconnect():
        """Handle client disconnection and buffer messages."""
        sid = request.sid
        logger.info(f"[WS] Client disconnected: {sid}")
        
        # Flush any pending messages to offline buffer
        for session_id in socketio.client_to_session.get(sid, set()):
            socketio.offline_buffer.add(
                user_id=sid,
                event='session_ended',
                data={'session_id': session_id, 'reason': 'disconnect'}
            )
    
    @socketio.on('join_session')
    def on_join_session(data):
        """Join a session room with offline sync."""
        sid = request.sid
        session_id = data.get('session_id')
        role = data.get('role', 'student')
        user_id = data.get('user_id')
        
        if not session_id:
            return emit('error', {'message': 'session_id required'})
        
        # Track presence
        socketio.presence.add_user(user_id or sid, role)
        
        # Sync offline messages if any
        buffered = socketio.offline_buffer.get_and_clear(user_id or sid)
        if buffered:
            emit('offline_sync', {
                'messages': buffered,
                'count': len(buffered)
            })
        
        # Join room and emit event
        join_room(f"session_{session_id}")
        socketio.client_to_session[sid].add(session_id)
        
        # Broadcast presence to room
        socketio.emit('presence_update', {
            'session_id': session_id,
            'online_count': socketio.presence.get_online_count(),
            'online_by_role': {
                r: len(u) for r, u in socketio.presence.online_users.items()
            }
        }, room=f"session_{session_id}")
        
        logger.info(f"[WS] User {user_id} joined session {session_id} (sid: {sid}, role: {role})")
        emit('session_joined', {
            'session_id': session_id,
            'role': role,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    @socketio.on('attendance_update')
    def on_attendance_update(data):
        """
        Broadcast attendance update with acknowledgment.
        Priority: CRITICAL if face match, HIGH if standard.
        """
        sid = request.sid
        session_id = data.get('session_id')
        is_face_match = data.get('method') == 'face'
        
        # Determine priority
        priority = MessagePriority.CRITICAL if is_face_match else MessagePriority.HIGH
        
        # Enqueue message (returns msg_id)
        msg_id = socketio.message_queue.enqueue({
            'session_id': session_id,
            'roll_no': data.get('roll_no'),
            'name': data.get('name'),
            'status': data.get('status'),
            'confidence': data.get('confidence', 0),
            'timestamp': datetime.utcnow().isoformat(),
            'method': data.get('method', 'qr')
        }, priority=priority)
        
        # Compress if large
        compressed_data, was_compressed = compress_message(data)
        
        # Broadcast to session room
        socketio.emit('attendance_update', {
            'msg_id': msg_id,
            'data': compressed_data,
            'compressed': was_compressed,
            'priority': priority.name
        }, room=f"session_{session_id}")
        
        # Record in analytics buffer
        socketio.analytics_buffer[session_id].append({
            'event': 'attendance_marked',
            'data': data,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        logger.info(f"[WS] Attendance update (msg_id={msg_id[:8]}, priority={priority.name})")
    
    @socketio.on('acknowledge')
    def on_acknowledge(data):
        """Client confirms message receipt."""
        msg_id = data.get('msg_id')
        socketio.message_queue.acknowledge(msg_id)
        emit('ack_received', {'msg_id': msg_id})
    
    @socketio.on('typing')
    def on_typing(data):
        """Broadcast typing indicator (presence feature)."""
        sid = request.sid
        session_id = data.get('session_id')
        user_id = data.get('user_id')
        
        socketio.emit('user_typing', {
            'user_id': user_id,
            'session_id': session_id,
            'timestamp': datetime.utcnow().isoformat()
        }, room=f"session_{session_id}", skip_sid=sid)
    
    @socketio.on('ping')
    def on_ping(data):
        """Respond to ping (keep-alive / latency check)."""
        emit('pong', {'server_time': datetime.utcnow().isoformat()})
    
    # ========================================
    # BACKGROUND TASKS
    # ========================================
    
    def cleanup_and_retry_messages():
        """Background task: retry unacknowledged messages and cleanup."""
        while True:
            try:
                gevent.sleep(10)  # Check every 10 seconds
                
                to_retry, failed = socketio.message_queue.handle_timeout()
                
                for msg_id in to_retry:
                    # Emit retry event to all clients
                    socketio.emit('message_retry', {
                        'msg_id': msg_id,
                        'timestamp': datetime.utcnow().isoformat()
                    })
                
                # Log failures
                if failed:
                    logger.warning(f"[MESSAGE-ACK] {len(failed)} messages failed delivery: {failed[:5]}")
                
                # Log queue status periodically
                if random.random() < 0.1:  # 10% of iterations
                    logger.debug(f"[MSG-QUEUE] Status: {socketio.message_queue.size()}")
                
                # Cleanup offline buffer
                socketio.offline_buffer.cleanup_expired()
                
            except Exception as e:
                logger.error(f"[CLEANUP] Error: {e}")
    
    def flush_analytics():
        """Background task: periodically flush analytics to database."""
        try:
            from analytics_module import AttendanceAnalytics  # type: ignore
        except ImportError:
            logger.warning("[WEBSOCKET] analytics_module not available")
            return
        
        while True:
            try:
                if GEVENT_AVAILABLE:
                    gevent.sleep(300)  # Flush every 5 minutes
                else:
                    time.sleep(300)
                
                for session_id, events in socketio.analytics_buffer.items():
                    if events:
                        try:
                            analytics = AttendanceAnalytics()
                            for event in events:
                                analytics.record_event(
                                    event_type=event.get('event'),
                                    data=event.get('data'),
                                    timestamp=event.get('timestamp')
                                )
                            logger.info(f"[ANALYTICS] Flushed {len(events)} events for session {session_id}")
                        except Exception as e:
                            logger.warning(f"[ANALYTICS] Flush error: {e}")
                
                socketio.analytics_buffer.clear()
            
            except Exception as e:
                logger.error(f"[ANALYTICS-FLUSH] Error: {e}")
    
    # Start background threads
    import random
    gevent.spawn(cleanup_and_retry_messages)
    gevent.spawn(flush_analytics)
    
    logger.info("[WS-ADVANCED] ✓ Advanced WebSocket initialized with:")
    logger.info("  - Message compression (gzip deflate)")
    logger.info("  - Priority queue (CRITICAL > HIGH > NORMAL > LOW)")
    logger.info("  - Offline message buffer (24h TTL)")
    logger.info("  - Presence tracking (who's online)")
    logger.info("  - Message acknowledgments (retry logic)")
    logger.info("  - Background task automation")
    
    return socketio


def start_cleanup_thread_advanced(socketio):
    """Start advanced cleanup thread (separate from init if preferred)."""
    def cleanup():
        while True:
            try:
                gevent.sleep(60)
                # Cleanup logic here
            except Exception as e:
                logger.error(f"[CLEANUP] Error: {e}")
    
    gevent.spawn(cleanup)
