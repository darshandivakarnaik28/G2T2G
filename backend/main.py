"""
FastAPI Backend Application Entrypoint for ISL Dataset Collector
"""
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .database import engine, Base, SessionLocal
from .models import Gesture, ThreeDModel
from .services.storage_service import init_storage, STORAGE_DIR, BASE_DIR
from .routers import gestures, samples, models, dashboard, training_readiness, export

# Ensure storage directories exist at import time
init_storage()

# Ensure tables and storage are created
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite tables
    Base.metadata.create_all(bind=engine)
    # Seed initial gestures if database is fresh
    seed_initial_gestures()
    yield

def seed_initial_gestures():
    db = SessionLocal()
    try:
        count = db.query(Gesture).count()
        if count == 0:
            initial = [
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
            db.add_all(initial)
            db.commit()
            print("Seeded initial ISL gestures in SQLite database.")
    finally:
        db.close()

app = FastAPI(
    title="ISL Dataset Collector API",
    description="Real dataset collection and processing pipeline for Indian Sign Language (ISL)",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration
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
app.include_router(samples.router)
app.include_router(models.router)
app.include_router(dashboard.router)
app.include_router(training_readiness.router)
app.include_router(export.router)

# Mount local storage folder for media serving
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")

# Mount frontend directory at root (after API routers)
FRONTEND_DIR = BASE_DIR / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

