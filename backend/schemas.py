"""
Pydantic schemas for Centralized Remote ISL Dataset Collector
"""
import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# Signer schemas
class SignerCreate(BaseModel):
    signer_id: str = Field(..., description="Unique Signer ID e.g. S001")
    display_name: str = Field(..., description="Full or display name of the team member")
    enabled: bool = True

class SignerOut(BaseModel):
    id: int
    signer_id: str
    display_name: str
    enabled: bool
    created_at: datetime.datetime
    sample_count: int = 0
    assigned_gestures_count: int = 0
    completed_assignments_count: int = 0

    class Config:
        from_attributes = True

# Collection Assignment schemas
class CollectionAssignmentCreate(BaseModel):
    signer_id: str
    gesture_id: str
    target_samples: int = 50 # Default 50 samples per signer per sign

class CollectionAssignmentUpdate(BaseModel):
    target_samples: Optional[int] = None
    status: Optional[str] = None

class CollectionAssignmentOut(BaseModel):
    id: int
    signer_id: str
    signer_name: Optional[str] = None
    gesture_id: str
    gesture_name: Optional[str] = None
    gesture_kannada: Optional[str] = None
    gesture_type: Optional[str] = None
    target_samples: int = 50
    collected_samples: int = 0
    remaining_samples: int = 50
    completion_percentage: float = 0.0
    status: str = "NOT_STARTED"
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class CollectionAssignmentProgressOut(BaseModel):
    assignment_id: int
    signer_id: str
    gesture_id: str
    target_samples: int
    collected_samples: int
    remaining_samples: int
    completion_percentage: float
    status: str

# Signer Dataset Breakdown
class SignerGestureProgress(BaseModel):
    gesture_id: str
    gesture_name: str
    gesture_type: str
    target_samples: int
    collected_samples: int
    remaining_samples: int
    status: str

class SignerDatasetBreakdownOut(BaseModel):
    signer_id: str
    display_name: str
    total_samples: int
    completed_assignments: int
    in_progress_assignments: int
    assigned_gestures: List[SignerGestureProgress]

# Gesture Dataset Breakdown
class GestureSignerStat(BaseModel):
    signer_id: str
    signer_name: str
    valid_samples: int
    target_samples: int
    status: str

class GestureDatasetBreakdownOut(BaseModel):
    gesture_id: str
    name: str
    kannada_meaning: Optional[str] = None
    gesture_type: str
    total_samples: int
    unique_signers_count: int
    signers: List[GestureSignerStat]

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
    landmark_file_path: Optional[str] = None
    frame_count: int
    fps: Optional[float] = 30.0
    hand_count_detected: int
    handedness: Optional[str] = "RIGHT" # "RIGHT", "LEFT", "BOTH"
    detection_confidence: float
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    duration: Optional[float] = None
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
    static_samples: int = 0
    dynamic_samples: int = 0
    total_frames: int
    total_3d_models: int
    completed_assignments: int = 0
    pending_assignments: int = 0

# Training Readiness schema
class GestureReadiness(BaseModel):
    gesture_id: str
    name: str
    kannada_meaning: Optional[str] = None
    gesture_type: str
    sample_count: int
    signer_count: int
    valid_samples: int
    low_confidence_samples: int
    has_3d_model: bool
    is_ready: bool

class TrainingReadinessOut(BaseModel):
    total_gestures: int
    ready_gestures: int
    overall_samples: int
    overall_valid_samples: int
    gestures: List[GestureReadiness]
