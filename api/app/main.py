from __future__ import annotations

import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.app.config import get_settings
from api.app.logging_config import configure_logging
from api.app.routes import router


app = FastAPI(
    title="ComercioBI API",
    version="14.14B-v1",
    description=(
        "Serving API para pronósticos, recomendaciones e insights "
        "multiempresa de ComercioBI."
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.include_router(router)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid4())
    started = time.perf_counter()

    response = await call_next(request)

    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.2f}"

    logging.getLogger("comerciabi.api").info(
        "%s %s -> %s %.2fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        extra={"request_id": request_id},
    )
    return response


try:
    settings = get_settings()
    configure_logging(settings.log_level)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "OPTIONS"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "X-Empresa-Id",
                "X-Request-Id",
            ],
        )
except Exception:
    configure_logging("INFO")
