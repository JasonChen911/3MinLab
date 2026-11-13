import {describe,it,expect} from 'vitest';
import {defaultWorld,generateChunk,insideBuildArea,isOnRoad,normalizeWorld,planCity,themeForScene,type BuildArea} from './worldgen';

const area:BuildArea={x:0,z:0,size:48};
const world=defaultWorld(1234);

describe('确定性开放世界生成',()=>{
 it('同一世界与分块重复生成完全一致',()=>{
  const a=generateChunk(world,area,3,-2,false,themeForScene('custom'));
  const b=generateChunk(world,area,3,-2,false,themeForScene('custom'));
  expect(a).toEqual(b);
 });

 it('不同种子生成不同城市',()=>{
  const a=generateChunk(defaultWorld(1),area,2,2);
  const b=generateChunk(defaultWorld(2),area,2,2);
  expect(JSON.stringify(a.cells)).not.toBe(JSON.stringify(b.cells));
 });

 it('中央建设区不被建筑或树木占用',()=>{
  const chunk=generateChunk(world,area,0,0,false,themeForScene('custom'));
  for(const cell of chunk.cells)for(const b of cell.buildings){
   const half=area.size/2;
   const overlap=Math.abs(b.x)<half+b.w/2&&Math.abs(b.z)<half+b.d/2;
   expect(overlap).toBe(false);
  }
  for(const tree of chunk.apronTrees)expect(insideBuildArea(area,tree.x,tree.z,0)).toBe(false);
 });

 it('树木不会长在道路中央，道路从建设区外围绕行',()=>{
  const plan=planCity(world,area);
  expect(plan.firstRoad).toBeGreaterThan(area.size/2+10);
  for(const [cx,cz] of [[0,0],[1,0],[-1,1],[2,-2]] as const){
   const chunk=generateChunk(world,area,cx,cz,false,themeForScene('custom'));
   for(const tree of chunk.apronTrees)expect(isOnRoad(plan,tree.x,tree.z,0)).toBe(false);
   for(const cell of chunk.cells)for(const tree of cell.trees)expect(isOnRoad(plan,tree.x,tree.z,0)).toBe(false);
  }
 });

 it('外围分块包含建筑、绿化和路边设施',()=>{
  const chunks=[generateChunk(world,area,1,0),generateChunk(world,area,-1,1),generateChunk(world,area,2,2)];
  expect(chunks.some(c=>c.cells.some(x=>x.buildings.length>0))).toBe(true);
  expect(chunks.some(c=>c.apronTrees.length>0)).toBe(true);
  expect(chunks.some(c=>c.props.some(p=>p.kind==='lamp'))).toBe(true);
 });

 it('远景分块会减少装饰细节但保留建筑骨架',()=>{
  const near=generateChunk(world,area,2,0,false);
  const far=generateChunk(world,area,2,0,true);
  const nearProps=near.cells.reduce((n,c)=>n+c.props.length,0);
  const farProps=far.cells.reduce((n,c)=>n+c.props.length,0);
  expect(farProps).toBeLessThanOrEqual(nearProps);
  expect(far.far).toBe(true);
 });

 it('世界配置会被规整到安全范围',()=>{
  const normalized=normalizeWorld({seed:7,chunkSize:2,roadSpacing:999});
  expect(normalized.chunkSize).toBe(32);
  expect(normalized.roadSpacing).toBe(128);
  expect(normalized.version).toBe(1);
 });
});
