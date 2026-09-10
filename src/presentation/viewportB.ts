import * as THREE from "three";

export function mountViewportB(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 3, -8);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const rover = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x2bd576 }),
  );
  scene.add(rover);

  const light = new THREE.SpotLight(0xffffff, 5);
  light.position.set(0, 5, -5);
  scene.add(light);

  function resize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener("resize", resize);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  return { scene, camera, renderer, rover };
}
