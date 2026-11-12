import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {CATALOG} from '../game';
import {animatePerson, createPerson, model} from './models';

describe('人物步态', () => {
  it('行走时膝盖交替弯曲，停下后恢复自然站姿', () => {
    const rig = createPerson(0x59778a, 0x3d4654);
    animatePerson(rig, Math.PI / 16, true);
    expect(rig.leftKnee.rotation.x).toBeGreaterThan(0);
    expect(rig.rightKnee.rotation.x).toBeCloseTo(0);
    animatePerson(rig, 0, false);
    expect(rig.leftKnee.rotation.x).toBeCloseTo(0);
    expect(rig.rightKnee.rotation.x).toBeCloseTo(0);
  });

  it('坐下时膝盖弯曲，站起后重新进入步态', () => {
    const rig = createPerson(0x59778a, 0x3d4654);
    animatePerson(rig, 0, false, 1, 'seated');
    expect(rig.leftKnee.rotation.x).toBeGreaterThan(1);
    expect(rig.rightKnee.rotation.x).toBeGreaterThan(1);
    animatePerson(rig, Math.PI / 16, true);
    expect(rig.rightKnee.rotation.x).toBeCloseTo(0);
  });

  it('步行各阶段双脚不明显穿过地面，人物保持成人比例', () => {
    const rig = createPerson(0x59778a, 0x3d4654);
    for (let frame = 0; frame < 16; frame++) {
      animatePerson(rig, frame * Math.PI / 64, true);
      const bounds = new THREE.Box3().setFromObject(rig.group);
      expect(bounds.min.y).toBeGreaterThan(-.09);
      expect(bounds.max.y).toBeGreaterThan(1.65);
      expect(bounds.max.y).toBeLessThan(1.9);
    }
  });
});

describe('活动家具占地与结构', () => {
  it('桌椅和储物区模型不伸出标注的地面占地', () => {
    for (const kind of ['chair', 'storage'] as const) {
      const object = model({id: kind, kind, x: 0, z: 0, rotation: 0});
      const bounds = new THREE.Box3().setFromObject(object);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-CATALOG[kind].w / 2 - .01);
      expect(bounds.max.x).toBeLessThanOrEqual(CATALOG[kind].w / 2 + .01);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-CATALOG[kind].d / 2 - .01);
      expect(bounds.max.z).toBeLessThanOrEqual(CATALOG[kind].d / 2 + .01);
    }
  });
});
