# ISL Dataset Collector - Production System

A complete dataset collection and processing pipeline for Indian Sign Language (ISL), integrating real-time **MediaPipe Hand Landmarker**, a **Python FastAPI** backend, **SQLite** database with **SQLAlchemy**, persistent filesystem storage, **Three.js** 3D rigged hand visualization, and ML-ready dataset export.

---

## 1. System Architecture

- **Backend**: Python FastAPI with SQLite database (`isl_dataset.db`) and SQLAlchemy ORM.
- **Frontend**: Dark AI/ML Dashboard UI, WebRTC camera streaming, real MediaPipe 21-hand landmark detection (`@mediapipe/hands`), Three.js GLTF/GLB loader & 21-joint articulated rig.
- **Storage**: Organized local filesystem (`storage/gestures/`, `storage/images/`, `storage/videos/`, `storage/landmarks/`, `storage/models/`, `storage/exports/`).
- **ML Ready**: Exports raw JSON landmarks + 128-feature vectors per frame (Left 63 + Right 63 + 2 presence flags) in structured ZIP packages.

---

## 2. Quick Start Instructions

### Prerequisites
- Python 3.10+ (Tested with Python 3.13)
- Webcam (built-in or USB)

### 1. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Start the Application
Run the FastAPI application from the project root:
```powershell
python -m uvicorn backend.main:app --reload --port 8000
```

### 3. Open the Collector
Open your browser and navigate to:
👉 **[http://localhost:8000/](http://localhost:8000/)**

Interactive FastAPI Swagger docs are available at:
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

---

## 3. Workflows

### Static Gesture Collection (Image / Webcam Pose)
1. Navigate to **Collect Dataset**.
2. Choose a static gesture (e.g. *Water / ನೀರು*) and specify the **Signer ID** (e.g. `S001`).
3. Select **Option B (Capture Webcam Pose)** & allow camera access.
4. Position your hand in front of the camera:
   - MediaPipe detects up to 2 hands in real-time.
   - 21 landmark points and bone connections follow your physical hand with real FPS and confidence score.
5. Click **Capture Sample**:
   - Captures frame and verifies 21 landmarks.
   - Maps detected coordinates directly to the 3D hand rig in the interactive viewport.
6. Click **Save Sample to Dataset**:
   - Saves image to `storage/images/`.
   - Saves 21-landmark array to `storage/landmarks/`.
   - Inserts record into SQLite `DatasetSample` and `LandmarkSequence` tables.
   - Real dashboard statistics and sample counts update immediately.

### Dynamic Gesture Collection (Webcam Recording)
1. Choose a dynamic gesture (e.g. *Hello / ನಮಸ್ಕಾರ* or *Thank You / ಧನ್ಯವಾದಗಳು*).
2. Click **Start Recording**:
   - Records real video stream using `MediaRecorder`.
   - Captures frame-by-frame timestamps, handedness, and 21 landmark points.
3. Click **Stop Recording**:
   - Generates video file and temporal landmark sequence.
   - Loads the 3D Hand Animation Viewer with timeline player and scrubber.
4. Click **Save Dynamic Sample to Dataset**:
   - Persists video to `storage/videos/` and sequence JSON to `storage/landmarks/`.

### 3D Models Management
- Navigate to **3D Models**.
- Upload custom `.glb` or `.gltf` hand model files and link to a gesture.
- Inspect models in the Three.js 3D viewport with OrbitControls (rotate, zoom, pan).

### Training Readiness & Dataset Export
- **Training Readiness Page**: Real database audit showing sample counts, unique signers, valid vs low-confidence samples, and ML-readiness per gesture.
- **Export Dataset Button**: Downloads a complete ZIP bundle containing:
  - `gestures.csv`
  - `samples.csv`
  - Organized folders per gesture (`images/`, `videos/`, `landmarks/`)
  - `ml_features/`: Preprocessed 128-feature vectors per frame ready for model training.
