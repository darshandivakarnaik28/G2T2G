"""
Automated verification script for upgraded ISL Dataset Collector
"""
import sys
import json
import base64
import urllib.request
import urllib.error
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
PROJECT_DIR = Path(__file__).resolve().parent.parent

def send_request(method, endpoint, data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method=method, headers=headers)
    if data:
        if isinstance(data, dict):
            req.add_header("Content-Type", "application/json")
            body = json.dumps(data).encode("utf-8")
        elif isinstance(data, str):
            body = data.encode("utf-8")
        elif isinstance(data, bytes):
            body = data
        else:
            body = data
        req.data = body
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read()
            status = response.status
            try:
                parsed = json.loads(res_body.decode("utf-8"))
            except Exception:
                parsed = res_body.decode("utf-8")
            return status, parsed
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return e.code, err_body

def run_tests():
    print("=== STARTING UPGRADE VERIFICATION ===")

    # 1. Test frontend assets served
    status, html = send_request("GET", "/")
    assert status == 200 and "ISL Dataset Collector" in html, f"Failed root HTML: status={status}"
    print("[PASS] Frontend index.html served with ISL Dataset Collector")

    status, js = send_request("GET", "/components/mediapipe_tracker.js")
    assert status == 200 and "startAutoCollection" in js, "mediapipe_tracker.js missing startAutoCollection"
    print("[PASS] mediapipe_tracker.js served with startAutoCollection")

    status, three_js = send_request("GET", "/components/three_viewer.js")
    assert status == 200 and "buildArticulatedRig" in three_js and "clock" in three_js, "three_viewer.js missing skin rig or clock"
    print("[PASS] three_viewer.js served with skin rig and THREE.Clock")

    # 2. Create a test gesture
    test_gid = "upgrade_test_gesture"
    # Clean up first if exists
    send_request("DELETE", f"/api/gestures/{test_gid}")

    status, g_res = send_request("POST", "/api/gestures", {
        "gesture_id": test_gid,
        "name": "Upgrade Test",
        "english_meaning": "Upgrade Test",
        "kannada_meaning": "ಪರೀಕ್ಷೆ",
        "gesture_type": "STATIC",
        "hand_count": "ONE_HAND",
        "description": "Test gesture for auto-collection & deletion",
        "enabled": True,
        "verification_status": "VERIFIED"
    })
    assert status == 201, f"Failed to create gesture: {status} {g_res}"
    print(f"[PASS] Created test gesture '{test_gid}'")

    # 3. Create a sample with dummy 1x1 image and 21 landmarks
    dummy_png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    dummy_b64 = "data:image/png;base64," + base64.b64encode(dummy_png).decode("ascii")

    # 21 landmarks sample points
    dummy_landmarks = {
        "left_hand_present": False,
        "right_hand_present": True,
        "left_hand_landmarks": [],
        "right_hand_landmarks": [{"id": i, "x": 0.5 + i*0.01, "y": 0.5, "z": 0.0} for i in range(21)],
        "confidence": 0.96
    }

    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body_parts = []
    
    def add_field(name, value):
        body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n")

    add_field("gesture_id", test_gid)
    add_field("signer_id", "S001")
    add_field("landmarks_json", json.dumps(dummy_landmarks))
    add_field("image_base64", dummy_b64)
    add_field("confidence", "0.96")
    add_field("width", "640")
    add_field("height", "480")
    body_parts.append(f"--{boundary}--\r\n")
    form_data = "".join(body_parts).encode("utf-8")

    status, smp = send_request("POST", "/api/samples/webcam-image", data=form_data, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    })
    assert status == 201, f"Failed to create sample: {status} {smp}"
    sample_id = smp["sample_id"]
    stored_path = PROJECT_DIR / smp["stored_file_path"]
    lm_path = PROJECT_DIR / smp["landmark_file_path"]

    assert stored_path.exists(), f"Image file not saved: {stored_path}"
    assert lm_path.exists(), f"Landmark file not saved: {lm_path}"
    print(f"[PASS] Sample '{sample_id}' created; disk files verified on filesystem")

    # 4. Delete the sample and verify disk files are purged (no orphan files)
    status, del_res = send_request("DELETE", f"/api/samples/{sample_id}")
    assert status == 200, f"Failed to delete sample: {status} {del_res}"
    assert not stored_path.exists(), f"Image file was NOT purged on sample delete: {stored_path}"
    assert not lm_path.exists(), f"Landmark file was NOT purged on sample delete: {lm_path}"
    print(f"[PASS] Sample '{sample_id}' deleted; associated files purged cleanly from disk")

    # 5. Test Cascade Deletion: create another sample under gesture, then delete gesture
    status, smp2 = send_request("POST", "/api/samples/webcam-image", data=form_data, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    })
    assert status == 201
    smp2_id = smp2["sample_id"]
    stored2_path = PROJECT_DIR / smp2["stored_file_path"]
    lm2_path = PROJECT_DIR / smp2["landmark_file_path"]
    assert stored2_path.exists() and lm2_path.exists()

    status, del_g = send_request("DELETE", f"/api/gestures/{test_gid}")
    assert status == 200, f"Failed to delete gesture: {status} {del_g}"
    assert not stored2_path.exists(), f"Sample image file still exists after cascade delete: {stored2_path}"
    assert not lm2_path.exists(), f"Sample landmark file still exists after cascade delete: {lm2_path}"
    print(f"[PASS] Gesture '{test_gid}' cascade-deleted: sample and disk files purged")

    print("\n[ALL AUTOMATED UPGRADE CHECKS PASSED]")

if __name__ == "__main__":
    run_tests()
