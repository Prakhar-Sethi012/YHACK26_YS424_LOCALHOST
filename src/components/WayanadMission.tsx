import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapPin, Skull, Activity, Zap, AlertTriangle, RotateCcw, Route, Ban, FileBarChart } from 'lucide-react';

// The heightmap's native pixel size doesn't match the app's planning-grid
// convention -- ingest_wayanad.py resamples it to this fixed square grid
// (see that script's docstring for why obstacles and elevation are resized
// differently). Must match GRID_SIZE there.
const GRID_SIZE = 200;

// Real relief here is only 0-25m across a 200-unit-wide grid (~12% max
// slope ratio) -- fine for A*/D* Lite's real physics, but visually flat for
// a "cinematic" terrain. This multiplier only affects the Three.js mesh;
// the elevation values sent to Backend 2 stay the true meters value.
const VISUAL_ELEVATION_EXAGGERATION = 2.5;

const MUTATE_RADIUS = 5;
const LANDSLIDE_DELAY_MS = 3000;

// No real fuel telemetry exists for this static REST-only page (that's
// Backend 1's live simulation loop, which isn't running here) -- this is a
// clearly-labeled distance-derived estimate, not a fabricated reading.
const FUEL_RATE_L_PER_UNIT = 0.045;

// Each hazard D* Lite dodges costs a bit of real efficiency (extra braking/
// turning versus a straight run) -- an illustrative per-dodge penalty on
// top of the base fuel rate, not a measured value.
const MANEUVER_FUEL_PENALTY_PER_HAZARD = 0.06;

interface WayanadGrid {
  width: number;
  height: number;
  resolution: number;
  elevation: number[][];
  obstacles: boolean[][];
  temperature: number[][];
}

type GridCoord = [number, number];

type MissionStatus = 'IDLE' | 'ROUTING' | 'SEISMIC_SHIFT_DETECTED' | 'REROUTED';

type InteractionMode = 'route' | 'obstacle';

interface AlgoBenchmark {
  distance: number;
  fuelEstimateL: number;
  latencyMs: number;
}

function pathLength(path: GridCoord[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  }
  return length;
}

function toBenchmark(distance: number, latencyMs: number): AlgoBenchmark {
  return { distance, fuelEstimateL: distance * FUEL_RATE_L_PER_UNIT, latencyMs };
}

function fuelEfficiencyLPerKm(benchmark: AlgoBenchmark, resolutionM: number, maneuverCount: number): number {
  const distanceKm = (benchmark.distance * resolutionM) / 1000;
  if (distanceKm <= 0) return 0;
  return (benchmark.fuelEstimateL / distanceKm) * (1 + maneuverCount * MANEUVER_FUEL_PENALTY_PER_HAZARD);
}

// One-pass 3x3 box blur over the elevation matrix -- smooths cell-to-cell
// jitter left over after ingest_wayanad.py's own Gaussian pass before it
// reaches the Three.js mesh (and, since this same blurred grid is what gets
// POSTed to /api/grid/init below, before Backend 2's own slope-cost model
// too, so the terrain you see matches what the planners actually reason
// about).
function boxBlur3x3(matrix: number[][]): number[][] {
  const height = matrix.length;
  const width = matrix[0]?.length ?? 0;
  const result: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            sum += matrix[ny][nx];
            count++;
          }
        }
      }
      row.push(sum / count);
    }
    result.push(row);
  }
  return result;
}

// Finite-difference slope at a grid cell, degrees from horizontal -- used
// by the routing-analysis summary to describe what terrain a route
// diversion actually crossed.
function slopeDegreesAt(grid: WayanadGrid, x: number, y: number): number {
  const { elevation, width, height } = grid;
  const x0 = Math.max(0, x - 1);
  const x1 = Math.min(width - 1, x + 1);
  const y0 = Math.max(0, y - 1);
  const y1 = Math.min(height - 1, y + 1);
  const dzdx = (elevation[y]?.[x1] ?? 0) - (elevation[y]?.[x0] ?? 0);
  const dzdy = (elevation[y1]?.[x] ?? 0) - (elevation[y0]?.[x] ?? 0);
  const runX = Math.max(1, x1 - x0);
  const runY = Math.max(1, y1 - y0);
  const gradMag = Math.hypot(dzdx / runX, dzdy / runY);
  return Math.atan(gradMag) * (180 / Math.PI);
}

// Dynamic, data-driven comparison of the frozen A* baseline against
// D* Lite's currently active path -- reports whichever direction the real
// numbers actually go (a detour that avoids a hazard is not always
// cheaper), rather than always framing D* Lite as the winner.
function buildRoutingAnalysis(
  astarPath: GridCoord[],
  dstarPath: GridCoord[],
  grid: WayanadGrid,
  astarBenchmark: AlgoBenchmark,
  dstarBenchmark: AlgoBenchmark,
  hazardsAvoidedCount: number
): string {
  const minLen = Math.min(astarPath.length, dstarPath.length);
  let divergeIdx = -1;
  for (let i = 0; i < minLen; i++) {
    if (astarPath[i][0] !== dstarPath[i][0] || astarPath[i][1] !== dstarPath[i][1]) {
      divergeIdx = i;
      break;
    }
  }
  if (divergeIdx === -1 && astarPath.length === dstarPath.length) {
    return "D* Lite's active route is currently identical to the A* baseline -- no repair has diverged them yet.";
  }

  const refIdx = divergeIdx === -1 ? Math.floor(astarPath.length / 2) : divergeIdx;
  const [sx, sy] = astarPath[Math.min(refIdx, astarPath.length - 1)];
  const slopeDeg = slopeDegreesAt(grid, sx, sy);

  const fuelDeltaPct = astarBenchmark.fuelEstimateL > 0
    ? ((astarBenchmark.fuelEstimateL - dstarBenchmark.fuelEstimateL) / astarBenchmark.fuelEstimateL) * 100
    : 0;
  const distDeltaPct = astarBenchmark.distance > 0
    ? ((dstarBenchmark.distance - astarBenchmark.distance) / astarBenchmark.distance) * 100
    : 0;

  const slopeClause =
    slopeDeg >= 25
      ? `bypassing a steep ${slopeDeg.toFixed(0)}° incline`
      : slopeDeg >= 12
        ? `crossing a moderate ${slopeDeg.toFixed(0)}° slope`
        : 'through comparatively flat terrain';

  const hazardClause =
    hazardsAvoidedCount > 0 ? ` after routing around ${hazardsAvoidedCount} detected hazard${hazardsAvoidedCount === 1 ? '' : 's'}` : '';

  const distClause = `${distDeltaPct >= 0 ? '+' : ''}${distDeltaPct.toFixed(0)}% distance`;

  if (fuelDeltaPct >= 1) {
    return `D* Lite's repaired route diverges near sector (${sx}, ${sy})${hazardClause}, ${slopeClause}, conserving an estimated ${fuelDeltaPct.toFixed(0)}% fuel versus the frozen A* baseline (${distClause}).`;
  }
  if (fuelDeltaPct <= -1) {
    return `D* Lite's repaired route diverges near sector (${sx}, ${sy})${hazardClause}, ${slopeClause}, at an estimated ${Math.abs(fuelDeltaPct).toFixed(0)}% fuel cost versus the frozen A* baseline (${distClause}) -- here the safer detour cost more than it saved.`;
  }
  return `D* Lite's repaired route diverges near sector (${sx}, ${sy})${hazardClause}, ${slopeClause}, with negligible net change in estimated fuel use versus the frozen A* baseline.`;
}

// Mirrors the circular cell-selection backend/simulation/rover_sim.py uses
// for a "drop_obstacle radius" mutation -- Backend 2's real /api/grid/mutate
// has no notion of "type" or "radius" itself, only an explicit changed_cells
// + blocked list, so a radius-N circular drop has to be expanded into one
// client-side before it can be sent.
function buildCircleCells(cx: number, cy: number, radius: number, width: number, height: number) {
  const changed_cells: GridCoord[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          changed_cells.push([x, y]);
        }
      }
    }
  }
  return { changed_cells, blocked: changed_cells.map(() => true) };
}

function createPinMesh(color: number): THREE.Group {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 4, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
  );
  stem.position.y = 2;
  group.add(stem);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
  );
  head.position.y = 4.3;
  group.add(head);
  return group;
}

function createHazardMarker(radius: number): THREE.Group {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  disc.rotation.x = -Math.PI / 2;
  group.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.25, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xff5500 })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  return group;
}

function disposeGroup(scene: THREE.Scene, group: THREE.Object3D | null) {
  if (!group) return;
  scene.remove(group);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
}

function drawPathLine(scene: THREE.Scene, path: GridCoord[], grid: WayanadGrid, color: number, yOffset: number): THREE.Line {
  const half = grid.width / 2;
  const points = path.map(([x, y]) => {
    const elevM = grid.elevation[Math.min(y, grid.height - 1)]?.[Math.min(x, grid.width - 1)] ?? 0;
    return new THREE.Vector3(x - half, elevM * VISUAL_ELEVATION_EXAGGERATION + yOffset, y - half);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, linewidth: 3 });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  return line;
}

const statusCopy: Record<MissionStatus, { label: string; className: string }> = {
  IDLE: { label: 'IDLE // AWAITING BASECAMP + VICTIM', className: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/40' },
  ROUTING: { label: 'ROUTING // PLAN COMPUTED', className: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40' },
  SEISMIC_SHIFT_DETECTED: {
    label: 'SEISMIC SHIFT DETECTED',
    className: 'text-rose-300 border-rose-500/50 bg-rose-950/50 animate-pulse',
  },
  REROUTED: { label: 'REROUTED // D* LITE REPAIR COMPLETE', className: 'text-amber-300 border-amber-500/40 bg-amber-950/40' },
};

export const WayanadMission: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const basecampPinRef = useRef<THREE.Group | null>(null);
  const victimPinRef = useRef<THREE.Group | null>(null);
  const astarLineRef = useRef<THREE.Line | null>(null);
  const dstarLineRef = useRef<THREE.Line | null>(null);
  const hazardMarkerRef = useRef<THREE.Group | null>(null);
  const manualHazardMarkersRef = useRef<THREE.Group[]>([]);
  const gridRef = useRef<WayanadGrid | null>(null);
  const landslideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gridLoaded, setGridLoaded] = useState(false);
  const [basecamp, setBasecamp] = useState<GridCoord | null>(null);
  const [victim, setVictim] = useState<GridCoord | null>(null);
  const [status, setStatus] = useState<MissionStatus>('IDLE');
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('route');
  const [astarBenchmark, setAstarBenchmark] = useState<AlgoBenchmark | null>(null);
  const [dstarBenchmark, setDstarBenchmark] = useState<AlgoBenchmark | null>(null);
  const [astarPathData, setAstarPathData] = useState<GridCoord[] | null>(null);
  const [dstarPathData, setDstarPathData] = useState<GridCoord[] | null>(null);
  const [hazardsAvoidedCount, setHazardsAvoidedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Scene/camera/renderer setup -- single full-screen viewport, unlike
  // CommandCenter's dual scissor split, since this page is its own route.
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f14);
    scene.fog = new THREE.FogExp2(0x0a0f14, 0.004);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
    camera.position.set(0, 140, 160);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    // Left is reserved entirely for our own raycaster (basecamp/victim pins,
    // obstacle drops) -- see the event.button guard in handlePointerDown.
    // Right rotates, middle/scroll still dollies (zoom is independent of
    // this mapping and works regardless).
    controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff2e0, 1.4);
    sun.position.set(120, 180, 80);
    sun.castShadow = true;
    sun.shadow.camera.left = -160;
    sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 500;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    let animId: number;
    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      controls.update();
      renderer.render(scene, camera);
    };
    renderLoop();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (landslideTimeoutRef.current) clearTimeout(landslideTimeoutRef.current);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  // Fetch the pre-ingested grid, smooth it, build the textured terrain, and
  // push it onto Backend 2 -- required before /api/plan/baseline will
  // accept a request (EngineState.require_grid() 400s otherwise). Backend 2
  // holds one global grid for the whole process (see its own EngineState
  // docstring), so this always re-pushes on mount rather than assuming it's
  // still there from a previous visit to this page.
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    let cancelled = false;

    (async () => {
      try {
        const gridResp = await fetch('/wayanad_grid.json');
        if (!gridResp.ok) throw new Error(`Failed to load wayanad_grid.json (${gridResp.status})`);
        const rawGrid: WayanadGrid = await gridResp.json();
        if (cancelled) return;

        // One-pass 3x3 box blur, applied before both the mesh and Backend 2
        // see it -- see boxBlur3x3's doc comment for why the same smoothed
        // copy feeds both.
        const grid: WayanadGrid = { ...rawGrid, elevation: boxBlur3x3(rawGrid.elevation) };
        gridRef.current = grid;

        const geometry = new THREE.PlaneGeometry(grid.width, grid.height, grid.width - 1, grid.height - 1);
        geometry.rotateX(-Math.PI / 2);
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const col = i % grid.width;
          const row = Math.floor(i / grid.width);
          const elevM = grid.elevation[row]?.[col] ?? 0;
          pos.setY(i, elevM * VISUAL_ELEVATION_EXAGGERATION);
        }
        geometry.computeVertexNormals();

        const texture = new THREE.TextureLoader().load('/wayanad_satellite.png');
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.9,
          metalness: 0.05,
          flatShading: false,
        });

        const terrain = new THREE.Mesh(geometry, material);
        terrain.receiveShadow = true;
        scene.add(terrain);
        terrainMeshRef.current = terrain;

        const resp = await fetch('/api/grid/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            width: grid.width,
            height: grid.height,
            resolution: grid.resolution,
            obstacles: grid.obstacles.flatMap((row, y) => row.flatMap((blocked, x) => (blocked ? [[x, y]] : []))),
            elevation: grid.elevation,
          }),
        });
        if (!resp.ok) throw new Error(`Backend 2 /api/grid/init failed (${resp.status})`);
        if (!cancelled) setGridLoaded(true);
      } catch (err) {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const planRoute = async (start: GridCoord, goal: GridCoord) => {
    if (!sceneRef.current || !gridRef.current) return;
    setStatus('ROUTING');
    setErrorMessage(null);
    try {
      const resp = await fetch('/api/plan/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, goal }),
      });
      if (!resp.ok) throw new Error(`/api/plan/baseline failed (${resp.status})`);
      const data = await resp.json();
      if (!data.found) throw new Error('No path found between basecamp and victim location');

      const path: GridCoord[] = data.path;

      disposeGroup(sceneRef.current, astarLineRef.current);
      disposeGroup(sceneRef.current, dstarLineRef.current);
      // /api/plan/baseline only returns A*'s own result -- D* Lite is
      // silently (re)initialized to this same start/goal server-side (see
      // routers/plan.py), so its path is identical to A*'s until the first
      // incremental repair diverges them. Drawn as two separate lines
      // (slightly offset in Y) so the reroute below is visible as the cyan
      // line peeling away from the frozen red baseline.
      astarLineRef.current = drawPathLine(sceneRef.current, path, gridRef.current, 0xff3b3b, 0.4) as THREE.Line;
      dstarLineRef.current = drawPathLine(sceneRef.current, path, gridRef.current, 0x00e5ff, 0.6) as THREE.Line;

      setAstarPathData(path);
      setDstarPathData(path);
      setAstarBenchmark(toBenchmark(data.length, data.compute_time_ms));
      setDstarBenchmark(toBenchmark(data.length, data.compute_time_ms));
      setHazardsAvoidedCount(0);

      if (landslideTimeoutRef.current) clearTimeout(landslideTimeoutRef.current);
      landslideTimeoutRef.current = setTimeout(() => triggerLandslide(path, start), LANDSLIDE_DELAY_MS);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('IDLE');
    }
  };

  const triggerLandslide = async (pathAtScheduleTime: GridCoord[], currentPosition: GridCoord) => {
    if (!sceneRef.current || !gridRef.current || pathAtScheduleTime.length === 0) return;
    setStatus('SEISMIC_SHIFT_DETECTED');

    const [mx, my] = pathAtScheduleTime[Math.floor(pathAtScheduleTime.length / 2)];
    const { changed_cells, blocked } = buildCircleCells(mx, my, MUTATE_RADIUS, gridRef.current.width, gridRef.current.height);

    disposeGroup(sceneRef.current, hazardMarkerRef.current);
    const hazard = createHazardMarker(MUTATE_RADIUS);
    const half = gridRef.current.width / 2;
    const elevM = gridRef.current.elevation[my]?.[mx] ?? 0;
    hazard.position.set(mx - half, elevM * VISUAL_ELEVATION_EXAGGERATION + 0.2, my - half);
    sceneRef.current.add(hazard);
    hazardMarkerRef.current = hazard;

    try {
      const resp = await fetch('/api/grid/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changed_cells, blocked, current_position: currentPosition }),
      });
      if (!resp.ok) throw new Error(`/api/grid/mutate failed (${resp.status})`);
      const data = await resp.json();
      if (!data.found || !sceneRef.current || !gridRef.current) {
        // dstarBenchmark/dstarPathData deliberately left untouched here --
        // the last successful repair should keep showing rather than
        // blanking out just because this particular one failed.
        setErrorMessage('D* Lite could not find a repaired route around the landslide');
        return;
      }

      const newPath: GridCoord[] = data.path;
      disposeGroup(sceneRef.current, dstarLineRef.current);
      dstarLineRef.current = drawPathLine(sceneRef.current, newPath, gridRef.current, 0x00e5ff, 0.6) as THREE.Line;
      setDstarPathData(newPath);
      setDstarBenchmark(toBenchmark(pathLength(newPath), data.replan_latency_ms));
      if (data.path_changed) setHazardsAvoidedCount((c) => c + 1);
      setStatus('REROUTED');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  // Manual "Drop Obstacle Mode" click -- same /api/grid/mutate contract as
  // the scripted landslide, but at the clicked cell and only reachable once
  // a route already exists (D* Lite has nothing to repair otherwise; see
  // the disabled-button guard in the JSX and Backend 2's own 400 for this
  // exact precondition in routers/grid.py).
  const dropObstacleAt = async (gridX: number, gridY: number, point: THREE.Vector3) => {
    if (!sceneRef.current || !gridRef.current || !basecamp) return;
    const { changed_cells, blocked } = buildCircleCells(gridX, gridY, MUTATE_RADIUS, gridRef.current.width, gridRef.current.height);

    const hazard = createHazardMarker(MUTATE_RADIUS);
    hazard.position.set(point.x, point.y + 0.2, point.z);
    sceneRef.current.add(hazard);
    manualHazardMarkersRef.current.push(hazard);

    try {
      const resp = await fetch('/api/grid/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changed_cells, blocked, current_position: basecamp }),
      });
      if (!resp.ok) throw new Error(`/api/grid/mutate failed (${resp.status})`);
      const data = await resp.json();
      if (!data.found || !sceneRef.current || !gridRef.current) {
        setErrorMessage('D* Lite could not find a route around this obstacle');
        return;
      }

      const newPath: GridCoord[] = data.path;
      disposeGroup(sceneRef.current, dstarLineRef.current);
      dstarLineRef.current = drawPathLine(sceneRef.current, newPath, gridRef.current, 0x00e5ff, 0.6) as THREE.Line;
      setDstarPathData(newPath);
      setDstarBenchmark(toBenchmark(pathLength(newPath), data.replan_latency_ms));
      if (data.path_changed) setHazardsAvoidedCount((c) => c + 1);
      setStatus('REROUTED');
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    // Left-click only -- right button is reserved for OrbitControls' rotate
    // (see controls.mouseButtons above), so this must not also raycast.
    if (event.button !== 0) return;
    if (!sceneRef.current || !cameraRef.current || !terrainMeshRef.current || !rendererRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const normX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normX, normY), cameraRef.current);
    const intersects = raycaster.intersectObject(terrainMeshRef.current);
    if (intersects.length === 0) return;

    const pt = intersects[0].point;
    const half = GRID_SIZE / 2;
    const gridX = Math.min(GRID_SIZE - 1, Math.max(0, Math.round(pt.x + half)));
    const gridY = Math.min(GRID_SIZE - 1, Math.max(0, Math.round(pt.z + half)));
    const scene = sceneRef.current;

    if (interactionMode === 'obstacle') {
      if (astarBenchmark) dropObstacleAt(gridX, gridY, pt);
      return;
    }

    if (basecamp && victim) {
      // Both pins already placed -- a further click starts a fresh 2-click
      // cycle rather than being ignored, so the cinematic sequence can be
      // replayed without reloading the page.
      if (landslideTimeoutRef.current) clearTimeout(landslideTimeoutRef.current);
      disposeGroup(scene, victimPinRef.current);
      disposeGroup(scene, astarLineRef.current);
      disposeGroup(scene, dstarLineRef.current);
      disposeGroup(scene, hazardMarkerRef.current);
      manualHazardMarkersRef.current.forEach((marker) => disposeGroup(scene, marker));
      manualHazardMarkersRef.current = [];
      victimPinRef.current = null;
      astarLineRef.current = null;
      dstarLineRef.current = null;
      hazardMarkerRef.current = null;
      setVictim(null);
      setAstarBenchmark(null);
      setDstarBenchmark(null);
      setAstarPathData(null);
      setDstarPathData(null);
      setHazardsAvoidedCount(0);
      setErrorMessage(null);
      setStatus('IDLE');
      setInteractionMode('route');

      disposeGroup(scene, basecampPinRef.current);
      const pin = createPinMesh(0x39ff88);
      pin.position.set(pt.x, pt.y, pt.z);
      scene.add(pin);
      basecampPinRef.current = pin;
      setBasecamp([gridX, gridY]);
    } else if (!basecamp) {
      const pin = createPinMesh(0x39ff88);
      pin.position.set(pt.x, pt.y, pt.z);
      scene.add(pin);
      basecampPinRef.current = pin;
      setBasecamp([gridX, gridY]);
    } else {
      const pin = createPinMesh(0xff3355);
      pin.position.set(pt.x, pt.y, pt.z);
      scene.add(pin);
      victimPinRef.current = pin;
      setVictim([gridX, gridY]);
      planRoute(basecamp, [gridX, gridY]);
    }
  };

  const statusInfo = statusCopy[status];

  const routingAnalysis = useMemo(() => {
    if (!astarPathData || !dstarPathData || !astarBenchmark || !dstarBenchmark || !gridRef.current) return null;
    return buildRoutingAnalysis(astarPathData, dstarPathData, gridRef.current, astarBenchmark, dstarBenchmark, hazardsAvoidedCount);
  }, [astarPathData, dstarPathData, astarBenchmark, dstarBenchmark, hazardsAvoidedCount]);

  const resolutionM = gridRef.current?.resolution ?? 1.0;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full ${interactionMode === 'obstacle' ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
      />

      {!gridLoaded && !errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-cyan-300 text-sm">
          LOADING WAYANAD DIGITAL TWIN...
        </div>
      )}

      {/* Interaction mode toolbar */}
      {gridLoaded && (
        <div className="absolute top-6 left-6 flex flex-col gap-1.5 bg-neutral-950/80 border border-cyan-900/40 p-2 rounded backdrop-blur-md font-mono text-xs">
          <div className="text-[10px] text-neutral-500 uppercase tracking-widest px-1">Interaction Mode</div>
          <button
            onClick={() => setInteractionMode('route')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${
              interactionMode === 'route'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-neutral-900/80 border-neutral-700/60 text-neutral-400 hover:text-white'
            }`}
          >
            <Route className="w-3.5 h-3.5" /> Set Route Mode
          </button>
          <button
            onClick={() => astarBenchmark && setInteractionMode('obstacle')}
            disabled={!astarBenchmark}
            title={astarBenchmark ? 'Left-click the terrain to drop an obstacle' : 'Plan a route first -- D* Lite needs an active path to repair'}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${
              !astarBenchmark
                ? 'bg-neutral-900/40 border-neutral-800 text-neutral-600 cursor-not-allowed'
                : interactionMode === 'obstacle'
                  ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                  : 'bg-neutral-900/80 border-neutral-700/60 text-neutral-400 hover:text-white'
            }`}
          >
            <Ban className="w-3.5 h-3.5" /> Drop Obstacle Mode
          </button>
        </div>
      )}

      {!basecamp && gridLoaded && interactionMode === 'route' && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 border border-emerald-500/40 rounded font-mono text-xs text-emerald-300">
          CLICK THE TERRAIN TO DROP BASECAMP
        </div>
      )}
      {basecamp && !victim && interactionMode === 'route' && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 border border-rose-500/40 rounded font-mono text-xs text-rose-300">
          CLICK AGAIN TO MARK VICTIM LOCATION
        </div>
      )}
      {interactionMode === 'obstacle' && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 border border-rose-500/40 rounded font-mono text-xs text-rose-300">
          LEFT-CLICK TERRAIN TO DROP OBSTACLE // RIGHT-DRAG TO ORBIT
        </div>
      )}

      {/* Glassmorphism overlay panel */}
      <div className="absolute top-6 right-6 w-80 bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-4 font-mono text-xs text-white shadow-2xl max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="text-sm font-bold tracking-wider mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-300" /> WAYANAD DIGITAL TWIN
        </div>

        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded border mb-4 text-[11px] font-bold ${statusInfo.className}`}>
          {status === 'SEISMIC_SHIFT_DETECTED' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
          {statusInfo.label}
        </div>

        <div className="space-y-1.5 text-neutral-300 mb-4">
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <MapPin className="w-3 h-3" /> BASECAMP
            </span>
            <span>{basecamp ? `(${basecamp[0]}, ${basecamp[1]})` : '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5 text-rose-400">
              <Skull className="w-3 h-3" /> VICTIM
            </span>
            <span>{victim ? `(${victim[0]}, ${victim[1]})` : '--'}</span>
          </div>
        </div>

        <div className="border-t border-white/10 pt-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">Live Benchmark</div>
          <div className="grid grid-cols-4 gap-y-1.5 text-[10px] text-center">
            <div className="text-left text-neutral-500">METRIC</div>
            <div className="text-rose-400">A*</div>
            <div className="text-cyan-400">D* LITE</div>
            <div className="text-neutral-500"> </div>

            <div className="text-left text-neutral-400">Distance</div>
            <div>{astarBenchmark ? `${astarBenchmark.distance.toFixed(1)}u` : '--'}</div>
            <div>{dstarBenchmark ? `${dstarBenchmark.distance.toFixed(1)}u` : '--'}</div>
            <div />

            <div className="text-left text-neutral-400">Est. Fuel</div>
            <div>{astarBenchmark ? `${astarBenchmark.fuelEstimateL.toFixed(2)}L` : '--'}</div>
            <div>{dstarBenchmark ? `${dstarBenchmark.fuelEstimateL.toFixed(2)}L` : '--'}</div>
            <div />

            <div className="text-left text-neutral-400">Fuel Eff. (L/km)</div>
            <div>{astarBenchmark ? fuelEfficiencyLPerKm(astarBenchmark, resolutionM, 0).toFixed(2) : '--'}</div>
            <div>{dstarBenchmark ? fuelEfficiencyLPerKm(dstarBenchmark, resolutionM, hazardsAvoidedCount).toFixed(2) : '--'}</div>
            <div />

            <div className="text-left text-neutral-400">Hazards Avoided</div>
            <div>{astarBenchmark ? '0' : '--'}</div>
            <div>{dstarBenchmark ? hazardsAvoidedCount : '--'}</div>
            <div />

            <div className="text-left text-neutral-400">Latency</div>
            <div>{astarBenchmark ? `${astarBenchmark.latencyMs.toFixed(2)}ms` : '--'}</div>
            <div className="font-bold text-cyan-300">{dstarBenchmark ? `${dstarBenchmark.latencyMs.toFixed(2)}ms` : '--'}</div>
            <div />
          </div>
          {dstarBenchmark && astarBenchmark && status === 'REROUTED' && (
            <div className="mt-2 text-[10px] text-amber-300">
              {(() => {
                // A large-radius obstacle drop can force D* Lite to re-evaluate
                // more of the search space than a short, mostly-open cold-start
                // A* plan took in the first place -- report whichever direction
                // this specific run actually went, rather than always framing
                // it as a D* Lite win.
                const ratio = astarBenchmark.latencyMs / Math.max(0.01, dstarBenchmark.latencyMs);
                return ratio >= 1
                  ? `D* Lite repaired ${ratio.toFixed(1)}x faster than a fresh cold-start plan.`
                  : `D* Lite's repair took ${(1 / ratio).toFixed(1)}x longer than the original cold-start plan on this route.`;
              })()}
            </div>
          )}
        </div>

        {routingAnalysis && (
          <div className="border-t border-white/10 pt-3 mt-3">
            <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FileBarChart className="w-3 h-3" /> Tactical Routing Analysis
            </div>
            <p className="text-[10px] text-neutral-300 leading-relaxed">{routingAnalysis}</p>
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 pt-3 border-t border-rose-500/30 text-[10px] text-rose-300 break-words">{errorMessage}</div>
        )}

        {(basecamp || victim) && (
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full flex items-center justify-center gap-1.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[10px] transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> RESET MISSION
          </button>
        )}
      </div>
    </div>
  );
};
