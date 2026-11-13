import * as THREE from 'three';

/** Polar angle is measured from +Y. Keeping the maximum below PI/2 guarantees
 * the camera can never move under the ground plane or flip upside down. */
export const CAMERA_LIMITS = {
  minPolar: 0.34,
  maxPolar: 1.14,
  minDistance: 7,
  maxDistance: 280,
  minFov: 34,
  maxFov: 58,
};

export function clampPolar(value: number): number {
  return Math.max(CAMERA_LIMITS.minPolar, Math.min(CAMERA_LIMITS.maxPolar, value));
}

export function cameraForwardOnGround(camera: THREE.Camera, target: THREE.Vector3): THREE.Vector3 {
  const forward = target.clone().sub(camera.position);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  return forward.normalize();
}

export function cameraRightOnGround(forward: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
}

/** Screen-relative WASD movement. Forward means "away from the camera", which
 * stays intuitive after any horizontal rotation. */
export function movementDirection(keys: Set<string>, camera: THREE.Camera, target: THREE.Vector3): THREE.Vector3 {
  const forward = cameraForwardOnGround(camera, target);
  const right = cameraRightOnGround(forward);
  const direction = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) direction.add(forward);
  if (keys.has('s') || keys.has('arrowdown')) direction.sub(forward);
  if (keys.has('d') || keys.has('arrowright')) direction.add(right);
  if (keys.has('a') || keys.has('arrowleft')) direction.sub(right);
  return direction.lengthSq() > 1e-6 ? direction.normalize() : direction;
}

export function cameraSpeedForDistance(distance: number): number {
  return Math.max(10, Math.min(72, distance * 0.9));
}

export function defaultCameraPosition(size: number): THREE.Vector3 {
  const distance = Math.max(26, size * 1.15);
  return new THREE.Vector3(distance * 0.72, distance * 0.82, distance * 0.72);
}

export function fitCameraPosition(size: number): THREE.Vector3 {
  const distance = Math.max(30, size * 1.25);
  return new THREE.Vector3(distance * 0.6, distance * 0.95, distance * 0.6);
}
