# AEGIS-NAV

**Autonomous Rescue Command & Control System** — Challenge 1: Autonomous Path Planning with Dynamic Obstacle Avoidance.

A simulated search-and-rescue rover navigates a disaster environment through a two-tier planner (D* Lite global + APF/DWA local avoidance), balancing distance, time, collision risk, and energy against a live multi-objective cost field. See [`docs/AEGIS-NAV_Final_Blueprint.md`](docs/AEGIS-NAV_Final_Blueprint.md) for the full design and [`docs/AEGIS-NAV_Submission_Sections.md`](docs/AEGIS-NAV_Submission_Sections.md) for the submission write-up.

## Stack

Three.js + WebGL2 (Vite/TypeScript), TailwindCSS, Zustand, planning/cost-field computation in a dedicated Web Worker.

## Architecture

Five decoupled layers, matching `src/`:

- `src/environment` — ground-truth world state (terrain, hazards, obstacles, victims).
- `src/engine` — planning & simulation (cost field, A*, D* Lite, APF/DWA, power model), runs in a Web Worker (`src/engine/worker.ts`).
- `src/state` — Zustand store; the only boundary between the engine and the UI.
- `src/perception` — victim detection and SOS transmission generation.
- `src/presentation` — dual-viewport Three.js rendering + tactical HUD.

## Getting started

```bash
npm install
npm run dev
```

## Build plan

See the hour-by-hour phase plan in the blueprint doc. Current state: Phase 1 scaffold (grid/environment types, dual-viewport render, state store, worker wiring). Cost function, A*, D* Lite, APF/DWA, victim detection, and the live benchmark table are stubbed with `TODO(phase N)` markers pointing at their target implementation phase.
