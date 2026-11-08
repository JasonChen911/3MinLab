import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {addStadiumSurface} from './world/stadium';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {
  CATALOG, bounds, itemCost, simulationItemCost, itemHeight, placement,
  type Item, type Kind, type Layout, type PersonSave, type SimulationState,
} from './game';
import {disposeAssets, kindHeight, model} from './world/models';
import {CityWorld, type LightingPreset} from './world/city';
import {PeopleSystem, type PersonInfo} from './world/people';
import {normalizeWorld, themeForScene} from './world/worldgen';
import {applyVenueModes, buildVenueRoom, venueCameraPreset, type VenueRoom} from './world/venue3d';
import {weatherProfile} from './world/weather';
import {DebugLayer, type DebugStats} from './world/debug';
import {ZoneLayer} from './world/zone3d';
import {
  CAMERA_LIMITS, cameraSpeedForDistance, fitCameraPosition, movementDirection,
} from './world/camera';
import type {AnalysisMark, PreviewGhost} from './analysis';

export type CameraAction = {
  kind: 'reset' | 'center' | 'fit' | 'zoom-in' | 'zoom-out' | 'focus';
  token: number; target?: {x: number; z: number}; distance?: number;
};
export type Tool = 'select' | 'observe' | 'build' | 'road' | 'decor' | 'delete';
export type Quality = 'low' | 'medium' | 'high';

export function qualityPixelRatio(quality: Quality): number {
  if (quality === 'low') return 1;
  if (quality === 'medium') return Math.min(1.35, devicePixelRatio);
  return Math.min(2, devicePixelRatio);
}

type Props = {
  layout: Layout;
  state: SimulationState | null;
  selected: string;
  selectedMany: string[];
  place: Kind | null;
  tool: Tool;
  mode: 'build' | 'simulate';
  simSpeed: number;
  cameraAction: CameraAction | null;
  quality: Quality;
  shadows: boolean;
  sensitivity: number;
  panSensitivity:number;
  zoomSensitivity:number;
  invertRotation:boolean;
  snap: boolean;
  personSelected: string;
  debug: boolean;
  replayPeople: PersonSave[] | null;
  restorePeople: PersonSave[] | null;
  analysisMarks: AnalysisMark[];
  analysisGhosts: PreviewGhost[];
  lighting: LightingPreset;
  showcase: boolean;
  autoRotate: boolean;
  onSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  onEdit: (id: string) => void;
  onPlace: (kind: Kind, x: number, z: number, rotation: number) => void;
  onMove: (id: string, x: number, z: number) => boolean;
  onBatchMove: (ids: string[], dx: number, dz: number) => boolean;
  onBatchRotate: (ids: string[], steps: number) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onPreview: (message: string) => void;
  onPersonSelect: (id: string) => void;
  onPersonInfo: (info: PersonInfo | null) => void;
  onPeopleSnapshot: (people: PersonSave[] | null) => void;
  onPeopleProvider: (provider: (() => PersonSave[] | null) | null) => void;
  onNudge: (id: string, dx: number, dz: number) => void;
  onDebugStats: (stats: DebugStats | null) => void;
  onCaptureReady: (capture: (() => string | null) | null) => void;
};

interface CameraTween {
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  time: number;
  duration: number;
}

interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  city: CityWorld;
  people: PeopleSystem;
  zones: ZoneLayer;
  venueRoot: THREE.Group;
  room: VenueRoom | null;
  roomKey: string;
  ground: THREE.Mesh;
  grid: THREE.GridHelper;
  facilities: THREE.Group;
  environment: THREE.Group;
  selection: THREE.Group;
  hoverOutline: THREE.Group;
  analysis: THREE.Group;
  lamps: THREE.Group;
  ghost: THREE.Group | null;
  ghostKey: string;
  ray: THREE.Raycaster;
  pointer: THREE.Vector2;
  drag: string | null;
  dragCandidate: string | null;
  dragIds: string[];
  dragOrigins: Map<string, {x: number; z: number}>;
  dragStart: {x: number; z: number} | null;
  down: {x: number; y: number; button: number} | null;
  rightStart: {x: number; y: number} | null;
  marquee: HTMLDivElement;
  marqueeStart: {x: number; y: number} | null;
  marqueeActive: boolean;
  ghostAt: THREE.Vector3 | null;
  ghostRotation: number;
  dragKind: Kind | null;
  rightDown: boolean;
  spaceDown: boolean;
  hover: string;
  keys: Set<string>;
  tween: CameraTween | null;
  clock: THREE.Clock;
  pointerInside: boolean;
  personTimer: number;
  peopleTimer: number;
  debug: DebugLayer;
  debugTimer: number;
  fpsFrames: number;
  fpsTime: number;
  fps: number;
  rain: THREE.Points;
  rainPositions: Float32Array;
}

const themeCacheKey = (layout: Layout) => [
  layout.activity.scene, layout.size, layout.terrain ?? '',
  normalizeWorld(layout.world, layout.params?.seed ?? 20261106).seed,
].join('|');

function buildSurfaceTexture(terrain: Layout['terrain'], theme: ReturnType<typeof themeForScene>, size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const base = terrain === 'plaza' ? theme.plaza : terrain === 'track' ? 0x819d79 : theme.grass;
  ctx.fillStyle = `#${base.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 256, 256);
  if (terrain === 'plaza') {
    ctx.strokeStyle = 'rgba(90,80,60,.22)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    for (let y = 0; y <= 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
    for (let i = 0; i < 90; i++) { ctx.fillStyle = i % 2 ? '#00000010' : '#ffffff12'; ctx.fillRect((i * 53) % 256, (i * 97) % 256, 5, 5); }
  } else {
    if (terrain !== 'track') for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = (y / 32) % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,50,0,.045)';
      ctx.fillRect(0, y, 256, 32);
    }
    for (let i = 0; i < 1800; i++) {
      const x = (i * 61) % 256, y = (i * 149 + (i >> 4) * 13) % 256;
      ctx.fillStyle = terrain === 'track' ? (i % 9 === 0 ? '#ffffff0c' : '#244a2410') : i % 9 === 0 ? '#ffffff18' : i % 11 === 0 ? '#1d511a20' : '#2c6b221c';
      ctx.fillRect(x, y, 2, i % 4 === 0 ? 3 : 1);
    }
    if (terrain !== 'track') {
      for (let i = 0; i < 26; i++) {
        const x = (i * 89 + 17) % 256, y = (i * 47 + 61) % 256;
        ctx.fillStyle = ['#ff7fa2', '#ffd166', '#ffffff'][i % 3];
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(2, Math.round(size / 6)), Math.max(2, Math.round(size / 6)));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function clearUniqueGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose());
      }
    });
  }
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && typeof element.closest === 'function' && !!element.closest('input,textarea,select,[contenteditable]');
}

function disposeGroup(root: THREE.Object3D) {
  root.traverse(o => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => m.dispose());
    }
  });
}

function snapValue(value: number, enabled: boolean): number {
  return enabled ? Math.round(value) : Math.round(value * 100) / 100;
}

/** Function view dims normal facilities so circulation zones and people stand out. */
function dimFacilities(root: THREE.Object3D, dim: boolean) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (dim) {
        if (material.userData.zoneDim || material.transparent) continue;
        material.userData.zoneDim = true;
        material.transparent = true;
        material.opacity = .3;
        material.depthWrite = false;
        material.needsUpdate = true;
      } else if (material.userData.zoneDim) {
        material.userData.zoneDim = false;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    }
  });
}

function outlineFor(item: Item, color: number, opacity: number, flat = false): THREE.Group {
  const group = new THREE.Group();
  const b = bounds(item);
  const height = Math.max(2, kindHeight(item.kind) * itemHeight(item));
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w + .28, height, b.d + .28)),
    new THREE.LineBasicMaterial({color, transparent: true, opacity}),
  );
  box.position.set(item.x, height / 2, item.z);
  box.rotation.y = item.rotation * Math.PI / 180;
  group.add(box);
  if (!flat) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(b.w, b.d) * .52, Math.max(b.w, b.d) * .58, 32),
      new THREE.MeshBasicMaterial({color, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false}),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(item.x, .085, item.z);
    group.add(ring);
  }
  return group;
}

export default function Scene3D({layout, state, selected, selectedMany, place, tool, mode, simSpeed, cameraAction, quality, shadows, sensitivity, panSensitivity, zoomSensitivity, invertRotation, snap, personSelected, debug, replayPeople, restorePeople, analysisMarks, analysisGhosts, lighting, showcase, autoRotate, onSelect, onSelectMany, onEdit, onPlace, onMove, onBatchMove, onBatchRotate, onDelete, onDeleteMany, onPreview, onPersonSelect, onPersonInfo, onPeopleSnapshot, onPeopleProvider, onNudge, onDebugStats, onCaptureReady}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const callbackSource = {layout, state, selected, selectedMany, personSelected, place, tool, mode, simSpeed, snap, showcase, replayPeople, onSelect, onSelectMany, onEdit, onPlace, onMove, onBatchMove, onBatchRotate, onDelete, onDeleteMany, onPreview, onPersonSelect, onPersonInfo, onPeopleSnapshot, onPeopleProvider, onNudge, onDebugStats, onCaptureReady};
  const callbacks = useRef(callbackSource);
  callbacks.current = callbackSource;
  const setupKey = useRef('');

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, .1, 2200);
    camera.up.set(0, 1, 0);
    const opening = venueCameraPreset(layout);
    camera.position.copy(opening.position);
    const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true});
    renderer.setPixelRatio(qualityPixelRatio(quality));
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    parent.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .085;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = CAMERA_LIMITS.minPolar;
    controls.maxPolarAngle = CAMERA_LIMITS.maxPolar;
    controls.minDistance = CAMERA_LIMITS.minDistance;
    controls.maxDistance = CAMERA_LIMITS.maxDistance;
    controls.rotateSpeed = .62 * sensitivity * (invertRotation?-1:1);
    controls.panSpeed = .9 * panSensitivity;
    controls.zoomSpeed = .9 * zoomSensitivity;
    controls.touches = {ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE};
    controls.mouseButtons = {LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE};
    controls.target.copy(opening.target);

    const theme = themeForScene(layout.activity.scene);
    const worldConfig = normalizeWorld(layout.world, layout.params?.seed ?? 20261106);
    const city = new CityWorld(scene, worldConfig, layout.size, theme);
    const people = new PeopleSystem(scene);
    people.setLayout(layout);
    people.setAmbientLoops(city.ambientLoops());

    const rainCount = 1600;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = camera.position.x + (Math.random() - .5) * 110;
      rainPositions[i * 3 + 1] = Math.random() * 60;
      rainPositions[i * 3 + 2] = camera.position.z + (Math.random() - .5) * 110;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMaterial = new THREE.PointsMaterial({color: 0xbdd6e8, size: .22, transparent: true, opacity: 0, depthWrite: false});
    const rain = new THREE.Points(rainGeometry, rainMaterial);
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(layout.size, layout.size), new THREE.MeshStandardMaterial({roughness: 1}));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = .035;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(layout.size, layout.size, 0x4f7d63, 0x9cbea6);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = .28;
    grid.position.y = .06;
    grid.visible = !showcase;
    scene.add(grid);

    const facilities = new THREE.Group();
    const environment = new THREE.Group();
    const venueRoot = new THREE.Group();
    const selection = new THREE.Group();
    const hoverOutline = new THREE.Group();
    const analysis = new THREE.Group();
    const lamps = new THREE.Group();
    const debugLayer = new DebugLayer();
    debugLayer.setVisible(debug);
    debugLayer.build(layout);
    const zoneLayer = new ZoneLayer();
    zoneLayer.setVisible(layout.viewMode === 'function');
    if (layout.viewMode === 'function') zoneLayer.build(layout);
    scene.add(environment, venueRoot, facilities, selection, hoverOutline, analysis, lamps, debugLayer.root, zoneLayer.root);

    const marquee = document.createElement('div');
    marquee.className = 'v3-marquee';
    marquee.style.display = 'none';
    parent.appendChild(marquee);

    const current: World = {
      scene, camera, renderer, controls, city, people, zones: zoneLayer, venueRoot, room: null, roomKey: '', ground, grid, facilities, environment,
      selection, hoverOutline, analysis, lamps, ghost: null, ghostKey: '', ray: new THREE.Raycaster(), pointer: new THREE.Vector2(),
      drag: null, dragCandidate: null, dragIds: [], dragOrigins: new Map(), dragStart: null, down: null, dragKind: null, rightDown: false, spaceDown: false, hover: '', keys: new Set<string>(),
      rightStart: null, marquee, marqueeStart: null, marqueeActive: false, ghostAt: null, ghostRotation: 0,
      tween: null, clock: new THREE.Clock(), pointerInside: false, personTimer: 0, peopleTimer: 0, debug: debugLayer, debugTimer: 0, fpsFrames: 0, fpsTime: 0, fps: 0,
      rain, rainPositions,
    };
    world.current = current;
    callbacks.current.onPeopleProvider(() => {
      const system = world.current?.people;
      if (!system) return null;
      const snapshot = system.snapshot();
      return snapshot.length ? snapshot : null;
    });
    setupKey.current = themeCacheKey(layout);
    const capture = () => {
      try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      } catch { return null; }
    };
    callbacks.current.onCaptureReady(capture);

    const resize = () => {
      const width = parent.clientWidth, height = parent.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / (height || 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    const groundPoint = (event: {clientX: number; clientY: number}) => {
      const rect = renderer.domElement.getBoundingClientRect();
      camera.updateMatrixWorld();
      ground.updateMatrixWorld(true);
      current.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      current.ray.setFromCamera(current.pointer, camera);
      return current.ray.intersectObject(ground)[0]?.point;
    };

    const findItem = (event: {clientX: number; clientY: number}): {id: string; object: THREE.Object3D} | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      camera.updateMatrixWorld();
      facilities.updateMatrixWorld(true);
      current.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      current.ray.setFromCamera(current.pointer, camera);
      const hits = current.ray.intersectObjects(facilities.children, true);
      let object: THREE.Object3D | null = hits[0]?.object ?? null;
      while (object && !object.userData.id) object = object.parent;
      return object?.userData.id ? {id: object.userData.id, object} : null;
    };

    const personAt = (event: {clientX: number; clientY: number}): string => {
      const rect = renderer.domElement.getBoundingClientRect();
      camera.updateMatrixWorld();
      current.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      current.ray.setFromCamera(current.pointer, camera);
      return people.pick(current.ray);
    };

    const placementActive = () => callbacks.current.mode === 'build' && !!callbacks.current.place && callbacks.current.tool !== 'select' && callbacks.current.tool !== 'delete' && callbacks.current.tool !== 'observe';

    const setGhost = (kind: Kind | null, point?: THREE.Vector3) => {
      const w = world.current;
      if (!w) return;
      const c = callbacks.current;
      const x = point ? snapValue(point.x, c.snap) : 0;
      const z = point ? snapValue(point.z, c.snap) : 0;
      const key = kind && point && c.mode === 'build'
        ? `${kind}:${x}:${z}:${c.snap}:${w.ghostRotation}:${c.layout.items.length}:${c.layout.activity.budget}:${c.layout.budgetMode}:${c.selected}`
        : '';
      if (key === w.ghostKey) return;
      w.ghostKey = key;
      if (w.ghost) {
        w.scene.remove(w.ghost);
        w.ghost = null;
      }
      if (!kind || !point || c.mode !== 'build') return;
      w.ghostAt = point;
      const candidate: Item = {id: 'ghost', kind, x, z, rotation: w.ghostRotation};
      const result = placement(c.layout, candidate, c.layout.budgetMode ?? 'unlimited');
      const color = result.level === 'invalid' ? 0xd94f45 : result.level === 'warning' ? 0xe7b44d : 0x57c98a;
      const ghost = model(candidate, color);
      ghost.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
      const box = bounds(candidate);
      const halfW = box.w / 2 + .34, halfD = box.d / 2 + .34;
      const corners = [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]].map(([px, pz]) => new THREE.Vector3(px, .055, pz));
      const footprint = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({color, transparent: true, opacity: .85}));
      ghost.add(footprint);
      const snapRing = new THREE.Mesh(new THREE.RingGeometry(.16, .24, 24), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false}));
      snapRing.rotation.x = -Math.PI / 2;
      snapRing.position.y = .06;
      ghost.add(snapRing);
      const facing = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, .06, 0), new THREE.Vector3(0, .06, Math.max(.9, box.d / 2))]), new THREE.LineBasicMaterial({color, transparent: true, opacity: .9}));
      facing.rotation.y = THREE.MathUtils.degToRad(candidate.rotation);
      ghost.add(facing);
      w.scene.add(ghost);
      w.ghost = ghost;
      callbacks.current.onPreview(`${result.reason} · ${box.w.toFixed(1)}×${box.d.toFixed(1)}m · ${candidate.rotation}°（R 旋转）`);
    };

    const updateHover = (event: {clientX: number; clientY: number}) => {
      if (current.rightDown || current.spaceDown || current.down?.button === 1 || current.marqueeActive) return;
      if (callbacks.current.tool === 'observe' || callbacks.current.mode === 'simulate') {
        if (current.hover) {
          current.hover = '';
          clearUniqueGroup(current.hoverOutline);
          callbacks.current.onPreview('');
        }
        renderer.domElement.style.cursor = 'default';
        return;
      }
      const hit = findItem(event);
      const id = hit?.id ?? '';
      if (id === current.hover) return;
      current.hover = id;
      clearUniqueGroup(current.hoverOutline);
      const item = callbacks.current.layout.items.find(i => i.id === id);
      if (!item) {
        renderer.domElement.style.cursor = placementActive() ? 'crosshair' : 'default';
        if (!placementActive()) callbacks.current.onPreview('');
        return;
      }
      const deleting = callbacks.current.tool === 'delete';
      const color = deleting ? 0xd94f45 : item.locked ? 0xe0a52e : 0xffffff;
      const outline = outlineFor(item, color, .85, true);
      current.hoverOutline.add(outline);
      renderer.domElement.style.cursor = deleting ? 'not-allowed' : item.locked ? 'default' : 'grab';
      callbacks.current.onPreview(`${CATALOG[item.kind].name} · ${callbacks.current.layout.operatingMode==='simulation'?'现实成本 ¥'+simulationItemCost(item)+'（未报价项按未知暂计）':'游戏金币 '+itemCost(item)} · ${item.locked ? '已锁定' : deleting ? '点击删除' : '拖动移动，双击编辑，右键旋转，Shift 点击多选'}`);
    };

    const hideMarquee = () => {
      current.marquee.style.display = 'none';
      current.marqueeStart = null;
      current.marqueeActive = false;
    };

    const revertDrag = () => {
      for (const [id, origin] of current.dragOrigins) {
        const object = current.facilities.children.find(o => o.userData.id === id);
        if (object) object.position.set(origin.x, 0, origin.z);
      }
    };

    const cancelInteraction = () => {
      if (current.drag) revertDrag();
      current.drag = null;
      current.dragCandidate = null;
      current.dragIds = [];
      current.dragOrigins.clear();
      current.dragStart = null;
      current.down = null;
      current.rightStart = null;
      current.rightDown = false;
      hideMarquee();
      clearUniqueGroup(current.selection);
      clearUniqueGroup(current.hoverOutline);
      current.hover = '';
      controls.enabled = true;
      renderer.domElement.style.cursor = 'default';
    };

    const startDrag = (id: string, event: PointerEvent) => {
      const c = callbacks.current;
      const anchor = c.layout.items.find(i => i.id === id);
      if (!anchor || anchor.locked || c.mode !== 'build') {
        if (anchor?.locked) c.onPreview('该设施已锁定，请先在属性面板解锁。');
        return;
      }
      const requested = c.selectedMany.includes(id) && c.selectedMany.length > 1 ? c.selectedMany : [id];
      const ids = requested.filter(candidate => {
        const item = c.layout.items.find(i => i.id === candidate);
        return item && !item.locked;
      });
      if (!ids.length) return;
      current.drag = id;
      current.dragIds = ids;
      current.dragOrigins.clear();
      for (const candidate of ids) {
        const item = c.layout.items.find(i => i.id === candidate);
        if (item) current.dragOrigins.set(candidate, {x: item.x, z: item.z});
      }
      current.dragCandidate = null;
      current.dragStart = {x: anchor.x, z: anchor.z};
      controls.enabled = false;
      try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* synthetic pointer or lost capture */ }
      renderer.domElement.style.cursor = 'grabbing';
    };

    let groundPan: {x:number;y:number}|null=null;
    const onPointerDown = (event: PointerEvent) => {
      current.down = {x: event.clientX, y: event.clientY, button: event.button};
      if (event.button === 2) {
        current.rightDown = true;
        current.rightStart = {x: event.clientX, y: event.clientY};
        return;
      }
      if (event.button !== 0 || current.spaceDown) return;
      const c = callbacks.current;
      if (c.tool === 'observe') return;
      const hit = findItem(event);
      if (c.mode === 'build' && c.tool === 'delete') {
        if (!hit) return;
        const item = c.layout.items.find(i => i.id === hit.id);
        if (!item) return;
        if (item.locked) c.onPreview('该设施已锁定，无法删除。');
        else c.onDelete(item.id);
        return;
      }
      if (placementActive()) return;
      if (!hit) {
        const person = personAt(event);
        c.onPersonSelect(person);
        if (person) { c.onSelect(''); c.onSelectMany([]); return; }
        if (c.tool === 'select') {
          c.onSelect('');
          if (c.mode === 'build' && event.shiftKey) {
            const rect = renderer.domElement.getBoundingClientRect();
            current.marqueeStart = {x: event.clientX - rect.left, y: event.clientY - rect.top};
            try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* synthetic pointer or lost capture */ }
          } else {
            groundPan={x:event.clientX,y:event.clientY};
            try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* synthetic pointer or lost capture */ }
            renderer.domElement.style.cursor='grabbing';
          }
        }
        return;
      }
      c.onPersonSelect('');
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const ids = c.selectedMany;
        const next = ids.includes(hit.id) ? ids.filter(id => id !== hit.id) : [...ids, hit.id];
        c.onSelectMany(next);
        c.onSelect(next.includes(hit.id) ? hit.id : '');
        c.onPreview(`已选择 ${next.length} 项设施。Shift 点击增减，拖动可批量移动。`);
        return;
      }
      if (!c.selectedMany.includes(hit.id)) c.onSelectMany([hit.id]);
      c.onSelect(hit.id);
      if (c.tool === 'select') current.dragCandidate = hit.id;
    };

    const onPointerMove = (event: PointerEvent) => {
      current.pointerInside = true;
      if(groundPan&&current.down?.button===0){
        const dx=event.clientX-groundPan.x,dy=event.clientY-groundPan.y;
        groundPan={x:event.clientX,y:event.clientY};
        camera.updateMatrixWorld();
        const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();
        const back=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,2);back.y=0;back.normalize();
        const distance=controls.getDistance()*.0016*(controls.panSpeed/.9);
        const shift=right.multiplyScalar(-dx*distance).addScaledVector(back,-dy*distance);
        camera.position.add(shift);controls.target.add(shift);controls.update();
        return;
      }
      if (current.marqueeStart && current.down && current.down.button === 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = event.clientX - rect.left, y = event.clientY - rect.top;
        if (!current.marqueeActive && Math.hypot(x - current.marqueeStart.x, y - current.marqueeStart.y) > 6) current.marqueeActive = true;
        if (current.marqueeActive) {
          const left = Math.min(current.marqueeStart.x, x), top = Math.min(current.marqueeStart.y, y);
          current.marquee.style.display = 'block';
          current.marquee.style.left = `${left}px`;
          current.marquee.style.top = `${top}px`;
          current.marquee.style.width = `${Math.abs(x - current.marqueeStart.x)}px`;
          current.marquee.style.height = `${Math.abs(y - current.marqueeStart.y)}px`;
          renderer.domElement.style.cursor = 'crosshair';
          return;
        }
      }
      if (!current.drag && current.dragCandidate && current.down && current.down.button === 0) {
        if (Math.hypot(event.clientX - current.down.x, event.clientY - current.down.y) > 4) startDrag(current.dragCandidate, event);
      }
      if (current.drag) {
        const point = groundPoint(event);
        if (!point || !current.dragStart) return;
        const dx = snapValue(point.x, callbacks.current.snap) - current.dragStart.x;
        const dz = snapValue(point.z, callbacks.current.snap) - current.dragStart.z;
        for (const [id, origin] of current.dragOrigins) {
          const object = current.facilities.children.find(o => o.userData.id === id);
          if (object) object.position.set(origin.x + dx, 0, origin.z + dz);
        }
        clearUniqueGroup(current.selection);
        for (const [id, origin] of current.dragOrigins) {
          const item = callbacks.current.layout.items.find(i => i.id === id);
          if (item) current.selection.add(outlineFor({...item, x: origin.x + dx, z: origin.z + dz}, 0x2f7de1, .95));
        }
        callbacks.current.onPreview(current.dragIds.length > 1 ? `批量移动 ${current.dragIds.length} 项设施：Δ${dx.toFixed(1)}, ${dz.toFixed(1)} m` : `移动设施：Δ${dx.toFixed(1)}, ${dz.toFixed(1)} m`);
        return;
      }
      if (placementActive()) {
        const point = groundPoint(event);
        if (point) setGhost(callbacks.current.place, point);
        renderer.domElement.style.cursor = 'crosshair';
        return;
      }
      if (!current.rightDown) {
        setGhost(null);
        updateHover(event);
      }
    };

    const itemsInsideMarquee = (): string[] => {
      if (!current.marqueeActive || !current.marqueeStart) return [];
      const left = parseFloat(current.marquee.style.left) || 0;
      const top = parseFloat(current.marquee.style.top) || 0;
      const right = left + (parseFloat(current.marquee.style.width) || 0);
      const bottom = top + (parseFloat(current.marquee.style.height) || 0);
      const width = renderer.domElement.clientWidth || 1;
      const height = renderer.domElement.clientHeight || 1;
      camera.updateMatrixWorld();
      const ids: string[] = [];
      for (const item of callbacks.current.layout.items) {
        const projected = new THREE.Vector3(item.x, (item.height ?? 1) * .7, item.z).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const x = (projected.x * .5 + .5) * width;
        const y = (-projected.y * .5 + .5) * height;
        if (x >= left && x <= right && y >= top && y <= bottom) ids.push(item.id);
      }
      return ids;
    };

    const onPointerUp = (event: PointerEvent) => {
      if(event.button===0&&groundPan){groundPan=null;current.down=null;renderer.domElement.style.cursor='grab';try{renderer.domElement.releasePointerCapture(event.pointerId);}catch{/* already released */}return;}
      if (event.button === 2) {
        current.rightDown = false;
        const start = current.rightStart;
        current.rightStart = null;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) {
          const hit = findItem(event);
          const c = callbacks.current;
          const ids = hit ? (c.selectedMany.includes(hit.id) ? c.selectedMany : [hit.id]) : c.selectedMany;
          if (hit && !c.selectedMany.includes(hit.id)) {
            c.onSelectMany([hit.id]);
            c.onSelect(hit.id);
          }
          if (ids.length && c.mode === 'build') {
            c.onBatchRotate(ids, 1);
            c.onPreview(`已旋转 ${ids.length} 项设施 90°，可再次右键或按 R 继续旋转。`);
          }
        }
        return;
      }
      if (current.spaceDown && event.button === 0) { current.down = null; return; }
      if (current.marqueeActive) {
        const ids = itemsInsideMarquee();
        hideMarquee();
        current.down = null;
        clearUniqueGroup(current.hoverOutline);
        renderer.domElement.style.cursor = 'default';
        try { renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* capture already released */ }
        callbacks.current.onSelectMany(ids);
        callbacks.current.onSelect(ids[0] ?? '');
        callbacks.current.onPreview(ids.length ? `框选 ${ids.length} 项设施：拖动任一项可批量移动，右键批量旋转。` : '框选未命中设施。');
        return;
      }
      hideMarquee();
      const wasDrag = current.drag;
      const moved = current.down ? Math.hypot(event.clientX - current.down.x, event.clientY - current.down.y) : 0;
      current.dragCandidate = null;
      if (wasDrag) {
        const point = groundPoint(event);
        let ok = false;
        if (point && current.dragStart) {
          const dx = snapValue(point.x, callbacks.current.snap) - current.dragStart.x;
          const dz = snapValue(point.z, callbacks.current.snap) - current.dragStart.z;
          if (current.dragIds.length > 1) ok = callbacks.current.onBatchMove(current.dragIds, dx, dz);
          else {
            const origin = current.dragOrigins.get(wasDrag);
            ok = callbacks.current.onMove(wasDrag, (origin?.x ?? current.dragStart.x) + dx, (origin?.z ?? current.dragStart.z) + dz);
          }
        }
        if (!ok) revertDrag();
        current.drag = null;
        current.dragIds = [];
        current.dragOrigins.clear();
        current.dragStart = null;
        current.down = null;
        controls.enabled = true;
        try { renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* capture already released */ }
        renderer.domElement.style.cursor = 'grab';
        callbacks.current.onPreview('');
        return;
      }
      if (event.button === 0 && moved < 5 && placementActive()) {
        const point = groundPoint(event);
        if (point) callbacks.current.onPlace(callbacks.current.place!, snapValue(point.x, callbacks.current.snap), snapValue(point.z, callbacks.current.snap), current.ghostRotation);
      }
      current.down = null;
      if (event.button === 0) updateHover(event);
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (placementActive() || callbacks.current.tool === 'delete' || callbacks.current.tool === 'observe') return;
      const hit = findItem(event);
      if (hit) callbacks.current.onEdit(hit.id);
    };

    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer || callbacks.current.mode !== 'build') return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      const raw = event.dataTransfer.getData('application/x-3minlab-facility');
      if (raw in CATALOG) current.dragKind = raw as Kind;
      const point = groundPoint(event);
      if (point) setGhost(current.dragKind ?? callbacks.current.place, point);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer?.getData('application/x-3minlab-facility');
      const point = groundPoint(event);
      if (raw && raw in CATALOG && point && callbacks.current.mode === 'build') callbacks.current.onPlace(raw as Kind, snapValue(point.x, callbacks.current.snap), snapValue(point.z, callbacks.current.snap), current.ghostRotation);
      current.dragKind = null;
      setGhost(null);
    };
    const onDragLeave = () => { current.dragKind = null; setGhost(null); };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      current.keys.add(event.key.toLowerCase());
      if (event.code === 'Space') {
        event.preventDefault();
        current.spaceDown = true;
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      }
      if (event.key === 'Escape') {
        cancelInteraction();
        setGhost(null);
      }
      if (event.key.toLowerCase() === 'r' && placementActive()) {
        event.preventDefault();
        current.ghostRotation = (current.ghostRotation + 90) % 360;
        current.ghostKey = '';
        if (current.ghostAt) setGhost(callbacks.current.place, current.ghostAt);
      }
      if (event.key.toLowerCase() === 'f') {
        const preset = venueCameraPreset(callbacks.current.layout);
        current.tween = {startPosition: camera.position.clone(), endPosition: preset.position, startTarget: controls.target.clone(), endTarget: preset.target, time: 0, duration: .45};
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      current.keys.delete(event.key.toLowerCase());
      if (event.code === 'Space') {
        current.spaceDown = false;
        controls.mouseButtons.LEFT = null as unknown as THREE.MOUSE;
      }
    };
    const onWindowBlur = () => {
      groundPan=null;
      cancelInteraction();
      setGhost(null);
      current.keys.clear();
      current.spaceDown = false;
      controls.mouseButtons.LEFT = null as unknown as THREE.MOUSE;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onWindowBlur);
    renderer.domElement.addEventListener('pointerleave', () => { current.pointerInside = false; setGhost(null); if (!current.marqueeActive) hideMarquee(); });
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    renderer.domElement.addEventListener('dragover', onDragOver);
    renderer.domElement.addEventListener('drop', onDrop);
    renderer.domElement.addEventListener('dragleave', onDragLeave);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const w = world.current;
      if (!w) return;
      const dt = Math.min(.08, w.clock.getDelta());
      if (w.tween) {
        w.tween.time += dt;
        const t = Math.min(1, w.tween.time / w.tween.duration);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(w.tween.startPosition, w.tween.endPosition, eased);
        controls.target.lerpVectors(w.tween.startTarget, w.tween.endTarget, eased);
        if (t >= 1) w.tween = null;
      }
      const direction = movementDirection(w.keys, camera, controls.target);
      if (direction.lengthSq() > 0 && !w.drag) {
        w.tween = null;
        const speed = cameraSpeedForDistance(camera.position.distanceTo(controls.target));
        const delta = direction.multiplyScalar(speed * dt);
        controls.target.add(delta);
        camera.position.add(delta);
      }
      controls.update();
      const viewMode = callbacks.current.layout.viewMode ?? 'normal';
      if (w.room) applyVenueModes(
        w.room,
        viewMode === 'normal' ? callbacks.current.layout.wallMode ?? 'auto' : 'auto',
        viewMode === 'normal' ? callbacks.current.layout.roofMode ?? 'translucent' : 'hidden',
        camera, callbacks.current.layout.size,
      );
      const simSpeed = Math.max(0, callbacks.current.simSpeed);
      const simDt = simSpeed > 0 ? Math.min(.4, dt * simSpeed) : 0;
      w.city.update(simDt, controls.target, camera, camera.position.distanceTo(controls.target));
      const replayPeople = callbacks.current.replayPeople;
      if (replayPeople?.length) {
        w.people.present(replayPeople);
      } else {
        w.people.unfreeze();
        if (simDt > 0) {
          const steps = Math.max(1, Math.ceil(simDt / .08));
          const stepDt = simDt / steps;
          for (let step = 0; step < steps; step++) w.people.update(stepDt);
        } else {
          // dt 0 keeps counts and mode changes in sync without moving anyone.
          w.people.update(0);
        }
      }
      w.fpsFrames++;
      w.fpsTime += dt;
      if (w.fpsTime >= .5) { w.fps = w.fpsFrames / w.fpsTime; w.fpsFrames = 0; w.fpsTime = 0; }
      if (w.debug.root.visible) {
        w.debugTimer -= dt;
        if (w.debugTimer <= 0) {
          w.debugTimer = .25;
          const snapshot = w.people.debugSnapshot();
          w.debug.update(snapshot);
          callbacks.current.onDebugStats({
            fps: Math.round(w.fps),
            ...w.debug.stats(snapshot.people.length, snapshot.seats.length, callbacks.current.layout.items.length, scene, renderer),
          });
        }
      }
      if (w.rain.visible) {
        const profile = weatherProfile(callbacks.current.layout.weather);
        const fall = 14 + profile.rain * 22;
        const wind = profile.wind * 9;
        const arr = w.rainPositions;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] += wind * dt;
          arr[i + 1] -= fall * dt;
          arr[i + 2] += wind * .35 * dt;
          if (arr[i + 1] < .2 || Math.abs(arr[i] - camera.position.x) > 70 || Math.abs(arr[i + 2] - camera.position.z) > 70) {
            arr[i] = camera.position.x + (Math.random() - .5) * 110;
            arr[i + 1] = 40 + Math.random() * 28;
            arr[i + 2] = camera.position.z + (Math.random() - .5) * 110;
          }
        }
        (w.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
      const pushes = w.people.takePushes();
      if (pushes.length) {
        const grouped = new Map<string, {dx: number; dz: number}>();
        for (const push of pushes) {
          const entry = grouped.get(push.id) ?? {dx: 0, dz: 0};
          entry.dx = Math.max(-.12, Math.min(.12, entry.dx + push.dx));
          entry.dz = Math.max(-.12, Math.min(.12, entry.dz + push.dz));
          grouped.set(push.id, entry);
        }
        for (const [id, delta] of grouped) callbacks.current.onNudge(id, delta.dx, delta.dz);
      }
      w.personTimer -= dt;
      if (w.personTimer <= 0) {
        w.personTimer = .35;
        const id = callbacks.current.personSelected;
        callbacks.current.onPersonInfo(id ? w.people.info(id) : null);
      }
      w.peopleTimer -= dt;
      if (w.peopleTimer <= 0) {
        w.peopleTimer = 2;
        const snapshot = w.people.snapshot();
        callbacks.current.onPeopleSnapshot(snapshot.length ? snapshot : null);
      }
      w.renderer.render(scene, camera);
    };
    animate();

    const debugTarget = {
      camera, controls, scene, renderer, city, people,
      get state() { return callbacks.current.state; },
      get selected() { return callbacks.current.selected; },
      get room() { return world.current?.room ?? null; },
      get rain() { return world.current?.rain ?? null; },
      get personSelected() { return callbacks.current.personSelected; },
      selectPerson(id: string) {
        callbacks.current.onPersonSelect(id);
        callbacks.current.onPersonInfo(id ? people.info(id) : null);
      },
      pick(clientX: number, clientY: number) { return findItem({clientX, clientY})?.id ?? ''; },
      screenshot: capture,
      setLighting(preset: LightingPreset) { city.setLighting(preset); },
      info() {
        const distance = camera.position.distanceTo(controls.target);
        return {
          position: camera.position.toArray(), target: controls.target.toArray(), distance,
          polar: controls.getPolarAngle(), azimuth: controls.getAzimuthalAngle(),
          up: camera.up.toArray(), chunks: (city as unknown as {chunks: Map<string, unknown>}).chunks.size,
          people: (people as unknown as {agents: unknown[]}).agents.length,
          snap: callbacks.current.snap, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled,
        };
      },
    };
    (window as unknown as {__eventSimulator3D?: unknown}).__eventSimulator3D = debugTarget;

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onWindowBlur);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      renderer.domElement.removeEventListener('dragover', onDragOver);
      renderer.domElement.removeEventListener('drop', onDrop);
      renderer.domElement.removeEventListener('dragleave', onDragLeave);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      marquee.remove();
      controls.dispose();
      city.dispose();
      people.dispose();
      debugLayer.dispose();
      zoneLayer.dispose();
      callbacks.current.onPeopleProvider(null);
      callbacks.current.onCaptureReady(null);
      callbacks.current.onDebugStats(null);
      rainGeometry.dispose();
      rainMaterial.dispose();
      clearUniqueGroup(selection);
      clearUniqueGroup(hoverOutline);
      clearUniqueGroup(analysis);
      disposeAssets();
      renderer.dispose();
      renderer.domElement.remove();
      world.current = null;
      delete (window as unknown as {__eventSimulator3D?: unknown}).__eventSimulator3D;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const theme = themeForScene(layout.activity.scene);
    const worldConfig = normalizeWorld(layout.world, layout.params?.seed ?? 20261106);
    const key = themeCacheKey(layout);
    const resetWorld = key !== setupKey.current;
    setupKey.current = key;
    w.city.setBuildArea(layout.size, worldConfig, theme);
    if (resetWorld) w.people.setAmbientLoops(w.city.ambientLoops());
    w.ground.geometry.dispose();
    w.ground.geometry = new THREE.PlaneGeometry(layout.size, layout.size);
    const groundMaterial = w.ground.material as THREE.MeshStandardMaterial;
    groundMaterial.map?.dispose();
    groundMaterial.map = buildSurfaceTexture(layout.terrain ?? (layout.activity.scene === 'conference' ? 'plaza' : 'grass'), theme, layout.size);
    groundMaterial.needsUpdate = true;
    w.scene.remove(w.grid);
    w.grid.geometry.dispose();
    (w.grid.material as THREE.Material).dispose();
    const nextGrid = new THREE.GridHelper(layout.size, Math.max(12, Math.round(layout.size / 2)), 0x4f7d63, 0x9cbea6);
    (nextGrid.material as THREE.Material).transparent = true;
    (nextGrid.material as THREE.Material).opacity = .24;
    nextGrid.position.y = .06;
    nextGrid.visible = !callbacks.current.showcase;
    w.scene.add(nextGrid);
    w.grid = nextGrid;
    clearUniqueGroup(w.environment);
    if ((layout.terrain ?? 'grass') === 'track') {
      addStadiumSurface(w.environment, layout.size);
    }
    const half = layout.size / 2;
    for (const [x, z, w2, d2] of [[0, -half, layout.size + .8, .5], [0, half, layout.size + .8, .5], [-half, 0, .5, layout.size + .8], [half, 0, .5, layout.size + .8]] as const) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w2, .16, d2), new THREE.MeshStandardMaterial({color: 0xe8e2d2, roughness: .85}));
      curb.position.set(x, .08, z);
      curb.receiveShadow = true;
      w.environment.add(curb);
    }
    for (const child of [...w.facilities.children]) w.facilities.remove(child);
    for (const item of layout.items) {
      const group = model(item);
      if (state?.equipmentDown && ['speaker', 'screen', 'light'].includes(item.kind)) {
        const overlay = new THREE.Mesh(new THREE.BoxGeometry(CATALOG[item.kind].w + .3, 2.2, CATALOG[item.kind].d + .3), new THREE.MeshBasicMaterial({color: 0xd94f45, transparent: true, opacity: .16, depthWrite: false}));
        overlay.position.y = 1.1;
        group.add(overlay);
      }
      if (state?.weatherClosed && ['stage', 'stageSmall', 'stageLarge'].includes(item.kind)) {
        const overlay = new THREE.Mesh(new THREE.BoxGeometry(CATALOG[item.kind].w + .3, 2.4, CATALOG[item.kind].d + .3), new THREE.MeshBasicMaterial({color: 0xe0a52e, transparent: true, opacity: .15, depthWrite: false}));
        overlay.position.y = 1.2;
        group.add(overlay);
      }
      if ((item.kind === 'tent' || item.kind === 'tentSmall') && !layout.indoor) {
        const tentRisk = weatherProfile(layout.weather).tentRisk;
        if (item.damaged) {
          const overlay = new THREE.Mesh(new THREE.BoxGeometry(CATALOG[item.kind].w * .92, 2.1, CATALOG[item.kind].d * .92), new THREE.MeshBasicMaterial({color: 0xd94f45, transparent: true, opacity: .13, depthWrite: false}));
          overlay.position.y = 1.05;
          group.add(overlay);
        } else if (!item.anchored && tentRisk > .3) {
          group.rotation.z = tentRisk * .1;
          group.rotation.x = tentRisk * .05;
        }
      }
      w.facilities.add(group);
    }
    w.people.setState(state);
    w.people.setLayout(layout);
    if (state && layout.people?.length) w.people.restore(layout.people);
    if (w.zones.root.visible) w.zones.build(layout);
    dimFacilities(w.facilities, layout.viewMode === 'function');
    if (w.debug.root.visible) w.debug.build(layout);
    callbacks.current.onPreview('');
  }, [layout.items, layout.size, layout.terrain, layout.activity.scene, layout.world?.seed, layout.weather, layout.indoor, state?.equipmentDown, state?.weatherClosed]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const entrance = layout.items.find(i => i.kind === 'entrance');
    const key = `${layout.indoor ? 1 : 0}|${layout.venueId ?? ''}|${layout.venueVariant ?? ''}|${layout.size}|${entrance?.x ?? 0}`;
    if (key === w.roomKey) return;
    w.roomKey = key;
    if (w.room) {
      w.venueRoot.remove(w.room.group);
      disposeGroup(w.room.group);
      w.room = null;
    }
    if (!layout.indoor) return;
    const room = buildVenueRoom(layout);
    if (!room) return;
    w.room = room;
    w.venueRoot.add(room.group);
  }, [layout.indoor, layout.venueId, layout.venueVariant, layout.size, layout.items]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const profile = weatherProfile(layout.weather);
    w.city.setWeather(profile);
    const rainMaterial = w.rain.material as THREE.PointsMaterial;
    rainMaterial.opacity = profile.rain > 0 ? .38 + profile.rain * .34 : 0;
    w.rain.visible = profile.rain > 0 && !layout.indoor;
  }, [layout.weather, layout.indoor]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.city.setLighting(lighting);
    w.renderer.toneMappingExposure = lighting === 'night' ? .86 : lighting === 'dusk' ? .98 : 1.08;
  }, [lighting]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.controls.autoRotate = autoRotate;
    w.controls.autoRotateSpeed = .7;
  }, [autoRotate]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.grid.visible = !showcase;
  }, [showcase, layout.size]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    clearUniqueGroup(w.lamps);
    if (lighting === 'day') return;
    const night = lighting === 'night';
    let lit = 0;
    for (const item of layout.items) {
      if (item.kind !== 'lamp' && item.kind !== 'light') continue;
      if (lit >= 24) break;
      const height = Math.max(1.6, 3.6 * (item.height ?? 1) * (item.scale ?? 1));
      const light = new THREE.PointLight(item.kind === 'lamp' ? 0xffd08a : 0xfff1b8, night ? 24 : 10, night ? 22 : 15, 2);
      light.position.set(item.x, height, item.z);
      w.lamps.add(light);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(item.kind === 'lamp' ? .3 : .22, 10, 8),
        new THREE.MeshBasicMaterial({color: item.kind === 'lamp' ? 0xffe2a8 : 0xfff6cf}),
      );
      glow.position.set(item.x, height, item.z);
      w.lamps.add(glow);
      lit++;
    }
    if (!lit) {
      // Keep the venue readable at night even before the player places lamps.
      const fill = new THREE.PointLight(0xffe2b0, night ? 26 : 12, Math.max(34, layout.size * 1.1), 2);
      fill.position.set(0, Math.max(9, layout.size * .22), 0);
      w.lamps.add(fill);
    }
  }, [layout.items, layout.size, lighting]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const preset = venueCameraPreset(layout);
    w.tween = {
      startPosition: w.camera.position.clone(), endPosition: preset.position,
      startTarget: w.controls.target.clone(), endTarget: preset.target, time: 0, duration: .55,
    };
  }, [layout.venueId, layout.venueVariant, layout.indoor, layout.size]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.people.setState(state);
    if (state && layout.people?.length) w.people.restore(layout.people);
    else w.people.update(0);
  }, [state, layout.people]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    clearUniqueGroup(w.selection);
    clearUniqueGroup(w.hoverOutline);
    w.hover = '';
    const item = layout.items.find(i => i.id === selected);
    if (item) w.selection.add(outlineFor(item, item.locked ? 0xe0a52e : 0x2f7de1, .95));
    if (selectedMany.length > 1) {
      for (const id of selectedMany) {
        if (id === selected) continue;
        const extra = layout.items.find(i => i.id === id);
        if (extra) w.selection.add(outlineFor(extra, 0x4a9fe0, .72, true));
      }
    }
    if (state) w.people.setState(state);
  }, [selected, selectedMany, layout.items, layout.size, state]);

  useEffect(() => {
    const w = world.current;
    if (!w || !restorePeople?.length || replayPeople?.length) return;
    w.people.unfreeze();
    w.people.restore(restorePeople);
  }, [restorePeople, replayPeople]);

  useEffect(() => {
    const w = world.current;
    if (!w || !cameraAction) return;
    const {controls, camera} = w;
    const target = new THREE.Vector3(0, 0, 0);
    switch (cameraAction.kind) {
      case 'reset': {
        const preset = venueCameraPreset(layout);
        w.tween = {startPosition: camera.position.clone(), endPosition: preset.position, startTarget: controls.target.clone(), endTarget: preset.target, time: 0, duration: .45};
        break;
      }
      case 'center': {
        const offset = camera.position.clone().sub(controls.target);
        w.tween = {startPosition: camera.position.clone(), endPosition: target.clone().add(offset), startTarget: controls.target.clone(), endTarget: target, time: 0, duration: .4};
        break;
      }
      case 'fit':
        w.tween = {startPosition: camera.position.clone(), endPosition: fitCameraPosition(layout.size), startTarget: controls.target.clone(), endTarget: target, time: 0, duration: .5};
        break;
      case 'zoom-in':
      case 'zoom-out': {
        const direction = controls.target.clone().sub(camera.position);
        const ratio = cameraAction.kind === 'zoom-in' ? .78 : 1.28;
        w.tween = {startPosition: camera.position.clone(), endPosition: controls.target.clone().sub(direction.multiplyScalar(ratio)), startTarget: controls.target.clone(), endTarget: controls.target.clone(), time: 0, duration: .3};
        break;
      }
      case 'focus': {
        const focus = new THREE.Vector3(cameraAction.target?.x ?? 0, 0, cameraAction.target?.z ?? 0);
        const offset = camera.position.clone().sub(controls.target);
        if (offset.lengthSq() < 1) offset.set(.8, .8, .8);
        offset.normalize();
        if (offset.y < .35) offset.y = .35;
        offset.normalize().multiplyScalar(cameraAction.distance ?? Math.max(12, Math.min(34, layout.size * .42)));
        w.tween = {startPosition: camera.position.clone(), endPosition: focus.clone().add(offset), startTarget: controls.target.clone(), endTarget: focus, time: 0, duration: .5};
        break;
      }
    }
  }, [cameraAction, layout.size]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    if (place) {
      w.renderer.domElement.style.cursor = 'crosshair';
    } else {
      w.renderer.domElement.style.cursor = 'default';
      w.ghostKey = '';
      w.ghostRotation = 0;
      w.ghostAt = null;
      if (w.ghost) { w.scene.remove(w.ghost); w.ghost = null; }
    }
  }, [place]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.hover = '';
    clearUniqueGroup(w.hoverOutline);
    w.renderer.domElement.style.cursor = mode === 'build' ? 'default' : 'default';
  }, [tool, mode]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.renderer.setPixelRatio(qualityPixelRatio(quality));
    w.renderer.shadowMap.enabled = shadows;
    w.renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    w.renderer.shadowMap.needsUpdate = true;
    w.city.setQuality(quality, shadows);
    w.people.setQuality(quality);
    const parent = host.current;
    if (parent) {
      w.renderer.setSize(parent.clientWidth, parent.clientHeight, false);
      w.camera.aspect = parent.clientWidth / (parent.clientHeight || 1);
      w.camera.updateProjectionMatrix();
    }
  }, [quality, shadows]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    clearUniqueGroup(w.analysis);
    const colors: Record<AnalysisMark['severity'], number> = {error: 0xe0564b, warning: 0xe8a63c, info: 0x4593d6};
    for (const mark of analysisMarks) {
      const color = colors[mark.severity];
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(.95, 1.28, 36),
        new THREE.MeshBasicMaterial({color, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false}),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(mark.x, .1, mark.z);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(.06, .16, 4.2, 10, 1, true),
        new THREE.MeshBasicMaterial({color, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide}),
      );
      beacon.position.set(mark.x, 2.15, mark.z);
      const head = new THREE.Mesh(
        new THREE.OctahedronGeometry(.42),
        new THREE.MeshBasicMaterial({color, transparent: true, opacity: .82}),
      );
      head.position.set(mark.x, 4.5, mark.z);
      w.analysis.add(ring, beacon, head);
    }
    for (const ghost of analysisGhosts) w.analysis.add(outlineFor(ghost.item, ghost.color, .9, ghost.flat));
  }, [analysisMarks, analysisGhosts]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.debug.setVisible(debug && !showcase);
    if (debug && !showcase) {
      w.debug.build(layout);
      w.debug.update(w.people.debugSnapshot());
    } else {
      callbacks.current.onDebugStats(null);
    }
  }, [debug, showcase, layout.items, layout.size, layout.indoor]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const active = layout.viewMode === 'function';
    w.zones.setVisible(active);
    if (active) w.zones.build(layout);
    dimFacilities(w.facilities, active);
  }, [layout.viewMode, layout.indoor, layout.size]);

  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.controls.rotateSpeed = .62 * sensitivity * (invertRotation?-1:1);
    w.controls.panSpeed = .9 * panSensitivity;
    w.controls.zoomSpeed = .9 * zoomSensitivity;
  }, [sensitivity,panSensitivity,zoomSensitivity,invertRotation]);

  return <div className="scene-canvas" ref={host} aria-label="开放世界三维活动建设与模拟场地"/>;
}
