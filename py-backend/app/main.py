from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
import uvicorn
import os
import asyncio
from concurrent.futures import ProcessPoolExecutor
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables from .env file
load_dotenv()

from .services.module_B.models import ExtractHtmlRequest, ExtractResponse
from .services.module_B.keyword_extraction import extract_keywords_from_html
from .services.module_B.nlp_utils import init_nlp

# Import routes after environment is loaded
from .routes.module_C import aeo
from .routes.module_E import sentiment
from .routes.module_A import router as module_a_router

# Verify OpenAI API key is loaded
if not os.getenv('OPENAI_API_KEY'):
    print("⚠️  WARNING: OPENAI_API_KEY not found in environment variables")
    print("   Create a .env file with: OPENAI_API_KEY=your_key_here")
    print("   See ENVIRONMENT_SETUP.md for details")
else:
    print("✅ OpenAI API key loaded successfully")

# Initialize spaCy model
init_nlp()

# -----------------
# Concurrency setup
# -----------------
_WORKERS = min(32, (os.cpu_count() or 4))
_EXECUTOR = ProcessPoolExecutor(max_workers=_WORKERS)
_SEMAPHORE = asyncio.Semaphore(_WORKERS * 2)

def _extract_task(html: str, url: str, final_url: str, lang_guess: str):
    """Synchronous wrapper executed in a worker process."""
    return extract_keywords_from_html(
        html=html,
        url=url,
        final_url=final_url,
        lang_guess=lang_guess,
    )

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="SEO Analysis API",
    description="SEO keyword extraction and AEOCHECKER analysis",
    version="1.0.0"
)

# Add rate limiter to app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Include AEOCHECKER routes
app.include_router(aeo.router)
app.include_router(sentiment.router)

# Include Module A routes (SERP and future module A APIs)
app.include_router(module_a_router)

# Security: Add security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "SEO Keyword Extractor API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "keyword-extractor"}

@app.post("/extract_html", response_model=ExtractResponse)
async def extract_html(request: ExtractHtmlRequest):
    """
    Extract keywords from HTML content with hierarchical structure
    """
    try:
        # Validate HTML content
        if not request.html or len(request.html.strip()) == 0:
            raise HTTPException(status_code=400, detail="HTML content is empty")
        
        # Limit HTML size (configurable; default 5MB)
        try:
            max_html_mb = float(os.getenv("MAX_HTML_MB", "5"))
        except ValueError:
            max_html_mb = 5.0
        max_bytes = int(max_html_mb * 1024 * 1024)
        if len(request.html) > max_bytes:
            raise HTTPException(status_code=400, detail=f"HTML content too large (max {int(max_html_mb)}MB)")
        
        # Extract keywords (CPU-bound) in process pool, bounded by semaphore
        async with _SEMAPHORE:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                _EXECUTOR,
                _extract_task,
                request.html,
                request.url,
                request.final_url,
                request.lang_guess,
            )
        
        return ExtractResponse(**result)
        
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
