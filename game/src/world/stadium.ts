import * as THREE from 'three';
import {trackPoint} from './track';

export function stadiumDimensions(size: number) {
  const outer = size * .29;
  const inner = outer - Math.min(5, size * .1);
  const straight = size * .15;
  return {outer, inner, straight, fieldWidth: inner * 1.5, fieldLength: straight * 2 + inner * .8};
}

/** Render-only sports markings. The pitch and track do not affect facility collision or cost. */
export function addStadiumSurface(group: THREE.Group, size: number) {
  const {outer, inner, straight, fieldWidth, fieldLength} = stadiumDimensions(size);
  const oval = (radius: number) => Array.from({length: 129}, (_, i) => trackPoint(radius, straight, i / 128));
  const shape = new THREE.Shape();
  oval(outer).forEach((point, index) => index ? shape.lineTo(point.x, point.z) : shape.moveTo(point.x, point.z));
  const hole = new THREE.Path();
  oval(inner).reverse().forEach((point, index) => index ? hole.lineTo(point.x, point.z) : hole.moveTo(point.x, point.z));
  shape.holes.push(hole);
  const track = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({color: 0x9d5a4e, roughness: .98, side: THREE.DoubleSide}));
  track.rotation.x = -Math.PI / 2;
  track.position.y = .072;
  track.receiveShadow = true;
  group.add(track);

  const laneMaterial = new THREE.LineBasicMaterial({color: 0xe8dfcc});
  for (let lane = 0; lane <= 4; lane++) {
    const radius = inner + (outer - inner) * lane / 4;
    const points = oval(radius).slice(0, -1).map(point => new THREE.Vector3(point.x, .084, point.z));
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), laneMaterial.clone()));
  }

  const finish = new THREE.Mesh(new THREE.PlaneGeometry(outer - inner, .18), new THREE.MeshBasicMaterial({color: 0xf6f2e8, side: THREE.DoubleSide}));
  finish.rotation.x = -Math.PI / 2;
  finish.position.set((outer + inner) / 2, .086, 0);
  group.add(finish);

  const turf = new THREE.Mesh(new THREE.PlaneGeometry(fieldWidth, fieldLength), new THREE.MeshStandardMaterial({color: 0x6b906b, roughness: 1}));
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = .074;
  turf.receiveShadow = true;
  group.add(turf);
  const stripeMaterial = new THREE.MeshBasicMaterial({color: 0xa1b895, transparent: true, opacity: .095, depthWrite: false});
  for (let stripe = 0; stripe < 8; stripe += 2) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(fieldWidth, fieldLength / 8), stripeMaterial.clone());
    band.rotation.x = -Math.PI / 2;
    band.position.set(0, .077, -fieldLength / 2 + (stripe + .5) * fieldLength / 8);
    group.add(band);
  }

  const white = new THREE.MeshBasicMaterial({color: 0xe4e9db, side: THREE.DoubleSide});
  const mark = (width: number, depth: number, x: number, z: number) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), white.clone());
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, .084, z);
    group.add(line);
  };
  const halfW = fieldWidth / 2, halfL = fieldLength / 2, line = Math.max(.07, size * .0012);
  mark(fieldWidth, line, 0, -halfL);
  mark(fieldWidth, line, 0, halfL);
  mark(line, fieldLength, -halfW, 0);
  mark(line, fieldLength, halfW, 0);
  mark(fieldWidth, line, 0, 0);
  const circleRadius = Math.min(fieldWidth * .16, 3.6);
  const circle = new THREE.Mesh(new THREE.RingGeometry(circleRadius - line / 2, circleRadius + line / 2, 64), white.clone());
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = .084;
  group.add(circle);
  for (const side of [-1, 1]) {
    const boxWidth = fieldWidth * .52, boxDepth = fieldLength * .17;
    const end = side * halfL, front = side * (halfL - boxDepth);
    mark(boxWidth, line, 0, front);
    mark(line, boxDepth, -boxWidth / 2, (end + front) / 2);
    mark(line, boxDepth, boxWidth / 2, (end + front) / 2);
    mark(line * 2, line * 2, 0, side * (halfL - boxDepth * .62));
  }
  mark(line * 2, line * 2, 0, 0);
}
