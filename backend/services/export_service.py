"""
Dataset Export Service: Packages gestures, signers, assignments, samples, raw landmarks,
and ML-ready 128-feature arrays into a centralized ZIP archive.
"""
import os
import csv
import json
import zipfile
import datetime
from pathlib import Path
from typing import List
from sqlalchemy.orm import Session
from ..models import Gesture, DatasetSample, LandmarkSequence, Signer, CollectionAssignment
from .storage_service import BASE_DIR, STORAGE_DIR, DIRS, init_storage

def build_ml_features_for_sample(db: Session, sample_id: str) -> List[List[float]]:
    """
    Converts sample landmarks into standard ML format:
    Per frame:
    - Left hand 63 values (21 landmarks x 3: x, y, z) or 0.0 if not present
    - Right hand 63 values (21 landmarks x 3: x, y, z) or 0.0 if not present
    - Presence: 2 values (left_hand_present: 1.0/0.0, right_hand_present: 1.0/0.0)
    Total: exactly 128 features per frame
    """
    sequences = db.query(LandmarkSequence).filter(
        LandmarkSequence.sample_id == sample_id
    ).order_by(LandmarkSequence.frame_index.asc()).all()

    feature_matrix = []
    for seq in sequences:
        frame_feats = []
        
        # Left hand (63 features)
        if seq.left_hand_present and seq.left_hand_landmarks:
            try:
                lm_list = json.loads(seq.left_hand_landmarks)
                for pt in lm_list[:21]:
                    frame_feats.extend([float(pt.get("x", 0.0)), float(pt.get("y", 0.0)), float(pt.get("z", 0.0))])
                while len(frame_feats) < 63:
                    frame_feats.append(0.0)
            except Exception:
                frame_feats.extend([0.0] * 63)
        else:
            frame_feats.extend([0.0] * 63)
            
        # Right hand (63 features)
        if seq.right_hand_present and seq.right_hand_landmarks:
            try:
                lm_list = json.loads(seq.right_hand_landmarks)
                for pt in lm_list[:21]:
                    frame_feats.extend([float(pt.get("x", 0.0)), float(pt.get("y", 0.0)), float(pt.get("z", 0.0))])
                while len(frame_feats) < 126:
                    frame_feats.append(0.0)
            except Exception:
                frame_feats.extend([0.0] * 63)
        else:
            frame_feats.extend([0.0] * 63)
            
        # Presence flags (2 features)
        frame_feats.append(1.0 if seq.left_hand_present else 0.0)
        frame_feats.append(1.0 if seq.right_hand_present else 0.0)

        # Total 128
        feature_matrix.append(frame_feats[:128])

    return feature_matrix

def create_dataset_zip(db: Session) -> str:
    """Creates a complete ISL Dataset ZIP bundle with metadata CSVs and hierarchical files"""
    init_storage()
    timestamp_str = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"ISL_Dataset_Central_Export_{timestamp_str}.zip"
    zip_path = DIRS["exports"] / zip_filename

    gestures = db.query(Gesture).all()
    signers = db.query(Signer).all()
    assignments = db.query(CollectionAssignment).all()
    samples = db.query(DatasetSample).all()

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. gestures.csv
        gestures_csv_data = [
            ["gesture_id", "name", "english_meaning", "kannada_meaning", "gesture_type", "hand_count", "description", "enabled", "verification_status"]
        ]
        for g in gestures:
            gestures_csv_data.append([
                g.gesture_id, g.name, g.english_meaning or "", g.kannada_meaning or "",
                g.gesture_type, g.hand_count, g.description or "", str(g.enabled), g.verification_status
            ])
        csv_buffer = "\n".join([",".join([f'"{str(col)}"' for col in row]) for row in gestures_csv_data])
        zf.writestr("ISL_Dataset/gestures.csv", csv_buffer.encode("utf-8"))

        # 2. signers.csv
        signers_csv_data = [
            ["signer_id", "display_name", "enabled", "created_at"]
        ]
        for sn in signers:
            signers_csv_data.append([
                sn.signer_id, sn.display_name, str(sn.enabled), str(sn.created_at)
            ])
        signers_buffer = "\n".join([",".join([f'"{str(col)}"' for col in row]) for row in signers_csv_data])
        zf.writestr("ISL_Dataset/signers.csv", signers_buffer.encode("utf-8"))

        # 3. assignments.csv
        assign_csv_data = [
            ["id", "signer_id", "gesture_id", "target_samples", "collected_samples", "status", "created_at", "updated_at"]
        ]
        for a in assignments:
            assign_csv_data.append([
                str(a.id), a.signer_id, a.gesture_id, str(a.target_samples), str(a.collected_samples),
                a.status, str(a.created_at), str(a.updated_at)
            ])
        assign_buffer = "\n".join([",".join([f'"{str(col)}"' for col in row]) for row in assign_csv_data])
        zf.writestr("ISL_Dataset/assignments.csv", assign_buffer.encode("utf-8"))

        # 4. samples.csv
        samples_csv_data = [
            ["sample_id", "gesture_id", "signer_id", "sample_type", "handedness", "stored_file_path", "landmark_file_path", "frame_count", "fps", "detection_confidence", "duration", "created_at"]
        ]
        for s in samples:
            samples_csv_data.append([
                s.sample_id, s.gesture_id, s.signer_id, s.sample_type, s.handedness or "RIGHT", s.stored_file_path,
                s.landmark_file_path or "", s.frame_count, s.fps or 30.0, s.detection_confidence,
                s.duration or 0.0, str(s.created_at)
            ])
        samples_buffer = "\n".join([",".join([f'"{str(col)}"' for col in row]) for row in samples_csv_data])
        zf.writestr("ISL_Dataset/samples.csv", samples_buffer.encode("utf-8"))

        # 5. Hierarchical files: gestures/{gesture_id}/{signer_id}/
        for s in samples:
            clean_gid = s.gesture_id
            clean_sid = s.signer_id or "S001"

            # Media file
            if s.stored_file_path:
                full_media_path = BASE_DIR / s.stored_file_path
                if not full_media_path.exists():
                    full_media_path = STORAGE_DIR / s.stored_file_path.replace("storage/", "")
                if full_media_path.exists():
                    sub = "videos" if "video" in s.sample_type.lower() else "images"
                    arc_path = f"ISL_Dataset/gestures/{clean_gid}/{clean_sid}/{sub}/{full_media_path.name}"
                    zf.write(full_media_path, arc_path)

            # Landmark json
            if s.landmark_file_path:
                full_lm_path = BASE_DIR / s.landmark_file_path
                if not full_lm_path.exists():
                    full_lm_path = STORAGE_DIR / s.landmark_file_path.replace("storage/", "")
                if full_lm_path.exists():
                    arc_path = f"ISL_Dataset/gestures/{clean_gid}/{clean_sid}/landmarks/{full_lm_path.name}"
                    zf.write(full_lm_path, arc_path)

            # 128-feature ML array
            ml_feats = build_ml_features_for_sample(db, s.sample_id)
            if ml_feats:
                ml_json = json.dumps({
                    "sample_id": s.sample_id,
                    "gesture_id": s.gesture_id,
                    "signer_id": s.signer_id,
                    "handedness": s.handedness or "RIGHT",
                    "features_shape": [len(ml_feats), 128],
                    "feature_description": "128 features per frame: [0..62 Left 21*(x,y,z), 63..125 Right 21*(x,y,z), 126 Left_present, 127 Right_present]",
                    "frames": ml_feats
                }, indent=2)
                zf.writestr(f"ISL_Dataset/gestures/{clean_gid}/{clean_sid}/ml_features/{s.sample_id}_features_128.json", ml_json)

    return f"storage/exports/{zip_filename}"
