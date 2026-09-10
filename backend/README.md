# AEGIS-NAV — Backend

Two backend services live here, merged from two parallel builds, now wired together (Phase 5):

| | `src/` (service: `api`) — "Backend 2" | `simulation/` + `server.py` (service: `sim`) — "Backend 1" |
|---|---|---|
| What | Native C++ pathfinding core (`aegis_core` via pybind11) + async FastAPI REST + Postgres | 3D physics/kinematics: elevation, APF/DWA local avoidance, victim sensing, pushed over WebSocket |
| Style | Request/response, persistent (missions/SOS/benchmark history survive restarts) | Per-connection in-memory world, 20Hz push, nothing persisted |
| Planning | Owns it: manual C++ A* + D* Lite | None anymore — calls `api`'s REST endpoints for every plan/replan |
| Best for | Logging SOS transmissions, cross-run benchmark comparison; the only source of truth for paths | Driving a live 3D viewport in real time: Z-mapped, spline-smoothed motion |

Both run independently of the 3D/graphics frontend in [`../src`](../src) (unrelated to this `backend/src/` —
naming collision from the merge, not the same directory — nothing here is wired to it yet).

## Why Docker

This host's only native Windows C++ toolchain (`C:\MinGW`) is the classic 32-bit-only MinGW.org project —
it cannot link against a 64-bit Python, so a native Windows build of the `aegis_core` extension is a hard
dead end here, not just risky. Everything in this backend builds and runs inside Linux containers instead,
which also matches the stack's own stated target environment (Linux/macOS).

## Running

```bash
docker compose up --build
```

- REST API (`api` / Backend 2): http://localhost:8001 (docs at `/docs`) — mapped off the default 8000
  since another local project already holds that port on this machine; the container itself still
  listens on 8000.
- WebSocket sim (`sim` / Backend 1): http://localhost:8002/health, stream at `ws://localhost:8002/ws/simulation`.
  Depends on `api` being reachable (see "Backend 1 → Backend 2 integration" below) — bring both up together.
- Postgres: localhost:5432 (user/db `aegis`).

## Testing

```bash
docker compose up -d db
docker compose run --rm api pytest
```

- `tests/test_core_*.py` — Backend 2's C++ core (`aegis_core`), no DB needed.
- `tests/test_api_*.py` — Backend 2's FastAPI layer via `TestClient`/`AsyncClient`.
- `tests/test_sim_cost_field.py`, `test_sim_power_model.py`, `test_sim_apf_dwa.py` — Backend 1's local
  (non-networked) pieces: cost field, power model, APF/DWA. Backend 1 no longer has its own planner to
  test in isolation (see Phase 5 below) — its planning logic is exercised through Backend 2's own tests.
- `tests/test_energy.py` — Backend 2's energy model (`aegis_backend/services/energy.py`).

`db` needs to be up first because Backend 2's FastAPI app's `lifespan` creates tables on startup.

To verify the full WebSocket + planning-handoff path end to end:
```bash
docker compose up -d
docker compose exec sim python test_client.py
```
(Uses `exec` into the already-running `sim` container, not `run` — `test_client.py` connects to
`127.0.0.1:8000`, which only resolves to the right process from inside that same container.)

## Layout

```
src/                      Backend 2 ("api" service) -- owns all pathfinding
  core/                    C++: Grid2D (cost field + distance transform), AStarPlanner, DStarLitePlanner
  bindings.cpp             pybind11 module -> aegis_core
  aegis_backend/
    api/                   FastAPI app, routers (grid/plan/simulation/incidents/benchmark)
    services/              energy.py (power model), reporting.py (Tactical Rescue Transmission)
    db/                    SQLAlchemy 2.0 async models: Mission, IncidentSOS, BenchmarkRun

simulation/                Backend 1 ("sim" service) -- 3D physics/kinematics, no planning of its own
  cost_field.py            NumPy-vectorized elevation/hazard field (used for Z-sampling + local telemetry)
  kinematics/              apf_dwa.py (local avoidance), power_model.py
  rover_sim.py             per-connection session: calls Backend 2's REST API for paths, maps them to
                           Path3D via bilinear elevation sampling + Catmull-Rom smoothing, runs the
                           APF/DWA + power-model tick loop
server.py                  FastAPI + WebSocket entrypoint, GET /health, WS /ws/simulation
test_client.py             manual end-to-end smoke-test script (asserts the streamed path is Path3D)

tests/                     shared by both services (see Testing above)
```

## Backend 1 → Backend 2 integration (Phase 5)

Backend 1 no longer plans. `rover_sim.py`'s pure-Python A*/D* Lite (`simulation/planners/`) was deleted
outright, along with the tests that only existed to cover it (`test_sim_astar.py`, `test_sim_dstar_lite.py`)
— Backend 2's C++ engine is the single source of truth for paths now. On each new WebSocket connection:

1. `RoverSimulationSession.initialize_backend2_planning()` pushes this session's obstacles (`POST
   /api/grid/init`) and its two hardcoded thermal sources (`POST /api/grid/hazards`) onto Backend 2's grid,
   then requests the initial route (`POST /api/plan/baseline`).
2. Every waypoint in the returned 2D path is Z-mapped: `_sample_elevation_bilinear` reads Backend 1's own
   elevation heightmap at that (possibly sub-cell) position, then `_catmull_rom_smooth` runs a spline pass
   over the resulting 3D points to remove grid-snapping. The result (`current_path_3d`, a `Path3D =
   List[Tuple[float, float, float]]`) is what actually gets sent to the client, both in `initial_state` and
   every `telemetry` frame's `"path"` field.
3. `drop_obstacle` mutations call `POST /api/grid/mutate` (Backend 2's incremental D* Lite repair);
   `add_heat_zone` and `emergency_low_battery` call `POST /api/plan/baseline` again, since Backend 2's
   `/mutate` only understands obstacle changes, not hazard or weight changes (see below).

Backend 1's own local values (elevation, hazards, obstacles) still drive Backend 1's APF/DWA local
avoidance, power model, and victim-detection sweep directly — only *global* pathfinding was delegated.

**Known limitations, inherent to Backend 2's current REST contract (documented in `rover_sim.py`'s module
docstring; not fixable without changing Backend 2, which was out of scope for this phase):**
- `POST /api/grid/mutate` has no field for the rover's current position — D* Lite's internal `start` stays
  fixed at whatever `/api/plan/baseline` last set (this session's original `(10, 10)`), so a path returned
  after a mutation is anchored back at that original start, not wherever the rover has actually moved to.
- `POST /api/grid/hazards` updates Backend 2's cost field but never touches its D* Lite planner state, so
  a hazard-only change has no incremental-repair path there — `add_heat_zone` falls back to a fresh
  `/api/plan/baseline` call, which resets Backend 2's D* Lite state (the cost any full replan carries).
- Backend 2's `CostWeights` has no slope/elevation term at all (`{w_d, w_temp, w_risk, w_obs}`), so
  `emergency_low_battery`'s "avoid steep climbs" can't be forwarded to Backend 2's remote planning — it's
  approximated with a thermal-weight bias instead, and that gap is left visible in the code rather than
  papered over.

## Known issues fixed after the branch merge

The two backends were built in parallel branches and merged via PR; a few things broke silently in the
merge and were fixed here — worth knowing about since they'll look like mysterious regressions otherwise:

- **`backend/requirements.txt` lost the sim engine's dependencies.** Both branches added a file at that
  same path; the merge kept only the REST backend's side, silently dropping `numpy`, `scipy`, and
  `websockets`. Confirmed via `ModuleNotFoundError: No module named 'numpy'`. Re-added; `httpx` (needed for
  Phase 5's Backend 2 client) is now a runtime dependency too, not just a test dependency.
- **The Python D* Lite (now deleted) was ~3.5x slower than the spec's <25ms/100x100 target, and slower
  than A*.** Root cause was dense NumPy float32 arrays accessed one scalar at a time in the hot loop —
  fixed at the time by switching to plain dicts (~90-100ms, still ~4x over target for the worst case).
  Moot now that Backend 2's C++ D* Lite (<1ms on the same grid size) is the only planner in the system.
- **Duplicate blueprint doc**: both branches independently added `AEGIS-NAV_Final_Blueprint.md`, one at
  the repo root, one in `docs/`. Byte-identical; the root copy was removed.

## Known trade-offs (intentional, for a hackathon timeline)

- **No Alembic migrations yet** (Backend 2). `init_models()` runs `Base.metadata.create_all` on startup.
  Fine for a single-environment demo; swap in Alembic if this needs to survive schema changes across
  environments.
- **Single implicit mission** (Backend 2). `/api/incidents/sos` auto-creates/reuses one `ACTIVE` mission
  if `mission_id` isn't supplied, rather than requiring a separate mission-management endpoint the spec
  didn't ask for.
- **Transmission IDs are an in-memory counter** (Backend 2's `reporting.py`), so it resets on restart.
  Fine for a demo run; would need a DB-backed sequence to survive restarts.
- **Single active mission across both backends.** Backend 2's `EngineState` is a process-wide singleton —
  one grid, one plan, globally — so only one Backend-1 WebSocket session can be meaningfully connected at
  a time; two concurrent sessions would stomp on each other's grid state via `/api/grid/init`. Fine for a
  one-client demo; would need per-session state on Backend 2 to support more.
- **Nothing here is wired to the 3D/graphics frontend yet** — `sim` is the intended source for a live
  viewport (streams `Path3D`, pose, telemetry over WebSocket), `api` for persisting SOS/benchmark history,
  but no frontend code exists that connects to either.
