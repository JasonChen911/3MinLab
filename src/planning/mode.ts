import { getPreset } from '../data/presets';
import type { EventBrief, EventPlan, ModuleId, PlanningMode, PlanningStatus } from '../types';

export const LIGHT_MODULES: ModuleId[] = ['basic', 'audience', 'logistics', 'program', 'resources', 'risk'];
const COMPLETED: PlanningStatus[] = ['existing', 'not-needed', 'confirmed'];

export function recommendPlanningMode(brief: EventBrief): PlanningMode {
  const preset = getPreset(brief.presetId);
  if (preset?.planningMode) return preset.planningMode;
  if (['sports', 'startup', 'career'].includes(brief.family) || ['stadium', 'expo'].includes(brief.venue)) return 'full';
  if (brief.people >= 100 || brief.budget >= 30000) return 'full';
  if (brief.people <= 50 && ['social', 'arts', 'campus', 'education', 'generic'].includes(brief.family)) return 'light';
  return brief.people <= 30 ? 'light' : 'full';
}

export function modeOf(plan: EventPlan): PlanningMode {
  return plan.planningMode ?? plan.brief.planningMode ?? 'full';
}

export function coreModules(plan: EventPlan): ModuleId[] {
  if (modeOf(plan) === 'full') return plan.modules.map(module => module.id);
  const preset = getPreset(plan.brief.presetId);
  const ids = preset?.coreModules ?? LIGHT_MODULES;
  return ids.filter(id => plan.modules.some(module => module.id === id));
}

export function moduleStatus(plan: EventPlan, id: ModuleId): PlanningStatus {
  return plan.moduleStates?.[id]?.status ?? 'unhandled';
}

export function planningProgress(plan: EventPlan) {
  const ids = coreModules(plan);
  const weights = ids.map(id => modeOf(plan) === 'full' && plan.modules.find(m => m.id === id)?.weight === 'key' ? 2 : 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const done = ids.reduce((sum, id, index) => sum + (COMPLETED.includes(moduleStatus(plan, id)) ? weights[index] : 0), 0);
  return { done, total, percent: total ? Math.round(done / total * 100) : 0, applicable: ids.length };
}

export function setModuleStatus(plan: EventPlan, id: ModuleId, status: PlanningStatus, note = ''): EventPlan {
  const previous = plan.moduleStates?.[id];
  return { ...plan, moduleStates: { ...plan.moduleStates, [id]: {
    ...previous, status, note: note || previous?.note,
    confirmed: COMPLETED.includes(status), updatedAt: new Date().toISOString(),
  } } };
}

export function exportModules(plan: EventPlan) {
  const visible = new Set(coreModules(plan));
  return plan.modules.filter(module => visible.has(module.id) && moduleStatus(plan, module.id) !== 'not-needed');
}
