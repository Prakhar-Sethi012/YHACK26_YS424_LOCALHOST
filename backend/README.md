# AEGIS-NAV — Backend 2: 2D Core Logic & Pathfinding Hub

Native C++ grid pathfinding (A*, D* Lite) exposed to Python via pybind11 (`aegis_core`), wrapped in an
async FastAPI service, backed by PostgreSQL for mission/SOS/benchmark logging. Runs independently of the
3D/graphics frontend in [`../src`](../src).

## Why Docker

This host's only native Windows C++ toolchain (`C:\MinGW`) is the classic 32-bit-only MinGW.org project —
it cannot link against a 64-bit Python, so a native Windows build of the `aegis_core` extension is a hard
dead end here, not just risky. Everything in this service builds and runs inside a Linux container instead,
which also matches the stack's own stated target environment (Linux/macOS).

## Running

```bash
docker compose up --build
```

- API: http://localhost:8001 (docs at `/docs`) — mapped off the default 8000 since another local
  project already holds that port on this machine; the container itself still listens on 8000.
- Postgres: localhost:5432 (user/db `aegis`)

## Testing

```bash
docker compose up -d db
docker compose run --rm api pytest
```

`tests/test_core_*.py` exercise the C++ core directly through the `aegis_core` module (no DB needed).
`tests/test_api_*.py` exercise the FastAPI layer via `TestClient` — the app's `lifespan` creates tables
against `DATABASE_URL` on startup, so the `db` service needs to be up first.

## Layout

```
src/
  core/               C++: Grid2D (cost field + distance transform), AStarPlanner, DStarLitePlanner
  bindings.cpp         pybind11 module -> aegis_core
  aegis_backend/
    api/
      main.py          FastAPI app, lifespan (create_all on startup), routers
      state.py          in-memory EngineState singleton: active Grid2D + planners + energy + active path
      schemas.py         Pydantic request/response models for grid/plan/simulation endpoints
      schemas_db.py       Pydantic models for SOS/benchmark endpoints
      routers/
        grid.py          POST /api/grid/init, /hazards, /mutate, GET /costmap
        plan.py          POST /api/plan/baseline
        simulation.py    POST /api/simulation/tick, GET /telemetry
        incidents.py     POST /api/incidents/sos, GET /tactical-export
        benchmark.py     POST /api/benchmark/record, GET /summary
    services/
      energy.py          power model, battery/fuel draw, low-reserve cost re-weighting
      reporting.py        Tactical Rescue Transmission JSON builder
    db/
      models.py          SQLAlchemy 2.0 async models: Mission, IncidentSOS, BenchmarkRun
      session.py          async engine/session, create_all (no Alembic yet — see below)
tests/
```

## Known trade-offs (intentional, for a hackathon timeline)

- **No Alembic migrations yet.** `init_models()` runs `Base.metadata.create_all` on startup. Fine for a
  single-environment demo; swap in Alembic if this needs to survive schema changes across environments.
- **Single implicit mission.** `/api/incidents/sos` auto-creates/reuses one `ACTIVE` mission if
  `mission_id` isn't supplied, rather than requiring a separate mission-management endpoint the spec didn't
  ask for.
- **Transmission IDs are an in-memory counter** (`reporting.py`), so it resets on restart. Fine for a demo
  run; would need a DB-backed sequence to survive restarts.
