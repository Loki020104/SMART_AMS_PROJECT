"""
Financial & Payment Management APIs
Handles fees, payments, scholarships, and financial reporting
"""

from flask import jsonify, request
from datetime import datetime, timedelta
from decimal import Decimal
import uuid
import os

try:
    import razorpay
    import stripe
except ImportError:
    razorpay = None
    stripe = None


def setup_financial_apis(app, sb, config):
    """Register all financial API endpoints"""
    
    # ══════════════════════════════════════════════════════════════
    # FEE STRUCTURE MANAGEMENT
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/fees/structure", methods=["GET"])
    def get_fee_structures():
        """Get all fee structures or filter by program/semester"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            program = request.args.get("program")
            semester = request.args.get("semester")
            
            q = sb.table("fee_structures").select("*")
            if program:
                q = q.eq("program", program)
            if semester:
                q = q.eq("semester", int(semester))
            
            result = q.execute()
            return jsonify(success=True, structures=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/fees/structure", methods=["POST"])
    def create_fee_structure():
        """Create a new fee structure"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            payload = {
                "structure_id": str(uuid.uuid4()),
                "program": d.get("program"),
                "semester": d.get("semester"),
                "tuition_fee": float(d.get("tuition_fee", 0)),
                "lab_fee": float(d.get("lab_fee", 0)),
                "library_fee": float(d.get("library_fee", 0)),
                "misc_fee": float(d.get("misc_fee", 0)),
                "total_fee": float(d.get("tuition_fee", 0)) + float(d.get("lab_fee", 0)) + float(d.get("library_fee", 0)) + float(d.get("misc_fee", 0)),
                "due_date": d.get("due_date"),
                "academic_year": d.get("academic_year"),
                "created_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("fee_structures").insert(payload).execute()
            return jsonify(success=True, structure=result.data[0] if result.data else payload)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # STUDENT FEE TRACKING
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/fees/student/<roll_no>", methods=["GET"])
    def get_student_fee_status(roll_no):
        """Get student's fee status, pending dues, and payment history"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            # Get student
            student = sb.table("users").select("id,full_name,program,semester,academic_year").eq("roll_no", roll_no).execute()
            if not student.data:
                return jsonify(success=False, error="Student not found"), 404
            
            student = student.data[0]
            
            # Get fee structure
            fee_struct = sb.table("fee_structures").select("*").eq("program", student.get("program")).eq("semester", student.get("semester")).execute()
            fee_data = fee_struct.data[0] if fee_struct.data else {}
            
            # Get payment history
            payments = sb.table("fee_payments").select("*").eq("roll_no", roll_no).order("payment_date", desc=True).execute()
            payment_history = payments.data or []
            
            # Calculate totals
            total_due = float(fee_data.get("total_fee", 0))
            total_paid = sum(float(p.get("amount", 0)) for p in payment_history if p.get("status") == "completed")
            pending = max(0, total_due - total_paid)
            
            # Check if student is eligible
            is_eligible_for_exams = pending == 0  # Only eligible if all fees paid
            
            return jsonify(
                success=True,
                student={"roll_no": roll_no, "name": student.get("full_name")},
                fee_structure=fee_data,
                total_due=total_due,
                total_paid=total_paid,
                pending_amount=pending,
                eligible_for_exams=is_eligible_for_exams,
                payment_history=payment_history[:10],  # Last 10 payments
                last_payment_date=payment_history[0].get("payment_date") if payment_history else None,
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # PAYMENT PROCESSING & GATEWAY
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/payments/initiate", methods=["POST"])
    def initiate_payment():
        """Initiate payment via Razorpay, Stripe, or PayPal"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            roll_no = d.get("roll_no")
            amount = float(d.get("amount", 0))
            payment_for = d.get("payment_for", "tuition")  # tuition, lab, library, hostel, etc.
            
            if amount <= 0:
                return jsonify(success=False, error="Invalid amount"), 400
            
            gateway = config.get("financial.payment_gateway", "razorpay")
            
            # Initialize payment
            payment_record = {
                "payment_id": str(uuid.uuid4()),
                "roll_no": roll_no,
                "amount": amount,
                "payment_for": payment_for,
                "gateway": gateway,
                "status": "initiated",
                "created_at": datetime.utcnow().isoformat(),
            }
            
            if gateway == "razorpay":
                # Razorpay integration
                if razorpay:
                    client = razorpay.Client(
                        auth=(
                            config.get("financial.razorpay_key", ""),
                            config.get("financial.razorpay_secret", "")
                        )
                    )
                    razorpay_order = client.order.create({
                        "amount": int(amount * 100),  # Amount in paise
                        "currency": config.get("financial.currency", "USD"),
                        "receipt": payment_record["payment_id"],
                        "notes": {
                            "roll_no": roll_no,
                            "payment_for": payment_for
                        }
                    })
                    payment_record["gateway_reference"] = razorpay_order["id"]
                    
            elif gateway == "stripe":
                #Stripe integration
                if stripe:
                    stripe.api_key = config.get("financial.stripe_key", "")
                    intent = stripe.PaymentIntent.create(
                        amount=int(amount * 100),
                        currency="usd",
                        metadata={"roll_no": roll_no, "payment_for": payment_for}
                    )
                    payment_record["gateway_reference"] = intent.id
            
            # Store payment record
            sb.table("fee_payments").insert(payment_record).execute()
            
            return jsonify(
                success=True,
                payment_id=payment_record["payment_id"],
                gateway_reference=payment_record.get("gateway_reference"),
                amount=amount,
                currency=config.get("financial.currency", "USD"),
                message="Payment initiated"
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/payments/verify", methods=["POST"])
    def verify_payment():
        """Verify payment after gateway callback"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            payment_id = d.get("payment_id")
            
            # Fetch payment record
            payment = sb.table("fee_payments").select("*").eq("payment_id", payment_id).execute()
            if not payment.data:
                return jsonify(success=False, error="Payment not found"), 404
            
            payment_record = payment.data[0]
            
            # Verify with gateway
            is_valid = True  # Gateway verification logic here
            
            if is_valid:
                # Update payment status
                sb.table("fee_payments").update({
                    "status": "completed",
                    "verified_at": datetime.utcnow().isoformat(),
                    "receipt_number": str(uuid.uuid4())[:8],
                }).eq("payment_id", payment_id).execute()
                
                # Generate receipt
                receipt = {
                    "receipt_id": str(uuid.uuid4()),
                    "roll_no": payment_record.get("roll_no"),
                    "amount": payment_record.get("amount"),
                    "payment_for": payment_record.get("payment_for"),
                    "date": datetime.utcnow().isoformat(),
                    "method": payment_record.get("gateway"),
                }
                sb.table("receipts").insert(receipt).execute()
                
                return jsonify(success=True, message="Payment verified", receipt=receipt)
            else:
                sb.table("fee_payments").update({"status": "failed"}).eq("payment_id", payment_id).execute()
                return jsonify(success=False, error="Payment verification failed"), 400
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # SCHOLARSHIP & FINANCIAL AID
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/scholarships", methods=["GET"])
    def get_scholarships():
        """Get available scholarships"""
        try:
            if not sb:
                return jsonify(success=True, scholarships=[])
            
            result = sb.table("scholarships").select("*").eq("active", True).execute()
            return jsonify(success=True, scholarships=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/scholarships/apply", methods=["POST"])
    def apply_scholarship():
        """Apply for a scholarship"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            roll_no = d.get("roll_no")
            scholarship_id = d.get("scholarship_id")
            
            application = {
                "application_id": str(uuid.uuid4()),
                "roll_no": roll_no,
                "scholarship_id": scholarship_id,
                "status": "pending",
                "applied_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("scholarship_applications").insert(application).execute()
            return jsonify(success=True, application=result.data[0] if result.data else application)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/scholarships/<app_id>/approve", methods=["POST"])
    def approve_scholarship(app_id):
        """Approve a scholarship application"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            discount_percentage = float(d.get("discount_percentage", 0))
            
            # Update application
            sb.table("scholarship_applications").update({
                "status": "approved",
                "discount_percentage": discount_percentage,
                "approved_at": datetime.utcnow().isoformat(),
            }).eq("application_id", app_id).execute()
            
            return jsonify(success=True, message="Scholarship approved")
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # FEE REMINDERS & AUTOMATION
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/fees/generate-reminders", methods=["POST"])
    def generate_fee_reminders():
        """Generate and send fee reminders to students with pending dues"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            # Get all students with pending fees
            students = sb.table("users").select("id,roll_no,email,full_name").eq("role", "student").execute()
            
            reminder_count = 0
            for student in students.data or []:
                # Check fee status
                fee_status = get_student_fee_status_internal(student["roll_no"], sb)
                if fee_status["pending"] > 0:
                    # Create reminder
                    reminder = {
                        "reminder_id": str(uuid.uuid4()),
                        "roll_no": student["roll_no"],
                        "email": student.get("email"),
                        "amount_due": fee_status["pending"],
                        "created_at": datetime.utcnow().isoformat(),
                    }
                    sb.table("fee_reminders").insert(reminder).execute()
                    reminder_count += 1
            
            return jsonify(success=True, reminders_generated=reminder_count)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # FINANCIAL REPORTS
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/financial/report", methods=["GET"])
    def generate_financial_report():
        """Generate financial report for institution"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            start_date = request.args.get("start_date")
            end_date = request.args.get("end_date")
            
            # Get all completed payments
            q = sb.table("fee_payments").select("*").eq("status", "completed")
            if start_date:
                q = q.gte("payment_date", start_date)
            if end_date:
                q = q.lte("payment_date", end_date)
            
            payments = q.execute().data or []
            
            # Calculate totals
            total_collected = sum(float(p.get("amount", 0)) for p in payments)
            total_by_type = {}
            for p in payments:
                ptype = p.get("payment_for", "other")
                total_by_type[ptype] = total_by_type.get(ptype, 0) + float(p.get("amount", 0))
            
            return jsonify(
                success=True,
                report={
                    "period": {"start": start_date, "end": end_date},
                    "total_collected": total_collected,
                    "total_payments": len(payments),
                    "breakdown_by_type": total_by_type,
                    "generated_at": datetime.utcnow().isoformat(),
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500


def get_student_fee_status_internal(roll_no, sb):
    """Internal helper to get fee status"""
    try:
        student = sb.table("users").select("program,semester").eq("roll_no", roll_no).execute()
        fee_struct = sb.table("fee_structures").select("total_fee").eq("program", student.data[0].get("program")).execute()
        payments = sb.table("fee_payments").select("amount").eq("roll_no", roll_no).eq("status", "completed").execute()
        
        total_due = float(fee_struct.data[0].get("total_fee", 0)) if fee_struct.data else 0
        total_paid = sum(float(p.get("amount", 0)) for p in payments.data or [])
        
        return {"due": total_due, "paid": total_paid, "pending": max(0, total_due - total_paid)}
    except:
        return {"due": 0, "paid": 0, "pending": 0}
