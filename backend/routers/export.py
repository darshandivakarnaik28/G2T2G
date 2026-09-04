"""
Dataset Export router - generates ZIP packages for ML workflows
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.export_service import create_dataset_zip, BASE_DIR

router = APIRouter(prefix="/api/dataset", tags=["export"])

@router.get("/export")
def export_dataset(db: Session = Depends(get_db)):
    try:
        rel_zip_path = create_dataset_zip(db)
        full_path = BASE_DIR / rel_zip_path
        if not full_path.exists():
            raise HTTPException(status_code=500, detail="Could not generate ZIP package.")

        filename = os.path.basename(full_path)
        return FileResponse(
            path=str(full_path),
            filename=filename,
            media_type="application/zip"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
