import {describe,expect,it} from 'vitest';
import {CATALOG,capacityOf,defaultSimulationFinance,facilityParameters,freshLayout,intervene,itemCost,layoutCost,normalizeLayout,simulationItemCost,start} from './game';
import {analyzeFacilities} from './facilities';
import {upsertParameterPreset} from './parameterLibrary';

describe('V8 两种规则与设施方案',()=>{
  it('现实报价、人员和场地费用不改变游戏固定价格',()=>{
    const layout=freshLayout('conference');
    const chair=layout.items.find(item=>item.kind==='chair')??{id:'chair-v8',kind:'chair' as const,x:0,z:0,rotation:0};
    layout.items=[chair];
    const gamePrice=layoutCost(layout);
    chair.parameters={...facilityParameters(chair),rentalPrice:275,purchasePrice:900,quantity:2,source:'供应商报价',updatedAt:'2026-11-08'};
    expect(layoutCost(layout)).toBe(gamePrice);
    expect(itemCost(chair)).toBe(gamePrice);
    layout.operatingMode='simulation';
    layout.simulationFinance={...defaultSimulationFinance,staffHourlyWage:50,staffHours:3,venueRent:300,venueHours:2,venueCapacityOverride:120};
    expect(simulationItemCost(chair)).toBe(550);
    expect(layoutCost(layout)).toBe(550+layout.params.staff*150+600);
    expect(start(layout).snapshot.challenge).toBeUndefined();
    expect(start(layout).parameters.capacity).toBeLessThanOrEqual(120);
  });
  it('现实设施容量与签到能力进入仿真，切回游戏仍使用固定参数',()=>{
    const layout=freshLayout('conference');
    const checkin=layout.items.find(item=>item.kind==='checkin');
    expect(checkin).toBeDefined();
    if(!checkin)return;
    const original=analyzeFacilities(layout,CATALOG).checkinDesks;
    const gameCapacity=capacityOf(checkin);
    checkin.parameters={...facilityParameters(checkin),capacity:10,servicePerMinute:20};
    expect(analyzeFacilities(layout,CATALOG).checkinDesks).toBe(original);
    expect(capacityOf(checkin)).toBe(gameCapacity);
    layout.operatingMode='simulation';
    expect(analyzeFacilities(layout,CATALOG).checkinDesks).toBeGreaterThan(original);
    expect(capacityOf(checkin,true)).toBe(10);
    expect(start(layout).parameters.serviceRate).toBeGreaterThan(0);
  });
  it('参数方案按设施类型和来源保存，旧方案可保留',()=>{
    const item={id:'toilet-v8',kind:'toilet' as const,x:0,z:0,rotation:0};
    const parameters={...facilityParameters(item),region:'上海',supplier:'示例供应商',source:'用户询价',updatedAt:'2026-11-08'};
    const preset={id:'preset-1',name:'上海临时厕所',kind:item.kind,parameters,savedAt:'2026-11-08'};
    const newer=upsertParameterPreset([preset],{...preset,name:'更新方案'});
    expect(newer).toHaveLength(1);
    expect(newer[0].parameters.source).toBe('用户询价');
  });
  it('旧存档默认保留游戏规则，新存档可恢复现实模式和两种运行记录',()=>{
    const old=normalizeLayout(freshLayout('community'));
    expect(old.operatingMode??'game').toBe('game');
    const real=normalizeLayout({...old,operatingMode:'simulation',simulationFinance:{...defaultSimulationFinance,budgetMode:'limited',budget:25000},gameRun:start(old)});
    expect(real.operatingMode).toBe('simulation');
    expect(real.simulationFinance?.budget).toBe(25000);
    expect(real.gameRun?.snapshot.simulationMode).toBeUndefined();
  });
  it('现实应急费用由组织者设置，未填费用不沿用游戏金币',()=>{
    const layout=freshLayout('community');
    const game=intervene(start(layout),'reserve');
    expect(game.extraSpend).toBe(400);
    layout.operatingMode='simulation';
    layout.simulationFinance={...defaultSimulationFinance,budgetMode:'off'};
    const noQuote=intervene(start(layout),'reserve');
    expect(noQuote.extraSpend).toBe(0);
    layout.simulationFinance.actionCosts={...defaultSimulationFinance.actionCosts,reserve:950};
    const quoted=intervene(start(layout),'reserve');
    expect(quoted.extraSpend).toBe(950);
  });
});
