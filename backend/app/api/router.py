from fastapi import APIRouter, Depends

from app.api.dependencies import enforce_csrf
from app.api.routes.annotations import router as annotations_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.keywords import router as keywords_router
from app.api.routes.library import router as library_router
from app.api.routes.personalization import router as personalization_router
from app.api.routes.rag import router as rag_router
from app.api.routes.reader import router as reader_router

api_router = APIRouter(dependencies=[Depends(enforce_csrf)])
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(keywords_router)
api_router.include_router(reader_router)
api_router.include_router(rag_router)
api_router.include_router(annotations_router)
api_router.include_router(documents_router)
api_router.include_router(dashboard_router)
api_router.include_router(library_router)
api_router.include_router(personalization_router)
