"""
Storage service for persistent centralized file management
Supports hierarchical signer partitioning: gestures/{gesture_id}/{signer_id}/
"""
import os
import re
import json
import uuid
import shutil
from pathlib import Path
from typing import Dict, Any, List

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Centralized storage directory (can be overridden via environment variable)
CUSTOM_STORAGE = os.getenv("STORAGE_DIR")
if CUSTOM_STORAGE:
    STORAGE_DIR = Path(CUSTOM_STORAGE)
else:
    STORAGE_DIR = BASE_DIR / "storage"

DIRS = {
    "gestures": STORAGE_DIR / "gestures",
    "images": STORAGE_DIR / "images",
    "videos": STORAGE_DIR / "videos",
    "landmarks": STORAGE_DIR / "landmarks",
    "models": STORAGE_DIR / "models",
    "exports": STORAGE_DIR / "exports",
}

def init_storage():
    """Ensure all storage folders exist on disk"""
    for d in DIRS.values():
        os.makedirs(d, exist_ok=True)

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and special character errors"""
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
    return clean

def save_image_bytes(gesture_id: str, image_bytes: bytes, ext: str = "jpg", signer_id: str = "S001") -> str:
    """
    Save raw image bytes to global storage and hierarchical signer folder:
    storage/gestures/{gesture_id}/{signer_id}/images/{filename}
    """
    init_storage()
    clean_gesture = sanitize_filename(gesture_id)
    clean_signer = sanitize_filename(signer_id or "S001")
    unique_id = uuid.uuid4().hex[:10]
    filename = f"{clean_gesture}_{clean_signer}_{unique_id}.{ext}"
    
    # 1. Global images storage
    dest_path = DIRS["images"] / filename
    with open(dest_path, "wb") as f:
        f.write(image_bytes)
        
    # 2. Hierarchical signer-partitioned storage
    signer_img_dir = DIRS["gestures"] / clean_gesture / clean_signer / "images"
    os.makedirs(signer_img_dir, exist_ok=True)
    with open(signer_img_dir / filename, "wb") as f:
        f.write(image_bytes)

    # Return normalized relative path
    rel_path = f"storage/images/{filename}"
    return rel_path

def save_video_bytes(gesture_id: str, video_bytes: bytes, ext: str = "webm", signer_id: str = "S001") -> str:
    """
    Save video bytes to global storage and hierarchical signer folder:
    storage/gestures/{gesture_id}/{signer_id}/videos/{filename}
    """
    init_storage()
    clean_gesture = sanitize_filename(gesture_id)
    clean_signer = sanitize_filename(signer_id or "S001")
    unique_id = uuid.uuid4().hex[:10]
    filename = f"{clean_gesture}_{clean_signer}_{unique_id}.{ext}"
    
    # 1. Global videos storage
    dest_path = DIRS["videos"] / filename
    with open(dest_path, "wb") as f:
        f.write(video_bytes)

    # 2. Hierarchical signer-partitioned storage
    signer_vid_dir = DIRS["gestures"] / clean_gesture / clean_signer / "videos"
    os.makedirs(signer_vid_dir, exist_ok=True)
    with open(signer_vid_dir / filename, "wb") as f:
        f.write(video_bytes)

    return f"storage/videos/{filename}"

def save_landmarks_json(gesture_id: str, sample_id: str, payload: Dict[str, Any], signer_id: str = "S001") -> str:
    """
    Save landmark sequence payload as formatted JSON:
    storage/gestures/{gesture_id}/{signer_id}/landmarks/{sample_id}.json
    """
    init_storage()
    clean_gesture = sanitize_filename(gesture_id)
    clean_sample = sanitize_filename(sample_id)
    clean_signer = sanitize_filename(signer_id or "S001")
    filename = f"{clean_sample}.json"
    
    # 1. Global landmarks
    dest_path = DIRS["landmarks"] / filename
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    # 2. Hierarchical signer-partitioned storage
    signer_lm_dir = DIRS["gestures"] / clean_gesture / clean_signer / "landmarks"
    os.makedirs(signer_lm_dir, exist_ok=True)
    with open(signer_lm_dir / filename, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return f"storage/landmarks/{filename}"

def read_landmarks_json(relative_path: str) -> Dict[str, Any]:
    """Read stored landmark json file"""
    full_path = BASE_DIR / relative_path
    if not full_path.exists():
        # Fallback check directly in STORAGE_DIR
        full_path = STORAGE_DIR / relative_path.replace("storage/", "")
        if not full_path.exists():
            return {}
    with open(full_path, "r", encoding="utf-8") as f:
        return json.load(f)

def _safe_delete(path_str: str):
    """Silently delete a file if it exists (relative to BASE_DIR or STORAGE_DIR)"""
    if not path_str:
        return
    try:
        p = BASE_DIR / path_str
        if p.exists():
            p.unlink()
            return
        p2 = STORAGE_DIR / path_str.replace("storage/", "")
        if p2.exists():
            p2.unlink()
    except Exception:
        pass

def delete_sample_files(stored_file_path: str, landmark_file_path: str, gesture_id: str, sample_id: str, signer_id: str = None):
    """Delete all disk files associated with a dataset sample — no orphan files left behind."""
    _safe_delete(stored_file_path)
    _safe_delete(landmark_file_path)

    # Purge from hierarchical subfolders
    if stored_file_path and gesture_id:
        clean_gesture = sanitize_filename(gesture_id)
        filename = Path(stored_file_path).name
        
        # Check signer subfolder if available
        if signer_id:
            clean_signer = sanitize_filename(signer_id)
            for sub in ("images", "videos"):
                _safe_delete(f"storage/gestures/{clean_gesture}/{clean_signer}/{sub}/{filename}")
        
        # Legacy/generic gesture subfolder
        for sub in ("images", "videos"):
            _safe_delete(f"storage/gestures/{clean_gesture}/{sub}/{filename}")

    if landmark_file_path and gesture_id:
        clean_gesture = sanitize_filename(gesture_id)
        lm_filename = Path(landmark_file_path).name
        if signer_id:
            clean_signer = sanitize_filename(signer_id)
            _safe_delete(f"storage/gestures/{clean_gesture}/{clean_signer}/landmarks/{lm_filename}")
        _safe_delete(f"storage/gestures/{clean_gesture}/landmarks/{lm_filename}")

def delete_gesture_folder(gesture_id: str):
    """Remove the entire gesture-specific storage sub-folder (called after cascade delete)."""
    clean_gesture = sanitize_filename(gesture_id)
    gesture_dir = DIRS["gestures"] / clean_gesture
    if gesture_dir.exists():
        try:
            shutil.rmtree(gesture_dir)
        except Exception:
            pass

def save_3d_model(gesture_id: str, filename: str, content: bytes) -> str:
    """Save 3D .glb / .gltf model"""
    init_storage()
    clean_fn = sanitize_filename(filename)
    dest_path = DIRS["models"] / clean_fn
    with open(dest_path, "wb") as f:
        f.write(content)
        
    if gesture_id:
        clean_gesture = sanitize_filename(gesture_id)
        gesture_model_dir = DIRS["gestures"] / clean_gesture / "models"
        os.makedirs(gesture_model_dir, exist_ok=True)
        with open(gesture_model_dir / clean_fn, "wb") as f:
            f.write(content)

    return f"storage/models/{clean_fn}"
