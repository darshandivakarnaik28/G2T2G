"""
End-to-End Acceptance Test matching User Specifications
"""
import sys
import json
import base64
import urllib.request
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
PROJECT_DIR = Path(__file__).resolve().parent.parent

def req(method, path, data=None, headers=None):
    if headers is None: headers = {}
    r = urllib.request.Request(f"{BASE_URL}{path}", method=method, headers=headers)
    if data:
        if isinstance(data, dict):
            r.add_header("Content-Type", "application/json")
            r.data = json.dumps(data).encode("utf-8")
        elif isinstance(data, bytes):
            r.data = data
    try:
        with urllib.request.urlopen(r) as res:
            b = res.read().decode("utf-8")
            try:
                return res.status, json.loads(b)
            except Exception:
                return res.status, b
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")

def run():
    print("--- RUNNING USER ACCEPTANCE SUITE ---")
    
    # 1. Create gesture 'hello_acc', STATIC, ONE_HAND
    gid = "hello_acc"
    req("DELETE", f"/api/gestures/{gid}")  # cleanup if any
    
    st, g = req("POST", "/api/gestures", {
        "gesture_id": gid,
        "name": "Hello Acceptance",
        "english_meaning": "Hello",
        "kannada_meaning": "ನಮಸ್ಕಾರ",
        "gesture_type": "STATIC",
        "hand_count": "ONE_HAND",
        "description": "User Acceptance Test Gesture",
        "enabled": True,
        "verification_status": "VERIFIED"
    })
    assert st == 201
    print("[PASS] Created gesture 'hello_acc'")

    # 2. Add 5 auto-collected samples (representing N-samples)
    boundary = "----BoundaryAccTest123"
    created_samples = []
    
    for i in range(1, 6):
        dummy_png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
        dummy_b64 = "data:image/png;base64," + base64.b64encode(dummy_png).decode("ascii")
        landmarks = {
            "left_hand_present": False,
            "right_hand_present": True,
            "left_hand_landmarks": [],
            "right_hand_landmarks": [{"id": j, "x": 0.5 + (i*0.01) + (j*0.005), "y": 0.5, "z": 0.0} for j in range(21)],
            "confidence": 0.95
        }
        
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"gesture_id\"\r\n\r\n{gid}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"signer_id\"\r\n\r\nS001\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"landmarks_json\"\r\n\r\n{json.dumps(landmarks)}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"image_base64\"\r\n\r\n{dummy_b64}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"confidence\"\r\n\r\n0.95\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"width\"\r\n\r\n640\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"height\"\r\n\r\n480\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")
        
        st, smp = req("POST", "/api/samples/webcam-image", data=body, headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        })
        assert st == 201
        created_samples.append(smp["sample_id"])
    
    print(f"[PASS] Collected {len(created_samples)} samples for signer S001")

    # 3. Verify all samples exist in DB
    st, samples = req("GET", f"/api/samples?gesture_id={gid}")
    assert st == 200 and len(samples) == 5
    print("[PASS] Verified all 5 samples exist in database")

    # 4. Verify landmark sequence format (21 points)
    sample_to_check = created_samples[0]
    st, lm_data = req("GET", f"/api/samples/{sample_to_check}/landmarks")
    assert st == 200
    frames = lm_data.get("frames", [])
    assert len(frames) > 0
    right_lm = frames[0].get("right_hand_landmarks", [])
    assert len(right_lm) == 21, f"Expected 21 landmarks, got {len(right_lm)}"
    print(f"[PASS] Sample {sample_to_check} has exactly 21-joint landmark coordinates")

    # 5. Delete sample #3 and verify 4 remain
    sample_to_del = created_samples[2]
    st, _ = req("DELETE", f"/api/samples/{sample_to_del}")
    assert st == 200
    st, samples_after = req("GET", f"/api/samples?gesture_id={gid}")
    assert len(samples_after) == 4
    print(f"[PASS] Deleted sample {sample_to_del}; exactly 4 samples remain")

    # 6. Cleanup test gesture (cascade)
    st, _ = req("DELETE", f"/api/gestures/{gid}")
    assert st == 200
    st, samples_final = req("GET", f"/api/samples?gesture_id={gid}")
    assert len(samples_final) == 0
    print("[PASS] Cascade deleted gesture and all associated samples")

    print("\n[ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY]")

if __name__ == "__main__":
    run()
