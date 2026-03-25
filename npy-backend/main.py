from utils.logger import configure_logger, logger
import sys
import threading
import os


def _start_http_server():
    """Run FastAPI/uvicorn HTTP server for synchronous endpoints (e.g. brand description)."""
    import uvicorn
    from fastapi import FastAPI
    from modules.brand_onboarding.router import router as brand_onboarding_router
    from modules.module_A.content_audit.router import router as content_audit_router

    app = FastAPI(title="NPY Backend HTTP API", docs_url=None, redoc_url=None)
    app.include_router(brand_onboarding_router)
    app.include_router(content_audit_router)

    port = int(os.getenv("NPY_HTTP_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")


def main():
    configure_logger()
    logger.info("="*80)
    logger.info("🚀 NPY BACKEND STARTING - Queue Worker (parallel job processing)")
    logger.info("="*80)
    logger.info(f"📍 Python: {sys.version.split()[0]}")
    logger.info("📦 Modules enabled: A (Crawler), B (Schema), C (AEO), D (Content), E (Brand), F (Competitor AI)")
    logger.info("🔄 Processing mode: Parallel with spawn context (Twisted safe)")
    logger.info("🌐 HTTP API: FastAPI on port 8001 (brand-onboarding endpoints)")
    logger.info("="*80)

    # Start HTTP server in a daemon thread — dies when the main process exits
    http_thread = threading.Thread(target=_start_http_server, daemon=True, name="http-api")
    http_thread.start()

    from workers.queue_worker import start_queue_worker
    start_queue_worker()


if __name__ == "__main__":
    main()

