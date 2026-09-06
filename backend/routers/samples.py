"""
Samples API Router - Centralized Remote Dataset Samples
Supports multi-signer collection, handedness preservation, and automated assignment progress sync.
"""
import json
import base64
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Gesture, DatasetSample, LandmarkSequence, Signer, CollectionAssignment
from ..schemas import DatasetSampleOut
from ..services.storage_service import (
    save_image_bytes,
    save_video_bytes,
    save_landmarks_json,
    read_landmarks_json,
    delete_sample_files
)

router = APIRouter(prefix="/api/samples", tags=["samples"])

def _sync_signer_and_assignment(db: Session, gesture_id: str, signer_id: str):
    """Ensure signer exists and sync assignment progress"""
    clean_sid = signer_id.strip().upper()
    clean_gid = gesture_id.strip().lower()

    # Auto-register signer if new
    signer = db.query(Signer).filter(Signer.signer_id == clean_sid).first()
    if not signer:
        signer = Signer(signer_id=clean_sid, display_name=f"Signer {clean_sid}")
        db.add(signer)
        db.commit()

    # Count valid samples (confidence >= 0.70)
    valid_count = db.query(DatasetSample).filter(
        DatasetSample.gesture_id == clean_gid,
        DatasetSample.signer_id == clean_sid,
        DatasetSample.detection_confidence >= 0.70
    ).count()

    assignment = db.query(CollectionAssignment).filter(
        CollectionAssignment.gesture_id == clean_gid,
        CollectionAssignment.signer_id == clean_sid
    ).first()

    if assignment:
        assignment.collected_samples = valid_count
        if valid_count >= assignment.target_samples:
            assignment.status = "COMPLETED"
        elif valid_count > 0:
            assignment.status = "IN_PROGRESS"
        else:
            assignment.status = "NOT_STARTED"
        db.commit()

@router.get("", response_model=List[DatasetSampleOut])
def list_samples(
    gesture_id: Optional[str] = None,
    signer_id: Optional[str] = None,
    sample_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(DatasetSample)
    if gesture_id:
        query = query.filter(DatasetSample.gesture_id == gesture_id.strip().lower())
    if signer_id:
        query = query.filter(DatasetSample.signer_id == signer_id.strip().upper())
    if sample_type:
        query = query.filter(DatasetSample.sample_type == sample_type.strip().upper())

    samples = query.order_by(DatasetSample.created_at.desc()).all()
    results = []
    for s in samples:
        gesture = db.query(Gesture).filter(Gesture.gesture_id == s.gesture_id).first()
        out = DatasetSampleOut(
            id=s.id,
            sample_id=s.sample_id,
            gesture_id=s.gesture_id,
            gesture_name=gesture.name if gesture else s.gesture_id,
            gesture_kannada=gesture.kannada_meaning if gesture else None,
            gesture_type=gesture.gesture_type if gesture else None,
            signer_id=s.signer_id,
            sample_type=s.sample_type,
            stored_file_path=s.stored_file_path,
            landmark_file_path=s.landmark_file_path,
            frame_count=s.frame_count,
            fps=s.fps,
            hand_count_detected=s.hand_count_detected,
            handedness=s.handedness or "RIGHT",
            detection_confidence=s.detection_confidence,
            image_width=s.image_width,
            image_height=s.image_height,
            duration=s.duration,
            created_at=s.created_at
        )
        results.append(out)
    return results

@router.post("/webcam-image", response_model=DatasetSampleOut, status_code=status.HTTP_201_CREATED)
async def create_webcam_image_sample(
    gesture_id: str = Form(...),
    signer_id: str = Form(...),
    landmarks_json: str = Form(...),
    image_base64: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    handedness: Optional[str] = Form(None),
    confidence: float = Form(0.95),
    width: int = Form(640),
    height: int = Form(480),
    db: Session = Depends(get_db)
):
    clean_gid = gesture_id.strip().lower()
    clean_sid = signer_id.strip().upper()

    gesture = db.query(Gesture).filter(Gesture.gesture_id == clean_gid).first()
    if not gesture:
        raise HTTPException(status_code=404, detail=f"Gesture '{clean_gid}' not found.")

    # Ensure signer exists
    _sync_signer_and_assignment(db, clean_gid, clean_sid)

    sample_id = f"smp_{uuid.uuid4().hex[:8]}"

    # Decode image bytes
    if image_file:
        img_bytes = await image_file.read()
        ext = image_file.filename.split(".")[-1].lower() if "." in image_file.filename else "jpg"
    elif image_base64:
        if "," in image_base64:
            header, encoded = image_base64.split(",", 1)
            ext = "png" if "png" in header else "jpg"
            img_bytes = base64.b64decode(encoded)
        else:
            img_bytes = base64.b64decode(image_base64)
            ext = "jpg"
    else:
        raise HTTPException(status_code=400, detail="Image file or base64 data required.")

    # Save to hierarchical storage
    stored_path = save_image_bytes(clean_gid, img_bytes, ext=ext, signer_id=clean_sid)

    # Parse landmarks
    try:
        parsed_lm = json.loads(landmarks_json)
    except Exception:
        parsed_lm = {}

    lm_payload = {
        "gesture_id": clean_gid,
        "sample_id": sample_id,
        "signer_id": clean_sid,
        "type": "STATIC",
        "fps": None,
        "frames": [parsed_lm] if isinstance(parsed_lm, dict) and "right_hand_landmarks" in parsed_lm else parsed_lm
    }
    lm_path = save_landmarks_json(clean_gid, sample_id, lm_payload, signer_id=clean_sid)

    # Handedness determination
    if handedness:
        final_handedness = handedness.strip().upper()
    elif isinstance(parsed_lm, dict):
        if parsed_lm.get("left_hand_present") and parsed_lm.get("right_hand_present"):
            final_handedness = "BOTH"
        elif parsed_lm.get("left_hand_present"):
            final_handedness = "LEFT"
        else:
            final_handedness = "RIGHT"
    else:
        final_handedness = "RIGHT"

    hand_count = 0
    if isinstance(parsed_lm, dict):
        if parsed_lm.get("left_hand_present"): hand_count += 1
        if parsed_lm.get("right_hand_present"): hand_count += 1
    hand_count = max(1, hand_count)

    sample = DatasetSample(
        sample_id=sample_id,
        gesture_id=clean_gid,
        signer_id=clean_sid,
        sample_type="WEBCAM_IMAGE",
        original_filename=f"webcam_pose_{sample_id}.{ext}",
        stored_file_path=stored_path,
        landmark_file_path=lm_path,
        frame_count=1,
        fps=None,
        hand_count_detected=hand_count,
        handedness=final_handedness,
        detection_confidence=confidence,
        image_width=width,
        image_height=height,
        duration=None
    )
    db.add(sample)

    if isinstance(parsed_lm, dict):
        seq = LandmarkSequence(
            sample_id=sample_id,
            frame_index=0,
            timestamp=0.0,
            left_hand_present=parsed_lm.get("left_hand_present", False),
            right_hand_present=parsed_lm.get("right_hand_present", True),
            left_hand_landmarks=json.dumps(parsed_lm.get("left_hand_landmarks", [])),
            right_hand_landmarks=json.dumps(parsed_lm.get("right_hand_landmarks", [])),
            left_confidence=parsed_lm.get("left_confidence", 0.0),
            right_confidence=parsed_lm.get("right_confidence", confidence)
        )
        db.add(seq)

    db.commit()
    db.refresh(sample)

    # Update collection assignment progress
    _sync_signer_and_assignment(db, clean_gid, clean_sid)

    return DatasetSampleOut(
        id=sample.id,
        sample_id=sample.sample_id,
        gesture_id=sample.gesture_id,
        gesture_name=gesture.name,
        gesture_kannada=gesture.kannada_meaning,
        gesture_type=gesture.gesture_type,
        signer_id=sample.signer_id,
        sample_type=sample.sample_type,
        stored_file_path=sample.stored_file_path,
        landmark_file_path=sample.landmark_file_path,
        frame_count=sample.frame_count,
        fps=sample.fps,
        hand_count_detected=sample.hand_count_detected,
        handedness=sample.handedness,
        detection_confidence=sample.detection_confidence,
        image_width=sample.image_width,
        image_height=sample.image_height,
        duration=sample.duration,
        created_at=sample.created_at
    )

@router.post("/image", response_model=DatasetSampleOut, status_code=status.HTTP_201_CREATED)
async def create_image_sample(
    gesture_id: str = Form(...),
    signer_id: str = Form(...),
    landmarks_json: str = Form(...),
    image: UploadFile = File(...),
    handedness: Optional[str] = Form(None),
    confidence: float = Form(0.95),
    width: int = Form(640),
    height: int = Form(480),
    db: Session = Depends(get_db)
):
    clean_gid = gesture_id.strip().lower()
    clean_sid = signer_id.strip().upper()

    gesture = db.query(Gesture).filter(Gesture.gesture_id == clean_gid).first()
    if not gesture:
        raise HTTPException(status_code=404, detail=f"Gesture '{clean_gid}' not found.")

    _sync_signer_and_assignment(db, clean_gid, clean_sid)

    sample_id = f"smp_{uuid.uuid4().hex[:8]}"
    img_bytes = await image.read()
    ext = image.filename.split(".")[-1].lower() if "." in image.filename else "jpg"

    stored_path = save_image_bytes(clean_gid, img_bytes, ext=ext, signer_id=clean_sid)

    try:
        parsed_lm = json.loads(landmarks_json)
    except Exception:
        parsed_lm = {}

    lm_payload = {
        "gesture_id": clean_gid,
        "sample_id": sample_id,
        "signer_id": clean_sid,
        "type": "STATIC",
        "fps": None,
        "frames": [parsed_lm] if isinstance(parsed_lm, dict) and "right_hand_landmarks" in parsed_lm else parsed_lm
    }
    lm_path = save_landmarks_json(clean_gid, sample_id, lm_payload, signer_id=clean_sid)

    final_handedness = handedness.strip().upper() if handedness else "RIGHT"

    sample = DatasetSample(
        sample_id=sample_id,
        gesture_id=clean_gid,
        signer_id=clean_sid,
        sample_type="IMAGE",
        original_filename=image.filename,
        stored_file_path=stored_path,
        landmark_file_path=lm_path,
        frame_count=1,
        fps=None,
        hand_count_detected=1,
        handedness=final_handedness,
        detection_confidence=confidence,
        image_width=width,
        image_height=height,
        duration=None
    )
    db.add(sample)

    if isinstance(parsed_lm, dict):
        seq = LandmarkSequence(
            sample_id=sample_id,
            frame_index=0,
            timestamp=0.0,
            left_hand_present=parsed_lm.get("left_hand_present", False),
            right_hand_present=parsed_lm.get("right_hand_present", True),
            left_hand_landmarks=json.dumps(parsed_lm.get("left_hand_landmarks", [])),
            right_hand_landmarks=json.dumps(parsed_lm.get("right_hand_landmarks", [])),
            left_confidence=parsed_lm.get("left_confidence", 0.0),
            right_confidence=parsed_lm.get("right_confidence", confidence)
        )
        db.add(seq)

    db.commit()
    db.refresh(sample)

    _sync_signer_and_assignment(db, clean_gid, clean_sid)

    return DatasetSampleOut(
        id=sample.id,
        sample_id=sample.sample_id,
        gesture_id=sample.gesture_id,
        gesture_name=gesture.name,
        gesture_kannada=gesture.kannada_meaning,
        gesture_type=gesture.gesture_type,
        signer_id=sample.signer_id,
        sample_type=sample.sample_type,
        stored_file_path=sample.stored_file_path,
        landmark_file_path=sample.landmark_file_path,
        frame_count=sample.frame_count,
        fps=sample.fps,
        hand_count_detected=sample.hand_count_detected,
        handedness=sample.handedness,
        detection_confidence=sample.detection_confidence,
        image_width=sample.image_width,
        image_height=sample.image_height,
        duration=sample.duration,
        created_at=sample.created_at
    )

@router.post("/webcam-video", response_model=DatasetSampleOut, status_code=status.HTTP_201_CREATED)
async def create_webcam_video_sample(
    gesture_id: str = Form(...),
    signer_id: str = Form(...),
    landmarks_sequence_json: str = Form(...),
    video: UploadFile = File(...),
    handedness: Optional[str] = Form(None),
    fps: float = Form(30.0),
    duration: float = Form(4.0),
    frame_count: int = Form(120),
    confidence: float = Form(0.92),
    db: Session = Depends(get_db)
):
    clean_gid = gesture_id.strip().lower()
    clean_sid = signer_id.strip().upper()

    gesture = db.query(Gesture).filter(Gesture.gesture_id == clean_gid).first()
    if not gesture:
        raise HTTPException(status_code=404, detail=f"Gesture '{clean_gid}' not found.")

    _sync_signer_and_assignment(db, clean_gid, clean_sid)

    sample_id = f"smp_vid_{uuid.uuid4().hex[:8]}"
    vid_bytes = await video.read()
    ext = video.filename.split(".")[-1].lower() if "." in video.filename else "webm"

    stored_path = save_video_bytes(clean_gid, vid_bytes, ext=ext, signer_id=clean_sid)

    try:
        frames_list = json.loads(landmarks_sequence_json)
        if not isinstance(frames_list, list):
            frames_list = [frames_list]
    except Exception:
        frames_list = []

    actual_frames_count = len(frames_list) if len(frames_list) > 0 else frame_count

    lm_payload = {
        "gesture_id": clean_gid,
        "sample_id": sample_id,
        "signer_id": clean_sid,
        "type": "DYNAMIC",
        "fps": fps,
        "duration": duration,
        "total_frames": actual_frames_count,
        "frames": frames_list
    }
    lm_path = save_landmarks_json(clean_gid, sample_id, lm_payload, signer_id=clean_sid)

    final_handedness = handedness.strip().upper() if handedness else "RIGHT"

    sample = DatasetSample(
        sample_id=sample_id,
        gesture_id=clean_gid,
        signer_id=clean_sid,
        sample_type="WEBCAM_VIDEO",
        original_filename=video.filename or f"recording_{sample_id}.{ext}",
        stored_file_path=stored_path,
        landmark_file_path=lm_path,
        frame_count=actual_frames_count,
        fps=fps,
        hand_count_detected=1,
        handedness=final_handedness,
        detection_confidence=confidence,
        image_width=640,
        image_height=480,
        duration=duration
    )
    db.add(sample)

    for i, f in enumerate(frames_list):
        seq = LandmarkSequence(
            sample_id=sample_id,
            frame_index=f.get("frame_index", i),
            timestamp=f.get("timestamp", round(i / (fps or 30.0), 3)),
            left_hand_present=f.get("left_hand_present", False),
            right_hand_present=f.get("right_hand_present", True),
            left_hand_landmarks=json.dumps(f.get("left_hand_landmarks", [])),
            right_hand_landmarks=json.dumps(f.get("right_hand_landmarks", [])),
            left_confidence=f.get("left_confidence", 0.0),
            right_confidence=f.get("right_confidence", confidence)
        )
        db.add(seq)

    db.commit()
    db.refresh(sample)

    _sync_signer_and_assignment(db, clean_gid, clean_sid)

    return DatasetSampleOut(
        id=sample.id,
        sample_id=sample.sample_id,
        gesture_id=sample.gesture_id,
        gesture_name=gesture.name,
        gesture_kannada=gesture.kannada_meaning,
        gesture_type=gesture.gesture_type,
        signer_id=sample.signer_id,
        sample_type=sample.sample_type,
        stored_file_path=sample.stored_file_path,
        landmark_file_path=sample.landmark_file_path,
        frame_count=sample.frame_count,
        fps=sample.fps,
        hand_count_detected=sample.hand_count_detected,
        handedness=sample.handedness,
        detection_confidence=sample.detection_confidence,
        image_width=sample.image_width,
        image_height=sample.image_height,
        duration=sample.duration,
        created_at=sample.created_at
    )

@router.get("/{sample_id}/landmarks")
def get_sample_landmarks(sample_id: str, db: Session = Depends(get_db)):
    sample = db.query(DatasetSample).filter(DatasetSample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    if sample.landmark_file_path:
        data = read_landmarks_json(sample.landmark_file_path)
        if data:
            return data

    sequences = db.query(LandmarkSequence).filter(
        LandmarkSequence.sample_id == sample_id
    ).order_by(LandmarkSequence.frame_index.asc()).all()

    frames = []
    for seq in sequences:
        frames.append({
            "frame_index": seq.frame_index,
            "timestamp": seq.timestamp,
            "left_hand_present": seq.left_hand_present,
            "right_hand_present": seq.right_hand_present,
            "left_hand_landmarks": json.loads(seq.left_hand_landmarks) if seq.left_hand_landmarks else [],
            "right_hand_landmarks": json.loads(seq.right_hand_landmarks) if seq.right_hand_landmarks else [],
            "left_confidence": seq.left_confidence,
            "right_confidence": seq.right_confidence
        })

    return {
        "gesture_id": sample.gesture_id,
        "sample_id": sample.sample_id,
        "signer_id": sample.signer_id,
        "type": "DYNAMIC" if "video" in sample.sample_type.lower() else "STATIC",
        "fps": sample.fps,
        "duration": sample.duration,
        "frames": frames
    }

@router.delete("/{sample_id}")
def delete_sample(sample_id: str, db: Session = Depends(get_db)):
    s = db.query(DatasetSample).filter(DatasetSample.sample_id == sample_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sample not found")

    gid = s.gesture_id
    sid = s.signer_id

    # Purge associated files from disk before removing DB record
    delete_sample_files(
        stored_file_path=s.stored_file_path,
        landmark_file_path=s.landmark_file_path,
        gesture_id=gid,
        sample_id=s.sample_id,
        signer_id=sid
    )

    db.query(LandmarkSequence).filter(LandmarkSequence.sample_id == sample_id).delete()
    db.delete(s)
    db.commit()

    # Recalculate and sync assignment progress
    _sync_signer_and_assignment(db, gid, sid)

    return {"message": f"Sample '{sample_id}' and all associated files deleted successfully."}
