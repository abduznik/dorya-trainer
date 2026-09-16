import * as THREE from 'three';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0d);
  scene.fog = new THREE.Fog(0x0b0b0d, 9, 24);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const target = new THREE.Vector3(0.9, 0.95, 0);
  const orbit = { yaw: 0.18, pitch: 0.2, dist: 5.8 };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x101012, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(4, 3, -5);
  scene.add(rim);

  // endless floor: the plane and grid are re-centred on the player every frame
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(80, 80, 0x3a3a40, 0x26262b);
  grid.position.y = 0.003;
  scene.add(grid);
  scene.add(key.target);
  let followX = 0;

  // ---- mouse orbit (left drag) + wheel zoom ----
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { dragging = true; lx = e.clientX; ly = e.clientY; } });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    orbit.yaw -= (e.clientX - lx) * 0.006;
    orbit.pitch = Math.min(1.25, Math.max(0.03, orbit.pitch + (e.clientY - ly) * 0.005));
    lx = e.clientX; ly = e.clientY;
  });
  let zoomUser = 1;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomUser = Math.min(2.2, Math.max(0.5, zoomUser * (1 + Math.sign(e.deltaY) * 0.1)));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  let shake = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer, scene, camera,
    shake(amount) { shake = Math.max(shake, amount); },
    // keep the camera, lights and floor centred on the player
    follow(x, dt, spread = 2.3) {
      followX += (x - followX) * Math.min(1, dt * 5);
      target.x = followX + 0.9;
      // pull back a little when the two are far apart
      const want = (5.8 + Math.max(0, spread - 2.3) * 0.5) * zoomUser;
      orbit.dist += (Math.min(12, Math.max(2.5, want)) - orbit.dist) * Math.min(1, dt * 2);
      floor.position.x = followX;
      grid.position.x = Math.round(followX); // snap so grid lines do not slide
      key.position.set(followX - 3, 6, 4);
      key.target.position.set(followX, 0, 0);
    },
    render(dt) {
      const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
      camera.position.set(
        target.x + Math.sin(orbit.yaw) * cp * orbit.dist,
        target.y + sp * orbit.dist,
        target.z + Math.cos(orbit.yaw) * cp * orbit.dist,
      );
      if (shake > 0) {
        shake = Math.max(0, shake - dt * 1.4);
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }
      camera.lookAt(target);
      renderer.render(scene, camera);
    },
  };
}
