import type {
  DirectorEventKind, ReplayEventKind, ReplayFrame, ReplayLogEntry, ReplaySpot, ReplayState, SimulationState,
} from './model';

const FRAME_LIMIT = 1200;
const EVENT_LIMIT = 240;

export function ensureReplay(s: SimulationState): ReplayState {
  return s.replay ??= {schema: 1, frames: [], events: [], serial: 1};
}

export function logReplay(s: SimulationState, entry: Omit<ReplayLogEntry, 'id'>): ReplayLogEntry | null {
  const replay = ensureReplay(s);
  if (entry.dedupe && replay.events.some(existing => existing.dedupe === entry.dedupe)) return null;
  const logged: ReplayLogEntry = {...entry, id: replay.serial++};
  replay.events.push(logged);
  if (replay.events.length > EVENT_LIMIT) replay.events = replay.events.slice(-EVENT_LIMIT);
  return logged;
}

/** Frame cadence stays dense early and samples every five minutes for long runs. */
function shouldRecord(minute: number) {
  return minute <= 300 || minute % 5 === 0;
}

export function recordReplayFrame(s: SimulationState): ReplayFrame | null {
  if (!shouldRecord(s.minute) && s.status !== 'finished') return null;
  const replay = ensureReplay(s);
  const metrics = s.director?.metrics;
  const events = s.director?.events ?? [];
  const frame: ReplayFrame = {
    t: s.minute, arrived: s.arrived, served: s.served, departed: s.departed, queue: s.queue,
    peakQueue: s.peakQueue, occupancy: Math.max(0, s.served - s.departed),
    capacityUse: metrics?.capacityUse ?? Math.min(1, Math.max(0, s.served - s.departed) / Math.max(1, s.parameters.capacity)),
    satisfaction: Math.round((s.satisfaction ?? 70) * 10) / 10, delay: s.delay, spend: s.baseSpend + s.extraSpend,
    risk: metrics?.risk ?? 0, queuePressure: metrics?.queuePressure ?? 0,
    crowdPressure: metrics?.crowdPressure ?? 0, staffLoad: metrics?.staffLoad ?? 0,
    comfort: metrics?.comfort ?? 0, atmosphere: metrics?.atmosphere ?? 0, progress: metrics?.progress ?? 0,
    tasksDone: s.tasks.filter(task => task.status === '已完成').length, tasksTotal: s.tasks.length,
    activeEvents: events.filter(event => event.status === 'active').map(event => event.id),
    warningEvents: events.filter(event => event.status === 'warning').map(event => event.id),
    incidents: s.incidents.filter(incident => incident.until > s.minute).map(incident => incident.id),
    weatherClosed: s.weatherClosed, equipmentDown: s.equipmentDown, supplyDown: s.supplyDown,
  };
  const last = replay.frames.at(-1);
  if (last && last.t === s.minute) replay.frames[replay.frames.length - 1] = frame;
  else replay.frames.push(frame);
  if (replay.frames.length > FRAME_LIMIT) replay.frames.splice(0, replay.frames.length - FRAME_LIMIT);
  return frame;
}

/** Nearest recorded frame at or before `minute`; never interpolates or invents values. */
export function replayFrameAt(replay: ReplayState | undefined, minute: number): ReplayFrame | null {
  const frames = replay?.frames;
  if (!frames?.length) return null;
  let low = 0, high = frames.length - 1, found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (frames[mid].t <= minute) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return frames[found];
}

export function replayWeatherAt(events: ReplayLogEntry[] | undefined, initial: string, minute: number): string {
  let value = initial;
  for (const event of events ?? []) {
    if (event.kind !== 'weather' || event.weather === undefined) continue;
    if (event.at > minute) break;
    value = event.weather;
  }
  return value;
}

export function logWeatherChange(
  s: SimulationState, minute: number, previous: string, next: string, name: string, detail: string,
): ReplayLogEntry | null {
  if (previous === next) return null;
  return logReplay(s, {
    at: minute, kind: 'weather', title: `天气转为${name}`,
    detail: `${detail}（${previous} → ${next}）`, location: 'venue',
    weather: next, dedupe: `weather:${minute}:${next}`,
  });
}

export function replaySpotForDirectorKind(kind: DirectorEventKind): ReplaySpot {
  switch (kind) {
    case 'queue': return 'checkin';
    case 'crowd': return 'venue';
    case 'weather': return 'field';
    case 'staff': return 'entrance';
    case 'medical': return 'medical';
    case 'equipment': return 'stage';
    case 'program': return 'stage';
    case 'comfort': return 'rest';
    case 'positive': return 'stage';
  }
}

export function replaySpotForAction(kind: string): ReplaySpot {
  if (kind === 'reserve') return 'entrance';
  if (kind === 'spare') return 'stage';
  if (kind === 'shelter') return 'venue';
  if (kind === 'supply') return 'checkin';
  if (kind === 'capacity') return 'queue';
  if (kind === 'medical') return 'medical';
  return 'rest';
}

export const REPLAY_STATE_GROUPS: Record<DirectorEventKind, string[]> = {
  queue: ['arriving', 'queueing', 'checkin'],
  crowd: ['arriving', 'queueing', 'checkin', 'toSeat', 'seated', 'watching'],
  weather: ['arriving', 'queueing', 'checkin', 'toSeat', 'watching', 'toRest'],
  staff: ['patrolling', 'serving', 'toGoal', 'queueing'],
  medical: ['seated', 'watching', 'resting', 'queueing'],
  equipment: ['toStage', 'performing', 'hosting', 'serving'],
  program: ['toStage', 'performing', 'hosting', 'toSeat', 'seated', 'watching'],
  comfort: ['toRest', 'resting', 'seated', 'watching'],
  positive: ['toSeat', 'seated', 'watching', 'performing'],
};

export function replayEventKindLabel(kind: ReplayEventKind): string {
  return ({
    start: '开场', director: '导演事件', incident: '突发故障', action: '现场应对',
    task: '流程节点', weather: '天气变化', milestone: '里程碑',
  })[kind];
}

export function buildReplayExport(
  state: SimulationState,
  title: string,
  layout: Record<string, unknown>,
  people: {t: number; people: unknown[]}[],
) {
  return {
    schema: 1, kind: '3minlab-replay', title,
    createdAt: new Date().toISOString(),
    fingerprint: state.snapshot.fingerprint,
    scene: state.snapshot.scene,
    people: state.snapshot.people,
    duration: state.snapshot.duration,
    endMinute: state.minute,
    parameters: state.parameters,
    snapshot: state.snapshot,
    layout,
    replay: state.replay ?? {schema: 1, frames: [], events: [], serial: 1},
    peopleFrames: people,
  };
}
