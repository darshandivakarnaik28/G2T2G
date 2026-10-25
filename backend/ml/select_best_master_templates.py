"""
ML-Driven Best Master Signer Sample & Synchronized 3D Trajectory Selector.

For each of the 45 trained ISL gestures (27 Static + 18 Dynamic):
1. Evaluates all Master Signer (1GG23CS007) samples using the trained Soft-Voting Ensemble
   ML models (static_model_bundle.joblib & dynamic_model_bundle.joblib).
2. Scores each sample by combining:
   - Trained ML model class probability (predict_proba for the ground-truth gesture)
   - MediaPipe detection confidence
   - Frame completeness & temporal trajectory smoothness (for dynamic video gestures)
   - Verification that the physical media file (.jpg / .webm) exists on disk
3. Selects the #1 highest-scoring Master Signer sample per gesture:
   - Marks that exact sample as `is_master_reference = 1` in `isl_dataset.db` so the upper
     Master Signer video/image frame displays the #1 best sample.
   - Extracts a temporally smoothed 3D 21-landmark trajectory from that exact same sample
     and saves it to `storage/models/ml_trained/gesture_templates.json` so the lower 3D
     hand model is 100% synchronized with the upper Master Signer display.
"""
import json
import sqlite3
import joblib
import numpy as np
from pathlib import Path
from collections import defaultdict

from backend.ml.features import (
    extract_static_features,
    extract_dynamic_sequence_features,
    parse_landmarks,
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "isl_dataset.db"
MODEL_DIR = BASE_DIR / "storage" / "models" / "ml_trained"
TEMPLATES_PATH = MODEL_DIR / "gesture_templates.json"
EXCLUDED_GESTURES = {"help", "book"}
MASTER_SIGNER_ID = "1GG23CS007"


def smooth_hand_sequence(pts_list: list) -> list:
    """
    Given a list of Optional[np.ndarray (21, 3)], interpolates missing interior frames
    and applies 2 passes of [0.25, 0.50, 0.25] temporal smoothing across consecutive
    21-landmark frames to eliminate jitter during slow-motion (0.1x / 0.25x) 3D playback.
    Returns a list of 21-point lists (or [] when the hand is not present).
    """
    n = len(pts_list)
    if n == 0:
        return []

    valid_indices = [i for i, arr in enumerate(pts_list) if arr is not None and arr.shape == (21, 3)]
    # Only activate hand if present in at least 35% of frames
    if len(valid_indices) < max(2, int(n * 0.35)):
        return [[] for _ in range(n)]

    full_arr = np.zeros((n, 21, 3), dtype=np.float64)
    first_valid = valid_indices[0]
    last_valid = valid_indices[-1]

    for i in range(n):
        if i <= first_valid:
            full_arr[i] = pts_list[first_valid]
        elif i >= last_valid:
            full_arr[i] = pts_list[last_valid]
        elif pts_list[i] is not None:
            full_arr[i] = pts_list[i]
        else:
            prev_v = max(v for v in valid_indices if v < i)
            next_v = min(v for v in valid_indices if v > i)
            alpha = (i - prev_v) / float(next_v - prev_v)
            full_arr[i] = (1.0 - alpha) * pts_list[prev_v] + alpha * pts_list[next_v]

    # Apply 2 passes of [0.25, 0.50, 0.25] temporal smoothing on interior frames
    smoothed = full_arr.copy()
    for _ in range(2):
        next_pass = smoothed.copy()
        for i in range(1, n - 1):
            next_pass[i] = 0.25 * smoothed[i - 1] + 0.50 * smoothed[i] + 0.25 * smoothed[i + 1]
        smoothed = next_pass

    return [smoothed[i].round(4).tolist() for i in range(n)]


def compute_smoothness_score(pts_list: list) -> float:
    """Computes a [0, 1] temporal smoothness score based on wrist/fingertip frame-to-frame velocity."""
    valid_pts = [arr for arr in pts_list if arr is not None and arr.shape == (21, 3)]
    if len(valid_pts) < 4:
        return 0.0
    diffs = []
    for i in range(1, len(valid_pts)):
        dw = float(np.linalg.norm(valid_pts[i][0] - valid_pts[i - 1][0]))
        dt = float(np.linalg.norm(valid_pts[i][8] - valid_pts[i - 1][8]))
        diffs.append(max(dw, dt))
    max_jump = float(np.max(diffs))
    return float(np.clip(1.0 - max(0.0, max_jump - 0.08) * 3.0, 0.1, 1.0))


def main():
    print("=" * 76)
    print("SELECTING #1 ML-SCORED MASTER SIGNER SAMPLES & SMOOTHED 3D TRAJECTORIES")
    print("=" * 76)

    static_bundle = joblib.load(MODEL_DIR / "static_model_bundle.joblib")
    dynamic_bundle = joblib.load(MODEL_DIR / "dynamic_model_bundle.joblib")

    s_model = static_bundle["model"]
    s_scaler = static_bundle["scaler"]
    s_use_scaled = static_bundle.get("use_scaled", True)
    s_classes = list(static_bundle["classes"])

    d_model = dynamic_bundle["model"]
    d_scaler = dynamic_bundle["scaler"]
    d_use_scaled = dynamic_bundle.get("use_scaled", True)
    d_classes = list(dynamic_bundle["classes"])

    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()

    c.execute("""
        SELECT gesture_id, name, english_meaning, kannada_meaning, gesture_type, hand_count
        FROM gestures
        ORDER BY gesture_type, gesture_id
    """)
    gestures = [row for row in c.fetchall() if row[0] not in EXCLUDED_GESTURES]

    # Reset is_master_reference so only the #1 ML-selected sample per gesture is flagged
    c.execute("UPDATE dataset_samples SET is_master_reference = 0")

    # Preload all STATIC samples
    c.execute("""
        SELECT s.sample_id, s.gesture_id, s.signer_id, s.stored_file_path, s.detection_confidence,
               ls.left_hand_landmarks, ls.right_hand_landmarks
        FROM dataset_samples s
        JOIN gestures g ON s.gesture_id = g.gesture_id
        LEFT JOIN landmark_sequences ls ON s.sample_id = ls.sample_id
        WHERE g.gesture_type = 'STATIC'
    """)
    static_by_gid = defaultdict(list)
    for row in c.fetchall():
        static_by_gid[row[1]].append(row)

    # Preload all DYNAMIC samples and frames
    c.execute("""
        SELECT s.sample_id, s.gesture_id, s.signer_id, s.stored_file_path, s.detection_confidence
        FROM dataset_samples s
        JOIN gestures g ON s.gesture_id = g.gesture_id
        WHERE g.gesture_type = 'DYNAMIC'
    """)
    dyn_samples_by_gid = defaultdict(list)
    for row in c.fetchall():
        dyn_samples_by_gid[row[1]].append(row)

    c.execute("""
        SELECT ls.sample_id, ls.frame_index, ls.left_hand_landmarks, ls.right_hand_landmarks
        FROM landmark_sequences ls
        JOIN dataset_samples s ON ls.sample_id = s.sample_id
        JOIN gestures g ON s.gesture_id = g.gesture_id
        WHERE g.gesture_type = 'DYNAMIC' AND g.gesture_id NOT IN ('help', 'book')
        ORDER BY ls.sample_id, ls.frame_index
    """)
    frames_by_sample = defaultdict(list)
    for sid, f_idx, l_raw, r_raw in c.fetchall():
        frames_by_sample[sid].append({
            "frame_index": f_idx,
            "left_hand_landmarks": l_raw,
            "right_hand_landmarks": r_raw,
        })

    templates = {}
    summary_rows = []

    for gid, name, en, kn, gtype, hcount in gestures:
        if gtype == "STATIC":
            if gid not in s_classes:
                continue
            class_idx = s_classes.index(gid)
            rows = static_by_gid.get(gid, [])

            valid_items = []
            feats = []
            for sample_id, _, signer_id, stored_path, det_conf, l_raw, r_raw in rows:
                feat = extract_static_features(l_raw, r_raw)
                if feat is None or np.any(np.isnan(feat)):
                    continue
                l_pts = parse_landmarks(l_raw)
                r_pts = parse_landmarks(r_raw)
                if l_pts is None and r_pts is None:
                    continue
                valid_items.append((sample_id, signer_id, stored_path, det_conf, l_pts, r_pts))
                feats.append(feat)

            if not valid_items:
                continue

            X_batch = np.stack(feats, axis=0)
            X_in = s_scaler.transform(X_batch) if s_use_scaled else X_batch
            probs_batch = s_model.predict_proba(X_in)[:, class_idx]

            best_candidate = None
            best_score = -1.0

            for idx_item, (sample_id, signer_id, stored_path, det_conf, l_pts, r_pts) in enumerate(valid_items):
                ml_prob = float(probs_batch[idx_item])
                has_file = bool(
                    stored_path
                    and stored_path != "landmarks_only"
                    and (BASE_DIR / stored_path.lstrip("/\\")).exists()
                )
                is_master = (signer_id == MASTER_SIGNER_ID)
                tier_bonus = (2.0 if (is_master and has_file) else (1.0 if has_file else 0.0))
                det_c = float(det_conf or 0.85)
                total_score = tier_bonus + 0.80 * ml_prob + 0.20 * det_c

                if total_score > best_score:
                    best_score = total_score
                    best_candidate = {
                        "sample_id": sample_id,
                        "signer_id": signer_id,
                        "stored_file_path": stored_path,
                        "ml_confidence": round(ml_prob, 4),
                        "l_pts": l_pts,
                        "r_pts": r_pts,
                    }

            if best_candidate:
                c.execute(
                    "UPDATE dataset_samples SET is_master_reference = 1 WHERE sample_id = ?",
                    (best_candidate["sample_id"],),
                )
                l_pts = best_candidate["l_pts"]
                r_pts = best_candidate["r_pts"]
                primary = l_pts if l_pts is not None else r_pts
                secondary = r_pts if (l_pts is not None and r_pts is not None) else None

                templates[gid] = {
                    "gesture_id": gid,
                    "gesture_type": "STATIC",
                    "sample_id": best_candidate["sample_id"],
                    "signer_id": best_candidate["signer_id"],
                    "stored_file_path": best_candidate["stored_file_path"],
                    "ml_confidence": best_candidate["ml_confidence"],
                    "hand_count": hcount or 1,
                    "frames": [
                        {
                            "frame_index": 0,
                            "left_hand_landmarks": primary.round(4).tolist() if primary is not None else [],
                            "right_hand_landmarks": secondary.round(4).tolist() if secondary is not None else [],
                        }
                    ],
                }
                summary_rows.append(
                    (gid, "STATIC", best_candidate["signer_id"], best_candidate["ml_confidence"], best_candidate["stored_file_path"])
                )

        else:
            # DYNAMIC gesture
            if gid not in d_classes:
                continue
            class_idx = d_classes.index(gid)
            rows = dyn_samples_by_gid.get(gid, [])

            valid_items = []
            feats = []
            for sample_id, _, signer_id, stored_path, det_conf in rows:
                f_list = frames_by_sample.get(sample_id, [])
                if len(f_list) < 5:
                    continue
                feat = extract_dynamic_sequence_features(f_list, target_len=24)
                if feat is None or np.any(np.isnan(feat)):
                    continue
                valid_items.append((sample_id, signer_id, stored_path, det_conf, f_list))
                feats.append(feat)

            if not valid_items:
                continue

            X_batch = np.stack(feats, axis=0)
            X_in = d_scaler.transform(X_batch) if d_use_scaled else X_batch
            probs_batch = d_model.predict_proba(X_in)[:, class_idx]

            best_candidate = None
            best_score = -1.0

            for idx_item, (sample_id, signer_id, stored_path, det_conf, f_list) in enumerate(valid_items):
                ml_prob = float(probs_batch[idx_item])
                has_file = bool(
                    stored_path
                    and stored_path != "landmarks_only"
                    and (BASE_DIR / stored_path.lstrip("/\\")).exists()
                )
                is_master = (signer_id == MASTER_SIGNER_ID)

                l_seq = [parse_landmarks(f["left_hand_landmarks"]) for f in f_list]
                r_seq = [parse_landmarks(f["right_hand_landmarks"]) for f in f_list]
                valid_count = sum(1 for l_p, r_p in zip(l_seq, r_seq) if l_p is not None or r_p is not None)
                completeness = min(1.0, valid_count / 24.0)

                prim_seq = l_seq if sum(x is not None for x in l_seq) >= sum(x is not None for x in r_seq) else r_seq
                smoothness = compute_smoothness_score(prim_seq)

                tier_bonus = (2.0 if (is_master and has_file) else (1.0 if has_file else 0.0))
                total_score = tier_bonus + 0.65 * ml_prob + 0.20 * completeness + 0.15 * smoothness

                if total_score > best_score:
                    best_score = total_score
                    best_candidate = {
                        "sample_id": sample_id,
                        "signer_id": signer_id,
                        "stored_file_path": stored_path,
                        "ml_confidence": round(ml_prob, 4),
                        "l_seq": l_seq,
                        "r_seq": r_seq,
                    }

            if best_candidate:
                c.execute(
                    "UPDATE dataset_samples SET is_master_reference = 1 WHERE sample_id = ?",
                    (best_candidate["sample_id"],),
                )
                l_seq = best_candidate["l_seq"]
                r_seq = best_candidate["r_seq"]
                active_pairs = [
                    (lp, rp) for lp, rp in zip(l_seq, r_seq)
                    if lp is not None or rp is not None
                ]
                target_len = 28
                idxs = np.linspace(0, len(active_pairs) - 1, num=target_len).round().astype(int)
                sampled_l = [active_pairs[i][0] for i in idxs]
                sampled_r = [active_pairs[i][1] for i in idxs]

                smooth_l = smooth_hand_sequence(sampled_l)
                smooth_r = smooth_hand_sequence(sampled_r)

                clean_frames = []
                for k in range(target_len):
                    lk = smooth_l[k]
                    rk = smooth_r[k]
                    # Ensure primary hand is always in left_hand_landmarks if only 1 hand is active
                    if not lk and rk:
                        lk, rk = rk, []
                    clean_frames.append({
                        "frame_index": k,
                        "left_hand_landmarks": lk,
                        "right_hand_landmarks": rk,
                    })

                templates[gid] = {
                    "gesture_id": gid,
                    "gesture_type": "DYNAMIC",
                    "sample_id": best_candidate["sample_id"],
                    "signer_id": best_candidate["signer_id"],
                    "stored_file_path": best_candidate["stored_file_path"],
                    "ml_confidence": best_candidate["ml_confidence"],
                    "hand_count": hcount or 1,
                    "frames": clean_frames,
                }
                summary_rows.append(
                    (gid, "DYNAMIC", best_candidate["signer_id"], best_candidate["ml_confidence"], best_candidate["stored_file_path"])
                )

    conn.commit()
    conn.close()

    with open(TEMPLATES_PATH, "w", encoding="utf-8") as f:
        json.dump(templates, f)

    print(f"Successfully selected & synchronized {len(templates)}/45 Master Signer templates!")
    for gid, gtype, sid, conf, fpath in summary_rows:
        print(f"  [{gtype:7s}] {gid:15s} | Signer: {sid} | ML Prob: {conf*100:6.2f}% | File: {fpath}")


if __name__ == "__main__":
    main()
