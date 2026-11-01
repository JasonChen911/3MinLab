import type { EventPlan, LocalState } from '../types';

/* ============================================================
 * 本地存档 v2
 *
 * 与 v1（activity-lab-v1）不兼容：v1 存的是"环节组合方案"，
 * v2 存的是完整的 12 模块策划案。旧数据不迁移，避免脏数据。
 * ============================================================ */

export const STORAGE_KEY = 'event-planner-v2';
export const LEGACY_KEY = 'activity-lab-v1';
const MAX_SAVED = 30;

const empty = (): LocalState => ({ recent: null, favorites: [], history: [] });

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isPlan = (value: unknown): value is EventPlan => {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<EventPlan>;
  return (
    plan.version === 2 &&
    typeof plan.id === 'string' &&
    typeof plan.title === 'string' &&
    !!plan.brief &&
    typeof plan.brief === 'object' &&
    Array.isArray(plan.modules) &&
    plan.modules.length > 0
  );
};

export function loadLocalState(storage: StorageLike = localStorage): { data: LocalState; error: string | null } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { data: empty(), error: null };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid');

    const state = parsed as Partial<LocalState>;
    const history = Array.isArray(state.history) ? state.history.filter(isPlan) : [];
    const favorites = Array.isArray(state.favorites) ? state.favorites.filter(isPlan) : [];
    const recent = isPlan(state.recent) ? state.recent : null;

    return { data: { recent, favorites, history }, error: null };
  } catch {
    return { data: empty(), error: '读取本地方案失败，已使用空白工作台。' };
  }
}

export function saveLocalState(state: LocalState, storage: StorageLike = localStorage): boolean {
  try {
    const trimmed: LocalState = {
      recent: state.recent,
      favorites: state.favorites.slice(0, MAX_SAVED),
      history: state.history.slice(0, MAX_SAVED),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalState(storage: StorageLike = localStorage): boolean {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 是否存在旧版本数据（用于提示用户旧方案不会自动迁移） */
export function hasLegacyData(storage: StorageLike = localStorage): boolean {
  try {
    return !!storage.getItem(LEGACY_KEY);
  } catch {
    return false;
  }
}
