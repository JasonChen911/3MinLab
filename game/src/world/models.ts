import * as THREE from 'three';
import {CATALOG,itemHeight,type Item,type Kind} from '../game';

type MatOptions = {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  flatShading?: boolean;
  side?: THREE.Side;
};

const materials = new Map<string, THREE.Material>();
const geometries = new Map<string, THREE.BufferGeometry>();

export function material(color: number, options: MatOptions = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${options.roughness ?? .82}|${options.metalness ?? 0}|${options.emissive ?? ''}|${options.emissiveIntensity ?? ''}|${options.opacity ?? 1}|${options.transparent ?? false}|${options.flatShading ?? false}|${options.side ?? THREE.FrontSide}`;
  const cached = materials.get(key);
  if (cached) return cached as THREE.MeshStandardMaterial;
  const created = new THREE.MeshStandardMaterial({
    color, roughness: options.roughness ?? .82, metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false, opacity: options.opacity ?? 1,
    flatShading: options.flatShading ?? false, side: options.side ?? THREE.FrontSide,
  });
  if (options.emissive !== undefined) {
    created.emissive = new THREE.Color(options.emissive);
    created.emissiveIntensity = options.emissiveIntensity ?? .45;
  }
  materials.set(key, created);
  return created;
}

function geometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const cached = geometries.get(key);
  if (cached) return cached;
  const created = create();
  geometries.set(key, created);
  return created;
}

function boxGeometry(w: number, h: number, d: number) {
  return geometry(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
}
function cylinderGeometry(r1: number, r2: number, h: number, sides = 10) {
  return geometry(`c:${r1}:${r2}:${h}:${sides}`, () => new THREE.CylinderGeometry(r1, r2, h, sides));
}
function coneGeometry(r: number, h: number, sides = 4) {
  return geometry(`k:${r}:${h}:${sides}`, () => new THREE.ConeGeometry(r, h, sides));
}
function sphereGeometry(r: number, detail = 8) {
  return geometry(`s:${r}:${detail}`, () => new THREE.SphereGeometry(r, detail, Math.max(4, detail / 2)));
}
function icoGeometry(r: number, detail = 0) {
  return geometry(`i:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
}

function addMesh(group: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, ghost = false): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = !ghost;
  mesh.receiveShadow = !ghost;
  group.add(mesh);
  return mesh;
}

function box(g: THREE.Group, w: number, h: number, d: number, color: number, x = 0, y = h / 2, z = 0, opts?: MatOptions) {
  return addMesh(g, boxGeometry(w, h, d), material(color, opts), x, y, z);
}

function cylinder(g: THREE.Group, r1: number, r2: number, h: number, color: number, x = 0, y = h / 2, z = 0, sides = 10, opts?: MatOptions) {
  return addMesh(g, cylinderGeometry(r1, r2, h, sides), material(color, opts), x, y, z);
}

function cone(g: THREE.Group, r: number, h: number, color: number, x = 0, y = h / 2, z = 0, sides = 4) {
  return addMesh(g, coneGeometry(r, h, sides), material(color), x, y, z);
}

function sphere(g: THREE.Group, r: number, color: number, x = 0, y = 0, z = 0, opts?: MatOptions, detail = 8) {
  return addMesh(g, sphereGeometry(r, detail), material(color, opts), x, y, z);
}

function ico(g: THREE.Group, r: number, color: number, x = 0, y = 0, z = 0, opts?: MatOptions, detail = 0) {
  return addMesh(g, icoGeometry(r, detail), material(color, opts), x, y, z);
}

const TRUSS = 0x39424f;
const METAL = 0x69737f;
const DARK = 0x242a33;
const WOOD = 0xb07d4f;
const WHITE = 0xf7f4ea;
const GLASS = 0x86bfe0;

function stage(g: THREE.Group, w: number, d: number, color: number, large: boolean) {
  box(g, w, .72, d, color);
  box(g, w + .5, .16, d + .5, 0x5b4b7a, 0, .08);
  box(g, w, .08, d, 0xf4e9ff, 0, .78);
  box(g, w + .6, 2.2, .28, TRUSS, 0, 1.8, -d / 2);
  box(g, w + .6, .2, .5, TRUSS, 0, 2.95, -d / 2);
  const columns = Math.max(2, Math.round(w / 2.4));
  for (let i = 0; i < columns; i++) {
    const x = -w / 2 + (i + .5) * (w / columns);
    box(g, .12, 2.3, .12, TRUSS, x, 1.85, -d / 2 + .2);
    const lamp = cylinder(g, .16, .16, .1, 0xffe9a8, x, 3.05, -d / 2 + .25, 10, {emissive: 0xffe9a8, emissiveIntensity: .55});
    lamp.rotation.x = Math.PI / 2;
  }
  if (large) {
    box(g, 1.4, 1.15, 1.1, DARK, 0, .58, -d / 2 + 1.1);
    for (const side of [-1, 1]) {
      const wedge = box(g, 1.1, .9, .9, 0x1e2630, 0, .45, -d / 2 + .2);
      wedge.position.x = side * 1.1;
    }
  }
  for (const side of [-1, 1]) {
    box(g, 1.1, 1.5, .9, 0x2c3440, side * (w / 2 + .2), .75, -d / 2 + .8);
    cylinder(g, .3, .3, .06, 0x10151c, side * (w / 2 + .2), 1.1, -d / 2 + 1.27, 14);
    cylinder(g, .18, .18, .08, 0x4f6070, side * (w / 2 + .2), .7, -d / 2 + 1.27, 14);
  }
  for (let i = 0; i < 2; i++) {
    box(g, w * .34, .18, .5, 0x6d5b8b, 0, .09, d / 2 + .25 + i * .5);
  }
  box(g, 1.8, 1.55, .08, 0xf2e6d4, 0, 1.55, -d / 2 - .08);
}

function bleachers(g: THREE.Group, w: number, d: number, color: number) {
  const tiers = 4;
  const concrete = 0x9aa6a2;
  const seat = new THREE.Color(color).lerp(new THREE.Color(0x476a78), .58).getHex();
  box(g, w + .22, .16, d + .18, 0x798984, 0, .08);
  for (let n = 0; n < tiers; n++) {
    const z = d / 2 - .38 - n * (d / tiers);
    const top = .36 + n * .34;
    box(g, w, top, d / tiers + .02, concrete, 0, top / 2, z);
    for (let s = 0; s < 6; s++) {
      const x = -w / 2 + (s + .5) * w / 6;
      box(g, w / 6 - .08, .08, .42, s % 3 === 0 ? 0x708f99 : seat, x, top + .04, z - .08);
      box(g, w / 6 - .08, .28, .07, s % 3 === 0 ? 0x708f99 : seat, x, top + .2, z - .3);
    }
  }
  for (const side of [-1, 1]) {
    box(g, .14, 1.15, d, 0x697b78, side * (w / 2 + .08), .58, 0);
    box(g, .06, .06, d, 0xd9dfd5, side * (w / 2 + .08), 1.18, 0);
    box(g, .09, 2.35, .09, 0x697b78, side * (w * .43), 1.18, -d / 2 + .32);
  }
  box(g, w + .42, .12, d * .28, 0xd6d9ce, 0, 2.42, -d / 2 + d * .16);
  box(g, w + .42, .1, .1, 0x5e716e, 0, 2.32, -d / 2 + d * .3);
}

function tent(g: THREE.Group, w: number, d: number, color: number) {
  const trim = 0xf7f2e6;
  for (const x of [-w / 2 + .25, w / 2 - .25]) for (const z of [-d / 2 + .25, d / 2 - .25]) {
    cylinder(g, .09, .09, 2.5, 0xe8e2d4, x, 1.25, z, 8);
  }
  const roof = addMesh(g, coneGeometry(w * .78, 1.8, 4), material(color, {flatShading: true}), 0, 3.2, 0);
  roof.rotation.y = Math.PI / 4;
  box(g, w * 1.04, .18, d * 1.04, trim, 0, 2.35);
  box(g, w, 1.35, .08, 0xf3ead8, 0, .68, d / 2);
  box(g, 1.1, 1.3, .1, 0x8d7d63, 0, .65, d / 2 + .05);
  box(g, w * .72, .36, .05, color, 0, 2.75, d / 2 + .02);
  box(g, .5, .06, 2.2, 0xd8cbb5, 0, .05, 0);
}

export function model(item: Item, ghost?: number): THREE.Group {
  const c = CATALOG[item.kind];
  const g = new THREE.Group();
  const w = c.w, d = c.d, color = ghost ?? c.color;
  const ghostOpts: MatOptions = ghost !== undefined ? {transparent: true, opacity: .5} : {};
  if (ghost !== undefined) {
    g.userData.ghost = true;
  }
  switch (item.kind) {
    case 'stage': case 'stageSmall': case 'stageLarge':
      stage(g, w, d, color, item.kind === 'stageLarge');
      break;
    case 'podium': {
      box(g, 1.4, 1.2, .85, color);
      const top = box(g, 1.55, .13, 1.0, WOOD, 0, 1.25);
      top.rotation.x = -.12;
      box(g, 1.2, .55, .08, 0x6f5544, 0, 1.65, -.42);
      box(g, .5, .06, .08, 0x2d3238, 0, 1.78, -.36);
      break;
    }
    case 'backdrop': {
      box(g, w, 2.8, .16, 0x384456);
      box(g, w * .72, .78, .05, 0xf0e5d3, 0, 1.9, .11);
      box(g, w * .5, .12, .06, color, 0, 2.45, .12);
      for (const x of [-w / 2 + .1, w / 2 - .1]) box(g, .12, .3, .6, METAL, x, .15, 0);
      break;
    }
    case 'chair': {
      box(g, 1.5, .1, 1.1, WOOD, 0, .78);
      for (const x of [-.58, .58]) for (const z of [-.4, .4]) box(g, .1, .76, .1, 0x7d674f, x, .38, z);
      for (const [x, z] of [[-1.15, 0], [1.15, 0], [0, -1.05], [0, 1.05]]) {
        box(g, .55, .42, .55, color, x, .22, z);
        box(g, .55, .5, .08, color, x, .63, z + (z > 0 ? .26 : -.26));
      }
      break;
    }
    case 'bleachers':
      bleachers(g, w, d, color);
      break;
    case 'tent': case 'tentSmall':
      tent(g, w, d, color);
      break;
    case 'speaker': {
      box(g, .58, 1.1, .5, 0x2c3440);
      cylinder(g, .25, .25, .05, 0x11161d, 0, .75, .26, 16);
      cylinder(g, .15, .15, .04, 0x3e4a57, 0, .35, .26, 16);
      box(g, .9, .18, .7, 0x3c4552, 0, 1.18);
      box(g, .12, .12, .12, METAL, 0, 1.34);
      break;
    }
    case 'light': {
      cylinder(g, .07, .09, 2.7, METAL, 0, 1.35, 0, 8);
      box(g, .8, .1, .16, TRUSS, 0, 2.6);
      for (const x of [-.3, .3]) {
        const head = cylinder(g, .16, .2, .35, 0x2c3440, x, 2.45, .05, 10);
        head.rotation.z = x < 0 ? -.3 : .3;
        sphere(g, .12, 0xffe6a0, x, 2.42, .2, {emissive: 0xffe6a0, emissiveIntensity: .7});
      }
      box(g, .8, .1, .8, 0x343c46, 0, .05);
      break;
    }
    case 'screen': {
      box(g, w, 2.2, .18, 0x2a3341);
      box(g, w * .92, 1.95, .06, 0x2e6fa8, 0, 1.45, .12, {emissive: 0x2e6fa8, emissiveIntensity: .35});
      box(g, w * .5, .1, .08, 0x7fd2ff, 0, 2.35, .13, {emissive: 0x7fd2ff, emissiveIntensity: .5});
      for (const x of [-w / 2 + .2, w / 2 - .2]) box(g, .14, 2.35, .3, METAL, x, 1.2, 0);
      box(g, w * .7, .12, .6, METAL, 0, .06);
      break;
    }
    case 'checkin': case 'checkinSmall': case 'checkinLarge': {
      box(g, w, 1, d, color);
      box(g, w * .94, .14, d * .92, WHITE, 0, 1.07);
      box(g, w * .82, .38, .05, 0xf7f0df, 0, 1.5, -d / 2 + .05);
      for (let x = -w / 2 + .7; x < w / 2; x += 1.1) box(g, .32, .22, .06, 0x334b57, x, 1.7, -d / 2 + .05);
      for (let x = -w / 2 + .65; x <= w / 2 - .6; x += 1.3) {
        cylinder(g, .035, .035, 1.05, 0x9aa3aa, x, .53, d / 2 + .6, 6);
        sphere(g, .07, 0xd8b44a, x, 1.06, d / 2 + .6);
      }
      const monitor = box(g, .55, .38, .06, 0x20272f, w * .25, 1.32, -d / 2 + .1);
      monitor.rotation.x = -.16;
      break;
    }
    case 'service': {
      box(g, w, 1, d, color);
      box(g, w * .84, .16, .6, 0xe9f4e0, 0, 1.08, 0);
      box(g, .9, .62, .1, 0x4f8b6b, 0, 1.5, -d / 2 + .06);
      box(g, .55, .35, .06, 0xdff0d7, 0, 1.5, -d / 2 + .11);
      for (const x of [-w / 2 + .2, w / 2 - .2]) box(g, .1, 1.1, .1, METAL, x, .55, 0);
      break;
    }
    case 'rest': {
      box(g, w, .16, d, 0xd6d2b9);
      box(g, w * .9, .16, d * .2, color, 0, 1.9);
      for (const x of [-w / 2 + .25, w / 2 - .25]) for (const z of [-d / 2 + .25, d / 2 - .25]) cylinder(g, .05, .05, 1.9, 0x8aa08f, x, .95, z, 6);
      for (const [x, z] of [[-.9, 0], [.9, 0]]) {
        box(g, .8, .08, .7, WOOD, x, .75, z);
        box(g, .08, .7, .08, 0x7d674f, x - .3, .38, z);
        box(g, .08, .7, .08, 0x7d674f, x + .3, .38, z);
        sphere(g, .14, 0x6f92b8, x, .5, z + .6);
      }
      break;
    }
    case 'fence': {
      for (let x = -w / 2; x <= w / 2; x += 1.25) {
        box(g, .1, 1.05, .1, color, x, .53);
        sphere(g, .07, 0xe8e2d0, x, 1.08);
      }
      box(g, w, .1, .1, color, 0, .88);
      box(g, w, .08, .08, color, 0, .42);
      break;
    }
    case 'entrance': {
      for (const x of [-w / 2 + .15, w / 2 - .15]) {
        box(g, .24, 3, .24, color, x, 1.5);
        box(g, .46, .15, .46, 0x59615c, x, .08);
      }
      box(g, w, .26, .26, color, 0, 3);
      box(g, w * .7, .5, .08, 0xf7f1df, 0, 2.55);
      box(g, w * .5, .1, .1, color, 0, 2.82);
      for (const x of [-w * .18, w * .18]) box(g, .08, 1.2, .35, 0x8fa79a, x, .6, 0);
      break;
    }
    case 'medical': {
      box(g, w, 2.1, d, WHITE);
      box(g, w + .2, .18, d + .2, 0xd8dfe3, 0, 2.12);
      box(g, 1.3, .12, .14, 0xd84f4f, 0, 1.7, d / 2 + .08);
      box(g, .12, 1.3, .14, 0xd84f4f, 0, 1.7, d / 2 + .08);
      box(g, .8, 1.4, .08, 0xdfe8e8, w * .27, .72, d / 2 + .04);
      box(g, .9, .1, .9, 0xd8dfe3, 0, 2.3);
      break;
    }
    case 'toilet': {
      box(g, w, 2.2, d, color);
      box(g, .85, 1.6, .08, 0xf8f8f5, 0, .82, d / 2 + .05);
      box(g, .55, .12, .06, 0x6b7b85, .55, 1.7, d / 2 + .05);
      box(g, w + .15, .15, d + .15, 0x9c8ab8, 0, 2.24);
      for (const x of [-w / 2 + .4, w / 2 - .4]) cylinder(g, .12, .12, .35, 0xdde3e6, x, 2.45, -d / 4, 8);
      break;
    }
    case 'bin': {
      cylinder(g, .34, .28, .8, color, 0, .4);
      cylinder(g, .38, .38, .09, 0x3f5f4b, 0, .84);
      box(g, .3, .1, .12, 0x2e4238, 0, .88, .2);
      break;
    }
    case 'storage': {
      box(g, w, 1.8, d, color);
      box(g, w + .2, .12, d + .2, 0x8f7b64, 0, 1.82);
      for (const x of [-w * .22, w * .22]) box(g, x > 0 ? w * .34 : w * .34, 1.25, .06, 0x9a846d, x, .7, d / 2 + .04);
      for (const x of [-.9, .9]) box(g, .8, .7, .8, 0x8e785c, x, .55, d / 2 + .5);
      break;
    }
    case 'roadCurve': {
      const segments = 7;
      for (let i = 0; i < segments; i++) {
        const angle = (i + .5) / segments * Math.PI / 2;
        const segment = box(g, 1.7, .06, 1.25, color, Math.cos(angle) * 2.1, .03, Math.sin(angle) * 2.1);
        segment.rotation.y = -angle;
      }
      for (let i = 0; i < 4; i++) {
        const angle = (i + .5) / 4 * Math.PI / 2;
        const dash = box(g, .5, .015, .16, 0xf1e9bd, Math.cos(angle) * 2.1, .07, Math.sin(angle) * 2.1);
        dash.rotation.y = -angle;
      }
      break;
    }
    case 'road': {
      box(g, w, .06, d, color, 0, .03);
      for (const x of [-w / 4, w / 4]) for (let z = -d / 2 + .4; z < d / 2; z += 1.2) box(g, .16, .015, .5, 0xf1e9bd, x, .07, z);
      box(g, w, .02, .08, 0xece5c8, 0, .06, -d / 2 + .1);
      box(g, w, .02, .08, 0xece5c8, 0, .06, d / 2 - .1);
      break;
    }
    case 'path': {
      box(g, w, .05, d, color, 0, .025);
      for (let z = -d / 2; z < d / 2; z += .8) box(g, w, .01, .04, 0xb7a98d, 0, .05, z);
      break;
    }
    case 'tree': {
      cylinder(g, .2, .28, 1.7, 0x8a6a4a, 0, .85, 0, 8);
      ico(g, .95, color, 0, 2.2, 0, {flatShading: true}, 1);
      ico(g, .72, color, -.35, 2.75, .15, {flatShading: true}, 1);
      ico(g, .6, color, .38, 2.6, -.18, {flatShading: true}, 1);
      break;
    }
    case 'flower': {
      box(g, w, .3, d, 0x9a7652);
      const colors = [0xff7f9c, 0xffd166, 0xb58be8, 0xff9f5e];
      for (let x = -w / 2 + .28; x < w / 2; x += .55) for (let z = -d / 2 + .28; z < d / 2; z += .55) {
        sphere(g, .15, colors[Math.floor(Math.abs(x * 10 + z * 7)) % colors.length], x, .48, z, undefined, 6);
        cylinder(g, .025, .025, .22, 0x4f8b4a, x, .36, z, 4);
      }
      break;
    }
    case 'bush': {
      ico(g, .6, color, 0, .5, 0, {flatShading: true});
      ico(g, .42, color, .4, .38, .18, {flatShading: true});
      ico(g, .38, color, -.35, .4, -.2, {flatShading: true});
      break;
    }
    case 'planter': {
      cylinder(g, .36, .3, .55, 0xb5814f, 0, .28, 0, 10);
      cylinder(g, .31, .31, .06, 0x59432e, 0, .57, 0, 10);
      ico(g, .34, color, 0, .82, 0, {flatShading: true});
      ico(g, .24, color, .18, 1.02, .1, {flatShading: true});
      break;
    }
    case 'lamp': {
      cylinder(g, .09, .12, 3.2, 0x4d565c, 0, 1.6, 0, 8);
      box(g, .9, .1, .12, 0x4d565c, .36, 3.22);
      box(g, .5, .22, .36, 0x3d464c, .74, 3.08);
      box(g, .36, .06, .24, 0xffe9a8, .74, 2.94, 0, {emissive: 0xffe9a8, emissiveIntensity: .55});
      cylinder(g, .25, .32, .08, 0x394147, 0, .04, 0, 10);
      break;
    }
    case 'sign': {
      box(g, .12, 2.1, .12, 0x6a5b49);
      box(g, 1.3, .7, .1, color, 0, 2);
      box(g, .9, .1, .04, 0xffffff, 0, 2.08, .07);
      box(g, .55, .08, .05, 0xffffff, -.18, 1.86, .07);
      box(g, .5, .25, .12, 0x6a5b49, 0, .13);
      break;
    }
    case 'bench': {
      for (const z of [-.24, 0, .24]) box(g, w, .08, .14, color, 0, .55, z);
      for (const z of [.3, .45]) box(g, w, .13, .08, color, 0, .82, z);
      for (const x of [-w / 2 + .25, w / 2 - .25]) {
        box(g, .08, .55, .08, 0x4a5056, x, .28, 0);
        box(g, .08, .5, .08, 0x4a5056, x, .62, .36);
      }
      break;
    }
    case 'fountain': {
      cylinder(g, w * .48, w * .5, .45, 0xc9c4b5, 0, .22, 0, 24);
      cylinder(g, w * .43, w * .43, .08, 0x5fc6ef, 0, .48, 0, 24, {transparent: true, opacity: .78});
      cylinder(g, .35, .42, 1.1, 0xbfb9aa, 0, .95, 0, 12);
      cylinder(g, .75, .85, .16, 0xc9c4b5, 0, 1.55, 0, 16);
      cylinder(g, .6, .6, .06, 0x6fd4f4, 0, 1.62, 0, 16, {transparent: true, opacity: .82});
      sphere(g, .18, 0x9fe8ff, 0, 1.85, 0, {transparent: true, opacity: .8, emissive: 0x8fd8f0, emissiveIntensity: .3});
      break;
    }
    default:
      break;
  }
  if (ghost !== undefined) {
    g.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.material = material(ghost, {...ghostOpts});
        o.castShadow = false;
        o.receiveShadow = false;
        o.raycast = () => {};
      }
    });
  }
  g.position.set(item.x, 0, item.z);
  g.rotation.y = item.rotation * Math.PI / 180;
  const scale = item.scale ?? 1;
  g.scale.set(scale, scale * itemHeight(item), scale);
  g.userData.id = item.id;
  g.userData.kind = item.kind;
  return g;
}

export interface PersonRig {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  torso: THREE.Group;
}

export function createPerson(shirt: number, pants: number, skin = 0xe6c2a4, hair = 0x4a382c): PersonRig {
  const group = new THREE.Group();
  const variety = ((shirt ^ (hair << 1) ^ skin) & 7) / 7;
  group.scale.setScalar(.965 + variety * .07);
  const torso = new THREE.Group();
  torso.position.y = 1.03;
  group.add(torso);
  const body = addMesh(torso, geometry('person-shaped-torso', () => new THREE.LatheGeometry([
    new THREE.Vector2(0, -.36), new THREE.Vector2(.13, -.36), new THREE.Vector2(.18, -.25),
    new THREE.Vector2(.16, -.04), new THREE.Vector2(.22, .2), new THREE.Vector2(.19, .31),
    new THREE.Vector2(.095, .38), new THREE.Vector2(0, .38),
  ], 12)), material(shirt), 0, .06);
  body.scale.set(.96 + variety * .08, 1, .78);
  addMesh(torso, cylinderGeometry(.065, .075, .13, 10), material(skin), 0, .43);
  addMesh(torso, cylinderGeometry(.105, .13, .045, 12), material(new THREE.Color(shirt).multiplyScalar(.78).getHex()), 0, .385);
  const headRoot = new THREE.Group();
  headRoot.position.y = .57;
  torso.add(headRoot);
  const head = addMesh(headRoot, sphereGeometry(.16, 12), material(skin));
  head.scale.set(.96, 1.05, .9);
  const hairCap = addMesh(headRoot, geometry('person-hair-cap', () => new THREE.SphereGeometry(.169, 12, 8, 0, Math.PI * 2, 0, Math.PI * .51)), material(hair, {roughness: 1}), 0, .025, -.01);
  hairCap.scale.z = 1.06;
  const part = variety < .5 ? -1 : 1;
  addMesh(headRoot, sphereGeometry(.075, 8), material(new THREE.Color(hair).multiplyScalar(1.13).getHex(), {roughness: 1}), part * .052, .12, .085).scale.set(1, .5, .78);
  for (const side of [-1, 1]) {
    addMesh(headRoot, sphereGeometry(.031, 8), material(skin), side * .153, -.015, 0);
    addMesh(headRoot, sphereGeometry(.035, 8), material(hair, {roughness: 1}), side * .125, .045, -.09);
    addMesh(headRoot, sphereGeometry(.012, 6), material(0x443a33), side * .055, -.01, .146);
  }
  addMesh(headRoot, sphereGeometry(.025, 8), material(skin), 0, -.06, .148).scale.set(.7, 1, .8);
  addMesh(group, sphereGeometry(.18, 10), material(pants), 0, .75, 0).scale.set(1, .55, .78);
  const arm = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.36, 0);
    group.add(pivot);
    addMesh(pivot, geometry('person-upper-arm', () => new THREE.CapsuleGeometry(.076, .17, 3, 8)), material(shirt), 0, -.12);
    const elbow = new THREE.Group();
    elbow.position.y = -.245;
    pivot.add(elbow);
    addMesh(elbow, geometry('person-forearm', () => new THREE.CapsuleGeometry(.052, .16, 3, 8)), material(skin), 0, -.11);
    addMesh(elbow, sphereGeometry(.056, 8), material(skin), 0, -.235);
    return {pivot, elbow};
  };
  const leg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, .8, 0);
    group.add(pivot);
    addMesh(pivot, geometry('person-thigh', () => new THREE.CapsuleGeometry(.08, .28, 3, 8)), material(pants), 0, -.18);
    const knee = new THREE.Group();
    knee.position.y = -.365;
    pivot.add(knee);
    addMesh(knee, geometry('person-shin', () => new THREE.CapsuleGeometry(.067, .28, 3, 8)), material(pants), 0, -.16);
    addMesh(knee, sphereGeometry(.085, 10), material(0x34404a), 0, -.345, .06).scale.set(.95, .55, 1.35);
    return {pivot, knee};
  };
  const leftArmRig = arm(-.24), rightArmRig = arm(.24), leftLegRig = leg(-.105), rightLegRig = leg(.105);
  group.userData.isPerson = true;
  return {
    group, torso,
    leftArm: leftArmRig.pivot, rightArm: rightArmRig.pivot,
    leftElbow: leftArmRig.elbow, rightElbow: rightArmRig.elbow,
    leftLeg: leftLegRig.pivot, rightLeg: rightLegRig.pivot,
    leftKnee: leftLegRig.knee, rightKnee: rightLegRig.knee,
  };
}

export function animatePerson(rig: PersonRig, time: number, moving: boolean, speed = 1, pose: 'normal' | 'seated' | 'resting' | 'performing' | 'running' = 'normal') {
  const phase = time * 8 * Math.max(.5, speed);
  const amount = pose === 'running' ? .78 : moving ? .5 : .025;
  const swing = Math.sin(phase) * amount;
  rig.leftLeg.rotation.x = swing;
  rig.rightLeg.rotation.x = -swing;
  rig.leftKnee.rotation.x = moving ? Math.max(0, swing) * .75 : 0;
  rig.rightKnee.rotation.x = moving ? Math.max(0, -swing) * .75 : 0;
  rig.leftArm.rotation.x = -swing * .65;
  rig.rightArm.rotation.x = swing * .65;
  rig.leftElbow.rotation.x = .15 + (moving ? Math.max(0, -swing) * .4 : 0);
  rig.rightElbow.rotation.x = .15 + (moving ? Math.max(0, swing) * .4 : 0);
  rig.leftArm.rotation.z = .09;
  rig.rightArm.rotation.z = -.09;
  const bob = moving ? Math.abs(Math.sin(phase)) * .018 : Math.sin(time * 2) * .006;
  rig.torso.position.y = 1.03 + bob;
  rig.torso.rotation.z = moving ? Math.sin(phase) * .012 : 0;
  if (pose === 'seated' || pose === 'resting') {
    rig.leftLeg.rotation.x = pose === 'seated' ? -1.2 : -.25;
    rig.rightLeg.rotation.x = pose === 'seated' ? -1.2 : -.25;
    rig.leftKnee.rotation.x = pose === 'seated' ? 1.35 : .38;
    rig.rightKnee.rotation.x = pose === 'seated' ? 1.35 : .38;
    rig.leftArm.rotation.x = pose === 'seated' ? -.2 : .12;
    rig.rightArm.rotation.x = pose === 'seated' ? -.2 : .12;
    rig.torso.position.y = 1.03;
  } else if (pose === 'performing') {
    rig.leftArm.rotation.z = .55 + Math.sin(time * 3) * .28;
    rig.rightArm.rotation.z = -.55 - Math.sin(time * 3 + 1) * .28;
    rig.torso.position.y = 1.03 + Math.abs(Math.sin(time * 3)) * .045;
  }
}

export interface CarRig {
  group: THREE.Group;
  wheels: THREE.Mesh[];
}

export function createCar(color: number, detailed = true): CarRig {
  const group = new THREE.Group();
  const body = addMesh(group, boxGeometry(1.78, .56, 4.0), material(color, {roughness: .48, metalness: .18}));
  body.position.y = .62;
  addMesh(group, boxGeometry(1.62, .48, 2.05), material(color, {roughness: .42, metalness: .15}), 0, 1.06, -.18);
  addMesh(group, boxGeometry(1.5, .34, 1.82), material(GLASS, {roughness: .18, metalness: .35}), 0, 1.1, -.15);
  addMesh(group, boxGeometry(1.8, .14, .42), material(color, {roughness: .5}), 0, .42, 1.72);
  addMesh(group, boxGeometry(1.8, .14, .42), material(color), 0, .42, -1.72);
  const wheels: THREE.Mesh[] = [];
  for (const x of [-.86, .86]) for (const z of [-1.28, 1.28]) {
    const wheel = addMesh(group, cylinderGeometry(.3, .3, .22, 12), material(DARK, {roughness: .9}), x, .32, z);
    wheel.rotation.z = Math.PI / 2;
    wheels.push(wheel);
    addMesh(group, cylinderGeometry(.14, .14, .23, 10), material(0xaeb5bb, {metalness: .5, roughness: .35}), x, .32, z).rotation.z = Math.PI / 2;
  }
  if (detailed) {
    for (const x of [-.62, .62]) {
      addMesh(group, boxGeometry(.3, .13, .06), material(0xfff4b8, {emissive: 0xfff4b8, emissiveIntensity: .6}), x, .68, 2.01);
      addMesh(group, boxGeometry(.3, .11, .05), material(0xd44a4a, {emissive: 0xd44a4a, emissiveIntensity: .4}), x, .68, -2.01);
    }
    addMesh(group, boxGeometry(1.2, .08, .16), material(0x2c3440), 0, .35, 2.02);
    addMesh(group, boxGeometry(1.2, .08, .16), material(0x2c3440), 0, .35, -2.02);
  }
  group.userData.isCar = true;
  return {group, wheels};
}

export function createCityProp(kind: 'lamp' | 'bench' | 'flower' | 'bin', tint: number, rotation = 0): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'bin') {
    cylinder(g, .26, .3, .72, 0x3f5a4c, 0, .36, 0, 10);
    cylinder(g, .31, .31, .08, 0x2f473c, 0, .74, 0, 10);
    cylinder(g, .12, .12, .05, 0x9db9a4, 0, .79, 0, 8);
  } else if (kind === 'lamp') {
    cylinder(g, .09, .12, 3.3, 0x4d565c, 0, 1.65, 0, 8);
    box(g, .95, .1, .12, 0x4d565c, .38, 3.32);
    box(g, .52, .2, .34, 0x3d464c, .78, 3.2);
    box(g, .38, .05, .22, 0xffe9a8, .78, 3.08, 0, {emissive: 0xffe9a8, emissiveIntensity: .55});
  } else if (kind === 'bench') {
    for (const z of [-.22, 0, .22]) box(g, 1.8, .07, .13, tint, 0, .52, z);
    for (const z of [.28, .44]) box(g, 1.8, .11, .07, tint, 0, .78, z);
    for (const x of [-.72, .72]) {
      box(g, .07, .5, .07, 0x4a5056, x, .26, 0);
      box(g, .07, .46, .07, 0x4a5056, x, .58, .34);
    }
  } else {
    box(g, 1.6, .22, 1.0, 0x9a7652);
    for (let x = -.6; x <= .6; x += .4) for (let z = -.32; z <= .32; z += .32) {
      sphere(g, .11, tint, x, .36, z, undefined, 6);
      cylinder(g, .02, .02, .18, 0x4f8b4a, x, .27, z, 4);
    }
  }
  g.rotation.y = rotation;
  return g;
}

export function disposeAssets() {
  materials.forEach(m => m.dispose());
  materials.clear();
  geometries.forEach(g => g.dispose());
  geometries.clear();
}

export function kindHeight(kind: Kind): number {
  const c = CATALOG[kind];
  return Math.max(1.2, Math.min(3.4, c.d * .55));
}
