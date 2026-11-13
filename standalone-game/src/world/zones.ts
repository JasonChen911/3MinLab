import {bounds, type Item, type Kind, type Layout} from '../game';
import {venueDefinition} from '../venues';

export type ZoneKind =
  | 'entrance' | 'exit' | 'circulation' | 'activity' | 'stage' | 'seating' | 'backstage'
  | 'staff' | 'service' | 'kitchen' | 'control' | 'field' | 'medical' | 'equipment' | 'vendor';

export interface ZoneNode {x: number; z: number}

export interface VenueZone {
  id: string;
  name: string;
  kind: ZoneKind;
  color: number;
  x: number;
  z: number;
  w: number;
  d: number;
  rotation: number;
  path?: ZoneNode[];
  width?: number;
}

const ZONE_COLORS: Record<ZoneKind, number> = {
  entrance: 0x4bdd8b,
  exit: 0x39e0a8,
  circulation: 0x4fc3ff,
  activity: 0xb07dff,
  stage: 0xc07dff,
  seating: 0x5b8def,
  backstage: 0xf0a23c,
  staff: 0xffd166,
  service: 0xff9d5c,
  kitchen: 0xff7a9c,
  control: 0xf5c542,
  field: 0x58d68d,
  medical: 0xff6b6b,
  equipment: 0xb0895c,
  vendor: 0xffa94d,
};

export const STAGE_KINDS: Kind[] = ['stage', 'stageSmall', 'stageLarge', 'podium'];
const SEAT_KINDS: Kind[] = ['bleachers', 'chair'];
const TABLE_KINDS: Kind[] = ['chair'];

function zone(kind: ZoneKind, id: string, name: string, x: number, z: number, w: number, d: number, rotation = 0): VenueZone {
  return {id, name, kind, color: ZONE_COLORS[kind], x, z, w: Math.max(1.6, w), d: Math.max(1.6, d), rotation};
}

function around(item: Item, kind: ZoneKind, id: string, name: string, pad = 1): VenueZone {
  const b = bounds(item);
  return zone(kind, id, name, item.x, item.z, b.w + pad * 2, b.d + pad * 2, item.rotation);
}

function byKinds(layout: Layout, kinds: Kind[]): Item[] {
  return layout.items.filter(item => kinds.includes(item.kind));
}

function areaOf(items: Item[], pad: number): {x: number; z: number; w: number; d: number} | null {
  if (!items.length) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const item of items) {
    const b = bounds(item);
    minX = Math.min(minX, item.x - b.w / 2);
    maxX = Math.max(maxX, item.x + b.w / 2);
    minZ = Math.min(minZ, item.z - b.d / 2);
    maxZ = Math.max(maxZ, item.z + b.d / 2);
  }
  return {
    x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
    w: maxX - minX + pad * 2, d: maxZ - minZ + pad * 2,
  };
}

function circulation(id: string, name: string, path: ZoneNode[], width: number): VenueZone {
  return {id, name, kind: 'circulation', color: ZONE_COLORS.circulation, x: 0, z: 0, w: 0, d: 0, rotation: 0, path, width};
}

function theaterZones(layout: Layout): VenueZone[] {
  const half = layout.size / 2;
  const zones: VenueZone[] = [];
  const stage = byKinds(layout, STAGE_KINDS)[0];
  const entrance = byKinds(layout, ['entrance'])[0];
  const seats = byKinds(layout, SEAT_KINDS);
  const seatArea = areaOf(seats, .8);
  if (stage) zones.push(around(stage, 'stage', 'stage', '舞台区', 1.2));
  if (seatArea) zones.push(zone('seating', 'seating', '观众席', seatArea.x, seatArea.z, seatArea.w, seatArea.d));
  const backZ = stage ? stage.z - bounds(stage).d / 2 - 3.4 : -half * .72;
  zones.push(zone('backstage', 'backstage', '后台 / 候场', stage?.x ?? 0, backZ, Math.min(14, layout.size * .3), 5));
  zones.push(zone('control', 'control', '控制室', half - 3.4, -half + 3.2, 5.2, 4.4));
  zones.push(zone('staff', 'performer-entrance', '演员入口', -half + 2.2, backZ, 2.8, 4.6));
  if (entrance) zones.push(zone('entrance', 'audience-entrance', '观众入口', entrance.x, entrance.z, 5, 3.4));
  zones.push(zone('exit', 'exit-left', '应急出口', -half + 1.2, 0, 1.8, 3.4));
  zones.push(zone('exit', 'exit-right', '应急出口', half - 1.2, 0, 1.8, 3.4));
  const aisle = seatArea ? Math.min(half - 2.4, seatArea.w / 2 + 1.6) : 3.2;
  const front = entrance ? entrance.z - 2.4 : half - 4.5;
  const nearStage = stage ? stage.z + bounds(stage).d / 2 + 2.2 : -half * .2;
  const seatZ = seatArea?.z ?? 0;
  for (const side of [-1, 1]) {
    zones.push(circulation(`theater-aisle-${side < 0 ? 'l' : 'r'}`, '观众主动线', [
      {x: entrance?.x ?? 0, z: front},
      {x: 0, z: Math.min(front - 2.2, seatZ + (seatArea?.d ?? 0) / 2 + 2)},
      {x: side * aisle, z: seatZ},
      {x: side * aisle, z: nearStage},
      {x: 0, z: nearStage},
    ], 2.4));
  }
  return zones;
}

function restaurantZones(layout: Layout): VenueZone[] {
  const half = layout.size / 2;
  const zones: VenueZone[] = [];
  const entrance = byKinds(layout, ['entrance'])[0];
  const service = byKinds(layout, ['service'])[0];
  const tables = byKinds(layout, TABLE_KINDS);
  const dining = areaOf(tables, 1.4);
  if (dining) zones.push(zone('activity', 'dining', '用餐区', dining.x, dining.z, dining.w, dining.d));
  zones.push(zone('kitchen', 'kitchen', '后厨', 0, -half + 2.1, Math.min(16, layout.size * .42), 3.4));
  if (service) zones.push(around(service, 'service', 'service-desk', '服务台', .8));
  zones.push(zone('exit', 'exit-left', '员工 / 应急出口', -half + 1.4, -half + 3.4, 2.4, 3));
  zones.push(zone('exit', 'exit-right', '应急出口', half - 1.4, 0, 2.4, 3));
  if (entrance) zones.push(zone('entrance', 'customer-entrance', '顾客入口', entrance.x, entrance.z, 5, 3.4));
  const front = entrance ? entrance.z - 2.2 : half - 3.4;
  const deskZ = service ? service.z + bounds(service).d / 2 + 1.4 : -half + 6;
  zones.push(circulation('restaurant-main', '顾客动线', [
    {x: entrance?.x ?? 0, z: front},
    {x: 0, z: Math.max(dining ? dining.z : 0, front - 3)},
    {x: 0, z: deskZ},
  ], 2.2));
  zones.push(zone('staff', 'service-passage', '传菜通道', -half + 2.6, -half + 5.4, 2.4, Math.min(10, layout.size * .22)));
  return zones;
}

function conferenceZones(layout: Layout): VenueZone[] {
  const half = layout.size / 2;
  const zones: VenueZone[] = [];
  const stage = byKinds(layout, ['podium'])[0];
  const entrance = byKinds(layout, ['entrance'])[0];
  const seats = byKinds(layout, ['chair']);
  const seatArea = areaOf(seats, 1);
  if (stage) zones.push(around(stage, 'stage', 'stage', '讲台区', 1.4));
  if (seatArea) zones.push(zone('seating', 'seating', '会议席', seatArea.x, seatArea.z, seatArea.w, seatArea.d));
  zones.push(zone('control', 'control', '控制室', half - 3.2, -half + 3, 4.8, 4));
  zones.push(zone('staff', 'staff-passage', '工作人员通道', -half + 2.2, -half * .1, 2.6, Math.min(18, layout.size * .42)));
  zones.push(zone('exit', 'exit-left', '应急出口', -half + 1.2, half * .18, 1.8, 3));
  zones.push(zone('exit', 'exit-right', '应急出口', half - 1.2, half * .18, 1.8, 3));
  if (entrance) zones.push(zone('entrance', 'audience-entrance', '听众入口', entrance.x, entrance.z, 5, 3.4));
  const front = entrance ? entrance.z - 2.4 : half - 4;
  const stageZ = stage ? stage.z + 1.5 : -half * .3;
  zones.push(circulation('conference-main', '主通道', [
    {x: entrance?.x ?? 0, z: front},
    {x: 0, z: seatArea ? seatArea.z + seatArea.d / 2 + 1.4 : 0},
    {x: 0, z: stageZ},
  ], 2.6));
  return zones;
}

function stadiumZones(layout: Layout): VenueZone[] {
  const half = layout.size / 2;
  const zones: VenueZone[] = [];
  const fieldW = layout.size * .38, fieldD = layout.size * .54;
  zones.push(zone('field', 'field', '比赛场地', 0, 0, fieldW, fieldD));
  zones.push(zone('activity', 'referee', '裁判区', fieldW * .18, 0, 4, 4));
  for (const [index, seat] of byKinds(layout, ['bleachers']).entries()) {
    zones.push(around(seat, 'seating', `seating-${index}`, `看台 ${String.fromCharCode(65 + index)}`, 1));
  }
  const entrances = byKinds(layout, ['entrance']);
  const medical = byKinds(layout, ['medical'])[0];
  const equipment = byKinds(layout, ['storage'])[0];
  if (medical) zones.push(around(medical, 'medical', 'medical', '医疗点', .8));
  if (equipment) zones.push(around(equipment, 'equipment', 'equipment', '器材区', .8));
  for (const [index, entrance] of entrances.entries()) zones.push(zone('entrance', `entrance-${index}`, index ? '运动员入口' : '观众入口', entrance.x, entrance.z, 5, 3.4));
  zones.push(zone('exit', 'exit-left', '疏散通道', -half + 1.2, -half * .35, 1.8, 5));
  zones.push(zone('exit', 'exit-right', '疏散通道', half - 1.2, -half * .35, 1.8, 5));
  const first = entrances[0];
  zones.push(circulation('stadium-main', '检录主动线', [
    {x: first?.x ?? 0, z: first ? first.z - 2 : half - 3},
    {x: first?.x ?? 0, z: Math.max(-half * .15, fieldD / 2 + 3)},
    {x: -fieldW * .28, z: fieldD / 2 + .8},
  ], 3.2));
  zones.push(circulation('athlete-passage', '运动员通道', [
    {x: entrances[1]?.x ?? half * .4, z: entrances[1] ? entrances[1].z - 2 : half - 4},
    {x: fieldW * .42, z: fieldD * .28},
    {x: fieldW * .3, z: 0},
  ], 2.6));
  return zones;
}

function outdoorEventZones(layout: Layout): VenueZone[] {
  const half = layout.size / 2;
  const zones: VenueZone[] = [];
  const stage = byKinds(layout, STAGE_KINDS)[0];
  const entrance = byKinds(layout, ['entrance'])[0];
  const seats = byKinds(layout, SEAT_KINDS);
  const audience = areaOf(seats, 2);
  if (stage) zones.push(around(stage, 'stage', 'stage', '主舞台', 1.6));
  if (audience) zones.push(zone('seating', 'audience', '观众区', audience.x, audience.z, audience.w, audience.d));
  for (const [index, tent] of byKinds(layout, ['tent', 'tentSmall']).entries()) zones.push(around(tent, 'vendor', `vendor-${index}`, `摊位 ${index + 1}`, .6));
  const checkin = byKinds(layout, ['checkin'])[0];
  if (checkin) zones.push(around(checkin, 'service', 'checkin', '签到区', 1));
  if (entrance) zones.push(zone('entrance', 'main-entrance', '主入口', entrance.x, entrance.z, 5.4, 3.4));
  zones.push(zone('exit', 'exit-left', '应急出口', -half + 1.4, half * .3, 2.2, 4));
  zones.push(zone('exit', 'exit-right', '应急出口', half - 1.4, half * .3, 2.2, 4));
  const front = entrance ? entrance.z - 2.4 : half - 3.4;
  const stageZ = stage ? stage.z + bounds(stage).d / 2 + 2.2 : -half * .2;
  zones.push(circulation('event-main', '主动线', [
    {x: entrance?.x ?? 0, z: front},
    {x: 0, z: Math.max(stageZ, audience ? audience.z + audience.d / 2 + 1.6 : 0)},
    {x: 0, z: stageZ},
  ], 2.8));
  return zones;
}

/** Zones are derived from the real item placement, so moving a stage or desk updates its zone. */
export function venueZones(layout: Layout): VenueZone[] {
  const venue = venueDefinition(layout.venueId);
  switch (venue.id) {
    case 'theater': return theaterZones(layout);
    case 'restaurant': return restaurantZones(layout);
    case 'conference': return conferenceZones(layout);
    case 'stadium': return stadiumZones(layout);
    case 'festival':
    case 'lawn': return outdoorEventZones(layout);
    default: return outdoorEventZones(layout);
  }
}
