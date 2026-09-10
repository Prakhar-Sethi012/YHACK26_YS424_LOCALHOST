import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapPin, Skull, Activity, Zap, AlertTriangle, RotateCcw } from 'lucide-react';

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
  const gridRef = useRef<WayanadGrid | null>(null);
  const landslideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gridLoaded, setGridLoaded] = useState(false);
  const [basecamp, setBasecamp] = useState<GridCoord | null>(null);
  const [victim, setVictim] = useState<GridCoord | null>(null);
  const [status, setStatus] = useState<MissionStatus>('IDLE');
  const [astarBenchmark, setAstarBenchmark] = useState<AlgoBenchmark | null>(null);
  const [dstarBenchmark, setDstarBenchmark] = useState<AlgoBenchmark | null>(null);
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

  // Fetch the pre-ingested grid, build the textured terrain, and push it
  // onto Backend 2 -- required before /api/plan/baseline will accept a
  // request (EngineState.require_grid() 400s otherwise). Backend 2 holds one
  // global grid for the whole process (see its own EngineState docstring),
  // so this always re-pushes on mount rather than assuming it's still there
  // from a previous visit to this page.
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    let cancelled = false;

    (async () => {
      try {
        const gridResp = await fetch('/wayanad_grid.json');
        if (!gridResp.ok) throw new Error(`Failed to load wayanad_grid.json (${gridResp.status})`);
        const grid: WayanadGrid = await gridResp.json();
        if (cancelled) return;
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
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.05 });

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

      setAstarBenchmark(toBenchmark(data.length, data.compute_time_ms));
      setDstarBenchmark(toBenchmark(data.length, data.compute_time_ms));

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
        setErrorMessage('D* Lite could not find a repaired route around the landslide');
        return;
      }

      const newPath: GridCoord[] = data.path;
      disposeGroup(sceneRef.current, dstarLineRef.current);
      dstarLineRef.current = drawPathLine(sceneRef.current, newPath, gridRef.current, 0x00e5ff, 0.6) as THREE.Line;
      setDstarBenchmark(toBenchmark(pathLength(newPath), data.replan_latency_ms));
      setStatus('REROUTED');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePointerDown = (event: React.PointerEvent) => {
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

    if (basecamp && victim) {
      // Both pins already placed -- a further click starts a fresh 2-click
      // cycle rather than being ignored, so the cinematic sequence can be
      // replayed without reloading the page.
      if (landslideTimeoutRef.current) clearTimeout(landslideTimeoutRef.current);
      disposeGroup(scene, victimPinRef.current);
      disposeGroup(scene, astarLineRef.current);
      disposeGroup(scene, dstarLineRef.current);
      disposeGroup(scene, hazardMarkerRef.current);
      victimPinRef.current = null;
      astarLineRef.current = null;
      dstarLineRef.current = null;
      hazardMarkerRef.current = null;
      setVictim(null);
      setAstarBenchmark(null);
      setDstarBenchmark(null);
      setErrorMessage(null);
      setStatus('IDLE');

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

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      <div ref={containerRef} onPointerDown={handlePointerDown} className="w-full h-full cursor-crosshair" />

      {!gridLoaded && !errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-cyan-300 text-sm">
          LOADING WAYANAD DIGITAL TWIN...
        </div>
      )}

      {!basecamp && gridLoaded && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 border border-emerald-500/40 rounded font-mono text-xs text-emerald-300">
          CLICK THE TERRAIN TO DROP BASECAMP
        </div>
      )}
      {basecamp && !victim && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 border border-rose-500/40 rounded font-mono text-xs text-rose-300">
          CLICK AGAIN TO MARK VICTIM LOCATION
        </div>
      )}

      {/* Glassmorphism overlay panel */}
      <div className="absolute top-6 right-6 w-80 bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-4 font-mono text-xs text-white shadow-2xl">
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
