"""
Dashboard API router - calculates genuine metrics strictly from the central database
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Gesture, DatasetSample, ThreeDModel, Signer, CollectionAssignment
from ..schemas import DashboardStatsOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/stats", response_model=DashboardStatsOut)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_gestures = db.query(Gesture).count()
    verified_gestures = db.query(Gesture).filter(Gesture.verification_status == "VERIFIED").count()
    total_samples = db.query(DatasetSample).count()
    
    # Distinct unique signers (from Signer model or DatasetSample)
    distinct_sample_signers = db.query(DatasetSample.signer_id).distinct().count()
    total_registered_signers = db.query(Signer).count()
    total_signers = max(distinct_sample_signers, total_registered_signers)
    
    # Static vs Dynamic gesture counts
    static_gestures = db.query(Gesture).filter(Gesture.gesture_type == "STATIC").count()
    dynamic_gestures = db.query(Gesture).filter(Gesture.gesture_type == "DYNAMIC").count()

    # Static vs Dynamic sample counts
    static_samples = db.query(DatasetSample).filter(DatasetSample.sample_type.like("%IMAGE%")).count()
    dynamic_samples = db.query(DatasetSample).filter(DatasetSample.sample_type.like("%VIDEO%")).count()

    # Total recorded frames across all samples
    total_frames_agg = db.query(func.sum(DatasetSample.frame_count)).scalar()
    total_frames = int(total_frames_agg) if total_frames_agg else 0

    # Total 3D models stored
    total_3d_models = db.query(ThreeDModel).count()

    # Assignments progress
    completed_assignments = db.query(CollectionAssignment).filter(CollectionAssignment.status == "COMPLETED").count()
    pending_assignments = db.query(CollectionAssignment).filter(CollectionAssignment.status.in_(["NOT_STARTED", "IN_PROGRESS"])).count()

    return DashboardStatsOut(
        total_gestures=total_gestures,
        verified_gestures=verified_gestures,
        total_samples=total_samples,
        total_signers=total_signers,
        static_gestures=static_gestures,
        dynamic_gestures=dynamic_gestures,
        static_samples=static_samples,
        dynamic_samples=dynamic_samples,
        total_frames=total_frames,
        total_3d_models=total_3d_models,
        completed_assignments=completed_assignments,
        pending_assignments=pending_assignments
    )
