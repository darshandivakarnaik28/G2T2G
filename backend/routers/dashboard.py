"""
Dashboard API router - calculates genuine metrics strictly from the SQLite database
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Gesture, DatasetSample, ThreeDModel, LandmarkSequence
from ..schemas import DashboardStatsOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/stats", response_model=DashboardStatsOut)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_gestures = db.query(Gesture).count()
    verified_gestures = db.query(Gesture).filter(Gesture.verification_status == "VERIFIED").count()
    total_samples = db.query(DatasetSample).count()
    
    # Distinct unique signers
    total_signers = db.query(DatasetSample.signer_id).distinct().count()
    
    # Static vs Dynamic gesture counts
    static_gestures = db.query(Gesture).filter(Gesture.gesture_type == "STATIC").count()
    dynamic_gestures = db.query(Gesture).filter(Gesture.gesture_type == "DYNAMIC").count()

    # Total recorded frames across all samples
    total_frames_agg = db.query(func.sum(DatasetSample.frame_count)).scalar()
    total_frames = int(total_frames_agg) if total_frames_agg else 0

    # Total 3D models stored
    total_3d_models = db.query(ThreeDModel).count()

    return DashboardStatsOut(
        total_gestures=total_gestures,
        verified_gestures=verified_gestures,
        total_samples=total_samples,
        total_signers=total_signers,
        static_gestures=static_gestures,
        dynamic_gestures=dynamic_gestures,
        total_frames=total_frames,
        total_3d_models=total_3d_models
    )
