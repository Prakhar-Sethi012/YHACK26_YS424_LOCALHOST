# AEGIS-NAV — Backend

Two independent backend services live here, merged from two parallel builds. They don't share code or
state; each is a complete answer to a different half of the problem.

| | `src/` (service: `api`) | `simulation/` + `server.py` (service: `sim`) |
|---|---|---|
| What | Native C++ pathfinding core (`aegis_core` via pybind11) + async FastAPI REST + Postgres | Pure Python/NumPy stateless engine, pushed over WebSocket |
| Style | Request/response, persistent (missions/SOS/benchmark history survive restarts) | Per-connection in-memory world, 20Hz push, nothing persisted |
| Local avoidance | Not implemented (global planning only) | APF + DWA, plus automatic per-tick victim-detection sweep |
| Best for | Logging SOS transmissions, cross-run benchmark comparison | Driving a live 3D viewport in real time |

Both run independently of the 3D/graphics frontend in [`../src`](../src) (unrelated to this `backend/src/` —
naming collision from the merge, not the same directory).

## Why Docker

This host's only native Windows C++ toolchain (`C:\MinGW`) is the classic 32-bit-only MinGW.org project —
it cannot link against a 64-bit Python, so a native Windows build of the `aegis_core` extension is a hard
dead end here, not just risky. Everything in this backend builds and runs inside Linux containers instead,
which also matches the stack's own stated target environment (Linux/macOS).

## Running

```bash
docker compose up --build
```

- REST API (`api`): http://localhost:8001 (docs at `/docs`) — mapped off the default 8000 since another
  local project already holds that port on this machine; the container itself still listens on 8000.
- WebSocket sim (`sim`): http://localhost:8002/health, stream at `ws://localhost:8002/ws/sim`.
- Postgres: localhost:5432 (user/db `aegis`).

## Testing

```bash
docker compose up -d db
docker compose run --rm api pytest
```

- `tests/test_core_*.py` — the C++ core (`aegis_core`), no DB needed.
- `tests/test_api_*.py` — the FastAPI layer via `TestClient`/`AsyncClient`.
- `tests/test_sim_*.py` — the Python/NumPy engine (`simulation/*`): cost field, A*, D* Lite, power model, APF/DWA.
- `tests/test_energy.py` — the REST backend's separate energy model (`aegis_backend/services/energy.py`).

48 tests total. `db` needs to be up first because the FastAPI app's `lifespan` creates tables on startup.

## Layout

```
src/                      REST backend ("api" service)
  core/                    C++: Grid2D (cost field + distance transform), AStarPlanner, DStarLitePlanner
  bindings.cpp             pybind11 module -> aegis_core
  aegis_backend/
    api/                   FastAPI app, routers (grid/plan/simulation/incidents/benchmark)
    services/              energy.py (power model), reporting.py (Tactical Rescue Transmission)
    db/                    SQLAlchemy 2.0 async models: Mission, IncidentSOS, BenchmarkRun

simulation/                WebSocket engine ("sim" service)
  cost_field.py            NumPy-vectorized multi-objective cost tensor
  planners/                astar.py, dstar_lite.py
  kinematics/              apf_dwa.py (local avoidance), power_model.py
  rover_sim.py             per-connection session: ties the above into one 20Hz step() loop
server.py                  FastAPI + WebSocket entrypoint (uvicorn server:app)
test_client.py             manual WebSocket smoke-test script

tests/                     shared by both services (see Testing above)
```

## Known issues fixed after the branch merge

The two backends were built in parallel branches and merged via PR; a few things broke silently in the
merge and were fixed here — worth knowing about since they'll look like mysterious regressions otherwise:

- **`backend/requirements.txt` lost the sim engine's dependencies.** Both branches added a file at that
  same path; the merge kept only the REST backend's side, silently dropping `numpy`, `scipy`, and
  `websockets`. Result: `import simulation.rover_sim` (and therefore `server.py`) couldn't even start —
  confirmed via `ModuleNotFoundError: No module named 'numpy'`. Re-added to `requirements.txt` /
  `requirements-dev.txt`.
- **D* Lite's incremental repair was ~3.5x slower than the spec's <25ms/100x100 target, and slower than
  the A* baseline it's supposed to beat** (measured: ~330ms repair vs. A*'s ~150ms, for an obstacle dropped
  near the center of the default disaster terrain). Root cause: `g`/`rhs` lived in dense NumPy float32
  arrays, and the hot loop does thousands of single-element accesses per repair — exactly the access
  pattern NumPy is slow at (dtype conversion + object wrapping per element), not the vectorized bulk
  math it's fast at. Switched `g`/`rhs` to plain dicts and cached the cost tensor as nested Python lists;
  this cut the same repair to ~90-100ms, a real ~3.5x win.
  - **This does not fully close the gap.** ~90-100ms is still ~4x over the 25ms target for this specific
    worst case. The algorithm's *localization* was correct throughout, independent of this fix — an
    unrelated, off-path mutation expands 0-2 nodes and returns in ~1-2ms today, comfortably under target
    (see `tests/test_sim_dstar_lite.py`). Closing the remaining gap on a maximally-disruptive central
    mutation would need either a native implementation — `backend/src/core`'s C++ D* Lite already does
    this in <1ms on the same grid size — or a different Python approach (Cython/Numba), not further
    micro-optimization of this loop.
  - `docker-compose.yml` had no service at all for `server.py` — added `sim`.
- **Duplicate blueprint doc**: both branches independently added `AEGIS-NAV_Final_Blueprint.md`, one at
  the repo root, one in `docs/`. Byte-identical; the root copy was removed.

## Known trade-offs (intentional, for a hackathon timeline)

- **No Alembic migrations yet** (REST backend). `init_models()` runs `Base.metadata.create_all` on
  startup. Fine for a single-environment demo; swap in Alembic if this needs to survive schema changes
  across environments.
- **Single implicit mission** (REST backend). `/api/incidents/sos` auto-creates/reuses one `ACTIVE`
  mission if `mission_id` isn't supplied, rather than requiring a separate mission-management endpoint
  the spec didn't ask for.
- **Transmission IDs are an in-memory counter** (REST backend's `reporting.py`), so it resets on restart.
  Fine for a demo run; would need a DB-backed sequence to survive restarts.
- **The two backends don't talk to each other.** Nothing here decides which one the frontend should
  actually connect to, or whether it should use both (e.g. `sim` for live rover motion, `api` for
  persisting SOS/benchmark history) — that's frontend integration work, not done yet.
