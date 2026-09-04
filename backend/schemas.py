"""
Pydantic schemas for request validation and API responses
"""
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
import datetime

class LandmarkPoint(BaseModel):
    x: float
    y: float
    z: float

class FrameLandmarks(BaseModel):
    frame_index: int = 0
    timestamp: float = 0.0
    left_hand_present: bool = False
    right_hand_present: bool = False
    left_hand_landmarks: Optional[List[LandmarkPoint]] = None
    right_hand_landmarks: Optional[List[LandmarkPoint]] = None
    left_confidence: float = 0.0
    right_confidence: float = 0.0

# Gesture schemas
class GestureBase(BaseModel):
    gesture_id: str
    name: str
    english_meaning: Optional[str] = None
    kannada_meaning: Optional[str] = None
    gesture_type: str # "STATIC" or "DYNAMIC"
    hand_count: str = "ONE_HAND" # "ONE_HAND" or "TWO_HANDS"
    description: Optional[str] = None
    enabled: bool = True
    verification_status: str = "VERIFIED"

class GestureCreate(GestureBase):
    pass

class GestureUpdate(BaseModel):
    name: Optional[str] = None
    english_meaning: Optional[str] = None
    kannada_meaning: Optional[str] = None
    gesture_type: Optional[str] = None
    hand_count: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    verification_status: Optional[str] = None

class GestureOut(GestureBase):
    id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime
    sample_count: int = 0
    signer_count: int = 0
    has_3d_model: bool = False
    model_filename: Optional[str] = None

    class Config:
        from_attributes = True

# Sample schemas
class DatasetSampleOut(BaseModel):
    id: int
    sample_id: str
    gesture_id: str
    gesture_name: Optional[str] = None
    gesture_kannada: Optional[str] = None
    gesture_type: Optional[str] = None
    signer_id: str
    sample_type: str
    stored_file_path: str
    landmark_file_path: Optional[str]
    frame_count: int
    fps: Optional[float]
    hand_count_detected: int
    detection_confidence: float
    image_width: Optional[int]
    image_height: Optional[int]
    duration: Optional[float]
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# 3D Model schemas
class ThreeDModelOut(BaseModel):
    id: int
    gesture_id: Optional[str]
    filename: str
    file_path: str
    format: str
    vertex_count: int
    face_count: int
    rigged: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Dashboard Stats schema
class DashboardStatsOut(BaseModel):
    total_gestures: int
    verified_gestures: int
    total_samples: int
    total_signers: int
    static_gestures: int
    dynamic_gestures: int
    total_frames: int
    total_3d_models: int

# Training Readiness schema
class GestureReadiness(BaseModel):
    gesture_id: str
    name: str
    kannada_meaning: Optional[str]
    gesture_type: str
    sample_count: int
    signer_count: int
    valid_samples: int
    low_confidence_samples: int
    is_ready: bool
    has_3d_model: bool

class TrainingReadinessOut(BaseModel):
    total_gestures: int
    ready_gestures: int
    overall_samples: int
    overall_valid_samples: int
    static_samples: int
    dynamic_samples: int
    gestures: List[GestureReadiness]
