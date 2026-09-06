"""
Collection Assignments API Router for Centralized Remote ISL Dataset Collector
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CollectionAssignment, Signer, Gesture, DatasetSample
from ..schemas import (
    CollectionAssignmentCreate,
    CollectionAssignmentUpdate,
    CollectionAssignmentOut,
    CollectionAssignmentProgressOut
)

router = APIRouter(prefix="/api/assignments", tags=["assignments"])

def _hydrate_assignment_out(a: CollectionAssignment, db: Session) -> CollectionAssignmentOut:
    gesture = db.query(Gesture).filter(Gesture.gesture_id == a.gesture_id).first()
    signer = db.query(Signer).filter(Signer.signer_id == a.signer_id).first()
    
    # Calculate real-time valid samples count
    valid_count = db.query(DatasetSample).filter(
        DatasetSample.gesture_id == a.gesture_id,
        DatasetSample.signer_id == a.signer_id,
        DatasetSample.detection_confidence >= 0.70
    ).count()

    # Sync assignment state with actual DB records
    if a.collected_samples != valid_count:
        a.collected_samples = valid_count
        if valid_count >= a.target_samples:
            a.status = "COMPLETED"
        elif valid_count > 0:
            a.status = "IN_PROGRESS"
        else:
            a.status = "NOT_STARTED"
        db.commit()

    remaining = max(0, a.target_samples - a.collected_samples)
    pct = round((a.collected_samples / (a.target_samples or 1)) * 100, 1)

    return CollectionAssignmentOut(
        id=a.id,
        signer_id=a.signer_id,
        signer_name=signer.display_name if signer else a.signer_id,
        gesture_id=a.gesture_id,
        gesture_name=gesture.name if gesture else a.gesture_id,
        gesture_kannada=gesture.kannada_meaning if gesture else None,
        gesture_type=gesture.gesture_type if gesture else "STATIC",
        target_samples=a.target_samples,
        collected_samples=a.collected_samples,
        remaining_samples=remaining,
        completion_percentage=pct,
        status=a.status,
        created_at=a.created_at,
        updated_at=a.updated_at
    )

@router.get("", response_model=List[CollectionAssignmentOut])
def list_assignments(
    signer_id: Optional[str] = None,
    gesture_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(CollectionAssignment)
    if signer_id:
        query = query.filter(CollectionAssignment.signer_id == signer_id.strip().upper())
    if gesture_id:
        query = query.filter(CollectionAssignment.gesture_id == gesture_id.strip().lower())
    if status:
        query = query.filter(CollectionAssignment.status == status.strip().upper())

    assignments = query.order_by(CollectionAssignment.created_at.desc()).all()
    return [_hydrate_assignment_out(a, db) for a in assignments]

@router.post("", response_model=CollectionAssignmentOut, status_code=status.HTTP_201_CREATED)
def create_assignment(assign_in: CollectionAssignmentCreate, db: Session = Depends(get_db)):
    signer_clean = assign_in.signer_id.strip().upper()
    gesture_clean = assign_in.gesture_id.strip().lower()

    # Ensure signer exists (auto-create if new)
    signer = db.query(Signer).filter(Signer.signer_id == signer_clean).first()
    if not signer:
        signer = Signer(signer_id=signer_clean, display_name=f"Signer {signer_clean}")
        db.add(signer)
        db.commit()
        db.refresh(signer)

    # Ensure gesture exists
    gesture = db.query(Gesture).filter(Gesture.gesture_id == gesture_clean).first()
    if not gesture:
        raise HTTPException(status_code=404, detail=f"Gesture '{gesture_clean}' not found.")

    # Check if assignment already exists
    existing = db.query(CollectionAssignment).filter(
        CollectionAssignment.signer_id == signer_clean,
        CollectionAssignment.gesture_id == gesture_clean
    ).first()

    if existing:
        # Update target if specified
        existing.target_samples = assign_in.target_samples or 50
        db.commit()
        db.refresh(existing)
        return _hydrate_assignment_out(existing, db)

    # Calculate current valid samples if any already collected
    valid_count = db.query(DatasetSample).filter(
        DatasetSample.gesture_id == gesture_clean,
        DatasetSample.signer_id == signer_clean,
        DatasetSample.detection_confidence >= 0.70
    ).count()

    target = assign_in.target_samples if assign_in.target_samples > 0 else 50
    init_status = "COMPLETED" if valid_count >= target else ("IN_PROGRESS" if valid_count > 0 else "NOT_STARTED")

    assignment = CollectionAssignment(
        signer_id=signer_clean,
        gesture_id=gesture_clean,
        target_samples=target,
        collected_samples=valid_count,
        status=init_status
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return _hydrate_assignment_out(assignment, db)

@router.get("/{assignment_id}", response_model=CollectionAssignmentOut)
def get_assignment(assignment_id: int, db: Session = Depends(get_db)):
    a = db.query(CollectionAssignment).filter(CollectionAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return _hydrate_assignment_out(a, db)

@router.get("/{assignment_id}/progress", response_model=CollectionAssignmentProgressOut)
def get_assignment_progress(assignment_id: int, db: Session = Depends(get_db)):
    a = db.query(CollectionAssignment).filter(CollectionAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    out = _hydrate_assignment_out(a, db)
    return CollectionAssignmentProgressOut(
        assignment_id=out.id,
        signer_id=out.signer_id,
        gesture_id=out.gesture_id,
        target_samples=out.target_samples,
        collected_samples=out.collected_samples,
        remaining_samples=out.remaining_samples,
        completion_percentage=out.completion_percentage,
        status=out.status
    )

@router.delete("/{assignment_id}")
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)):
    a = db.query(CollectionAssignment).filter(CollectionAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(a)
    db.commit()
    return {"message": f"Assignment {assignment_id} deleted successfully."}
