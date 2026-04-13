"""
Communication & Notification APIs
Handles email, SMS, push notifications, and messaging
"""

from flask import jsonify, request
from datetime import datetime
import uuid
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
except ImportError:
    SendGridAPIClient = None
    Mail = None

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None

try:
    import firebase_admin
    from firebase_admin import messaging
except ImportError:
    messaging = None


def setup_communication_apis(app, sb, config):
    """Register all communication & notification API endpoints"""
    
    # ══════════════════════════════════════════════════════════════
    # NOTIFICATION PREFERENCES
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/notifications/preferences/<user_id>", methods=["GET"])
    def get_notification_preferences(user_id):
        """Get user's notification preferences"""
        try:
            if not sb:
                return jsonify(success=True, preferences={})
            
            result = sb.table("notification_preferences").select("*").eq("user_id", user_id).execute()
            if result.data:
                return jsonify(success=True, preferences=result.data[0])
            
            # Return default preferences
            defaults = {
                "email_on_attendance": True,
                "email_on_grades": True,
                "email_on_announcement": True,
                "sms_on_urgent": True,
                "push_on_event": True,
                "digest_frequency": "daily"
            }
            return jsonify(success=True, preferences=defaults)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/notifications/preferences/<user_id>", methods=["PUT"])
    def update_notification_preferences(user_id):
        """Update user's notification preferences"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            payload = {
                "user_id": user_id,
                "email_on_attendance": d.get("email_on_attendance", True),
                "email_on_grades": d.get("email_on_grades", True),
                "email_on_announcement": d.get("email_on_announcement", True),
                "sms_on_urgent": d.get("sms_on_urgent", False),
                "push_on_event": d.get("push_on_event", True),
                "digest_frequency": d.get("digest_frequency", "daily"),
                "updated_at": datetime.utcnow().isoformat(),
            }
            
            # Try update, fallback to insert
            result = sb.table("notification_preferences").update(payload).eq("user_id", user_id).execute()
            if not result.data:
                result = sb.table("notification_preferences").insert(payload).execute()
            
            return jsonify(success=True, preferences=payload)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # EMAIL NOTIFICATIONS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/notifications/email/send", methods=["POST"])
    def send_email_notification():
        """Send email notification"""
        try:
            d = request.json or {}
            recipient = d.get("to")
            subject = d.get("subject")
            body = d.get("body")
            notification_type = d.get("type", "general")
            
            if not all([recipient, subject, body]):
                return jsonify(success=False, error="Missing required fields"), 400
            
            # Store notification record
            if sb:
                notification = {
                    "notification_id": str(uuid.uuid4()),
                    "type": "email",
                    "subtype": notification_type,
                    "recipient": recipient,
                    "subject": subject,
                    "body": body,
                    "status": "pending",
                    "created_at": datetime.utcnow().isoformat(),
                }
                sb.table("notifications").insert(notification).execute()
            
            # Send via SendGrid
            provider = config.get("communication.email_provider", "sendgrid")
            
            if provider == "sendgrid" and SendGridAPIClient:
                try:
                    sg = SendGridAPIClient(config.get("communication.sendgrid_api_key", ""))
                    message = Mail(
                        from_email=config.get("communication.from_email", "noreply@smartams.edu"),
                        to_emails=recipient,
                        subject=subject,
                        html_content=body
                    )
                    response = sg.send(message)
                    
                    if sb:
                        sb.table("notifications").update({"status": "sent"}).eq("recipient", recipient).execute()
                    
                except Exception as e:
                    if sb:
                        sb.table("notifications").update({"status": "failed", "error": str(e)}).eq("recipient", recipient).execute()
                    return jsonify(success=False, error=str(e)), 500
            
            return jsonify(success=True, message="Email notification sent")
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # SMS NOTIFICATIONS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/notifications/sms/send", methods=["POST"])
    def send_sms_notification():
        """Send SMS notification"""
        try:
            d = request.json or {}
            phone = d.get("phone")
            message = d.get("message")
            notification_type = d.get("type", "general")
            
            if not all([phone, message]):
                return jsonify(success=False, error="Missing required fields"), 400
            
            # Store notification record
            if sb:
                notification = {
                    "notification_id": str(uuid.uuid4()),
                    "type": "sms",
                    "subtype": notification_type,
                    "recipient": phone,
                    "body": message,
                    "status": "pending",
                    "created_at": datetime.utcnow().isoformat(),
                }
                sb.table("notifications").insert(notification).execute()
            
            # Send via Twilio
            provider = config.get("communication.sms_provider", "twilio")
            
            if provider == "twilio" and TwilioClient:
                try:
                    account_sid = config.get("communication.twilio_account_sid", "")
                    auth_token = config.get("communication.twilio_auth_token", "")
                    from_number = config.get("communication.twilio_phone_number", "")
                    
                    client = TwilioClient(account_sid, auth_token)
                    sms = client.messages.create(
                        body=message,
                        from_=from_number,
                        to=phone
                    )
                    
                    if sb:
                        sb.table("notifications").update({"status": "sent", "provider_id": sms.sid}).eq("recipient", phone).execute()
                except Exception as e:
                    if sb:
                        sb.table("notifications").update({"status": "failed", "error": str(e)}).eq("recipient", phone).execute()
                    return jsonify(success=False, error=str(e)), 500
            
            return jsonify(success=True, message="SMS notification sent")
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # PUSH NOTIFICATIONS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/notifications/push/send", methods=["POST"])
    def send_push_notification():
        """Send push notification via FCM"""
        try:
            d = request.json or {}
            user_ids = d.get("user_ids", [])
            title = d.get("title")
            body = d.get("body")
            notification_type = d.get("type", "general")
            
            if not all([user_ids, title, body]):
                return jsonify(success=False, error="Missing required fields"), 400
            
            if not messaging:
                return jsonify(success=False, error="Firebase not configured"), 500
            
            # Get FCM tokens for users
            if sb:
                fcm_tokens = []
                for user_id in user_ids:
                    result = sb.table("user_devices").select("fcm_token").eq("user_id", user_id).execute()
                    fcm_tokens.extend([d.get("fcm_token") for d in result.data or [] if d.get("fcm_token")])
            else:
                fcm_tokens = []
            
            # Send to all tokens
            sent_count = 0
            for token in fcm_tokens:
                try:
                    message = messaging.Message(
                        notification=messaging.Notification(title=title, body=body),
                        token=token,
                        data={"type": notification_type}
                    )
                    messaging.send(message)
                    sent_count += 1
                except Exception as e:
                    print(f"Failed to send to {token}: {str(e)}")
            
            # Store notification record
            if sb:
                notification = {
                    "notification_id": str(uuid.uuid4()),
                    "type": "push",
                    "subtype": notification_type,
                    "title": title,
                    "body": body,
                    "recipients_count": len(user_ids),
                    "sent_count": sent_count,
                    "status": "sent",
                    "created_at": datetime.utcnow().isoformat(),
                }
                sb.table("notifications").insert(notification).execute()
            
            return jsonify(success=True, message="Push notifications sent", sent_count=sent_count)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # BROADCAST MESSAGING
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/broadcast/create", methods=["POST"])
    def create_broadcast():
        """Create a broadcast message"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            broadcast = {
                "broadcast_id": str(uuid.uuid4()),
                "title": d.get("title"),
                "message": d.get("message"),
                "target_role": d.get("target_role", "all"),  # all, student, faculty, admin
                "target_department": d.get("target_department"),
                "target_semester": d.get("target_semester"),
                "channels": d.get("channels", ["email", "push"]),  # email, sms, push
                "scheduled_at": d.get("scheduled_at"),
                "status": "draft",
                "created_by": d.get("created_by"),
                "created_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("broadcasts").insert(broadcast).execute()
            return jsonify(success=True, broadcast=result.data[0] if result.data else broadcast)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/broadcast/<broadcast_id>/send", methods=["POST"])
    def send_broadcast(broadcast_id):
        """Send a broadcast message"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            # Get broadcast
            broadcast = sb.table("broadcasts").select("*").eq("broadcast_id", broadcast_id).execute()
            if not broadcast.data:
                return jsonify(success=False, error="Broadcast not found"), 404
            
            msg = broadcast.data[0]
            
            # Get target recipients
            q = sb.table("users").select("id,email,phone,full_name")
            if msg.get("target_role") != "all":
                q = q.eq("role", msg.get("target_role"))
            if msg.get("target_department"):
                q = q.eq("department", msg.get("target_department"))
            if msg.get("target_semester"):
                q = q.eq("semester", int(msg.get("target_semester")))
            
            recipients = q.execute().data or []
            
            # Send via each channel
            for channel in msg.get("channels", []):
                for recipient in recipients:
                    if channel == "email" and recipient.get("email"):
                        send_email_notification_internal(
                            recipient.get("email"),
                            msg.get("title"),
                            msg.get("message"),
                            "broadcast",
                            sb
                        )
                    elif channel == "sms" and recipient.get("phone"):
                        send_sms_notification_internal(
                            recipient.get("phone"),
                            msg.get("message"),
                            "broadcast",
                            sb
                        )
            
            # Update broadcast status
            sb.table("broadcasts").update({
                "status": "sent",
                "recipients_count": len(recipients),
                "sent_at": datetime.utcnow().isoformat(),
            }).eq("broadcast_id", broadcast_id).execute()
            
            return jsonify(success=True, message="Broadcast sent", recipients=len(recipients))
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # NOTIFICATION HISTORY
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/notifications", methods=["GET"])
    def get_notifications():
        """Get notification history for current user"""
        try:
            if not sb:
                return jsonify(success=True, notifications=[])
            
            limit = int(request.args.get("limit", 50))
            offset = int(request.args.get("offset", 0))
            
            result = sb.table("notifications").select("*").order("created_at", desc=True).range(offset, offset + limit).execute()
            return jsonify(success=True, notifications=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/notifications/<notification_id>/read", methods=["PUT"])
    def mark_notification_read(notification_id):
        """Mark notification as read"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            sb.table("notifications").update({
                "read_at": datetime.utcnow().isoformat()
            }).eq("notification_id", notification_id).execute()
            
            return jsonify(success=True, message="Notification marked as read")
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500


def send_email_notification_internal(recipient, subject, body, notification_type, sb):
    """Internal helper to send email"""
    try:
        if SendGridAPIClient:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            
            sg = SendGridAPIClient(os.getenv("SENDGRID_API_KEY", ""))
            message = Mail(
                from_email="noreply@smartams.edu",
                to_emails=recipient,
                subject=subject,
                html_content=body
            )
            sg.send(message)
    except Exception as e:
        print(f"Email send failed: {str(e)}")


def send_sms_notification_internal(phone, message, notification_type, sb):
    """Internal helper to send SMS"""
    try:
        if TwilioClient:
            from twilio.rest import Client as TwilioClient
            
            account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
            auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
            from_number = os.getenv("TWILIO_PHONE_NUMBER", "")
            
            client = TwilioClient(account_sid, auth_token)
            client.messages.create(body=message, from_=from_number, to=phone)
    except Exception as e:
        print(f"SMS send failed: {str(e)}")
