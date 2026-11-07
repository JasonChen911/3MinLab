import type {Kind} from '../game';

export type ItemEnvironment = 'indoor' | 'outdoor' | 'both';

export interface ItemPhysics {
  mass: number;
  friction: number;
  stability: number;
  movable: boolean;
  destructible: boolean;
  weatherResistance: number;
  anchorable: boolean;
  environment: ItemEnvironment;
  collision: 'box' | 'circle';
  blocksPeople: boolean;
  blocksPath: boolean;
  canOverlap: boolean;
  interaction: string;
}

const base: ItemPhysics = {
  mass: 60, friction: .72, stability: .82, movable: false, destructible: false,
  weatherResistance: .7, anchorable: false, environment: 'both', collision: 'box',
  blocksPeople: true, blocksPath: true, canOverlap: false, interaction: '占用空间并参与碰撞。',
};

const overrides: Partial<Record<Kind, Partial<ItemPhysics>>> = {
  stage: {mass: 1200, stability: .96, weatherResistance: .78, interaction: '演员通过前侧入口上台，舞台内部不可穿行。'},
  stageSmall: {mass: 700, stability: .92, weatherResistance: .7, interaction: '可供小型演出与发言使用。'},
  stageLarge: {mass: 2400, stability: .98, weatherResistance: .8, interaction: '带后台与设备区，演员需从侧后方进入。'},
  podium: {mass: 90, movable: true, stability: .8, interaction: '主持人讲台，可被工作人员移动。'},
  backdrop: {mass: 120, movable: true, stability: .55, weatherResistance: .45, interaction: '风荷载较大，户外需要加固。'},
  chair: {mass: 42, friction: .62, stability: .78, movable: true, canOverlap: false, interaction: '桌面阻挡通行，周围座位可被观众占用；可被工作人员推移。'},
  bleachers: {mass: 900, stability: .9, weatherResistance: .7, interaction: '观众席提供多个可用座位，结构不可轻易移动。'},
  tent: {mass: 95, friction: .55, stability: .38, movable: true, destructible: true, weatherResistance: .28, anchorable: true, environment: 'outdoor', interaction: '未固定时大风可能倾倒；固定后可提高稳定性。'},
  tentSmall: {mass: 45, friction: .58, stability: .42, movable: true, destructible: true, weatherResistance: .32, anchorable: true, environment: 'outdoor', interaction: '轻质摊位帐篷，风力影响明显。'},
  speaker: {mass: 35, movable: true, stability: .62, weatherResistance: .5, interaction: '音响影响演出状态，雨天需要遮盖。'},
  light: {mass: 28, movable: true, stability: .6, weatherResistance: .45, interaction: '灯光影响演出照明，大风时需要放倒或加固。'},
  screen: {mass: 180, stability: .7, weatherResistance: .42, interaction: '显示屏提供投影区域，户外大雨会降低可用性。'},
  checkin: {mass: 160, stability: .84, interaction: '签到台处理入场任务，人员会在此排队。'},
  checkinSmall: {mass: 90, stability: .8, interaction: '小型签到台，服务能力较低。'},
  checkinLarge: {mass: 240, stability: .86, interaction: '大型签到台，可同时处理多列队伍。'},
  service: {mass: 140, stability: .82, interaction: '服务台提供咨询与引导。'},
  rest: {mass: 160, stability: .8, interaction: '工作人员休息区，影响巡逻节奏。'},
  fence: {mass: 48, friction: .66, movable: true, stability: .52, interaction: '细长围栏限制通行，可被撞倒但不会飞出。'},
  entrance: {mass: 65, movable: false, stability: .8, blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '提供入场通道与人员生成点。'},
  medical: {mass: 220, stability: .86, interaction: '医疗人员驻守点，处理突发健康事件。'},
  toilet: {mass: 260, stability: .9, interaction: '固定服务设施。'},
  bin: {mass: 12, friction: .55, stability: .42, movable: true, canOverlap: true, blocksPeople: false, blocksPath: false, interaction: '轻型垃圾桶，可被轻微推动。'},
  storage: {mass: 300, stability: .9, interaction: '存放物资与设备。'},
  road: {mass: 0, friction: 1, stability: 1, movable: false, destructible: false, weatherResistance: 1, environment: 'both', blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '提高通行效率，不阻挡人员。'},
  roadCurve: {mass: 0, friction: 1, stability: 1, movable: false, destructible: false, weatherResistance: 1, environment: 'both', blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '连接道路的弯道模块。'},
  path: {mass: 0, friction: 1, stability: 1, movable: false, destructible: false, weatherResistance: 1, environment: 'both', blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '人行小路，提高步行效率。'},
  tree: {mass: 180, stability: .82, weatherResistance: .82, environment: 'outdoor', collision: 'circle', interaction: '树冠与树干阻挡通行，大风会摇摆。'},
  flower: {mass: 8, friction: .5, stability: .25, movable: true, weatherResistance: .4, environment: 'outdoor', blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '轻型装饰，大风可能被吹动。'},
  bush: {mass: 18, stability: .45, weatherResistance: .65, environment: 'outdoor', blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '低矮灌木，可与其他装饰重叠。'},
  planter: {mass: 28, stability: .6, weatherResistance: .55, environment: 'outdoor', movable: true, blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '可移动盆栽。'},
  lamp: {mass: 70, stability: .66, weatherResistance: .6, interaction: '提供照明，可影响夜间可用性。'},
  sign: {mass: 10, movable: true, stability: .4, weatherResistance: .48, blocksPeople: false, blocksPath: false, canOverlap: true, interaction: '轻型指示牌，大风易倒。'},
  bench: {mass: 75, movable: true, stability: .7, weatherResistance: .55, interaction: '休息长椅，可被工作人员移动。'},
  fountain: {mass: 800, stability: .95, weatherResistance: .85, environment: 'outdoor', collision: 'circle', interaction: '景观喷泉，阻挡通行。'},
};

const cache = new Map<Kind, ItemPhysics>();

export function physicsFor(kind: Kind): ItemPhysics {
  const cached = cache.get(kind);
  if (cached) return cached;
  const next = {...base, ...(overrides[kind] ?? {})};
  cache.set(kind, next);
  return next;
}

export function interactionFor(kind: Kind): string {
  return physicsFor(kind).interaction;
}

export function describePhysics(kind: Kind): {mass: string; friction: string; stability: string; weather: string; flags: string[]} {
  const value = physicsFor(kind);
  const flags: string[] = [];
  if (value.movable) flags.push('可移动');
  if (value.destructible) flags.push('可损坏');
  if (value.anchorable) flags.push('可固定');
  if (value.blocksPeople) flags.push('阻挡人物');
  if (!value.blocksPath) flags.push('不阻挡寻路');
  if (value.canOverlap) flags.push('允许部分重叠');
  return {
    mass: value.mass >= 1000 ? `${(value.mass / 1000).toFixed(1)}t` : `${value.mass}kg`,
    friction: `${Math.round(value.friction * 100)}%`,
    stability: `${Math.round(value.stability * 100)}%`,
    weather: `${Math.round(value.weatherResistance * 100)}%`,
    flags,
  };
}
