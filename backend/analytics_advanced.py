"""
Advanced Analytics Module with Predictive Models, Anomaly Detection,
Teacher Performance Metrics, and Risk Scoring
"""

import os
import json
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any, Optional
import logging

logger = logging.getLogger(__name__)

try:
    import pandas as pd  # type: ignore
    PANDAS_AVAILABLE = True
except ImportError:
    logger.warning("[ANALYTICS] pandas not installed - advanced analytics disabled")
    PANDAS_AVAILABLE = False
    pd = None

try:
    from sklearn.preprocessing import StandardScaler  # type: ignore
    from sklearn.ensemble import IsolationForest, RandomForestClassifier  # type: ignore
    from sklearn.linear_model import LinearRegression  # type: ignore
    from sklearn.metrics import accuracy_score, precision_score, recall_score  # type: ignore
    SKLEARN_AVAILABLE = True
except ImportError:
    logger.warning("[ANALYTICS] scikit-learn not installed - advanced ML features disabled")
    SKLEARN_AVAILABLE = False


# ============================================
# ANOMALY DETECTION
# ============================================

class AnomalyDetector:
    """Detect unusual attendance patterns using Isolation Forest."""
    
    def __init__(self, contamination: float = 0.1):
        """
        Args:
            contamination: Expected proportion of anomalies (0-1)
        """
        self.contamination = contamination
        self.model = None
        self.scaler = None
        self.fitted = False
    
    def fit(self, attendance_data: List[Dict]) -> None:
        """
        Train anomaly detector on historical attendance.
        
        Expected data format:
        [
            {'date': '2026-03-01', 'student_id': 'CSE0001', 'present': 1, 'confidence': 0.95},
            ...
        ]
        """
        if not SKLEARN_AVAILABLE or not attendance_data:
            return
        
        try:
            df = pd.DataFrame(attendance_data)
            
            # Feature engineering
            features = []
            for idx, row in df.iterrows():
                feature_vec = [
                    row.get('present', 0),
                    row.get('confidence', 0.5),
                    1 if row.get('in_campus', False) else 0,
                    1 if row.get('verified', False) else 0,
                ]
                features.append(feature_vec)
            
            X = np.array(features)
            
            # Scale features
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            
            # Fit Isolation Forest
            self.model = IsolationForest(
                contamination=self.contamination,
                random_state=42,
                n_estimators=100
            )
            self.model.fit(X_scaled)
            self.fitted = True
            logger.info(f"[ANOMALY] Model fitted on {len(attendance_data)} records")
        
        except Exception as e:
            logger.error(f"[ANOMALY] Fit error: {e}")
    
    def predict(self, record: Dict) -> Tuple[bool, float]:
        """
        Detect if a record is anomalous.
        
        Returns:
            (is_anomaly, anomaly_score)
        """
        if not self.fitted or not SKLEARN_AVAILABLE:
            return False, 0.0
        
        try:
            feature_vec = np.array([[
                record.get('present', 0),
                record.get('confidence', 0.5),
                1 if record.get('in_campus', False) else 0,
                1 if record.get('verified', False) else 0,
            ]])
            
            X_scaled = self.scaler.transform(feature_vec)
            prediction = self.model.predict(X_scaled)[0]
            anomaly_score = abs(self.model.score_samples(X_scaled)[0])
            
            is_anomaly = prediction == -1
            return is_anomaly, float(anomaly_score)
        
        except Exception as e:
            logger.warning(f"[ANOMALY] Prediction error: {e}")
            return False, 0.0


# ============================================
# PREDICTIVE ANALYTICS
# ============================================

class AttendancePredictor:
    """Predict future attendance patterns and identify at-risk students."""
    
    def __init__(self):
        self.attendance_model = None
        self.risk_model = None
        self.scaler = None
        self.fitted = False
    
    def fit(self, student_history: Dict[str, List[Dict]]) -> None:
        """
        Train models on historical student attendance.
        
        Args:
            student_history: {student_id: [{'date', 'present', 'confidence'}, ...]}
        """
        if not SKLEARN_AVAILABLE or not student_history:
            return
        
        try:
            X_data = []
            y_data = []
            
            for student_id, records in student_history.items():
                if len(records) < 7:  # Need at least 7 days of data
                    continue
                
                # Calculate rolling features
                df = pd.DataFrame(records)
                df['date'] = pd.to_datetime(df['date'])
                df = df.sort_values('date')
                
                df['present_3day_avg'] = df['present'].rolling(window=3, min_periods=1).mean()
                df['confidence_3day_avg'] = df['confidence'].rolling(window=3, min_periods=1).mean()
                df['present_7day_trend'] = df['present'].rolling(window=7, min_periods=1).mean()
                
                # Use first 7 days to predict next day
                for i in range(7, len(df)):
                    X = [
                        df.iloc[i-7:i]['present'].mean(),
                        df.iloc[i-7:i]['confidence'].mean(),
                        df.iloc[i-1]['present_3day_avg'],
                        df.iloc[i-1]['confidence_3day_avg'],
                        df.iloc[i-1]['present_7day_trend']
                    ]
                    X_data.append(X)
                    y_data.append(df.iloc[i]['present'])
            
            if not X_data or not y_data:
                return
            
            X = np.array(X_data)
            y = np.array(y_data)
            
            # Scale
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            
            # Train attendance predictor
            self.attendance_model = LinearRegression()
            self.attendance_model.fit(X_scaled, y)
            
            # Train risk classifier (binary: at-risk or not)
            y_risk = (y < 0.7).astype(int)  # At-risk if below 70% attendance
            self.risk_model = RandomForestClassifier(n_estimators=50, random_state=42)
            self.risk_model.fit(X_scaled, y_risk)
            
            self.fitted = True
            logger.info("[PREDICT] Models fitted successfully")
        
        except Exception as e:
            logger.error(f"[PREDICT] Fit error: {e}")
    
    def predict_next_attendance(self, recent_records: List[Dict]) -> Tuple[float, float]:
        """
        Predict next attendance probability.
        
        Returns:
            (predicted_probability, confidence)
        """
        if not self.fitted or not SKLEARN_AVAILABLE or len(recent_records) < 7:
            return 0.5, 0.0
        
        try:
            df = pd.DataFrame(recent_records)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
            
            df['present_3day_avg'] = df['present'].rolling(window=3, min_periods=1).mean()
            df['confidence_3day_avg'] = df['confidence'].rolling(window=3, min_periods=1).mean()
            df['present_7day_trend'] = df['present'].rolling(window=7, min_periods=1).mean()
            
            X = [[
                df['present'].mean(),
                df['confidence'].mean(),
                df.iloc[-3:]['present'].mean(),
                df.iloc[-3:]['confidence'].mean(),
                df['present_7day_trend'].iloc[-1]
            ]]
            
            X_scaled = self.scaler.transform(X)
            pred = self.attendance_model.predict(X_scaled)[0]
            pred_prob = max(0, min(1, pred))  # Clip to [0, 1]
            
            # Get confidence from model R² (simplified)
            confidence = 0.7  # Default confidence
            
            return pred_prob, confidence
        
        except Exception as e:
            logger.warning(f"[PREDICT] Error: {e}")
            return 0.5, 0.0
    
    def predict_risk_score(self, recent_records: List[Dict]) -> Tuple[float, str]:
        """
        Predict if student is at risk of low attendance.
        
        Returns:
            (risk_probability (0-1), risk_level ('LOW'|'MEDIUM'|'HIGH'|'CRITICAL'))
        """
        if not self.fitted or not SKLEARN_AVAILABLE or len(recent_records) < 7:
            return 0.0, "UNKNOWN"
        
        try:
            df = pd.DataFrame(recent_records)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
            
            df['present_3day_avg'] = df['present'].rolling(window=3, min_periods=1).mean()
            df['confidence_3day_avg'] = df['confidence'].rolling(window=3, min_periods=1).mean()
            df['present_7day_trend'] = df['present'].rolling(window=7, min_periods=1).mean()
            
            X = [[
                df['present'].mean(),
                df['confidence'].mean(),
                df.iloc[-3:]['present'].mean(),
                df.iloc[-3:]['confidence'].mean(),
                df['present_7day_trend'].iloc[-1]
            ]]
            
            X_scaled = self.scaler.transform(X)
            risk_prob = self.risk_model.predict_proba(X_scaled)[0][1]
            
            # Classify risk level
            if risk_prob < 0.25:
                level = "LOW"
            elif risk_prob < 0.5:
                level = "MEDIUM"
            elif risk_prob < 0.75:
                level = "HIGH"
            else:
                level = "CRITICAL"
            
            return float(risk_prob), level
        
        except Exception as e:
            logger.warning(f"[RISK] Error: {e}")
            return 0.0, "UNKNOWN"


# ============================================
# TEACHER PERFORMANCE ANALYTICS
# ============================================

class TeacherPerformanceAnalytics:
    """Analyze teacher session efficiency and face verification accuracy."""
    
    @staticmethod
    def get_teacher_metrics(teacher_id: str, sb=None) -> Dict[str, Any]:
        """
        Get comprehensive teacher performance metrics.
        
        Returns dict with:
            - total_sessions: number of sessions conducted
            - avg_verification_rate: avg face match success %
            - avg_session_duration: minutes
            - total_students_enrolled: across all sessions
            - unique_students_verified: verified in at least 1 session
            - avg_confidence: average face match confidence
            - session_efficiency: verified / enrolled %
        """
        if not sb:
            return {}
        
        try:
            # Get all sessions for this teacher
            sessions = sb.table("qr_sessions").select("*").eq("teacher_id", teacher_id).execute()
            
            if not sessions.data:
                return {
                    'teacher_id': teacher_id,
                    'total_sessions': 0,
                    'message': 'No sessions found'
                }
            
            # Calculate metrics
            total_sessions = len(sessions.data)
            total_verified = 0
            total_enrolled = 0
            total_confidence = 0
            confidence_count = 0
            session_durations = []
            unique_verified = set()
            
            for session in sessions.data:
                session_id = session.get('id')
                
                # Get attendance records for this session
                attendances = sb.table("attendance").select("*").eq("session_id", session_id).execute()
                
                if attendances.data:
                    for record in attendances.data:
                        total_enrolled += 1
                        if record.get('verified'):
                            total_verified += 1
                            unique_verified.add(record.get('roll_no'))
                        
                        conf = record.get('confidence', 0)
                        if conf:
                            total_confidence += conf
                            confidence_count += 1
                
                # Calculate session duration
                started = session.get('started_at')
                ended = session.get('ended_at')
                if started and ended:
                    start_dt = datetime.fromisoformat(started)
                    end_dt = datetime.fromisoformat(ended)
                    duration_mins = (end_dt - start_dt).total_seconds() / 60
                    session_durations.append(duration_mins)
            
            avg_verification_rate = (total_verified / total_enrolled * 100) if total_enrolled > 0 else 0
            avg_session_duration = np.mean(session_durations) if session_durations else 0
            avg_confidence = (total_confidence / confidence_count) if confidence_count > 0 else 0
            session_efficiency = (total_verified / total_enrolled * 100) if total_enrolled > 0 else 0
            
            return {
                'teacher_id': teacher_id,
                'total_sessions': total_sessions,
                'avg_verification_rate': round(avg_verification_rate, 2),
                'avg_session_duration_mins': round(avg_session_duration, 2),
                'total_students_enrolled': total_enrolled,
                'unique_students_verified': len(unique_verified),
                'avg_confidence': round(avg_confidence, 3),
                'session_efficiency': round(session_efficiency, 2),
                'last_session': sessions.data[-1].get('ended_at')
            }
        
        except Exception as e:
            logger.error(f"[TEACHER-METRICS] Error: {e}")
            return {}
    
    @staticmethod
    def get_teacher_comparison(teacher_ids: List[str], sb=None) -> List[Dict]:
        """Compare multiple teachers side-by-side."""
        if not sb:
            return []
        
        results = []
        for tid in teacher_ids:
            metrics = TeacherPerformanceAnalytics.get_teacher_metrics(tid, sb)
            if metrics:
                results.append(metrics)
        
        return sorted(results, key=lambda x: x.get('session_efficiency', 0), reverse=True)


# ============================================
# STUDENT RISK SCORING
# ============================================

class StudentRiskScorer:
    """Identify students at risk of failing due to low attendance."""
    
    @staticmethod
    def calculate_risk_score(student_data: Dict) -> Tuple[float, str, List[str]]:
        """
        Calculate risk score for a student.
        
        Args:
            student_data: {
                'roll_no': 'CSE0001',
                'attendance_percentage': 65.0,
                'days_since_last_attendance': 5,
                'face_verification_failures': 3,
                'location_failures': 2,
                'recent_trend': -0.05  # % change per day
            }
        
        Returns:
            (risk_score (0-100), risk_level, risk_factors)
        """
        score = 0
        factors = []
        
        # Factor 1: Low attendance percentage (40 points max)
        attendance = student_data.get('attendance_percentage', 100)
        if attendance < 75:
            att_score = 40 * (1 - attendance / 100)
            score += att_score
            factors.append(f"Low attendance: {attendance:.1f}%")
        
        # Factor 2: Days since last attendance (30 points max)
        days_absent = student_data.get('days_since_last_attendance', 0)
        if days_absent > 7:
            absence_score = min(30, days_absent * 2)
            score += absence_score
            factors.append(f"Absent for {days_absent} days")
        
        # Factor 3: Verification failures (20 points max)
        verify_failures = student_data.get('face_verification_failures', 0)
        if verify_failures > 0:
            verify_score = min(20, verify_failures * 3)
            score += verify_score
            factors.append(f"{verify_failures} verification failures")
        
        # Factor 4: Location verification failures (10 points max)
        location_failures = student_data.get('location_failures', 0)
        if location_failures > 0:
            loc_score = min(10, location_failures * 2)
            score += loc_score
            factors.append(f"{location_failures} location failures")
        
        # Factor 5: Negative trend (10 points max)
        trend = student_data.get('recent_trend', 0)
        if trend < 0:
            trend_score = min(10, abs(trend) * 100)
            score += trend_score
            factors.append(f"Declining trend: {trend*100:.1f}% per day")
        
        # Clip to 0-100
        risk_score = min(100, max(0, score))
        
        # Determine level
        if risk_score < 25:
            level = "LOW"
        elif risk_score < 50:
            level = "MEDIUM"
        elif risk_score < 75:
            level = "HIGH"
        else:
            level = "CRITICAL"
        
        return risk_score, level, factors
    
    @staticmethod
    def get_at_risk_students(sb=None, threshold: float = 50) -> List[Dict]:
        """Get all students with risk score > threshold."""
        if not sb:
            return []
        
        try:
            # Get all students with recent attendance
            users = sb.table("users").select("roll_no,full_name,department,section").eq("role", "student").execute()
            
            at_risk = []
            
            for user in (users.data or []):
                roll_no = user.get('roll_no')
                
                # Get attendance records for last 30 days
                thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).date()
                records = sb.table("attendance").select("*").eq("roll_no", roll_no).order("date", desc=True).limit(30).execute()
                
                if not records.data:
                    continue
                
                # Calculate metrics
                total_classes = len(records.data)
                marked = sum(1 for r in records.data if r.get('verified'))
                attendance_pct = (marked / total_classes * 100) if total_classes > 0 else 0
                
                last_marked = records.data[0].get('date') if records.data else None
                days_absent = 0
                if last_marked:
                    days_absent = (datetime.utcnow().date() - datetime.fromisoformat(last_marked).date()).days
                
                verify_failures = sum(1 for r in records.data if not r.get('verified'))
                location_failures = sum(1 for r in records.data if not r.get('in_campus'))
                
                # Calculate trend (attendance change)
                if len(records.data) >= 14:
                    first_week = records.data[:7]
                    second_week = records.data[7:14]
                    first_week_pct = sum(1 for r in first_week if r.get('verified')) / 7
                    second_week_pct = sum(1 for r in second_week if r.get('verified')) / 7
                    trend = second_week_pct - first_week_pct
                else:
                    trend = 0
                
                # Calculate risk
                risk_score, level, factors = StudentRiskScorer.calculate_risk_score({
                    'attendance_percentage': attendance_pct,
                    'days_since_last_attendance': days_absent,
                    'face_verification_failures': verify_failures,
                    'location_failures': location_failures,
                    'recent_trend': trend
                })
                
                if risk_score > threshold:
                    at_risk.append({
                        'roll_no': roll_no,
                        'name': user.get('full_name'),
                        'department': user.get('department'),
                        'section': user.get('section'),
                        'risk_score': round(risk_score, 2),
                        'risk_level': level,
                        'attendance_percentage': round(attendance_pct, 2),
                        'risk_factors': factors
                    })
            
            return sorted(at_risk, key=lambda x: x['risk_score'], reverse=True)
        
        except Exception as e:
            logger.error(f"[RISK-STUDENTS] Error: {e}")
            return []


# ============================================
# REAL-TIME ANALYTICS AGGREGATOR
# ============================================

class RealTimeAnalyticsAggregator:
    """Aggregate analytics with streaming updates."""
    
    def __init__(self, buffer_size: int = 1000):
        self.buffer = deque(maxlen=buffer_size)
        self.aggregates = {}
        self.lock = threading.RLock()
    
    def add_event(self, event: Dict) -> None:
        """Add analytics event to stream."""
        with self.lock:
            self.buffer.append({
                'event': event,
                'timestamp': datetime.utcnow().isoformat()
            })
    
    def get_current_aggregates(self) -> Dict:
        """Get real-time aggregates."""
        with self.lock:
            return dict(self.aggregates)
    
    def compute_aggregates(self) -> Dict:
        """Compute aggregates from buffered events."""
        with self.lock:
            if not self.buffer:
                return {}
            
            df = pd.DataFrame([b['event'] for b in self.buffer])
            
            aggregates = {
                'event_count': len(self.buffer),
                'avg_confidence': float(df.get('confidence', [0]).mean()),
                'verification_rate': float((df.get('verified', [False]) == True).mean() * 100) if len(df) > 0 else 0,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            self.aggregates = aggregates
            return aggregates


import threading
from collections import deque
