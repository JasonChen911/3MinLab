import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {CATALOG, bounds, freshLayout, itemsCapacity, normalizeLayout, placement, roleCounts, type Item, type Layout, type PersonSave} from './game';
import {KEY, clearDraft, clearVersions, loadAll, loadDraft, loadVersions, pushVersion, saveDraft, saveOne, validateLayout} from './storage';
import {VENUES, makeVenueItems, venueDefinition, venueDimensions} from './venues';
import {blockedAt, collidersForItems, layoutColliders, moveWithCollision, pathBlockedCells, venueWallColliders} from './world/collision';
import {WEATHER_KINDS, nextWeatherChange, weatherAt, weatherComfort, weatherProfile} from './world/weather';
import {applyVenueModes, buildVenueRoom} from './world/venue3d';
import {PeopleSystem} from './world/people';
import {route} from './path';
import {SCALE_REFERENCE} from './world/scale';
import {venueZones} from './world/zones';

function venueLayout(id: string, variant: 'small' | 'medium' | 'large'): Layout {
  const definition = venueDefinition(id);
  const base = freshLayout(definition.scene);
  return normalizeLayout({
    ...base, venueId: id, venueVariant: variant, size: definition.variants[variant].size,
    items: makeVenueItems(id, variant), indoor: definition.type === 'indoor',
  });
}

describe('V4 场地模板与尺寸', () => {
  it('六类场地均有 S/M/L 真实尺寸与递增容量', () => {
    expect(VENUES).toHaveLength(6);
    for (const venue of VENUES) {
      const sizes = ['small', 'medium', 'large'] as const;
      const values = sizes.map(size => venue.variants[size]);
      for (let i = 0; i < values.length; i++) {
        expect(values[i].size).toBeGreaterThan(20);
        expect(values[i].capacity).toBeGreaterThan(0);
        if (i > 0) {
          expect(values[i].size).toBeGreaterThan(values[i - 1].size);
          expect(values[i].capacity).toBeGreaterThan(values[i - 1].capacity);
        }
      }
    }
    expect(venueDimensions('theater', 'medium')).toBe('48×48m');
  });

  it('每种场地的 S/M/L 基础设施都在场地边界内并有出入口', () => {
    for (const venue of VENUES) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const info = venue.variants[size];
        const half = info.size / 2;
        const items = makeVenueItems(venue.id, size);
        expect(items.length).toBeGreaterThan(5);
        expect(items.some(item => item.kind === 'entrance')).toBe(true);
        for (const item of items) {
          const b = bounds(item);
          expect(Math.abs(item.x) + b.w / 2).toBeLessThanOrEqual(half + .001);
          expect(Math.abs(item.z) + b.d / 2).toBeLessThanOrEqual(half + .001);
        }
      }
    }
  });

  it('室内场地的户外设施被拒绝，室内设备在户外暴雨中给出警告', () => {
    const indoor = freshLayout('conference');
    expect(indoor.indoor).toBe(true);
    expect(placement(indoor, {id: 'x', kind: 'tent', x: 0, z: 0, rotation: 0}).level).toBe('invalid');
    const outdoor = {...freshLayout('performance'), weather: 'heavyRain' as const, indoor: false};
    expect(placement(outdoor, {id: 'x', kind: 'screen', x: 10, z: 10, rotation: 0}).level).toBe('warning');
  });
});

describe('V4 统一碰撞', () => {
  it('舞台、树木与室内墙体都生成独立碰撞体', () => {
    const items: Item[] = [
      {id: 'stage', kind: 'stage', x: 0, z: 0, rotation: 0},
      {id: 'tree', kind: 'tree', x: 12, z: 0, rotation: 0},
    ];
    const colliders = collidersForItems(items);
    expect(colliders).toHaveLength(2);
    expect(colliders.find(collider => collider.id === 'c-tree')?.shape).toBe('circle');
    expect(blockedAt(colliders, 0, 0, .34)).toBe(true);
    expect(blockedAt(colliders, 12, 0, .34)).toBe(true);
    expect(blockedAt(colliders, 30, 30, .34)).toBe(false);
    const indoor = freshLayout('conference');
    expect(venueWallColliders(indoor).length).toBeGreaterThanOrEqual(4);
    expect(layoutColliders(indoor).length).toBeGreaterThan(collidersForItems(indoor.items).length);
  });

  it('人物移动撞到设施时阻挡并保留安全位置', () => {
    const items: Item[] = [{id: 'stage', kind: 'stage', x: 0, z: 0, rotation: 0}];
    const colliders = collidersForItems(items);
    const moved = moveWithCollision(colliders, 0, 4, 0, 0, .34);
    expect(moved.blocked).toBe(true);
    expect(moved.x).toBe(0);
    expect(moved.z).toBe(4);
    const free = moveWithCollision(colliders, 0, 20, 2, 18, .34);
    expect(free.blocked).toBe(false);
  });

  it('已经与碰撞体重叠的人物可以向外脱困，而不是永久卡死', () => {
    const items: Item[] = [{id: 'stage', kind: 'stage', x: 0, z: 0, rotation: 0}];
    const colliders = collidersForItems(items);
    const escape = moveWithCollision(colliders, 1.5, 0, 3.1, 0, .34);
    expect(escape.x).toBe(3.1);
    const deeper = moveWithCollision(colliders, 1.5, 0, 1, 0, .34);
    expect(deeper.x).toBe(1.5);
  });
});

describe('V4 室内可视化', () => {  it('室内场地生成地面、墙体、屋顶与照明，并支持墙体/屋顶模式与近侧自动隐藏', () => {
    const layout = freshLayout('conference');
    const room = buildVenueRoom(layout);
    expect(room).not.toBeNull();
    if (!room) return;
    expect(room.walls.length).toBeGreaterThanOrEqual(4);
    expect(room.roof.children.length).toBeGreaterThan(0);
    expect(room.lights.length).toBeGreaterThan(0);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 20, layout.size);
    applyVenueModes(room, 'auto', 'translucent', camera, layout.size);
    expect(room.walls.filter(wall => wall.side === 'front').every(wall => !wall.mesh.visible)).toBe(true);
    expect(room.walls.filter(wall => wall.side === 'back').every(wall => wall.mesh.visible)).toBe(true);
    applyVenueModes(room, 'full', 'full', camera, layout.size);
    expect(room.walls.every(wall => wall.mesh.visible)).toBe(true);
    expect(room.roof.visible).toBe(true);
    applyVenueModes(room, 'hidden', 'hidden', camera, layout.size);
    expect(room.walls.every(wall => !wall.mesh.visible)).toBe(true);
    expect(room.roof.visible).toBe(false);
  });
});

describe('V4.1 世界尺度与座席校准', () => {
  it('1 单位等于 1 米，人物、门、桌椅、层高与舞台参考值符合现实尺寸', () => {
    expect(SCALE_REFERENCE.grid).toBe(1);
    const person = SCALE_REFERENCE.person;
    expect(person.model).toBeGreaterThanOrEqual(person.min);
    expect(person.model).toBeLessThanOrEqual(person.max);
    expect(person.colliderRadius).toBeGreaterThan(.25);
    expect(person.colliderRadius).toBeLessThan(.45);
    expect(SCALE_REFERENCE.door.venueHeight).toBeLessThanOrEqual(SCALE_REFERENCE.door.maxHeight);
    expect(SCALE_REFERENCE.table.minHeight).toBeGreaterThanOrEqual(.7);
    expect(SCALE_REFERENCE.chair.maxHeight).toBeLessThanOrEqual(1);
    expect(SCALE_REFERENCE.floor.minHeight).toBeGreaterThanOrEqual(3);
    expect(SCALE_REFERENCE.floor.maxHeight).toBeLessThanOrEqual(4);
    expect(SCALE_REFERENCE.stage.minHeight).toBeGreaterThanOrEqual(.6);
    expect(SCALE_REFERENCE.stage.maxHeight).toBeLessThanOrEqual(1.5);
  });

  it('大场地看台随尺寸放大，座席与可视台阶对齐且不越界', () => {
    const layout = venueLayout('theater', 'large');
    const people = new PeopleSystem(new THREE.Scene());
    people.setLayout(layout);
    const seats = (people as unknown as {seats: {x: number; z: number; lift: number; itemId: string}[]}).seats;
    expect(seats.length).toBeGreaterThan(60);
    for (const seat of seats) {
      const item = layout.items.find(candidate => candidate.id === seat.itemId);
      expect(item).toBeDefined();
      if (!item) continue;
      const rotation = item.rotation * Math.PI / 180;
      const dx = seat.x - item.x, dz = seat.z - item.z;
      const lx = dx * Math.cos(-rotation) - dz * Math.sin(-rotation);
      const lz = dx * Math.sin(-rotation) + dz * Math.cos(-rotation);
      const b = bounds(item);
      expect(Math.abs(lx)).toBeLessThanOrEqual(b.w / 2 + .35);
      expect(Math.abs(lz)).toBeLessThanOrEqual(b.d / 2 + .35);
      expect(seat.lift).toBeGreaterThan(.3);
      expect(seat.lift).toBeLessThan(4.6);
    }
    const bleachers = layout.items.filter(item => item.kind === 'bleachers');
    expect(bleachers).toHaveLength(2);
    expect(bleachers.every(item => item.scale === 2)).toBe(true);
    people.dispose();
  });

  it('餐厅与会议厅的桌椅随场地放大，四向座位的座面高度正确', () => {
    for (const [id, variant] of [['restaurant', 'large'], ['conference', 'large']] as const) {
      const layout = venueLayout(id, variant);
      const people = new PeopleSystem(new THREE.Scene());
      people.setLayout(layout);
      const seats = (people as unknown as {seats: {lift: number; itemId: string}[]}).seats;
      const chairs = layout.items.filter(item => item.kind === 'chair');
      expect(chairs.length).toBeGreaterThanOrEqual(8);
      const chairSeats = seats.filter(seat => chairs.some(chair => chair.id === seat.itemId));
      expect(chairSeats.length).toBe(chairs.length * 4);
      for (const seat of chairSeats) expect(seat.lift).toBeGreaterThan(.4);
      for (const seat of chairSeats) expect(seat.lift).toBeLessThan(1.2);
      people.dispose();
    }
  });

  it('所有场地 S/M/L 模型均未因放大越过场地边界', () => {
    for (const venue of VENUES) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const info = venue.variants[size];
        const half = info.size / 2;
        for (const item of makeVenueItems(venue.id, size)) {
          const b = bounds(item);
          expect(Math.abs(item.x) + b.w / 2).toBeLessThanOrEqual(half + .001);
          expect(Math.abs(item.z) + b.d / 2).toBeLessThanOrEqual(half + .001);
          expect(item.scale ?? 1).toBeGreaterThanOrEqual(1);
          expect(item.scale ?? 1).toBeLessThanOrEqual(2.6);
        }
      }
    }
  });
});

describe('V4.1 建筑内部结构与功能分区', () => {
  it('剧院分区包含舞台、观众席、后台、控制室、入口与应急出口', () => {
    const zones = venueZones(venueLayout('theater', 'large'));
    const kinds = new Set(zones.map(zone => zone.kind));
    for (const kind of ['stage', 'seating', 'backstage', 'control', 'entrance', 'exit', 'circulation'] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    const circulation = zones.filter(zone => zone.kind === 'circulation');
    expect(circulation.length).toBeGreaterThan(0);
    for (const zone of circulation) {
      expect(zone.path?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(zone.width).toBeGreaterThanOrEqual(2);
      expect(zone.width).toBeLessThanOrEqual(3.2);
    }
    expect(zones.filter(zone => zone.kind === 'exit').length).toBeGreaterThanOrEqual(2);
  });

  it('餐厅包含用餐区、后厨、服务台与顾客动线，体育场包含比赛场地和器材区', () => {
    const restaurant = venueZones(venueLayout('restaurant', 'medium'));
    const restaurantKinds = new Set(restaurant.map(zone => zone.kind));
    for (const kind of ['activity', 'kitchen', 'service', 'entrance', 'circulation'] as const) expect(restaurantKinds.has(kind)).toBe(true);
    const stadium = venueZones(venueLayout('stadium', 'large'));
    const stadiumKinds = new Set(stadium.map(zone => zone.kind));
    for (const kind of ['field', 'seating', 'medical', 'equipment', 'entrance', 'circulation'] as const) expect(stadiumKinds.has(kind)).toBe(true);
  });

  it('分区跟随设施实际位置，移动舞台后舞台区同步更新', () => {
    const layout = venueLayout('theater', 'medium');
    const stage = layout.items.find(item => item.kind === 'stage');
    expect(stage).toBeDefined();
    if (!stage) return;
    const before = venueZones(layout).find(zone => zone.id === 'stage');
    const moved = {...layout, items: layout.items.map(item => item.id === stage.id ? {...item, x: item.x + 4} : item)};
    const after = venueZones(moved).find(zone => zone.id === 'stage');
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after!.x).toBeCloseTo((before?.x ?? 0) + 4, 3);
  });
});

describe('V4 旧存档兼容', () => {
  it('缺少 V4 字段的旧布局会补齐场地、天气与资金默认值', () => {
    const legacy = freshLayout('performance') as Layout;
    const raw = {...legacy, venueId: undefined, venueVariant: undefined, indoor: undefined, weather: undefined, weatherAuto: undefined, wallMode: undefined, roofMode: undefined, viewMode: undefined, budgetMode: undefined, roles: undefined};
    const next = normalizeLayout(raw as Layout);
    expect(next.venueId).toBe('festival');
    expect(next.indoor).toBe(false);
    expect(next.weather).toBe('sunny');
    expect(next.weatherAuto).toBe(false);
    expect(next.wallMode).toBe('auto');
    expect(next.roofMode).toBe('translucent');
    expect(next.viewMode).toBe('normal');
    expect(next.budgetMode).toBe('unlimited');
    expect(next.items.every(item => item.anchored === false && item.damaged === false)).toBe(true);
  });
});

describe('V4 天气与预算', () => {
  it('天气按种子确定性变化并预留预警时间', () => {
    const seed = 424242;
    const kind = weatherAt(seed, 40);
    expect(WEATHER_KINDS).toContain(kind);
    expect(weatherAt(seed, 40)).toBe(kind);
    expect(nextWeatherChange(40)).toBe(65);
    expect(nextWeatherChange(65)).toBe(100);
    expect(weatherAt(seed, 29)).toBe('sunny');
    expect(weatherProfile('gale').tentRisk).toBeGreaterThan(weatherProfile('sunny').tentRisk);
    expect(weatherComfort('heavyRain', true, false)).toBeGreaterThan(weatherComfort('heavyRain', false, false));
  });

  it('帐篷在恶劣天气下容量下降，锚固或室内可以恢复', () => {
    const tent: Item = {id: 't', kind: 'tent', x: 0, z: 0, rotation: 0};
    const sunny = itemsCapacity([tent], 'sunny', false);
    const gale = itemsCapacity([tent], 'gale', false);
    expect(gale).toBeLessThan(sunny);
    expect(itemsCapacity([{...tent, anchored: true}], 'gale', false)).toBe(sunny);
    expect(itemsCapacity([{...tent, damaged: true}], 'sunny', false)).toBeLessThan(sunny);
    expect(itemsCapacity([tent], 'gale', true)).toBe(sunny);
  });

  it('预算挑战模式阻止超支，无限模式只提示', () => {
    const layout = freshLayout('performance');
    layout.activity.budget = 0;
    const candidate: Item = {id: 'n', kind: 'tentSmall', x: 0, z: 10, rotation: 0};
    expect(placement(layout, candidate, 'challenge').level).toBe('invalid');
    expect(placement(layout, candidate, 'unlimited').level).toBe('warning');
  });
});

describe('V4 角色组合', () => {
  it('音乐节分配观众与演员，讲座分配观众与主持，运动会分配裁判', () => {
    const concert = roleCounts(freshLayout('performance'));
    expect(concert.audience).toBeGreaterThan(0);
    expect(concert.performer).toBeGreaterThan(0);
    expect(concert.participant).toBe(0);
    const lecture = roleCounts(freshLayout('conference'));
    expect(lecture.audience).toBeGreaterThan(0);
    expect(lecture.host).toBe(1);
    const sports = roleCounts(freshLayout('athletics'));
    expect(sports.participant).toBeGreaterThan(0);
    expect(sports.referee).toBeGreaterThan(0);
    const venue = venueDefinition('festival');
    expect(venue.type).toBe('outdoor');
  });
});

type TestAgent = {
  id: string; active: boolean; state: string; seatId: string | null; seatLift: number;
  path: {x: number; z: number}[]; cursor: number; goal: {x: number; z: number}; unreachable: boolean; retry: number;
  rig: {group: THREE.Group};
};
type TestSeat = {id: string; x: number; z: number; lift: number; takenBy: string | null};
type PeopleInternals = {
  activate: (role: string, state: string, start: {x: number; z: number}, label: string) => TestAgent | null;
  updateAgent: (agent: TestAgent, dt: number, positions: THREE.Vector3[]) => void;
  routeAgent: (agent: TestAgent, goal: {x: number; z: number}, label: string) => boolean;
  snapshot: () => PersonSave[];
  restore: (saves: PersonSave[]) => boolean;
  hasActive: () => boolean;
  agents: TestAgent[];
  seats: TestSeat[];
};

function theaterPeople() {
  const people = new PeopleSystem(new THREE.Scene());
  people.setLayout(venueLayout('theater', 'large'));
  return {people, inner: people as unknown as PeopleInternals};
}

describe('V4.1 人物状态与寻路恢复', () => {
  it('座位唯一占用，人物与座位互相指向', () => {
    const {people, inner} = theaterPeople();
    for (let i = 0; i < 12; i++) inner.activate('audience', 'toSeat', {x: 0, z: 0}, `测试座位 ${i}`);
    const active = inner.agents.filter(agent => agent.active);
    expect(active).toHaveLength(12);
    const seatIds = active.map(agent => agent.seatId);
    expect(seatIds.every(Boolean)).toBe(true);
    expect(new Set(seatIds).size).toBe(seatIds.length);
    for (const seat of inner.seats.filter(candidate => candidate.takenBy)) {
      const owner = inner.agents.find(agent => agent.id === seat.takenBy);
      expect(owner?.seatId).toBe(seat.id);
    }
    people.dispose();
  });

  it('场地变更后失效座位被释放，人物重新安排目标', () => {
    const layout = venueLayout('theater', 'large');
    const people = new PeopleSystem(new THREE.Scene());
    people.setLayout(layout);
    const inner = people as unknown as PeopleInternals;
    const agent = inner.activate('audience', 'toSeat', {x: 0, z: 0}, '测试入座');
    expect(agent).not.toBeNull();
    if (!agent) return;
    const seat = inner.seats.find(candidate => candidate.id === agent.seatId);
    expect(seat).toBeDefined();
    if (!seat) return;
    agent.rig.group.position.set(seat.x, seat.lift, seat.z);
    agent.state = 'seated';
    people.setLayout({...layout, items: layout.items.filter(item => item.kind !== 'bleachers' && item.kind !== 'chair')});
    expect(agent.seatId).toBeNull();
    expect(['toRest', 'watching']).toContain(agent.state);
    expect(inner.seats.every(candidate => candidate.takenBy === null)).toBe(true);
    people.dispose();
  });

  it('到达签到队列后从入场状态切换为排队', () => {
    const {people, inner} = theaterPeople();
    const agent = inner.activate('audience', 'arriving', {x: 0, z: 0}, '前往签到');
    expect(agent).not.toBeNull();
    if (!agent) return;
    agent.goal = {x: agent.rig.group.position.x, z: agent.rig.group.position.z};
    agent.path = [];
    inner.updateAgent(agent, .016, []);
    expect(agent.state).toBe('queueing');
    expect(people.info(agent.id)?.task).toContain('签到');
    people.dispose();
  });

  it('目标落在设施内部时自动改选附近可行走点', () => {
    const {people, inner} = theaterPeople();
    const agent = inner.activate('audience', 'toSeat', {x: 0, z: 16}, '障碍测试');
    expect(agent).not.toBeNull();
    if (!agent) return;
    const stage = makeVenueItems('theater', 'large').find(item => item.kind === 'stage');
    expect(stage).toBeDefined();
    if (!stage) return;
    const routed = inner.routeAgent(agent, {x: stage.x, z: stage.z}, '舞台内部目标');
    expect(routed).toBe(true);
    expect(agent.path.length).toBeGreaterThan(0);
    expect(Math.hypot(agent.goal.x - stage.x, agent.goal.z - stage.z)).toBeGreaterThan(.5);
    people.dispose();
  });

  it('越界目标不生成穿墙直线路径，标记不可达并安排重试', () => {
    const {people, inner} = theaterPeople();
    const agent = inner.activate('audience', 'toSeat', {x: 0, z: 0}, '测试寻路');
    expect(agent).not.toBeNull();
    if (!agent) return;
    const routed = inner.routeAgent(agent, {x: 999, z: 999}, '越界目标');
    expect(routed).toBe(false);
    expect(agent.path).toHaveLength(0);
    expect(agent.unreachable).toBe(true);
    expect(agent.retry).toBeGreaterThan(0);
    expect(people.info(agent.id)?.routeStatus).toBe('unreachable');
    people.dispose();
  });

  it('到达座位时复核所有权，冲突时改往其他座位', () => {
    const {people, inner} = theaterPeople();
    const first = inner.activate('audience', 'toSeat', {x: 0, z: 0}, '测试甲');
    const second = inner.activate('audience', 'toSeat', {x: 0, z: 0}, '测试乙');
    expect(first && second).toBeTruthy();
    if (!first || !second) return;
    const seat = inner.seats.find(candidate => candidate.id === first.seatId);
    expect(seat).toBeDefined();
    if (!seat) return;
    second.seatId = seat.id;
    second.state = 'toSeat';
    second.goal = {x: seat.x, z: seat.z};
    second.rig.group.position.set(seat.x, 0, seat.z);
    second.path = [];
    inner.updateAgent(second, .016, []);
    expect(second.seatId).not.toBe(seat.id);
    expect(second.state).not.toBe('seated');
    expect(inner.seats.filter(candidate => candidate.takenBy === second.id)).toHaveLength(1);
    people.dispose();
  });
});


type PhysicsInternals = PeopleInternals & {
  itemsFor: (agent: TestAgent) => Item[];
  colliders: {ownerId: string; halfW: number; halfD: number; kind: string; movable: boolean; mass: number}[];
  tentMargin: number;
};

describe('V4.1 物理反馈与通行安全', () => {
  it('室内入口碰撞开口与可见门洞对齐，门口可通行、墙体阻挡', () => {
    const layout = venueLayout('theater', 'large');
    const face = layout.size / 2;
    const wallHalf = face - .35;
    const opening = Math.max(2.6, CATALOG.entrance.w + .6);
    const walls = venueWallColliders(layout);
    const doorX = 0;
    expect(blockedAt(walls, doorX, wallHalf, .34)).toBe(false);
    expect(blockedAt(walls, doorX + opening / 2 + .5, wallHalf, .34)).toBe(true);
    expect(blockedAt(walls, doorX - opening / 2 - .5, wallHalf, .34)).toBe(true);
    const left = walls.find(wall => wall.id === 'wall-front-left');
    const right = walls.find(wall => wall.id === 'wall-front-right');
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (left && right) {
      expect(left.x + left.halfW).toBeCloseTo(doorX - (opening / 2 - .09), 4);
      expect(right.x - right.halfW).toBeCloseTo(doorX + (opening / 2 - .09), 4);
    }
  });

  it('入口靠近角落时碰撞开口跟随可见门洞一起内收', () => {
    const layout = venueLayout('theater', 'large');
    const face = layout.size / 2;
    const opening = Math.max(2.6, CATALOG.entrance.w + .6);
    const shifted: Layout = {...layout, items: layout.items.map(item => item.kind === 'entrance' ? {...item, x: face - 1} : item)};
    const walls = venueWallColliders(shifted);
    const doorX = face - opening;
    expect(blockedAt(walls, doorX, face - .35, .34)).toBe(false);
    expect(walls.some(wall => wall.id === 'wall-front-right')).toBe(true);
  });

  it('道路被围栏阻断时寻路绕行且不穿过阻挡格', () => {
    const items: Item[] = [
      {id: 'road-a', kind: 'road', x: 0, z: 0, rotation: 0, height: 1, scale: 1},
      {id: 'road-b', kind: 'road', x: 3, z: 0, rotation: 0, height: 1, scale: 1},
      {id: 'fence-a', kind: 'fence', x: 0, z: 0, rotation: 0, height: 1, scale: 1},
    ];
    const blocked = pathBlockedCells(items, 10);
    expect(blocked.size).toBeGreaterThan(0);
    const path = route(items, 20, {x: -6, z: 0}, {x: 6, z: 0});
    expect(path.length).toBeGreaterThan(2);
    expect(path[path.length - 1]).toEqual({x: 6, z: 0});
    for (const point of path) expect(blocked.has(`${point.x},${point.z}`)).toBe(false);
    expect(path.some(point => Math.abs(point.z) >= 1)).toBe(true);
  });

  it('大风时未固定帐篷留出安全距离，固定或转晴后恢复', () => {
    const layout = venueLayout('festival', 'large');
    const gale: Layout = {...layout, weather: 'gale'};
    const people = new PeopleSystem(new THREE.Scene());
    people.setLayout(gale);
    const inner = people as unknown as PhysicsInternals;
    expect(inner.tentMargin).toBe(.8);
    const tent = gale.items.find(item => item.kind === 'tent');
    expect(tent).toBeDefined();
    if (!tent) return;
    const raw = collidersForItems(gale.items).find(collider => collider.ownerId === tent.id);
    const inflated = inner.colliders.find(collider => collider.ownerId === tent.id);
    expect(raw && inflated).toBeTruthy();
    if (raw && inflated) {
      expect(inflated.halfW).toBeCloseTo(raw.halfW + .8, 4);
      expect(inflated.halfD).toBeCloseTo(raw.halfD + .8, 4);
    }
    const routeTent = inner.itemsFor({state: 'idle'} as unknown as TestAgent).find(item => item.id === tent.id);
    expect(routeTent).toBeDefined();
    if (routeTent) expect(bounds(routeTent).w).toBeCloseTo(bounds(tent).w + 1.6, 1);
    people.setLayout({...gale, items: gale.items.map(item => item.id === tent.id ? {...item, anchored: true} : item)});
    const anchored = inner.colliders.find(collider => collider.ownerId === tent.id);
    expect(anchored?.halfW).toBeCloseTo(raw?.halfW ?? 0, 4);
    people.setLayout({...gale, weather: 'sunny'});
    expect(inner.tentMargin).toBe(0);
    people.dispose();
  });

  it('工作人员推动中型轻物，观众只推动更轻的设施，推力有上限', () => {
    const pushFrom = (venueId: string, variant: 'small' | 'medium' | 'large', role: string, kind: Item['kind'], state: string) => {
      const layout = venueLayout(venueId, variant);
      const item = layout.items.find(candidate => candidate.kind === kind);
      expect(item).toBeDefined();
      if (!item) return {item: null, pushes: [] as {id: string; dx: number; dz: number}[]};
      const people = new PeopleSystem(new THREE.Scene());
      people.setLayout(layout);
      const inner = people as unknown as PeopleInternals & {takePushes: () => {id: string; dx: number; dz: number}[]};
      const agent = inner.activate(role, state, {x: item.x, z: item.z + 2}, '推力测试');
      expect(agent).not.toBeNull();
      if (!agent) return {item, pushes: [] as {id: string; dx: number; dz: number}[]};
      agent.path = [{x: item.x, z: item.z}];
      agent.cursor = 0;
      agent.goal = {x: item.x, z: item.z};
      let pushes: {id: string; dx: number; dz: number}[] = [];
      for (let i = 0; i < 60; i++) {
        inner.updateAgent(agent, .033, []);
        const next = inner.takePushes();
        if (next.length) { pushes = next; break; }
      }
      people.dispose();
      return {item, pushes};
    };
    const staffChair = pushFrom('restaurant', 'medium', 'staff', 'chair', 'patrolling');
    expect(staffChair.pushes).toHaveLength(1);
    expect(staffChair.pushes[0].id).toBe(staffChair.item?.id);
    expect(Math.hypot(staffChair.pushes[0].dx, staffChair.pushes[0].dz)).toBeGreaterThan(.01);
    expect(Math.hypot(staffChair.pushes[0].dx, staffChair.pushes[0].dz)).toBeLessThanOrEqual(.041);
    const audienceChair = pushFrom('restaurant', 'medium', 'audience', 'chair', 'watching');
    expect(audienceChair.pushes).toHaveLength(0);
    const audienceSpeaker = pushFrom('theater', 'large', 'audience', 'speaker', 'watching');
    expect(audienceSpeaker.pushes).toHaveLength(1);
    expect(Math.hypot(audienceSpeaker.pushes[0].dx, audienceSpeaker.pushes[0].dz)).toBeLessThanOrEqual(.041);
  });

  it('设施移动后在场人物立即重新寻路并避开新障碍', () => {
    const layout = venueLayout('festival', 'large');
    const people = new PeopleSystem(new THREE.Scene());
    people.setLayout(layout);
    const inner = people as unknown as PeopleInternals;
    const agent = inner.activate('audience', 'watching', {x: 0, z: 10}, '移动设施测试');
    expect(agent).not.toBeNull();
    if (!agent) return;
    expect(inner.routeAgent(agent, {x: 0, z: -10}, '穿越场地')).toBe(true);
    expect(agent.path.length).toBeGreaterThan(3);
    const middle = agent.path[Math.floor(agent.path.length / 2)];
    const obstacle: Item = {id: 'test-obstacle', kind: 'stageLarge', x: middle.x, z: middle.z, rotation: 0, height: 1, scale: 1};
    const moved: Layout = {...layout, items: [...layout.items, obstacle]};
    people.setLayout(moved);
    expect(agent.path.length).toBeGreaterThan(0);
    const blocked = pathBlockedCells(moved.items, Math.floor(moved.size / 2));
    for (const point of agent.path) expect(blocked.has(`${point.x},${point.z}`)).toBe(false);
    people.dispose();
  });
});

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear() { data.clear(); },
    getItem(key: string) { return data.get(key) ?? null; },
    key(index: number) { return [...data.keys()][index] ?? null; },
    removeItem(key: string) { data.delete(key); },
    setItem(key: string, value: string) { data.set(key, String(value)); },
  } as Storage;
}

describe('V4.1 存档恢复与速度冻结', () => {
  it('人物位置、状态、目标、路径与座位可以完整快照并恢复', () => {
    const layout = venueLayout('theater', 'large');
    const people = new PeopleSystem(new THREE.Scene());
    people.setLayout(layout);
    const inner = people as unknown as PeopleInternals;
    for (let i = 0; i < 10; i++) inner.activate('audience', 'toSeat', {x: 0, z: 0}, `恢复测试 ${i}`);
    const staff = inner.activate('staff', 'patrolling', {x: 4, z: 12}, '岗位恢复');
    expect(staff).not.toBeNull();
    const snapshot = inner.snapshot();
    expect(snapshot).toHaveLength(11);
    expect(snapshot.every(person => Number.isFinite(person.x) && Number.isFinite(person.z))).toBe(true);
    expect(snapshot.filter(person => person.seatId).length).toBeGreaterThan(8);
    people.dispose();

    const restoredSystem = new PeopleSystem(new THREE.Scene());
    restoredSystem.setLayout(layout);
    const restored = restoredSystem as unknown as PeopleInternals;
    expect(restored.hasActive()).toBe(false);
    expect(restored.restore(snapshot)).toBe(true);
    expect(restored.hasActive()).toBe(true);
    const active = restored.agents.filter(agent => agent.active);
    expect(active).toHaveLength(snapshot.length);
    const seatIds = active.map(agent => agent.seatId).filter((id): id is string => !!id);
    expect(new Set(seatIds).size).toBe(seatIds.length);
    const second = restored.snapshot();
    expect(second.map(person => person.id).sort()).toEqual(snapshot.map(person => person.id).sort());
    for (const saved of snapshot) {
      const now = second.find(person => person.id === saved.id);
      expect(now).toBeDefined();
      expect(now!.state).toBe(saved.state);
      expect(now!.seatId).toBe(saved.seatId);
      expect(now!.x).toBeCloseTo(saved.x, 5);
      expect(now!.z).toBeCloseTo(saved.z, 5);
    }
    expect(restored.restore(snapshot)).toBe(false);
    restoredSystem.dispose();
  });

  it('载入不同存档时会替换当前现场人物，同一快照不会重复重置', () => {
    const {people, inner} = theaterPeople();
    for (let i = 0; i < 6; i++) inner.activate('audience', 'toSeat', {x: 0, z: 0}, `旧现场 ${i}`);
    const previous = inner.snapshot();
    expect(previous).toHaveLength(6);
    const incoming = previous.map((person, index) => ({
      ...person, id: `incoming-${index}`, x: person.x + 2, z: person.z + 1, state: 'watching' as const, seatId: null,
    }));
    expect(inner.restore(incoming)).toBe(true);
    const active = inner.agents.filter(agent => agent.active);
    expect(active).toHaveLength(6);
    expect(active.every(agent => agent.id.startsWith('incoming-'))).toBe(true);
    expect(inner.restore(incoming)).toBe(false);
    expect(inner.agents.filter(agent => agent.active)).toHaveLength(6);
    people.dispose();
  });

  it('损坏或越界的存档在保存与载入前被拒绝，旧格式仍可补齐', () => {
    expect(() => validateLayout(null)).toThrow();
    expect(() => validateLayout({})).toThrow();
    expect(() => validateLayout({...freshLayout('custom'), items: [{id: 'bad', kind: 'tree', x: Number.NaN, z: 0}]})).toThrow();
    const legacy = {...freshLayout('performance'), venueId: undefined, weather: undefined, viewMode: undefined, people: undefined};
    const normalized = validateLayout(legacy);
    expect(normalized.venueId).toBe('festival');
    expect(normalized.weather).toBe('sunny');
    expect(normalized.viewMode).toBe('normal');
  });

  it('保存、草稿与历史版本可写入本地存储并恢复，损坏记录会被跳过', () => {
    Object.defineProperty(globalThis, 'localStorage', {value: memoryStorage(), configurable: true});
    const layout = freshLayout('performance');
    layout.people = [{
      id: 'person-900', role: 'audience', state: 'queueing', x: 2, z: 3, rotation: 1,
      seatId: null, goal: {x: 2, z: 5}, goalLabel: '签到排队', path: [{x: 2, z: 5}], timer: 1.5,
    }];
    layout.run = {minute: 12, status: 'running'} as Layout['run'];
    const saved = saveOne(layout);
    expect(saved.savedAt).toBeGreaterThan(0);
    const all = loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].activity.id).toBe(layout.activity.id);
    expect(all[0].people?.[0]?.id).toBe('person-900');
    expect(all[0].run?.minute).toBe(12);

    expect(saveDraft(all[0], {autosave: true, snap: true})).toBe(true);
    const draft = loadDraft();
    expect(draft?.layout.activity.id).toBe(layout.activity.id);
    expect(draft?.settings?.autosave).toBe(true);
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(saveDraft({...layout, run: undefined})).toBe(false);

    const versions = pushVersion(all[0], '单元测试', {debug: false});
    expect(versions[0].label).toBe('单元测试');
    expect(versions[0].layout.people?.[0]?.state).toBe('queueing');
    expect(loadVersions()[0].settings?.debug).toBe(false);
    expect(pushVersion(all[0], '单元测试', {debug: false})).toHaveLength(1);
    clearVersions();
    expect(loadVersions()).toHaveLength(0);

    localStorage.setItem(KEY, JSON.stringify([{broken: true}, all[0]]));
    expect(loadAll()).toHaveLength(1);
  });
});
