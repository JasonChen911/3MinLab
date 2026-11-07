import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {CAMERA_LIMITS,cameraForwardOnGround,cameraRightOnGround,clampPolar,defaultCameraPosition,movementDirection} from './camera';

describe('统一镜头控制数学',()=>{
 it('俯仰角被限制在地面以上且不会倒置',()=>{
  expect(clampPolar(-10)).toBe(CAMERA_LIMITS.minPolar);
  expect(clampPolar(9)).toBe(CAMERA_LIMITS.maxPolar);
  expect(CAMERA_LIMITS.maxPolar).toBeLessThan(Math.PI/2);
 });

 it('WASD 前进方向随镜头水平旋转，且始终平行地面',()=>{
  const target=new THREE.Vector3(0,0,0);
  const camera=new THREE.PerspectiveCamera();
  camera.position.set(30,30,30);
  const forward=cameraForwardOnGround(camera,target);
  expect(forward.y).toBeCloseTo(0);
  expect(forward.length()).toBeCloseTo(1);
  expect(forward.x).toBeLessThan(0);
  expect(forward.z).toBeLessThan(0);

  const keys=new Set(['w']);
  const move=movementDirection(keys,camera,target);
  expect(move.x).toBeCloseTo(forward.x);
  expect(move.z).toBeCloseTo(forward.z);

  const right=cameraRightOnGround(forward);
  expect(forward.dot(right)).toBeCloseTo(0);
  const strafe=movementDirection(new Set(['d']),camera,target);
  expect(strafe.dot(right)).toBeGreaterThan(0.99);
 });

 it('相反按键互相抵消，默认镜头保持在上方',()=>{
  const camera=new THREE.PerspectiveCamera();
  const target=new THREE.Vector3();
  const move=movementDirection(new Set(['w','s','a','d']),camera,target);
  expect(move.length()).toBe(0);
  const position=defaultCameraPosition(48);
  expect(position.y).toBeGreaterThan(position.x);
  expect(position.y).toBeGreaterThan(0);
 });
});
