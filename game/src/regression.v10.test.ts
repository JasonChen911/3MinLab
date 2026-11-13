import {describe,expect,it} from 'vitest';
import {CATALOG,freshLayout,start,step} from './game';
import {analyzeFacilities} from './facilities';
import {suggestedParameters,validateParameters} from './engine/engine';

describe('V10 固定场景回归',()=>{
 it('没有签到台时不报告入场吞吐充足',()=>{
  const base=freshLayout('conference');
  const layout={...base,items:base.items.filter(item=>!item.kind.startsWith('checkin'))};
  const metrics=analyzeFacilities(layout,CATALOG);
  expect(metrics.warnings.some(text=>text.includes('缺少签到台'))).toBe(true);
  expect(metrics.strengths.some(text=>text.includes('入场吞吐充足'))).toBe(false);
 });
 it('20000 人建议容量不超过可验证上限',()=>{
  const layout=freshLayout('conference'),snapshot=start(layout).snapshot;
  const params=suggestedParameters({...snapshot,people:20000});
  expect(params.capacity).toBe(20000);
  expect(validateParameters(params).some(text=>text.includes('capacity'))).toBe(false);
 });
 it('相同布局与随机种子产生相同到场、预算和风险过程',()=>{
  const layout=freshLayout('conference');layout.params.seed=20261113;
  const first=step(start(layout),90),second=step(start(layout),90);
  expect({arrived:first.arrived,served:first.served,extraSpend:first.extraSpend,incidents:first.incidents.map(e=>e.kind)}).toEqual({arrived:second.arrived,served:second.served,extraSpend:second.extraSpend,incidents:second.incidents.map(e=>e.kind)});
 });
});
