import * as THREE from 'three';
import {CATALOG, bounds, itemHeight, type Item, type Layout} from '../game';
import {layoutColliders, pathBlockedCells, type Collider} from './collision';
import {kindHeight} from './models';
import type {Point} from '../path';
import {SCALE_REFERENCE} from './scale';
import {labelSprite} from './labels';

export interface DebugPerson {
  id: string;
  x: number;
  z: number;
  y: number;
  state: string;
  roleLabel: string;
  goal: Point;
  path: Point[];
  seat: string | null;
}

export interface DebugSeat {
  id: string;
  x: number;
  z: number;
  lift: number;
  taken: boolean;
}

export interface DebugSnapshot {
  people: DebugPerson[];
  seats: DebugSeat[];
}

export interface DebugStats {
  fps: number;
  people: number;
  seats: number;
  facilities: number;
  colliders: number;
  blockedCells: number;
  objects: number;
  geometries: number;
  textures: number;
}

const STATE_COLORS: Record<string, number> = {
  seated: 0x58a6ff, resting: 0x58a6ff, watching: 0x58a6ff,
  arriving: 0x4be07a, queueing: 0xe7c247, checkin: 0xe7c247,
  toSeat: 0x4be07a, toRest: 0x4be07a, toStage: 0xc586ff, toGoal: 0x4be07a,
  performing: 0xc586ff, hosting: 0xc586ff, serving: 0x4be07a, patrolling: 0x4be07a,
  leaving: 0xff9d5c, idle: 0x9aa7b5,
};

function disposeObject(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments || object instanceof THREE.Sprite)) return;
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
      return;
    }
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose());
  });
}

function footprintPoints(item: Item, y: number): THREE.Vector3[] {
  const b = bounds(item);
  const rotation = item.rotation * Math.PI / 180;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  return [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, b.d / 2]].map(([x, z]) =>
    new THREE.Vector3(item.x + x * cos - z * sin, y, item.z + x * sin + z * cos),
  );
}

function circlePoints(x: number, z: number, radius: number, y: number, segments = 20): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    points.push(new THREE.Vector3(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius));
  }
  return points;
}

/**
 * Developer overlay: 1m grid, item footprints, collider boxes, seat ownership,
 * live person colliders, routes, goals and a 1.72m height reference.
 */
export class DebugLayer {
  readonly root = new THREE.Group();
  private staticGroup = new THREE.Group();
  private dynamic: THREE.LineSegments;
  private positions = new Float32Array(0);
  private colors = new Float32Array(0);
  private blocked = 0;
  private colliders: Collider[] = [];
  private rulerHeight = 2.4;

  constructor() {
    this.root.name = 'debug-layer';
    this.root.visible = false;
    const geometry = new THREE.BufferGeometry();
    this.dynamic = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: .95, depthWrite: false, depthTest: false}));
    this.dynamic.frustumCulled = false;
    this.dynamic.renderOrder = 15;
    this.root.add(this.staticGroup, this.dynamic);
  }

  setVisible(visible: boolean) {
    this.root.visible = visible;
  }

  build(layout: Layout) {
    const group = this.staticGroup;
    for (const child of [...group.children]) {
      group.remove(child);
      disposeObject(child);
    }
    const half = layout.size / 2;
    const grid = new THREE.GridHelper(layout.size, Math.max(8, Math.round(layout.size / SCALE_REFERENCE.grid)), 0x3fa9ff, 0x2b6f95);
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = .32;
    gridMaterial.depthWrite = false;
    grid.position.y = .095;
    grid.renderOrder = 12;
    group.add(grid);

    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-half, .1, -half), new THREE.Vector3(half, .1, -half),
        new THREE.Vector3(half, .1, half), new THREE.Vector3(-half, .1, half),
      ]),
      new THREE.LineBasicMaterial({color: 0x3fa9ff, transparent: true, opacity: .6}),
    );
    group.add(border);

    this.colliders = layoutColliders(layout);
    const colliderByOwner = new Map(this.colliders.map(collider => [collider.ownerId, collider]));

    for (const item of layout.items) {
      const collider = colliderByOwner.get(item.id);
      const color = item.kind === 'entrance' ? 0x49dd8b : collider ? (collider.blocksPeople ? 0xffc247 : 0x4fb9ff) : 0x37d0c8;
      const footprint = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(footprintPoints(item, .12)),
        new THREE.LineBasicMaterial({color, transparent: true, opacity: .85, depthWrite: false, depthTest: false}),
      );
      footprint.renderOrder = 14;
      group.add(footprint);
      if (collider) {
        const height = Math.max(.6, kindHeight(item.kind) * itemHeight(item));
        const box = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(collider.halfW * 2, height, collider.halfD * 2)),
          new THREE.LineBasicMaterial({color: collider.blocksPeople ? 0xffb020 : 0x4fb9ff, transparent: true, opacity: .65, depthWrite: false}),
        );
        box.position.set(collider.x, height / 2 + .08, collider.z);
        box.rotation.y = collider.rotation;
        group.add(box);
      }
      const b = bounds(item);
      const label = labelSprite(`${CATALOG[item.kind].name} ${b.w.toFixed(1)}×${b.d.toFixed(1)}m`, `#${color.toString(16).padStart(6, '0')}`, .42);
      label.position.set(item.x, Math.max(1.4, kindHeight(item.kind) * itemHeight(item)) + .75, item.z);
      group.add(label);
      if (item.kind === 'entrance') {
        const ring = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(circlePoints(item.x, item.z, 1.8, .13)),
          new THREE.LineBasicMaterial({color: 0x49dd8b, transparent: true, opacity: .9, depthTest: false}),
        );
        group.add(ring);
        const entranceLabel = labelSprite('入口 / 出口', '#49dd8b', .5);
        entranceLabel.position.set(item.x, 2.9, item.z);
        group.add(entranceLabel);
      }
    }

    for (const wall of this.colliders.filter(collider => collider.kind === 'wall')) {
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(wall.halfW * 2, 2.4, wall.halfD * 2)),
        new THREE.LineBasicMaterial({color: 0xff5f8f, transparent: true, opacity: .5, depthWrite: false}),
      );
      box.position.set(wall.x, 1.2, wall.z);
      group.add(box);
    }

    this.blocked = pathBlockedCells(layout.items, half).size;
    this.addRuler(-half + 2.2, half - 2.2);
  }

  private addRuler(x: number, z: number) {
    const group = this.staticGroup;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(.06, SCALE_REFERENCE.person.model, .06),
      new THREE.MeshBasicMaterial({color: 0x58a6ff, transparent: true, opacity: .28, depthWrite: false}),
    );
    body.position.set(x, SCALE_REFERENCE.person.model / 2, z);
    group.add(body);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, this.rulerHeight, z)]),
      new THREE.LineBasicMaterial({color: 0xd7e6f5, transparent: true, opacity: .8}),
    );
    group.add(line);
    const ticks: {y: number; text: string; color: string}[] = [
      {y: SCALE_REFERENCE.grid, text: '1.0m', color: '#d7e6f5'},
      {y: .78, text: '桌面 0.78m', color: '#e7c247'},
      {y: SCALE_REFERENCE.door.venueHeight, text: '门框 2.2m', color: '#49dd8b'},
      {y: SCALE_REFERENCE.person.model, text: '人物 1.72m', color: '#58a6ff'},
    ];
    for (const tick of ticks) {
      const width = tick.text.startsWith('人物') ? 3 : 1.6;
      const tickLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, tick.y, z - width / 2), new THREE.Vector3(x, tick.y, z + width / 2)]),
        new THREE.LineBasicMaterial({color: new THREE.Color(tick.color), transparent: true, opacity: .95}),
      );
      group.add(tickLine);
      const label = labelSprite(tick.text, tick.color, .38);
      label.position.set(x + 1.6, tick.y, z);
      group.add(label);
    }
  }

  update(snapshot: DebugSnapshot) {
    const points: number[] = [];
    const colors: number[] = [];
    const push = (a: THREE.Vector3, b: THREE.Vector3, color: number) => {
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = new THREE.Color(color);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    for (const seat of snapshot.seats) {
      const color = seat.taken ? 0x3d78c4 : 0x2d465f;
      const y = seat.lift + .08;
      push(new THREE.Vector3(seat.x - .18, y, seat.z), new THREE.Vector3(seat.x + .18, y, seat.z), color);
      push(new THREE.Vector3(seat.x, y, seat.z - .18), new THREE.Vector3(seat.x, y, seat.z + .18), color);
    }
    for (const person of snapshot.people) {
      const color = STATE_COLORS[person.state] ?? 0x9aa7b5;
      const ring = circlePoints(person.x, person.z, .34, person.y + .03, 16);
      for (let i = 0; i < ring.length - 1; i++) push(ring[i], ring[i + 1], color);
      const goalY = Math.max(person.y, .14);
      push(new THREE.Vector3(person.goal.x - .35, goalY, person.goal.z), new THREE.Vector3(person.goal.x + .35, goalY, person.goal.z), 0xff8f3d);
      push(new THREE.Vector3(person.goal.x, goalY, person.goal.z - .35), new THREE.Vector3(person.goal.x, goalY, person.goal.z + .35), 0xff8f3d);
      if (person.path.length) {
        let previous = new THREE.Vector3(person.x, person.y + .05, person.z);
        for (const node of person.path) {
          const next = new THREE.Vector3(node.x, person.y + .05, node.z);
          push(previous, next, 0x53d7ff);
          previous = next;
        }
      }
    }
    const needed = points.length;
    if (this.positions.length !== needed) {
      this.positions = new Float32Array(needed);
      this.colors = new Float32Array(needed);
    }
    this.positions.set(points);
    this.colors.set(colors);
    const geometry = this.dynamic.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
  }

  stats(people: number, seats: number, facilities: number, scene: THREE.Scene, renderer: THREE.WebGLRenderer): Omit<DebugStats, 'fps'> {
    let objects = 0;
    scene.traverse(() => { objects++; });
    const memory = renderer.info.memory;
    return {
      people, seats, facilities, colliders: this.colliders.length, blockedCells: this.blocked, objects,
      geometries: memory.geometries, textures: memory.textures,
    };
  }

  dispose() {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      disposeObject(child);
    }
  }
}
