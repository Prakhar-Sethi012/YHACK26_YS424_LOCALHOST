from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from aegis_backend.api.routers import benchmark, grid, incidents, plan, simulation
from aegis_backend.db.session import init_models


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_models()
    yield


app = FastAPI(title="AEGIS-NAV Backend 2", version="0.1.0", lifespan=lifespan)

app.include_router(grid.router)
app.include_router(plan.router)
app.include_router(simulation.router)
app.include_router(incidents.router)
app.include_router(benchmark.router)


@app.exception_handler(RuntimeError)
async def runtime_error_handler(request: Request, exc: RuntimeError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
