"""
Gestures API router
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import Gesture, DatasetSample, ThreeDModel, LandmarkSequence, Signer, CollectionAssignment
from ..schemas import GestureCreate, GestureUpdate, GestureOut, GestureDatasetBreakdownOut, GestureSignerStat
from ..services.storage_service import delete_sample_files, delete_gesture_folder

router = APIRouter(prefix="/api/gestures", tags=["gestures"])

@router.get("", response_model=List[GestureOut])
def list_gestures(db: Session = Depends(get_db)):
    gestures = db.query(Gesture).order_by(Gesture.created_at.desc()).all()
    result = []
    for g in gestures:
        samples_count = db.query(DatasetSample).filter(DatasetSample.gesture_id == g.gesture_id).count()
        signers_count = db.query(DatasetSample.signer_id).filter(
            DatasetSample.gesture_id == g.gesture_id
        ).distinct().count()
        
        model = db.query(ThreeDModel).filter(ThreeDModel.gesture_id == g.gesture_id).first()

        out = GestureOut(
            id=g.id,
            gesture_id=g.gesture_id,
            name=g.name,
            english_meaning=g.english_meaning,
            kannada_meaning=g.kannada_meaning,
            gesture_type=g.gesture_type,
            hand_count=g.hand_count,
            description=g.description,
            enabled=g.enabled,
            verification_status=g.verification_status,
            created_at=g.created_at,
            updated_at=g.updated_at,
            sample_count=samples_count,
            signer_count=signers_count,
            has_3d_model=bool(model),
            model_filename=model.filename if model else None
        )
        result.append(out)
    return result

@router.post("", response_model=GestureOut, status_code=status.HTTP_201_CREATED)
def create_gesture(gesture_in: GestureCreate, db: Session = Depends(get_db)):
    clean_id = gesture_in.gesture_id.strip().lower()
    existing = db.query(Gesture).filter(Gesture.gesture_id == clean_id).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Gesture with ID '{gesture_in.gesture_id}' already exists."
        )

    db_gesture = Gesture(
        gesture_id=gesture_in.gesture_id.strip().lower(),
        name=gesture_in.name,
        english_meaning=gesture_in.english_meaning,
        kannada_meaning=gesture_in.kannada_meaning,
        gesture_type=gesture_in.gesture_type.upper(),
        hand_count=gesture_in.hand_count.upper(),
        description=gesture_in.description,
        enabled=gesture_in.enabled,
        verification_status=gesture_in.verification_status
    )
    db.add(db_gesture)
    db.commit()
    db.refresh(db_gesture)

    return GestureOut(
        id=db_gesture.id,
        gesture_id=db_gesture.gesture_id,
        name=db_gesture.name,
        english_meaning=db_gesture.english_meaning,
        kannada_meaning=db_gesture.kannada_meaning,
        gesture_type=db_gesture.gesture_type,
        hand_count=db_gesture.hand_count,
        description=db_gesture.description,
        enabled=db_gesture.enabled,
        verification_status=db_gesture.verification_status,
        created_at=db_gesture.created_at,
        updated_at=db_gesture.updated_at,
        sample_count=0,
        signer_count=0,
        has_3d_model=False,
        model_filename=None
    )

@router.get("/{gesture_id}", response_model=GestureOut)
def get_gesture(gesture_id: str, db: Session = Depends(get_db)):
    clean_id = gesture_id.strip().lower()
    g = db.query(Gesture).filter(Gesture.gesture_id == clean_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gesture not found")

    samples_count = db.query(DatasetSample).filter(DatasetSample.gesture_id == g.gesture_id).count()
    signers_count = db.query(DatasetSample.signer_id).filter(
        DatasetSample.gesture_id == g.gesture_id
    ).distinct().count()
    model = db.query(ThreeDModel).filter(ThreeDModel.gesture_id == g.gesture_id).first()

    return GestureOut(
        id=g.id,
        gesture_id=g.gesture_id,
        name=g.name,
        english_meaning=g.english_meaning,
        kannada_meaning=g.kannada_meaning,
        gesture_type=g.gesture_type,
        hand_count=g.hand_count,
        description=g.description,
        enabled=g.enabled,
        verification_status=g.verification_status,
        created_at=g.created_at,
        updated_at=g.updated_at,
        sample_count=samples_count,
        signer_count=signers_count,
        has_3d_model=bool(model),
        model_filename=model.filename if model else None
    )

@router.put("/{gesture_id}", response_model=GestureOut)
def update_gesture(gesture_id: str, update_in: GestureUpdate, db: Session = Depends(get_db)):
    clean_id = gesture_id.strip().lower()
    g = db.query(Gesture).filter(Gesture.gesture_id == clean_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gesture not found")

    update_data = update_in.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(g, field, val)

    db.commit()
    db.refresh(g)
    return get_gesture(clean_id, db)

@router.get("/{gesture_id}/dataset", response_model=GestureDatasetBreakdownOut)
def get_gesture_dataset(gesture_id: str, db: Session = Depends(get_db)):
    clean_id = gesture_id.strip().lower()
    g = db.query(Gesture).filter(Gesture.gesture_id == clean_id).first()
    if not g:
        raise HTTPException(status_code=404, detail=f"Gesture '{gesture_id}' not found.")

    signer_ids_from_samples = [r[0] for r in db.query(DatasetSample.signer_id).filter(DatasetSample.gesture_id == clean_id).distinct().all()]
    signer_ids_from_assignments = [r[0] for r in db.query(CollectionAssignment.signer_id).filter(CollectionAssignment.gesture_id == clean_id).distinct().all()]
    all_signer_ids = sorted(list(set(signer_ids_from_samples + signer_ids_from_assignments)))

    signers_stats = []
    total_valid = 0
    for sid in all_signer_ids:
        signer_obj = db.query(Signer).filter(Signer.signer_id == sid).first()
        valid_count = db.query(DatasetSample).filter(
            DatasetSample.gesture_id == clean_id,
            DatasetSample.signer_id == sid,
            DatasetSample.detection_confidence >= 0.70
        ).count()
        total_valid += valid_count

        assign = db.query(CollectionAssignment).filter(
            CollectionAssignment.gesture_id == clean_id,
            CollectionAssignment.signer_id == sid
        ).first()
        target = assign.target_samples if assign else 50
        status_str = assign.status if assign else ("COMPLETED" if valid_count >= target else ("IN_PROGRESS" if valid_count > 0 else "NOT_STARTED"))

        signers_stats.append(GestureSignerStat(
            signer_id=sid,
            signer_name=signer_obj.display_name if signer_obj else sid,
            valid_samples=valid_count,
            target_samples=target,
            status=status_str
        ))

    return GestureDatasetBreakdownOut(
        gesture_id=g.gesture_id,
        name=g.name,
        kannada_meaning=g.kannada_meaning,
        gesture_type=g.gesture_type,
        total_samples=total_valid,
        unique_signers_count=len(all_signer_ids),
        signers=signers_stats
    )

@router.delete("/{gesture_id}")
def delete_gesture(gesture_id: str, db: Session = Depends(get_db)):
    g = db.query(Gesture).filter(Gesture.gesture_id == gesture_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Gesture not found")

    # Cascade: delete all samples and their files first
    samples = db.query(DatasetSample).filter(DatasetSample.gesture_id == gesture_id).all()
    for s in samples:
        delete_sample_files(
            stored_file_path=s.stored_file_path,
            landmark_file_path=s.landmark_file_path,
            gesture_id=s.gesture_id,
            sample_id=s.sample_id
        )
        db.query(LandmarkSequence).filter(LandmarkSequence.sample_id == s.sample_id).delete()
        db.delete(s)

    # Remove gesture-specific storage folder
    delete_gesture_folder(gesture_id)

    db.delete(g)
    db.commit()
    return {"message": f"Gesture '{gesture_id}' and all {len(samples)} associated samples deleted successfully."}
