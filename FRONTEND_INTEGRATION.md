# AEGIS-NAV — Frontend Integration Guide

Everything a frontend developer needs to wire a UI to the backend: what's built, what's verified, exact
message/endpoint shapes, and the gotchas that will otherwise cost you an hour of confused debugging.

Nothing in `src/` (the Vite/Three.js scaffold at the repo root) talks to either backend yet. This doc is
written for whoever picks that up next.

---

## 1. Project checkpoints (current state)

| # | Checkpoint | Status |
|---|---|---|
| 1 | Frontend scaffold (Vite + TypeScript + Three.js + Tailwind + Zustand) | Stub only — dual viewports render, algorithms are `TODO`s, nothing wired to a backend |
| 2 | Backend 2 built: C++ pathfinding core (`aegis_core`) + FastAPI REST + Postgres | Done, tested |
| 3 | Backend 1 merged in: Python/NumPy 3D physics engine over WebSocket | Done, merge-fallout bugs fixed (missing deps, D* Lite perf) |
| 4 | **Phase 5** — Backend 1 stopped planning locally, became a REST client of Backend 2; added Z-mapping + Catmull-Rom smoothing | Done, verified live |
| 5 | Architecture-review fixes: D* Lite start-anchoring, slope/elevation cost model in Backend 2 | Done, verified live |
| 6 | Live review / demo pass (benchmark data, Swagger walkthrough) | Done |
| 7 | **Frontend integration** | **Not started — this is the next checkpoint** |

Relevant commits: `9cb4670` (merge fixes), `ff74128` (Phase 5), `1bcd9cc` (start-anchoring + slope fixes).
Backend-side detail and rationale for all of the above lives in [`backend/README.md`](backend/README.md) —
this doc only covers what the frontend actually needs to consume.

---

## 2. Architecture at a glance

| | Backend 2 (`api`) | Backend 1 (`sim`) | Frontend (`src/`) |
|---|---|---|---|
| What | C++ pathfinding core (A*, D* Lite) behind FastAPI REST + Postgres | Python/NumPy 3D physics: elevation, APF/DWA, victim sensing, pushed over WebSocket | Vite/Three.js — **not built yet** |
| Talks to | Postgres | Backend 2 (REST) | **Should talk to Backend 1's WebSocket as its primary feed** |
| Owns | All pathfinding | 3D motion, terrain, sensors | Rendering only |
| Port (host) | `8001` | `8002` | dev server, e.g. `5173` |
| Port (in Docker network) | `api:8000` | `sim:8000` | n/a |

**The frontend's primary integration point is Backend 1's WebSocket** (`ws://localhost:8002/ws/simulation`)
— it already streams everything needed to render the scene: pose, terrain, the smoothed 3D path, power
telemetry, dynamic obstacles, and SOS events. Backend 2's REST API is a **secondary** integration point,
useful for auxiliary views (a benchmark dashboard, an SOS transmission log) that aren't part of the live
tick stream — see §4.

---

## 3. Running it locally

```bash
cd backend
docker compose up --build
```

- Backend 2 (REST + docs): `http://localhost:8001` — Swagger UI at `http://localhost:8001/docs`
- Backend 1 (WebSocket): `http://localhost:8002/health`, stream at `ws://localhost:8002/ws/simulation`
- Postgres: `localhost:5432` (only needed for Backend 2's SOS/benchmark endpoints)

Bring all three up together — `sim` calls `api` on connect and will error out if it can't reach it (see §6).

---

## 4. Primary integration: WebSocket (Backend 1)

Connect to `ws://localhost:8002/ws/simulation`. One connection = one isolated, stateless mission session —
nothing is shared between connections. Every message is JSON with a `type` and a `data` payload:
`{"type": "...", "data": {...}}`.

### Messages the server sends you

**`initial_state`** — sent once, immediately after connecting:

| Field | Type | Notes |
|---|---|---|
| `width`, `height` | int | grid dimensions, `100 x 100` by default |
| `resolution` | float | grid units per cell, `1.0` |
| `start`, `goal` | `[x, y]` | mission start `(10, 10)` / goal `(88, 85)`, grid-cell ints |
| `elevation` | `number[height][width]` | full heightmap, row-major `[y][x]`, roughly -10 to +14 units |
| `temperature` | `number[height][width]` | full thermal field, row-major `[y][x]`, °C |
| `obstacles` | `bool[height][width]` | row-major `[y][x]`, `true` = blocked |
| `victims` | `[{id, x, y, triage, temp_c}, ...]` | **ground truth**, sent upfront — 2 victims by default. If you want a "fog of war" reveal-on-detection UI, hide these client-side until they show up in `new_sos` (see below) rather than relying on the backend to withhold them |
| `initial_path` | `Path3D` (see §4.3) | the smoothed 3D route |
| `planning_backend` | string | always `"backend2-rest"`, informational |

**`telemetry`** — streamed at 20Hz (every ~50ms) for the life of the connection:

| Field | Type | Notes |
|---|---|---|
| `pose.x`, `pose.y` | float | rover position, grid-cell units (sub-cell precision) |
| `pose.heading_rad`, `pose.heading_deg` | float | both given, pick whichever your renderer wants |
| `pose.velocity`, `pose.angular_velocity` | float | m/s and rad/s |
| `environment.elevation` | float | heightmap value at the rover's current cell |
| `environment.slope_deg` | float | local slope angle in degrees |
| `environment.ambient_temp_c` | float | thermal field value at the rover's current cell |
| `power.power_watts` | float | instantaneous draw |
| `power.battery_wh`, `power.battery_pct` | float | out of a 500Wh pack |
| `power.fuel_liters`, `power.fuel_pct` | float | out of a 5.0L tank |
| `power.total_energy_kj` | float | cumulative |
| `power.is_critical_reserve` | bool | `battery_pct < 15` |
| `path` | `Path3D` | **the full current path**, re-sent every frame (see §4.3 for a re-render-cost note) |
| `waypoint_index` | int | **do not index into `path` with this** — see the gotcha in §6 |
| `dynamic_obstacles` | `[{x, y, vx, vy, radius}, ...]` | 3 by default |
| `benchmark.astar` / `benchmark.dstar_lite` | `{latency_ms, path_length, nodes_expanded, energy_kj}` | `nodes_expanded` (astar) and `energy_kj` (both) are always `0` — not real data, don't render them as if they were |
| `new_sos` | object or `null` | **only non-null on the exact tick a new victim is detected** — see shape below |
| `sos_count` | int | running total of detections this session |

`new_sos` shape (present only on a detection tick):
```json
{
  "transmission_id": "TAC-SAR-CAS-ALPHA-1",
  "victim_id": "CAS-ALPHA-1",
  "timestamp_utc": "2026-09-11T10:32:04Z",
  "target_coordinates": { "x": 48.5, "y": 52.0, "elevation": 3.21 },
  "triage_status": "CONSCIOUS_TRAPPED",
  "vital_thermal_signature": "37.1°C",
  "ambient_temperature": "42.3°C",
  "extraction_corridor": "AIR-DROP-SECTOR-4"
}
```
Note `vital_thermal_signature`/`ambient_temperature` are pre-formatted strings with a `°C` suffix baked in,
not bare numbers — parse if you need the raw value.

**`mutation_ack`** — one per command you send (see §4.2), same tick it's processed. Shape varies by
`status`:
- `{"status": "replanned", "source": "baseline" | "mutate", "backend2_compute_time_ms" | "backend2_repair_latency_ms": float, "round_trip_ms": float, "new_path_length": int, ...}` — mutate responses additionally carry `path_changed: bool`, `astar_baseline_latency_ms`, `speedup_factor`.
- `{"status": "no_op", "reason": "..."}` — e.g. a `drop_obstacle` with a zero radius touching nothing.
- `{"status": "replan_failed", "error": "..."}` — Backend 2 call failed.
- `{"status": "ignored", "reason": "unknown mutation type: ..."}` — malformed/unrecognized command.

**`error`** — sent only if Backend 2 was unreachable when the connection was first established, followed
immediately by the server closing the socket:
```json
{ "type": "error", "data": { "message": "Backend 2 planning initialization failed: ..." } }
```

### 4.2 Messages you can send

Send raw JSON text frames, no envelope needed:

```json
{ "type": "drop_obstacle", "x": 50, "y": 50, "radius": 3 }
```
Drops rubble at `(x, y)` with the given radius (grid cells). Triggers Backend 2's D* Lite incremental
repair, anchored at the rover's live position. All fields optional — defaults shown above.

```json
{ "type": "add_heat_zone", "x": 50, "y": 50, "temp": 80.0, "sigma": 6.0 }
```
Spawns a Gaussian thermal source. Triggers a fresh full replan (not incremental — see §6). All fields
optional — defaults shown above.

```json
{ "type": "emergency_low_battery" }
```
Forces the battery to 40Wh (~13%, below the 15% critical threshold) and triggers a slope-averse reroute.
No parameters.

Anything else comes back as `{"status": "ignored", ...}` — safe to send unknown types while prototyping.

### 4.3 The `Path3D` shape

Both `initial_path` and every `telemetry.path` are the same shape: `[[x, y, z], [x, y, z], ...]`.

- `x`, `y` are **grid-cell coordinates** (floats, `0` to `width/height - 1`), not world units — apply your
  own scale factor when placing them in a Three.js scene.
- `z` is the sampled elevation at that point (same rough -10..+14 unit range as the heightmap), **not**
  meters — treat it as a relative height and scale for visual effect, don't take it as a literal length.
- The array is **already spline-smoothed** (Catmull-Rom, 6 samples per input waypoint) — don't re-smooth it,
  and don't expect its length to match anything you can predict from the grid distance between start/goal.

---

## 5. Secondary integration: REST API (Backend 2)

Base URL `http://localhost:8001`. Full interactive docs at `/docs`. You generally won't call `/api/grid/*`
or `/api/plan/*` yourself — Backend 1 already owns that lifecycle — but these are useful for standalone
dashboard/log views:

| Method | Path | Request body | Response |
|---|---|---|---|
| `GET` | `/api/incidents/tactical-export` | — (optional `?mission_id=`) | `{transmission_id, timestamp, operation_status, target_count, targets: [{victim_id, coordinates:{x,y}, triage, hazard_context:{ambient_temp, structural_instability}, extraction_waypoint}]}` |
| `POST` | `/api/incidents/sos` | `{victim_id, x, y, ambient_temp, structural_risk, triage_status}` | the created record |
| `GET` | `/api/benchmark/summary` | — | `{by_algorithm: {astar: {runs, avg_path_length, avg_energy_wh, avg_latency_ms, total_replans, total_collisions_avoided}, dstar_lite: {...}}}` |
| `POST` | `/api/benchmark/record` | `{scenario_name, algorithm: "astar"\|"dstar_lite", path_length, total_energy_wh, avg_latency_ms, replans_count, collisions_avoided}` | the created record |
| `GET` | `/api/grid/costmap` | — | `{width, height, costs: number[height][width]}` — `-1.0` means impassable (obstacle or >35° slope) |

⚠️ **Backend 2 has no CORS middleware configured at all** (Backend 1 does, wide open). Calling these
directly from a browser-based frontend on a different origin/port will be blocked. Either proxy through
your dev server (Vite's `server.proxy` config) or add `CORSMiddleware` to `backend/src/aegis_backend/api/main.py`
— it's not there today.

---

## 6. Known limitations & gotchas

1. **`waypoint_index` doesn't index into the streamed `path` array.** `waypoint_index` is Backend 1's
   internal index into its *raw* 2D path (one entry per grid cell); the `path` you receive is the
   *smoothed* 3D version with ~6x as many points per segment. If you want to highlight "the segment the
   rover is currently on," you'll need to map proportionally, not index directly.
2. **Only one WebSocket client should be connected at a time.** Backend 2's grid/mission state is a single
   process-wide singleton. A second concurrent connection will silently overwrite the first session's grid
   via `/api/grid/init`. Fine for a single-viewport demo; would need per-session state on Backend 2 to
   support more.
3. **Victim detection has no occlusion check.** It's a 60°/14-unit distance-and-angle sector test, not a
   ray-marched line of sight — a victim behind a wall but inside the cone still gets "detected." If your
   scene wants believable FLIR behavior, you may want to add your own occlusion raycast against the
   `obstacles` grid before trusting `new_sos`.
4. **`add_heat_zone` and `emergency_low_battery` reset D\* Lite's incremental state** (they go through a
   fresh `/api/plan/baseline` call, not `/api/grid/mutate`) — only `drop_obstacle` gets the fast incremental
   repair. Both still return a path correctly anchored at the rover's current position.
5. **A benign error can appear in `sim`'s server logs on disconnect**: `Unexpected ASGI message
   'websocket.send', after sending 'websocket.close'...`. Cosmetic — fires after your last frame was
   already delivered. Don't chase it.
6. **No CORS on Backend 2** (see §5) — only matters if you call its REST API directly from the browser.
7. **Nothing validates that two clients agree on grid size.** Backend 1 always requests a 100x100 session;
   if you need a different size, that's a code change in `server.py`'s `RoverSimulationSession(...)` call,
   not something configurable per-connection today.

---

## 7. Minimal connection skeleton

```js
const ws = new WebSocket("ws://localhost:8002/ws/simulation");

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  switch (type) {
    case "initial_state":
      // data.elevation / data.temperature / data.obstacles: build the terrain mesh once
      // data.initial_path: draw the starting route
      // data.victims: ground truth, hide until they appear in new_sos if you want fog-of-war
      break;
    case "telemetry":
      // data.pose: move the rover
      // data.path: redraw the route (Path3D, already smoothed)
      // data.new_sos: if non-null, flash an alert
      break;
    case "mutation_ack":
      // data.status: "replanned" | "no_op" | "replan_failed" | "ignored"
      break;
    case "error":
      // Backend 2 was unreachable; the socket closes right after this
      break;
  }
};

function dropObstacle(x, y, radius = 3) {
  ws.send(JSON.stringify({ type: "drop_obstacle", x, y, radius }));
}
```
