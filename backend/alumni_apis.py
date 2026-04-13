"""
Alumni & Placement Management APIs
Handles alumni networking, job board, placement tracking, and mentorship
"""

from flask import jsonify, request
from datetime import datetime
import uuid


def setup_alumni_apis(app, sb, config):
    """Register all alumni & placement API endpoints"""
    
    # ══════════════════════════════════════════════════════════════
    # ALUMNI PROFILE MANAGEMENT
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/alumni/profile/<roll_no>", methods=["GET"])
    def get_alumni_profile(roll_no):
        """Get alumni profile"""
        try:
            if not sb:
                return jsonify(success=True, profile={})
            
            result = sb.table("alumni_profiles").select("*").eq("roll_no", roll_no).execute()
            if result.data:
                return jsonify(success=True, profile=result.data[0])
            
            return jsonify(success=False, error="Alumni profile not found"), 404
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/alumni/profile/<roll_no>", methods=["POST", "PUT"])
    def create_or_update_alumni_profile(roll_no):
        """Create or update alumni profile"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            profile = {
                "roll_no": roll_no,
                "full_name": d.get("full_name"),
                "email": d.get("email"),
                "phone": d.get("phone"),
                "graduation_year": d.get("graduation_year"),
                "program": d.get("program"),
                "current_company": d.get("current_company"),
                "job_title": d.get("job_title"),
                "location": d.get("location"),
                "industry": d.get("industry"),
                "bio": d.get("bio"),
                "linkedin_url": d.get("linkedin_url"),
                "website": d.get("website"),
                "available_for_mentoring": d.get("available_for_mentoring", False),
                "updated_at": datetime.utcnow().isoformat(),
            }
            
            # Try update, fallback to insert
            result = sb.table("alumni_profiles").update(profile).eq("roll_no", roll_no).execute()
            if not result.data:
                profile["created_at"] = datetime.utcnow().isoformat()
                result = sb.table("alumni_profiles").insert(profile).execute()
            
            return jsonify(success=True, profile=profile)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/alumni/directory", methods=["GET"])
    def get_alumni_directory():
        """Get alumni directory with search and filtering"""
        try:
            if not sb:
                return jsonify(success=True, alumni=[])
            
            search = request.args.get("search")
            graduation_year = request.args.get("graduation_year")
            company = request.args.get("company")
            industry = request.args.get("industry")
            limit = int(request.args.get("limit", 50))
            
            q = sb.table("alumni_profiles").select("*")
            
            if graduation_year:
                q = q.eq("graduation_year", int(graduation_year))
            if company:
                q = q.ilike("current_company", f"%{company}%")
            if industry:
                q = q.eq("industry", industry)
            
            result = q.range(0, limit).execute()
            alumni = result.data or []
            
            # Apply search filter if provided
            if search:
                search_lower = search.lower()
                alumni = [a for a in alumni if 
                          search_lower in (a.get("full_name", "").lower() or "") or
                          search_lower in (a.get("current_company", "").lower() or "")]
            
            return jsonify(success=True, alumni=alumni)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # JOB BOARD
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/jobs", methods=["GET"])
    def get_job_listings():
        """Get active job listings"""
        try:
            if not sb:
                return jsonify(success=True, jobs=[])
            
            category = request.args.get("category")
            location = request.args.get("location")
            level = request.args.get("level")  # entry, mid, senior
            limit = int(request.args.get("limit", 50))
            
            q = sb.table("job_postings").select("*").eq("status", "active")
            
            if category:
                q = q.eq("category", category)
            if location:
                q = q.ilike("location", f"%{location}%")
            if level:
                q = q.eq("experience_level", level)
            
            result = q.order("posted_at", desc=True).range(0, limit).execute()
            return jsonify(success=True, jobs=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/jobs", methods=["POST"])
    def post_job_listing():
        """Post a new job listing"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            job = {
                "job_id": str(uuid.uuid4()),
                "title": d.get("title"),
                "company": d.get("company"),
                "description": d.get("description"),
                "category": d.get("category"),
                "location": d.get("location"),
                "salary_min": d.get("salary_min"),
                "salary_max": d.get("salary_max"),
                "experience_level": d.get("experience_level"),
                "skills_required": d.get("skills_required", []),
                "job_type": d.get("job_type", "full-time"),  # full-time, part-time, contract
                "posted_by": d.get("posted_by"),
                "status": "active",
                "posted_at": datetime.utcnow().isoformat(),
                "application_deadline": d.get("application_deadline"),
            }
            
            result = sb.table("job_postings").insert(job).execute()
            return jsonify(success=True, job=result.data[0] if result.data else job)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/jobs/<job_id>/apply", methods=["POST"])
    def apply_for_job(job_id):
        """Apply for a job"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            application = {
                "application_id": str(uuid.uuid4()),
                "job_id": job_id,
                "applicant_roll_no": d.get("roll_no"),
                "applicant_email": d.get("email"),
                "resume_url": d.get("resume_url"),
                "cover_letter": d.get("cover_letter"),
                "status": "submitted",
                "applied_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("job_applications").insert(application).execute()
            return jsonify(success=True, application=result.data[0] if result.data else application)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # PLACEMENT TRACKING
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/placement/record", methods=["POST"])
    def record_placement():
        """Record student placement"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            placement = {
                "placement_id": str(uuid.uuid4()),
                "roll_no": d.get("roll_no"),
                "company": d.get("company"),
                "job_title": d.get("job_title"),
                "salary": float(d.get("salary", 0)),
                "location": d.get("location"),
                "ctc": d.get("ctc"),  # Cost to company
                "joining_date": d.get("joining_date"),
                "placement_date": datetime.utcnow().isoformat(),
                "verified_by": d.get("verified_by"),
            }
            
            result = sb.table("placements").insert(placement).execute()
            return jsonify(success=True, placement=result.data[0] if result.data else placement)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/placement/statistics", methods=["GET"])
    def get_placement_statistics():
        """Get placement statistics"""
        try:
            if not sb:
                return jsonify(success=True, statistics={})
            
            year = request.args.get("year")
            program = request.args.get("program")
            
            q = sb.table("placements").select("*")
            if year:
                q = q.eq("year", year)
            if program:
                q = q.eq("program", program)
            
            placements = q.execute().data or []
            
            if not placements:
                return jsonify(success=True, statistics={
                    "total_placements": 0,
                    "placement_rate": 0,
                    "average_salary": 0,
                })
            
            # Calculate statistics
            salaries = [float(p.get("salary", 0)) for p in placements if p.get("salary")]
            
            return jsonify(
                success=True,
                statistics={
                    "total_placements": len(placements),
                    "average_salary": round(sum(salaries) / max(len(salaries), 1), 2) if salaries else 0,
                    "highest_salary": max(salaries) if salaries else 0,
                    "lowest_salary": min(salaries) if salaries else 0,
                    "companies": len(set(p.get("company") for p in placements)),
                }
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # MENTORSHIP PROGRAM
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/mentorship/mentors", methods=["GET"])
    def get_available_mentors():
        """Get available mentors from alumni"""
        try:
            if not sb:
                return jsonify(success=True, mentors=[])
            
            field = request.args.get("field")
            
            q = sb.table("alumni_profiles").select("*").eq("available_for_mentoring", True)
            
            if field:
                q = q.eq("industry", field)
            
            result = q.range(0, 50).execute()
            return jsonify(success=True, mentors=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/mentorship/request", methods=["POST"])
    def request_mentorship():
        """Request mentorship from an alumni"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            request_record = {
                "mentorship_id": str(uuid.uuid4()),
                "mentee_roll_no": d.get("mentee_roll_no"),
                "mentor_roll_no": d.get("mentor_roll_no"),
                "field": d.get("field"),
                "goals": d.get("goals"),
                "status": "pending",
                "requested_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("mentorship_requests").insert(request_record).execute()
            return jsonify(success=True, mentorship=result.data[0] if result.data else request_record)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/mentorship/<mentorship_id>/accept", methods=["POST"])
    def accept_mentorship_request(mentorship_id):
        """Accept a mentorship request"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            sb.table("mentorship_requests").update({
                "status": "accepted",
                "accepted_at": datetime.utcnow().isoformat(),
            }).eq("mentorship_id", mentorship_id).execute()
            
            return jsonify(success=True, message="Mentorship request accepted")
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/mentorship/sessions", methods=["GET"])
    def get_mentorship_sessions():
        """Get mentorship sessions"""
        try:
            if not sb:
                return jsonify(success=True, sessions=[])
            
            user_roll_no = request.args.get("user_roll_no")
            
            result = sb.table("mentorship_sessions").select("*").eq("mentorship_id", user_roll_no).order("session_date", desc=True).execute()
            return jsonify(success=True, sessions=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/mentorship/session", methods=["POST"])
    def log_mentorship_session():
        """Log a mentorship session"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            session = {
                "session_id": str(uuid.uuid4()),
                "mentorship_id": d.get("mentorship_id"),
                "session_date": d.get("session_date"),
                "duration_minutes": int(d.get("duration_minutes", 0)),
                "topics_discussed": d.get("topics_discussed", []),
                "mentor_notes": d.get("mentor_notes"),
                "mentee_feedback": d.get("mentee_feedback"),
                "next_session_date": d.get("next_session_date"),
                "recorded_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("mentorship_sessions").insert(session).execute()
            return jsonify(success=True, session=result.data[0] if result.data else session)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    # ══════════════════════════════════════════════════════════════
    # ALUMNI NETWORKING
    # ══════════════════════════════════════════════════════════════
    
    @app.route("/api/alumni/network/events", methods=["GET"])
    def get_networking_events():
        """Get alumni networking events"""
        try:
            if not sb:
                return jsonify(success=True, events=[])
            
            upcoming = request.args.get("upcoming", "true").lower() == "true"
            
            q = sb.table("alumni_events").select("*")
            if upcoming:
                q = q.gte("event_date", datetime.utcnow().isoformat())
            
            result = q.order("event_date", desc=True).range(0, 50).execute()
            return jsonify(success=True, events=result.data or [])
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/alumni/network/events", methods=["POST"])
    def create_networking_event():
        """Create an alumni networking event"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            event = {
                "event_id": str(uuid.uuid4()),
                "title": d.get("title"),
                "description": d.get("description"),
                "event_date": d.get("event_date"),
                "location": d.get("location"),
                "organized_by": d.get("organized_by"),
                "capacity": int(d.get("capacity", 0)),
                "registrations": 0,
                "created_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("alumni_events").insert(event).execute()
            return jsonify(success=True, event=result.data[0] if result.data else event)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
    
    
    @app.route("/api/alumni/network/events/<event_id>/register", methods=["POST"])
    def register_for_event(event_id):
        """Register for an alumni event"""
        try:
            if not sb:
                return jsonify(success=False, error="Database not available"), 500
            
            d = request.json or {}
            
            registration = {
                "registration_id": str(uuid.uuid4()),
                "event_id": event_id,
                "alumni_roll_no": d.get("roll_no"),
                "registered_at": datetime.utcnow().isoformat(),
            }
            
            result = sb.table("event_registrations").insert(registration).execute()
            
            # Update event registration count
            if result.data:
                event = sb.table("alumni_events").select("registrations").eq("event_id", event_id).execute()
                if event.data:
                    current = event.data[0].get("registrations", 0)
                    sb.table("alumni_events").update({"registrations": current + 1}).eq("event_id", event_id).execute()
            
            return jsonify(success=True, registration=result.data[0] if result.data else registration)
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500
