"""
Feature Engineering Pipeline for ISL Static and Dynamic Hand Landmark Recognition.

Extracts translation-invariant, scale-invariant, and anatomically meaningful
geometric & kinematic features from 21-point 3D MediaPipe hand landmarks.
"""
import json
import numpy as np
from typing import List, Dict, Any, Optional, Tuple


# Anatomical indices for MediaPipe 21 Hand Landmarks
WRIST = 0
THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP = 1, 2, 3, 4
INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP = 5, 6, 7, 8
MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP = 9, 10, 11, 12
RING_MCP, RING_PIP, RING_DIP, RING_TIP = 13, 14, 15, 16
PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP = 17, 18, 19, 20

FINGERTIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
FINGER_MCPS = [THUMB_CMC, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP]
FINGER_PIPS = [THUMB_MCP, INDEX_PIP, MIDDLE_PIP, RING_PIP, PINKY_PIP]
FINGER_DIPS = [THUMB_IP, INDEX_DIP, MIDDLE_DIP, RING_DIP, PINKY_DIP]


def parse_landmarks(raw_lm: Any) -> Optional[np.ndarray]:
    """
    Parses raw landmark input (JSON string, list of dicts, or list of lists)
    into a (21, 3) float32 numpy array. Returns None if invalid or < 21 points.
    """
    if raw_lm is None:
        return None
    if isinstance(raw_lm, str):
        if len(raw_lm) < 20:
            return None
        try:
            raw_lm = json.loads(raw_lm)
        except Exception:
            return None
    if not isinstance(raw_lm, (list, tuple)) or len(raw_lm) < 21:
        return None

    coords = np.zeros((21, 3), dtype=np.float32)
    try:
        for i in range(21):
            pt = raw_lm[i]
            if isinstance(pt, dict):
                coords[i, 0] = float(pt.get("x", 0.0))
                coords[i, 1] = float(pt.get("y", 0.0))
                coords[i, 2] = float(pt.get("z", 0.0))
            elif isinstance(pt, (list, tuple)) and len(pt) >= 3:
                coords[i, 0] = float(pt[0])
                coords[i, 1] = float(pt[1])
                coords[i, 2] = float(pt[2])
            else:
                return None
    except Exception:
        return None

    # Reject degenerate all-zero or constant dummy landmarks
    if np.allclose(coords, 0.0) or np.max(np.std(coords, axis=0)) < 1e-5:
        return None
    return coords


def extract_single_hand_geometric_features(pts: np.ndarray) -> np.ndarray:
    """
    Given a (21, 3) array of hand landmarks, extracts 124 scale- and translation-invariant
    geometric features describing posture, finger curl, inter-finger distances, and bone angles:
      - 63 wrist-centered, scale-normalized (x, y, z) coordinates
      - 5 wrist-to-fingertip normalized distances
      - 12 thumb-tip to other finger joints distances (pinch / opposition signatures)
      - 10 pairwise fingertip-to-fingertip distances (spread signatures)
      - 5 finger curl ratios (||tip - mcp|| / (||pip - mcp|| + ||dip - pip|| + ||tip - dip||))
      - 5 finger elevation angles (dy between tip and mcp)
      - 24 bone unit vector components for the 4 main fingers + thumb (8 segments x 3D)
    Total = 124 features.
    """
    wrist = pts[WRIST]
    rel = pts - wrist  # (21, 3), wrist at (0, 0, 0)

    # Hand scale: max Euclidean distance from wrist to any landmark
    dists_from_wrist = np.linalg.norm(rel, axis=1)
    scale = float(np.max(dists_from_wrist))
    if scale < 1e-5:
        scale = 1.0

    norm_pts = rel / scale  # (21, 3)
    flat_coords = norm_pts.flatten()  # 63 features

    # 1. Wrist to 5 fingertips distances (5 features)
    wrist_to_tips = dists_from_wrist[FINGERTIPS] / scale

    # 2. Thumb tip (4) to key joints: other tips (8,12,16,20), PIPs (6,10,14,18), MCPs (5,9,13,17) (12 features)
    thumb_tip = norm_pts[THUMB_TIP]
    thumb_targets = [
        INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP,
        INDEX_PIP, MIDDLE_PIP, RING_PIP, PINKY_PIP,
        INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP
    ]
    thumb_dists = np.array([
        np.linalg.norm(thumb_tip - norm_pts[idx]) for idx in thumb_targets
    ], dtype=np.float32)

    # 3. Pairwise distances among all 5 fingertips (5*4/2 = 10 features)
    tip_pairs = []
    for i in range(len(FINGERTIPS)):
        for j in range(i + 1, len(FINGERTIPS)):
            tip_pairs.append(np.linalg.norm(norm_pts[FINGERTIPS[i]] - norm_pts[FINGERTIPS[j]]))
    tip_pair_dists = np.array(tip_pairs, dtype=np.float32)

    # 4. Finger extension / curl ratios for 5 fingers (5 features)
    curl_ratios = np.zeros(5, dtype=np.float32)
    elevation_dys = np.zeros(5, dtype=np.float32)
    for f_idx in range(5):
        mcp = norm_pts[FINGER_MCPS[f_idx]]
        pip = norm_pts[FINGER_PIPS[f_idx]]
        dip = norm_pts[FINGER_DIPS[f_idx]]
        tip = norm_pts[FINGERTIPS[f_idx]]

        direct_len = np.linalg.norm(tip - mcp)
        chain_len = (
            np.linalg.norm(pip - mcp) +
            np.linalg.norm(dip - pip) +
            np.linalg.norm(tip - dip) + 1e-6
        )
        curl_ratios[f_idx] = direct_len / chain_len
        elevation_dys[f_idx] = tip[1] - mcp[1]

    # 5. Unit direction vectors for 8 key bone segments (8 * 3 = 24 features)
    segments = [
        (THUMB_CMC, THUMB_MCP), (THUMB_IP, THUMB_TIP),
        (INDEX_MCP, INDEX_PIP), (INDEX_DIP, INDEX_TIP),
        (MIDDLE_MCP, MIDDLE_PIP), (MIDDLE_DIP, MIDDLE_TIP),
        (RING_MCP, RING_TIP), (PINKY_MCP, PINKY_TIP)
    ]
    bone_vecs = []
    for s_start, s_end in segments:
        v = norm_pts[s_end] - norm_pts[s_start]
        n = np.linalg.norm(v)
        bone_vecs.extend((v / (n + 1e-6)).tolist())
    bone_vecs_arr = np.array(bone_vecs, dtype=np.float32)

    return np.concatenate([
        flat_coords,      # 63
        wrist_to_tips,    # 5
        thumb_dists,      # 12
        tip_pair_dists,   # 10
        curl_ratios,      # 5
        elevation_dys,    # 5
        bone_vecs_arr     # 24
    ])  # Total: 124 features


def extract_static_features(left_raw: Any, right_raw: Any) -> Optional[np.ndarray]:
    """
    Extracts static gesture feature vector (124 features) from a single frame.
    Canonicalizes primary active hand so one-handed static signs work seamlessly
    regardless of which hand slot MediaPipe assigns.
    """
    l_pts = parse_landmarks(left_raw)
    r_pts = parse_landmarks(right_raw)

    if l_pts is None and r_pts is None:
        return None

    # In the collected static dataset, 99.9% of samples have the primary hand in l_pts
    primary_pts = l_pts if l_pts is not None else r_pts
    return extract_single_hand_geometric_features(primary_pts)


def extract_frame_kinematic_vector(left_raw: Any, right_raw: Any) -> Optional[np.ndarray]:
    """
    Extracts a 158-dimensional per-frame feature vector for dynamic gesture sequences:
      - Primary hand geometric posture (63 wrist-centered normalized coords + 17 distances = 80)
      - Primary hand raw screen wrist position (x, y, z) (3)
      - Secondary hand geometric posture (63 wrist-centered normalized coords + 5 tip dists = 68)
      - Secondary hand raw screen wrist position (x, y, z) (3)
      - Inter-hand relative vector (wrist2 - wrist1) (3)
      - Two-hands active indicator (1)
    Total = 158 features per frame.
    Returns None if neither hand is present in this frame.
    """
    l_pts = parse_landmarks(left_raw)
    r_pts = parse_landmarks(right_raw)

    if l_pts is None and r_pts is None:
        return None

    both_present = 1.0 if (l_pts is not None and r_pts is not None) else 0.0
    primary = l_pts if l_pts is not None else r_pts
    secondary = r_pts if (l_pts is not None and r_pts is not None) else None

    # Primary hand features (80 + 3 = 83)
    p_wrist = primary[WRIST]
    p_rel = primary - p_wrist
    p_dists = np.linalg.norm(p_rel, axis=1)
    p_scale = max(float(np.max(p_dists)), 1e-5)
    p_norm = (p_rel / p_scale).flatten()  # 63

    p_tip_dists = p_dists[FINGERTIPS] / p_scale  # 5
    p_thumb_tip = (p_rel / p_scale)[THUMB_TIP]
    p_thumb_to_tips = np.array([
        np.linalg.norm(p_thumb_tip - (p_rel / p_scale)[idx])
        for idx in [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP, INDEX_PIP, MIDDLE_PIP, RING_PIP, PINKY_PIP]
    ], dtype=np.float32)  # 8
    p_curls = np.array([
        np.linalg.norm((p_rel / p_scale)[FINGERTIPS[i]] - (p_rel / p_scale)[FINGER_MCPS[i]])
        for i in range(4)
    ], dtype=np.float32)  # 4

    # Secondary hand features (68 + 3 + 3 = 74)
    if secondary is not None:
        s_wrist = secondary[WRIST]
        s_rel = secondary - s_wrist
        s_dists = np.linalg.norm(s_rel, axis=1)
        s_scale = max(float(np.max(s_dists)), 1e-5)
        s_norm = (s_rel / s_scale).flatten()  # 63
        s_tip_dists = s_dists[FINGERTIPS] / s_scale  # 5
        inter_wrist = s_wrist - p_wrist  # 3
    else:
        s_wrist = np.zeros(3, dtype=np.float32)
        s_norm = np.zeros(63, dtype=np.float32)
        s_tip_dists = np.zeros(5, dtype=np.float32)
        inter_wrist = np.zeros(3, dtype=np.float32)

    return np.concatenate([
        p_norm,           # 63
        p_tip_dists,      # 5
        p_thumb_to_tips,  # 8
        p_curls,          # 4
        p_wrist,          # 3
        s_norm,           # 63
        s_tip_dists,      # 5
        s_wrist,          # 3
        inter_wrist,      # 3
        np.array([both_present], dtype=np.float32)  # 1
    ])  # Total: 158 features


def resample_sequence(seq: np.ndarray, target_len: int = 24) -> np.ndarray:
    """
    Linearly interpolates a (T, D) sequence of active frames to (target_len, D).
    """
    T, D = seq.shape
    if T == target_len:
        return seq
    if T == 1:
        return np.repeat(seq, target_len, axis=0)

    old_indices = np.linspace(0, T - 1, num=T)
    new_indices = np.linspace(0, T - 1, num=target_len)
    resampled = np.zeros((target_len, D), dtype=np.float32)
    for d in range(D):
        resampled[:, d] = np.interp(new_indices, old_indices, seq[:, d])
    return resampled


def extract_dynamic_sequence_features(frames: List[Dict[str, Any]], target_len: int = 24) -> Optional[np.ndarray]:
    """
    Given a list of frame dicts (each with 'left_hand_landmarks' and 'right_hand_landmarks'),
    filters to active frames, resamples to `target_len` frames, and computes a comprehensive
    spatio-temporal feature vector capturing:
      1. Start posture & position (mean of first quarter of frames) - 158 features
      2. Middle posture & position (mean of middle half of frames) - 158 features
      3. End posture & position (mean of last quarter of frames) - 158 features
      4. Global temporal statistics: Mean (158), Std (158), Max-Min Range (158)
      5. Overall displacement vector (End - Start) (158)
      6. First-half velocity vs Second-half velocity of primary/secondary wrists & fingertips (60)
      7. Temporal trajectory keyframes (6 evenly spaced keyframes across primary hand & wrist) (6 * 30 = 180)
      8. Sequence metadata: two-hand active ratio, active frame ratio, mean wrist speed (4)
    Total = 1,350 spatio-temporal features.
    """
    if not frames:
        return None

    # Fast pre-filter for non-empty frames before heavy JSON parsing
    candidate_frames = []
    for f in frames:
        l_raw = f.get("left_hand_landmarks")
        r_raw = f.get("right_hand_landmarks")
        lm_raw = f.get("landmarks")
        has_l = (isinstance(l_raw, str) and len(l_raw) > 25) or (isinstance(l_raw, list) and len(l_raw) >= 21)
        has_r = (isinstance(r_raw, str) and len(r_raw) > 25) or (isinstance(r_raw, list) and len(r_raw) >= 21)
        has_lm = (isinstance(lm_raw, str) and len(lm_raw) > 25) or (isinstance(lm_raw, list) and len(lm_raw) >= 21)
        if has_l or has_r or has_lm:
            candidate_frames.append(f)

    if not candidate_frames:
        return None

    active_ratio = float(len(candidate_frames)) / max(1.0, float(len(frames)))

    # Subsample candidate frames to at most 32 evenly-spaced frames before parsing
    if len(candidate_frames) > 32:
        sub_idx = np.linspace(0, len(candidate_frames) - 1, num=32, dtype=int)
        candidate_frames = [candidate_frames[i] for i in sub_idx]

    active_vecs = []
    for f in candidate_frames:
        left_raw = f.get("left_hand_landmarks")
        right_raw = f.get("right_hand_landmarks")
        if not left_raw and not right_raw and f.get("landmarks"):
            left_raw = f.get("landmarks")
        vec = extract_frame_kinematic_vector(left_raw, right_raw)
        if vec is not None:
            active_vecs.append(vec)

    if len(active_vecs) == 0:
        return None

    seq_raw = np.stack(active_vecs, axis=0)  # (T_active, 158)
    seq = resample_sequence(seq_raw, target_len=target_len)  # (24, 158)

    # Make wrist trajectories translation-invariant (relative to initial frame wrist position)
    # so live camera recognition works regardless of where the user sits in the camera frame
    p_wrist_origin = np.copy(seq[0:1, 80:83])
    seq[:, 80:83] = seq[:, 80:83] - p_wrist_origin
    # Secondary wrist relative to primary wrist origin when secondary hand is present
    has_sec_mask = seq[:, 157] > 0.5
    if np.any(has_sec_mask):
        seq[has_sec_mask, 151:154] = seq[has_sec_mask, 151:154] - p_wrist_origin

    q1 = max(1, target_len // 4)
    q3 = target_len - q1

    start_feat = np.mean(seq[:q1], axis=0)          # 158
    mid_feat = np.mean(seq[q1:q3], axis=0)          # 158
    end_feat = np.mean(seq[q3:], axis=0)            # 158

    mean_feat = np.mean(seq, axis=0)                # 158
    std_feat = np.std(seq, axis=0)                  # 158
    range_feat = np.max(seq, axis=0) - np.min(seq, axis=0)  # 158
    disp_feat = end_feat - start_feat               # 158

    # Velocities (frame-to-frame differences)
    diffs = np.diff(seq, axis=0)  # (23, 158)
    half = len(diffs) // 2
    # Select key dynamic indices: primary fingertips + wrist + secondary wrist + inter_wrist (30 indices)
    key_indices = [
        THUMB_TIP * 3, THUMB_TIP * 3 + 1, THUMB_TIP * 3 + 2,
        INDEX_TIP * 3, INDEX_TIP * 3 + 1, INDEX_TIP * 3 + 2,
        MIDDLE_TIP * 3, MIDDLE_TIP * 3 + 1, MIDDLE_TIP * 3 + 2,
        RING_TIP * 3, RING_TIP * 3 + 1, RING_TIP * 3 + 2,
        PINKY_TIP * 3, PINKY_TIP * 3 + 1, PINKY_TIP * 3 + 2,
        63, 64, 65, 66, 67,           # p_tip_dists
        80, 81, 82,                   # p_wrist (x, y, z)
        151, 152, 153,                # s_wrist (x, y, z)
        154, 155, 156,                # inter_wrist (dx, dy, dz)
        157                           # both_present
    ]
    vel_first_half = np.mean(diffs[:half, key_indices], axis=0)   # 30
    vel_second_half = np.mean(diffs[half:, key_indices], axis=0)  # 30

    # 6 evenly-spaced keyframes of the 30 key indices (6 * 30 = 180)
    kf_idx = np.linspace(0, target_len - 1, num=6, dtype=int)
    keyframes_flat = seq[kf_idx][:, key_indices].flatten()  # 180

    # Summary ratios (4)
    two_hand_ratio = float(np.mean(seq[:, 157]))
    wrist_vel = np.linalg.norm(diffs[:, 80:83], axis=1)
    mean_wrist_speed = float(np.mean(wrist_vel))
    max_wrist_speed = float(np.max(wrist_vel))

    meta_feat = np.array([
        two_hand_ratio, active_ratio, mean_wrist_speed, max_wrist_speed
    ], dtype=np.float32)

    return np.concatenate([
        start_feat,       # 158
        mid_feat,         # 158
        end_feat,         # 158
        mean_feat,        # 158
        std_feat,         # 158
        range_feat,       # 158
        disp_feat,        # 158
        vel_first_half,   # 30
        vel_second_half,  # 30
        keyframes_flat,   # 180
        meta_feat         # 4
    ])  # Total: 1,350 features
