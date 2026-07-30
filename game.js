import * as THREE from 'three';

const CHUNK_SIZE = 16;
const RENDER_DISTANCE = 64;
const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 6;
const JUMP_FORCE = 7;
const GRAVITY = 20;
const MOUSE_SENSITIVITY = 0.002;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xbbbbbb });

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const edgeGeometry = new THREE.EdgesGeometry(blockGeometry);

const chunks = new Map();
const keys = {};
let pitch = 0;
let yaw = 0;
let locked = false;

const playerPos = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
const velocity = new THREE.Vector3(0, 0, 0);
let onGround = true;

const overlay = document.getElementById('overlay');

overlay.addEventListener('click', () => {
  overlay.style.display = 'none';
  document.body.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  locked = !!document.pointerLockElement;
  if (!locked) {
    overlay.style.display = 'flex';
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  yaw -= e.movementX * MOUSE_SENSITIVITY;
  pitch -= e.movementY * MOUSE_SENSITIVITY;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
});

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
});

document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function chunkKey(cx, cz) {
  return cx + ',' + cz;
}

function createChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return;

  const count = CHUNK_SIZE * CHUNK_SIZE;
  const cubeMesh = new THREE.InstancedMesh(blockGeometry, cubeMaterial, count);
  const edgeMesh = new THREE.InstancedMesh(edgeGeometry, edgeMaterial, count);

  const mat = new THREE.Matrix4();
  let i = 0;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wz = cz * CHUNK_SIZE + lz;
      mat.setPosition(wx, 0, wz);
      cubeMesh.setMatrixAt(i, mat);
      edgeMesh.setMatrixAt(i, mat);
      i++;
    }
  }

  cubeMesh.instanceMatrix.needsUpdate = true;
  edgeMesh.instanceMatrix.needsUpdate = true;

  scene.add(cubeMesh);
  scene.add(edgeMesh);

  chunks.set(key, { cubeMesh, edgeMesh, cx, cz });
}

function removeChunk(key) {
  const chunk = chunks.get(key);
  if (!chunk) return;
  scene.remove(chunk.cubeMesh);
  scene.remove(chunk.edgeMesh);
  chunk.cubeMesh.dispose();
  chunk.edgeMesh.dispose();
  chunks.delete(key);
}

function updateChunks() {
  const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
  const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
  const chunkRadius = Math.ceil(RENDER_DISTANCE / CHUNK_SIZE);

  const needed = new Set();

  for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
      const cx = pcx + dx;
      const cz = pcz + dz;

      const worldCX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const worldCZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      const dist = Math.sqrt(
        (worldCX - playerPos.x) ** 2 + (worldCZ - playerPos.z) ** 2
      );

      if (dist <= RENDER_DISTANCE) {
        const key = chunkKey(cx, cz);
        needed.add(key);
        if (!chunks.has(key)) {
          createChunk(cx, cz);
        }
      }
    }
  }

  for (const key of chunks.keys()) {
    if (!needed.has(key)) {
      removeChunk(key);
    }
  }
}

let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Build camera direction vectors from yaw/pitch
  const forward = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    0,
    -Math.cos(yaw) * Math.cos(pitch)
  ).normalize();

  const right = new THREE.Vector3(
    Math.cos(yaw),
    0,
    -Math.sin(yaw)
  ).normalize();

  // Movement
  const moveDir = new THREE.Vector3();
  if (keys['KeyW']) moveDir.add(forward);
  if (keys['KeyS']) moveDir.sub(forward);
  if (keys['KeyA']) moveDir.sub(right);
  if (keys['KeyD']) moveDir.add(right);

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
    playerPos.x += moveDir.x * MOVE_SPEED * dt;
    playerPos.z += moveDir.z * MOVE_SPEED * dt;
  }

  // Jump & gravity
  if (keys['Space'] && onGround) {
    velocity.y = JUMP_FORCE;
    onGround = false;
  }

  velocity.y -= GRAVITY * dt;
  playerPos.y += velocity.y * dt;

  if (playerPos.y <= PLAYER_HEIGHT) {
    playerPos.y = PLAYER_HEIGHT;
    velocity.y = 0;
    onGround = true;
  }

  // Camera
  camera.position.copy(playerPos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // Update chunks around player
  updateChunks();

  renderer.render(scene, camera);
}

animate();
