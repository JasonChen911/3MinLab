import { describe, expect, it } from 'vitest';
import { createBrief } from '../rules/intake';
import { generatePlan } from '../rules/generator';
import { clearLocalState, LEGACY_KEY, loadLocalState, saveLocalState, STORAGE_KEY } from './storage';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function memoryStore(): Store {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

const plan = generatePlan(createBrief('办一场 40 人的部门团建，预算 8000', { now: new Date('2026-11-01T10:00:00') }));

describe('本地存档 v2', () => {
  it('保存后可以原样读回', () => {
    const store = memoryStore();
    expect(saveLocalState({ recent: plan, favorites: [plan], history: [plan] }, store)).toBe(true);
    const loaded = loadLocalState(store);
    expect(loaded.error).toBeNull();
    expect(loaded.data.recent?.id).toBe(plan.id);
    expect(loaded.data.favorites).toHaveLength(1);
    expect(loaded.data.history).toHaveLength(1);
  });

  it('损坏的数据会回退为空状态而不是抛错', () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, '{ not json');
    const loaded = loadLocalState(store);
    expect(loaded.error).not.toBeNull();
    expect(loaded.data.history).toEqual([]);
  });

  it('过滤掉不符合 v2 结构的旧记录', () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, JSON.stringify({ recent: { id: 'x', selectedIds: [] }, favorites: [], history: [{ foo: 1 }] }));
    const loaded = loadLocalState(store);
    expect(loaded.data.recent).toBeNull();
    expect(loaded.data.history).toEqual([]);
  });

  it('不迁移 v1 的旧数据', () => {
    const store = memoryStore();
    store.setItem(LEGACY_KEY, JSON.stringify({ favorites: [{ id: 'old' }] }));
    expect(loadLocalState(store).data.history).toEqual([]);
  });

  it('历史记录最多保留 30 条', () => {
    const store = memoryStore();
    const many = Array.from({ length: 40 }, (_, index) => ({ ...plan, id: `plan-${index}` }));
    saveLocalState({ recent: many[0], favorites: [], history: many }, store);
    expect(loadLocalState(store).data.history).toHaveLength(30);
  });

  it('清除后返回空状态', () => {
    const store = memoryStore();
    saveLocalState({ recent: plan, favorites: [plan], history: [plan] }, store);
    expect(clearLocalState(store)).toBe(true);
    expect(loadLocalState(store).data.history).toEqual([]);
  });
});
