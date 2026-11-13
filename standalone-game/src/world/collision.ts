import {bounds, CATALOG, type Item, type Kind, type Layout} from '../game';
import {physicsFor} from './physics';

export interface Collider {
  id: string;
  ownerId: string;
  kind: Kind | 'wall';
  shape: 'box' | 'circle';
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  radius: number;
  rotation: number;
  blocksPeople: boolean;
  blocksPath: boolean;
  movable: boolean;
  mass: number;
}

function colliderFor(item: Item): Collider | null {
  const physics = physicsFor(item.kind);
  if (!physics.blocksPeople && !physics.blocksPath) return null;
  const b = bounds(item);
  const scale = item.scale ?? 1;
  const base: Collider = {
    id: `c-${item.id}`, ownerId: item.id, kind: item.kind, shape: physics.collision,
    x: item.x, z: item.z, halfW: b.w / 2, halfD: b.d / 2, radius: Math.max(b.w, b.d) / 2,
    rotation: item.rotation * Math.PI / 180, blocksPeople: physics.blocksPeople,
    blocksPath: physics.blocksPath, movable: physics.movable, mass: physics.mass,
  };
  if (item.kind === 'tree') return {...base, shape: 'circle', radius: Math.max(.42, b.w * .32)};
  if (item.kind === 'fountain') return {...base, shape: 'circle', radius: b.w * .44};
  if (item.kind === 'chair') return {...base, halfW: Math.min(b.w / 2, .72 * scale), halfD: Math.min(b.d / 2, .5 * scale)};
  if (item.kind === 'fence') return {...base, halfD: Math.min(b.d / 2, .16 * scale)};
  if (item.kind === 'bench') return {...base, halfD: Math.min(b.d / 2, .28 * scale)};
  return {...base, halfW: base.halfW * .94, halfD: base.halfD * .94};
}

export function collidersForItems(items: Item[]): Collider[] {
  const out: Collider[] = [];
  for (const item of items) {
    const collider = colliderFor(item);
    if (collider) out.push(collider);
  }
  return out;
}

export function venueWallColliders(layout: Layout): Collider[] {
  if (!layout.indoor) return [];
  const face = layout.size / 2;
  const half = face - .35;
  const depth = .22;
  const wall = (id: string, x: number, z: number, halfW: number, halfD: number): Collider => ({
    id, ownerId: `venue-${layout.venueId ?? 'room'}`, kind: 'wall', shape: 'box', x, z,
    halfW, halfD, radius: Math.max(halfW, halfD), rotation: 0,
    blocksPeople: true, blocksPath: false, movable: false, mass: 2000,
  });
  const front = layout.items.find(i => i.kind === 'entrance');
  if (front) {
    const opening = Math.max(2.6, CATALOG.entrance.w + .6);
    const doorX = Math.max(-face + opening, Math.min(face - opening, front.x));
    const clearHalf = opening / 2 - .09;
    const leftWidth = doorX - clearHalf + half;
    const rightWidth = half - doorX - clearHalf;
    const walls: Collider[] = [
      wall('wall-back', 0, -half, half, depth),
      wall('wall-left', -half, 0, depth, half),
      wall('wall-right', half, 0, depth, half),
    ];
    if (leftWidth > .2) walls.push(wall('wall-front-left', (-half + doorX - clearHalf) / 2, half, leftWidth / 2, depth));
    if (rightWidth > .2) walls.push(wall('wall-front-right', (doorX + clearHalf + half) / 2, half, rightWidth / 2, depth));
    return walls;
  }
  return [
    wall('wall-front', 0, half, half, depth), wall('wall-back', 0, -half, half, depth),
    wall('wall-left', -half, 0, depth, half), wall('wall-right', half, 0, depth, half),
  ];
}

export function layoutColliders(layout: Layout): Collider[] {
  return [...collidersForItems(layout.items), ...venueWallColliders(layout)];
}

export function circleBoxOverlap(cx: number, cz: number, radius: number, box: Collider): boolean {
  const dx = cx - box.x, dz = cz - box.z;
  const cos = Math.cos(-box.rotation), sin = Math.sin(-box.rotation);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const qx = Math.max(-box.halfW, Math.min(box.halfW, lx));
  const qz = Math.max(-box.halfD, Math.min(box.halfD, lz));
  return Math.hypot(lx - qx, lz - qz) < radius;
}

export function collides(collider: Collider, x: number, z: number, radius = .3): boolean {
  if (collider.shape === 'circle') return Math.hypot(x - collider.x, z - collider.z) < collider.radius + radius;
  return circleBoxOverlap(x, z, radius, collider);
}

export function blockedAt(colliders: Collider[], x: number, z: number, radius = .3, forPath = false): boolean {
  for (const collider of colliders) {
    if (forPath ? !collider.blocksPath : !collider.blocksPeople) continue;
    if (collides(collider, x, z, radius)) return true;
  }
  return false;
}

function penetration(collider: Collider, x: number, z: number, radius: number): number {
  if (collider.shape === 'circle') return Math.max(0, collider.radius + radius - Math.hypot(x - collider.x, z - collider.z));
  const dx = x - collider.x, dz = z - collider.z;
  const cos = Math.cos(-collider.rotation), sin = Math.sin(-collider.rotation);
  const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
  if (Math.abs(lx) <= collider.halfW && Math.abs(lz) <= collider.halfD) {
    return radius + Math.min(collider.halfW - Math.abs(lx), collider.halfD - Math.abs(lz));
  }
  const qx = Math.max(-collider.halfW, Math.min(collider.halfW, lx));
  const qz = Math.max(-collider.halfD, Math.min(collider.halfD, lz));
  return Math.max(0, radius - Math.hypot(lx - qx, lz - qz));
}

/** Deepest overlap at a position. Used to let an already-overlapping body escape instead of freezing. */
export function maxPenetration(colliders: Collider[], x: number, z: number, radius = .3): number {
  let deepest = 0;
  for (const collider of colliders) {
    if (!collider.blocksPeople) continue;
    if (!collides(collider, x, z, radius)) continue;
    deepest = Math.max(deepest, penetration(collider, x, z, radius));
  }
  return deepest;
}

export function moveWithCollision(
  colliders: Collider[], x: number, z: number, nx: number, nz: number, radius = .3,
): {x: number; z: number; blocked: boolean; slid: boolean} {
  const inside = blockedAt(colliders, x, z, radius);
  if (!blockedAt(colliders, nx, nz, radius)) return {x: nx, z: nz, blocked: inside, slid: false};
  if (inside) {
    const current = maxPenetration(colliders, x, z, radius);
    if (maxPenetration(colliders, nx, nz, radius) < current - 1e-4) return {x: nx, z: nz, blocked: true, slid: false};
    if (maxPenetration(colliders, nx, z, radius) < current - 1e-4) return {x: nx, z, blocked: true, slid: true};
    if (maxPenetration(colliders, x, nz, radius) < current - 1e-4) return {x, z: nz, blocked: true, slid: true};
    return {x, z, blocked: true, slid: false};
  }
  if (!blockedAt(colliders, nx, z, radius)) return {x: nx, z, blocked: true, slid: true};
  if (!blockedAt(colliders, x, nz, radius)) return {x, z: nz, blocked: true, slid: true};
  return {x, z, blocked: true, slid: false};
}

export function nearestMovable(colliders: Collider[], x: number, z: number, maxDistance = .85): Collider | null {
  let best: Collider | null = null;
  let bestDistance = maxDistance;
  for (const collider of colliders) {
    if (!collider.movable || !collider.blocksPeople) continue;
    const distance = Math.hypot(x - collider.x, z - collider.z) - Math.max(collider.halfW, collider.halfD);
    if (distance < bestDistance) { best = collider; bestDistance = distance; }
  }
  return best;
}

/** Cells blocked for the A* grid. Inflated by the person radius so routes keep walkable clearance. */
export function pathBlockedCells(items: Item[], half: number, radius = .38): Set<string> {
  const blocked = new Set<string>();
  for (const collider of collidersForItems(items)) {
    if (!collider.blocksPath) continue;
    if (collider.shape === 'circle') {
      const extent = collider.radius + radius;
      for (let x = Math.floor(collider.x - extent); x <= Math.ceil(collider.x + extent); x++) {
        for (let z = Math.floor(collider.z - extent); z <= Math.ceil(collider.z + extent); z++) {
          if (Math.abs(x) <= half && Math.abs(z) <= half && Math.hypot(x - collider.x, z - collider.z) < extent) blocked.add(`${x},${z}`);
        }
      }
    } else {
      const extent = Math.max(collider.halfW, collider.halfD) + radius;
      for (let x = Math.floor(collider.x - extent); x <= Math.ceil(collider.x + extent); x++) {
        for (let z = Math.floor(collider.z - extent); z <= Math.ceil(collider.z + extent); z++) {
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          if (collides(collider, x, z, radius)) blocked.add(`${x},${z}`);
        }
      }
    }
  }
  return blocked;
}
