"""
FastAPI Router for Real-Time ISL Gesture Recognition & Model Evaluation Inspection.
Provides:
- GET  /api/ml/status                  : Returns model metrics, confusion matrix links, and 45 supported gestures
- POST /api/ml/predict-static          : Single-frame static gesture prediction (27 classes: A-Z + Super)
- POST /api/ml/predict-dynamic         : Multi-frame sequence dynamic gesture prediction (18 classes)
- POST /api/ml/predict-auto            : Smart motion-aware predictor (automatically routes Static vs Dynamic)
- GET  /api/ml/gesture-template/{gid}  : Returns real recorded 3D 21-landmark trajectory for 3D Avatar playback
"""
import json
import joblib
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.ml.features import (
    extract_static_features,
    extract_dynamic_sequence_features,
    parse_landmarks
)

router = APIRouter(prefix="/api/ml", tags=["ml-inference"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_DIR = BASE_DIR / "storage" / "models" / "ml_trained"

_CACHE: Dict[str, Any] = {
    "static_bundle": None,
    "dynamic_bundle": None,
    "report": None,
    "templates": None,
    "loaded": False
}


def ensure_models_loaded(force_reload: bool = False):
    """Lazy-loads trained model bundles and templates into memory."""
    if _CACHE["loaded"] and not force_reload:
        return True

    static_path = MODEL_DIR / "static_model_bundle.joblib"
    dynamic_path = MODEL_DIR / "dynamic_model_bundle.joblib"
    report_path = MODEL_DIR / "training_metrics_report.json"
    templates_path = MODEL_DIR / "gesture_templates.json"

    if not static_path.exists() or not dynamic_path.exists():
        return False

    try:
        _CACHE["static_bundle"] = joblib.load(static_path)
        _CACHE["dynamic_bundle"] = joblib.load(dynamic_path)
        if report_path.exists():
            _CACHE["report"] = json.loads(report_path.read_text(encoding="utf-8"))
        if templates_path.exists():
            _CACHE["templates"] = json.loads(templates_path.read_text(encoding="utf-8"))
        _CACHE["loaded"] = True
        return True
    except Exception as e:
        print(f"Error loading ML models: {e}")
        return False


class StaticPredictRequest(BaseModel):
    left_hand_landmarks: Optional[List[Any]] = None
    right_hand_landmarks: Optional[List[Any]] = None


class FrameLandmarks(BaseModel):
    left_hand_landmarks: Optional[List[Any]] = None
    right_hand_landmarks: Optional[List[Any]] = None
    landmarks: Optional[List[Any]] = None
    timestamp: Optional[float] = None


class DynamicPredictRequest(BaseModel):
    frames: List[Dict[str, Any]]
    mode: Optional[str] = "auto"  # "auto", "static", or "dynamic"


def _predict_with_bundle(bundle: dict, feat: np.ndarray, gesture_type: str) -> dict:
    clf = bundle["model"]
    scaler = bundle["scaler"]
    use_scaled = bundle["use_scaled"]
    classes = bundle["classes"]
    meta = bundle.get("gesture_meta", {})

    X_in = feat.reshape(1, -1)
    if use_scaled and scaler is not None:
        X_in = scaler.transform(X_in)

    if hasattr(clf, "predict_proba"):
        probs = clf.predict_proba(X_in)[0]
        top_indices = np.argsort(probs)[::-1][:3]
        best_idx = int(top_indices[0])
        confidence = float(probs[best_idx])
        top_3 = [
            {
                "gesture_id": str(classes[i]),
                "name": meta.get(str(classes[i]), {}).get("name", str(classes[i]).upper()),
                "kannada_meaning": meta.get(str(classes[i]), {}).get("kannada_meaning", ""),
                "confidence": round(float(probs[i]), 4)
            }
            for i in top_indices
        ]
    else:
        pred_idx = int(clf.predict(X_in)[0])
        best_idx = pred_idx
        confidence = 0.95
        top_3 = [{
            "gesture_id": str(classes[best_idx]),
            "name": meta.get(str(classes[best_idx]), {}).get("name", str(classes[best_idx]).upper()),
            "kannada_meaning": meta.get(str(classes[best_idx]), {}).get("kannada_meaning", ""),
            "confidence": 0.95
        }]

    gid = str(classes[best_idx])
    ginfo = meta.get(gid, {})
    return {
        "gesture_id": gid,
        "name": ginfo.get("name", gid.upper()),
        "english_meaning": ginfo.get("english_meaning", ginfo.get("name", gid.upper())),
        "kannada_meaning": ginfo.get("kannada_meaning", ""),
        "gesture_type": gesture_type,
        "hand_count": ginfo.get("hand_count", "ONE_HAND"),
        "confidence": round(confidence, 4),
        "top_3": top_3
    }


@router.get("/status")
def get_ml_status():
    ready = ensure_models_loaded()
    if not ready:
        return {
            "ready": False,
            "message": "ML models are not yet trained or currently training."
        }
    report = _CACHE.get("report", {})
    return {
        "ready": True,
        "static_champion_model": report.get("static_evaluation", {}).get("champion_model"),
        "static_test_accuracy": report.get("static_evaluation", {}).get("final_test_accuracy"),
        "static_test_f1": report.get("static_evaluation", {}).get("final_test_macro_f1"),
        "dynamic_champion_model": report.get("dynamic_evaluation", {}).get("champion_model"),
        "dynamic_test_accuracy": report.get("dynamic_evaluation", {}).get("final_test_accuracy"),
        "dynamic_test_f1": report.get("dynamic_evaluation", {}).get("final_test_macro_f1"),
        "report": report
    }


@router.post("/predict-static")
def predict_static(req: StaticPredictRequest):
    if not ensure_models_loaded():
        raise HTTPException(status_code=503, detail="ML models not loaded.")

    feat = extract_static_features(req.left_hand_landmarks, req.right_hand_landmarks)
    if feat is None:
        raise HTTPException(status_code=400, detail="Valid 21 hand landmarks not detected in frame.")

    return _predict_with_bundle(_CACHE["static_bundle"], feat, "STATIC")


@router.post("/predict-dynamic")
def predict_dynamic(req: DynamicPredictRequest):
    if not ensure_models_loaded():
        raise HTTPException(status_code=503, detail="ML models not loaded.")

    feat = extract_dynamic_sequence_features(req.frames, target_len=24)
    if feat is None:
        raise HTTPException(status_code=400, detail="No valid hand landmarks found in sequence.")

    return _predict_with_bundle(_CACHE["dynamic_bundle"], feat, "DYNAMIC")


@router.post("/predict-auto")
def predict_auto(req: DynamicPredictRequest):
    """
    Smart motion-aware gesture recognizer:
    - If mode == 'static', evaluates static model on the latest valid frame.
    - If mode == 'dynamic', evaluates dynamic model on the sequence buffer.
    - If mode == 'auto', measures wrist & fingertip displacement and two-hand presence across the window:
        * Two-handed frames or significant spatial trajectory -> Dynamic Model (18 words/phrases)
        * Single hand held in a steady pose -> Static Model (27 signs: A-Z + Super)
    """
    if not ensure_models_loaded():
        raise HTTPException(status_code=503, detail="ML models not loaded.")

    frames = req.frames or []
    if not frames:
        raise HTTPException(status_code=400, detail="Empty frames list.")

    mode = (req.mode or "auto").lower().strip()

    # Find latest frame with valid landmarks for static prediction
    latest_static_feat = None
    two_hands_count = 0
    valid_frames_count = 0
    wrist_positions = []
    index_tip_positions = []

    for f in frames:
        l_raw = f.get("left_hand_landmarks")
        r_raw = f.get("right_hand_landmarks")
        if not l_raw and not r_raw and f.get("landmarks"):
            l_raw = f.get("landmarks")

        l_pts = parse_landmarks(l_raw)
        r_pts = parse_landmarks(r_raw)
        if l_pts is not None or r_pts is not None:
            valid_frames_count += 1
            if l_pts is not None and r_pts is not None:
                two_hands_count += 1
            prim = l_pts if l_pts is not None else r_pts
            wrist_positions.append(prim[0])
            index_tip_positions.append(prim[8])
            s_feat = extract_static_features(l_raw, r_raw)
            if s_feat is not None:
                latest_static_feat = s_feat

    if valid_frames_count == 0 or latest_static_feat is None:
        raise HTTPException(status_code=400, detail="No valid hand landmarks detected.")

    if mode == "static":
        res = _predict_with_bundle(_CACHE["static_bundle"], latest_static_feat, "STATIC")
        res["motion_score"] = 0.0
        return res

    if mode == "dynamic":
        dyn_feat = extract_dynamic_sequence_features(frames, target_len=24)
        if dyn_feat is None:
            raise HTTPException(status_code=400, detail="Insufficient frames for dynamic prediction.")
        res = _predict_with_bundle(_CACHE["dynamic_bundle"], dyn_feat, "DYNAMIC")
        res["motion_score"] = 1.0
        return res

    # AUTO mode: compute spatial motion across the window
    two_hand_ratio = two_hands_count / max(1, valid_frames_count)
    if len(wrist_positions) >= 4:
        w_arr = np.stack(wrist_positions, axis=0)
        tip_arr = np.stack(index_tip_positions, axis=0)
        wrist_spread = float(np.max(np.ptp(w_arr, axis=0)))
        tip_spread = float(np.max(np.ptp(tip_arr, axis=0)))
        motion_score = max(wrist_spread, tip_spread * 0.85)
    else:
        motion_score = 0.0

    # If 2 hands are active (all static signs in dataset are 1-handed) or hand is actively moving
    is_dynamic_motion = (two_hand_ratio >= 0.20) or (len(frames) >= 8 and motion_score >= 0.045)

    static_pred = _predict_with_bundle(_CACHE["static_bundle"], latest_static_feat, "STATIC")

    if is_dynamic_motion and len(frames) >= 5:
        dyn_feat = extract_dynamic_sequence_features(frames, target_len=24)
        if dyn_feat is not None:
            dyn_pred = _predict_with_bundle(_CACHE["dynamic_bundle"], dyn_feat, "DYNAMIC")
            dyn_pred["motion_score"] = round(motion_score, 4)
            dyn_pred["alternate_static"] = static_pred
            return dyn_pred

    static_pred["motion_score"] = round(motion_score, 4)
    return static_pred


@router.get("/gesture-template/{gesture_query}")
def get_gesture_template(gesture_query: str):
    """
    Returns a real recorded 21-landmark 3D sequence for the requested gesture
    so the 3D Avatar in Normal User / Live Chat can play back authentic ISL movements.
    """
    ensure_models_loaded()
    templates = _CACHE.get("templates") or {}
    report = _CACHE.get("report") or {}
    supported = report.get("supported_gestures") or {}

    q = gesture_query.strip().lower().replace(" ", "_")
    # Direct match
    matched_gid = None
    if q in templates:
        matched_gid = q
    else:
        # Search by name or English meaning substring
        for gid, meta in supported.items():
            if q == gid or q in (meta.get("name", "").lower()) or q in (meta.get("english_meaning", "").lower()):
                if gid in templates:
                    matched_gid = gid
                    break

    if not matched_gid:
        raise HTTPException(status_code=404, detail=f"No 3D landmark template found for '{gesture_query}'.")

    tmpl = templates[matched_gid]
    meta = supported.get(matched_gid, {})
    return {
        "gesture_id": matched_gid,
        "name": meta.get("name", matched_gid.upper()),
        "english_meaning": meta.get("english_meaning", meta.get("name", matched_gid.upper())),
        "kannada_meaning": meta.get("kannada_meaning", ""),
        "gesture_type": tmpl.get("gesture_type", "STATIC"),
        "frames": tmpl.get("frames", [])
    }
