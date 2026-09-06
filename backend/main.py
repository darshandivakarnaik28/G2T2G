"""
FastAPI Backend Application Entrypoint for Centralized Remote ISL Dataset Collector
"""
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .database import engine, Base, SessionLocal
from .models import Gesture, ThreeDModel, Signer, CollectionAssignment
from .services.storage_service import init_storage, STORAGE_DIR, BASE_DIR
from .routers import gestures, samples, models, dashboard, training_readiness, export, signers, assignments

# Ensure storage directories exist at import time
init_storage()

# Ensure tables and storage are created
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables (PostgreSQL or SQLite)
    Base.metadata.create_all(bind=engine)
    # Ensure handedness column exists for existing SQLite databases
    ensure_schema_compatibility()
    # Seed initial gestures and team signers if database is fresh
    seed_initial_data()
    yield

def ensure_schema_compatibility():
    """Ensure newly added columns exist in existing database schemas."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                res = conn.execute(text("PRAGMA table_info(dataset_samples)"))
                cols = [r[1] for r in res.fetchall()]
                if cols and "handedness" not in cols:
                    conn.execute(text("ALTER TABLE dataset_samples ADD COLUMN handedness VARCHAR DEFAULT 'RIGHT'"))
                    conn.commit()
    except Exception as e:
        print(f"Schema compatibility check notice: {e}")

def seed_initial_data():
    db = SessionLocal()
    try:
        # 1. Seed initial ISL gestures if not present
        initial_gestures = [
            Gesture(
                gesture_id="hello",
                name="Hello",
                english_meaning="Hello / Greetings",
                kannada_meaning="ನಮಸ್ಕಾರ",
                gesture_type="DYNAMIC",
                hand_count="ONE_HAND",
                description="Open hand wave side-to-side or hand moving from forehead outward.",
                enabled=True,
                verification_status="VERIFIED"
            ),
            Gesture(
                gesture_id="water",
                name="Water",
                english_meaning="Water",
                kannada_meaning="ನೀರು",
                gesture_type="STATIC",
                hand_count="ONE_HAND",
                description="Thumb of 'W' hand taps chin or cupped hand brought toward mouth.",
                enabled=True,
                verification_status="VERIFIED"
            ),
            Gesture(
                gesture_id="thank_you",
                name="Thank You",
                english_meaning="Thank You / Gratitude",
                kannada_meaning="ಧನ್ಯವಾದಗಳು",
                gesture_type="DYNAMIC",
                hand_count="ONE_HAND",
                description="Flat fingers touching chin and sweeping outward toward the observer.",
                enabled=True,
                verification_status="VERIFIED"
            ),
            Gesture(
                gesture_id="food",
                name="Food",
                english_meaning="Food / Eating",
                kannada_meaning="ಊಟ",
                gesture_type="STATIC",
                hand_count="ONE_HAND",
                description="Fingertips clustered together brought repeatedly towards lips.",
                enabled=True,
                verification_status="VERIFIED"
            ),
            Gesture(
                gesture_id="help",
                name="Help",
                english_meaning="Help / Assistance",
                kannada_meaning="ಸಹಾಯ",
                gesture_type="DYNAMIC",
                hand_count="TWO_HANDS",
                description="Closed fist with thumb up placed on open flat palm and lifted together.",
                enabled=True,
                verification_status="PENDING_REVIEW"
            ),
            Gesture(
                gesture_id="book",
                name="Book",
                english_meaning="Book / Reading",
                kannada_meaning="ಪುಸ್ತಕ",
                gesture_type="STATIC",
                hand_count="TWO_HANDS",
                description="Palms pressed together side-by-side opening outward like opening book pages.",
                enabled=True,
                verification_status="VERIFIED"
            )
        ]
        for g in initial_gestures:
            if not db.query(Gesture).filter(Gesture.gesture_id == g.gesture_id).first():
                db.add(g)
        db.commit()

        # 2. Seed initial team signers if not present
        initial_signers = [
            Signer(signer_id="S001", display_name="Team Lead (S001)"),
            Signer(signer_id="S002", display_name="Signer 2 (S002)"),
            Signer(signer_id="S003", display_name="Signer 3 (S003)"),
            Signer(signer_id="S004", display_name="Signer 4 (S004)"),
            Signer(signer_id="S005", display_name="Signer 5 (S005)"),
        ]
        for s in initial_signers:
            if not db.query(Signer).filter(Signer.signer_id == s.signer_id).first():
                db.add(s)
        db.commit()

        # 3. Seed initial collection assignments with default target = 50
        initial_assignments = [
            CollectionAssignment(signer_id="S001", gesture_id="hello", target_samples=50),
            CollectionAssignment(signer_id="S001", gesture_id="water", target_samples=50),
            CollectionAssignment(signer_id="S001", gesture_id="thank_you", target_samples=50),
            CollectionAssignment(signer_id="S002", gesture_id="hello", target_samples=50),
            CollectionAssignment(signer_id="S002", gesture_id="water", target_samples=50),
            CollectionAssignment(signer_id="S002", gesture_id="thank_you", target_samples=50),
            CollectionAssignment(signer_id="S003", gesture_id="hello", target_samples=50),
            CollectionAssignment(signer_id="S003", gesture_id="water", target_samples=50),
            CollectionAssignment(signer_id="S003", gesture_id="thank_you", target_samples=50),
        ]
        for a in initial_assignments:
            if not db.query(CollectionAssignment).filter(
                CollectionAssignment.signer_id == a.signer_id,
                CollectionAssignment.gesture_id == a.gesture_id
            ).first():
                db.add(a)
        db.commit()

    finally:
        db.close()

app = FastAPI(
    title="Centralized ISL Dataset Collector API",
    description="Centralized remote dataset collection system for Indian Sign Language (ISL)",
    version="3.0.0",
    lifespan=lifespan
)

# Robust CORS configuration for remote browser connections
origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5500",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(gestures.router)
app.include_router(signers.router)
app.include_router(assignments.router)
app.include_router(samples.router)
app.include_router(models.router)
app.include_router(dashboard.router)
app.include_router(training_readiness.router)
app.include_router(export.router)

# Mount central storage folder for media serving
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")

# Mount frontend directory at root (after API routers)
FRONTEND_DIR = BASE_DIR / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
