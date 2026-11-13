import * as THREE from 'three';
import type {Point} from '../path';
import {labelSprite} from './labels';

export interface TrackGeometry {
  straight: number;
  outerRadius: number;
  innerRadius: number;
  width: number;
  laneWidth: number;
  lanes: number;
}

/** A 400m-style oval scaled into the venue: two straights plus two semicircle bends. */
export function trackGeometry(size: number): TrackGeometry {
  const lanes = 8;
  const outerRadius = size * .18;
  const width = size * .06;
  return {
    straight: size * .23,
    outerRadius,
    innerRadius: Math.max(2, outerRadius - width),
    width,
    laneWidth: width / lanes,
    lanes,
  };
}

function ovalPoints(radius: number, straight: number, segments = 56): Point[] {
  const points: Point[] = [];
  const step = Math.max(.4, (straight * 2) / 24);
  for (let x = -straight; x <= straight; x += step) points.push({x, z: radius});
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI;
    points.push({x: straight + Math.sin(angle) * radius, z: Math.cos(angle) * radius});
  }
  for (let x = straight; x >= -straight; x -= step) points.push({x, z: -radius});
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI + i / segments * Math.PI;
    points.push({x: -straight + Math.sin(angle) * radius, z: Math.cos(angle) * radius});
  }
  return points;
}

/**
 * One lane's centreline. `stagger` shifts a lane's start forward on the near
 * straight, so eight runners start on eight distinct marks and stay in lane.
 */
export function trackLaneLoop(size: number, lane: number, stagger = 0): Point[] {
  const geo = trackGeometry(size);
  const radius = geo.innerRadius + (Math.max(0, Math.min(geo.lanes - 1, lane)) + .5) * geo.laneWidth;
  const full = ovalPoints(radius, geo.straight);
  if (stagger <= 0) return full;
  const startX = -geo.straight + stagger;
  const first = full.findIndex(point => point.z > 0 && point.x >= startX - .05);
  if (first < 0) return full;
  return [...full.slice(first), ...full.slice(0, first + 1)];
}

function line(points: Point[], color: number, opacity = .8): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(point.x, .086, point.z)));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({color, transparent: true, opacity, depthWrite: false}));
}

function closed(points: Point[]): Point[] {
  return [...points, points[0]];
}

function rect(x1: number, z1: number, x2: number, z2: number): Point[] {
  return [{x: x1, z: z1}, {x: x2, z: z1}, {x: x2, z: z2}, {x: x1, z: z2}, {x: x1, z: z1}];
}

export function buildTrack(size: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'athletics-track';
  const geo = trackGeometry(size);
  const {straight: s, outerRadius: r, innerRadius: ri, laneWidth} = geo;

  const shape = new THREE.Shape();
  shape.moveTo(-s, -r);
  shape.lineTo(s, -r);
  shape.absarc(s, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-s, r);
  shape.absarc(-s, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  const hole = new THREE.Path();
  hole.moveTo(-s, -ri);
  hole.lineTo(s, -ri);
  hole.absarc(s, 0, ri, -Math.PI / 2, Math.PI / 2, false);
  hole.lineTo(-s, ri);
  hole.absarc(-s, 0, ri, Math.PI / 2, Math.PI * 1.5, false);
  shape.holes.push(hole);

  const surface = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 64),
    new THREE.MeshStandardMaterial({color: 0xc86a55, roughness: .94, side: THREE.DoubleSide}),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = .072;
  surface.receiveShadow = true;
  group.add(surface);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(s * 2 + r * 2 + 2, r * 2 + 2),
    new THREE.MeshStandardMaterial({color: 0x8f943f, roughness: 1}),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = .068;
  apron.receiveShadow = true;
  group.add(apron);

  for (let lane = 0; lane <= geo.lanes; lane++) {
    const radius = ri + lane * laneWidth;
    group.add(line(closed(ovalPoints(radius, s)), lane === 0 || lane === geo.lanes ? 0xf4f0e4 : 0xf2e8d5, lane % 2 === 0 ? .9 : .45));
  }

  const finishZ = (ri + r) / 2;
  const finishLine = new THREE.Mesh(
    new THREE.PlaneGeometry(.22, r - ri),
    new THREE.MeshBasicMaterial({color: 0xfff6dc, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false}),
  );
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(-s, .09, finishZ);
  group.add(finishLine);

  for (let lane = 0; lane < geo.lanes; lane++) {
    const z = ri + (lane + .5) * laneWidth;
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(.14, laneWidth * .7),
      new THREE.MeshBasicMaterial({color: 0xfff6dc, transparent: true, opacity: .82, side: THREE.DoubleSide, depthWrite: false}),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(-s + lane * Math.max(.5, laneWidth * .65), .09, z);
    group.add(mark);
  }

  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(s * 1.9, ri * 1.85),
    new THREE.MeshStandardMaterial({color: 0x4f9157, roughness: .96}),
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = .074;
  field.receiveShadow = true;
  group.add(field);

  const fieldX = s * .9, fieldZ = ri * .86;
  group.add(line(rect(-fieldX, -fieldZ, fieldX, fieldZ), 0xf2f2e6, .75));
  group.add(line([{x: 0, z: -fieldZ}, {x: 0, z: fieldZ}], 0xf2f2e6, .75));
  const circle: Point[] = [];
  for (let i = 0; i <= 32; i++) {
    const angle = i / 32 * Math.PI * 2;
    circle.push({x: Math.cos(angle) * Math.min(fieldZ, fieldX) * .3, z: Math.sin(angle) * Math.min(fieldZ, fieldX) * .3});
  }
  group.add(line(circle, 0xf2f2e6, .7));
  const boxX = Math.min(fieldX * .28, fieldZ * .55), boxZ = Math.min(fieldZ * .55, fieldX * .3);
  group.add(line(rect(-fieldX, -boxZ, -fieldX + boxX, boxZ), 0xf2f2e6, .7));
  group.add(line(rect(fieldX - boxX, -boxZ, fieldX, boxZ), 0xf2f2e6, .7));

  for (let lane = 0; lane < geo.lanes; lane += 2) {
    const label = labelSprite(`${lane + 1} 道`, '#ffe9a8', .34, .62);
    label.position.set(-s - .9, 1, ri + (lane + .5) * laneWidth);
    group.add(label);
  }
  const start = labelSprite('起点 / 终点', '#ffef9f', .5, .72);
  start.position.set(-s, 1.5, r + 1.1);
  group.add(start);

  return group;
}