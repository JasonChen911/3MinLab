import * as THREE from 'three';
import {createCar, type CarRig} from './models';
import type {CityPlan} from './worldgen';

type Axis = 'x' | 'z';

interface CarState {
  rig: CarRig;
  axis: Axis;
  road: number;
  pos: number;
  dir: 1 | -1;
  speed: number;
  color: number;
  lastCross?: number;
  turn?: {t: number; duration: number; start: THREE.Vector3; control: THREE.Vector3; end: THREE.Vector3; axis: Axis; road: number; pos: number; dir: 1 | -1};
}

const CAR_COLORS = [0xe95f5f, 0x4f8fdc, 0xf0c34e, 0x6fc08b, 0x9a8fd8, 0xf2f2f0, 0x8d949c, 0xe58fb8, 0x5cc3c9];
const LANE = 2.15;

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export class TrafficSystem {
  readonly root = new THREE.Group();
  private plan: CityPlan;
  private cars: CarState[] = [];
  private quality: 'low' | 'medium' | 'high' = 'high';

  constructor(plan: CityPlan, _scene: THREE.Scene) {
    this.plan = plan;
    for (let i = 0; i < 14; i++) this.spawn(new THREE.Vector3());
  }

  setPlan(plan: CityPlan) {
    this.plan = plan;
    for (const car of this.cars) this.root.remove(car.rig.group);
    this.cars = [];
    for (let i = 0; i < 14; i++) this.spawn(new THREE.Vector3());
  }

  private roadsFor(car: {axis: Axis}) {
    return car.axis === 'z' ? this.plan.roadsX : this.plan.roadsZ;
  }

  private crossingsFor(car: {axis: Axis}) {
    return car.axis === 'z' ? this.plan.roadsZ : this.plan.roadsX;
  }

  private worldPosition(car: Pick<CarState, 'axis' | 'road' | 'pos' | 'dir'>): THREE.Vector3 {
    const lane = car.dir * LANE;
    return car.axis === 'z'
      ? new THREE.Vector3(car.road + lane, 0, car.pos)
      : new THREE.Vector3(car.pos, 0, car.road + lane);
  }

  private heading(axis: Axis, dir: 1 | -1): number {
    if (axis === 'z') return dir > 0 ? 0 : Math.PI;
    return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  private spawn(target: THREE.Vector3) {
    const axis: Axis = Math.random() < .5 ? 'x' : 'z';
    const roads = axis === 'z' ? this.plan.roadsX : this.plan.roadsZ;
    const axisTarget = axis === 'z' ? target.x : target.z;
    let nearest = 0;
    for (let i = 1; i < roads.length; i++) if (Math.abs(roads[i] - axisTarget) < Math.abs(roads[nearest] - axisTarget)) nearest = i;
    const index = clamp(nearest + Math.floor((Math.random() - .5) * 7), 0, roads.length - 1);
    const road = roads[index];
    const dir: 1 | -1 = Math.random() < .5 ? 1 : -1;
    const along = (axis === 'z' ? target.z : target.x) + (Math.random() - .5) * 150;
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const rig = createCar(color, true);
    const car: CarState = {rig, axis, road, pos: along, dir, speed: 6.5 + Math.random() * 4, color};
    rig.group.position.copy(this.worldPosition(car));
    rig.group.rotation.y = this.heading(axis, dir);
    rig.group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    rig.group.visible = this.cars.length < this.visibleLimit();
    this.root.add(rig.group);
    this.cars.push(car);
  }

  private visibleLimit() {
    return this.quality === 'low' ? 7 : this.quality === 'medium' ? 10 : this.cars.length + 1;
  }

  setQuality(quality: 'low' | 'medium' | 'high') {
    this.quality = quality;
    const limit = this.visibleLimit();
    this.cars.forEach((car, index) => { car.rig.group.visible = index < limit; });
  }

  private respawn(car: CarState, target: THREE.Vector3) {
    this.root.remove(car.rig.group);
    const index = this.cars.indexOf(car);
    if (index >= 0) this.cars.splice(index, 1);
    this.spawn(target);
  }

  private nextCrossing(car: CarState): number | undefined {
    const crossings = this.crossingsFor(car);
    if (car.dir > 0) {
      for (const c of crossings) if (c > car.pos + .4) return c;
    } else {
      for (let i = crossings.length - 1; i >= 0; i--) if (crossings[i] < car.pos - .4) return crossings[i];
    }
    return undefined;
  }

  private beginTurn(car: CarState, crossing: number) {
    const choose = Math.random();
    if (choose < .52) { car.lastCross = crossing; return; }
    const left = choose < .76;
    const newAxis: Axis = car.axis === 'z' ? 'x' : 'z';
    const newDir: 1 | -1 = (left ? car.dir : -car.dir) as 1 | -1;
    const startPos = this.worldPosition(car);
    const start = new THREE.Vector3(startPos.x, 0, startPos.z);
    const control = car.axis === 'z'
      ? new THREE.Vector3(car.road, 0, crossing)
      : new THREE.Vector3(crossing, 0, car.road);
    const newRoad = crossing;
    const newPos = crossing + newDir * 7;
    const lane = newDir * LANE;
    const end = newAxis === 'z'
      ? new THREE.Vector3(newRoad + lane, 0, newPos)
      : new THREE.Vector3(newPos, 0, newRoad + lane);
    car.lastCross = crossing;
    car.turn = {t: 0, duration: .62, start, control, end, axis: newAxis, road: newRoad, pos: newPos, dir: newDir};
  }

  update(dt: number, target: THREE.Vector3) {
    const step = Math.min(.06, Math.max(0, dt));
    for (const car of [...this.cars]) {
      if (!car.turn) {
        let factor = 1;
        for (const other of this.cars) {
          if (other === car || other.turn || other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
          const gap = (other.pos - car.pos) * car.dir;
          if (gap > 0 && gap < 10) factor = Math.min(factor, .2 + gap / 10 * .75);
        }
        const before = car.pos;
        car.pos += car.dir * car.speed * factor * step;
        const crossing = this.nextCrossing({...car, pos: before});
        if (crossing !== undefined && car.lastCross !== crossing) {
          const distance = (crossing - car.pos) * car.dir;
          if (distance <= 4.5 && distance >= -1.2) this.beginTurn(car, crossing);
        }
        const position = this.worldPosition(car);
        car.rig.group.position.copy(position);
        car.rig.group.rotation.y = this.heading(car.axis, car.dir);
        for (const wheel of car.rig.wheels) wheel.rotation.x += car.speed * factor * step * 2.4;
      } else {
        car.turn.t += step;
        const t = clamp(car.turn.t / car.turn.duration, 0, 1);
        const eased = t * t * (3 - 2 * t);
        const p = new THREE.Vector3()
          .copy(car.turn.start).multiplyScalar((1 - eased) * (1 - eased))
          .addScaledVector(car.turn.control, 2 * (1 - eased) * eased)
          .addScaledVector(car.turn.end, eased * eased);
        car.rig.group.position.copy(p);
        const delta = new THREE.Vector3().copy(car.turn.end).sub(car.turn.start);
        car.rig.group.rotation.y = Math.atan2(delta.x, delta.z);
        for (const wheel of car.rig.wheels) wheel.rotation.x += car.speed * step * 1.6;
        if (t >= 1) {
          car.axis = car.turn.axis;
          car.road = car.turn.road;
          car.pos = car.turn.pos;
          car.dir = car.turn.dir;
          car.turn = undefined;
        }
      }
      const away = Math.hypot(car.rig.group.position.x - target.x, car.rig.group.position.z - target.z);
      if (away > 290) this.respawn(car, target);
    }
  }

  dispose() {
    this.root.remove(...this.cars.map(c => c.rig.group));
    this.cars = [];
  }
}
