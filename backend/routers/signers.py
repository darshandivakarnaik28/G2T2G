"""
Signers API Router for Centralized Remote Team Dataset Collector
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Signer, DatasetSample, CollectionAssignment, Gesture
from ..schemas import SignerCreate, SignerOut, SignerDatasetBreakdownOut, SignerGestureProgress

router = APIRouter(prefix="/api/signers", tags=["signers"])

@router.get("", response_model=List[SignerOut])
def list_signers(db: Session = Depends(get_db)):
    signers = db.query(Signer).order_by(Signer.signer_id.asc()).all()
    results = []
    for s in signers:
        sample_count = db.query(DatasetSample).filter(DatasetSample.signer_id == s.signer_id).count()
        assignments = db.query(CollectionAssignment).filter(CollectionAssignment.signer_id == s.signer_id).all()
        completed_count = sum(1 for a in assignments if a.status == "COMPLETED")
        
        results.append(SignerOut(
            id=s.id,
            signer_id=s.signer_id,
            display_name=s.display_name,
            enabled=s.enabled,
            created_at=s.created_at,
            sample_count=sample_count,
            assigned_gestures_count=len(assignments),
            completed_assignments_count=completed_count
        ))
    return results

@router.post("", response_model=SignerOut, status_code=status.HTTP_201_CREATED)
def create_signer(signer_in: SignerCreate, db: Session = Depends(get_db)):
    clean_id = signer_in.signer_id.strip().upper()
    existing = db.query(Signer).filter(Signer.signer_id == clean_id).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Signer with ID '{clean_id}' already exists."
        )

    signer = Signer(
        signer_id=clean_id,
        display_name=signer_in.display_name.strip(),
        enabled=signer_in.enabled
    )
    db.add(signer)
    db.commit()
    db.refresh(signer)

    return SignerOut(
        id=signer.id,
        signer_id=signer.signer_id,
        display_name=signer.display_name,
        enabled=signer.enabled,
        created_at=signer.created_at,
        sample_count=0,
        assigned_gestures_count=0,
        completed_assignments_count=0
    )

@router.get("/{signer_id}", response_model=SignerOut)
def get_signer(signer_id: str, db: Session = Depends(get_db)):
    clean_id = signer_id.strip().upper()
    signer = db.query(Signer).filter(Signer.signer_id == clean_id).first()
    if not signer:
        raise HTTPException(status_code=404, detail=f"Signer '{signer_id}' not found.")

    sample_count = db.query(DatasetSample).filter(DatasetSample.signer_id == clean_id).count()
    assignments = db.query(CollectionAssignment).filter(CollectionAssignment.signer_id == clean_id).all()
    completed_count = sum(1 for a in assignments if a.status == "COMPLETED")

    return SignerOut(
        id=signer.id,
        signer_id=signer.signer_id,
        display_name=signer.display_name,
        enabled=signer.enabled,
        created_at=signer.created_at,
        sample_count=sample_count,
        assigned_gestures_count=len(assignments),
        completed_assignments_count=completed_count
    )

@router.get("/{signer_id}/dataset", response_model=SignerDatasetBreakdownOut)
def get_signer_dataset(signer_id: str, db: Session = Depends(get_db)):
    clean_id = signer_id.strip().upper()
    signer = db.query(Signer).filter(Signer.signer_id == clean_id).first()
    if not signer:
        raise HTTPException(status_code=404, detail=f"Signer '{signer_id}' not found.")

    total_samples = db.query(DatasetSample).filter(DatasetSample.signer_id == clean_id).count()
    assignments = db.query(CollectionAssignment).filter(CollectionAssignment.signer_id == clean_id).all()

    assigned_progress = []
    completed = 0
    in_progress = 0

    for a in assignments:
        gesture = db.query(Gesture).filter(Gesture.gesture_id == a.gesture_id).first()
        valid_samples = db.query(DatasetSample).filter(
            DatasetSample.gesture_id == a.gesture_id,
            DatasetSample.signer_id == clean_id,
            DatasetSample.detection_confidence >= 0.70
        ).count()

        # Update assignment's collected count to reflect reality
        if a.collected_samples != valid_samples:
            a.collected_samples = valid_samples
            if valid_samples >= a.target_samples:
                a.status = "COMPLETED"
            elif valid_samples > 0:
                a.status = "IN_PROGRESS"
            else:
                a.status = "NOT_STARTED"
            db.commit()

        if a.status == "COMPLETED":
            completed += 1
        elif a.status == "IN_PROGRESS":
            in_progress += 1

        assigned_progress.append(SignerGestureProgress(
            gesture_id=a.gesture_id,
            gesture_name=gesture.name if gesture else a.gesture_id,
            gesture_type=gesture.gesture_type if gesture else "STATIC",
            target_samples=a.target_samples,
            collected_samples=valid_samples,
            remaining_samples=max(0, a.target_samples - valid_samples),
            status=a.status
        ))

    return SignerDatasetBreakdownOut(
        signer_id=signer.signer_id,
        display_name=signer.display_name,
        total_samples=total_samples,
        completed_assignments=completed,
        in_progress_assignments=in_progress,
        assigned_gestures=assigned_progress
    )
