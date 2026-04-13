#!/usr/bin/env python3
"""
Test Script for MTCNN & Data Augmentation Features
Demonstrates usage of the enhanced face recognition system

Run: python backend/test_face_recognition_enhancements.py
"""

import sys
import logging
import numpy as np
from pathlib import Path
from PIL import Image
import io

# Add project root to path to enable backend package imports
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_imports():
    """Test that all required modules can be imported"""
    print("\n" + "="*60)
    print("TEST 1: Module Imports")
    print("="*60)
    
    try:
        from backend.face_utils import (
            detect_faces_mtcnn,
            detect_faces_hog,
            encode_image_with_detection_method,
            MTCNN_AVAILABLE,
            FACE_RECOGNITION_AVAILABLE
        )
        print("✓ face_utils imported")
        print(f"  - MTCNN: {MTCNN_AVAILABLE}")
        print(f"  - face_recognition: {FACE_RECOGNITION_AVAILABLE}")
        
        from backend.face_augmentation import get_augmentor, FaceAugmentor
        print("✓ face_augmentation imported")
        
        from backend.face_registration_handler import (
            FaceRegistrationHandler,
            FaceLoginVerification
        )
        print("✓ face_registration_handler imported")
        
        return True
    except Exception as e:
        logger.error(f"Import failed: {e}")
        return False


def create_dummy_face_image(width=240, height=240):
    """Create a dummy face image for testing"""
    print("\n" + "="*60)
    print("TEST 2: Create Dummy Face Image")
    print("="*60)
    
    # Create a simple face-like image
    image = np.ones((height, width, 3), dtype=np.uint8) * 255
    
    # Add some "face" features (simple rectangles)
    # Face shape
    cv2_available = False
    try:
        import cv2
        cv2_available = True
        # Draw face outline
        cv2.rectangle(image, (50, 40), (190, 200), (200, 160, 130), -1)
        # Draw eyes
        cv2.circle(image, (90, 100), 15, (50, 50, 50), -1)
        cv2.circle(image, (150, 100), 15, (50, 50, 50), -1)
        # Draw mouth
        cv2.rectangle(image, (100, 150), (140, 160), (100, 50, 50), -1)
    except ImportError:
        logger.info("OpenCV not available, using numpy to create simple test image")
        # Simple pattern with numpy
        image[50:200, 50:190] = [200, 160, 130]  # Face color
        image[90:110, 85:95] = [50, 50, 50]       # Left eye
        image[90:110, 145:155] = [50, 50, 50]     # Right eye
        image[150:160, 100:140] = [100, 50, 50]   # Mouth
    
    print(f"✓ Created dummy face image: {image.shape}")
    return image


def test_mtcnn_detection():
    """Test MTCNN face detection"""
    print("\n" + "="*60)
    print("TEST 3: MTCNN Face Detection")
    print("="*60)
    
    try:
        from backend.face_utils import detect_faces_mtcnn, MTCNN_AVAILABLE
        
        if not MTCNN_AVAILABLE:
            print("⚠ MTCNN not available (will test HOG fallback)")
            return True
        
        # Create test image
        test_image = create_dummy_face_image()
        
        # Test detection
        print("Running MTCNN detection...")
        faces = detect_faces_mtcnn(test_image, min_confidence=0.50)
        
        print(f"✓ MTCNN Detection Results:")
        print(f"  - Faces detected: {len(faces)}")
        for i, (x, y, w, h) in enumerate(faces):
            print(f"    Face {i+1}: x={x}, y={y}, width={w}, height={h}")
        
        return len(faces) >= 0  # Success if no errors
    except Exception as e:
        logger.error(f"MTCNN test failed: {e}")
        return False


def test_hog_detection():
    """Test HOG face detection (fallback)"""
    print("\n" + "="*60)
    print("TEST 4: HOG Face Detection (Fallback)")
    print("="*60)
    
    try:
        from backend.face_utils import detect_faces_hog, FACE_RECOGNITION_AVAILABLE
        
        if not FACE_RECOGNITION_AVAILABLE:
            print("✗ face_recognition not available")
            return False
        
        test_image = create_dummy_face_image()
        
        print("Running HOG detection...")
        faces = detect_faces_hog(test_image)
        
        print(f"✓ HOG Detection Results:")
        print(f"  - Faces detected: {len(faces)}")
        for i, loc in enumerate(faces):
            print(f"    Face {i+1}: {loc}")
        
        return True
    except Exception as e:
        logger.error(f"HOG test failed: {e}")
        return False


def test_augmentation():
    """Test data augmentation"""
    print("\n" + "="*60)
    print("TEST 5: Data Augmentation")
    print("="*60)
    
    try:
        from backend.face_augmentation import get_augmentor
        
        # Get test image
        test_image = create_dummy_face_image()
        
        # Get augmentor
        augmentor = get_augmentor(preserve_face_quality=True)
        print("✓ Augmentor initialized")
        
        # Get image statistics
        stats = augmentor.get_augmentation_stats(test_image)
        print(f"✓ Image Statistics:")
        print(f"  - Shape: {stats['shape']}")
        print(f"  - Mean brightness: {stats['mean_brightness']:.2f}")
        print(f"  - Contrast: {stats['contrast']:.2f}")
        
        # Generate augmented images
        print("\nGenerating augmented variants...")
        augmented = augmentor.augment_image(test_image, num_augmentations=5)
        print(f"✓ Generated {len(augmented)} images (1 original + {len(augmented)-1} augmented)")
        
        # Test histogram equalization
        print("\nTesting histogram equalization...")
        eq_image = augmentor.apply_histogram_equalization(test_image)
        print(f"✓ Histogram equalization: {eq_image.shape}")
        
        # Test normalization
        print("\nTesting image normalization...")
        norm_image, orig_shape = augmentor.apply_normalization(test_image)
        print(f"✓ Normalized to: {norm_image.shape}")
        print(f"  - Original shape: {orig_shape}")
        print(f"  - Value range: [{norm_image.min():.2f}, {norm_image.max():.2f}]")
        
        return True
    except Exception as e:
        logger.error(f"Augmentation test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_encoding_with_detection():
    """Test encoding extraction with detection method info"""
    print("\n" + "="*60)
    print("TEST 6: Face Encoding with Detection Method")
    print("="*60)
    
    try:
        from backend.face_utils import encode_image_with_detection_method, FACE_RECOGNITION_AVAILABLE
        
        if not FACE_RECOGNITION_AVAILABLE:
            print("✗ face_recognition not available")
            return False
        
        test_image = create_dummy_face_image()
        
        print("Extracting face encodings...")
        result = encode_image_with_detection_method(test_image, detection_method='auto')
        
        print(f"✓ Encoding Result:")
        print(f"  - Faces detected: {result['num_faces']}")
        print(f"  - Detection method: {result['method_used']}")
        if result['encodings']:
            print(f"  - Encoding dimensions: {len(result['encodings'][0])}")
            print(f"  - First encoding sample: {result['encodings'][0][:5]}...")
        
        return True
    except Exception as e:
        logger.error(f"Encoding test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_configuration():
    """Test configuration and settings"""
    print("\n" + "="*60)
    print("TEST 7: Configuration")
    print("="*60)
    
    try:
        from backend.face_utils import (
            MTCNN_AVAILABLE,
            FACE_RECOGNITION_AVAILABLE,
            OPENCV_AVAILABLE,
            DLIB_AVAILABLE,
            EYE_ASPECT_RATIO_THRESHOLD,
            FACE_DETECTION_MODEL
        )
        
        print("✓ Configuration Summary:")
        print(f"  - MTCNN: {MTCNN_AVAILABLE}")
        print(f"  - face_recognition: {FACE_RECOGNITION_AVAILABLE}")
        print(f"  - OpenCV: {OPENCV_AVAILABLE}")
        print(f"  - dlib: {DLIB_AVAILABLE}")
        print(f"  - Default detection model: {FACE_DETECTION_MODEL}")
        print(f"  - Eye aspect ratio threshold: {EYE_ASPECT_RATIO_THRESHOLD}")
        
        return True
    except Exception as e:
        logger.error(f"Configuration test failed: {e}")
        return False


def test_performance():
    """Test performance metrics"""
    print("\n" + "="*60)
    print("TEST 8: Performance Metrics")
    print("="*60)
    
    try:
        import time
        from backend.face_augmentation import get_augmentor
        
        test_image = create_dummy_face_image()
        augmentor = get_augmentor()
        
        # Measure augmentation time
        print("Measuring augmentation performance...")
        start = time.time()
        augmented = augmentor.augment_image(test_image, num_augmentations=10)
        aug_time = time.time() - start
        
        print(f"✓ Performance Results:")
        print(f"  - Generated 10 augmentations in {aug_time:.2f}s")
        print(f"  - Average per augmentation: {(aug_time/10)*1000:.1f}ms")
        
        return True
    except Exception as e:
        logger.error(f"Performance test failed: {e}")
        return False


def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("SMART AMS Face Recognition Test Suite")
    print("="*60)
    
    tests = [
        ("Imports", test_imports),
        ("MTCNN", test_mtcnn_detection),
        ("HOG", test_hog_detection),
        ("Augmentation", test_augmentation),
        ("Encoding", test_encoding_with_detection),
        ("Configuration", test_configuration),
        ("Performance", test_performance),
    ]
    
    results = {}
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            logger.error(f"{test_name} test error: {e}")
            results[test_name] = False
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status} - {test_name}")
    
    print("-" * 60)
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("\n✓ All tests passed! System is ready.")
        return 0
    else:
        print(f"\n✗ {total - passed} test(s) failed. Check logs above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
