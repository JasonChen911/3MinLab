import {describe, expect, it} from 'vitest';
import {freshLayout, intervene, start, step, type Layout} from './game';
import {directorWarnings} from './engine/director';
import {buildReplayExport, logWeatherChange, recordReplayFrame, replayFrameAt, replayWeatherAt} from './engine/replay';

function overloaded(): Layout {
  const base = freshLayout('performance');
  const items = base.items.filter(item => ['entrance', 'stage', 'stageSmall', 'stageLarge'].includes(item.kind));
  items.push(
    {id: 'desk', kind: 'checkinSmall', x: 0, z: 14, rotation: 0},
    {id: 'tent', kind: 'tent', x: -10, z: 10, rotation: 0},
    {id: 'speaker', kind: 'speaker', x: 4, z: -6, rotation: 0},
    {id: 'light', kind: 'light', x: -4, z: -6, rotation: 0},
  );
  return {
    ...base,
    weather: 'gale', weatherAuto: false,
    activity: {...base.activity, people: 420, budget: 100000},
    params: {...base.params, capacity: 160, checkinStaff: 1, staff: 3, seed: 20261106},
    volunteers: 0, items,
  };
}

function runUntilWarning(limit = 60) {
  let state = start(overloaded());
  for (let minute = 0; minute < limit && !directorWarnings(state).length; minute++) state = step(state, 1);
  return state;
}

describe('V5 活动回放：逐分钟记录', () => {
  it('每帧对应真实引擎状态，查询只返回已记录的帧而不插值', () => {
    let state = step(start(overloaded()), 12);
    const frames = state.replay!.frames;
    expect(frames.map(frame => frame.t)).toEqual([...Array(13).keys()]);
    const last = frames.at(-1)!;
    expect(last.queue).toBe(state.queue);
    expect(last.served).toBe(state.served);
    expect(last.arrived).toBe(state.arrived);
    expect(last.occupancy).toBe(Math.max(0, state.served - state.departed));
    expect(last.satisfaction).toBe(Math.round((state.satisfaction ?? 70) * 10) / 10);
    expect(last.spend).toBe((state.snapshot.buildCost ?? 0) + state.extraSpend);
    expect(last.tasksDone).toBe(state.tasks.filter(task => task.status === '已完成').length);
    expect(last.tasksTotal).toBe(state.tasks.length);
    expect(last.activeEvents).toEqual(state.director!.events.filter(event => event.status === 'active').map(event => event.id));

    expect(replayFrameAt(state.replay, 6)).toBe(frames[6]);
    expect(replayFrameAt(state.replay, 6.9)).toBe(frames[6]);
    const sparse = {schema: 1 as const, events: [], serial: 1, frames: [frames[0], frames[5]]};
    expect(replayFrameAt(sparse, 3)).toBe(frames[0]);
    expect(replayFrameAt(sparse, 5)).toBe(frames[5]);
    expect(replayFrameAt({...sparse, frames: []}, 3)).toBeNull();
    expect(replayFrameAt(undefined, 3)).toBeNull();
  });

  it('长跑结束时刻即使不在采样间隔也会补记收尾帧', () => {
    const state = step(start(overloaded()), 1);
    state.minute = 301;
    state.status = 'finished';
    const frame = recordReplayFrame(state);
    expect(frame?.t).toBe(301);
    expect(state.replay!.frames.at(-1)?.t).toBe(301);
  });

  it('导出文件直接携带录制帧、事件与人物采样', () => {
    const state = step(start(overloaded()), 6);
    const payload = buildReplayExport(state, '测试回放', {items: []}, [{t: 6, people: []}]);
    expect(payload.kind).toBe('3minlab-replay');
    expect(payload.endMinute).toBe(state.minute);
    expect(payload.replay.frames).toEqual(state.replay!.frames);
    expect(payload.replay.events).toEqual(state.replay!.events);
    expect(payload.peopleFrames[0].t).toBe(6);
    expect(payload.fingerprint).toBe(state.snapshot.fingerprint);
  });
});

describe('V5 活动回放：事件日志', () => {
  it('开场、预警、升级与结束都写入同一导演事件的因果链，并且可复现', () => {
    const first = runUntilWarning(), second = runUntilWarning();
    expect(first.replay).toEqual(second.replay);
    expect(first.replay!.events[0]).toMatchObject({at: 0, kind: 'start', location: 'venue'});
    expect(first.replay!.events[0].detail).toContain(`${first.snapshot.people} 人`);

    const warning = directorWarnings(first)[0];
    const creation = first.replay!.events.find(event =>
      event.kind === 'director' && event.directorId === warning.id && event.title.startsWith('预警 ·'));
    expect(creation).toBeDefined();
    expect(creation!.at).toBe(warning.at);
    expect(creation!.reason).toBe(warning.reason);
    expect(creation!.chain).toEqual(warning.chain);
    expect(creation!.effects).toEqual(warning.effects);
    expect(creation!.severity).toBe(warning.severity);
    expect(creation!.location).toBeDefined();

    let state = step(first, warning.activeAt - first.minute + 1);
    const upgraded = state.replay!.events.find(event =>
      event.kind === 'director' && event.directorId === warning.id && event.title.startsWith('预警升级'));
    expect(upgraded).toBeDefined();
    expect(upgraded!.at).toBe(warning.activeAt);
    expect(upgraded!.reason).toBe(warning.reason);

    state = step(state, warning.until - state.minute + 1);
    const ended = state.replay!.events.find(event =>
      event.directorId === warning.id && /事件结束|正向链结束/.test(event.title));
    expect(ended).toBeDefined();
    expect(ended!.at).toBe(warning.until);
    expect(ended!.detail).toContain('签到');
  });

  it('预警窗口内的应对写入真实支出、化解原因与位置', () => {
    const state = runUntilWarning(50);
    const warning = directorWarnings(state)[0];
    expect(warning.mitigation).toBeDefined();
    const beforeSpend = state.extraSpend, beforeCount = state.replay!.events.length;
    const next = intervene(state, warning.mitigation!);
    const added = next.replay!.events.slice(beforeCount);

    const spendLog = added.find(event => event.kind === 'action' && event.cost !== undefined);
    expect(spendLog).toBeDefined();
    expect(spendLog!.cost).toBe(next.extraSpend - beforeSpend);
    expect(next.extraSpend).toBeGreaterThan(beforeSpend);
    expect(spendLog!.location).toBeDefined();
    expect(spendLog!.detail).toContain(`¥${spendLog!.cost}`);

    const prevented = added.find(event => event.directorId === warning.id && event.title.startsWith('预警化解'));
    expect(prevented).toBeDefined();
    expect(prevented!.reason).toBe(warning.reason);
    expect(prevented!.location).toBeDefined();
    expect(next.director!.events.find(event => event.id === warning.id)?.status).toBe('prevented');
  });

  it('天气变化进入时间线并可按分钟还原', () => {
    const state = step(start(overloaded()), 1);
    expect(logWeatherChange(state, 5, 'gale', 'lightRain', '小雨', '检查遮雨与防滑')).not.toBeNull();
    expect(logWeatherChange(state, 5, 'gale', 'lightRain', '小雨', '重复播报')).toBeNull();
    expect(logWeatherChange(state, 9, 'lightRain', 'sunny', '晴天', '撤除防雨布')).not.toBeNull();
    const events = state.replay!.events;
    expect(replayWeatherAt(events, 'gale', 4)).toBe('gale');
    expect(replayWeatherAt(events, 'gale', 5)).toBe('lightRain');
    expect(replayWeatherAt(events, 'gale', 9)).toBe('sunny');
    expect(events.filter(event => event.kind === 'weather' && event.at === 5)).toHaveLength(1);
  });
});
