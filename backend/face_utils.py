"""
Face Recognition Utilities & Liveness Detection Module
Consolidated utilities for face recognition, encoding, and liveness detection.

This module provides shared utilities extracted from face_recognition_with_liveness.py
and refactored for integration with the main authentication system.

Features:
- MTCNN face detection (Multi-task Cascaded Convolutional Networks) - more accurate than HOG
- HOG face detection (fallback)
- Eye aspect ratio calculation for liveness detection
- Face encoding extraction (128-dimensional dlib embeddings)
- Data augmentation support

Exports:
- encode_image(): Extract face encodings from image
- detect_faces_mtcnn(): Detect faces using MTCNN
- detect_faces_hog(): Detect faces using HOG (fallback)
- detect_eye_blinking(): Check if eyes are open (liveness check)
- calculate_eye_aspect_ratio(): Calculate EAR for liveness detection
"""

import numpy as np
from pathlib import Path
from PIL import Image
import logging

logger = logging.getLogger(__name__)

# Try importing optional libraries
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False
    logger.warning("face_recognition library not available")

try:
    import dlib
    DLIB_AVAILABLE = True
except ImportError:
    DLIB_AVAILABLE = False
    logger.warning("dlib not available")

try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    logger.warning("opencv-python not available")

try:
    from mtcnn import MTCNN
    MTCNN_AVAILABLE = True
    # Initialize MTCNN detector (will be lazily loaded)
    _mtcnn_detector = None
except ImportError:
    MTCNN_AVAILABLE = False
    logger.warning("MTCNN not available - falling back to HOG face detection")

# Configuration
EYE_ASPECT_RATIO_THRESHOLD = 0.1  # Lower EAR = eye closed
FACE_DETECTION_MODEL = 'mtcnn'    # 'mtcnn' or 'hog'


def get_mtcnn_detector():
    """Lazy load MTCNN detector to avoid initialization overhead."""
    global _mtcnn_detector
    if _mtcnn_detector is None and MTCNN_AVAILABLE:
        try:
            _mtcnn_detector = MTCNN()
            logger.info("✅ MTCNN detector initialized")
        except Exception as e:
            logger.error(f"Failed to initialize MTCNN: {e}")
            _mtcnn_detector = False
    return _mtcnn_detector if _mtcnn_detector is not False else None


# ============================================================================
# MTCNN FACE DETECTION
# ============================================================================

def detect_faces_mtcnn(image: np.ndarray, min_confidence: float = 0.95) -> list:
    """
    Detect faces using MTCNN (Multi-task Cascaded Convolutional Networks).
    
    MTCNN is more accurate than HOG and better handles:
    - Multiple face scales
    - Different lighting conditions
    - Partial occlusions
    - Various face angles
    
    Args:
        image: Input image (numpy array, RGB)
        min_confidence: Minimum confidence threshold (0-1)
        
    Returns:
        List of face locations as (x, y, w, h) tuples
    """
    detector = get_mtcnn_detector()
    if detector is None:
        logger.warning("MTCNN not available, falling back to HOG")
        return detect_faces_hog(image)
    
    try:
        # MTCNN expects BGR instead of RGB in some cases
        if len(image.shape) != 3 or image.shape[2] != 3:
            logger.warning(f"Invalid image shape: {image.shape}")
            return []
        
        # Detect faces with landmarks
        detections = detector.detect_faces(image)
        
        # Filter by confidence and convert to (x, y, w, h) format
        face_locations = []
        for detection in detections:
            if detection['confidence'] >= min_confidence:
                bounding_box = detection['box']  # [x, y, w, h]
                face_locations.append(tuple(bounding_box))
        
        logger.debug(f"MTCNN detected {len(face_locations)} faces with confidence >= {min_confidence}")
        return face_locations
        
    except Exception as e:
        logger.error(f"MTCNN detection failed: {e}")
        logger.warning("Falling back to HOG detection")
        return detect_faces_hog(image)


# ============================================================================
# HOG FACE DETECTION (FALLBACK)
# ============================================================================

def detect_faces_hog(image: np.ndarray, model: str = 'hog', upsample: int = 1) -> list:
    """
    Detect faces using Histogram of Oriented Gradients (HOG).
    Fallback method when MTCNN is not available.
    
    Args:
        image: Input image (numpy array, RGB)
        model: 'hog' (fast, CPU) or 'cnn' (slower, more accurate)
        upsample: Number of times to upsample image before detection
        
    Returns:
        List of face locations as (top, right, bottom, left) tuples
    """
    if not FACE_RECOGNITION_AVAILABLE:
        logger.error("face_recognition library not available")
        return []
    
    try:
        # face_recognition.face_locations returns (top, right, bottom, left)
        face_locations = face_recognition.face_locations(image, model=model, number_of_times_to_upsample=upsample)
        logger.debug(f"HOG detected {len(face_locations)} faces")
        return face_locations
    except Exception as e:
        logger.error(f"HOG detection failed: {e}")
        return []


# ============================================================================
# FACE ENCODING UTILITIES
# ============================================================================

def encode_image(path, use_mtcnn: bool = True):
    """Encode face(s) in image using optimized face detection.
    
    Uses MTCNN if available for better accuracy, falls back to HOG.
    
    Args:
        path: Path to image file or PIL Image object
        use_mtcnn: Use MTCNN detection if available
        
    Returns:
        List of face encodings (numpy arrays)
    """
    if not FACE_RECOGNITION_AVAILABLE:
        logger.error("face_recognition not available")
        return []
    
    try:
        # Load image
        if isinstance(path, str) or isinstance(path, Path):
            img = np.array(Image.open(path).convert("RGB"))
        else:
            # Assume PIL Image object
            img = np.array(path.convert("RGB"))
        
        # Detect faces (prefer MTCNN)
        if use_mtcnn and MTCNN_AVAILABLE:
            face_locations_mtcnn = detect_faces_mtcnn(img)
            if face_locations_mtcnn:
                # Convert MTCNN format (x, y, w, h) to face_recognition format (top, right, bottom, left)
                face_locations = []
                for x, y, w, h in face_locations_mtcnn:
                    face_locations.append((y, x + w, y + h, x))
            else:
                face_locations = face_recognition.face_locations(img, model='hog')
        else:
            face_locations = face_recognition.face_locations(img, model='hog')
        
        # Extract encodings
        if face_locations:
            face_encodings = face_recognition.face_encodings(img, face_locations)
            logger.debug(f"Extracted {len(face_encodings)} face encodings")
            return face_encodings
        else:
            logger.warning("No faces detected in image")
            return []
            
    except Exception as e:
        logger.error(f"[encode_image] Error: {e}")
        return []


def encode_image_with_detection_method(
    path,
    detection_method: str = 'auto'
) -> dict:
    """
    Encode face(s) with detailed detection information.
    
    Args:
        path: Path to image or PIL Image
        detection_method: 'auto', 'mtcnn', or 'hog'
        
    Returns:
        Dict with:
            - encodings: List of encoding vectors
            - locations: Face bounding boxes
            - method_used: Which detection method was used
            - num_faces: Number of faces detected
    """
    if not FACE_RECOGNITION_AVAILABLE:
        return {'encodings': [], 'locations': [], 'method_used': None, 'num_faces': 0}
    
    try:
        # Load image
        if isinstance(path, str) or isinstance(path, Path):
            img = np.array(Image.open(path).convert("RGB"))
        else:
            img = np.array(path.convert("RGB"))
        
        # Choose detection method
        method_used = None
        face_locations = []
        
        if detection_method in ['auto', 'mtcnn'] and MTCNN_AVAILABLE:
            try:
                face_locations_mtcnn = detect_faces_mtcnn(img)
                if face_locations_mtcnn:
                    # Convert format
                    face_locations = [(y, x + w, y + h, x) for x, y, w, h in face_locations_mtcnn]
                    method_used = 'mtcnn'
            except:
                pass
        
        # Fallback to HOG
        if not face_locations:
            face_locations = face_recognition.face_locations(img, model='hog')
            method_used = 'hog'
        
        # Extract encodings
        encodings = []
        if face_locations:
            encodings = face_recognition.face_encodings(img, face_locations)
        
        return {
            'encodings': encodings,
            'locations': face_locations,
            'method_used': method_used,
            'num_faces': len(encodings)
        }
        
    except Exception as e:
        logger.error(f"Error in encode_image_with_detection_method: {e}")
        return {'encodings': [], 'locations': [], 'method_used': None, 'num_faces': 0}


# ============================================================================
# LIVENESS DETECTION UTILITIES
# ============================================================================

def calculate_eye_aspect_ratio(eye_points):
    """Calculate the eye aspect ratio using dlib landmarks.
    
    Eye Aspect Ratio (EAR) = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
    where p1...p6 are the eye landmark points from dlib.
    
    High EAR (> 0.1) = eye open
    Low EAR (< 0.1) = eye closed/winking
    
    Args:
        eye_points: Array of eye landmark coordinates
        
    Returns:
        Float: Eye aspect ratio value
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
        print(f"[calculate_eye_aspect_ratio] Error: {e}")
        return 0.0


def detect_eye_blinking(image_path, detector=None, shape_predictor=None):
    """Detect if eyes are open (not blinking/winking) using dlib.
    
    This provides liveness detection by verifying that eyes are open and visible.
    Prevents fake/static image verification.
    
    Args:
        image_path (str or Path): Path to image file
        detector: dlib frontal face detector (get_frontal_face_detector())
        shape_predictor: dlib shape predictor for 68 landmarks
    
    Returns:
        dict with keys:
            - is_liveness_check_passed (bool): Whether liveness test passed
            - left_ear (float): Left eye aspect ratio
            - right_ear (float): Right eye aspect ratio
            - avg_ear (float): Average EAR
            - message (str): Human-readable description
    """
    result = {
        "is_liveness_check_passed": False,
        "left_ear": 0.0,
        "right_ear": 0.0,
        "avg_ear": 0.0,
        "message": "Liveness check not performed"
    }
    
    if not DLIB_AVAILABLE or detector is None or shape_predictor is None:
        result["message"] = "dlib or shape predictor not available"
        return result
    
    try:
        if not OPENCV_AVAILABLE:
            result["message"] = "opencv-python not available for image processing"
            return result
            
        import cv2
        
        # Read image
        if isinstance(image_path, str) or isinstance(image_path, Path):
            img = cv2.imread(str(image_path))
        else:
            img = image_path
            
        if img is None:
            result["message"] = "Could not read image"
            return result
        
        # Convert to grayscale for detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = detector(gray, 0)
        
        if len(faces) == 0:
            result["message"] = "No face detected in image"
            return result
        
        if len(faces) > 1:
            result["message"] = f"Multiple faces detected ({len(faces)}) - please show only one face"
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
            result["message"] = f"Live face detected (EAR: {avg_ear:.4f})"
        else:
            result["is_liveness_check_passed"] = False
            result["message"] = f"Eyes closed/winking detected (EAR: {avg_ear:.4f} < {EYE_ASPECT_RATIO_THRESHOLD})"
        
        return result
    
    except Exception as e:
        result["message"] = f"Error during liveness check: {str(e)}"
        return result


def get_eye_aspect_ratio(image_path, detector=None, shape_predictor=None):
    """Get detailed eye aspect ratio statistics for an image.
    
    Useful for debugging and tuning liveness detection thresholds.
    
    Args:
        image_path: Path to image file
        detector: dlib frontal face detector
        shape_predictor: dlib shape predictor
        
    Returns:
        dict with eye metrics or error message
    """
    if not DLIB_AVAILABLE or detector is None or shape_predictor is None:
        return {"error": "dlib not available"}
    
    try:
        if not OPENCV_AVAILABLE:
            return {"error": "opencv-python not available"}
            
        import cv2
        
        img = cv2.imread(str(image_path))
        if img is None:
            return {"error": "Could not read image"}
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = detector(gray, 0)
        
        if len(faces) == 0:
            return {"error": "No face detected"}
        
        landmarks = shape_predictor(gray, faces[0])
        
        left_eye_pts = np.array([(landmarks.part(i).x, landmarks.part(i).y) for i in range(36, 42)])
        right_eye_pts = np.array([(landmarks.part(i).x, landmarks.part(i).y) for i in range(42, 48)])
        
        left_ear = calculate_eye_aspect_ratio(left_eye_pts)
        right_ear = calculate_eye_aspect_ratio(right_eye_pts)
        avg_ear = (left_ear + right_ear) / 2.0
        
        return {
            "success": True,
            "left_ear": float(left_ear),
            "right_ear": float(right_ear),
            "avg_ear": float(avg_ear),
            "threshold": EYE_ASPECT_RATIO_THRESHOLD,
            "is_open": avg_ear >= EYE_ASPECT_RATIO_THRESHOLD
        }
    except Exception as e:
        return {"error": str(e)}


# ============================================================================
# PICKLE ENCODING STORAGE (DEPRECATED - Use database instead)
# ============================================================================

def load_encodings(enc_path="encodings.pkl"):
    """Load face encodings from pickle file.
    
    DEPRECATED: Use database storage in production instead of pickle.
    
    Args:
        enc_path: Path to pickle file
        
    Returns:
        Tuple of (encodings list, names list)
    """
    import pickle
    
    if Path(enc_path).exists():
        try:
            with open(enc_path, "rb") as f:
                d = pickle.load(f)
                return [np.array(e) for e in d.get("encodings", [])], d.get("names", [])
        except Exception as e:
            print(f"[load_encodings] Error: {e}")
    
    return [], []


def save_encodings(encs, names, enc_path="encodings.pkl"):
    """Save face encodings to pickle file.
    
    DEPRECATED: Use database storage in production instead of pickle.
    
    Args:
        encs: List of numpy encoding arrays
        names: List of corresponding names
        enc_path: Path to pickle file
    """
    import pickle
    
    try:
        with open(enc_path, "wb") as f:
            pickle.dump({
                "encodings": [e.tolist() if isinstance(e, np.ndarray) else e for e in encs],
                "names": names
            }, f)
        print(f"[save_encodings] Saved {len(encs)} encodings to {enc_path}")
    except Exception as e:
        print(f"[save_encodings] Error: {e}")
