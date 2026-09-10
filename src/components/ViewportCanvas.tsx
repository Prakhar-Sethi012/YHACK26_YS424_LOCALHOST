import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useMissionStore } from '../store/useMissionStore';

export const ViewportCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { initialState, activeTool, sendDropObstacle, sendAddHeatZone } = useMissionStore();

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const tacticalCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const chaseCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const roverMeshRef = useRef<THREE.Group | null>(null);
  const pathLineRef = useRef<THREE.Line | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const dynamicObstacleMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const victimMarkersRef = useRef<Map<string, THREE.Group>>(new Map());

  // Initialization: Scene, Cameras, Renderer
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090e);
    scene.fog = new THREE.FogExp2(0x06090e, 0.008);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Viewport A: Orbital Tactical Camera
    const tacticalCam = new THREE.PerspectiveCamera(45, (width * 0.65) / height, 0.1, 1000);
    tacticalCam.position.set(0, 85, 75);
    tacticalCam.lookAt(0, 0, 0);
    tacticalCameraRef.current = tacticalCam;

    const controls = new OrbitControls(tacticalCam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controlsRef.current = controls;

    // Viewport B: Rover Chase Camera
    const chaseCam = new THREE.PerspectiveCamera(55, (width * 0.35) / height, 0.1, 500);
    chaseCameraRef.current = chaseCam;

    // Ambient and Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xddeeff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Rover Marker Mesh
    const roverGroup = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.8, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x00f0ff, metalness: 0.8, roughness: 0.2 })
    );
    chassis.position.y = 0.6;
    chassis.castShadow = true;
    roverGroup.add(chassis);

    // Rover Sensor Mast / LiDAR Puck
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0055 })
    );
    puck.position.y = 1.3;
    roverGroup.add(puck);

    // Headlights
    const spotLight = new THREE.SpotLight(0xffffff, 4.0, 35, Math.PI / 5, 0.3);
    spotLight.position.set(0, 1.0, 1.2);
    spotLight.target.position.set(0, 0, 10);
    roverGroup.add(spotLight);
    roverGroup.add(spotLight.target);

    scene.add(roverGroup);
    roverMeshRef.current = roverGroup;

    // Animation Loop with Scissor Split
    let animId: number;
    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      controls.update();

      const w = containerRef.current?.clientWidth || window.innerWidth;
      const h = containerRef.current?.clientHeight || window.innerHeight;
      renderer.setScissorTest(true);

      // --- VIEWPORT A: TACTICAL (LEFT 65%) ---
      const wA = Math.floor(w * 0.65);
      renderer.setViewport(0, 0, wA, h);
      renderer.setScissor(0, 0, wA, h);
      tacticalCam.aspect = wA / h;
      tacticalCam.updateProjectionMatrix();
      renderer.render(scene, tacticalCam);

      // --- VIEWPORT B: CHASE POV (RIGHT 35%) ---
      const wB = w - wA;
      renderer.setViewport(wA, 0, wB, h);
      renderer.setScissor(wA, 0, wB, h);
      chaseCam.aspect = wB / h;
      chaseCam.updateProjectionMatrix();
      renderer.render(scene, chaseCam);
    };
    renderLoop();

    const handleResize = () => {
      if (!containerRef.current) return;
      const rw = containerRef.current.clientWidth;
      const rh = containerRef.current.clientHeight;
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  // Build Terrain Mesh on Initial State
  useEffect(() => {
    if (!initialState || !sceneRef.current) return;
    const scene = sceneRef.current;

    if (terrainMeshRef.current) {
      scene.remove(terrainMeshRef.current);
    }

    const { width, height, elevation, temperature, obstacles } = initialState;
    const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const col = i % width;
      const row = Math.floor(i / width);
      const zVal = elevation[row]?.[col] ?? 0;
      pos.setY(i, zVal);

      // Vertex color blending: Heat Zones (Red) + Impassable (Dark Grey) + Traversal (Slate Blue)
      const temp = temperature[row]?.[col] ?? 20;
      const isBlocked = obstacles[row]?.[col] ?? false;

      if (isBlocked) {
        colors[i * 3] = 0.15;
        colors[i * 3 + 1] = 0.15;
        colors[i * 3 + 2] = 0.18;
      } else if (temp > 45) {
        const heatFactor = Math.min(1.0, (temp - 45) / 40);
        colors[i * 3] = 0.9 * heatFactor + 0.1;
        colors[i * 3 + 1] = 0.2 * (1 - heatFactor);
        colors[i * 3 + 2] = 0.1;
      } else {
        const normZ = (zVal + 10) / 24;
        colors[i * 3] = 0.12 + 0.1 * normZ;
        colors[i * 3 + 1] = 0.18 + 0.2 * normZ;
        colors[i * 3 + 2] = 0.25 + 0.3 * normZ;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1,
      wireframe: false,
    });

    const terrainMesh = new THREE.Mesh(geometry, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;
  }, [initialState]);

  // Subscribe directly to telemetry stream for smooth 20Hz transforms without React re-renders
  useEffect(() => {
    const unsubscribe = useMissionStore.subscribe((state) => {
      const telem = state.telemetry;
      if (!telem || !roverMeshRef.current || !chaseCameraRef.current) return;

      const { pose, path, dynamic_obstacles } = telem;
      // Convert grid coordinate (0..100) to Three.js world space (-50..50)
      const worldX = pose.x - 50;
      const worldZ = pose.y - 50;
      const worldY = telem.environment.elevation;

      roverMeshRef.current.position.set(worldX, worldY, worldZ);
      roverMeshRef.current.rotation.y = -pose.heading_rad - Math.PI / 2;

      // Update TPP Chase Camera Position
      const chaseOffset = new THREE.Vector3(0, 3.5, -6.5);
      chaseOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), roverMeshRef.current.rotation.y);
      chaseCameraRef.current.position.set(worldX + chaseOffset.x, worldY + chaseOffset.y, worldZ + chaseOffset.z);
      chaseCameraRef.current.lookAt(worldX, worldY + 1.2, worldZ);

      // Render 3D Smoothed Trajectory Line
      if (sceneRef.current && path && path.length > 0) {
        if (pathLineRef.current) {
          sceneRef.current.remove(pathLineRef.current);
          pathLineRef.current.geometry.dispose();
        }

        const points = path.map((p) => new THREE.Vector3(p[0] - 50, p[2] + 0.25, p[1] - 50));
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
          color: telem.power.is_critical_reserve ? 0xffaa00 : 0x00f0ff,
          linewidth: 3,
        });

        const lineMesh = new THREE.Line(lineGeo, lineMat);
        sceneRef.current.add(lineMesh);
        pathLineRef.current = lineMesh;
      }

      // Update Dynamic Obstacles
      if (sceneRef.current && dynamic_obstacles) {
        dynamic_obstacles.forEach((obs, idx) => {
          let mesh = dynamicObstacleMeshesRef.current.get(idx);
          if (!mesh) {
            mesh = new THREE.Mesh(
              new THREE.SphereGeometry(obs.radius || 1.2, 16, 16),
              new THREE.MeshStandardMaterial({ color: 0xff3344, roughness: 0.3 })
            );
            sceneRef.current?.add(mesh);
            dynamicObstacleMeshesRef.current.set(idx, mesh);
          }
          mesh.position.set(obs.x - 50, 1.5, obs.y - 50);
        });

        // Evict meshes for obstacle slots the server no longer reports (e.g. an
        // obstacle that left the map) -- without this, stale spheres from a
        // shorter dynamic_obstacles array stay parked in the scene forever.
        dynamicObstacleMeshesRef.current.forEach((mesh, idx) => {
          if (idx >= dynamic_obstacles.length) {
            sceneRef.current?.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
            dynamicObstacleMeshesRef.current.delete(idx);
          }
        });
      }

      // Render Revealed Victims (Fog-of-war compliance)
      if (sceneRef.current && state.detectedVictims.size > 0) {
        state.detectedVictims.forEach((victim, id) => {
          if (!victimMarkersRef.current.has(id) && sceneRef.current) {
            const vGroup = new THREE.Group();
            const beacon = new THREE.Mesh(
              new THREE.OctahedronGeometry(1.2),
              new THREE.MeshBasicMaterial({ color: 0x39ff14, wireframe: true })
            );
            beacon.position.y = 2.0;
            vGroup.add(beacon);
            vGroup.position.set(victim.target_coordinates.x - 50, victim.target_coordinates.elevation, victim.target_coordinates.y - 50);
            sceneRef.current.add(vGroup);
            victimMarkersRef.current.set(id, vGroup);
          }
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Raycaster Pointer Interaction for God-Mode Sculpting
  const handlePointerDown = (event: React.PointerEvent) => {
    if (activeTool === 'select' || !rendererRef.current || !tacticalCameraRef.current || !terrainMeshRef.current) {
      return;
    }

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;

    // Constrain tool clicks strictly to Viewport A (Left 65%)
    if (xRatio > 0.65) return;

    const normX = (xRatio / 0.65) * 2 - 1;
    const normY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normX, normY), tacticalCameraRef.current);
    const intersects = raycaster.intersectObject(terrainMeshRef.current);

    if (intersects.length > 0) {
      const pt = intersects[0].point;
      const gridX = Math.round(pt.x + 50);
      const gridY = Math.round(pt.z + 50);

      if (activeTool === 'drop_obstacle') {
        sendDropObstacle(gridX, gridY, 3);
      } else if (activeTool === 'add_heat_zone') {
        sendAddHeatZone(gridX, gridY, 85, 6.0);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className="relative w-full h-full cursor-crosshair overflow-hidden select-none"
    />
  );
};
