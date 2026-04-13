"""
Face Image Data Augmentation Module
Provides robust augmentation techniques for facial recognition dataset generalization.

Techniques Implemented:
- Rotation: Random rotations (-15 to 15 degrees)
- Brightness/Contrast: Random adjustments
- Horizontal Flip: Mirror flipping for pose variation
- Zoom: Random zoom in/out
- Gaussian Noise: Add noise for robustness
- Affine Transforms: Random translations and shears
- Histogram Equalization: Normalize lighting conditions

Usage:
    augmentor = FaceAugmentor()
    augmented_images = augmentor.augment_image(original_image, num_augmentations=10)
"""

import numpy as np
import cv2
from PIL import Image, ImageEnhance
from typing import List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

# Try importing augmentation libraries
try:
    import albumentations as A
    ALBUMENTATIONS_AVAILABLE = True
except ImportError:
    ALBUMENTATIONS_AVAILABLE = False
    logger.warning("albumentations not available - using basic augmentation only")

try:
    from skimage import exposure
    SCIKIT_IMAGE_AVAILABLE = True
except ImportError:
    SCIKIT_IMAGE_AVAILABLE = False
    logger.warning("scikit-image not available - histogram equalization disabled")


class FaceAugmentor:
    """
    Data augmentation for facial images.
    Improves model robustness against variations in:
    - Lighting conditions
    - Face angles/poses
    - Image quality
    - Different environmental conditions
    """
    
    def __init__(self, preserve_face_quality=True):
        """
        Initialize augmentor.
        
        Args:
            preserve_face_quality: If True, use moderate augmentation to preserve face features
        """
        self.preserve_face_quality = preserve_face_quality
        self._setup_augmentation_pipeline()
    
    def _setup_augmentation_pipeline(self):
        """Setup augmentation pipeline using albumentations if available"""
        if ALBUMENTATIONS_AVAILABLE:
            if self.preserve_face_quality:
                # Moderate augmentation that preserves face recognition features
                self.augmentation_pipeline = A.Compose([
                    A.Rotate(limit=15, p=0.7),  # Small rotations
                    A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.6),
                    A.GaussNoise(p=0.3),
                    A.GaussianBlur(blur_limit=3, p=0.2),
                    A.Affine(shear=(-10, 10), p=0.4),
                    A.CoarseDropout(max_holes=2, max_height=10, max_width=10, p=0.1),
                ], bbox_params=A.BboxParams(format='pascal_voc', min_area=0, min_visibility=0.1))
            else:
                # Strong augmentation for diversity
                self.augmentation_pipeline = A.Compose([
                    A.Rotate(limit=25, p=0.8),
                    A.RandomBrightnessContrast(brightness_limit=0.3, contrast_limit=0.3, p=0.8),
                    A.GaussNoise(p=0.5),
                    A.MotionBlur(blur_limit=5, p=0.3),
                    A.Affine(shear=(-20, 20), p=0.6),
                    A.CoarseDropout(max_holes=4, max_height=15, max_width=15, p=0.2),
                ], bbox_params=A.BboxParams(format='pascal_voc', min_area=0, min_visibility=0.1))
        else:
            self.augmentation_pipeline = None
            logger.info("Albumentations not available - will use basic OpenCV augmentation")
    
    def augment_image(self, image: np.ndarray, num_augmentations: int = 5) -> List[np.ndarray]:
        """
        Generate multiple augmented versions of an image.
        
        Args:
            image: Input face image (numpy array, RGB)
            num_augmentations: Number of augmented versions to generate
            
        Returns:
            List of augmented images
        """
        augmented_images = [image]  # Include original
        
        if ALBUMENTATIONS_AVAILABLE and self.augmentation_pipeline:
            for _ in range(num_augmentations):
                try:
                    aug_image = self.augmentation_pipeline(image=image)['image']
                    augmented_images.append(aug_image)
                except Exception as e:
                    logger.warning(f"Albumentations augmentation failed: {e}")
                    # Fallback to basic augmentation
                    augmented_images.append(self._basic_augment(image))
        else:
            # Use basic OpenCV augmentation
            for _ in range(num_augmentations):
                augmented_images.append(self._basic_augment(image))
        
        return augmented_images
    
    def _basic_augment(self, image: np.ndarray) -> np.ndarray:
        """
        Basic augmentation using OpenCV and PIL.
        Fallback when albumentations is not available.
        
        Args:
            image: Input image (numpy array)
            
        Returns:
            Augmented image
        """
        aug_image = image.copy()
        
        # Random choice of augmentation
        aug_type = np.random.choice(['rotate', 'brightness', 'noise', 'flip', 'blur'])
        
        if aug_type == 'rotate':
            # Random rotation (-15 to 15 degrees)
            angle = np.random.uniform(-15, 15)
            h, w = aug_image.shape[:2]
            center = (w // 2, h // 2)
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            aug_image = cv2.warpAffine(aug_image, matrix, (w, h), borderMode=cv2.BORDER_REFLECT)
        
        elif aug_type == 'brightness':
            # Random brightness/contrast adjustment
            pil_img = Image.fromarray(aug_image)
            brightness_factor = np.random.uniform(0.8, 1.2)
            contrast_factor = np.random.uniform(0.8, 1.2)
            
            pil_img = ImageEnhance.Brightness(pil_img).enhance(brightness_factor)
            pil_img = ImageEnhance.Contrast(pil_img).enhance(contrast_factor)
            aug_image = np.array(pil_img)
        
        elif aug_type == 'noise':
            # Add Gaussian noise
            noise = np.random.normal(0, 5, aug_image.shape)
            aug_image = np.clip(aug_image + noise, 0, 255).astype(np.uint8)
        
        elif aug_type == 'flip':
            # Horizontal flip (mirror)
            aug_image = cv2.flip(aug_image, 1)
        
        elif aug_type == 'blur':
            # Gaussian blur
            aug_image = cv2.GaussianBlur(aug_image, (5, 5), 0)
        
        return aug_image
    
    def apply_histogram_equalization(self, image: np.ndarray) -> np.ndarray:
        """
        Apply histogram equalization to normalize lighting.
        Useful for images with poor lighting conditions.
        
        Args:
            image: Input RGB image
            
        Returns:
            Histogram-equalized image
        """
        if SCIKIT_IMAGE_AVAILABLE:
            try:
                # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
                img_yuv = cv2.cvtColor(image, cv2.COLOR_RGB2YCrCb)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                img_yuv[:, :, 0] = clahe.apply(img_yuv[:, :, 0])
                return cv2.cvtColor(img_yuv, cv2.COLOR_YCrCb2RGB)
            except Exception as e:
                logger.warning(f"Histogram equalization failed: {e}")
                return image
        else:
            # Fallback to standard histogram equalization
            try:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
                equalized = cv2.equalizeHist(gray)
                return cv2.cvtColor(equalized, cv2.COLOR_GRAY2RGB)
            except Exception as e:
                logger.warning(f"Histogram equalization failed: {e}")
                return image
    
    def apply_normalization(self, image: np.ndarray) -> Tuple[np.ndarray, Tuple[float, float]]:
        """
        Normalize image to fixed size (160x160) and standardize pixel values.
        Consistent with dlib's face recognition preprocessing.
        
        Args:
            image: Input RGB image
            
        Returns:
            Tuple of (normalized_image, original_shape)
        """
        original_shape = image.shape[:2]
        
        # Resize to 160x160 (standard for face recognition)
        normalized = cv2.resize(image, (160, 160), interpolation=cv2.INTER_LANCZOS4)
        
        # Normalize pixel values to [-1, 1] range (common for neural networks)
        normalized = normalized.astype(np.float32)
        normalized = (normalized - 127.5) / 128.0
        
        return normalized, original_shape
    
    def denormalize_image(self, normalized_image: np.ndarray) -> np.ndarray:
        """
        Denormalize image from [-1, 1] back to [0, 255] for display/storage.
        
        Args:
            normalized_image: Normalized image from apply_normalization()
            
        Returns:
            Denormalized image in [0, 255] range
        """
        denormalized = (normalized_image * 128.0 + 127.5)
        denormalized = np.clip(denormalized, 0, 255).astype(np.uint8)
        return denormalized
    
    def create_training_dataset(
        self, 
        base_images: List[np.ndarray],
        augmentations_per_image: int = 10
    ) -> List[np.ndarray]:
        """
        Create an augmented training dataset from base images.
        Useful for training a custom face recognition model.
        
        Args:
            base_images: List of original face images
            augmentations_per_image: Number of augmented versions per image
            
        Returns:
            List of all images (original + augmented)
        """
        training_dataset = []
        
        for idx, image in enumerate(base_images):
            logger.info(f"Augmenting image {idx + 1}/{len(base_images)}")
            augmented = self.augment_image(image, num_augmentations=augmentations_per_image)
            training_dataset.extend(augmented)
        
        logger.info(f"Created training dataset with {len(training_dataset)} images "
                   f"from {len(base_images)} base images")
        return training_dataset
    
    def get_augmentation_stats(self, image: np.ndarray) -> dict:
        """
        Get statistics about the image for augmentation planning.
        
        Args:
            image: Input image
            
        Returns:
            Dict with image statistics
        """
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if len(image.shape) == 3 else image
        
        return {
            'shape': image.shape,
            'mean_brightness': float(np.mean(gray)),
            'std_brightness': float(np.std(gray)),
            'contrast': float(np.max(gray) - np.min(gray)),
            'min_pixel': float(np.min(gray)),
            'max_pixel': float(np.max(gray)),
        }


# Singleton instance
_augmentor_instance = None


def get_augmentor(preserve_face_quality: bool = True) -> FaceAugmentor:
    """Get or create singleton augmentor instance."""
    global _augmentor_instance
    if _augmentor_instance is None:
        _augmentor_instance = FaceAugmentor(preserve_face_quality=preserve_face_quality)
    return _augmentor_instance


# Example usage
if __name__ == "__main__":
    print("Face Augmentation Module")
    print("=" * 50)
    print("Usage: from face_augmentation import get_augmentor")
    print("     augmentor = get_augmentor()")
    print("     augmented = augmentor.augment_image(image, num_augmentations=10)")
