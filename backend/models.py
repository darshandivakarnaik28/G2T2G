"""
SQLAlchemy ORM models for Centralized Remote ISL Dataset Collector
"""
import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class Signer(Base):
    __tablename__ = "signers"

    id = Column(Integer, primary_key=True, index=True)
    signer_id = Column(String(64), unique=True, index=True, nullable=False) # e.g. "S001", "S002"
    display_name = Column(String(128), nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    assignments = relationship("CollectionAssignment", back_populates="signer", cascade="all, delete-orphan")
    samples = relationship("DatasetSample", back_populates="signer_ref", foreign_keys="DatasetSample.signer_id")

class CollectionAssignment(Base):
    __tablename__ = "collection_assignments"

    id = Column(Integer, primary_key=True, index=True)
    signer_id = Column(String(64), ForeignKey("signers.signer_id"), nullable=False, index=True)
    gesture_id = Column(String(64), ForeignKey("gestures.gesture_id"), nullable=False, index=True)
    target_samples = Column(Integer, default=50) # Strict default: 50 samples per signer per sign
    collected_samples = Column(Integer, default=0)
    status = Column(String(32), default="NOT_STARTED") # "NOT_STARTED", "IN_PROGRESS", "COMPLETED"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    signer = relationship("Signer", back_populates="assignments")
    gesture = relationship("Gesture", back_populates="assignments")

class Gesture(Base):
    __tablename__ = "gestures"

    id = Column(Integer, primary_key=True, index=True)
    gesture_id = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(128), nullable=False)
    english_meaning = Column(String(256), nullable=True)
    kannada_meaning = Column(String(256), nullable=True)
    gesture_type = Column(String(32), nullable=False) # "STATIC" or "DYNAMIC"
    hand_count = Column(String(32), nullable=False, default="ONE_HAND") # "ONE_HAND" or "TWO_HANDS"
    description = Column(Text, nullable=True)
    enabled = Column(Boolean, default=True)
    verification_status = Column(String(32), default="VERIFIED") # "PENDING_REVIEW" or "VERIFIED"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    samples = relationship("DatasetSample", back_populates="gesture", cascade="all, delete-orphan")
    assignments = relationship("CollectionAssignment", back_populates="gesture", cascade="all, delete-orphan")
    models = relationship("ThreeDModel", back_populates="gesture")

class DatasetSample(Base):
    __tablename__ = "dataset_samples"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(String(64), unique=True, index=True, nullable=False)
    gesture_id = Column(String(64), ForeignKey("gestures.gesture_id"), nullable=False, index=True)
    signer_id = Column(String(64), ForeignKey("signers.signer_id"), index=True, nullable=False) # e.g. "S001"
    sample_type = Column(String(32), nullable=False) # "IMAGE", "WEBCAM_IMAGE", "VIDEO", "WEBCAM_VIDEO"
    original_filename = Column(String(256), nullable=True)
    stored_file_path = Column(String(512), nullable=False)
    landmark_file_path = Column(String(512), nullable=True)
    frame_count = Column(Integer, default=1)
    fps = Column(Float, nullable=True, default=30.0)
    hand_count_detected = Column(Integer, default=1)
    handedness = Column(String(16), default="RIGHT") # "RIGHT", "LEFT", "BOTH"
    detection_confidence = Column(Float, default=0.0)
    image_width = Column(Integer, nullable=True)
    image_height = Column(Integer, nullable=True)
    duration = Column(Float, nullable=True) # duration in seconds
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    gesture = relationship("Gesture", back_populates="samples")
    signer_ref = relationship("Signer", back_populates="samples", foreign_keys=[signer_id])
    landmark_sequences = relationship("LandmarkSequence", back_populates="sample", cascade="all, delete-orphan")

class LandmarkSequence(Base):
    __tablename__ = "landmark_sequences"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(String(64), ForeignKey("dataset_samples.sample_id"), nullable=False, index=True)
    frame_index = Column(Integer, nullable=False, default=0)
    timestamp = Column(Float, nullable=False, default=0.0)
    left_hand_present = Column(Boolean, default=False)
    right_hand_present = Column(Boolean, default=False)
    left_hand_landmarks = Column(Text, nullable=True) # JSON string of 21 landmarks
    right_hand_landmarks = Column(Text, nullable=True) # JSON string of 21 landmarks
    left_confidence = Column(Float, default=0.0)
    right_confidence = Column(Float, default=0.0)

    sample = relationship("DatasetSample", back_populates="landmark_sequences")

class ThreeDModel(Base):
    __tablename__ = "three_d_models"

    id = Column(Integer, primary_key=True, index=True)
    gesture_id = Column(String(64), ForeignKey("gestures.gesture_id"), nullable=True, index=True)
    filename = Column(String(256), nullable=False)
    file_path = Column(String(512), nullable=False)
    format = Column(String(16), nullable=False, default="glb")
    vertex_count = Column(Integer, default=0)
    face_count = Column(Integer, default=0)
    rigged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    gesture = relationship("Gesture", back_populates="models")
