import * as THREE from 'three';
import {
  chunkKey, clipRect, generateChunk, planCity, sidewalkLoops,
  type BuildArea, type ChunkSpec, type CityPlan, type CityTheme, type BuildingSpec, type WorldConfig,
} from './worldgen';
import {createCar, createCityProp, material, type CarRig} from './models';
import {TrafficSystem} from './traffic';
import type {WeatherProfile} from './weather';

interface ChunkRecord { group: THREE.Group; spec: ChunkSpec; far: boolean }
interface GroundSegment { x0: number; z0: number; x1: number; z1: number }

export type LightingPreset = 'day' | 'dusk' | 'night';

interface LightingStyle {
  sunColor: number; sunScale: number; hemiScale: number; ambient: number; ambientRain: number;
  skyTop: number; skyBottom: number; fog: number; cloudColor: number; cloudScale: number; groundScale: number;
  sun: {x: number; y: number; z: number}; blend: number;
}

const LIGHTING: Record<LightingPreset, LightingStyle> = {
  day: {
    sunColor: 0xfff1d2, sunScale: 1, hemiScale: 1, ambient: .22, ambientRain: .16,
    skyTop: 0x3f8fdd, skyBottom: 0xe2f2fb, fog: 0xcfe8f6, cloudColor: 0xffffff, cloudScale: 1, groundScale: 1,
    sun: {x: 70, y: 120, z: 45}, blend: 0,
  },
  dusk: {
    sunColor: 0xffa765, sunScale: .62, hemiScale: .58, ambient: .26, ambientRain: .1,
    skyTop: 0xef8a5a, skyBottom: 0xffcf9a, fog: 0xd8a279, cloudColor: 0xffd6b0, cloudScale: .72, groundScale: .82,
    sun: {x: 108, y: 56, z: 62}, blend: .62,
  },
  night: {
    sunColor: 0x8fb3e6, sunScale: .16, hemiScale: .24, ambient: .14, ambientRain: .08,
    skyTop: 0x071023, skyBottom: 0x1c3350, fog: 0x0d1a2a, cloudColor: 0x64758f, cloudScale: .3, groundScale: .5,
    sun: {x: -60, y: 74, z: -48}, blend: .92,
  },
};

const textureCache = new Map<string, THREE.CanvasTexture>();
const buildingMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function grassTexture(theme: CityTheme): THREE.CanvasTexture {
  const key = `grass-${theme.grass}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const base = `#${theme.grass.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = (i * 73) % 256, y = (i * 151 + (i >> 3) * 17) % 256;
    ctx.fillStyle = i % 5 === 0 ? '#ffffff12' : i % 7 === 0 ? '#1f4d1a20' : '#2f6d2420';
    ctx.fillRect(x, y, 2, i % 3 === 0 ? 3 : 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(320, 320);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

function facadeTexture(style: BuildingSpec['style'], color: number, floors: number, columns: number, seed: number): THREE.CanvasTexture {
  const key = `facade-${style}-${color}-${floors}-${columns}-${seed % 5}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const width = 160, height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(.72);
  const light = base.clone().lerp(new THREE.Color(0xffffff), .22);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, width, height);
  // floor bands
  for (let f = 0; f < floors; f++) {
    const y = height - (f + 1) * (height / floors);
    ctx.fillStyle = `rgba(255,255,255,${f % 2 ? .05 : .085})`;
    ctx.fillRect(0, y, width, height / floors * .16);
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.fillRect(0, y + height / floors * .14, width, 2);
  }
  const glass = style === 'office' ? '#7fb6d8' : style === 'shop' || style === 'cafe' ? '#ffe4a6' : '#90c2dd';
  const marginX = 12, marginY = 14;
  const cellW = (width - marginX * 2) / columns;
  const cellH = (height - marginY * 2) / Math.max(1, floors);
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < columns; c++) {
      const x = marginX + c * cellW + cellW * .18;
      const y = marginY + f * cellH + cellH * .18;
      const w = cellW * .64, h = cellH * .52;
      ctx.fillStyle = glass;
      ctx.globalAlpha = .82;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.fillRect(x + 1, y + 1, w * .28, Math.max(1, h * .18));
      ctx.fillStyle = 'rgba(20,40,60,.28)';
      ctx.fillRect(x + w * .62, y, 1, h);
      ctx.fillRect(x, y + h * .54, w, 1);
    }
  }
  if (style === 'shop' || style === 'cafe') {
    ctx.fillStyle = style === 'cafe' ? '#8b5e3c' : '#e56b6f';
    ctx.fillRect(0, height * .68, width, height * .07);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    for (let x = 8; x < width; x += 24) ctx.fillRect(x, height * .68, 12, height * .07);
  }
  else { ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, 0, width, 8); }
  ctx.fillStyle = `rgba(255,255,255,.16)`;
  for (let x = 0; x < width; x += 40) ctx.fillRect(x, 0, 1, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

function buildingMaterial(spec: BuildingSpec): THREE.MeshStandardMaterial {
  const floors = Math.max(2, Math.min(14, Math.round(spec.h / 3)));
  const columns = Math.max(2, Math.min(8, Math.round(spec.w / 2.2)));
  const key = `mat-${spec.color}-${spec.style}-${floors}-${columns}-${spec.seed % 5}`;
  const cached = buildingMaterialCache.get(key);
  if (cached) return cached;
  const mat = new THREE.MeshStandardMaterial({map: facadeTexture(spec.style, spec.color, floors, columns, spec.seed), roughness: .78, metalness: .06});
  buildingMaterialCache.set(key, mat);
  return mat;
}

function createBuilding(spec: BuildingSpec, far: boolean): THREE.Group {
  const g = new THREE.Group();
  g.position.set(spec.x, 0, spec.z);
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), buildingMaterial(spec));
  body.position.y = spec.h / 2;
  body.castShadow = !far;
  body.receiveShadow = true;
  g.add(body);
  const roofMat = material(spec.roof);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(spec.w + .35, .35, spec.d + .35), roofMat);
  roof.position.y = spec.h + .17;
  roof.castShadow = !far;
  g.add(roof);
  if (!far) {
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(spec.w + .5, .5, spec.d + .5), roofMat);
    parapet.position.y = spec.h - .1;
    parapet.castShadow = false;
    g.add(parapet);
    const doorMat = material(0x3d4852, {roughness: .5});
    const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.2, spec.w * .28), 2.2, .18), doorMat);
    door.position.set(0, 1.1, spec.d / 2 + .06);
    g.add(door);
    if (spec.style === 'shop' || spec.style === 'cafe') {
      const awning = new THREE.Mesh(new THREE.BoxGeometry(spec.w * .62, .16, 1.4), material(spec.style === 'cafe' ? 0x9c6b45 : 0xe56b6f));
      awning.position.set(0, 2.55, spec.d / 2 + .7);
      awning.rotation.x = -.12;
      g.add(awning);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(spec.w * .45, .6, .14), material(0xf4ecd8, {emissive: 0xf4ecd8, emissiveIntensity: .16}));
    sign.position.set(0, Math.min(spec.h - .8, 3.6), spec.d / 2 + .1);
    g.add(sign);
    const units = Math.max(1, Math.round(spec.w / 9));
    for (let i = 0; i < units; i++) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(1.6, .9, 1.4), material(0x9aa2a8, {metalness: .25, roughness: .6}));
      unit.position.set(-spec.w / 2 + 2 + i * ((spec.w - 4) / Math.max(1, units)), spec.h + .8, -spec.d * .2);
      unit.castShadow = !far;
      g.add(unit);
    }
  }
  return g;
}

function roadSegments(start: number, end: number, exclusions: number[], radius: number): GroundSegment[] {
  const sorted = [...exclusions].sort((a, b) => a - b);
  const out: GroundSegment[] = [];
  let cursor = start;
  for (const ex of sorted) {
    const lo = ex - radius, hi = ex + radius;
    if (hi <= cursor || lo >= end) continue;
    if (lo > cursor) out.push({x0: cursor, x1: Math.min(lo, end), z0: 0, z1: 0});
    cursor = Math.max(cursor, hi);
  }
  if (cursor < end) out.push({x0: cursor, x1: end, z0: 0, z1: 0});
  return out;
}

export class CityWorld {
  plan: CityPlan;
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private readonly scene: THREE.Scene;
  private theme: CityTheme;
  private world: WorldConfig;
  private buildArea: BuildArea;
  private readonly ground: THREE.Mesh;
  private readonly sky: THREE.Mesh;
  private readonly clouds = new THREE.Group();
  private readonly cloudMaterial = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: .88, depthWrite: false, fog: false});
  private readonly chunkGroup = new THREE.Group();
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly traffic: TrafficSystem;
  private chunks = new Map<string, ChunkRecord>();
  private pending: {cx: number; cz: number; far: boolean}[] = [];
  private readonly cloudData: {group: THREE.Group; speed: number; offset: THREE.Vector3}[] = [];
  private readonly sunTarget = new THREE.Object3D();
  private quality: 'low' | 'medium' | 'high' = 'high';
  private weather: WeatherProfile | null = null;
  private lighting: LightingPreset = 'day';

  constructor(scene: THREE.Scene, world: WorldConfig, size: number, theme: CityTheme) {
    this.scene = scene;
    this.world = world;
    this.theme = theme;
    this.buildArea = {x: 0, z: 0, size};
    this.plan = planCity(world, this.buildArea);
    scene.background = new THREE.Color(theme.fog);
    scene.fog = new THREE.Fog(theme.fog, 130, 330);
    const skyGeometry = new THREE.SphereGeometry(1400, 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {top: {value: new THREE.Color(theme.skyTop)}, bottom: {value: new THREE.Color(theme.skyBottom)}},
      vertexShader: 'varying vec3 vWorldPosition; void main(){ vec4 world = modelMatrix * vec4(position, 1.0); vWorldPosition = world.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition - cameraPosition).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.02, 0.8, h)), 1.0); }',
      side: THREE.BackSide, depthWrite: false,
    });
    this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.sky.renderOrder = -10;
    this.root.add(this.sky);
    this.root.add(this.clouds);
    this.clouds.renderOrder = -5;
    this.createClouds();
    const sun = new THREE.DirectionalLight(0xfff1d2, 2.35);
    sun.position.set(70, 120, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -72;
    sun.shadow.camera.right = 72;
    sun.shadow.camera.top = 72;
    sun.shadow.camera.bottom = -72;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = .02;
    sun.target = this.sunTarget;
    this.sun = sun;
    this.root.add(sun, this.sunTarget);
    this.hemisphere = new THREE.HemisphereLight(0xcfe8ff, 0x6f8f55, 1.05);
    this.ambient = new THREE.AmbientLight(0xffffff, .22);
    this.root.add(this.hemisphere, this.ambient);
    const groundMaterial = new THREE.MeshStandardMaterial({map: grassTexture(theme), roughness: 1});
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.root.add(this.ground);
    this.root.add(this.chunkGroup);
    this.traffic = new TrafficSystem(this.plan, scene);
    this.root.add(this.traffic.root);
    scene.add(this.root);
  }

  getPlan() { return this.plan; }

  private createClouds() {
    const white = this.cloudMaterial;
    for (let i = 0; i < 14; i++) {
      const group = new THREE.Group();
      const blobs = 3 + Math.floor(Math.random() * 4);
      for (let b = 0; b < blobs; b++) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 5, 10, 7), white);
        blob.position.set(b * 4.2 - blobs * 2, Math.random() * 1.6, (Math.random() - .5) * 5);
        blob.scale.set(1.2, .5, .9);
        group.add(blob);
      }
      const offset = new THREE.Vector3((Math.random() - .5) * 900, 72 + Math.random() * 55, (Math.random() - .5) * 900);
      group.position.copy(offset);
      this.clouds.add(group);
      this.cloudData.push({group, speed: .8 + Math.random() * 1.4, offset});
    }
  }

  setWeather(profile: WeatherProfile) {
    this.weather = profile;
    this.applyLighting();
  }

  setLighting(preset: LightingPreset) {
    this.lighting = preset;
    this.applyLighting();
  }

  getLighting() { return this.lighting; }

  /** Weather supplies the base sky and sun; the lighting preset tints them for time of day. */
  private applyLighting() {
    if (!this.scene.fog || !(this.scene.background instanceof THREE.Color)) return;
    const weather = this.weather;
    const theme = this.theme;
    const style = LIGHTING[this.lighting];
    const tint = (base: number, target: number) => new THREE.Color(base).lerp(new THREE.Color(target), style.blend);
    const top = tint(weather?.skyTop ?? theme.skyTop, style.skyTop);
    const bottom = tint(weather?.skyBottom ?? theme.skyBottom, style.skyBottom);
    const fogColor = tint(weather?.fog ?? theme.fog, style.fog);
    const sky = this.sky.material as THREE.ShaderMaterial;
    sky.uniforms.top.value.copy(top);
    sky.uniforms.bottom.value.copy(bottom);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(fogColor);
    const rain = weather?.rain ?? 0;
    const shrink = this.lighting === 'night' ? .84 : this.lighting === 'dusk' ? .94 : 1;
    fog.near = (rain >= .9 ? 55 : rain > 0 ? 85 : 130) * shrink;
    fog.far = (rain >= .9 ? 205 : rain > 0 ? 265 : 330) * shrink;
    (this.scene.background as THREE.Color).copy(fogColor);
    this.sun.color.setHex(style.sunColor);
    this.sun.intensity = (weather?.sunIntensity ?? 2.35) * style.sunScale;
    this.hemisphere.color.setHex(this.lighting === 'night' ? 0x8fa8d8 : this.lighting === 'dusk' ? 0xffd6b8 : 0xcfe8ff);
    this.hemisphere.groundColor.setHex(this.lighting === 'night' ? 0x2c3a34 : 0x6f8f55);
    this.hemisphere.intensity = 1.05 * (rain > 0 ? .62 : 1) * style.hemiScale;
    this.ambient.intensity = style.ambient + rain * style.ambientRain;
    this.cloudMaterial.color.setHex(style.cloudColor);
    this.cloudMaterial.opacity = (weather?.cloudOpacity ?? .88) * style.cloudScale;
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    groundMat.color.setScalar((1 - rain * .26) * style.groundScale);
  }

  setBuildArea(size: number, world: WorldConfig, theme: CityTheme) {
    const planChanged = size !== this.buildArea.size || world.seed !== this.world.seed || world.chunkSize !== this.world.chunkSize || world.roadSpacing !== this.world.roadSpacing;
    const themeChanged = theme.name !== this.theme.name;
    this.buildArea = {x: 0, z: 0, size};
    this.world = world;
    this.theme = theme;
    if (themeChanged) {
      const groundMat = this.ground.material as THREE.MeshStandardMaterial;
      groundMat.map = grassTexture(theme);
      groundMat.needsUpdate = true;
      this.applyLighting();
    }
    if (planChanged || themeChanged) {
      this.clearChunks();
      this.pending = [];
      this.plan = planCity(world, this.buildArea);
      this.traffic.setPlan(this.plan);
    }
  }

  private clearChunks() {
    for (const record of this.chunks.values()) this.chunkGroup.remove(record.group);
    this.chunks.clear();
  }

  private buildChunk(spec: ChunkSpec) {
    const g = new THREE.Group();
    const theme = this.theme;
    const roadMat = material(theme.road, {roughness: .94});
    const sidewalkMat = material(theme.sidewalk, {roughness: .9});
    const lineMat = material(0xf4f1dc, {roughness: .8});
    const crossMat = material(0xfbf8ee, {roughness: .8});
    const lawnMat = material(theme.grass, {roughness: 1});
    const parkMat = material(theme.grassAlt, {roughness: 1});
    const plazaMat = material(theme.plaza, {roughness: .96});
    const parkingMat = material(theme.parking, {roughness: .95});
    const roadHalf = this.plan.roadWidth / 2;
    const sidewalk = this.plan.sidewalkWidth;
    const y = {ground: .015, road: .05, sidewalk: .055, line: .07, cross: .075};
    const addPlane = (rect: GroundSegment, mat: THREE.Material, height: number) => {
      if (rect.x1 - rect.x0 <= .01 || rect.z1 - rect.z0 <= .01) return;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.z1 - rect.z0), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((rect.x0 + rect.x1) / 2, height, (rect.z0 + rect.z1) / 2);
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    for (const cell of spec.cells) {
      const clipped = clipRect(cell.rect, {x0: spec.x0, z0: spec.z0, x1: spec.x1, z1: spec.z1});
      if (!clipped) continue;
      const mat = cell.kind === 'park' ? parkMat : cell.kind === 'parking' ? parkingMat : cell.kind === 'plaza' ? plazaMat : cell.kind === 'buildings' ? material(theme.plaza, {roughness: .95}) : lawnMat;
      addPlane(clipped, mat, y.ground);
      for (const path of cell.paths) {
        const pathClip = clipRect(path, {x0: spec.x0, z0: spec.z0, x1: spec.x1, z1: spec.z1});
        if (pathClip) addPlane(pathClip, sidewalkMat, y.ground + .012);
      }
      if (!spec.far) {
        for (const stall of cell.stalls) {
          if (stall.x < spec.x0 || stall.x >= spec.x1 || stall.z < spec.z0 || stall.z >= spec.z1) continue;
          const line = new THREE.Mesh(new THREE.BoxGeometry(.08, .015, 4.4), lineMat);
          line.position.set(stall.x, y.ground + .02, stall.z);
          g.add(line);
        }
        for (const car of cell.parkedCars) {
          if (car.x < spec.x0 || car.x >= spec.x1 || car.z < spec.z0 || car.z >= spec.z1) continue;
          const rig = createCar(car.color, false);
          rig.group.position.set(car.x, y.ground, car.z);
          rig.group.rotation.y = car.rotation;
          g.add(rig.group);
        }
      }
      for (const building of cell.buildings) {
        if (building.x + building.w / 2 < spec.x0 || building.x - building.w / 2 >= spec.x1) continue;
        if (building.z + building.d / 2 < spec.z0 || building.z - building.d / 2 >= spec.z1) continue;
        g.add(createBuilding(building, spec.far));
      }
    }
    // Roads and sidewalks
    for (const rx of spec.roadsX) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(this.plan.roadWidth, .06, spec.z1 - spec.z0 + .01), roadMat);
      road.position.set(rx, y.road, (spec.z0 + spec.z1) / 2);
      road.receiveShadow = true;
      g.add(road);
      const segments = roadSegments(spec.z0, spec.z1, this.plan.roadsZ, roadHalf + sidewalk);
      for (const segment of segments) {
        for (const sign of [-1, 1]) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(sidewalk, .05, segment.x1 - segment.x0), sidewalkMat);
          strip.position.set(rx + sign * (roadHalf + sidewalk / 2), y.sidewalk, (segment.x0 + segment.x1) / 2);
          strip.receiveShadow = true;
          g.add(strip);
        }
        for (let z = segment.x0 + 2; z < segment.x1 - 1; z += 7) {
          const dash = new THREE.Mesh(new THREE.BoxGeometry(.16, .015, 3.2), lineMat);
          dash.position.set(rx, y.line, z);
          g.add(dash);
        }
      }
      for (const sign of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(.12, .015, spec.z1 - spec.z0), lineMat);
        edge.position.set(rx + sign * (roadHalf - .45), y.line, (spec.z0 + spec.z1) / 2);
        g.add(edge);
      }
    }
    for (const rz of spec.roadsZ) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(spec.x1 - spec.x0 + .01, .06, this.plan.roadWidth), roadMat);
      road.position.set((spec.x0 + spec.x1) / 2, y.road + .001, rz);
      road.receiveShadow = true;
      g.add(road);
      const segments = roadSegments(spec.x0, spec.x1, this.plan.roadsX, roadHalf + sidewalk);
      for (const segment of segments) {
        for (const sign of [-1, 1]) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(segment.x1 - segment.x0, .05, sidewalk), sidewalkMat);
          strip.position.set((segment.x0 + segment.x1) / 2, y.sidewalk, rz + sign * (roadHalf + sidewalk / 2));
          strip.receiveShadow = true;
          g.add(strip);
        }
        for (let x = segment.x0 + 2; x < segment.x1 - 1; x += 7) {
          const dash = new THREE.Mesh(new THREE.BoxGeometry(3.2, .015, .16), lineMat);
          dash.position.set(x, y.line + .001, rz);
          g.add(dash);
        }
      }
      for (const sign of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(spec.x1 - spec.x0, .015, .12), lineMat);
        edge.position.set((spec.x0 + spec.x1) / 2, y.line + .001, rz + sign * (roadHalf - .45));
        g.add(edge);
      }
    }
    // Crosswalks at intersections owned by this chunk
    for (const rx of spec.roadsX) {
      for (const rz of spec.roadsZ) {
        if (rx < spec.x0 || rx >= spec.x1 || rz < spec.z0 || rz >= spec.z1) continue;
        for (let i = -3; i <= 3; i++) {
          const stripeX = new THREE.Mesh(new THREE.BoxGeometry(.55, .016, 2.4), crossMat);
          stripeX.position.set(rx + i * 1.15, y.cross, rz + roadHalf + 1.6);
          g.add(stripeX);
          const stripeZ = new THREE.Mesh(new THREE.BoxGeometry(2.4, .016, .55), crossMat);
          stripeZ.position.set(rx + roadHalf + 1.6, y.cross, rz + i * 1.15);
          g.add(stripeZ);
        }
      }
    }
    // Trees (instanced), props
    const treeList = spec.apronTrees;
    if (treeList.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .26, 1.8, 6), material(0x8a6a4a), treeList.length);
      const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material(0xffffff, {flatShading: true}), treeList.length * 2);
      const matrix = new THREE.Matrix4();
      const color = new THREE.Color();
      treeList.forEach((tree, i) => {
        matrix.makeTranslation(tree.x, .9 * tree.scale, tree.z);
        matrix.scale(new THREE.Vector3(tree.scale, tree.scale, tree.scale));
        trunk.setMatrixAt(i, matrix);
        matrix.makeTranslation(tree.x, 2.2 * tree.scale, tree.z);
        matrix.scale(new THREE.Vector3(1.05 * tree.scale, 1.0 * tree.scale, 1.05 * tree.scale));
        canopy.setMatrixAt(i * 2, matrix);
        matrix.makeTranslation(tree.x + .3 * tree.scale, 2.75 * tree.scale, tree.z - .2 * tree.scale);
        matrix.scale(new THREE.Vector3(.68 * tree.scale, .58 * tree.scale, .68 * tree.scale));
        canopy.setMatrixAt(i * 2 + 1, matrix);
        color.setHex(tree.tint);
        canopy.setColorAt(i * 2, color);
        canopy.setColorAt(i * 2 + 1, color);
      });
      trunk.castShadow = !spec.far;
      canopy.castShadow = !spec.far;
      trunk.receiveShadow = true;
      canopy.receiveShadow = true;
      trunk.instanceMatrix.needsUpdate = true;
      canopy.instanceMatrix.needsUpdate = true;
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
      g.add(trunk, canopy);
    }
    if (!spec.far) {
      const props = [...spec.props];
      for (const cell of spec.cells) for (const prop of cell.props) {
        if (prop.x >= spec.x0 && prop.x < spec.x1 && prop.z >= spec.z0 && prop.z < spec.z1) props.push(prop);
      }
      for (const prop of props) {
        const mesh = createCityProp(prop.kind, prop.tint, prop.rotation);
        mesh.position.set(prop.x, 0, prop.z);
        g.add(mesh);
      }
    }
    this.chunkGroup.add(g);
    this.chunks.set(spec.key, {group: g, spec, far: spec.far});
  }

  setQuality(quality: 'low' | 'medium' | 'high', shadows: boolean) {
    this.quality = quality;
    this.sun.castShadow = shadows;
    const mapSize = quality === 'low' ? 1024 : quality === 'medium' ? 1536 : 2048;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
      this.sun.shadow.needsUpdate = true;
    }
    const visibleClouds = quality === 'low' ? 6 : 10;
    this.cloudData.forEach((cloud, index) => { cloud.group.visible = index < visibleClouds; });
    this.traffic.setQuality(quality);
  }

  update(dt: number, target: THREE.Vector3, camera: THREE.Camera, distance: number) {
    const chunkSize = this.world.chunkSize;
    const maxRadius = this.quality === 'low' ? 3 : this.quality === 'medium' ? 4 : 5;
    const radius = Math.max(2, Math.min(maxRadius, Math.ceil(distance / chunkSize) + 1));
    const centerX = Math.floor(target.x / chunkSize), centerZ = Math.floor(target.z / chunkSize);
    const desired = new Set<string>();
    for (let cx = centerX - radius; cx <= centerX + radius; cx++) {
      for (let cz = centerZ - radius; cz <= centerZ + radius; cz++) {
        const key = chunkKey(cx, cz);
        desired.add(key);
        if (!this.chunks.has(key) && !this.pending.some(p => p.cx === cx && p.cz === cz)) {
          const far = Math.hypot(cx - centerX, cz - centerZ) > radius - .5;
          this.pending.push({cx, cz, far});
        }
      }
    }
    for (const [key, record] of this.chunks) {
      if (!desired.has(key)) {
        this.chunkGroup.remove(record.group);
        this.chunks.delete(key);
      }
    }
    let built = 0;
    const buildBudget = this.quality === 'low' ? 1 : 2;
    while (this.pending.length && built < buildBudget) {
      const next = this.pending.shift()!;
      if (this.chunks.has(chunkKey(next.cx, next.cz))) continue;
      this.pending.sort((a, b) => Math.hypot(a.cx - centerX, a.cz - centerZ) - Math.hypot(b.cx - centerX, b.cz - centerZ));
      const spec = generateChunk(this.world, this.buildArea, next.cx, next.cz, next.far, this.theme);
      this.buildChunk(spec);
      built++;
    }
    const sun = LIGHTING[this.lighting].sun;
    this.sunTarget.position.set(target.x, 0, target.z);
    this.sun.position.set(target.x + sun.x, sun.y, target.z + sun.z);
    this.sun.target.updateMatrixWorld();
    this.ground.position.set(Math.round(target.x / 40) * 40, 0, Math.round(target.z / 40) * 40);
    this.sky.position.copy(camera.position);
    for (const cloud of this.cloudData) {
      cloud.group.position.x += cloud.speed * dt;
      if (cloud.group.position.x - target.x > 460) cloud.group.position.x -= 920;
      if (cloud.group.position.x - target.x < -460) cloud.group.position.x += 920;
      if (cloud.group.position.z - target.z > 460) cloud.group.position.z -= 920;
      if (cloud.group.position.z - target.z < -460) cloud.group.position.z += 920;
    }
    this.traffic.update(dt, target);
  }

  ambientLoops(): {x: number; z: number}[][] { return sidewalkLoops(this.plan); }

  dispose() {
    this.clearChunks();
    this.traffic.dispose();
    this.scene.remove(this.root);
    this.scene.fog = null;
  }
}
