# AEGIS-NAV: Autonomous Rescue Command & Control System
**Challenge 1 — Autonomous Path Planning with Dynamic Obstacle Avoidance**
*Industrial/defense-grade AGV mission command and simulation platform, in the visual and functional lineage of ROS2 RViz, Foxglove Studio, and Boston Dynamics Orbit.*

---

## 1. System Vision

AEGIS-NAV is not a grid-and-arrow pathfinding demo. It is presented as a command-center product a disaster-response agency would actually deploy: a rescue rover navigates a collapsing, shifting environment, and the operator watches it think — replanning live, burning fuel and battery realistically, and calling in victim coordinates the moment it finds someone.

Two pillars carry the whole pitch:
1. **It looks real** — dual-viewport 3D command center, dark tactical UI, live telemetry.
2. **It IS real underneath** — a genuine multi-objective cost function and two-tier planner (global + local), not a single hardcoded A* call with a coat of paint.

---

## 2. Core Feature Blueprint

### 2.1 Dual-View Professional Visualization
- **Viewport A — Tactical/Topological Overview (≈65% of screen):** orbital/isometric 3D view. Procedural terrain elevation (steepness/slopes), thermal heatmaps, LiDAR point-cloud sweep rings, risk potential fields, and multi-algorithm path overlays rendered simultaneously (active path in neon cyan, replanned segments in safety amber).
- **Viewport B — Third-Person Perspective / chase camera (≈35%):** cinematic follow-cam just behind and above the rover. Suspension tilt on slopes, spinning LiDAR puck, directional searchlights with atmospheric fog/dust, FLIR thermal overlay, targeting reticle on detected victims.
- **Interface:** dark mode, modular panels, dense live telemetry, tactical/aeronautical HUD styling — no visual clutter.

### 2.2 Multi-Layered Environmental Physics
The map is a stack of simultaneously-evaluated variables per node, not a flat grid:
- **Terrain & steepness** — flat ground is fast; steep inclines cost more fuel and slow the rover, with a rollover-impassable threshold.
- **Hazard/heat zones** — simulated fire or chemical spill; robot weighs a longer safe route vs. a shorter risky dash.
- **Dynamic weather** — rain increases slope slipperiness/fuel burn; smoke/fog shrinks effective sensor radius, forcing slower, more cautious movement.
- **Obstacles** — static (rubble, collapsed walls) and dynamic (moving hazards, falling debris, personnel).
- **God-mode map sculptor** — judges/operators can drag-and-drop walls, paint fire zones, trigger a landslide, or spawn moving debris live, forcing a visible replan.

### 2.3 Resource Management (Fuel & Battery)
Hybrid rescue-bot model:
- **Fuel (locomotion):** depletes with distance, terrain difficulty, steepness.
- **Battery (compute & sensors):** depletes with time, worsens in fog/weather (sensors work harder), and with the compute cost of continuous replanning.
- Below a critical reserve (<15%), the planner autonomously prunes high-steepness options and biases toward energy-minimal routes.

### 2.4 Autonomous Victim Detection & SOS Dispatch
- Simulated FLIR/vision sensor sweep (raycast/frustum intersection) scans for victim entities as the rover moves.
- On detection: rover pauses briefly; UI flashes an SOS panel with exact 3D coordinates (x, y, z), a synthetic thermal/night-vision snapshot with bounding box, ambient conditions, and a calculated extraction route.
- Output is a formatted "Tactical Rescue Transmission" (JSON) — coordinates, elevation, triage status, environment state.

### 2.5 The Algorithm Showdown (the technical credibility centerpiece)
Run two planning strategies side by side, on the same map, same start/goal:
- **Baseline ("dumb drone" — A\* only):** replans from scratch on every environment change, burns fuel on steep paths it doesn't discount, stalls when a sudden obstacle drops and it has to fully re-search.
- **AEGIS strategy (D\* Lite global + APF/DWA local):**
  - *D\* Lite* handles the global map and updates only the path segments affected by new hazards or blocked routes — far cheaper than full replanning.
  - *Artificial Potential Fields / Dynamic Window Approach* acts as continuous local repulsion from moving obstacles, smoothly steering without a full stop-and-recompute.
- Live benchmark table during the demo: replanning latency, path length, energy used, collisions avoided — for both strategies, on the same triggered event.

---

## 3. Mathematical Formulation

### 3.1 Multi-Objective Trajectory Cost
The global planner minimizes path cost $J(\mathcal{P})$ over arc length $s \in [0, L]$:

$$J(\mathcal{P}) = \int_0^L \Big( w_d + w_{\text{slope}} \cdot \mathcal{S}(x,y) + w_{\text{risk}} \cdot \mathcal{R}(x,y) + w_{\text{temp}} \cdot \mathcal{T}(x,y) + w_{\text{obs}} \cdot \mathcal{O}(x,y) \Big)\, ds$$

- $\mathcal{S}(x,y) = \|\nabla h(x,y)\|^2$ — incline penalty from terrain gradient; slopes past $\theta_{\max} = 35^\circ$ are infinite-cost (impassable).
- $\mathcal{T}(x,y) = \max(0,\, T(x,y) - T_{\text{safe}})$ — thermal risk from fire/rupture zones.
- $\mathcal{R}(x,y)$ — structural/regional danger index (collapse instability).
- $\mathcal{O}(x,y) = \dfrac{1}{\min(d(x,y,\text{obstacle}),\, d_{\text{safe}})^2}$ — distance-transform obstacle clearance penalty.

### 3.2 Power & Energy Dissipation
Power draw $P(t)$ (W) while traversing incline $\theta$ at velocity $v(t)$:

$$P(t) = P_{\text{avionics}} + P_{\text{thermal\_cooling}}(T) + \Big( m g \sin\theta + m g C_{rr}\cos\theta + \tfrac{1}{2}\rho C_d A v^2 + m a \Big)\, v$$

- $\Delta E_{\text{bat}} = \int P(t)\,dt$ (Wh)
- $\Delta V_{\text{fuel}} = \dfrac{\Delta E_{\text{generator}}}{\eta_{\text{engine}} \cdot \text{EnergyDensity}_{\text{fuel}}}$ (L)
- Below 15% reserve → planner auto-prunes steep alternatives, prioritizes downhill/energy-minimal valleys.

### 3.3 Local Dynamic Avoidance — DWA + APF
For moving obstacles (debris, personnel, flood surges): project obstacle velocity $\vec{v}_{\text{obs}}$ forward as a predictive collision horizon, then search admissible velocity pairs $(v,\omega) \in V_d$ within acceleration limits:

$$G(v,\omega) = \alpha \cdot \text{heading}(v,\omega) + \beta \cdot \text{clearance}(v,\omega) + \gamma \cdot \text{velocity}(v,\omega)$$

APF supplies continuous smooth repulsion; DWA selects the admissible velocity that best balances heading, clearance, and speed.

---

## 4. Technology Stack

Chosen for 60 FPS in-browser rendering with zero install friction on the judging machine:

| Subsystem | Technology | Why |
|---|---|---|
| Core 3D engine | Three.js + WebGL 2.0 (Vite + TypeScript) | Browser-standard for robotics digital twins (used by Foxglove, Cesium, NASA WebXR); PBR materials, post-processing, multi-viewport |
| Tactical UI / HUD | TailwindCSS + Lucide icons + Canvas overlay | Dark industrial aesthetic, tactical gauges and meters |
| Computation engine | Web Workers (dedicated thread) | Decouples path planning (A\*, D\* Lite, APF/DWA) and cost-field rasterization from the render loop — no stutter even on large grids |
| State management | Zustand (or equivalent reactive store) | Real-time robot pose, waypoint queue, sensor streams, energy reserves, alerts |
| Terrain/thermal rendering | Custom GLSL vertex/fragment shaders | GPU-side heightmap terrain, thermal gradient blooms, LiDAR contour rings |

---

## 5. UI/UX Layout — "The Command Center"

```
+-----------------------------------------------------------------------------------------------+
| [AEGIS-NAV]  AUTONOMOUS RESCUE COMMAND & CONTROL   | STATUS: MISSION ACTIVE | LIVE TELEMETRY   |
+--------------------------------------------------------+--------------------------------------+
| VIEWPORT A: TACTICAL TOPOLOGICAL OVERVIEW (~65%)       | VIEWPORT B: ROVER TPP CAMERA (~35%)  |
| - 3D elevation heightmap (color-coded by slope)        | - Cinematic third-person chase cam   |
| - Thermal hazard zones (orange/red bloom)              | - Onboard FLIR thermal HUD           |
| - LiDAR point-cloud sweep rings                        | - Reticle targeting on victims       |
| - Active path (cyan) vs replanned segment (amber)      | - Headlamp lighting + dust particles |
| - Moving-obstacle projected velocity vectors           | - Live gimbal telemetry (pitch/roll) |
+--------------------------------------------------------+--------------------------------------+
| DISASTER MAP SCULPTOR (GOD MODE)                       | LIVE TELEMETRY & STRATEGY BENCHMARK  |
| [Urban Ruin] [Chemical Fire] [Landslide]               | Battery: [========--] 78% (12.4 Ah)  |
| [Add Moving Debris] [Trigger Wall Collapse] [Paint Fire]| Fuel: 4.2 L   Speed: 1.8 m/s          |
| Planners: [x] A*  [x] D* Lite+APF  [ ] Energy-RRT*     | Benchmark: Cost | Dist | Energy | Time|
| SOS Log: 1 survivor found — coords transmitted          |                                        |
+-----------------------------------------------------------------------------------------------+
```

---

## 6. Hour-by-Hour Build Plan (24h)

**Phase 1 — Environment & Architecture (Hrs 0–4)**
- Build the 3D grid/graph data structure; each node holds `[elevation, terrain_type, heat_level, obstacle_status]`.
- Procedural heightmap (Perlin/Simplex noise), steepness calc, color grading.
- Set up dual-viewport rendering: orthographic/orbital Viewport A + follow-cam Viewport B.
- Build god-mode drag-and-drop tools (paint heat zones, drop walls).

**Phase 2 — Core Algorithms & Cost Field (Hrs 4–12)**
- Write the combined cost function (distance + slope + heat + obstacle clearance).
- Implement **A\*** first as the working baseline — get *something* pathing correctly before anything else.
- Implement **D\* Lite** for incremental replanning.
- Wire movement to fuel/battery drain logic.

**Phase 3 — Kinematics & Dynamic Obstacles (Hrs 12–18)**
- Implement **APF/DWA** local avoidance for moving obstacles.
- Add movement smoothing (lerping / Catmull-Rom spline path) so the TPP view shows real driving/turning/climbing, not grid-snapping.
- Wire dynamic obstacle spawning (moving debris, personnel) with predictive collision projection.

**Phase 4 — Sensor Simulation & Victim Detection (Hrs 18–22)**
- Place victim entities in the world.
- Implement raycast/frustum detection: unobstructed line-of-sight within radius → trigger detection.
- Build the SOS alert modal (coordinates, snapshot, extraction route, JSON transmission log).

**Phase 5 — Telemetry, Benchmark Mode & Polish (Hrs 22–24)**
- Wire live gauges (fuel, battery, state, hazard warnings) to internal variables.
- Build the live A\* vs D\*Lite+APF benchmark table (latency, path length, energy, collisions).
- Visual polish pass: rain/fog particles, glowing heat zones, dark tactical theming.
- Full dry run of the presentation — script the 3 demo triggers (wall collapse, thermal bypass, low-battery reroute) so they fire reliably on cue.

---

## 7. Verification & Validation Plan

**Automated / technical checks**
- Path computation latency target: < 25 ms for a 100×100 grid replan, run inside the Web Worker.
- Energy model sanity check: a steep-incline route must measurably out-cost a flat route of similar length.
- Collision rate: zero collisions across 100 randomized dynamic-obstacle trial runs.

**Presentation checks**
- Sustained 60 FPS with both viewports and particle effects running simultaneously.
- Judge-triggered obstacle drop must produce a visible path divergence within <100 ms — this is the single moment the whole demo hinges on, test it more than anything else.

---

## 8. Reality Check — Scope vs. 24 Hours

This is a genuinely excellent pitch document, but it is also **substantially more than a typical 4–6 person team builds cleanly in 24 hours**, especially the dual-viewport 3D engine, custom shaders, and full sensor/SOS pipeline together. Two honest options:

- **Tier 1 (full vision):** attempt everything above, in the phase order given. Highest ceiling, real risk of an unfinished or buggy final 2 hours if any phase overruns — and Phase 2/3 (the actual algorithms) are the part judges will test hardest, so they cannot be the part that gets rushed to make room for visuals.
- **Tier 2 (safer, same story):** cut to a single viewport (skip the TPP chase-cam), keep the full cost function + A\*/D\*Lite+APF showdown + fuel/battery + one clean live replanning trigger + victim SOS. This keeps every technically-judged element and the single best visual moment (live replanning), while dropping the highest-effort/lowest-judging-weight item (the second 3D camera view).

Recommendation: **build in the phase order above, but treat Viewport B (TPP camera) and the weather/particle polish as the first things you cut if you're behind schedule at hour 16** — the algorithm showdown and live replanning trigger are what actually get scored; the chase-camera is what makes it *look* impressive on top of that, not instead of it.
