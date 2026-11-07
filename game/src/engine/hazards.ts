import type {Incident, RiskKind, SimulationState} from './model';
import type {Random} from './random';
import {difficultyProfile} from '../difficulty';

/** Shared hazard recorder: legacy Poisson hazards and the Event Director both use it. */
export function addIncident(s: SimulationState, kind: RiskKind, r: Random) {
  const profile = difficultyProfile(s.snapshot.difficulty);
  const severity = 1 + Math.floor(r.uniform() * 3);
  const duration = Math.max(1, Math.round(r.lognormal(s.parameters.repairMean * (kind === 'weather' ? 2 : 1), .6) * profile.repairScale));
  const cost = Math.round((kind === 'equipment' ? 200 : kind === 'price' ? 400 : kind === 'supply' ? 150 : 0) * severity * r.lognormal(1, .25) * profile.costScale);
  const messages = {
    equipment: `${s.snapshot.equipmentName}故障`, weather: '户外区域因天气暂时关闭',
    traffic: '交通波动使尚未到场人员延后', supply: '服务物资短缺，签到效率降低',
    price: '供应商临时调价', absence: '工作人员缺席',
  };
  const incident: Incident = {id: s.incidents.length + 1, kind, at: s.minute, until: s.minute + duration, severity, cost, message: messages[kind]};
  s.incidents.push(incident);
  s.extraSpend += cost;
  if (kind === 'traffic') s.arrivals = s.arrivals.map((t, i) => i >= s.arrived ? t + duration : t);
  return incident;
}
