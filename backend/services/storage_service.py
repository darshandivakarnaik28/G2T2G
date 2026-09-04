"""
Storage service for persistent file management
"""
import os
import re
import json
import uuid
from pathlib import Path
from typing import Dict, Any, List

BASE_DIR = Path(__file__).resolve().parent.parent.parent
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

def save_image_bytes(gesture_id: str, image_bytes: bytes, ext: str = "jpg") -> str:
    """Save raw image bytes and return relative path from base"""
    init_storage()
    clean_gesture = sanitize_filename(gesture_id)
    unique_id = uuid.uuid4().hex[:10]
    filename = f"{clean_gesture}_{unique_id}.{ext}"
    
    # Save in global images and gesture folder
    dest_path = DIRS["images"] / filename
    with open(dest_path, "wb") as f:
        f.write(image_bytes)
        
    # Also link in gesture folder
    gesture_img_dir = DIRS["gestures"] / clean_gesture / "images"
    os.makedirs(gesture_img_dir, exist_ok=True)
    with open(gesture_img_dir / filename, "wb") as f:
        f.write(image_bytes)

    return f"storage/images/{filename}"

def save_video_bytes(gesture_id: str, video_bytes: bytes, ext: str = "webm") -> str:
    """Save video bytes and return relative path"""
    init_storage()
    clean_gesture = sanitize_filename(gesture_id)
    unique_id = uuid.uuid4().hex[:10]
    filename = f"{clean_gesture}_{unique_id}.{ext}"
    
    dest_path = DIRS["videos"] / filename
    with open(dest_path, "wb") as f:
        f.write(video_bytes)

    gesture_vid_dir = DIRS["gestures"] / clean_gesture / "videos"
    os.makedirs(gesture_vid_dir, exist_ok=True)
    with open(gesture_vid_dir / filename, "wb") as f:
        f.write(video_bytes)

    return f"storage/videos/{filename}"

def save_landmarks_json(gesture_id: str, sample_id: str, payload: Dict[str, Any]) -> str:
    """Save landmark sequence payload as formatted JSON"""
    init_storage()
    clean_gesture = sanitize_filename(gesture_id)
    clean_sample = sanitize_filename(sample_id)
    filename = f"{clean_sample}.json"
    
    dest_path = DIRS["landmarks"] / filename
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    gesture_lm_dir = DIRS["gestures"] / clean_gesture / "landmarks"
    os.makedirs(gesture_lm_dir, exist_ok=True)
    with open(gesture_lm_dir / filename, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return f"storage/landmarks/{filename}"

def read_landmarks_json(relative_path: str) -> Dict[str, Any]:
    """Read stored landmark json file"""
    full_path = BASE_DIR / relative_path
    if not full_path.exists():
        return {}
    with open(full_path, "r", encoding="utf-8") as f:
        return json.load(f)

def _safe_delete(path_str: str):
    """Silently delete a file if it exists (relative to BASE_DIR)"""
    if not path_str:
        return
    try:
        p = BASE_DIR / path_str
        if p.exists():
            p.unlink()
    except Exception:
        pass

def delete_sample_files(stored_file_path: str, landmark_file_path: str, gesture_id: str, sample_id: str):
    """Delete all disk files associated with a dataset sample — no orphan files left behind."""
    # Primary stored file (image or video)
    _safe_delete(stored_file_path)
    # Landmark JSON
    _safe_delete(landmark_file_path)
    # Gesture sub-folder copies
    if stored_file_path and gesture_id:
        clean_gesture = sanitize_filename(gesture_id)
        filename = Path(stored_file_path).name
        for sub in ("images", "videos"):
            _safe_delete(f"storage/gestures/{clean_gesture}/{sub}/{filename}")
    if landmark_file_path and gesture_id:
        clean_gesture = sanitize_filename(gesture_id)
        lm_filename = Path(landmark_file_path).name
        _safe_delete(f"storage/gestures/{clean_gesture}/landmarks/{lm_filename}")

def delete_gesture_folder(gesture_id: str):
    """Remove the entire gesture-specific storage sub-folder (called after cascade delete)."""
    import shutil
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
