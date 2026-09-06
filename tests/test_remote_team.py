import io
import zipfile
import pytest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

class TestSigners:
    def test_list_signers(self, client):
        r = client.get("/api/signers")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 5
        s_ids = [s["signer_id"] for s in data]
        assert "S001" in s_ids
        assert "S002" in s_ids

    def test_create_and_get_signer(self, client):
        r = client.post("/api/signers", json={"signer_id": "S999", "display_name": "Tester 999"})
        assert r.status_code in (200, 201, 400)
        
        r2 = client.get("/api/signers/S999")
        assert r2.status_code == 200
        assert r2.json()["signer_id"] == "S999"

class TestAssignments:
    def test_list_assignments(self, client):
        r = client.get("/api/assignments?signer_id=S001")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert data[0]["target_samples"] == 50

    def test_create_assignment_default_50(self, client):
        r = client.post("/api/assignments", json={
            "signer_id": "S004",
            "gesture_id": "book",
            "target_samples": 50
        })
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["target_samples"] == 50
        assert data["signer_id"] == "S004"
        assert data["gesture_id"] == "book"

class TestSampleUploadAndAutoSync:
    def test_upload_sample_and_sync(self, client):
        tiny_jpeg = bytes([
            0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,
            0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,
            0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,
            0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
            0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,
            0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,
            0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,
            0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
            0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,
            0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,
            0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,
            0x09,0x0A,0x0B,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,
            0x00,0xFB,0xFF,0xD9
        ])
        r = client.post(
            "/api/samples/webcam-image",
            data={
                "gesture_id": "water",
                "signer_id": "S005",
                "landmarks_json": '{"right_hand_landmarks": [{"x":0.5,"y":0.5,"z":0.0}]}',
                "handedness": "RIGHT",
                "detection_confidence": "0.95"
            },
            files={
                "image_file": ("test.jpg", io.BytesIO(tiny_jpeg), "image/jpeg")
            }
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["signer_id"] == "S005"
        assert data["gesture_id"] == "water"
        assert data["handedness"] == "RIGHT"

class TestBreakdownEndpoints:
    def test_gesture_dataset_breakdown(self, client):
        r = client.get("/api/gestures/water/dataset")
        assert r.status_code == 200
        data = r.json()
        assert data["gesture_id"] == "water"
        assert "signers" in data
        assert isinstance(data["signers"], list)

    def test_signer_dataset_breakdown(self, client):
        r = client.get("/api/signers/S001/dataset")
        assert r.status_code == 200
        data = r.json()
        assert data["signer_id"] == "S001"
        assert "assigned_gestures" in data

class TestDashboardStats:
    def test_dashboard_metrics(self, client):
        r = client.get("/api/dashboard/stats")
        assert r.status_code == 200
        data = r.json()
        assert "total_gestures" in data
        assert "total_signers" in data
        assert "completed_assignments" in data
        assert "pending_assignments" in data

class TestExport:
    def test_export_zip(self, client):
        r = client.get("/api/dataset/export")
        assert r.status_code == 200
        assert "application/zip" in r.headers.get("content-type", "")
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert any("signers.csv" in n for n in names)
        assert any("assignments.csv" in n for n in names)

