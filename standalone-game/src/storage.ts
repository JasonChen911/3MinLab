import {normalizeLayout, type Layout, type PersonSave} from './game';

export const KEY = '3minlab-standalone-event-simulator-v1';
export const DRAFT_KEY = '3minlab-standalone-draft-v1';
export const HISTORY_KEY = '3minlab-standalone-event-history-v1';
const MAX_SAVES = 20;
const MAX_VERSIONS = 10;
const MAX_BYTES = 4_500_000;
const MAX_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000;

export interface DraftSave {at: number; layout: Layout; settings?: Record<string, unknown>}
export interface HistoryVersion {at: number; label: string; layout: Layout; settings?: Record<string, unknown>}

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function readJson(key: string): unknown {
  const store = storage();
  if (!store) return null;
  try {
    let raw=store.getItem(key);
    // Migrate saves from the original standalone preview port without deleting them.
    // On a shared origin, never read the integrated game's legacy keys.
    if(!raw&&typeof location!=='undefined'&&location.port==='5180'){
      const legacy=key.replace('3minlab-standalone-','3minlab-');
      raw=store.getItem(legacy);
      if(raw)store.setItem(key,raw);
    }
    return JSON.parse(raw||'null');
  } catch { return null; }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) throw Error('当前环境不支持本地存档。');
  try { store.setItem(key, JSON.stringify(value)); }
  catch { throw Error('浏览器存储空间不足，保存失败；可清理旧存档后重试。'); }
}

function cleanPeople(value: unknown): PersonSave[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const people = value.filter((entry): entry is PersonSave => {
    if (!entry || typeof entry !== 'object') return false;
    const person = entry as PersonSave;
    return typeof person.id === 'string' && typeof person.role === 'string'
      && Number.isFinite(person.x) && Number.isFinite(person.z);
  });
  return people.length ? people : undefined;
}

/** Validate, sanitize and normalize before touching storage. Throws a readable reason. */
export function validateLayout(value: unknown): Layout {
  if (!value || typeof value !== 'object') throw Error('存档格式无效。');
  const raw = value as Layout;
  if (!raw.activity || typeof raw.activity.id !== 'string' || typeof raw.activity.title !== 'string') throw Error('存档缺少活动信息。');
  if (!Array.isArray(raw.items)) throw Error('存档缺少设施数据。');
  for (const item of raw.items) {
    if (!item || typeof item.id !== 'string' || typeof item.kind !== 'string' || !Number.isFinite(item.x) || !Number.isFinite(item.z)) {
      throw Error('存档包含无效设施坐标。');
    }
  }
  let size = 0;
  try { size = JSON.stringify(value).length; } catch { throw Error('存档包含无法序列化的数据。'); }
  if (size > MAX_BYTES) throw Error('存档过大，超出浏览器单次保存上限。');
  const safe: Layout = {
    ...raw,
    activity: {...raw.activity, tasks: Array.isArray(raw.activity.tasks) ? raw.activity.tasks : []},
    history: Array.isArray(raw.history) ? raw.history.slice(0, 10) : [],
    people: cleanPeople(raw.people),
  };
  return normalizeLayout(safe);
}

export function loadAll(): Layout[] {
  const value = readJson(KEY);
  if (!Array.isArray(value)) return [];
  const layouts: Layout[] = [];
  for (const entry of value) {
    try { layouts.push(validateLayout(entry)); } catch { /* skip corrupt records */ }
    if (layouts.length >= MAX_SAVES) break;
  }
  return layouts;
}

export function saveOne(layout: Layout): Layout {
  const saved = {...validateLayout(layout), savedAt: Date.now()};
  const all = loadAll().filter(entry => entry.activity.id !== saved.activity.id);
  all.unshift(saved);
  writeJson(KEY, all.slice(0, MAX_SAVES));
  return saved;
}

export function saveDraft(layout: Layout, settings?: Record<string, unknown>): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const safe = validateLayout(layout);
    if (!safe.run || safe.run.status === 'finished') return false;
    store.setItem(DRAFT_KEY, JSON.stringify({at: Date.now(), layout: safe, settings}));
    return true;
  } catch { return false; }
}

export function loadDraft(): DraftSave | null {
  const value = readJson(DRAFT_KEY) as Partial<DraftSave> | null;
  if (!value || !Number.isFinite(value.at) || !value.layout) return null;
  if (Date.now() - (value.at ?? 0) > MAX_DRAFT_AGE) { clearDraft(); return null; }
  try {
    const settings = value.settings && typeof value.settings === 'object' ? value.settings : undefined;
    const layout = validateLayout(value.layout);
    if (!layout.run || layout.run.status === 'finished') { clearDraft(); return null; }
    return {at: value.at!, layout, settings};
  } catch { clearDraft(); return null; }
}

export function clearDraft() {
  try { storage()?.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function versionSignature(layout: Layout) {
  return JSON.stringify([layout.activity.id, layout.run?.minute ?? -1, layout.items.length, layout.activity.people, layout.weather, layout.activity.tasks.length]);
}

export function loadVersions(): HistoryVersion[] {
  const value = readJson(HISTORY_KEY);
  if (!Array.isArray(value)) return [];
  const versions: HistoryVersion[] = [];
  for (const entry of value) {
    const raw = entry as Partial<HistoryVersion>;
    if (!raw || !Number.isFinite(raw.at) || typeof raw.label !== 'string' || !raw.layout) continue;
    try {
      versions.push({
        at: raw.at!, label: raw.label, layout: validateLayout(raw.layout),
        settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : undefined,
      });
    } catch { /* skip corrupt version */ }
    if (versions.length >= MAX_VERSIONS) break;
  }
  return versions;
}

export function pushVersion(layout: Layout, label: string, settings?: Record<string, unknown>): HistoryVersion[] {
  const list = loadVersions();
  if (list[0] && versionSignature(list[0].layout) === versionSignature(layout) && list[0].label === label) return list;
  try {
    list.unshift({at: Date.now(), label, layout: validateLayout(layout), settings});
    const next = list.slice(0, MAX_VERSIONS);
    writeJson(HISTORY_KEY, next);
    return next;
  } catch { return list; }
}

export function clearVersions() {
  try { storage()?.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}
