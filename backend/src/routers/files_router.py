# src/routers/files_router.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi import Body, Query
from src.db import get_session
from src.models import Document
import shutil, os, datetime, uuid
from sqlmodel import select
import json

router = APIRouter()

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_user_from_auth(authorization: str = None):
    # dev-mode simple parsing: token might be "Bearer dev-token" or email
    if not authorization:
        return {"email": "dev-user@example.com"}
    v = authorization.replace("Bearer ", "")
    # if token looks like an email
    if "@" in v:
        return {"email": v}
    return {"email": "dev-user@example.com"}

@router.post("/api/upload")
async def upload_file(file: UploadFile = File(...), authorization: str = None):
    user = get_user_from_auth(authorization)
    filename = f"{int(datetime.datetime.now().timestamp())}_{file.filename}"
    dest = os.path.join(UPLOAD_DIR, filename)
    with open(dest, "wb") as out_f:
        shutil.copyfileobj(file.file, out_f)
    session_id = str(uuid.uuid4())
    doc = Document(filename=filename, uploaded_by=user.get("email"), upload_session_id=session_id, uploaded_at=datetime.datetime.now(datetime.timezone.utc))
    sess = get_session()
    sess.add(doc)
    sess.commit()
    sess.refresh(doc)
    sess.close()
    return {"doc_id": doc.id, "filename": filename, "upload_session_id": session_id}

@router.get("/api/documents")
def list_documents(upload_session_id: str = Query(None), authorization: str = None):
    user = get_user_from_auth(authorization)
    sess = get_session()
    q = select(Document)
    if upload_session_id:
        q = q.where(Document.upload_session_id == upload_session_id)
    else:
        q = q.where(Document.uploaded_by == user.get("email"))
    docs = sess.exec(q).all()
    sess.close()
    return docs
