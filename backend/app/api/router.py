from fastapi import APIRouter

from app.api.routes.annotations import router as annotations_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.keywords import router as keywords_router
from app.api.routes.rag import router as rag_router
from app.api.routes.reader import router as reader_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(keywords_router)
api_router.include_router(reader_router)
api_router.include_router(rag_router)
api_router.include_router(annotations_router)
api_router.include_router(documents_router)
