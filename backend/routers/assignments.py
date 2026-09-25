"""
Collection Assignments API Router for Centralized Remote ISL Dataset Collector
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
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
        signer_enabled=signer.enabled if signer else True,
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
        sid_clean = signer_id.strip()
        from sqlalchemy import func
        query = query.filter(
            (CollectionAssignment.signer_id == sid_clean) |
            (func.lower(CollectionAssignment.signer_id) == sid_clean.lower())
        )
    if gesture_id:
        query = query.filter(CollectionAssignment.gesture_id == gesture_id.strip().lower())
    if status:
        query = query.filter(CollectionAssignment.status == status.strip().upper())

    assignments = query.order_by(CollectionAssignment.created_at.desc()).all()
    return [_hydrate_assignment_out(a, db) for a in assignments]

@router.post("", response_model=CollectionAssignmentOut, status_code=status.HTTP_201_CREATED)
def create_assignment(assign_in: CollectionAssignmentCreate, db: Session = Depends(get_db)):
    gesture_clean = assign_in.gesture_id.strip().lower()
    gesture = db.query(Gesture).filter(Gesture.gesture_id == gesture_clean).first()
    if not gesture:
        raise HTTPException(status_code=404, detail=f"Gesture '{gesture_clean}' not found.")

    target = assign_in.target_samples if (assign_in.target_samples and assign_in.target_samples > 0) else 50

    # If signer_id is not specified, assign to all existing active signers
    if not assign_in.signer_id or assign_in.signer_id.strip().upper() == "ALL":
        signers = db.query(Signer).filter(Signer.enabled == True).all()
        if not signers:
            signers = db.query(Signer).all()
        last_assignment = None
        for s in signers:
            existing = db.query(CollectionAssignment).filter(
                CollectionAssignment.signer_id == s.signer_id,
                CollectionAssignment.gesture_id == gesture_clean
            ).first()
            if existing:
                existing.target_samples = target
                db.commit()
                last_assignment = existing
            else:
                valid_count = db.query(DatasetSample).filter(
                    DatasetSample.gesture_id == gesture_clean,
                    DatasetSample.signer_id == s.signer_id,
                    DatasetSample.detection_confidence >= 0.70
                ).count()
                init_status = "COMPLETED" if valid_count >= target else ("IN_PROGRESS" if valid_count > 0 else "NOT_STARTED")
                new_a = CollectionAssignment(
                    signer_id=s.signer_id,
                    gesture_id=gesture_clean,
                    target_samples=target,
                    collected_samples=valid_count,
                    status=init_status
                )
                db.add(new_a)
                db.commit()
                last_assignment = new_a

        if last_assignment:
            return _hydrate_assignment_out(last_assignment, db)
        else:
            raise HTTPException(status_code=400, detail="No signers found to assign gesture.")

    signer_clean = assign_in.signer_id.strip()
    signer = db.query(Signer).filter(
        (Signer.signer_id == signer_clean) | (func.lower(Signer.signer_id) == signer_clean.lower())
    ).first()
    if not signer:
        signer = Signer(signer_id=signer_clean, display_name=f"Signer {signer_clean}")
        db.add(signer)
        db.commit()
        db.refresh(signer)

    sid = signer.signer_id
    existing = db.query(CollectionAssignment).filter(
        CollectionAssignment.signer_id == sid,
        CollectionAssignment.gesture_id == gesture_clean
    ).first()

    if existing:
        existing.target_samples = target
        db.commit()
        db.refresh(existing)
        return _hydrate_assignment_out(existing, db)

    valid_count = db.query(DatasetSample).filter(
        DatasetSample.gesture_id == gesture_clean,
        DatasetSample.signer_id == sid,
        DatasetSample.detection_confidence >= 0.70
    ).count()

    init_status = "COMPLETED" if valid_count >= target else ("IN_PROGRESS" if valid_count > 0 else "NOT_STARTED")

    assignment = CollectionAssignment(
        signer_id=sid,
        gesture_id=gesture_clean,
        target_samples=target,
        collected_samples=valid_count,
        status=init_status
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return _hydrate_assignment_out(assignment, db)

@router.post("/assign-gesture", response_model=List[CollectionAssignmentOut])
def assign_gesture_to_signers(assign_req: CollectionAssignmentCreate, db: Session = Depends(get_db)):
    """Assigns an existing gesture to existing signers."""
    gesture_clean = assign_req.gesture_id.strip().lower()
    gesture = db.query(Gesture).filter(Gesture.gesture_id == gesture_clean).first()
    if not gesture:
        raise HTTPException(status_code=404, detail=f"Gesture '{gesture_clean}' not found.")

    target = assign_req.target_samples if (assign_req.target_samples and assign_req.target_samples > 0) else 50
    signers = db.query(Signer).all()
    if not signers:
        raise HTTPException(status_code=400, detail="No signers found. Please add signers first.")

    created_assignments = []
    for s in signers:
        existing = db.query(CollectionAssignment).filter(
            CollectionAssignment.signer_id == s.signer_id,
            CollectionAssignment.gesture_id == gesture_clean
        ).first()
        if existing:
            existing.target_samples = target
            db.commit()
            created_assignments.append(_hydrate_assignment_out(existing, db))
        else:
            valid_count = db.query(DatasetSample).filter(
                DatasetSample.gesture_id == gesture_clean,
                DatasetSample.signer_id == s.signer_id,
                DatasetSample.detection_confidence >= 0.70
            ).count()
            init_status = "COMPLETED" if valid_count >= target else ("IN_PROGRESS" if valid_count > 0 else "NOT_STARTED")
            new_a = CollectionAssignment(
                signer_id=s.signer_id,
                gesture_id=gesture_clean,
                target_samples=target,
                collected_samples=valid_count,
                status=init_status
            )
            db.add(new_a)
            db.commit()
            created_assignments.append(_hydrate_assignment_out(new_a, db))

    return created_assignments

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
