import type {FacilityRuntime, SimulationState} from './model';
import type {Random} from './random';
import {logReplay} from './replay';

const initial = (): FacilityRuntime => ({toiletQueue: 0, vendorQueue: 0, toiletServed: 0, vendorServed: 0, restingStaff: 0, toiletCongested: false, vendorCongested: false});

/** Aggregate demand is sampled per minute; visual agents remain a representative subset. */
export function advanceFacilities(s: SimulationState, r: Random): FacilityRuntime {
  const runtime = s.facilities ??= initial();
  const facility = s.snapshot.facility;
  const occupancy = Math.max(0, s.served - s.departed);
  const toilets = facility?.counts.sanitation ?? 0;
  const vendors = facility?.vendorPoints ?? 0;
  const restBays = facility?.restBays ?? 0;
  // Demo demand rates, not historical probabilities. Queue state persists through saves.
  runtime.toiletQueue += r.poisson(occupancy * .005);
  runtime.vendorQueue += r.poisson(occupancy * (s.snapshot.scene === 'performance' || s.snapshot.scene === 'community' ? .007 : .003));
  const toiletDone = Math.min(runtime.toiletQueue, r.poisson(s.snapshot.simulationMode?(facility?.toiletServicePerMinute??toilets*2.4):toilets*2.4));
  const vendorDone = Math.min(runtime.vendorQueue, r.poisson((s.snapshot.simulationMode?(facility?.vendorServicePerMinute??vendors*1.6):vendors*1.6) * (s.actions.some(action => action.name.includes('后备人员')) ? 1.75 : 1)));
  runtime.toiletQueue -= toiletDone;
  runtime.vendorQueue -= vendorDone;
  runtime.toiletServed += toiletDone;
  runtime.vendorServed += vendorDone;
  runtime.restingStaff = Math.min(restBays, Math.max(0, s.availableStaff - s.assignedStaff));
  const workload = s.assignedStaff / Math.max(1, s.availableStaff);
  s.staffFatigue = Math.max(0, Math.min(1, (s.staffFatigue ?? 0) + workload * .006 - runtime.restingStaff / Math.max(1, s.availableStaff) * .014));
  for (const [key, queue, title, spot] of [
    ['toiletCongested', runtime.toiletQueue, '卫生间排队较长', 'rest'],
    ['vendorCongested', runtime.vendorQueue, '摊位排队较长', 'venue'],
  ] as const) {
    const crowded = queue >= 8;
    if (crowded === runtime[key]) continue;
    runtime[key] = crowded;
    logReplay(s, {at: s.minute, kind: 'milestone', tone: crowded ? 'warning' : 'positive',
      title: crowded ? title : `${title.replace('较长', '')}已缓解`,
      detail: crowded ? `当前有 ${queue} 人等待，服务能力不足会影响体验。` : `等待人数降至 ${queue} 人。`,
      location: spot});
  }
  if (runtime.toiletCongested) s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - .05);
  if (runtime.vendorCongested) s.satisfaction = Math.max(0, (s.satisfaction ?? 70) - .04);
  return runtime;
}
