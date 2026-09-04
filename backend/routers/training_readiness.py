"""
Training Readiness router - analyzes data quality, signer distribution, and ML readiness per gesture
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Gesture, DatasetSample, ThreeDModel
from ..schemas import TrainingReadinessOut, GestureReadiness

router = APIRouter(prefix="/api/training-readiness", tags=["training-readiness"])

@router.get("", response_model=TrainingReadinessOut)
def get_training_readiness(db: Session = Depends(get_db)):
    gestures = db.query(Gesture).all()
    
    total_gestures = len(gestures)
    ready_count = 0
    overall_samples = 0
    overall_valid = 0
    static_samples = 0
    dynamic_samples = 0
    gesture_readiness_list = []

    for g in gestures:
        samples = db.query(DatasetSample).filter(DatasetSample.gesture_id == g.gesture_id).all()
        s_count = len(samples)
        overall_samples += s_count

        unique_signers = len(set(s.signer_id for s in samples))
        valid_samples = 0
        low_conf = 0

        for s in samples:
            if "video" in s.sample_type.lower():
                dynamic_samples += 1
            else:
                static_samples += 1

            if s.detection_confidence >= 0.70 and s.hand_count_detected >= 1:
                valid_samples += 1
            else:
                low_conf += 1

        overall_valid += valid_samples

        model = db.query(ThreeDModel).filter(ThreeDModel.gesture_id == g.gesture_id).first()

        # Criteria for ML readiness: at least 3 valid samples across at least 1 signer
        is_ready = valid_samples >= 3 and unique_signers >= 1
        if is_ready:
            ready_count += 1

        gesture_readiness_list.append(
            GestureReadiness(
                gesture_id=g.gesture_id,
                name=g.name,
                kannada_meaning=g.kannada_meaning,
                gesture_type=g.gesture_type,
                sample_count=s_count,
                signer_count=unique_signers,
                valid_samples=valid_samples,
                low_confidence_samples=low_conf,
                is_ready=is_ready,
                has_3d_model=bool(model)
            )
        )

    return TrainingReadinessOut(
        total_gestures=total_gestures,
        ready_gestures=ready_count,
        overall_samples=overall_samples,
        overall_valid_samples=overall_valid,
        static_samples=static_samples,
        dynamic_samples=dynamic_samples,
        gestures=gesture_readiness_list
    )
