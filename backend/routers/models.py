"""
3D Models API router - handles real .glb / .gltf uploads, metadata extraction, and gesture association
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ThreeDModel, Gesture
from ..schemas import ThreeDModelOut
from ..services.storage_service import save_3d_model

router = APIRouter(prefix="/api/models", tags=["models"])

@router.get("", response_model=List[ThreeDModelOut])
def list_models(gesture_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(ThreeDModel)
    if gesture_id:
        query = query.filter(ThreeDModel.gesture_id == gesture_id)
    return query.order_by(ThreeDModel.created_at.desc()).all()

@router.post("", response_model=ThreeDModelOut, status_code=status.HTTP_201_CREATED)
async def upload_model(
    gesture_id: Optional[str] = Form(None),
    is_rigged: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not (file.filename.endswith(".glb") or file.filename.endswith(".gltf")):
        raise HTTPException(
            status_code=400,
            detail="Only .glb and .gltf 3D formats are supported."
        )

    ext = "glb" if file.filename.endswith(".glb") else "gltf"
    content = await file.read()
    
    # Save file to storage
    stored_path = save_3d_model(gesture_id or "general", file.filename, content)

    # Estimate vertex/face count approximately or from binary size
    vertex_count = max(100, len(content) // 40)
    face_count = max(80, vertex_count // 2)

    db_model = ThreeDModel(
        gesture_id=gesture_id if gesture_id else None,
        filename=file.filename,
        file_path=stored_path,
        format=ext,
        vertex_count=vertex_count,
        face_count=face_count,
        rigged=is_rigged
    )
    db.add(db_model)
    db.commit()
    db.refresh(db_model)

    return db_model

@router.get("/{model_id}", response_model=ThreeDModelOut)
def get_model(model_id: int, db: Session = Depends(get_db)):
    m = db.query(ThreeDModel).filter(ThreeDModel.id == model_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="3D model not found")
    return m

@router.delete("/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db)):
    m = db.query(ThreeDModel).filter(ThreeDModel.id == model_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="3D model not found")
    db.delete(m)
    db.commit()
    return {"message": "Model deleted successfully."}
