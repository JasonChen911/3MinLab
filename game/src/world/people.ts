import * as THREE from 'three';
import {route, type Point} from '../path';
import {ROLE_LABELS, bounds, type Item, type Layout, type PersonSave, type Role, type SimulationState, type Kind} from '../game';
import {animatePerson, createPerson, type PersonRig} from './models';
import {blockedAt, layoutColliders, moveWithCollision, nearestMovable, type Collider} from './collision';
import {weatherProfile} from './weather';
import {trackPoint} from './track';
import {Random} from '../engine/random';
import {
  decideNeed, initialMood, initialNeeds, isOnDuty, personalityFor, queueTolerance, stepNeeds, updateMood,
  type NeedActivity, type NeedContext, type Needs, type Personality,
} from './personality';
import type {DebugSnapshot} from './debug';

type PersonState =
  | 'arriving' | 'queueing' | 'checkin' | 'toSeat' | 'seated' | 'watching' | 'toRest' | 'resting'
  | 'toComfort' | 'comforting' | 'toSocial' | 'socializing'
  | 'toStage' | 'performing' | 'hosting' | 'patrolling' | 'serving' | 'toGoal' | 'leaving' | 'idle';

interface Seat {
  id: string;
  x: number;
  z: number;
  lift: number;
  facing: number;
  itemId: string;
  takenBy: string | null;
}

interface Agent {
  id: string;
  serial: number;
  role: Role;
  state: PersonState;
  organization: string;
  task: string;
  rig: PersonRig;
  active: boolean;
  path: Point[];
  cursor: number;
  speed: number;
  goal: Point;
  goalLabel: string;
  home: Point;
  seed: number;
  timer: number;
  waiting: number;
  seatId: string | null;
  seatLift: number;
  pushCooldown: number;
  stuck: number;
  retry: number;
  recoveries: number;
  unreachable: boolean;
  personality: Personality;
  needs: Needs;
  mood: number;
  needRng: number;
  needTimer: number;
  intent: string;
  queueWait: number;
}

interface AmbientAgent {
  rig: PersonRig;
  loop: Point[];
  cursor: number;
  speed: number;
  seed: number;
  wait: number;
}

export interface PersonInfo {
  id: string;
  role: Role;
  roleLabel: string;
  organization: string;
  group: string;
  task: string;
  state: PersonState;
  stateLabel: string;
  goal: string;
  destination: {x: number; z: number};
  routeStatus: 'normal' | 'blocked' | 'unreachable';
  position: {x: number; z: number};
  pathRemaining: number;
  seat: string | null;
  personality: Personality;
  needs: Needs;
  mood: number;
  intent: string;
}

const PERSON_RADIUS = .34;
const MAX_AGENTS = 64;
const ARRIVAL = new Set<PersonState>(['arriving', 'queueing', 'checkin']);
const ATTEND = new Set<PersonState>(['toSeat', 'seated', 'watching', 'toRest', 'resting', 'toComfort', 'comforting', 'toSocial', 'socializing']);
const STAFF_ROLES = new Set<Role>(['staff', 'volunteer', 'service', 'security']);
const SEATING_KINDS = new Set<Kind>(['bleachers', 'chair']);

const STATE_LABELS: Record<PersonState, string> = {
  arriving: '前往入口', queueing: '排队等待', checkin: '签到办理', toSeat: '寻找座位', seated: '已就座',
  watching: '站立观看', toRest: '前往休息区', resting: '休息中', toComfort: '前往补水点', comforting: '补水 / 如厕',
  toSocial: '前往社交区', socializing: '交流中', toStage: '前往舞台', performing: '演出中', hosting: '主持中',
  patrolling: '巡逻中', serving: '岗位值守', toGoal: '前往岗位', leaving: '离场中', idle: '待命',
};
export const PERSON_STATE_LABELS = STATE_LABELS;
const PERSON_STATES = new Set<PersonState>(Object.keys(STATE_LABELS) as PersonState[]);
const NEEDS_ROUTE = new Set<PersonState>(['arriving', 'queueing', 'checkin', 'toSeat', 'toRest', 'toComfort', 'toSocial', 'toStage', 'toGoal', 'leaving']);
const DECISION_STATES = new Set<PersonState>(['seated', 'watching', 'idle', 'patrolling', 'serving', 'hosting']);
const VISITOR_ROLES = new Set<Role>(['audience', 'participant']);
const TRAIT_KEYS: (keyof Personality)[] = ['curiosity', 'patience', 'stamina', 'social', 'adventure', 'mobility'];
const NEED_KEYS: (keyof Needs)[] = ['rest', 'water', 'view', 'social', 'exit'];

function validPersonality(value: PersonSave['personality']): value is Personality {
  return !!value && TRAIT_KEYS.every(key => Number.isFinite(value[key]));
}

function validNeeds(value: PersonSave['needs']): value is Needs {
  return !!value && NEED_KEYS.every(key => Number.isFinite(value[key]));
}
const STAGE_KINDS: Kind[] = ['stage', 'stageSmall', 'stageLarge', 'podium'];
const WATER_KINDS: Kind[] = ['toilet', 'service'];
const REST_KINDS: Kind[] = ['rest', 'tent', 'tentSmall', 'bench'];
const SOCIAL_KINDS: Kind[] = ['tent', 'tentSmall', 'bench', 'fountain'];

const ORG: Record<Role, string> = {
  participant: '参与者组', audience: '观众', performer: '演出 / 运动团队', host: '主持组', referee: '裁判组',
  staff: '运营组', volunteer: '志愿者组', security: '安保组', medical: '医疗组', service: '服务组', vendor: '摊位组',
};

const WORK_GROUP: Record<Role, string> = {
  participant: '观众 A 组', audience: '观众 A 组', performer: '演出 A 组', host: '主持组', referee: '裁判组',
  staff: '运营 A 组', volunteer: '志愿者北区', security: '安保巡逻组', medical: '医疗应急组', service: '服务保障组', vendor: '商户运营组',
};

const SHIRTS = [0x4f8fdc, 0x6fc08b, 0xe58fb8, 0xf0c34e, 0x9a8fd8, 0x5cc3c9, 0xef8f6b, 0x74a8e8];
const PANTS = [0x3d4654, 0x4f5b6b, 0x6b5a4a, 0x2f3b52, 0x55606d];
const SKIN = [0xe8c6a8, 0xd9a97e, 0xbf8d63, 0xf0d3b8];
const HAIR = [0x3b2c23, 0x1f1b18, 0x6b4b2f, 0x8a6a45];
const ROLE_LOOK: Partial<Record<Role, [number, number]>> = {
  performer: [0x8e4fc4, 0x2c2236], host: [0x8f3f4c, 0x2f2228],
  referee: [0xf0d34e, 0x242b33], staff: [0x394a68, 0x242b33], volunteer: [0x36a48a, 0x243a33],
  security: [0x2b3240, 0x1b2028], medical: [0xf1f4f4, 0xc05050], service: [0x3f9db3, 0x233740],
  vendor: [0xd98b45, 0x3a2d24],
};

function dist(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.z - b.z); }

function rotated(x: number, z: number, rotation: number): Point {
  const r = rotation * Math.PI / 180;
  return {x: x * Math.cos(r) - z * Math.sin(r), z: x * Math.sin(r) + z * Math.cos(r)};
}

function first(items: Item[], kinds: Kind[], fallback: Point): Point {
  const found = items.find(i => kinds.includes(i.kind));
  return found ? {x: found.x, z: found.z} : fallback;
}

function offset(point: Point, seed: number, radius = 1.8): Point {
  const angle = (seed * 2.399963) % (Math.PI * 2);
  const r = radius * (.75 + ((seed * 37) % 100) / 100 * .25);
  return {x: point.x + Math.cos(angle) * r, z: point.z + Math.sin(angle) * r};
}

export class PeopleSystem {
  readonly root = new THREE.Group();
  private layout: Layout | null = null;
  private state: SimulationState | null = null;
  private goals = {
    entry: {x: -20, z: 0}, desk: {x: 0, z: 0}, area: {x: 12, z: 6}, rest: {x: 14, z: -8},
    stage: {x: 0, z: -14}, backstage: {x: 0, z: -18}, field: {x: 0, z: 0}, medical: {x: 12, z: -8},
    service: {x: 0, z: 0}, vendor: {x: 8, z: 8}, perimeter: {x: 0, z: 18},
  };
  private agents: Agent[] = [];
  private ambient: AmbientAgent[] = [];
  private seats: Seat[] = [];
  private cache = new Map<string, Point[]>();
  private colliders: Collider[] = [];
  private tentMargin = 0;
  private speedFactor = 1;
  private elapsed = 0;
  private serial = 0;
  private seatSerial = 0;
  private pushes: {id: string; dx: number; dz: number}[] = [];
  private quality: 'low' | 'medium' | 'high' = 'high';
  private frozen = false;

  constructor(scene: THREE.Scene) { scene.add(this.root); }

  setQuality(quality: 'low' | 'medium' | 'high') { this.quality = quality; }

  private cap(base: number) {
    return this.quality === 'low' ? Math.ceil(base * .6) : this.quality === 'medium' ? Math.ceil(base * .8) : base;
  }

  setLayout(layout: Layout) {
    this.layout = layout;
    this.cache.clear();
    const tentRisk = layout.indoor ? 0 : weatherProfile(layout.weather).tentRisk;
    this.tentMargin = tentRisk > .55 ? .8 : 0;
    const itemsById = new Map(layout.items.map(item => [item.id, item]));
    this.colliders = layoutColliders(layout).map(collider => {
      if (this.tentMargin <= 0 || (collider.kind !== 'tent' && collider.kind !== 'tentSmall')) return collider;
      const item = itemsById.get(collider.ownerId);
      if (!item || item.anchored) return collider;
      return {
        ...collider,
        halfW: collider.halfW + this.tentMargin,
        halfD: collider.halfD + this.tentMargin,
        radius: collider.radius + this.tentMargin,
      };
    });
    this.speedFactor = layout.indoor ? 1 : Math.max(.6, 1 - (1 - weatherProfile(layout.weather).comfort) * .3);
    const size = layout.size;
    const edge = Math.max(2, size / 2 - 2);
    const stageItems = layout.items.filter(i => ['stage', 'stageSmall', 'stageLarge', 'podium', 'bleachers'].includes(i.kind));
    const stage = stageItems.find(i => i.kind.startsWith('stage')) ?? stageItems[0];
    const stageZ = stage ? stage.z : -size * .2;
    this.goals = {
      entry: first(layout.items, ['entrance'], {x: -edge, z: 0}),
      desk: first(layout.items, ['checkin', 'checkinSmall', 'checkinLarge'], {x: 0, z: 0}),
      area: {x: stage?.x ?? size / 4, z: stageZ + (stage ? bounds(stage).d / 2 + 1.8 : size / 5)},
      rest: first(layout.items, ['rest', 'service', 'tent', 'tentSmall'], {x: size / 4, z: -size / 5}),
      stage: {x: stage?.x ?? 0, z: stageZ + (stage ? bounds(stage).d / 2 + .8 : 0)},
      backstage: {x: (stage?.x ?? 0) + Math.min(5, size * .08), z: stageZ - (stage ? 3.5 : 0) - 1.5},
      field: {x: 0, z: 0},
      medical: first(layout.items, ['medical'], {x: edge - 4, z: -edge + 4}),
      service: first(layout.items, ['service', 'checkin', 'checkinSmall', 'checkinLarge'], {x: 0, z: 0}),
      vendor: first(layout.items, ['tent', 'tentSmall'], {x: size * .2, z: size * .2}),
      perimeter: first(layout.items, ['entrance'], {x: 0, z: edge}),
    };
    this.seats = this.buildSeats(layout.items);
    for (const agent of this.agents) {
      if (!agent.active) continue;
      if (agent.seatId) {
        const seat = this.seats.find(s => s.id === agent.seatId);
        if (seat && (!seat.takenBy || seat.takenBy === agent.id)) {
          seat.takenBy = agent.id;
          agent.seatLift = seat.lift;
          if (agent.state === 'seated' || agent.state === 'resting') {
            agent.rig.group.position.set(seat.x, seat.lift, seat.z);
            agent.rig.group.rotation.y = seat.facing;
          }
        } else {
          agent.seatId = null;
          agent.seatLift = 0;
          if (agent.state === 'seated' || agent.state === 'resting') {
            agent.state = 'toRest';
            this.routeAgent(agent, offset(this.goals.rest, agent.seed, 2.8), '原座位已变动，前往休息区');
          }
        }
      }
      if (agent.state === 'toSeat' && !agent.seatId) {
        const seat = this.claimSeat(agent);
        if (seat) this.routeAgent(agent, {x: seat.x, z: seat.z}, `前往座位 ${seat.id}`);
        else agent.state = 'watching';
      }
      if (agent.state !== 'seated' && agent.state !== 'resting') this.repath(agent);
    }
    for (const agent of this.ambient) this.placeAmbient(agent);
  }

  setState(state: SimulationState | null) { this.state = state; }

  /** Show a recorded snapshot without advancing the live FSM. */
  present(saves: PersonSave[]): boolean {
    if (!saves.length) return false;
    this.frozen = true;
    return this.restore(saves);
  }

  unfreeze() { this.frozen = false; }

  hasActive() { return this.agents.some(agent => agent.active); }

  private restoreKey = '';

  private restoreSignature(saves: PersonSave[]): string {
    return JSON.stringify(saves.map(save => [save.id, save.state, save.seatId, Math.round(save.x * 100), Math.round(save.z * 100), save.goal.x, save.goal.z]));
  }

  snapshot(): PersonSave[] {
    return this.agents.filter(agent => agent.active).map(agent => {
      const position = agent.rig.group.position;
      return {
        id: agent.id, serial: agent.serial, role: agent.role, state: agent.state,
        x: position.x, y: position.y, z: position.z, rotation: agent.rig.group.rotation.y,
        seatId: agent.seatId, goal: {x: agent.goal.x, z: agent.goal.z}, goalLabel: agent.goalLabel,
        path: agent.path.slice(agent.cursor).map(point => ({x: point.x, z: point.z})),
        timer: agent.timer, waiting: agent.waiting, speed: agent.speed,
        task: agent.task, organization: agent.organization, seed: agent.seed,
        personality: {...agent.personality}, needs: {...agent.needs}, mood: agent.mood,
        needRng: agent.needRng, needTimer: agent.needTimer, intent: agent.intent, queueWait: agent.queueWait,
      };
    });
  }

  restore(saves: PersonSave[]): boolean {
    if (!this.layout || !saves.length) return false;
    const key = this.restoreSignature(saves);
    if (key === this.restoreKey) return false;
    this.restoreKey = key;
    for (const agent of this.agents) if (agent.active) this.deactivate(agent);
    for (const seat of this.seats) seat.takenBy = null;
    const used = new Set<string>();
    for (const save of saves) {
      if (!save || typeof save.id !== 'string' || used.has(save.id) || !Number.isFinite(save.x) || !Number.isFinite(save.z)) continue;
      used.add(save.id);
      let agent = this.agents.find(candidate => candidate.id === save.id && !candidate.active);
      if (!agent) {
        agent = this.createAgent(save.role);
        agent.id = save.id;
      }
      const current = agent;
      current.role = save.role;
      current.organization = save.organization || ORG[save.role];
      current.serial = Math.max(1, Math.round(save.serial ?? current.serial));
      current.seed = Number.isFinite(save.seed) ? save.seed! : current.serial * 1.37;
      current.speed = Number.isFinite(save.speed) && (save.speed ?? 0) > 0 ? save.speed! : 1.8;
      current.personality = validPersonality(save.personality) ? {...save.personality} : personalityFor(current.seed, current.role);
      current.needs = validNeeds(save.needs) ? {...save.needs} : initialNeeds(current.seed, current.role);
      current.mood = Number.isFinite(save.mood) ? Math.max(0, Math.min(100, save.mood!)) : initialMood(current.seed, current.personality);
      current.needRng = Number.isFinite(save.needRng) ? (save.needRng! >>> 0) : Math.round(current.seed * 7919 + 17) >>> 0;
      current.needTimer = Math.max(0, Number.isFinite(save.needTimer) ? save.needTimer! : 2);
      current.intent = save.intent || '恢复模拟状态';
      current.queueWait = Math.max(0, Number.isFinite(save.queueWait) ? save.queueWait! : 0);
      current.state = PERSON_STATES.has(save.state as PersonState) ? save.state as PersonState : 'idle';
      current.active = true;
      current.rig.group.visible = true;
      current.rig.group.position.set(save.x, Number.isFinite(save.y) ? save.y! : 0, save.z);
      current.rig.group.rotation.y = Number.isFinite(save.rotation) ? save.rotation! : 0;
      current.goal = Number.isFinite(save.goal?.x) && Number.isFinite(save.goal?.z)
        ? {x: save.goal.x, z: save.goal.z} : {x: save.x, z: save.z};
      current.goalLabel = save.goalLabel || this.goalLabel(current);
      current.path = Array.isArray(save.path)
        ? save.path.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.z)).map(point => ({x: point.x, z: point.z}))
        : [];
      current.cursor = 0;
      current.timer = Math.max(0, save.timer ?? 0);
      current.waiting = Math.max(0, save.waiting ?? 0);
      current.pushCooldown = 0;
      current.stuck = 0;
      current.retry = 0;
      current.recoveries = 0;
      current.unreachable = false;
      current.seatId = null;
      current.seatLift = 0;
      const seat = save.seatId
        ? this.seats.find(candidate => candidate.id === save.seatId && (!candidate.takenBy || candidate.takenBy === save.id))
        : null;
      if (seat) {
        seat.takenBy = current.id;
        current.seatId = seat.id;
        current.seatLift = seat.lift;
      } else if (current.state === 'seated' || current.state === 'resting') {
        current.state = 'watching';
      }
      current.task = save.task || this.taskFor(current.role, current.state);
      current.rig.group.userData.role = current.role;
      this.serial = Math.max(this.serial, current.serial);
      if (NEEDS_ROUTE.has(current.state) && !current.path.length) this.routeAgent(current, current.goal, current.goalLabel);
    }
    for (const seat of this.seats) {
      if (seat.takenBy && !this.agents.some(agent => agent.active && agent.id === seat.takenBy)) seat.takenBy = null;
    }
    return this.hasActive();
  }

  setAmbientLoops(loops: Point[][]) {
    for (const agent of this.ambient) this.root.remove(agent.rig.group);
    this.ambient = [];
    if (!loops.length) return;
    for (let i = 0; i < 8; i++) {
      const loop = loops[i % loops.length];
      if (loop.length < 4) continue;
      const rig = createPerson(SHIRTS[i % SHIRTS.length], PANTS[i % PANTS.length], SKIN[i % SKIN.length], HAIR[i % HAIR.length]);
      const agent: AmbientAgent = {rig, loop, cursor: (i * 2) % loop.length, speed: 1.1 + (i % 4) * .16, seed: i * 1.7, wait: 0};
      this.root.add(rig.group);
      this.placeAmbient(agent);
      this.ambient.push(agent);
    }
  }

  private placeAmbient(agent: AmbientAgent) {
    const a = agent.loop[agent.cursor], b = agent.loop[(agent.cursor + 1) % agent.loop.length];
    const t = (agent.seed % 1);
    agent.rig.group.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
  }

  private buildSeats(items: Item[]): Seat[] {
    const seats: Seat[] = [];
    this.seatSerial = 0;
    for (const item of items) {
      const s = item.scale ?? 1;
      if (item.kind === 'chair') {
        const around: [number, number][] = [[-1.12, 0], [1.12, 0], [0, -1.05], [0, 1.05]];
        for (const [ox, oz] of around) {
          const p = rotated(ox * s, oz * s, item.rotation);
          seats.push({id: `T-${String(seats.length + 1).padStart(2, '0')}`, x: item.x + p.x, z: item.z + p.z, lift: .43 * s, facing: Math.atan2(-p.x, -p.z), itemId: item.id, takenBy: null});
        }
      } else if (item.kind === 'bleachers') {
        const rows = 4;
        const cols = Math.max(3, Math.min(12, Math.round((5 * s - 1) / .8) + 1));
        const usable = Math.max(1.4, 5 * s - 1.2);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const lx = -usable / 2 + (cols === 1 ? usable / 2 : c / (cols - 1) * usable);
            const lz = (-.9 + r * .78) * s;
            const p = rotated(lx, lz, item.rotation);
            seats.push({id: `${String.fromCharCode(65 + this.seatSerial++)}-${r * cols + c + 1}`, x: item.x + p.x, z: item.z + p.z, lift: (.42 + r * .42) * s, facing: item.rotation * Math.PI / 180 + Math.PI, itemId: item.id, takenBy: null});
          }
        }
      }
      if (seats.length >= 160) break;
    }
    return seats;
  }

  private claimSeat(agent: Agent): Seat | null {
    const free = this.seats.find(s => !s.takenBy);
    if (!free) return null;
    free.takenBy = agent.id;
    agent.seatId = free.id;
    agent.seatLift = free.lift;
    return free;
  }

  private releaseSeat(agent: Agent) {
    for (const seat of this.seats) if (seat.takenBy === agent.id) seat.takenBy = null;
    agent.seatId = null;
    agent.seatLift = 0;
  }

  /** Seat furniture is low and climbable: only agents heading to a seat may pass over it. */
  private itemsFor(agent: Agent): Item[] {
    if (!this.layout) return [];
    let items = agent.state === 'toSeat' || agent.state === 'leaving'
      ? this.layout.items.filter(item => !SEATING_KINDS.has(item.kind))
      : this.layout.items;
    if (this.tentMargin <= 0) return items;
    items = items.map(item => {
      if ((item.kind !== 'tent' && item.kind !== 'tentSmall') || item.anchored) return item;
      const scale = item.scale ?? 1;
      const size = Math.max(bounds(item).w, bounds(item).d);
      return {...item, scale: scale + scale * this.tentMargin * 2 / Math.max(1, size)};
    });
    return items;
  }

  private collidersFor(agent: Agent): Collider[] {
    if (agent.state !== 'toSeat' && agent.state !== 'leaving') return this.colliders;
    return this.colliders.filter(collider => collider.kind !== 'bleachers' && collider.kind !== 'chair');
  }

  private pathFor(from: Point, to: Point, agent?: Agent): Point[] {
    if (!this.layout) return [];
    const items = agent ? this.itemsFor(agent) : this.layout.items;
    const gridSize = this.layout.indoor ? Math.max(8, this.layout.size - 1) : this.layout.size;
    const key = `${Math.round(from.x * 2)},${Math.round(from.z * 2)}:${Math.round(to.x * 2)},${Math.round(to.z * 2)}:${this.layout.items.length}:${gridSize}:${this.tentMargin}:${agent ? agent.state === 'toSeat' || agent.state === 'leaving' ? 'seat' : 'all' : 'all'}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const result = route(items, gridSize, from, to);
    if (!result.length) return [];
    this.cache.set(key, result);
    return result;
  }

  /** A path can start inside furniture (for example when standing up from a seat); step out first. */
  private escapePoint(from: Point, colliders: Collider[]): Point | null {
    for (let step = .55; step <= 4; step += .35) {
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2 + step;
        const x = from.x + Math.cos(angle) * step, z = from.z + Math.sin(angle) * step;
        if (!blockedAt(colliders, x, z, PERSON_RADIUS, true)) return {x, z};
      }
    }
    return null;
  }

  private routeAgent(agent: Agent, goal: Point, label: string): boolean {
    agent.goal = goal;
    agent.goalLabel = label;
    const from = {x: agent.rig.group.position.x, z: agent.rig.group.position.z};
    const colliders = this.collidersFor(agent);
    const limit = Math.floor((this.layout ? this.layout.indoor ? this.layout.size - 1 : this.layout.size : 0) / 2) - 1;
    const walkable = (point: Point) => Math.abs(point.x) <= limit && Math.abs(point.z) <= limit
      && !blockedAt(colliders, point.x, point.z, PERSON_RADIUS);
    let destination = goal;
    let path = walkable(goal) ? this.pathFor(from, goal, agent) : [];
    if (!path.length) {
      for (let radius = 1.2; radius <= 4.8 && !path.length; radius += 1.2) {
        for (let i = 0; i < 8; i++) {
          const angle = agent.seed * 2.399963 + i / 8 * Math.PI * 2;
          const candidate = {x: goal.x + Math.cos(angle) * radius, z: goal.z + Math.sin(angle) * radius};
          if (!walkable(candidate)) continue;
          const candidatePath = this.pathFor(from, candidate, agent);
          if (candidatePath.length) { destination = candidate; path = candidatePath; break; }
        }
      }
    }
    if (!path.length && blockedAt(colliders, from.x, from.z, PERSON_RADIUS)) {
      const escape = this.escapePoint(from, colliders);
      if (escape) {
        const remaining = this.pathFor(escape, destination, agent);
        path = remaining.length ? [escape, ...remaining.slice(1)] : [escape];
      }
    }
    if (!path.length) {
      agent.path = [];
      agent.cursor = 0;
      agent.stuck = 0;
      agent.waiting = 0;
      agent.unreachable = true;
      agent.retry = 1.8 + (agent.serial % 5) * .3;
      return false;
    }
    agent.goal = destination;
    const start = path.length > 1 && Math.hypot(path[0].x - from.x, path[0].z - from.z) < 1.2 && !blockedAt(colliders, from.x, from.z, PERSON_RADIUS);
    agent.path = start ? path.slice(1) : path;
    agent.cursor = 0;
    agent.unreachable = false;
    agent.stuck = 0;
    agent.retry = 0;
    return true;
  }

  private repath(agent: Agent): boolean {
    if (agent.state === 'seated' || agent.state === 'resting') return true;
    const base = this.goalBase(agent);
    const goal = offset(base, agent.seed, 2.8);
    return this.routeAgent(agent, goal, this.goalLabel(agent));
  }

  /** When the primary goal stays unreachable, fall back to a free seat or a safe open area. */
  private routeFallback(agent: Agent): boolean {
    if (agent.state === 'toSeat') {
      this.releaseSeat(agent);
      const seat = this.claimSeat(agent);
      if (seat && this.routeAgent(agent, {x: seat.x, z: seat.z}, `改往备用座位 ${seat.id}`)) return true;
      agent.state = 'watching';
      agent.timer = 10 + (agent.serial % 8);
    }
    const fallback = agent.state === 'leaving' ? this.goals.entry : this.goals.area;
    return this.routeAgent(agent, offset(fallback, agent.seed, 2.2), '前往备用区域');
  }

  /** Nearest matching facility, or a fallback point when the venue has none. */
  private facilityPoint(kinds: Kind[], from: Point, fallback: Point): Point {
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (const item of this.layout?.items ?? []) {
      if (!kinds.includes(item.kind)) continue;
      const distance = Math.hypot(item.x - from.x, item.z - from.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = {x: item.x, z: item.z};
      }
    }
    return best ?? fallback;
  }

  private hasFacility(kinds: Kind[]): boolean {
    return !!this.layout?.items.some(item => kinds.includes(item.kind));
  }

  private needContext(agent: Agent): NeedContext {
    const layout = this.layout;
    const state = this.state;
    const visitor = VISITOR_ROLES.has(agent.role);
    return {
      weather: layout?.weather ?? 'sunny',
      indoor: !!layout?.indoor,
      queue: state ? Math.max(0, state.arrived - state.served) : 0,
      crowd: Math.min(1, this.agents.filter(a => a.active).length / 48),
      hasRest: this.hasFacility(REST_KINDS),
      hasWater: this.hasFacility(WATER_KINDS),
      hasSocial: this.hasFacility(SOCIAL_KINDS),
      hasView: this.hasFacility(STAGE_KINDS) || visitor,
      working: isOnDuty(agent.role),
      progress: state && layout ? Math.max(0, Math.min(1, state.minute / Math.max(1, layout.activity.duration))) : 0,
    };
  }

  private needActivity(agent: Agent): NeedActivity {
    if (agent.path.length) return 'walking';
    switch (agent.state) {
      case 'queueing': return 'queueing';
      case 'seated': return 'seated';
      case 'watching': return 'watching';
      case 'resting': return 'resting';
      case 'comforting': return 'comforting';
      case 'socializing': return 'socializing';
      case 'performing': case 'hosting': case 'patrolling': case 'serving': return 'working';
      case 'checkin': return 'waiting';
      case 'idle': return 'idle';
      default: return 'walking';
    }
  }

  private beginLeave(agent: Agent, reason: string) {
    this.releaseSeat(agent);
    agent.state = 'leaving';
    agent.task = this.taskFor(agent.role, agent.state);
    agent.intent = reason;
    this.routeAgent(agent, offset(this.goals.entry, agent.seed, 1.5), '前往出口');
  }

  private beginNeed(agent: Agent, action: 'rest' | 'comfort' | 'social' | 'view' | 'leave', reason: string) {
    const from = {x: agent.rig.group.position.x, z: agent.rig.group.position.z};
    agent.intent = reason;
    if (action === 'leave') {
      this.beginLeave(agent, reason);
      return;
    }
    if (action === 'rest') {
      agent.state = 'toRest';
      agent.task = this.taskFor(agent.role, agent.state);
      const target = this.facilityPoint(REST_KINDS, from, this.goals.rest);
      this.routeAgent(agent, offset(target, agent.seed, 1.7), '前往休息区');
      return;
    }
    if (action === 'comfort') {
      agent.state = 'toComfort';
      agent.task = this.taskFor(agent.role, agent.state);
      const target = this.facilityPoint(WATER_KINDS, from, this.goals.rest);
      this.routeAgent(agent, offset(target, agent.seed, 1.8), '前往补水点');
      return;
    }
    if (action === 'social') {
      agent.state = 'toSocial';
      agent.task = this.taskFor(agent.role, agent.state);
      const target = this.facilityPoint(SOCIAL_KINDS, from, this.goals.area);
      this.routeAgent(agent, offset(target, agent.seed, 2.1), '前往社交区');
      return;
    }
    agent.state = 'watching';
    agent.timer = 0;
    agent.task = this.taskFor(agent.role, agent.state);
    this.routeAgent(agent, offset(this.goals.area, agent.seed, 2.2), '靠近主活动区观看');
  }

  private returnFromNeed(agent: Agent) {
    agent.intent = '完成当前补给，返回活动区域';
    if (!VISITOR_ROLES.has(agent.role)) {
      this.releaseSeat(agent);
      agent.state = agent.role === 'performer' || agent.role === 'host' ? 'toStage'
        : agent.role === 'medical' || agent.role === 'service' || agent.role === 'vendor' ? 'serving' : 'patrolling';
      agent.task = this.taskFor(agent.role, agent.state);
      this.routeAgent(agent, this.specialPost(agent.role, agent.serial % 3), this.goalLabelFor(agent.role));
      return;
    }
    const owned = agent.seatId ? this.seats.find(seat => seat.id === agent.seatId && seat.takenBy === agent.id) : null;
    const seat = owned ?? this.claimSeat(agent);
    if (seat) {
      agent.state = 'toSeat';
      agent.task = this.taskFor(agent.role, agent.state);
      this.routeAgent(agent, {x: seat.x, z: seat.z}, `返回座位 ${seat.id}`);
      return;
    }
    agent.state = 'watching';
    agent.timer = 10 + agent.serial % 6;
    agent.task = this.taskFor(agent.role, agent.state);
    this.routeAgent(agent, offset(this.goals.area, agent.seed, 2), '返回活动区');
  }

  /**
   * Rule + probability needs loop. Only neutral states make decisions so the
   * existing task FSM is never interrupted mid-route; queued visitors can
   * abandon the line when their personal patience runs out.
   */
  private updateNeeds(agent: Agent, dt: number) {
    if (dt <= 0) return;
    const context = this.needContext(agent);
    agent.needs = stepNeeds(agent.needs, agent.personality, context, this.needActivity(agent), dt);
    agent.mood = updateMood(agent.mood, agent.personality, agent.needs, context, dt);
    agent.queueWait = agent.state === 'queueing' ? agent.queueWait + dt : 0;
    if (agent.state === 'queueing' && VISITOR_ROLES.has(agent.role)
      && agent.queueWait > queueTolerance(agent.personality, context.queue)) {
      this.beginLeave(agent, `排队 ${Math.round(agent.queueWait)} 秒后耐心耗尽，提前离场`);
      return;
    }
    if (!DECISION_STATES.has(agent.state) || agent.path.length) return;
    agent.needTimer -= dt;
    if (agent.needTimer > 0) return;
    agent.needTimer = 2.2 + (agent.serial % 5) * .55;
    const random = new Random(agent.needRng);
    const decision = decideNeed(agent.needs, agent.personality, context, agent.mood, VISITOR_ROLES.has(agent.role), random);
    agent.needRng = random.state;
    if (decision) this.beginNeed(agent, decision.action, decision.reason);
  }

  private recover(agent: Agent) {
    agent.stuck = 0;
    agent.retry = 0;
    agent.recoveries++;
    const from = {x: agent.rig.group.position.x, z: agent.rig.group.position.z};
    const colliders = this.collidersFor(agent);
    const escape = this.escapePoint(from, colliders);
    if (escape) {
      const moved = moveWithCollision(colliders, from.x, from.z, escape.x, escape.z, PERSON_RADIUS);
      agent.rig.group.position.x = moved.x;
      agent.rig.group.position.z = moved.z;
    }
    const ok = agent.recoveries <= 2 ? this.repath(agent) : this.routeFallback(agent);
    if (!ok) {
      agent.unreachable = true;
      agent.retry = 2.5 + (agent.serial % 4) * .5;
    }
  }

  /** Retry a cleared route after a short delay: revalidate the seat and goal before routing again. */
  private resume(agent: Agent): boolean {
    if (agent.state === 'toSeat') {
      const owned = this.seats.find(s => s.id === agent.seatId && s.takenBy === agent.id);
      if (owned) return this.routeAgent(agent, {x: owned.x, z: owned.z}, `前往座位 ${owned.id}`);
      this.releaseSeat(agent);
      const seat = this.claimSeat(agent);
      if (seat) return this.routeAgent(agent, {x: seat.x, z: seat.z}, `前往座位 ${seat.id}`);
      agent.state = 'watching';
      agent.timer = 12 + (agent.serial % 8);
      return false;
    }
    return this.repath(agent);
  }

  private goalBase(agent: Agent): Point {
    if (agent.state === 'leaving') return this.goals.entry;
    if (agent.state === 'toStage' || agent.state === 'performing') return this.goals.stage;
    if (agent.state === 'hosting') return this.goals.stage;
    if (agent.state === 'toGoal') return agent.role === 'performer' ? this.goals.backstage : this.goals.area;
    if (agent.state === 'toSeat' || agent.state === 'seated') {
      const seat = this.seats.find(s => s.id === agent.seatId);
      return seat ? {x: seat.x, z: seat.z} : this.goals.area;
    }
    if (agent.state === 'watching') return this.goals.area;
    if (agent.state === 'toRest' || agent.state === 'resting') return this.goals.rest;
    if (agent.state === 'toComfort' || agent.state === 'comforting') {
      const position = agent.rig.group.position;
      return this.facilityPoint(WATER_KINDS, position, this.goals.rest);
    }
    if (agent.state === 'toSocial' || agent.state === 'socializing') {
      const position = agent.rig.group.position;
      return this.facilityPoint(SOCIAL_KINDS, position, this.goals.area);
    }
    if (ARRIVAL.has(agent.state)) return this.goals.desk;
    if (agent.role === 'medical') return this.goals.medical;
    if (agent.role === 'service') return this.goals.service;
    if (agent.role === 'vendor') return this.goals.vendor;
    if (agent.role === 'security') return this.goals.perimeter;
    if (agent.role === 'referee') return this.goals.field;
    return this.goals.area;
  }

  private goalLabel(agent: Agent): string {
    if (agent.state === 'leaving') return '前往出口';
    if (agent.state === 'toStage') return '前往舞台';
    if (agent.state === 'performing') return '舞台演出';
    if (agent.state === 'hosting') return '主持台';
    if (agent.state === 'toSeat') return agent.seatId ? `前往座位 ${agent.seatId}` : '前往活动区';
    if (agent.state === 'seated') return agent.seatId ? `座位 ${agent.seatId}` : '活动区';
    if (agent.state === 'watching') return '站立观看区';
    if (agent.state === 'toRest') return '前往休息区';
    if (agent.state === 'resting') return '休息区';
    if (agent.state === 'toComfort') return '前往补水点';
    if (agent.state === 'comforting') return '补水 / 如厕';
    if (agent.state === 'toSocial') return '前往社交区';
    if (agent.state === 'socializing') return '人群交流区';
    if (agent.state === 'queueing') return '签到排队';
    if (agent.state === 'checkin') return '签到台';
    if (ARRIVAL.has(agent.state)) return '前往签到台';
    if (agent.role === 'medical') return '医疗点';
    if (agent.role === 'service') return '服务台';
    if (agent.role === 'vendor') return '摊位';
    if (agent.role === 'security') return '入口巡逻';
    if (agent.role === 'referee') return '比赛场地';
    return '活动区';
  }

  private visitorRole(): Role {
    const scene = this.layout?.activity.scene;
    return scene && ['performance', 'conference', 'business', 'sports'].includes(scene) ? 'audience' : 'participant';
  }

  private createAgent(role: Role): Agent {
    const serial = ++this.serial;
    const look = ROLE_LOOK[role];
    const shirt = look ? look[0] : SHIRTS[serial % SHIRTS.length];
    const pants = look ? look[1] : PANTS[serial % PANTS.length];
    const rig = createPerson(shirt, pants, SKIN[serial % SKIN.length], HAIR[serial % HAIR.length]);
    const seed = serial * 1.37;
    const personality = personalityFor(seed, role);
    const agent: Agent = {
      id: `person-${serial}`, serial, role, state: 'idle', organization: ORG[role], task: '待命',
      rig, active: false, path: [], cursor: 0, speed: 1.9, goal: this.goals.entry, goalLabel: '待命',
      home: this.goals.area, seed, timer: 0, waiting: 0, seatId: null, seatLift: 0, pushCooldown: 0,
      stuck: 0, retry: 0, recoveries: 0, unreachable: false,
      personality, needs: initialNeeds(seed, role), mood: initialMood(seed, personality),
      needRng: Math.round(seed * 7919 + 17) >>> 0, needTimer: 2 + serial % 5, intent: '观察现场', queueWait: 0,
    };
    rig.group.userData.personId = agent.id;
    rig.group.userData.role = role;
    rig.group.visible = false;
    this.agents.push(agent);
    this.root.add(rig.group);
    return agent;
  }

  private inactiveAgent(role: Role): Agent | undefined {
    return this.agents.find(a => !a.active && a.role === role);
  }

  private activate(role: Role, state: PersonState, start: Point, label: string) {
    if (this.agents.filter(a => a.active).length >= MAX_AGENTS) return null;
    const agent = this.inactiveAgent(role) ?? this.createAgent(role);
    agent.role = role;
    agent.state = state;
    agent.organization = ORG[role];
    agent.task = this.taskFor(role, state);
    agent.active = true;
    agent.rig.group.visible = true;
    agent.rig.group.position.set(start.x, 0, start.z);
    agent.path = [];
    agent.cursor = 0;
    agent.timer = 0;
    agent.waiting = 0;
    agent.pushCooldown = 0;
    agent.stuck = 0;
    agent.retry = 0;
    agent.recoveries = 0;
    agent.unreachable = false;
    agent.personality = personalityFor(agent.seed, role);
    agent.needs = initialNeeds(agent.seed, role);
    agent.mood = initialMood(agent.seed, agent.personality);
    agent.needRng = Math.round(agent.seed * 7919 + agent.serial * 104729 + 17) >>> 0;
    agent.needTimer = 1.5 + (agent.serial % 4) * .7;
    agent.intent = '进入现场，观察场地';
    agent.queueWait = 0;
    const baseSpeed = role === 'staff' || role === 'volunteer' ? 1.25 : role === 'security' ? 1.15 : 1.8 + (agent.serial % 7) * .08;
    agent.speed = baseSpeed * (.9 + agent.personality.mobility * .25);
    agent.rig.group.userData.role = role;
    if (state === 'toSeat') {
      const seat = this.claimSeat(agent);
      if (seat) this.routeAgent(agent, {x: seat.x, z: seat.z}, `前往座位 ${seat.id}`);
      else this.routeAgent(agent, offset(this.goals.area, agent.seed, 2.4), '前往活动区');
    } else {
      this.routeAgent(agent, start, label);
    }
    return agent;
  }

  private deactivate(agent: Agent) {
    this.releaseSeat(agent);
    agent.active = false;
    agent.rig.group.visible = false;
    agent.path = [];
    agent.stuck = 0;
    agent.retry = 0;
    agent.unreachable = false;
    agent.rig.group.position.y = 0;
    agent.rig.leftLeg.rotation.x = 0;
    agent.rig.rightLeg.rotation.x = 0;
  }

  private syncRole(role: Role, count: number) {
    const list = this.agents.filter(a => a.active && a.role === role);
    if (list.length > count) for (let i = count; i < list.length; i++) this.deactivate(list[i]);
  }

  private syncVisitors() {
    if (!this.state) return;
    const state = this.state;
    const role = this.visitorRole();
    const queueCount = Math.min(this.cap(14), Math.max(0, state.arrived - state.served));
    const attendCount = Math.min(this.cap(14), Math.max(0, state.served - state.departed));
    const leaveCount = Math.min(this.cap(4), state.status === 'finished' ? 4 : state.departed > 0 ? 2 : 0);
    const active = this.agents.filter(a => a.active && a.role === role);
    const queueAgents = active.filter(a => ARRIVAL.has(a.state));
    const attendAgents = active.filter(a => ATTEND.has(a.state));
    const leaving = active.filter(a => a.state === 'leaving');
    if (queueAgents.length < queueCount) {
      for (let i = queueAgents.length; i < queueCount; i++) {
        const agent = this.activate(role, 'arriving', offset(this.goals.entry, this.serial + i * 3.7, 2.6), '前往签到台');
        if (agent) this.routeAgent(agent, this.queuePoint(i), '签到排队');
      }
    } else if (queueAgents.length > queueCount) {
      for (let i = queueCount; i < queueAgents.length; i++) this.deactivate(queueAgents[i]);
    }
    if (attendAgents.length < attendCount) {
      for (let i = attendAgents.length; i < attendCount; i++) {
        const agent = this.activate(role, 'toSeat', offset(this.goals.desk, this.serial + i * 2.3, 2.6), '寻找座位');
        if (agent) agent.rig.group.rotation.y = Math.random() * Math.PI * 2;
      }
    } else if (attendAgents.length > attendCount) {
      for (let i = attendCount; i < attendAgents.length; i++) this.deactivate(attendAgents[i]);
    }
    if (leaving.length < leaveCount) {
      for (let i = leaving.length; i < leaveCount; i++) {
        const agent = this.activate(role, 'leaving', offset(this.goals.area, this.serial * 3.1 + i, 2.5), '离场');
        if (agent) this.routeAgent(agent, offset(this.goals.entry, agent.seed, 1.5), '前往出口');
      }
    }
  }

  private queuePoint(index: number): Point {
    const desk = this.goals.desk, entry = this.goals.entry;
    const dx = entry.x - desk.x, dz = entry.z - desk.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = index % 2 === 0 ? 1 : -1;
    const lane = Math.floor(index / 2);
    return {
      x: desk.x + dx / length * (2.3 + lane * .95) + (-dz / length) * side * .45,
      z: desk.z + dz / length * (2.3 + lane * .95) + (dx / length) * side * .45,
    };
  }

  private syncSpecials() {
    if (!this.state) return;
    const state = this.state;
    const staffTarget = Math.min(this.cap(6), Math.max(0, Math.ceil(state.availableStaff / 3)));
    this.syncRole('staff', staffTarget);
    this.syncRole('volunteer', Math.min(4, Math.round(this.layout?.volunteers ?? 0)));
    this.syncRole('security', Math.min(3, 1 + Math.floor((this.layout?.activity.people ?? 0) / 300)));
    this.syncRole('medical', 1);
    this.syncRole('service', Math.min(3, Math.max(1, this.layout?.items.filter(i => ['service', 'checkin', 'checkinSmall', 'checkinLarge'].includes(i.kind)).length ?? 1)));
    this.syncRole('vendor', Math.min(3, this.layout?.items.filter(i => ['tent', 'tentSmall'].includes(i.kind)).length ?? 0));
    this.syncRole('performer', Math.min(4, this.layout?.activity.scene === 'performance' ? 4 : this.layout?.activity.scene === 'athletics' ? 4 : 2));
    this.syncRole('host', 1);
    this.syncRole('referee', this.layout?.activity.scene === 'athletics' || this.layout?.activity.scene === 'sports' ? 2 : 0);

    for (const role of ['performer', 'host', 'referee', 'staff', 'volunteer', 'security', 'medical', 'service', 'vendor'] as Role[]) {
      const desired = this.desiredCount(role);
      const current = this.agents.filter(a => a.active && a.role === role).length;
      if (current >= desired) continue;
      for (let i = current; i < desired; i++) this.spawnSpecial(role, i);
    }
  }

  private desiredCount(role: Role): number {
    if (!this.state) return 0;
    switch (role) {
      case 'staff': return Math.min(this.cap(6), Math.max(0, Math.ceil(this.state.availableStaff / 3)));
      case 'volunteer': return Math.min(4, Math.round(this.layout?.volunteers ?? 0));
      case 'security': return Math.min(3, 1 + Math.floor((this.layout?.activity.people ?? 0) / 300));
      case 'medical': return 1;
      case 'service': return Math.min(3, Math.max(1, this.layout?.items.filter(i => ['service', 'checkin', 'checkinSmall', 'checkinLarge'].includes(i.kind)).length ?? 1));
      case 'vendor': return Math.min(3, this.layout?.items.filter(i => ['tent', 'tentSmall'].includes(i.kind)).length ?? 0);
      case 'performer': return Math.min(4, this.layout?.activity.scene === 'performance' ? 4 : this.layout?.activity.scene === 'athletics' ? 4 : 2);
      case 'host': return 1;
      case 'referee': return this.layout?.activity.scene === 'athletics' || this.layout?.activity.scene === 'sports' ? 2 : 0;
      default: return 0;
    }
  }

  private spawnSpecial(role: Role, index: number) {
    const target = this.specialPost(role, index);
    let state: PersonState = 'toGoal';
    if (role === 'performer') state = 'toStage';
    else if (role === 'host') state = 'toStage';
    else if (role === 'referee') state = 'patrolling';
    else if (role === 'security') state = 'patrolling';
    else if (role === 'medical' || role === 'service' || role === 'vendor') state = 'serving';
    else state = 'patrolling';
    const start = role === 'performer' ? offset(this.goals.backstage, index * 2.1, 1.6) : offset(this.goals.entry, this.serial * 2.7 + index, 3);
    const agent = this.activate(role, state, start, this.goalLabelFor(role));
    if (agent) {
      agent.task = this.taskFor(role, state);
      this.routeAgent(agent, target, this.goalLabelFor(role));
      if (role === 'performer') agent.state = index === 0 ? 'toStage' : 'idle';
    }
  }

  private specialPost(role: Role, index: number): Point {
    const base = role === 'performer' ? this.goals.backstage
      : role === 'host' ? this.goals.stage
        : role === 'referee' ? this.goals.field
          : role === 'medical' ? this.goals.medical
            : role === 'service' ? this.goals.service
              : role === 'vendor' ? this.goals.vendor
                : role === 'security' ? this.goals.perimeter : this.goals.area;
    return offset(base, index * 1.9 + 2, role === 'performer' || role === 'host' ? .8 : 3.2);
  }

  private goalLabelFor(role: Role): string {
    return role === 'performer' ? '后台待场'
      : role === 'host' ? '主持台'
        : role === 'referee' ? '比赛场地'
          : role === 'medical' ? '医疗点'
            : role === 'service' ? '服务台'
              : role === 'vendor' ? '摊位' : role === 'security' ? '入口巡逻' : '现场巡逻';
  }

  private taskFor(role: Role, state: PersonState): string {
    if (state === 'leaving') return '结束任务并离场';
    if (ARRIVAL.has(state)) return '签到 / 入场';
    if (state === 'toRest' || state === 'resting') return '休息补给';
    if (state === 'toComfort' || state === 'comforting') return '补水与短暂调整';
    if (state === 'toSocial' || state === 'socializing') return '与现场人群交流';
    if (role === 'performer') return state === 'performing' ? '场上演出 / 比赛' : '准备演出 / 比赛';
    if (role === 'host') return '主持活动流程';
    if (role === 'referee') return '执裁与记录成绩';
    if (role === 'security') return '维持入口与观众区秩序';
    if (role === 'medical') return '现场医疗值守';
    if (role === 'service') return '签到、咨询与引导';
    if (role === 'vendor') return '摊位运营';
    if (role === 'staff') return '现场运营与设施维护';
    if (role === 'volunteer') return '协助引导与补给';
    if (state === 'toSeat' || state === 'seated') return '就座观看';
    if (state === 'watching') return '观看 / 参与';
    return this.layout?.activity.scene === 'performance' ? '观看演出' : '参与活动';
  }

  private moveAlong(agent: Agent, dt: number, positions: THREE.Vector3[]): boolean {
    if (!agent.path.length) return false;
    const group = agent.rig.group;
    const target = agent.path[Math.min(agent.cursor, agent.path.length - 1)];
    const dx = target.x - group.position.x, dz = target.z - group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < .24) {
      agent.cursor++;
      if (agent.cursor >= agent.path.length) {
        agent.path = [];
        this.arrive(agent);
      }
      return false;
    }
    let slow = 1;
    for (const other of positions) {
      if (other === group.position) continue;
      if (Math.hypot(other.x - group.position.x, other.z - group.position.z) < .7) { slow = .55; break; }
    }
    const colliders = this.collidersFor(agent);
    const step = Math.min(distance, agent.speed * this.speedFactor * slow * dt);
    const nx = group.position.x + dx / distance * step;
    const nz = group.position.z + dz / distance * step;
    const moved = moveWithCollision(colliders, group.position.x, group.position.z, nx, nz, PERSON_RADIUS);
    group.position.x = moved.x;
    group.position.z = moved.z;
    if (moved.blocked) {
      const collider = nearestMovable(this.colliders, nx, nz, .95);
      const staff = STAFF_ROLES.has(agent.role);
      if (collider && agent.pushCooldown <= 0 && (staff ? collider.mass <= 120 : collider.mass <= 40)) {
        const strength = Math.min(.04, .012 + Math.max(0, 60 - collider.mass) / 60 * .025);
        this.pushes.push({id: collider.ownerId, dx: dx / distance * strength, dz: dz / distance * strength});
        agent.pushCooldown = staff ? 1.4 : 2.8;
      }
      agent.path = [];
      agent.waiting = .3 + (agent.serial % 5) * .1;
      agent.retry = .6 + (agent.serial % 4) * .15;
      if (moved.slid) group.rotation.y = Math.atan2(dx, dz);
      return false;
    }
    group.rotation.y = Math.atan2(dx, dz);
    return true;
  }

  private arrive(agent: Agent) {
    agent.stuck = 0;
    agent.retry = 0;
    agent.recoveries = 0;
    agent.unreachable = false;
    agent.task = this.taskFor(agent.role, agent.state);
    if (agent.state === 'leaving') { this.deactivate(agent); return; }
    if (agent.state === 'toSeat') {
      const seat = this.seats.find(s => s.id === agent.seatId);
      if (!seat || (seat.takenBy && seat.takenBy !== agent.id)) {
        this.releaseSeat(agent);
        const replacement = this.claimSeat(agent);
        if (replacement) {
          this.routeAgent(agent, {x: replacement.x, z: replacement.z}, `改往座位 ${replacement.id}`);
          return;
        }
        agent.state = 'watching';
        agent.timer = 12 + (agent.serial % 8);
        agent.task = this.taskFor(agent.role, agent.state);
        return;
      }
      seat.takenBy = agent.id;
      agent.state = 'seated';
      agent.timer = 8 + (agent.serial * 1.7) % 10;
      agent.task = this.taskFor(agent.role, agent.state);
      agent.rig.group.position.set(seat.x, seat.lift, seat.z);
      agent.rig.group.rotation.y = seat.facing;
      return;
    }
    if (agent.state === 'toRest') {
      agent.state = 'resting';
      agent.timer = 6 + (agent.serial % 5);
      agent.task = this.taskFor(agent.role, agent.state);
      return;
    }
    if (agent.state === 'toComfort') {
      agent.state = 'comforting';
      agent.timer = 6 + (agent.serial % 5);
      agent.task = this.taskFor(agent.role, agent.state);
      return;
    }
    if (agent.state === 'toSocial') {
      agent.state = 'socializing';
      agent.timer = 5 + (agent.serial % 5);
      agent.task = this.taskFor(agent.role, agent.state);
      return;
    }
    if (agent.state === 'watching') {
      agent.timer = 9 + (agent.serial % 7);
      agent.task = this.taskFor(agent.role, agent.state);
      return;
    }
    if (agent.state === 'toStage') {
      const role = agent.role;
      agent.state = role === 'performer' ? 'performing' : 'hosting';
      agent.timer = 14 + (agent.serial % 9);
      agent.task = this.taskFor(agent.role, agent.state);
      return;
    }
    if (agent.state === 'toGoal') {
      agent.state = 'idle';
      agent.timer = 4 + (agent.serial % 4);
      agent.task = this.taskFor(agent.role, agent.state);
      return;
    }
    if (agent.state === 'patrolling' || agent.state === 'serving') {
      agent.timer = 2.5 + (agent.serial % 5);
      return;
    }
    if (agent.state === 'queueing') {
      agent.timer = 2 + (agent.serial % 4) * .7;
      return;
    }
    if (agent.state === 'arriving') {
      agent.state = 'queueing';
      agent.timer = .5 + (agent.serial % 3) * .2;
      agent.task = this.taskFor(agent.role, agent.state);
      agent.intent = '排队等待签到';
    }
  }

  private updateAgent(agent: Agent, dt: number, positions: THREE.Vector3[]) {
    if (agent.pushCooldown > 0) agent.pushCooldown -= dt;
    const race = agent.role === 'performer' && this.layout?.activity.scene === 'athletics'
      && this.state?.tasks.find(task => task.status === '进行中' && /比赛|赛跑|短跑|长跑|接力/.test(task.name));
    if (race && this.layout) {
      const outer = this.layout.size * .29, inner = outer - Math.min(5, this.layout.size * .1);
      const lane = (agent.serial - 1) % 4;
      const radius = inner + (outer - inner) * (lane + .5) / 4;
      const point = trackPoint(radius, this.layout.size * .15, (this.elapsed * (.018 + lane * .0018) + lane * .025) % 1);
      agent.state = 'performing'; agent.task = race.name; agent.path = []; agent.goalLabel = `第 ${lane + 1} 跑道`;
      agent.rig.group.position.set(point.x, 0, point.z);
      agent.rig.group.rotation.y = point.heading;
      animatePerson(agent.rig, this.elapsed + agent.seed, true, 1.7, 'running');
      return;
    }
    this.updateNeeds(agent, dt);
    const group = agent.rig.group;
    const beforeX = group.position.x, beforeZ = group.position.z;
    const walking = this.moveAlong(agent, dt, positions);
    const advance = Math.hypot(group.position.x - beforeX, group.position.z - beforeZ);
    if (agent.state === 'seated' || agent.state === 'resting') {
      agent.timer -= dt;
      const seated = agent.state === 'seated';
      group.position.y = seated ? agent.seatLift + .02 : .02;
      agent.rig.leftLeg.rotation.x = seated ? -1.15 : -.25;
      agent.rig.rightLeg.rotation.x = seated ? -1.15 : -.25;
      if (agent.timer <= 0) {
        const from = {x: group.position.x, z: group.position.z};
        if (seated) {
          if (agent.needs.rest > .5) {
            agent.state = 'toRest';
            agent.task = this.taskFor(agent.role, agent.state);
            agent.intent = `就座后疲劳仍有 ${Math.round(agent.needs.rest * 100)}%，去休息区恢复`;
            const target = this.facilityPoint(REST_KINDS, from, this.goals.rest);
            this.routeAgent(agent, offset(target, agent.seed, 1.7), '前往休息区');
          } else {
            agent.state = 'watching';
            agent.timer = 10 + agent.serial % 8;
            agent.task = this.taskFor(agent.role, agent.state);
            agent.intent = '体力恢复，起身观看活动';
            this.routeAgent(agent, offset(this.goals.area, agent.seed, 2.2), '前往观看区');
          }
        } else if (agent.needs.rest > .55) {
          agent.timer = 4 + agent.serial % 3;
          agent.intent = `仍在恢复体力（休息需求 ${Math.round(agent.needs.rest * 100)}%）`;
        } else {
          this.returnFromNeed(agent);
        }
      }
      animatePerson(agent.rig, this.elapsed + agent.seed, false, 1, seated ? 'seated' : 'resting');
      return;
    }
    group.position.y = 0;
    if (agent.rig.leftLeg.rotation.x !== 0) { agent.rig.leftLeg.rotation.x = 0; agent.rig.rightLeg.rotation.x = 0; }
    if (walking) {
      agent.stuck = 0;
      animatePerson(agent.rig, this.elapsed + agent.seed, true, agent.speed / 2);
      return;
    }
    if (agent.waiting > 0) { agent.waiting -= dt; animatePerson(agent.rig, this.elapsed + agent.seed, false); return; }
    if (!agent.path.length && agent.retry > 0) {
      agent.retry -= dt;
      if (agent.retry <= 0) {
        agent.retry = 0;
        agent.unreachable = false;
        const ok = agent.recoveries >= 3 ? this.routeFallback(agent) : this.resume(agent);
        if (ok) {
          agent.recoveries = 0;
        } else {
          agent.recoveries++;
          agent.unreachable = true;
          agent.retry = agent.recoveries > 6 ? 12 + (agent.serial % 4) * 3 : 2.5 + (agent.serial % 4) * .5;
        }
      }
      animatePerson(agent.rig, this.elapsed + agent.seed, false);
      return;
    }
    if (!agent.path.length && (agent.state === 'arriving' || agent.state === 'queueing' || agent.state === 'toSeat'
      || agent.state === 'toRest' || agent.state === 'toComfort' || agent.state === 'toSocial' || agent.state === 'toStage'
      || agent.state === 'toGoal' || agent.state === 'leaving')
      && Math.hypot(agent.goal.x - group.position.x, agent.goal.z - group.position.z) < .9) {
      this.arrive(agent);
      animatePerson(agent.rig, this.elapsed + agent.seed, false);
      return;
    }
    if (agent.path.length && advance < .01) {
      agent.stuck += dt;
      if (agent.stuck > 2.6) this.recover(agent);
    } else if (agent.stuck > 0) {
      agent.stuck = Math.max(0, agent.stuck - dt * 2);
    }
    if (!agent.path.length) {
      if (agent.state === 'queueing') {
        agent.timer -= dt;
        if (agent.timer <= 0) {
          const index = this.agents.filter(a => a.active && ARRIVAL.has(a.state)).indexOf(agent);
          const next = this.queuePoint(Math.max(0, index));
          if (Math.hypot(next.x - agent.goal.x, next.z - agent.goal.z) > 1.2) {
            this.routeAgent(agent, next, '签到排队');
          } else {
            agent.timer = 1.6;
          }
        }
      } else if (agent.state === 'performing' || agent.state === 'hosting' || agent.state === 'serving' || agent.state === 'watching' || agent.state === 'patrolling') {
        agent.timer -= dt;
        if (agent.timer <= 0) {
          const role = agent.role;
          if (role === 'performer') {
            this.routeAgent(agent, offset(this.goals.backstage, agent.seed, 1.2), '后台待场');
            agent.state = 'toGoal';
            agent.timer = 7 + agent.serial % 6;
          } else if (role === 'host') {
            this.routeAgent(agent, offset(this.goals.stage, agent.seed, .6), '主持台');
            agent.timer = 12 + agent.serial % 8;
          } else if (role === 'security') {
            this.routeAgent(agent, offset(this.goals.perimeter, agent.seed + this.elapsed, 3), '入口巡逻');
            agent.timer = 5 + agent.serial % 5;
          } else if (role === 'referee') {
            this.routeAgent(agent, offset(this.goals.field, agent.seed + this.elapsed * .3, 3), '比赛场地');
            agent.timer = 5 + agent.serial % 4;
          } else if (STAFF_ROLES.has(role)) {
            const goals = [this.goals.desk, this.goals.area, this.goals.rest];
            this.routeAgent(agent, offset(goals[Math.floor(this.elapsed / 4 + agent.serial) % goals.length], agent.seed + this.elapsed, 2.5), '现场巡逻');
            agent.timer = 5 + agent.serial % 5;
          } else {
            this.routeAgent(agent, offset(this.specialPost(role, agent.serial), agent.seed + this.elapsed, 1.8), this.goalLabelFor(role));
            agent.timer = 6 + agent.serial % 6;
          }
          agent.task = this.taskFor(agent.role, agent.state);
        }
      } else if (agent.state === 'idle') {
        agent.timer -= dt;
        if (agent.timer <= 0) {
          agent.state = 'toStage';
          agent.task = this.taskFor(agent.role, agent.state);
          this.routeAgent(agent, this.goals.stage, '前往舞台');
        }
      } else if (agent.state === 'comforting' || agent.state === 'socializing') {
        agent.timer -= dt;
        if (agent.timer <= 0) this.returnFromNeed(agent);
      }
    }
    if (!agent.path.length && agent.state === 'arriving') {
      agent.state = 'queueing';
      agent.timer = .5;
      agent.task = this.taskFor(agent.role, agent.state);
      agent.intent = '排队等待签到';
    }
    animatePerson(agent.rig, this.elapsed + agent.seed, false, 1, agent.state === 'performing' ? 'performing' : 'normal');
  }

  private separate(dt: number) {
    if (dt <= 0) return;
    const movers = this.agents.filter(agent => agent.active && agent.state !== 'seated' && agent.state !== 'resting');
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i], b = movers[j];
        const pa = a.rig.group.position, pb = b.rig.group.position;
        const aMoving = a.path.length > 0 && a.waiting <= 0 && a.retry <= 0;
        const bMoving = b.path.length > 0 && b.waiting <= 0 && b.retry <= 0;
        if (!aMoving && !bMoving) continue;
        let dx = pb.x - pa.x, dz = pb.z - pa.z;
        let distance = Math.hypot(dx, dz);
        if (distance >= PERSON_RADIUS * 2) continue;
        if (distance < 1e-4) { dx = .01; dz = .01; distance = .014; }
        dx /= distance; dz /= distance;
        const push = Math.min(.05, (PERSON_RADIUS - distance / 2) * .4);
        const wa = aMoving ? (bMoving ? .5 : .25) : .75;
        const nextA = moveWithCollision(this.collidersFor(a), pa.x, pa.z, pa.x - dx * push * wa, pa.z - dz * push * wa, PERSON_RADIUS);
        const nextB = moveWithCollision(this.collidersFor(b), pb.x, pb.z, pb.x + dx * push * (1 - wa), pb.z + dz * push * (1 - wa), PERSON_RADIUS);
        pa.x = nextA.x; pa.z = nextA.z;
        pb.x = nextB.x; pb.z = nextB.z;
      }
    }
  }

  update(dt: number) {
    if (this.frozen) return;
    this.elapsed += dt;
    if (this.state) {
      this.syncVisitors();
      this.syncSpecials();
    } else {
      for (const agent of this.agents) if (agent.active) this.deactivate(agent);
    }
    const positions = this.agents.filter(a => a.active && a.state !== 'seated' && a.state !== 'resting').map(a => a.rig.group.position);
    for (const agent of this.agents) {
      if (!agent.active) continue;
      this.updateAgent(agent, dt, positions);
    }
    this.separate(dt);
    for (const agent of this.ambient) {
      if (dt <= 0) break;
      if (agent.wait > 0) {
        agent.wait -= dt;
        animatePerson(agent.rig, this.elapsed + agent.seed, false);
        continue;
      }
      const target = agent.loop[(agent.cursor + 1) % agent.loop.length];
      const dx = target.x - agent.rig.group.position.x, dz = target.z - agent.rig.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < .3) {
        agent.cursor = (agent.cursor + 1) % agent.loop.length;
        if (Math.random() < .16) agent.wait = .8 + Math.random() * 2;
        continue;
      }
      const step = Math.min(distance, agent.speed * dt);
      agent.rig.group.position.x += dx / distance * step;
      agent.rig.group.position.z += dz / distance * step;
      agent.rig.group.rotation.y = Math.atan2(dx, dz);
      animatePerson(agent.rig, this.elapsed + agent.seed, true, agent.speed / 1.6);
    }
  }

  takePushes(): {id: string; dx: number; dz: number}[] {
    const pushes = this.pushes;
    this.pushes = [];
    return pushes;
  }

  pick(raycaster: THREE.Raycaster): string {
    const roots = this.agents.filter(a => a.active).map(a => a.rig.group);
    const hits = raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.personId) object = object.parent;
      if (object?.userData.personId) return String(object.userData.personId);
    }
    return '';
  }

  info(id: string): PersonInfo | null {
    const agent = this.agents.find(a => a.id === id && a.active);
    if (!agent) return null;
    return {
      id: agent.id, role: agent.role, roleLabel: ROLE_LABELS[agent.role], organization: agent.organization,
      group: WORK_GROUP[agent.role],
      task: this.taskFor(agent.role, agent.state), state: agent.state, stateLabel: STATE_LABELS[agent.state],
      goal: agent.goalLabel, destination: {x: agent.goal.x, z: agent.goal.z},
      routeStatus: agent.unreachable ? 'unreachable' : !agent.path.length && agent.retry > 0 ? 'blocked' : 'normal',
      position: {x: agent.rig.group.position.x, z: agent.rig.group.position.z},
      pathRemaining: Math.max(0, agent.path.length - agent.cursor), seat: agent.seatId,
      personality: {...agent.personality}, needs: {...agent.needs}, mood: agent.mood, intent: agent.intent,
    };
  }

  debugSnapshot(): DebugSnapshot {
    return {
      people: this.agents.filter(agent => agent.active).map(agent => ({
        id: agent.id, x: agent.rig.group.position.x, z: agent.rig.group.position.z, y: agent.rig.group.position.y,
        state: agent.state, roleLabel: ROLE_LABELS[agent.role], goal: {x: agent.goal.x, z: agent.goal.z},
        path: agent.path.slice(agent.cursor), seat: agent.seatId,
      })),
      seats: this.seats.map(seat => ({id: seat.id, x: seat.x, z: seat.z, lift: seat.lift, taken: seat.takenBy !== null})),
    };
  }

  stats() {
    const roles: Partial<Record<Role, number>> = {};
    let seated = 0;
    for (const agent of this.agents) {
      if (!agent.active) continue;
      roles[agent.role] = (roles[agent.role] ?? 0) + 1;
      if (agent.state === 'seated') seated++;
    }
    return {active: this.agents.filter(a => a.active).length, seated, seats: this.seats.length, roles};
  }

  dispose() {
    this.root.remove(...this.root.children);
    this.agents = [];
    this.ambient = [];
    this.seats = [];
  }
}
