import * as THREE from 'three';
import {CATALOG, type Layout, type RoofMode, type WallMode} from '../game';
import {venueDefinition, venueVariant} from '../venues';

interface WallPart {
  mesh: THREE.Mesh;
  side: 'front' | 'back' | 'left' | 'right';
  material: THREE.MeshStandardMaterial;
}

interface WindowPart {
  mesh: THREE.Mesh;
  side: 'front' | 'back' | 'left' | 'right';
  material: THREE.MeshStandardMaterial;
}

export interface VenueRoom {
  group: THREE.Group;
  walls: WallPart[];
  windows: WindowPart[];
  roof: THREE.Group;
  roofMaterials: THREE.MeshStandardMaterial[];
  lights: THREE.Object3D[];
}

const OPAQUE = 1;
const TRANSLUCENT = .3;

function slab(w: number, h: number, d: number, color: number, roughness = .8): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({color, roughness}));
}

export function buildVenueRoom(layout: Layout): VenueRoom | null {
  if (!layout.indoor) return null;
  const venue = venueDefinition(layout.venueId);
  const info = venueVariant(layout.venueId, layout.venueVariant ?? 'medium');
  const style = venue.style;
  const size = layout.size;
  const half = size / 2;
  const height = style.height * (layout.venueVariant === 'large' ? 1.15 : layout.venueVariant === 'small' ? .9 : 1);
  const t = .3;
  const group = new THREE.Group();
  const walls: WallPart[] = [];
  const windows: WindowPart[] = [];
  const roof = new THREE.Group();
  const roofMaterials: THREE.MeshStandardMaterial[] = [];
  const lights: THREE.Object3D[] = [];

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size - .3, size - .3),
    new THREE.MeshStandardMaterial({color: style.floor, roughness: .92}),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = .045;
  floor.receiveShadow = true;
  group.add(floor);

  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(size, .12, size),
    new THREE.MeshStandardMaterial({color: style.wallTrim, roughness: .7}),
  );
  skirt.position.y = .06;
  skirt.receiveShadow = true;
  group.add(skirt);

  const wallMaterial = () => new THREE.MeshStandardMaterial({color: style.wall, roughness: .82, transparent: true, opacity: OPAQUE});
  const windowMaterial = () => new THREE.MeshStandardMaterial({color: style.window, roughness: .18, metalness: .15, transparent: true, opacity: .72, emissive: style.window, emissiveIntensity: .18});

  const addWall = (side: WallPart['side'], x: number, z: number, w: number, d: number) => {
    const material = wallMaterial();
    const mesh = slab(w, height, d, style.wall);
    mesh.material = material;
    mesh.position.set(x, height / 2 + .1, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    walls.push({mesh, side, material});
    if (side === 'back' || side === 'left' || side === 'right') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(side === 'back' ? w * .82 : .1, height * .3, side === 'back' ? .1 : d * .82), windowMaterial());
      strip.position.set(side === 'back' ? x : (side === 'left' ? x + .18 : x - .18), height * .55, side === 'back' ? z + .18 : z);
      group.add(strip);
      windows.push({mesh: strip, side, material: strip.material as THREE.MeshStandardMaterial});
    }
  };

  const door = layout.items.find(i => i.kind === 'entrance');
  const gap = Math.max(2.6, CATALOG.entrance.w + .6);
  const doorX = door ? Math.max(-half + gap, Math.min(half - gap, door.x)) : 0;
  const leftWidth = doorX - gap / 2 + half;
  const rightWidth = half - doorX - gap / 2;
  if (leftWidth > .3) addWall('front', -half + leftWidth / 2, half, leftWidth, t);
  if (rightWidth > .3) addWall('front', half - rightWidth / 2, half, rightWidth, t);
  addWall('back', 0, -half, size, t);
  addWall('left', -half, 0, t, size);
  addWall('right', half, 0, t, size);

  const frame = new THREE.MeshStandardMaterial({color: style.wallTrim, roughness: .55});
  const doorHeight = 2.2;
  for (const side of [-1, 1]) {
    const post = slab(.18, doorHeight, .34, style.wallTrim, .55);
    post.material = frame;
    post.position.set(doorX + side * gap / 2, doorHeight / 2, half);
    group.add(post);
  }
  const lintel = slab(gap + .36, .18, .34, style.wallTrim, .55);
  lintel.material = frame;
  lintel.position.set(doorX, doorHeight + .09, half);
  group.add(lintel);
  for (const side of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(gap / 2 - .15, 1.98, .08), new THREE.MeshStandardMaterial({color: style.window, roughness: .1, metalness: .2, transparent: true, opacity: .34}));
    pane.position.set(doorX + side * gap / 4, 1.02, half);
    pane.rotation.y = side * .22;
    group.add(pane);
  }

  const roofMaterial = new THREE.MeshStandardMaterial({color: style.ceiling, roughness: .9, transparent: true, opacity: OPAQUE, side: THREE.DoubleSide});
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(size - .1, size - .1), roofMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height + .12;
  roof.add(ceiling);
  roofMaterials.push(roofMaterial);
  const crown = slab(size + .4, .34, size + .4, style.wallTrim, .7);
  crown.position.y = height + .3;
  roof.add(crown);
  const crownMaterial = crown.material as THREE.MeshStandardMaterial;
  crownMaterial.transparent = true;
  roofMaterials.push(crownMaterial);

  const lampMaterial = new THREE.MeshStandardMaterial({color: 0xfff2c8, emissive: 0xffe4a3, emissiveIntensity: 1.15});
  const cols = Math.max(2, Math.round(size / 9));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < Math.max(1, Math.round(size / 12)); j++) {
      const px = (i + .5) / cols * size - half;
      const pz = (j + .5) / Math.max(1, Math.round(size / 12)) * size - half;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(.9, .06, .34), lampMaterial);
      panel.position.set(px, height - .06, pz);
      roof.add(panel);
      if (i % 2 === 0) {
        const light = new THREE.PointLight(0xffe7b5, Math.min(70, 18 + size * .35), Math.max(12, size * .6), 1.7);
        light.position.set(px, height - .45, pz);
        lights.push(light);
        group.add(light);
      }
    }
  }

  const accent = new THREE.MeshStandardMaterial({color: style.accent, roughness: .6});
  for (const side of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(.12, height - .2, .12), accent);
    trim.position.set(side * (half - .16), height / 2 + .1, half - .16);
    group.add(trim);
  }

  group.add(roof);
  return {group, walls, windows, roof, roofMaterials, lights};
}

export function applyVenueModes(room: VenueRoom, wallMode: WallMode, roofMode: RoofMode, camera: THREE.Camera, size: number) {
  const half = size / 2;
  for (const wall of room.walls) {
    const autoHide = wallMode === 'auto' && (
      (wall.side === 'front' && camera.position.z > half * .25) ||
      (wall.side === 'back' && camera.position.z < -half * .25) ||
      (wall.side === 'left' && camera.position.x < -half * .25) ||
      (wall.side === 'right' && camera.position.x > half * .25)
    );
    if (wallMode === 'hidden' || autoHide) {
      wall.mesh.visible = false;
      continue;
    }
    wall.mesh.visible = true;
    const translucent = wallMode === 'translucent';
    wall.material.opacity = translucent ? TRANSLUCENT : OPAQUE;
    wall.material.depthWrite = !translucent;
    wall.material.transparent = translucent;
    wall.material.needsUpdate = true;
  }
  for (const win of room.windows) {
    const host = room.walls.find(w => w.side === win.side);
    win.mesh.visible = !!host?.mesh.visible && wallMode !== 'hidden';
    win.material.opacity = wallMode === 'translucent' ? .45 : .72;
  }
  room.roof.visible = roofMode !== 'hidden';
  for (const material of room.roofMaterials) {
    material.opacity = roofMode === 'translucent' ? .34 : OPAQUE;
    material.depthWrite = roofMode !== 'translucent';
    material.transparent = roofMode !== 'full';
    material.needsUpdate = true;
  }
}

export function venueCameraPreset(layout: Layout): {position: THREE.Vector3; target: THREE.Vector3} {
  const venue = venueDefinition(layout.venueId);
  const size = layout.size;
  switch (venue.camera) {
    case 'audience': return {position: new THREE.Vector3(0, size * .38, size * .66), target: new THREE.Vector3(0, 1.4, -size * .16)};
    case 'isometric': return {position: new THREE.Vector3(size * .58, size * .52, size * .58), target: new THREE.Vector3(0, .8, 0)};
    case 'wide': return {position: new THREE.Vector3(0, size * .72, size * .86), target: new THREE.Vector3(0, 0, 0)};
    case 'stage': return {position: new THREE.Vector3(0, size * .3, -size * .58), target: new THREE.Vector3(0, 1.2, 0)};
    default: return {position: new THREE.Vector3(size * .5, size * .82, size * .58), target: new THREE.Vector3(0, 0, 0)};
  }
}
