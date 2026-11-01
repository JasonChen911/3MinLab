import { createWorkspace, type CustomTemplate, type Workspace } from './model';
import type { EventPlan } from '../types';
export const WORKSPACE_PREFIX = 'activity-tools-v1:';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export function loadWorkspace(plan: EventPlan, storage: Store = localStorage): { data: Workspace; error: string } {
  try {
    const raw = storage.getItem(WORKSPACE_PREFIX + plan.id);
    if (!raw) return { data: createWorkspace(plan), error: '' };
    const data = JSON.parse(raw) as Workspace;
    if (data.version !== 1 || data.activityId !== plan.id || !Array.isArray(data.documents) || !Array.isArray(data.people) || !Array.isArray(data.tools) || !data.athletics || !data.tables) throw new Error();
    return { data, error: '' };
  } catch { return { data: createWorkspace(plan), error: '活动资料读取失败，原始存档保留。请先导出备份并检查后再保存。' }; }
}
export function saveWorkspace(data: Workspace, storage: Store = localStorage) {
  try { storage.setItem(WORKSPACE_PREFIX + data.activityId, JSON.stringify(data)); return true; } catch { return false; }
}
export function loadTemplates(storage: Store = localStorage): CustomTemplate[] {
  try { const data = JSON.parse(storage.getItem('activity-template-library-v1') ?? '[]'); return Array.isArray(data) ? data.filter((item) => typeof item?.name === 'string' && Array.isArray(item.fields)) : []; } catch { return []; }
}
export function saveTemplates(data: CustomTemplate[], storage: Store = localStorage) {
  try { storage.setItem('activity-template-library-v1', JSON.stringify(data)); return true; } catch { return false; }
}
