import * as THREE from 'three';
import type {Layout} from '../game';
import {labelSprite} from './labels';
import {venueZones, type VenueZone} from './zones';

function disposeTree(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
      return;
    }
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose());
  });
}

function rectangle(w: number, d: number, y: number): THREE.Vector3[] {
  return [
    new THREE.Vector3(-w / 2, y, -d / 2), new THREE.Vector3(w / 2, y, -d / 2),
    new THREE.Vector3(w / 2, y, d / 2), new THREE.Vector3(-w / 2, y, d / 2),
  ];
}

function zoneItem(): null {
  return null;
}

/** Floor zones, circulation ribbons and labels used by the function observation mode. */
export class ZoneLayer {
  readonly root = new THREE.Group();

  constructor() {
    this.root.name = 'zone-layer';
    this.root.visible = false;
  }

  setVisible(visible: boolean) {
    this.root.visible = visible;
  }

  get zoneCount() {
    return this.root.children.length;
  }

  build(layout: Layout) {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      disposeTree(child);
    }
    for (const zone of venueZones(layout)) {
      if (zone.path?.length) {
        this.addCirculation(zone);
        continue;
      }
      if (zone.w < 1 || zone.d < 1) continue;
      this.addFloorZone(zone);
      if (zone.kind === 'entrance' || zone.kind === 'exit') this.addDoorMarker(zone);
    }
  }

  private addFloorZone(zone: VenueZone) {
    const group = new THREE.Group();
    group.position.set(zone.x, 0, zone.z);
    group.rotation.y = zone.rotation * Math.PI / 180;
    const color = new THREE.Color(zone.color);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(zone.w, zone.d),
      new THREE.MeshBasicMaterial({color, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide}),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = .062;
    floor.renderOrder = 8;
    group.add(floor);
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(rectangle(zone.w, zone.d, .075)),
      new THREE.LineBasicMaterial({color, transparent: true, opacity: .85, depthWrite: false, depthTest: false}),
    );
    outline.renderOrder = 13;
    group.add(outline);
    this.root.add(group);
    const label = labelSprite(zone.name, `#${zone.color.toString(16).padStart(6, '0')}`, .48, .82);
    label.position.set(zone.x, 1.7, zone.z);
    this.root.add(label);
  }

  private addDoorMarker(zone: VenueZone) {
    const color = new THREE.Color(zone.color);
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({length: 25}, (_, index) => {
        const angle = index / 24 * Math.PI * 2;
        return new THREE.Vector3(zone.x + Math.cos(angle) * 1.5, .1, zone.z + Math.sin(angle) * 1.5);
      })),
      new THREE.LineBasicMaterial({color, transparent: true, opacity: .95, depthTest: false}),
    );
    ring.renderOrder = 14;
    this.root.add(ring);
  }

  private addCirculation(zone: VenueZone) {
    const nodes = zone.path ?? [];
    if (nodes.length < 2) return;
    const width = zone.width ?? 2.6;
    const color = new THREE.Color(zone.color);
    const material = new THREE.MeshBasicMaterial({color, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide});
    const linePoints: THREE.Vector3[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      if (length < .2) continue;
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(width, .015, length), material);
      ribbon.position.set((a.x + b.x) / 2, .066, (a.z + b.z) / 2);
      ribbon.rotation.y = Math.atan2(dx, dz);
      ribbon.renderOrder = 8;
      this.root.add(ribbon);
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(Math.min(.42, width * .22), .85, 8),
        new THREE.MeshBasicMaterial({color: 0x9de8ff, transparent: true, opacity: .8, depthWrite: false}),
      );
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.y = Math.atan2(dx, dz);
      arrow.position.set(a.x + dx * .55, .1, a.z + dz * .55);
      arrow.renderOrder = 12;
      this.root.add(arrow);
      linePoints.push(new THREE.Vector3(a.x, .085, a.z), new THREE.Vector3(b.x, .085, b.z));
    }
    if (linePoints.length) {
      const line = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(linePoints),
        new THREE.LineBasicMaterial({color: 0xa9ecff, transparent: true, opacity: .9, depthTest: false}),
      );
      line.renderOrder = 14;
      this.root.add(line);
    }
    const labelNode = nodes[Math.floor(nodes.length / 2)];
    const label = labelSprite(zone.name, `#${zone.color.toString(16).padStart(6, '0')}`, .44, .82);
    label.position.set(labelNode.x, 1.35, labelNode.z);
    this.root.add(label);
  }

  dispose() {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      disposeTree(child);
    }
  }
}
