from fastapi import APIRouter

from . import serp

router = APIRouter()

# Mount SERP routes under /api/serp
router.include_router(serp.router)

