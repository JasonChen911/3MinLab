import type {Item, Kind, Layout, Scene} from './game';

export type VenueSize = 'small' | 'medium' | 'large';
export type VenueType = 'outdoor' | 'indoor';
export type CameraPreset = 'overhead' | 'audience' | 'isometric' | 'wide' | 'stage';

export interface VenueVariant {
  label: string;
  size: number;
  capacity: number;
}

export interface VenueStyle {
  wall: number;
  wallTrim: number;
  floor: number;
  ceiling: number;
  accent: number;
  window: number;
  height: number;
  curtain?: number;
}

export interface VenueDefinition {
  id: string;
  name: string;
  type: VenueType;
  category: string;
  description: string;
  scene: Scene;
  recommendedScenes: Scene[];
  terrain: NonNullable<Layout['terrain']>;
  camera: CameraPreset;
  style: VenueStyle;
  variants: Record<VenueSize, VenueVariant>;
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `v-${Math.random().toString(36).slice(2)}`);
const item = (kind: Kind, x: number, z: number, rotation = 0, extra: Partial<Item> = {}): Item => ({id: uid(), kind, x, z, rotation, height: 1, scale: 1, ...extra});

function stadiumItems(size: number): Item[] {
  const h = size / 2, row = .36, side = Math.min(.42, 18 / size);
  const seating = size <= 50 ? 1.75 : size <= 80 ? 2.3 : 2.6;
  const ceremony = size <= 50 ? 1.2 : size <= 80 ? 1.35 : 1.5;
  return [
    item('entrance', -h + 5, h - 2), item('entrance', h - 5, h - 2),
    item('checkin', 0, h - 5.5), item('checkinSmall', -8, h - 5.5),
    item('stageSmall', -h + 7, -h + 7, -45, {scale: ceremony}),
    item('bleachers', -size * row, -size * .14, -90, {scale: seating}),
    item('bleachers', -size * row, size * .14, -90, {scale: seating}),
    item('bleachers', size * row, -size * .14, 90, {scale: seating}),
    item('bleachers', size * row, size * .14, 90, {scale: seating}),
    item('medical', -h + 4, 0), item('storage', h - 4, -h + 4),
    item('rest', h - 4, 0), item('service', 0, h - 9.5),
    item('fence', -size * side, 0, 90), item('fence', size * side, 0, 90),
    item('tree', -h + 3, -h + 3), item('tree', h - 3, -h + 12),
  ];
}

function theaterItems(size: number): Item[] {
  const h = size / 2;
  const stageScale = size < 40 ? 1 : size < 60 ? 1.35 : 1.5;
  const seatScale = size < 40 ? 1 : size < 60 ? 1.8 : 2;
  const stageZ = -h * .38;
  const backdropScale = stageScale;
  const backdropZ = stageZ - 2 * stageScale - .5 * backdropScale - .15;
  const rows = size >= 60 ? 2 : 1;
  const seats: Item[] = [];
  for (let r = 0; r < rows; r++) {
    seats.push(item('bleachers', 0, h * .02 + r * (3 * seatScale + 3), 0, {scale: seatScale}));
  }
  if (size < 40) { seats.length = 0; seats.push(item('chair', -4, 1), item('chair', 4, 1), item('chair', 0, 6)); }
  const front = stageZ + 2 * stageScale;
  return [
    item('stage', 0, stageZ, 0, {scale: stageScale}),
    item('backdrop', 0, backdropZ, 0, {scale: backdropScale}),
    item('speaker', -4.2, front + 1.1), item('speaker', 4.2, front + 1.1),
    item('light', -5.5, front + .7), item('light', 5.5, front + .7),
    ...seats,
    item('entrance', 0, h - 2), item('checkin', size * .2, h - 5.5),
    item('service', -size * .2, h - 5.5), item('rest', -h + 4, -h + 4),
    item('medical', h - 4, -h + 4), item('storage', -h + 4, h - 4),
  ];
}

function restaurantItems(size: number): Item[] {
  const h = size / 2;
  const tables: Item[] = [];
  const tableScale = size <= 26 ? 1 : size <= 42 ? 1.15 : 1.25;
  const columns = size >= 55 ? 4 : size >= 35 ? 3 : 2;
  const rows = size >= 55 ? 3 : size >= 35 ? 2 : 1;
  const gapX = Math.min(9, size * .24), gapZ = Math.min(8, size * .25);
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      tables.push(item('chair', (c - (columns - 1) / 2) * gapX, (r - (rows - 1) / 2) * gapZ + 1, 0, {scale: tableScale}));
    }
  }
  return [
    ...tables,
    item('service', 0, -h + 4), item('entrance', 0, h - 2),
    item('toilet', -h + 4, h - 4), item('storage', h - 4, -h + 4),
    item('rest', -h + 4, -h + 4), item('medical', h - 4, h - 4),
    item('bin', 0, h - 5), item('sign', -h + 4, 0), item('sign', h - 4, 0),
  ];
}

function lawnItems(size: number): Item[] {
  const h = size / 2;
  const eventScale = size <= 26 ? 1 : size <= 46 ? 1.2 : 1.4;
  const tentScale = size <= 26 ? 1 : size <= 46 ? 1.15 : 1.4;
  return [
    item('entrance', -3, h - 2), item('checkin', 3, h - 5),
    item('stageSmall', 0, -h * .38, 0, {scale: eventScale}), item('service', -h + 5, 0),
    item('rest', h - 6, -h + 6), item('medical', h - 5, 0),
    item('tent', -h * .52, 0, 0, {scale: tentScale}), item('tent', h * .52, 0, 0, {scale: tentScale}),
    item('tentSmall', -h * .52, h * .48, 0, {scale: tentScale}), item('tentSmall', h * .52, h * .48, 0, {scale: tentScale}),
    item('tree', -h + 3, -h + 3), item('tree', h - 3, -h + 3),
    item('tree', -h + 3, h - 8), item('tree', h - 3, h - 8),
    item('path', 0, h - 7.5), item('path', 0, h - 9.5),
  ];
}

function conferenceItems(size: number): Item[] {
  const h = size / 2;
  const chairs: Item[] = [];
  const tableScale = size <= 30 ? 1 : size <= 48 ? 1.1 : 1.2;
  const columns = size >= 60 ? 5 : size >= 38 ? 4 : 2;
  const rows = size >= 60 ? 3 : size >= 38 ? 2 : 1;
  const gapX = Math.min(7, size * .18), gapZ = Math.min(5, size * .14);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      chairs.push(item('chair', (c - (columns - 1) / 2) * gapX, -size * .13 + r * gapZ, 0, {scale: tableScale}));
    }
  }
  return [
    item('podium', 0, -h * .4), item('screen', 0, -h * .4 - 2.1),
    item('speaker', -5, -h * .4 + 2.5), item('speaker', 5, -h * .4 + 2.5),
    ...chairs,
    item('entrance', 0, h - 2), item('checkin', size * .2, h - 5.5),
    item('service', -size * .2, h - 5.5), item('rest', -h + 4, -h + 4),
    item('medical', h - 4, -h + 4), item('storage', -h + 4, h - 4),
  ];
}

function festivalItems(size: number): Item[] {
  const h = size / 2;
  const stageScale = size <= 46 ? 1.1 : size <= 68 ? 1.2 : 1.3;
  const stageZ = -h * .36;
  const backdropZ = stageZ - 4 * stageScale - .5 * stageScale - .2;
  const seatScale = size <= 46 ? 1.4 : size <= 68 ? 1.6 : 1.8;
  const tentScale = size <= 46 ? 1.1 : size <= 68 ? 1.2 : 1.35;
  return [
    item('stageLarge', 0, stageZ, 0, {scale: stageScale}),
    item('backdrop', 0, backdropZ, 0, {scale: stageScale}),
    item('speaker', -7, stageZ + 4 * stageScale + 1.2), item('speaker', 7, stageZ + 4 * stageScale + 1.2),
    item('light', -8, stageZ + 4 * stageScale + .7), item('light', 8, stageZ + 4 * stageScale + .7),
    item('screen', 0, stageZ + 4 * stageScale + 1.8),
    item('bleachers', -h * .34, h * .06, 0, {scale: seatScale}), item('bleachers', h * .34, h * .06, 0, {scale: seatScale}),
    item('entrance', -h * .35, h - 2), item('entrance', h * .35, h - 2),
    item('checkin', 0, h - 5.5),
    item('tent', -h * .62, h * .42, 0, {scale: tentScale}), item('tent', h * .62, h * .42, 0, {scale: tentScale}),
    item('service', 0, -h + 5), item('rest', -h + 5, -h + 5),
    item('medical', h - 5, -h + 5), item('storage', h - 5, h * .34),
    item('bin', -h + 4, h * .3), item('bin', h - 4, h * .3),
    item('fence', -h + 2, -h * .15, 90), item('fence', h - 2, -h * .15, 90),
  ];
}

const definitions: Record<string, VenueDefinition> = {
  stadium: {
    id: 'stadium', name: '体育场', type: 'outdoor', category: '运动场地', scene: 'athletics',
    description: '带跑道、看台、检录区与医疗点的综合运动场。',
    recommendedScenes: ['athletics', 'sports', 'competition'],
    terrain: 'track', camera: 'overhead',
    style: {wall: 0xb9c5c0, wallTrim: 0x6c7b76, floor: 0xa35d4d, ceiling: 0xb9c5c0, accent: 0x5f9b79, window: 0x9fd6ea, height: 7},
    variants: {
      small: {label: '训练场', size: 50, capacity: 200},
      medium: {label: '标准运动场', size: 80, capacity: 800},
      large: {label: '大型体育场', size: 110, capacity: 3000},
    },
  },
  theater: {
    id: 'theater', name: '剧院', type: 'indoor', category: '演出空间', scene: 'performance',
    description: '镜框式舞台、后台、观众席与可控灯光，适合演出和发布会。',
    recommendedScenes: ['performance', 'conference', 'business'],
    terrain: 'plaza', camera: 'audience',
    style: {wall: 0x5a3d3b, wallTrim: 0xc7a36a, floor: 0x8d6248, ceiling: 0x362c31, accent: 0xb6474d, window: 0xe2c28f, height: 7.2, curtain: 0x8e2f3d},
    variants: {
      small: {label: '50 人黑箱剧场', size: 30, capacity: 50},
      medium: {label: '200 人剧院', size: 48, capacity: 200},
      large: {label: '800 人大剧院', size: 70, capacity: 800},
    },
  },
  restaurant: {
    id: 'restaurant', name: '餐厅', type: 'indoor', category: '餐饮空间', scene: 'custom',
    description: '餐桌、服务台、后厨与顾客入口，可用于桌游、聚餐和沙龙。',
    recommendedScenes: ['custom', 'community', 'charity'],
    terrain: 'plaza', camera: 'isometric',
    style: {wall: 0x806753, wallTrim: 0xd6b789, floor: 0xa77b52, ceiling: 0x4a3b32, accent: 0xc9804d, window: 0xaad8e6, height: 3.6},
    variants: {
      small: {label: '20 人小餐厅', size: 26, capacity: 20},
      medium: {label: '60 人餐厅', size: 42, capacity: 60},
      large: {label: '150 人宴会厅', size: 62, capacity: 150},
    },
  },
  lawn: {
    id: 'lawn', name: '大草坪', type: 'outdoor', category: '户外空间', scene: 'community',
    description: '草地、步道、树木与自由布置区，适合露营、市集和校园活动。',
    recommendedScenes: ['community', 'charity', 'custom'],
    terrain: 'grass', camera: 'wide',
    style: {wall: 0x6f8f68, wallTrim: 0xb9c7a8, floor: 0x7fbf6c, ceiling: 0xcfe8f6, accent: 0x5d9b62, window: 0xaad8e6, height: 4},
    variants: {
      small: {label: '小型草坪', size: 26, capacity: 80},
      medium: {label: '中型草坪', size: 46, capacity: 300},
      large: {label: '大型草坪', size: 82, capacity: 1000},
    },
  },
  conference: {
    id: 'conference', name: '多功能会议厅', type: 'indoor', category: '会议空间', scene: 'conference',
    description: '讲台、投影、会议桌椅与工作人员区，适合讲座和会议。',
    recommendedScenes: ['conference', 'business', 'competition'],
    terrain: 'plaza', camera: 'audience',
    style: {wall: 0x53647a, wallTrim: 0xa9b7c9, floor: 0x6b7585, ceiling: 0x2f3945, accent: 0x3f8db3, window: 0xa8d8e8, height: 4},
    variants: {
      small: {label: '10 人会议室', size: 26, capacity: 10},
      medium: {label: '50 人会议厅', size: 44, capacity: 50},
      large: {label: '200 人会议厅', size: 68, capacity: 200},
    },
  },
  festival: {
    id: 'festival', name: '户外音乐节场地', type: 'outdoor', category: '演出空间', scene: 'performance',
    description: '大型主舞台、观众区、服务区与安保通道，适合音乐节和户外演出。',
    recommendedScenes: ['performance', 'community', 'charity'],
    terrain: 'grass', camera: 'wide',
    style: {wall: 0x6f8f68, wallTrim: 0xb9c7a8, floor: 0x79b86c, ceiling: 0xcfe8f6, accent: 0x8d5fc4, window: 0xaad8e6, height: 4},
    variants: {
      small: {label: '小型现场', size: 46, capacity: 300},
      medium: {label: '中型音乐节', size: 68, capacity: 1500},
      large: {label: '大型音乐节', size: 98, capacity: 5000},
    },
  },
};

export const VENUES = Object.values(definitions);
export const VENUE_SIZES: VenueSize[] = ['small', 'medium', 'large'];

export function venueDefinition(id: string | undefined): VenueDefinition {
  return definitions[id ?? ''] ?? definitions.lawn;
}

export function venueVariant(id: string | undefined, variant: VenueSize = 'medium'): VenueVariant {
  return venueDefinition(id).variants[variant] ?? venueDefinition(id).variants.medium;
}

export function makeVenueItems(id: string, variant: VenueSize = 'medium'): Item[] {
  const venue = venueDefinition(id), info = venueVariant(id, variant);
  switch (venue.id) {
    case 'stadium': return stadiumItems(info.size);
    case 'theater': return theaterItems(info.size);
    case 'restaurant': return restaurantItems(info.size);
    case 'conference': return conferenceItems(info.size);
    case 'festival': return festivalItems(info.size);
    default: return lawnItems(info.size);
  }
}

export function venueForScene(scene: Scene): string {
  switch (scene) {
    case 'athletics':
    case 'sports':
    case 'competition': return 'stadium';
    case 'performance': return 'festival';
    case 'conference':
    case 'business': return 'conference';
    default: return 'lawn';
  }
}

export function recommendedVenues(scene: Scene): string[] {
  return VENUES.filter(v => v.recommendedScenes.includes(scene)).map(v => v.id);
}

export function venueIsRecommended(id: string, scene: Scene): boolean {
  return venueDefinition(id).recommendedScenes.includes(scene);
}

export function venueDimensions(id: string | undefined, variant: VenueSize): string {
  return `${venueVariant(id, variant).size}×${venueVariant(id, variant).size}m`;
}

export function venueCapacity(id: string | undefined, variant: VenueSize): number {
  return venueVariant(id, variant).capacity;
}

export function venueLabel(id: string | undefined, variant: VenueSize): string {
  return `${venueDefinition(id).name} · ${venueVariant(id, variant).label}`;
}
