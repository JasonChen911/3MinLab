/**
 * Deterministic, chunk-based city layout. This module is pure data: the same
 * seed + build area always produces the same world, so a saved layout restores
 * the exact same environment.
 */

export interface WorldConfig {
  version: 1;
  seed: number;
  chunkSize: number;
  roadSpacing: number;
}

export interface BuildArea {
  x: number;
  z: number;
  size: number;
}

export type BuildingStyle = 'office' | 'residential' | 'shop' | 'cafe' | 'public';
export type CellKind = 'reserved' | 'buildings' | 'park' | 'parking' | 'plaza' | 'green';
export type PropKind = 'lamp' | 'bench' | 'flower' | 'bin';

export interface CityTheme {
  name: string;
  skyTop: number;
  skyBottom: number;
  fog: number;
  grass: number;
  grassAlt: number;
  road: number;
  sidewalk: number;
  plaza: number;
  parking: number;
  buildingColors: number[];
  roofColors: number[];
  treeColors: number[];
  flowerColors: number[];
  buildingChance: number;
  parkChance: number;
  maxHeight: number;
  treeDensity: number;
}

export interface CityPlan {
  world: WorldConfig;
  buildArea: BuildArea;
  firstRoad: number;
  roadWidth: number;
  sidewalkWidth: number;
  verge: number;
  roadsX: number[];
  roadsZ: number[];
}

export interface BuildingSpec {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  style: BuildingStyle;
  color: number;
  roof: number;
  seed: number;
}

export interface TreeSpec {
  x: number;
  z: number;
  scale: number;
  tint: number;
  rotation: number;
}

export interface PropSpec {
  kind: PropKind;
  x: number;
  z: number;
  rotation: number;
  tint: number;
}

export interface ParkedCarSpec {
  x: number;
  z: number;
  rotation: number;
  color: number;
}

export interface RectSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface CellSpec {
  k: number;
  l: number;
  kind: CellKind;
  rect: RectSpec;
  buildings: BuildingSpec[];
  trees: TreeSpec[];
  props: PropSpec[];
  parkedCars: ParkedCarSpec[];
  paths: RectSpec[];
  stalls: ParkedCarSpec[];
}

export interface ChunkSpec {
  key: string;
  cx: number;
  cz: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  far: boolean;
  roadsX: number[];
  roadsZ: number[];
  cells: CellSpec[];
  apronTrees: TreeSpec[];
  props: PropSpec[];
}

export const DEFAULT_SEED = 20261106;
export const ROAD_WIDTH = 9;
export const SIDEWALK_WIDTH = 3;
export const VERGE_WIDTH = 12;
const ROAD_RINGS = 16;

export function defaultWorld(seed = DEFAULT_SEED): WorldConfig {
  return {version: 1, seed: seed >>> 0, chunkSize: 64, roadSpacing: 64};
}

export function normalizeWorld(world: Partial<WorldConfig> | undefined, fallbackSeed = DEFAULT_SEED): WorldConfig {
  const seed = Number.isFinite(world?.seed) ? Math.max(0, Math.floor(world!.seed!)) : fallbackSeed;
  const chunkSize = Math.max(32, Math.min(128, Math.round(world?.chunkSize ?? 64)));
  const roadSpacing = Math.max(40, Math.min(128, Math.round(world?.roadSpacing ?? 64)));
  return {version: 1, seed: seed >>> 0, chunkSize, roadSpacing};
}

export function hash01(seed: number, a: number, b: number, c = 0): number {
  let h = (seed ^ Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rngFor(seed: number, a: number, b: number, c = 0): () => number {
  let state = (hash01(seed, a, b, c) * 4294967296) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function themeForScene(scene: string): CityTheme {
  const base: CityTheme = {
    name: '综合城区', skyTop: 0x3f8fdd, skyBottom: 0xe2f2fb, fog: 0xcfe8f6,
    grass: 0x83c96f, grassAlt: 0x9ad982, road: 0x616a74, sidewalk: 0xd8d5cb,
    plaza: 0xd9cfba, parking: 0x7d848c,
    buildingColors: [0xe9b87c, 0xa9c4d9, 0xdba38c, 0xb8c6a0, 0xc7b2d6, 0x8fb7bd],
    roofColors: [0x7c6f63, 0x8d7b6a, 0x6f7d80, 0x9c846c],
    treeColors: [0x4f9e56, 0x6cb85f, 0x3f8a4d, 0x7cc767], flowerColors: [0xff7fa2, 0xffd166, 0xb58be8, 0xff9f5e],
    buildingChance: 0.58, parkChance: 0.2, maxHeight: 38, treeDensity: 1,
  };
  switch (scene) {
    case 'athletics':
      return {...base, name: '运动校园', grass: 0x83aa77, grassAlt: 0x95b589, buildingChance: 0.5, parkChance: 0.28, maxHeight: 24, treeDensity: 1.2,
        buildingColors: [0xe8c27f, 0xa9cdbd, 0xdfa88e, 0xc0d49a, 0x9cc0d8]};
    case 'performance':
      return {...base, name: '音乐街区', skyTop: 0x4a8fe0, grass: 0x86cf72, buildingChance: 0.62, parkChance: 0.16, maxHeight: 30, treeDensity: 0.9,
        buildingColors: [0xf0a6a0, 0xa9c8e6, 0xf2c878, 0xb9a9dc, 0x9fd3c7], roofColors: [0x8b6f5d, 0x7b6c82, 0x6f8088]};
    case 'conference':
    case 'business':
      return {...base, name: '商务城', grass: 0x7fbf6a, buildingChance: 0.72, parkChance: 0.12, maxHeight: 48, treeDensity: 0.75,
        buildingColors: [0xa9c6dc, 0x8fb4cf, 0xc7d7e4, 0xbcc7d4, 0x9fb9c9], roofColors: [0x66727d, 0x74808a, 0x5f6b75],
        plaza: 0xd8cdb8};
    case 'community':
      return {...base, name: '校园街区', grass: 0x84cf6e, buildingChance: 0.5, parkChance: 0.28, maxHeight: 26, treeDensity: 1.25,
        buildingColors: [0xf0c78c, 0xb9d3a7, 0xd9a98f, 0xa8c8dd, 0xd2b9dd]};
    case 'charity':
      return {...base, name: '公益园区', grass: 0x8bd477, buildingChance: 0.4, parkChance: 0.34, maxHeight: 20, treeDensity: 1.4,
        buildingColors: [0xe7d19a, 0xb7d6b0, 0xdcb398, 0xaecadc]};
    case 'sports':
    case 'competition':
      return {...base, name: '赛事园区', grass: 0x7ccb67, buildingChance: 0.52, parkChance: 0.24, maxHeight: 28, treeDensity: 1.1,
        buildingColors: [0xe3bb82, 0xa6c8bd, 0xd9a58a, 0xb5c98f, 0x9dbfd6]};
    default:
      return base;
  }
}

export function planCity(world: WorldConfig, buildArea: BuildArea): CityPlan {
  const half = buildArea.size / 2;
  const firstRoad = half + VERGE_WIDTH + SIDEWALK_WIDTH + ROAD_WIDTH / 2;
  const coords: number[] = [];
  for (let n = 0; n < ROAD_RINGS; n++) {
    const c = firstRoad + n * world.roadSpacing;
    coords.push(c, -c);
  }
  coords.sort((a, b) => a - b);
  return {
    world, buildArea, firstRoad, roadWidth: ROAD_WIDTH, sidewalkWidth: SIDEWALK_WIDTH,
    verge: VERGE_WIDTH, roadsX: coords, roadsZ: [...coords],
  };
}

export function cellBounds(k: number, plan: CityPlan): {min: number; max: number} {
  const {firstRoad, world} = plan;
  if (k === 0) return {min: -firstRoad, max: firstRoad};
  const sign = Math.sign(k);
  const n = Math.abs(k);
  return sign > 0
    ? {min: firstRoad + (n - 1) * world.roadSpacing, max: firstRoad + n * world.roadSpacing}
    : {min: -firstRoad - n * world.roadSpacing, max: -firstRoad - (n - 1) * world.roadSpacing};
}

export function cellsOverlapping(min: number, max: number, plan: CityPlan): number[] {
  const {firstRoad, world} = plan;
  const out: number[] = [];
  const lo = Math.floor((min - firstRoad) / world.roadSpacing) - 1;
  const hi = Math.ceil((max - firstRoad) / world.roadSpacing) + 1;
  for (let k = lo; k <= hi; k++) {
    const b = cellBounds(k, plan);
    if (b.max > min && b.min < max) out.push(k);
  }
  if (out.length === 0 || !out.includes(0)) {
    const b = cellBounds(0, plan);
    if (b.max > min && b.min < max) out.push(0);
  }
  return out;
}

export function nearestRoadDistance(plan: CityPlan, x: number, z: number): number {
  let best = Infinity;
  for (const c of plan.roadsX) best = Math.min(best, Math.abs(x - c));
  for (const c of plan.roadsZ) best = Math.min(best, Math.abs(z - c));
  return best;
}

export function isOnRoad(plan: CityPlan, x: number, z: number, clearance = 0): boolean {
  const limit = plan.roadWidth / 2 + clearance;
  for (const c of plan.roadsX) if (Math.abs(x - c) <= limit) return true;
  for (const c of plan.roadsZ) if (Math.abs(z - c) <= limit) return true;
  return false;
}

export function insideBuildArea(area: BuildArea, x: number, z: number, margin = 0): boolean {
  return Math.abs(x - area.x) <= area.size / 2 + margin && Math.abs(z - area.z) <= area.size / 2 + margin;
}

export function rectsIntersect(a: RectSpec, b: RectSpec): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

export function clipRect(a: RectSpec, b: RectSpec): RectSpec | null {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
  return x1 > x0 && z1 > z0 ? {x0, z0, x1, z1} : null;
}

export function chunkKey(cx: number, cz: number): string { return `${cx},${cz}`; }

function pointInChunk(x: number, z: number, x0: number, x1: number, z0: number, z1: number): boolean {
  return x >= x0 && x < x1 && z >= z0 && z < z1;
}

function pick<T>(rng: () => number, list: T[]): T { return list[Math.floor(rng() * list.length) % list.length]; }

function styleFor(rng: () => number, plan: CityPlan, k: number, l: number, theme: CityTheme): BuildingStyle {
  const distance = Math.max(Math.abs(k), Math.abs(l));
  if (distance <= 2) {
    const r = rng();
    return r < 0.34 ? 'office' : r < 0.64 ? 'shop' : r < 0.84 ? 'cafe' : 'public';
  }
  if (distance <= 4) {
    const r = rng();
    return r < 0.24 ? 'office' : r < 0.8 ? 'residential' : 'shop';
  }
  return rng() < 0.72 ? 'residential' : 'public';
}

function heightFor(style: BuildingStyle, rng: () => number, distance: number, theme: CityTheme): number {
  const near = Math.max(0.55, 1.15 - distance * 0.045);
  switch (style) {
    case 'office': return Math.min(theme.maxHeight, (16 + rng() * 24) * near);
    case 'residential': return Math.min(theme.maxHeight * 0.8, (10 + rng() * 16) * near);
    case 'public': return Math.min(theme.maxHeight * 0.7, (9 + rng() * 9) * near);
    case 'shop': return 6 + rng() * 5;
    case 'cafe': return 5 + rng() * 4;
  }
}

function buildingCell(rng: () => number, plan: CityPlan, k: number, l: number, rect: RectSpec, theme: CityTheme): BuildingSpec[] {
  const width = rect.x1 - rect.x0, depth = rect.z1 - rect.z0;
  const cols = width > theme.maxHeight * 1.4 && width > 46 ? 2 : 1;
  const rows = depth > 46 ? 2 : 1;
  const gap = 3.2;
  const lotW = (width - gap * (cols - 1)) / cols;
  const lotD = (depth - gap * (rows - 1)) / rows;
  const buildings: BuildingSpec[] = [];
  const distance = Math.max(Math.abs(k), Math.abs(l));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (rng() < 0.12) continue;
      const style = styleFor(rng, plan, k, l, theme);
      const margin = 2.2 + rng() * 2.4;
      const w = Math.max(5, lotW - margin * 2);
      const d = Math.max(5, lotD - margin * 2);
      if (w < 4.5 || d < 4.5) continue;
      const cx = rect.x0 + c * (lotW + gap) + lotW / 2 + (rng() - 0.5) * 1.2;
      const cz = rect.z0 + r * (lotD + gap) + lotD / 2 + (rng() - 0.5) * 1.2;
      buildings.push({
        id: `b-${k}-${l}-${c}-${r}`,
        x: cx, z: cz, w, d,
        h: Math.max(4.5, heightFor(style, rng, distance, theme)),
        style,
        color: pick(rng, theme.buildingColors),
        roof: pick(rng, theme.roofColors),
        seed: Math.floor(rng() * 1e9),
      });
    }
  }
  return buildings;
}

function treeAt(rng: () => number, plan: CityPlan, x: number, z: number, theme: CityTheme, scale = 1): TreeSpec | null {
  if (isOnRoad(plan, x, z, plan.sidewalkWidth + 1.4)) return null;
  if (insideBuildArea(plan.buildArea, x, z, 1.2)) return null;
  return {x, z, scale: (0.75 + rng() * 0.65) * scale, tint: pick(rng, theme.treeColors), rotation: rng() * Math.PI * 2};
}

function parkCell(rng: () => number, plan: CityPlan, rect: RectSpec, theme: CityTheme): {trees: TreeSpec[]; props: PropSpec[]; paths: RectSpec[]} {
  const trees: TreeSpec[] = [];
  const props: PropSpec[] = [];
  const paths: RectSpec[] = [];
  const count = Math.round((4 + rng() * 7) * theme.treeDensity);
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 6; tries++) {
      const x = rect.x0 + 3 + rng() * (rect.x1 - rect.x0 - 6);
      const z = rect.z0 + 3 + rng() * (rect.z1 - rect.z0 - 6);
      if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 4.2)) continue;
      const tree = treeAt(rng, plan, x, z, theme);
      if (tree) { trees.push(tree); break; }
    }
  }
  const benches = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < benches; i++) {
    props.push({kind: 'bench', x: rect.x0 + 4 + rng() * Math.max(1, rect.x1 - rect.x0 - 8), z: rect.z0 + 4 + rng() * Math.max(1, rect.z1 - rect.z0 - 8), rotation: pick(rng, [0, Math.PI / 2]), tint: 0xb5814f});
  }
  const flowers = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < flowers; i++) {
    props.push({kind: 'flower', x: rect.x0 + 3 + rng() * Math.max(1, rect.x1 - rect.x0 - 6), z: rect.z0 + 3 + rng() * Math.max(1, rect.z1 - rect.z0 - 6), rotation: 0, tint: pick(rng, theme.flowerColors)});
  }
  const pw = 2.4;
  if (rect.x1 - rect.x0 > 20) {
    paths.push({x0: (rect.x0 + rect.x1) / 2 - pw / 2, x1: (rect.x0 + rect.x1) / 2 + pw / 2, z0: rect.z0 + 1, z1: rect.z1 - 1});
    paths.push({x0: rect.x0 + 1, x1: rect.x1 - 1, z0: (rect.z0 + rect.z1) / 2 - pw / 2, z1: (rect.z0 + rect.z1) / 2 + pw / 2});
  }
  return {trees, props, paths};
}

function parkingCell(rng: () => number, plan: CityPlan, rect: RectSpec, theme: CityTheme): {cars: ParkedCarSpec[]; stalls: ParkedCarSpec[]} {
  const cars: ParkedCarSpec[] = [];
  const stalls: ParkedCarSpec[] = [];
  const rows = 2;
  const columns = Math.max(3, Math.floor((rect.x1 - rect.x0) / 5));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = rect.x0 + 2.4 + c * 5;
      const z = rect.z0 + 4 + r * ((rect.z1 - rect.z0) / 2);
      if (x > rect.x1 - 2 || z > rect.z1 - 2) continue;
      const rotation = Math.PI / 2;
      stalls.push({x, z, rotation, color: 0xffffff});
      if (rng() > 0.38) cars.push({x, z, rotation, color: pick(rng, [0xf3f4f6, 0xd95d55, 0x5a8fd1, 0xf0c45c, 0x6fb98a, 0x8b8f98, 0xc987b8])});
    }
  }
  return {cars, stalls};
}

function cellAt(plan: CityPlan, k: number, l: number, theme: CityTheme, far: boolean): CellSpec {
  const xb = cellBounds(k, plan), zb = cellBounds(l, plan);
  const inset = plan.roadWidth / 2 + plan.sidewalkWidth;
  const rect: RectSpec = {x0: xb.min + inset, x1: xb.max - inset, z0: zb.min + inset, z1: zb.max - inset};
  const rng = rngFor(plan.world.seed, k, l, 11);
  const central = k === 0 && l === 0;
  const adjacent = k === 0 || l === 0;
  let kind: CellKind;
  if (central) kind = 'reserved';
  else if (adjacent) kind = theme.name === '运动校园' ? (rng() < .72 ? 'park' : 'buildings') : rng() < 0.55 ? 'park' : 'plaza';
  else {
    const r = rng();
    if (r < theme.parkChance) kind = 'park';
    else if (r < theme.parkChance + 0.1) kind = 'parking';
    else if (r < theme.parkChance + 0.18) kind = 'plaza';
    else if (r < theme.parkChance + 0.18 + theme.buildingChance * 0.12) kind = 'green';
    else kind = 'buildings';
  }
  const out: CellSpec = {k, l, kind, rect, buildings: [], trees: [], props: [], parkedCars: [], paths: [], stalls: []};
  if (kind === 'reserved') {
    if (!far) {
      const half = plan.buildArea.size / 2;
      for (const offset of [half + 6.5, half + 10.5]) {
        for (let n = 0; n < 4; n++) {
          for (const sign of [-1, 1]) {
            const t = -half - 4 + n * ((plan.buildArea.size + 8) / 3);
            if (rng() < 0.3) continue;
            const x = sign * offset, z = Math.max(-half - 4, Math.min(half + 4, t));
            if (Math.abs(z) < half + 3) {
              const tree = treeAt(rng, plan, x, z, theme);
              if (tree) out.trees.push(tree);
            }
            const z2 = sign * offset, x2 = Math.max(-half - 4, Math.min(half + 4, t));
            if (Math.abs(x2) < half + 3) {
              const tree = treeAt(rng, plan, x2, z2, theme);
              if (tree) out.trees.push(tree);
            }
          }
        }
      }
      for (const [x, z] of [[-half - 9, -half - 9], [half + 9, -half - 9], [-half - 9, half + 9], [half + 9, half + 9]]) {
        out.props.push({kind: 'lamp', x, z, rotation: 0, tint: 0xffd95c});
      }
    }
    return out;
  }
  if (kind === 'buildings') {
    out.buildings = buildingCell(rng, plan, k, l, rect, theme);
    if (!far) {
      for (let i = 0; i < 2; i++) {
        const x = rect.x0 + 2 + rng() * Math.max(1, rect.x1 - rect.x0 - 4);
        const z = rect.z0 + 2 + rng() * Math.max(1, rect.z1 - rect.z0 - 4);
        if (!out.buildings.some(b => Math.abs(b.x - x) < b.w / 2 + 2 && Math.abs(b.z - z) < b.d / 2 + 2)) {
          const tree = treeAt(rng, plan, x, z, theme);
          if (tree) out.trees.push(tree);
        }
      }
    }
    return out;
  }
  if (kind === 'park') {
    const park = parkCell(rng, plan, rect, theme);
    out.trees = far ? park.trees.slice(0, Math.ceil(park.trees.length / 3)) : park.trees;
    out.props = far ? [] : park.props;
    out.paths = park.paths;
    return out;
  }
  if (kind === 'parking') {
    const parking = parkingCell(rng, plan, rect, theme);
    out.parkedCars = far ? parking.cars.slice(0, 2) : parking.cars;
    out.stalls = parking.stalls;
    return out;
  }
  if (kind === 'plaza') {
    out.paths = [];
    if (!far) {
      out.props.push({kind: 'bench', x: rect.x0 + 5, z: rect.z0 + 5, rotation: 0, tint: 0xb5814f});
      out.props.push({kind: 'bench', x: rect.x1 - 5, z: rect.z1 - 5, rotation: Math.PI, tint: 0xb5814f});
      for (let i = 0; i < 4; i++) {
        out.props.push({kind: 'flower', x: rect.x0 + 4 + rng() * Math.max(1, rect.x1 - rect.x0 - 8), z: rect.z0 + 4 + rng() * Math.max(1, rect.z1 - rect.z0 - 8), rotation: 0, tint: pick(rng, theme.flowerColors)});
      }
      for (let i = 0; i < 3; i++) {
        const tree = treeAt(rng, plan, rect.x0 + 4 + rng() * Math.max(1, rect.x1 - rect.x0 - 8), rect.z0 + 4 + rng() * Math.max(1, rect.z1 - rect.z0 - 8), theme);
        if (tree) out.trees.push(tree);
      }
    }
    return out;
  }
  if (kind === 'green') {
    if (!far) {
      for (let i = 0; i < 4; i++) {
        const tree = treeAt(rng, plan, rect.x0 + 3 + rng() * Math.max(1, rect.x1 - rect.x0 - 6), rect.z0 + 3 + rng() * Math.max(1, rect.z1 - rect.z0 - 6), theme);
        if (tree) out.trees.push(tree);
      }
    }
    return out;
  }
  return out;
}

function roadsideProps(plan: CityPlan, theme: CityTheme, x0: number, x1: number, z0: number, z1: number, far: boolean): {trees: TreeSpec[]; props: PropSpec[]} {
  const trees: TreeSpec[] = [];
  const props: PropSpec[] = [];
  if (far) return {trees, props};
  const rng = rngFor(plan.world.seed, Math.floor(x0), Math.floor(z0), 23);
  const side = plan.roadWidth / 2 + plan.sidewalkWidth + 1.6;
  for (const rx of plan.roadsX) {
    if (rx < x0 - 2 || rx > x1 + 2) continue;
    for (let z = Math.ceil(z0 / 16) * 16; z < z1; z += 16) {
      if (plan.roadsZ.some(rz => Math.abs(z - rz) < plan.roadWidth)) continue;
      for (const sign of [-1, 1]) {
        if (rng() < 0.4) continue;
        const tree = treeAt(rng, plan, rx + sign * side, z + rng() * 3, theme);
        if (tree) trees.push(tree);
      }
    }
    for (let z = Math.ceil(z0 / 32) * 32; z < z1; z += 32) {
      for (const sign of [-1, 1]) {
        if (rng() < 0.5) continue;
        props.push({kind: 'lamp', x: rx + sign * (side + 0.8), z, rotation: 0, tint: 0xffd95c});
      }
    }
  }
  for (const rz of plan.roadsZ) {
    if (rz < z0 - 2 || rz > z1 + 2) continue;
    for (let x = Math.ceil(x0 / 16) * 16; x < x1; x += 16) {
      if (plan.roadsX.some(rx => Math.abs(x - rx) < plan.roadWidth)) continue;
      for (const sign of [-1, 1]) {
        if (rng() < 0.45) continue;
        const tree = treeAt(rng, plan, x + rng() * 3, rz + sign * side, theme);
        if (tree) trees.push(tree);
      }
    }
  }
  return {trees, props};
}

export function generateChunk(world: WorldConfig, buildArea: BuildArea, cx: number, cz: number, far = false, theme = themeForScene('custom')): ChunkSpec {
  const plan = planCity(world, buildArea);
  const x0 = cx * world.chunkSize, x1 = x0 + world.chunkSize;
  const z0 = cz * world.chunkSize, z1 = z0 + world.chunkSize;
  const ks = cellsOverlapping(x0, x1, plan);
  const ls = cellsOverlapping(z0, z1, plan);
  const cells: CellSpec[] = [];
  for (const k of ks) for (const l of ls) cells.push(cellAt(plan, k, l, theme, far));
  const roadsX = plan.roadsX.filter(x => x >= x0 - plan.roadWidth / 2 && x <= x1 + plan.roadWidth / 2);
  const roadsZ = plan.roadsZ.filter(z => z >= z0 - plan.roadWidth / 2 && z <= z1 + plan.roadWidth / 2);
  const roadside = roadsideProps(plan, theme, x0, x1, z0, z1, far);
  const apronTrees = cells.flatMap(c => c.trees).filter(t => pointInChunk(t.x, t.z, x0, x1, z0, z1));
  for (const tree of roadside.trees) if (pointInChunk(tree.x, tree.z, x0, x1, z0, z1)) apronTrees.push(tree);
  const props = roadside.props.filter(p => pointInChunk(p.x, p.z, x0, x1, z0, z1));
  return {
    key: chunkKey(cx, cz), cx, cz, x0, x1, z0, z1, far,
    roadsX, roadsZ, cells,
    apronTrees, props,
  };
}

/** Sidewalk loops used by ambient pedestrians. Coordinates follow the block grid. */
export function sidewalkLoops(plan: CityPlan): {x: number; z: number}[][] {
  const half = plan.buildArea.size / 2;
  const inner = half + VERGE_WIDTH + SIDEWALK_WIDTH / 2;
  const outer = plan.firstRoad + plan.roadWidth / 2 + plan.sidewalkWidth / 2;
  const loop = (r: number) => [
    {x: -r, z: -r}, {x: r, z: -r}, {x: r, z: r}, {x: -r, z: r},
  ];
  return [loop(inner), loop(outer)];
}
