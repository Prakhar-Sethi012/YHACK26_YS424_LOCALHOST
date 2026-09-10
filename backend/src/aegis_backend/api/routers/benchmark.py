from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis_backend.api.schemas_db import (
    BenchmarkAlgorithmSummary,
    BenchmarkRecordRequest,
    BenchmarkRecordResponse,
    BenchmarkSummaryResponse,
)
from aegis_backend.db.models import BenchmarkRun
from aegis_backend.db.session import get_session

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


@router.post("/record", response_model=BenchmarkRecordResponse)
async def record_benchmark(
    req: BenchmarkRecordRequest, session: AsyncSession = Depends(get_session)
) -> BenchmarkRecordResponse:
    run = BenchmarkRun(
        scenario_name=req.scenario_name,
        algorithm=req.algorithm,
        path_length=req.path_length,
        total_energy_wh=req.total_energy_wh,
        avg_latency_ms=req.avg_latency_ms,
        replans_count=req.replans_count,
        collisions_avoided=req.collisions_avoided,
        recorded_at=dt.datetime.now(dt.timezone.utc),
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)

    return BenchmarkRecordResponse(
        id=run.id,
        scenario_name=run.scenario_name,
        algorithm=run.algorithm,
        path_length=run.path_length,
        total_energy_wh=run.total_energy_wh,
        avg_latency_ms=run.avg_latency_ms,
        replans_count=run.replans_count,
        collisions_avoided=run.collisions_avoided,
        recorded_at=run.recorded_at,
    )


@router.get("/summary", response_model=BenchmarkSummaryResponse)
async def benchmark_summary(session: AsyncSession = Depends(get_session)) -> BenchmarkSummaryResponse:
    query = select(
        BenchmarkRun.algorithm,
        func.count(BenchmarkRun.id),
        func.avg(BenchmarkRun.path_length),
        func.avg(BenchmarkRun.total_energy_wh),
        func.avg(BenchmarkRun.avg_latency_ms),
        func.sum(BenchmarkRun.replans_count),
        func.sum(BenchmarkRun.collisions_avoided),
    ).group_by(BenchmarkRun.algorithm)

    result = await session.execute(query)
    by_algorithm: dict[str, BenchmarkAlgorithmSummary] = {}
    for algorithm, runs, avg_len, avg_energy, avg_latency, total_replans, total_collisions in result.all():
        by_algorithm[algorithm] = BenchmarkAlgorithmSummary(
            runs=runs,
            avg_path_length=float(avg_len or 0.0),
            avg_energy_wh=float(avg_energy or 0.0),
            avg_latency_ms=float(avg_latency or 0.0),
            total_replans=int(total_replans or 0),
            total_collisions_avoided=int(total_collisions or 0),
        )

    return BenchmarkSummaryResponse(by_algorithm=by_algorithm)
