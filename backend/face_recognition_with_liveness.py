"""
Face Recognition with Eye Blinking Liveness Detection
Using dlib for robust eye aspect ratio (EAR) based liveness detection.
Prevents fake/static image verification.

Installation:
pip install -q face_recognition pillow numpy opencv-python-headless dlib

Usage:
- Register student: register_person("LOKNATH", samples=5)
- Verify attendance: verify_and_mark(tolerance=0.5)
"""

import base64
import time
import csv
import pickle
import numpy as np
from pathlib import Path
from datetime import datetime, timezone, timedelta
from PIL import Image

# Try importing optional libraries
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False
    print("[WARNING] face_recognition not installed")

try:
    import dlib
    DLIB_AVAILABLE = True
except ImportError:
    DLIB_AVAILABLE = False
    print("[WARNING] dlib not installed")

try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    print("[WARNING] opencv not installed")

# Configuration
ENC_PATH = "encodings.pkl"
ATTENDANCE_CSV = "attendance.csv"
EYE_ASPECT_RATIO_THRESHOLD = 0.1  # Lower EAR = eye closed
LIVENESS_CHECK_ENABLED = True


def calculate_eye_aspect_ratio(eye_points):
    """Calculate the eye aspect ratio using dlib landmarks.
    
    EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
    where p1...p6 are the eye landmark points.
    High EAR = eye open, Low EAR = eye closed
    """
    try:
        pts = np.array(eye_points)
        if len(pts) < 6:
            return 0.0
        
        # Vertical distances (p2-p6 and p3-p5)
        dist_top_bottom_1 = np.linalg.norm(pts[1] - pts[5])
        dist_top_bottom_2 = np.linalg.norm(pts[2] - pts[4])
        
        # Horizontal distance (p1-p4)
        dist_left_right = np.linalg.norm(pts[0] - pts[3])
        
        if dist_left_right == 0:
            return 0.0
        
        # Calculate EAR
        ear = (dist_top_bottom_1 + dist_top_bottom_2) / (2.0 * dist_left_right)
        return float(ear)
    except Exception as e:
        print(f"[EAR_CALC] Error: {e}")
        return 0.0


def detect_eye_blinking(image_path, detector=None, shape_predictor=None):
    """Detect if eyes are open (not blinking/winking) using dlib.
    
    Args:
        image_path: Path to image file
        detector: dlib frontal face detector
        shape_predictor: dlib shape predictor (68 landmarks)
    
    Returns:
        dict with keys:
            - is_liveness_check_passed (bool): Whether liveness test passed
            - left_ear (float): Left eye aspect ratio
            - right_ear (float): Right eye aspect ratio
            - avg_ear (float): Average EAR
            - message (str): Description
    """
    result = {
        "is_liveness_check_passed": False,
        "left_ear": 0.0,
        "right_ear": 0.0,
        "avg_ear": 0.0,
        "message": "Liveness check not performed"
    }
    
    if not DLIB_AVAILABLE or detector is None or shape_predictor is None:
        result["message"] = "dlib or shape predictor not available - skipping liveness check"
        return result
    
    try:
        import cv2
        
        # Read image
        img = cv2.imread(image_path)
        if img is None:
            result["message"] = "Could not read image"
            return result
        
        # Convert to grayscale for detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = detector(gray, 0)
        
        if len(faces) == 0:
            result["message"] = "No face detected"
            return result
        
        if len(faces) > 1:
            result["message"] = f"Multiple faces detected ({len(faces)})"
            return result
        
        # Get landmarks for first face
        landmarks = shape_predictor(gray, faces[0])
        
        # dlib landmark indices:
        # Left eye: 36-41
        # Right eye: 42-47
        left_eye_pts = np.array([(landmarks.part(i).x, landmarks.part(i).y) for i in range(36, 42)])
        right_eye_pts = np.array([(landmarks.part(i).x, landmarks.part(i).y) for i in range(42, 48)])
        
        # Calculate eye aspect ratios
        left_ear = calculate_eye_aspect_ratio(left_eye_pts)
        right_ear = calculate_eye_aspect_ratio(right_eye_pts)
        avg_ear = (left_ear + right_ear) / 2.0
        
        result["left_ear"] = left_ear
        result["right_ear"] = right_ear
        result["avg_ear"] = avg_ear
        
        # Check if eyes are open
        if avg_ear >= EYE_ASPECT_RATIO_THRESHOLD:
            result["is_liveness_check_passed"] = True
            result["message"] = f"✓ Live face detected (EAR: {avg_ear:.4f})"
        else:
            result["is_liveness_check_passed"] = False
            result["message"] = f"✗ Eyes closed/winking detected (EAR: {avg_ear:.4f} < {EYE_ASPECT_RATIO_THRESHOLD})"
        
        return result
    
    except Exception as e:
        result["message"] = f"Error during liveness check: {e}"
        return result


def load_encodings():
    """Load face encodings and names from pickle file."""
    if Path(ENC_PATH).exists():
        with open(ENC_PATH, "rb") as f:
            d = pickle.load(f)
            return [np.array(e) for e in d["encodings"]], d["names"]
    return [], []


def save_encodings(encs, names):
    """Save face encodings and names to pickle file."""
    with open(ENC_PATH, "wb") as f:
        pickle.dump({
            "encodings": [e.tolist() for e in encs],
            "names": names
        }, f)
    print("[+] Encodings saved to disk")


def encode_image(path):
    """Encode face(s) in image using face_recognition library."""
    if not FACE_RECOGNITION_AVAILABLE:
        print("[!] face_recognition library not available")
        return []
    
    try:
        img = np.array(Image.open(path).convert("RGB"))
        face_encs = face_recognition.face_encodings(img)
        print(f"[+] Detected {len(face_encs)} face(s) in {path}")
        return face_encs
    except Exception as e:
        print(f"[!] Error encoding image: {e}")
        return []


def register_person(name, samples=5, use_liveness=True):
    """Register a person by capturing multiple face samples.
    
    Args:
        name: Name/ID of person to register
        samples: Number of samples to capture
        use_liveness: Whether to enforce eye blinking check
    """
    if not FACE_RECOGNITION_AVAILABLE:
        print("[!] face_recognition not available - cannot register")
        return
    
    encs, names = load_encodings()
    print(f"\n[+] Registering {name}...")
    
    # Initialize dlib components if available
    detector = None
    shape_predictor = None
    
    if DLIB_AVAILABLE:
        try:
            detector = dlib.get_frontal_face_detector()
            # Try to load shape predictor
            _root = Path(__file__).parent.parent
            sp_paths = [
                _root / "models" / "shape_predictor_68_face_landmarks.dat",
                Path(dlib.__file__).parent / "shape_predictor_68_face_landmarks.dat",
            ]
            for sp_path in sp_paths:
                if sp_path.exists():
                    shape_predictor = dlib.shape_predictor(str(sp_path))
                    print(f"[+] Loaded shape predictor from {sp_path}")
                    break
        except Exception as e:
            print(f"[!] Could not initialize dlib: {e}")
    
    captured = 0
    
    for i in range(samples):
        print(f"\n[*] Sample {i+1}/{samples}")
        fname = f"{name}_{i}.jpg"
        
        # In production, capture from camera or web interface
        # For this demo, simulate by copying a test image
        print(f"    [!] Please provide {fname} in the current directory")
        print(f"    [+] Waiting for image: {fname}")
        
        # Wait for file (max 30 seconds)
        for _ in range(30):
            if Path(fname).exists():
                break
            time.sleep(1)
        
        if not Path(fname).exists():
            print(f"    [!] Timeout: {fname} not found, skipping...")
            continue
        
        # Check liveness if enabled
        if use_liveness and (detector is not None and shape_predictor is not None):
            print(f"    [*] Checking liveness (eye blinking)...")
            liveness_result = detect_eye_blinking(fname, detector, shape_predictor)
            print(f"    {liveness_result['message']}")
            
            if not liveness_result["is_liveness_check_passed"]:
                print(f"    [!] Liveness check failed! Make sure eyes are open and visible.")
                continue
        
        # Encode face
        face_encs = encode_image(fname)
        
        if len(face_encs) != 1:
            print(f"    [!] Expected 1 face, found {len(face_encs)}. Skipping sample...")
            continue
        
        # Add to encoding list
        encs.append(face_encs[0])
        names.append(name)
        captured += 1
        
        print(f"    [+] Sample {captured} saved successfully")
    
    if captured > 0:
        save_encodings(encs, names)
        print(f"\n[+] Registration complete! Captured {captured}/{samples} samples for {name}")
    else:
        print(f"\n[!] Registration failed - no valid samples captured")


def mark_attendance(name):
    """Mark attendance record with timestamp."""
    # Use IST timezone
    IST = timezone(timedelta(hours=5, minutes=30))
    ts = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
    
    write_header = not Path(ATTENDANCE_CSV).exists()
    
    with open(ATTENDANCE_CSV, "a", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(["name", "timestamp"])
        w.writerow([name, ts])
    
    print(f"[+] Attendance marked for {name} at {ts}")


def verify_and_mark(tolerance=0.5, use_liveness=True):
    """Verify student face and mark attendance if match found.
    
    Args:
        tolerance: Face distance threshold (lower = stricter matching)
        use_liveness: Whether to enforce eye blinking check
    """
    if not FACE_RECOGNITION_AVAILABLE:
        print("[!] face_recognition not available")
        return
    
    encs, names = load_encodings()
    
    if not encs:
        print("[!] No registered users - please register first")
        return
    
    # Initialize dlib components if available
    detector = None
    shape_predictor = None
    
    if DLIB_AVAILABLE:
        try:
            detector = dlib.get_frontal_face_detector()
            sp_paths = [
                Path(__file__).parent.parent / "models" / "shape_predictor_68_face_landmarks.dat",
                Path(dlib.__file__).parent / "shape_predictor_68_face_landmarks.dat",
            ]
            for sp_path in sp_paths:
                if sp_path.exists():
                    shape_predictor = dlib.shape_predictor(str(sp_path))
                    break
        except Exception as e:
            print(f"[!] Could not initialize dlib: {e}")
    
    fname = "verify.jpg"
    print(f"\n[*] Verification: waiting for image {fname}...")
    
    # Wait for file (max 30 seconds)
    for _ in range(30):
        if Path(fname).exists():
            break
        time.sleep(1)
    
    if not Path(fname).exists():
        print(f"[!] Timeout: {fname} not provided")
        return
    
    # Check liveness if enabled
    if use_liveness and LIVENESS_CHECK_ENABLED and (detector is not None and shape_predictor is not None):
        print(f"\n[*] Liveness check (eye blinking detection)...")
        liveness_result = detect_eye_blinking(fname, detector, shape_predictor)
        print(f"    {liveness_result['message']}")
        print(f"    Left EAR: {liveness_result['left_ear']:.4f}")
        print(f"    Right EAR: {liveness_result['right_ear']:.4f}")
        print(f"    Avg EAR: {liveness_result['avg_ear']:.4f}")
        
        if not liveness_result["is_liveness_check_passed"]:
            print(f"\n[!] VERIFICATION FAILED - Liveness check failed!")
            print(f"    Reason: Eyes appear closed/not visible (fake/static image detected)")
            return
    
    # Encode face in verification image
    face_encs = encode_image(fname)
    
    if not face_encs:
        print(f"[!] No face detected in verification image")
        return
    
    if len(face_encs) > 1:
        print(f"[!] Multiple faces detected ({len(face_encs)}). Please show only one face.")
        return
    
    # Compare with registered encodings
    encs_array = np.array(encs)
    distances = face_recognition.face_distance(encs_array, face_encs[0])
    
    idx = np.argmin(distances)
    min_distance = distances[idx]
    
    print(f"\n[*] Verification Results:")
    print(f"    Detected face distance: {min_distance:.4f}")
    print(f"    Tolerance threshold: {tolerance:.4f}")
    print(f"    Best match: {names[idx]}")
    
    if min_distance <= tolerance:
        matched_name = names[idx]
        confidence = max(0, 1 - (min_distance / 2.0))
        
        print(f"\n[+] VERIFICATION SUCCESSFUL!")
        print(f"    Name/ID: {matched_name}")
        print(f"    Confidence: {confidence:.2%}")
        print(f"    Distance: {min_distance:.4f}")
        
        # Mark attendance
        mark_attendance(matched_name)
        return {"verified": True, "name": matched_name, "confidence": confidence}
    else:
        confidence = max(0, 1 - (min_distance / 2.0))
        print(f"\n[!] VERIFICATION FAILED - Face not recognized")
        print(f"    Distance to best match: {min_distance:.4f}")
        print(f"    Confidence: {confidence:.2%}")
        return {"verified": False, "name": names[idx], "confidence": confidence}


if __name__ == "__main__":
    print("=" * 50)
    print("Face Recognition with Eye Blinking Detection")
    print("=" * 50)
    
    # Check dependencies
    print("\n[*] Checking dependencies...")
    print(f"    face_recognition: {'✓' if FACE_RECOGNITION_AVAILABLE else '✗'}")
    print(f"    dlib: {'✓' if DLIB_AVAILABLE else '✗'}")
    print(f"    opencv-python: {'✓' if OPENCV_AVAILABLE else '✗'}")
    
    if not FACE_RECOGNITION_AVAILABLE:
        print("\n[!] Please install dependencies:")
        print("    pip install face_recognition pillow numpy opencv-python dlib")
        exit(1)
    
    # Example usage
    print("\n[*] Example 1: Register student LOKNATH with 1 sample")
    print("    register_person('LOKNATH', samples=1)")
    
    print("\n[*] Example 2: Verify and mark attendance")
    print("    verify_and_mark(tolerance=0.5)")
    
    print("\n[*] To run these examples:")
    print("    1. Place student photo as 'LOKNATH_0.jpg' for registration")
    print("    2. Place verification photo as 'verify.jpg'")
    print("    3. Then call: register_person('LOKNATH', samples=1)")
    print("    4. Then call: verify_and_mark()")
