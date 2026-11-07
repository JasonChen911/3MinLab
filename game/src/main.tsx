import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import Scene3D, {type CameraAction, type Quality, type Tool} from './Scene3D';
import type {DebugStats} from './world/debug';
import {
  CATALOG, ROLE_LABELS, alignItems, applyDifficulty, batchMove, batchRotate, bounds, capacityOf, cost, evaluate, freshLayout, importBackup, issues, itemCost, placement,
  reconcile, roleCounts, start, step, intervene,
  type BatchResult, type Facility, type Intervention, type Item, type Kind, type Layout, type PersonSave, type SimulationState, type WeatherKind,
} from './game';
import {PERSON_STATE_LABELS, type PersonInfo} from './world/people';
import {NEED_LABELS, TRAIT_LABELS, needPercent, type Personality, type NeedKey} from './world/personality';
import {defaultWorld} from './world/worldgen';
import {VENUES, VENUE_SIZES, makeVenueItems, recommendedVenues, venueCapacity, venueDefinition, venueDimensions, venueForScene, venueIsRecommended, venueLabel, venueVariant, type VenueSize} from './venues';
import {venueThumbUrl} from './venueThumb';
import {nextWeatherChange, suggestWeatherPreparation, weatherAt, weatherProfile} from './world/weather';
import {describePhysics, physicsFor} from './world/physics';
import {analyzeFacilities, facilityImpact, FACILITY_ROLE_LABELS} from './facilities';
import {analysisMarks as marksForAnalysis, analyzeLayout, optimizeLayout, type AnalysisFinding, type OptimizationPlan, type PreviewGhost} from './analysis';
import {DIRECTOR_MITIGATION_LABELS, directorActiveEvents, directorWarnings} from './engine/director';
import {
  CHALLENGE_GOAL_METRICS, CHALLENGE_INTENSITIES, CHALLENGE_METRICS, challengeGoalLabel, defaultChallenge,
  formatChallengeValue, normalizeChallenge,
} from './challenge';
import type {ChallengeConfig, ChallengeGoal, ChallengeMetric, ChallengeOperator} from './engine/model';
import {
  REPLAY_STATE_GROUPS, buildReplayExport, logReplay, logWeatherChange, replayEventKindLabel,
  replayFrameAt, replaySpotForDirectorKind, replayWeatherAt, timelineTone,
} from './engine/replay';
import type {MoneyTransaction, ReplayFrame, ReplayLogEntry, ReplaySpot} from './engine/model';
import {clearDraft, clearVersions, loadAll, loadDraft, loadVersions, pushVersion, saveDraft, saveOne, type HistoryVersion} from './storage';
import {awardActivity, levelProgress, loadProfile, saveProfile, syncUnlocks, type PlayerProfile} from './progression';
import {
  CHALLENGE_PRESETS, DIFFICULTIES, DIFFICULTY_ORDER, challengeLock, difficultyProfile, evaluateDifficulty,
  facilityLock, nextUnlocks, sceneLock, type DifficultyMetric, type DifficultyOutcome, type DifficultyReward, type DifficultyTier, type Unlockable,
} from './difficulty';
import {analyticsCsv, buildAnalytics, type AnalyticsReport, type TrajectoryGroup} from './analytics';
import type {LightingPreset} from './world/city';
import {layoutFromPlan,layoutFromTemplate,readBridge,saveResult} from './integration';
import './style.css';
import './v3.css';
import './integration.css';

const scenes = [
  ['custom', '自定义'], ['athletics', '田径运动会'], ['sports', '体育赛事'], ['performance', '音乐节'],
  ['conference', '学术讲座'], ['business', '商务会议'], ['competition', '创新创业比赛'],
  ['charity', '公益志愿'], ['community', '校园迎新 / 文化节'],
] as const;
const sceneNames = Object.fromEntries(scenes) as Record<string, string>;
const actions: {kind: Intervention; label: string}[] = [
  {kind: 'reserve', label: '调配后备人员'}, {kind: 'spare', label: '启用备用设备'},
  {kind: 'shelter', label: '转入室内'}, {kind: 'supply', label: '补充物资'}, {kind: 'capacity', label: '增开等候区'},
  {kind: 'medical', label: '医疗支援'}, {kind: 'comfort', label: '补给休息物资'},
];
const statusLabels: Record<SimulationState['status'], string> = {ready: '待开始', running: '进行中', finished: '已结束'};
const toolCategories: Record<'build' | 'road' | 'decor', string[]> = {
  build: ['活动', '观众', '设备', '管理', '安全', '其他'],
  road: ['道路'],
  decor: ['绿植', '装饰'],
};
const tools: {id: Tool; label: string; icon: string; key: string; hint: string}[] = [
  {id: 'select', label: '选择', icon: '↖', key: 'V', hint: '左键选择/拖动，右键旋转，拖框多选'},
  {id: 'observe', label: '观察', icon: '◎', key: 'O', hint: '仅观察场景：不选中、不移动设施'},
  {id: 'build', label: '建造', icon: '▦', key: 'B', hint: '舞台、观众、设备与管理设施'},
  {id: 'road', label: '道路', icon: '═', key: 'N', hint: '主干道与人行小路'},
  {id: 'decor', label: '装饰', icon: '♧', key: 'G', hint: '绿植、路灯、长椅与喷泉'},
  {id: 'delete', label: '删除', icon: '⌫', key: 'X', hint: '点击设施移除，可撤销'},
];
const paramsList: [keyof Layout['params'], string][] = [
  ['seed', '模拟随机种子'], ['checkinStaff', '签到人员'], ['capacity', '场地容量'],
  ['attendance', '到场概率'], ['absence', '缺席概率'], ['equipmentRate', '设备故障 / 小时'],
  ['weatherRate', '天气事件 / 小时'], ['serviceRate', '每人签到速率'],
];
const equipmentKinds: Kind[] = ['speaker', 'screen', 'light'];
const stageKinds: Kind[] = ['stage', 'stageSmall', 'stageLarge'];
const storageKey = '3minlab-v3-guide';
const settingsKey = '3minlab-game-settings-v1';
const SPEEDS = [0.5, 1, 2, 4] as const;
const REPLAY_SPEEDS = [1, 2, 4] as const;
const REPLAY_CAMERAS: {id: ReplayCamera; label: string; spot: ReplaySpot}[] = [
  {id: 'overview', label: '全景', spot: 'venue'},
  {id: 'checkin', label: '入口 / 签到', spot: 'checkin'},
  {id: 'stage', label: '舞台', spot: 'stage'},
  {id: 'rest', label: '休息区', spot: 'rest'},
  {id: 'medical', label: '医疗点', spot: 'medical'},
];
const id = () => crypto.randomUUID();

type ReplayCamera = 'overview' | 'checkin' | 'stage' | 'rest' | 'medical';
interface ReplayView {
  minute: number; playing: boolean; speed: 1 | 2 | 4; camera: ReplayCamera; selected: string;
}
interface PeopleFrame {t: number; people: PersonSave[]}

const replayKindMark: Record<string, string> = {start: '●', director: '◆', incident: '▲', action: '✦', task: '▸', weather: '☁', milestone: '★'};

function compactPerson(person: PersonSave): PersonSave {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    ...person, x: round(person.x), y: person.y === undefined ? 0 : round(person.y), z: round(person.z),
    rotation: person.rotation === undefined ? 0 : round(person.rotation),
    path: (person.path ?? []).slice(0, 8).map(point => ({x: round(point.x), z: round(point.z)})),
  };
}

function nearestPeopleFrame(frames: PeopleFrame[], minute: number): PeopleFrame | null {
  if (!frames.length) return null;
  let found = frames[0];
  for (const frame of frames) {
    if (frame.t > minute) break;
    found = frame;
  }
  return found;
}

function drawFacilityFootprints(ctx: CanvasRenderingContext2D, layout: Layout, width: number, height: number, pad: number) {
  const half = layout.size / 2;
  const scaleX = (width - pad * 2) / layout.size;
  const scaleZ = (height - pad * 2) / layout.size;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.strokeStyle = 'rgba(47,84,63,.34)';
  ctx.lineWidth = 1;
  for (const item of layout.items) {
    const box = bounds(item);
    const x = pad + (item.x + half) * scaleX;
    const z = pad + (item.z + half) * scaleZ;
    const w = Math.max(2, box.w * scaleX);
    const d = Math.max(2, box.d * scaleZ);
    ctx.fillRect(x - w / 2, z - d / 2, w, d);
    ctx.strokeRect(x - w / 2, z - d / 2, w, d);
  }
  ctx.restore();
}

function drawHeatmap(canvas: HTMLCanvasElement, report: AnalyticsReport, layout: Layout) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width, height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f5faf2';
  ctx.fillRect(0, 0, width, height);
  const {cols, rows, cells, max} = report.heat;
  const cellW = width / cols, cellH = height / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const count = cells[row * cols + col];
      if (!count) continue;
      const ratio = count / Math.max(1, max);
      ctx.fillStyle = `hsla(${Math.round(138 - ratio * 132)}, 78%, ${Math.round(54 - ratio * 10)}%, ${.16 + ratio * .72})`;
      ctx.fillRect(col * cellW, row * cellH, cellW + .5, cellH + .5);
    }
  }
  ctx.strokeStyle = 'rgba(55,96,74,.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= cols; i += 4) {
    ctx.beginPath(); ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cellH); ctx.lineTo(width, i * cellH); ctx.stroke();
  }
  drawFacilityFootprints(ctx, layout, width, height, 0);
  const half = layout.size / 2;
  report.heat.hotspots.slice(0, 3).forEach((spot, index) => {
    const x = (spot.x + half) / layout.size * width;
    const y = (spot.z + half) / layout.size * height;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fill();
    ctx.strokeStyle = '#c9473b';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#a8332a';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), x, y + .5);
  });
}

function drawCurves(canvas: HTMLCanvasElement, report: AnalyticsReport) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width, height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fbfdf8';
  ctx.fillRect(0, 0, width, height);
  const points = report.curves;
  if (!points.length) {
    ctx.fillStyle = '#7b9485';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('开始模拟后会记录逐分钟趋势', width / 2, height / 2);
    return;
  }
  const pad = {l: 30, r: 8, t: 18, b: 10};
  const gap = 20;
  const panelHeight = (height - pad.t - pad.b - gap) / 2;
  const innerWidth = width - pad.l - pad.r;
  const xAt = (index: number) => pad.l + (points.length === 1 ? innerWidth / 2 : index / (points.length - 1) * innerWidth);
  const panel = (values: number[], max: number, color: string, title: string, top: number) => {
    ctx.fillStyle = '#688272';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, pad.l, top - 5);
    ctx.strokeStyle = 'rgba(70,105,84,.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = top + panelHeight - i / 2 * panelHeight;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#8aa293';
      ctx.font = '8px system-ui';
      ctx.fillText(String(Math.round(max * i / 2)), 2, y + 3);
    }
    const yAt = (value: number) => top + panelHeight - (max ? Math.max(0, Math.min(1, value / max)) : 0) * panelHeight;
    ctx.beginPath();
    values.forEach((value, index) => {
      if (index) ctx.lineTo(xAt(index), yAt(value));
      else ctx.moveTo(xAt(index), yAt(value));
    });
    if (values.length === 1) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xAt(0), yAt(values[0]), 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
      const last = values.length - 1;
      ctx.lineTo(xAt(last), top + panelHeight);
      ctx.lineTo(xAt(0), top + panelHeight);
      ctx.closePath();
      ctx.fillStyle = `${color}20`;
      ctx.fill();
    }
  };
  const queue = points.map(point => point.queue);
  const satisfaction = points.map(point => point.satisfaction);
  panel(queue, Math.max(1, ...queue), '#2f7de1', `排队人数 · 峰值 ${Math.max(...queue)}`, pad.t);
  panel(satisfaction, 100, '#2f9e63', '满意度 · 0-100', pad.t + panelHeight + gap);
  ctx.fillStyle = '#8aa293';
  ctx.font = '8px system-ui';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(`${points[0].t}′`, pad.l, height - 1);
  ctx.textAlign = 'right';
  ctx.fillText(`${points.at(-1)!.t}′`, width - pad.r, height - 1);
}

function drawTrajectories(canvas: HTMLCanvasElement, report: AnalyticsReport, layout: Layout) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width, height = canvas.height;
  const pad = 8;
  const half = layout.size / 2;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fbfdf8';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(55,96,74,.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = pad + i / 4 * (width - pad * 2);
    const y = pad + i / 4 * (height - pad * 2);
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, height - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
  }
  drawFacilityFootprints(ctx, layout, width, height, pad);
  const scaleX = (width - pad * 2) / layout.size;
  const scaleZ = (height - pad * 2) / layout.size;
  const visitor = new Set(['participant', 'audience']);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const trajectory of report.trajectories) {
    ctx.beginPath();
    trajectory.points.forEach((point, index) => {
      const x = pad + (point.x + half) * scaleX;
      const y = pad + (point.z + half) * scaleZ;
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = visitor.has(trajectory.role) ? '#2f7de1' : '#d98b32';
    ctx.globalAlpha = .68;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (!report.trajectories.length) {
    ctx.fillStyle = '#7b9485';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('暂无可重构的移动轨迹', width / 2, height / 2);
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch { return false; }
  }
}

function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || '活动';

type QualityPreference = 'auto' | Quality;
interface GameSettings {
  sensitivity: number;
  quality: QualityPreference;
  shadows: boolean;
  sound: boolean;
  music: boolean;
  autosave: boolean;
  snap: boolean;
  debug: boolean;
}
const defaultSettings: GameSettings = {sensitivity: 1, quality: 'auto', shadows: true, sound: false, music: false, autosave: true, snap: true, debug: false};

function loadSettings(): GameSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(settingsKey) || 'null') as Partial<GameSettings> | null;
    return raw ? {...defaultSettings, ...raw} : defaultSettings;
  } catch { return defaultSettings; }
}

function recommendedQuality(): Quality {
  const memory = (navigator as Navigator & {deviceMemory?: number}).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (memory <= 4 || cores <= 4) return 'low';
  if (memory >= 8 && cores >= 8) return 'high';
  return 'medium';
}

function resolveQuality(preference: QualityPreference): Quality {
  return preference === 'auto' ? recommendedQuality() : preference;
}

function presetItems(items: [Kind, number, number, number?][]): Item[] {
  return items.map(([kind, x, z, rotation = 0]) => ({id: id(), kind, x, z, rotation, height: 1, scale: 1}));
}

const presetActivities: {id: string; label: string; caption: string; make: () => Layout}[] = [
  {id: 'track', label: '田径运动会', caption: '跑道 · 观众席 · 检录', make: () => freshLayout('athletics')},
  {id: 'festival', label: '音乐节', caption: '主舞台 · 音响 · 灯光', make: () => freshLayout('performance')},
  {id: 'welcome', label: '校园迎新', caption: '广场 · 摊位 · 咨询台', make: () => freshLayout('community')},
  {id: 'camp', label: '露营活动', caption: '草坪 · 帐篷 · 休息区', make: () => {
    const layout = freshLayout('community');
    layout.activity = {...layout.activity, title: '露营活动', people: 80, budget: 12000};
    layout.terrain = 'grass';
    layout.items = presetItems([
      ['entrance', 0, 20], ['checkinSmall', 5, 20], ['rest', 11, 10], ['stageSmall', 0, -15],
      ['tent', -11, -8], ['tent', -4, -8], ['tent', 3, -8], ['tent', 10, -8],
      ['tentSmall', -11, 1], ['tentSmall', -7, 1], ['bin', -18, 19], ['bin', 18, 19],
      ['tree', -18, -17], ['tree', 18, -17], ['flower', -18, 8], ['flower', 18, 8],
      ['path', 0, 14], ['path', 0, 10], ['path', 0, 6], ['path', 0, 2], ['path', 0, -2],
    ]);
    return layout;
  }},
  {id: 'market', label: '校园市集', caption: '摊位 · 主通道 · 服务台', make: () => {
    const layout = freshLayout('community');
    layout.activity = {...layout.activity, title: '校园市集', people: 120, budget: 9000};
    layout.terrain = 'plaza';
    layout.items = presetItems([
      ['entrance', 0, 20], ['checkinSmall', 5, 20], ['service', 16, 14], ['podium', 0, -11],
      ['tentSmall', -12, 6], ['tentSmall', -6, 6], ['tentSmall', 0, 6], ['tentSmall', 6, 6], ['tentSmall', 12, 6],
      ['bin', -18, 18], ['bin', 18, 18], ['lamp', -10, 14], ['lamp', 10, 14], ['bench', 0, 16],
      ['path', 0, 12], ['path', 0, 8], ['path', 0, 2], ['path', 0, -2], ['path', 0, -6],
    ]);
    return layout;
  }},
];

function freeWorldLayout(): Layout {
  const layout = freshLayout('custom');
  layout.activity = {...layout.activity, title: '自由世界活动'};
  layout.items = [];
  layout.volunteers = 4;
  return layout;
}

function icon(kind: Kind) {
  if (['stage', 'stageSmall', 'stageLarge', 'podium', 'backdrop'].includes(kind)) return '▤';
  if (['chair', 'bleachers'].includes(kind)) return '▥';
  if (['tent', 'tentSmall'].includes(kind)) return '⌂';
  if (['checkin', 'checkinSmall', 'checkinLarge', 'service'].includes(kind)) return '▣';
  if (kind === 'roadCurve') return '↱';
  if (['road', 'path'].includes(kind)) return '═';
  if (['tree', 'flower', 'bush', 'planter'].includes(kind)) return '♧';
  if (['speaker', 'light', 'screen'].includes(kind)) return '◉';
  if (['entrance', 'fence', 'sign'].includes(kind)) return '↗';
  if (kind === 'bench') return '▭';
  if (kind === 'fountain') return '◌';
  return '◆';
}
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const money = (value: number) => `¥${Math.round(value).toLocaleString()}`;
const sizeText = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const formatDifficultyValue = (metric: DifficultyMetric, value: number) => {
  if (metric === 'satisfaction') return `${Math.round(value)}/100`;
  if (metric === 'peakQueuePct') return `${value.toFixed(1)}%`;
  if (metric === 'delay') return `${Math.round(value)} 分钟`;
  if (metric === 'spendOver') return value > 0 ? `超支 ¥${Math.round(value).toLocaleString()}` : `结余 ¥${Math.round(-value).toLocaleString()}`;
  if (metric === 'timeout' || metric === 'weatherClosed') return value >= 1 ? '是' : '否';
  return String(Math.round(value));
};

function App() {
  const [bridge]=useState(readBridge);
  const [importOpen,setImportOpen]=useState(()=>location.hash.startsWith('#import')||location.hash==='#start');
  const [importId,setImportId]=useState(()=>location.hash.startsWith('#import/')?location.hash.slice(8):'');
  const [importVenue,setImportVenue]=useState('');
  const [createAnother,setCreateAnother]=useState(false);
  const [importMode,setImportMode]=useState<'recommended'|'choose'|'free'>('recommended');
  const [layout, setLayout] = useState<Layout>(() => loadAll()[0] ?? freshLayout());
  const [saved, setSaved] = useState(loadAll);
  const [selected, setSelected] = useState('');
  const [selectedMany, setSelectedMany] = useState<string[]>([]);
  const [selectedPerson, setSelectedPerson] = useState('');
  const [personInfo, setPersonInfo] = useState<PersonInfo | null>(null);
  const [place, setPlace] = useState<Kind | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [search, setSearch] = useState('');
  const [continuous, setContinuous] = useState(false);
  const [mode, setMode] = useState<'build' | 'simulate'>('build');
  const [state, setState] = useState<SimulationState | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | NonNullable<ReplayLogEntry['tone']>>('all');
  const [timelineSelected, setTimelineSelected] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeDraft, setChallengeDraft] = useState<ChallengeConfig>(() => defaultChallenge());
  const [panelOpen, setPanelOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null);
  const [message, setMessage] = useState('在中央建设区放置设施，或先从左侧选择一项工具。');
  const [preview, setPreview] = useState('');
  const [cameraAction, setCameraAction] = useState<CameraAction | null>(null);
  const [history, setHistory] = useState<Item[][]>([]);
  const [future, setFuture] = useState<Item[][]>([]);
  const [clipboard, setClipboard] = useState<Item | null>(null);
  const [profile, setProfile] = useState<PlayerProfile>(() => syncUnlocks(loadProfile()));
  const [lastReward, setLastReward] = useState<{outcome: DifficultyOutcome; reward: DifficultyReward} | null>(null);
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem(storageKey) !== 'done');
  const [versions, setVersions] = useState<HistoryVersion[]>(loadVersions);
  const [draft, setDraft] = useState(() => loadDraft());
  const [savedAt, setSavedAt] = useState<number | null>(() => loadAll()[0]?.savedAt ?? null);
  const [replay, setReplay] = useState<ReplayView | null>(null);
  const [restorePeople, setRestorePeople] = useState<PersonSave[] | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisPreview, setAnalysisPreview] = useState<OptimizationPlan | null>(null);
  const [analysisMarksOn, setAnalysisMarksOn] = useState(true);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsGroup, setAnalyticsGroup] = useState<TrajectoryGroup>('all');
  const [showcase, setShowcase] = useState(false);
  const [lighting, setLighting] = useState<LightingPreset>('day');
  const [autoRotate, setAutoRotate] = useState(false);
  const peopleTimeline = useRef<PeopleFrame[]>([]);
  const heatCanvas = useRef<HTMLCanvasElement>(null);
  const curveCanvas = useRef<HTMLCanvasElement>(null);
  const trajectoryCanvas = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<(() => string | null) | null>(null);
  const replayRef = useRef<ReplayView | null>(null);
  replayRef.current = replay;
  const peopleRef = useRef<PersonSave[] | null>(null);
  const peopleProvider = useRef<(() => PersonSave[] | null) | null>(null);
  const snapshotPeople = () => {
    const live = peopleProvider.current?.();
    if (live?.length) { peopleRef.current = live; return live; }
    return peopleRef.current ?? undefined;
  };
  const latest = useRef({layout, state, settings});
  latest.current = {layout, state, settings};
  const lastSoundIncident = useRef(0);
  const awardPending = useRef(false);
  const lastNudge = useRef<Record<string, number>>({});
  const weatherWarned = useRef(-1);
  const file = useRef<HTMLInputElement>(null);

  const chosen = layout.items.find(i => i.id === selected);
  const selectedItems = layout.items.filter(item => selectedMany.includes(item.id));
  const multiCount = selectedItems.length;
  const venue = venueDefinition(layout.venueId);
  const variantInfo = venueVariant(layout.venueId, layout.venueVariant ?? 'medium');
  const indoor = layout.indoor ?? venue.type === 'indoor';
  const weather = weatherProfile(layout.weather);
  const venueCap = venueCapacity(layout.venueId, layout.venueVariant ?? 'medium');
  const budgetMode = layout.budgetMode ?? 'unlimited';
  const warnings = issues(layout);
  const facility = state?.snapshot.facility ?? analyzeFacilities(layout, CATALOG);
  const alerts = directorWarnings(state);
  const activeDirectorEvents = directorActiveEvents(state);
  const satisfaction = Math.round(state?.satisfaction ?? 70);
  const challenge = layout.challenge;
  const challengeResult = state?.challenge;
  const eventCount = state?.replay?.events.length ?? 0;
  const timelineEvents = (state?.replay?.events ?? []).filter(entry => timelineFilter === 'all' || timelineTone(entry) === timelineFilter);
  const facilityTransactions: MoneyTransaction[] = layout.items.filter(item => itemCost(item) > 0).map(item => ({id: `facility:${item.id}`, at: 0, title: CATALOG[item.kind].name, amount: itemCost(item), category: 'facility', sourceId: item.id}));
  const moneyTransactions = [...facilityTransactions, ...(state?.transactions ?? (state?.extraSpend ? [{id:'incident:legacy',at:state.minute,title:'旧存档应急支出汇总',amount:state.extraSpend,category:'incident' as const,sourceId:'legacy'}] : []))];
  const replayMax = state?.replay?.frames.at(-1)?.t ?? state?.minute ?? 0;
  const replayFrame: ReplayFrame | null = replay ? replayFrameAt(state?.replay, replay.minute) : null;
  const replayEvents: ReplayLogEntry[] = state?.replay?.events ?? [];
  const replayPeopleFrame = replay ? nearestPeopleFrame(peopleTimeline.current, replay.minute) : null;
  const replayPeople = replayPeopleFrame?.people ?? null;
  const selectedReplayEvent = replay
    ? replayEvents.find(entry => String(entry.id) === replay.selected)
      ?? [...replayEvents].reverse().find(entry => entry.at <= replay.minute)
      ?? null
    : null;
  const replayWeather = state && replay ? replayWeatherAt(replayEvents, layout.weather ?? 'sunny', replay.minute) : null;
  const layoutAnalysis = useMemo(
    () => analysisOpen && mode === 'build' ? analyzeLayout(layout) : null,
    [analysisOpen, mode, layout],
  );
  const analysisMarkers = useMemo(
    () => analysisOpen && mode === 'build' && analysisMarksOn ? marksForAnalysis(layoutAnalysis) : [],
    [analysisOpen, mode, analysisMarksOn, layoutAnalysis],
  );
  const analysisErrors = layoutAnalysis?.findings.filter(finding => finding.severity === 'error') ?? [];
  const analysisWarnings = layoutAnalysis?.findings.filter(finding => finding.severity === 'warning') ?? [];
  const analysisGhosts = useMemo<PreviewGhost[]>(() => {
    if (!analysisPreview) return [];
    return analysisPreview.changes.flatMap(change => {
      const ghosts: PreviewGhost[] = [];
      if (change.kind === 'add' && change.item) ghosts.push({id: `${change.id}-ghost`, item: change.item, color: 0x49b6ff});
      if (change.kind === 'anchor' && change.item) ghosts.push({id: `${change.id}-ghost`, item: change.item, color: 0xffb84d});
      if (change.kind === 'move' && change.item) {
        ghosts.push({id: `${change.id}-to`, item: change.item, color: 0x57d38c});
        const original = layout.items.find(item => item.id === change.itemId);
        if (original) ghosts.push({
          id: `${change.id}-from`, color: 0xff6b6b, flat: true,
          item: {...original, x: change.from?.x ?? original.x, z: change.from?.z ?? original.z},
        });
      }
      return ghosts;
    });
  }, [analysisPreview, layout.items]);
  const analyticsReport = useMemo(
    () => analyticsOpen ? buildAnalytics(layout, state, peopleTimeline.current, analyticsGroup) : null,
    [analyticsOpen, layout, state, analyticsGroup],
  );
  const visibleMinute = replay ? replay.minute : state?.minute ?? 0;
  const visibleProgress = replay
    ? (replayMax ? replay.minute / replayMax * 100 : 0)
    : Math.min(100, (state?.minute ?? 0) / Math.max(1, layout.activity.duration) * 100);
  const used = cost(layout.items);
  const left = layout.activity.budget - used;
  const rating = evaluate(layout, state);
  const level = levelProgress(profile);
  const tier = layout.difficulty ?? 'normal';
  const tierInfo = difficultyProfile(tier);
  const difficultyOutcome = state?.status === 'finished' ? evaluateDifficulty(layout, state, rating.score) : null;
  const upcomingUnlocks = nextUnlocks(profile, 3);
  const editable = mode === 'build';
  const chosenLocked = !!chosen?.locked;
  const activeTrayTool = tool as 'build' | 'road' | 'decor';
  const activeTray = mode === 'build' && (tool === 'build' || tool === 'road' || tool === 'decor');
  const trayKinds = activeTray
    ? (Object.entries(CATALOG) as [Kind, Facility][]).filter(([, v]) => toolCategories[activeTrayTool].includes(v.group) && (v.name.includes(search) || (v.description ?? '').includes(search)))
    : [];
  const goals = [
    {label: '设置出入口', done: layout.items.some(i => i.kind === 'entrance')},
    {label: '布置签到区', done: layout.items.some(i => i.kind.startsWith('checkin'))},
    {label: '安排活动主区域', done: layout.items.some(i => ['stage', 'stageSmall', 'stageLarge', 'podium', 'bleachers'].includes(i.kind))},
    {label: '保留应急预算', done: left >= layout.activity.budget * .1},
  ];
  const runtime = !chosen ? '' : chosen.locked ? '已锁定'
    : mode === 'simulate' && state
      ? state.equipmentDown && equipmentKinds.includes(chosen.kind) ? '设备故障'
        : state.weatherClosed && stageKinds.includes(chosen.kind) ? '天气关闭' : '运行正常'
      : '待运行';
  const runtimeBad = runtime === '设备故障' || runtime === '天气关闭';
  const progress = state ? Math.min(100, state.minute / Math.max(1, layout.activity.duration) * 100) : 0;
  const challengeDraftIssues: string[] = [];
  if (!challengeDraft.goals.length) challengeDraftIssues.push('至少设置一个达成目标，否则挑战无法判定完成');
  if (layout.activity.people > venueCap) challengeDraftIssues.push(`参与人数 ${layout.activity.people} 超过场地容量 ${venueCap}`);
  const budgetFailRule = challengeDraft.fails.find(rule => rule.metric === 'spend' && rule.operator === 'atLeast');
  if (budgetFailRule && used >= budgetFailRule.target) challengeDraftIssues.push(`设施成本 ${money(used)} 已达到预算失败线 ${money(budgetFailRule.target)}，开始即会失败`);
  if (!challengeDraft.fails.length) challengeDraftIssues.push('未设置失败条件：只会判定目标是否达成');
  const quality = resolveQuality(settings.quality);
  const patchSettings = (patch: Partial<GameSettings>) => setSettings(prev => ({...prev, ...patch}));
  const recordPeopleSample = (minute: number, people: PersonSave[]) => {
    const list = peopleTimeline.current;
    const frame: PeopleFrame = {t: minute, people: people.map(compactPerson)};
    const index = list.findIndex(entry => entry.t === minute);
    if (index >= 0) list[index] = frame;
    else list.push(frame);
    list.sort((a, b) => a.t - b.t);
    if (list.length > 600) list.splice(0, list.length - 600);
  };

  useEffect(() => {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!settings.autosave) return;
    try {
      const savedNow = saveOne({...layout, people: snapshotPeople() ?? layout.people});
      setSaved(loadAll());
      setSavedAt(savedNow.savedAt ?? Date.now());
    } catch (e) { setMessage((e as Error).message); }
  }, [layout, settings.autosave]);

  useEffect(() => {
    if (!state || !settings.autosave) return;
    const timer = setTimeout(() => {
      try {
        saveOne({...layout, run: state, people: snapshotPeople()});
        setSavedAt(Date.now());
      } catch { setMessage('模拟进度保存失败。'); }
    }, 900);
    return () => clearTimeout(timer);
  }, [state, layout, settings.autosave]);

  useEffect(() => {
    if (!settings.autosave) return;
    const timer = setInterval(() => {
      const current = latest.current;
      saveDraft(
        {...current.layout, run: current.state ?? current.layout.run, people: snapshotPeople()},
        current.settings as unknown as Record<string, unknown>,
      );
    }, 5000);
    return () => clearInterval(timer);
  }, [settings.autosave]);

  useEffect(() => {
    if (!settings.autosave) return;
    const timer = setInterval(() => {
      const current = latest.current;
      if (!current.state || current.state.status === 'finished') return;
      try {
        saveOne({...current.layout, run: current.state, people: snapshotPeople()});
        setSavedAt(Date.now());
      } catch { /* keep the rolling draft instead */ }
    }, 15000);
    return () => clearInterval(timer);
  }, [settings.autosave]);

  useEffect(() => {
    setSelectedMany(prev => {
      const valid = prev.filter(id => layout.items.some(item => item.id === id));
      return valid.length === prev.length ? prev : valid;
    });
  }, [layout.items]);

  useEffect(() => {
    if (selected) setPanelOpen(true);
    else setPanelOpen(false);
  }, [selected]);

  useEffect(() => {
    if (selectedPerson) setPanelOpen(true);
    if (!selectedPerson) setPersonInfo(null);
  }, [selectedPerson]);

  useEffect(() => {
    if (!settings.music) return;
    let context: AudioContext | null = null;
    const oscillators: OscillatorNode[] = [];
    try {
      context = new AudioContext();
      void context.resume();
      const master = context.createGain();
      master.gain.setValueAtTime(0, context.currentTime);
      master.gain.linearRampToValueAtTime(.028, context.currentTime + 1.6);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 820;
      filter.connect(master);
      master.connect(context.destination);
      [110, 164.81, 220, 329.63].forEach((freq, index) => {
        const oscillator = context!.createOscillator();
        oscillator.type = index % 2 ? 'sine' : 'triangle';
        oscillator.frequency.value = freq;
        oscillator.detune.value = index * 4 - 6;
        const gain = context!.createGain();
        gain.gain.value = index === 0 ? .5 : .2;
        oscillator.connect(gain);
        gain.connect(filter);
        oscillator.start();
        oscillators.push(oscillator);
      });
    } catch { /* Audio context may be blocked by the browser. */ }
    return () => {
      oscillators.forEach(oscillator => { try { oscillator.stop(); } catch { /* already stopped */ } });
      if (context) void context.close();
    };
  }, [settings.music]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setState(old => old && old.status !== 'finished' ? step(old, 1) : old), Math.max(60, 500 / speed));
    return () => clearInterval(timer);
  }, [running, speed]);

  useEffect(() => {
    if (!state || replayRef.current) return;
    const live = peopleProvider.current?.() ?? peopleRef.current;
    if (live?.length) recordPeopleSample(state.minute, live);
  }, [state?.minute, state?.status]);

  useEffect(() => {
    setAnalysisPreview(null);
  }, [layout.items]);

  useEffect(() => {
    if (!analyticsReport) return;
    if (heatCanvas.current) drawHeatmap(heatCanvas.current, analyticsReport, layout);
    if (curveCanvas.current) drawCurves(curveCanvas.current, analyticsReport);
    if (trajectoryCanvas.current) drawTrajectories(trajectoryCanvas.current, analyticsReport, layout);
  }, [analyticsReport, layout.items, layout.size]);

  useEffect(() => {
    if (!replay?.playing) return;
    const timer = setInterval(() => {
      setReplay(prev => {
        if (!prev) return prev;
        if (prev.minute >= replayMax) return {...prev, playing: false};
        const minute = Math.min(replayMax, prev.minute + 1);
        return {...prev, minute, playing: minute < replayMax};
      });
    }, Math.max(220, 900 / replay.speed));
    return () => clearInterval(timer);
  }, [replay?.playing, replay?.speed, replayMax]);

  useEffect(() => {
    if (!layout.weatherAuto || !state || state.status === 'finished') return;
    const seed = layout.params?.seed ?? 20261106;
    const target = weatherAt(seed, state.minute);
    if (target !== layout.weather) {
      setLayout(prev => prev.weather === target ? prev : {...prev, weather: target});
      setState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        logWeatherChange(next, prev.minute, layout.weather ?? 'sunny', target, weatherProfile(target).name, suggestWeatherPreparation(target));
        return next;
      });
    }
  }, [state?.minute, state?.status, layout.weatherAuto, layout.weather, layout.params?.seed]);

  useEffect(() => {
    if (!layout.weatherAuto || !state || state.status === 'finished') return;
    const seed = layout.params?.seed ?? 20261106;
    const upcoming = nextWeatherChange(state.minute);
    const minutesLeft = upcoming - state.minute;
    if (minutesLeft > 6 || weatherWarned.current === upcoming) return;
    weatherWarned.current = upcoming;
    const next = weatherAt(seed, upcoming);
    setMessage(`${suggestWeatherPreparation(next)}预计 ${minutesLeft} 分钟后天气变化，请提前准备。`);
  }, [state?.minute, state?.status, layout.weatherAuto, layout.params?.seed]);

  useEffect(() => {
    if (state?.status !== 'finished') return;
    setRunning(false);
    setLayout(prev => prev.run === state ? prev : {...prev, run: state, history: [state, ...prev.history].slice(0, 10)});
    try {
      const finalLayout = {...layout, run: state, people: undefined, history: [state, ...layout.history].slice(0, 10)};
      saveOne(finalLayout);
      if(finalLayout.activity.sourceId&&!finalLayout.activity.sourceId.startsWith('template:'))saveResult({schema:1,simulationId:crypto.randomUUID(),activityId:finalLayout.activity.sourceId,scenarioId:finalLayout.activity.id,at:new Date().toISOString(),attendance:state.attendanceTotal,budgetPlanned:finalLayout.activity.budget,budgetUsed:used+state.extraSpend,budgetVariance:used+state.extraSpend-finalLayout.activity.budget,satisfaction:state.satisfaction??0,delay:state.delay,incidents:state.incidents.map(event=>event.kind),completedTasks:state.tasks.filter(task=>task.status==='已完成').map(task=>task.name),failedTasks:state.tasks.filter(task=>task.status!=='已完成').map(task=>task.name)});
      setSavedAt(Date.now());
      setVersions(pushVersion(finalLayout, `完成 · 评分 ${evaluate(layout, state).score}`, settings as unknown as Record<string, unknown>));
    } catch { /* the next manual save retries */ }
    if (!awardPending.current) return;
    awardPending.current = false;
    const score = evaluate(layout, state).score;
    const outcome = evaluateDifficulty(layout, state, score);
    const award = awardActivity(profile, outcome, `${layout.activity.title} · 评分 ${score}`, layout.activity.scene);
    saveProfile(award.profile);
    setProfile(award.profile);
    setLastReward({outcome, reward: award.reward});
    const totalSpend = used + state.extraSpend;
    const budgetNote = totalSpend > layout.activity.budget
      ? `超出预算 ${money(totalSpend - layout.activity.budget)}（${budgetMode === 'unlimited' ? '无限资金仅作提醒' : '预算挑战已生效'}）`
      : `预算结余 ${money(layout.activity.budget - totalSpend)}`;
    const unlockNote = award.reward.unlocked.length ? `；解锁 ${award.reward.unlocked.map(entry => entry.label).join('、')}` : '';
    setMessage(`活动${outcome.failed ? '结束 · 未达成' : `完成 · 评级 ${outcome.grade}`}，评分 ${score}，${budgetNote}，获得 ${award.reward.experience} XP / ${award.reward.currency} 货币 / 声望 ${award.reward.reputation >= 0 ? '+' : ''}${award.reward.reputation}${unlockNote}。`);
  }, [state?.status]);

  useEffect(() => {
    const current = state?.incidents.filter(e => e.at <= state.minute).length ?? 0;
    if (settings.sound && current > lastSoundIncident.current) {
      try {
        const audio = new AudioContext(), wave = audio.createOscillator(), volume = audio.createGain();
        wave.type = 'sine'; wave.frequency.value = 660; volume.gain.value = .035;
        wave.connect(volume); volume.connect(audio.destination); wave.start(); wave.stop(audio.currentTime + .14);
        wave.onended = () => void audio.close();
      } catch { /* Audio may be unavailable. */ }
    }
    lastSoundIncident.current = current;
  }, [state?.minute, state?.incidents, settings.sound]);

  const update = (items: Item[]) => {
    setHistory(v => [...v.slice(-39), layout.items]);
    setFuture([]);
    setLayout(prev => ({...prev, items}));
  };
  const persist = (next: Layout, label?: string) => {
    try {
      saveOne(next);
      setSaved(loadAll());
      setSavedAt(Date.now());
      if (label) setVersions(pushVersion(next, label, settings as unknown as Record<string, unknown>));
    } catch (e) { setMessage((e as Error).message); }
  };
  const notifyPlacement = (candidate: Item, verb = '放置') => {
    const check = placement(layout, candidate, budgetMode);
    if (check.level === 'invalid') { setMessage(check.reason); return false; }
    setMessage(check.level === 'warning' ? check.reason : `${CATALOG[candidate.kind].name}已${verb}。`);
    return true;
  };
  const add = (kind: Kind, x: number, z: number, rotation = 0) => {
    if (mode !== 'build') { setMessage('模拟进行中不能搭建，请先暂停并编辑。'); return; }
    const item: Item = {id: id(), kind, x, z, rotation, height: 1, scale: 1};
    if (!notifyPlacement(item)) return;
    update([...layout.items, item]);
    setSelected(item.id);
    setSelectedMany([item.id]);
    if (!continuous) { setPlace(null); setTool('select'); }
  };
  const change = (itemId: string, patch: Partial<Item>) => {
    const old = layout.items.find(i => i.id === itemId);
    if (!old) return false;
    if (old.locked) { setMessage('该设施已锁定，请先解锁再编辑。'); return false; }
    if (mode !== 'build') { setMessage('请先暂停模拟并切回建造模式。'); return false; }
    const next = {...old, ...patch};
    if (!notifyPlacement(next, '更新')) return false;
    update(layout.items.map(i => i.id === itemId ? next : i));
    return true;
  };
  const rotate = (item: Item) => change(item.id, {rotation: (item.rotation + 90) % 360});
  const nudge = (itemId: string, dx: number, dz: number) => {
    const item = layout.items.find(i => i.id === itemId);
    if (!item || item.locked || item.anchored || !physicsFor(item.kind).movable) return;
    const now = performance.now();
    if ((lastNudge.current[itemId] ?? 0) > now - 800) return;
    lastNudge.current[itemId] = now;
    const next = {...item, x: Math.round((item.x + dx) * 100) / 100, z: Math.round((item.z + dz) * 100) / 100};
    if (placement(layout, next, budgetMode).level === 'invalid') return;
    setLayout(prev => ({...prev, items: prev.items.map(i => i.id === itemId ? next : i)}));
  };
  const clone = () => {
    if (!chosen) return;
    if (mode !== 'build') { setMessage('请先切回建造模式。'); return; }
    const next = {...chosen, id: id(), x: chosen.x + 3, z: chosen.z + 3};
    if (!notifyPlacement(next)) return;
    update([...layout.items, next]);
    setSelected(next.id);
    setMessage('已复制设施，可拖动到新位置。');
  };
  const remove = (itemId: string) => {
    const item = layout.items.find(i => i.id === itemId);
    if (!item) return;
    if (item.locked) { setMessage('该设施已锁定，无法删除。'); return; }
    if (mode !== 'build') { setMessage('请先暂停模拟并切回建造模式。'); return; }
    update(layout.items.filter(i => i.id !== itemId));
    if (selected === itemId) setSelected('');
    setSelectedMany(prev => prev.filter(id => id !== itemId));
    setMessage('设施已移除，可撤销。');
  };
  const applyBatch = (result: BatchResult) => {
    if (!result.ok) { setMessage(result.reason); return false; }
    update(result.items);
    setMessage(result.reason);
    return true;
  };
  const moveMany = (ids: string[], dx: number, dz: number) => {
    if (mode !== 'build') { setMessage('请先暂停模拟并切回建造模式。'); return false; }
    if (!dx && !dz) return true;
    return applyBatch(batchMove(layout, ids, dx, dz, budgetMode));
  };
  const rotateMany = (ids: string[], steps = 1) => {
    if (mode !== 'build') { setMessage('请先暂停模拟并切回建造模式。'); return; }
    applyBatch(batchRotate(layout, ids, steps, budgetMode));
  };
  const alignMany = (ids: string[], axis: 'x' | 'z') => {
    if (mode !== 'build') { setMessage('请先暂停模拟并切回建造模式。'); return; }
    applyBatch(alignItems(layout, ids, axis, budgetMode));
  };
  const removeMany = (ids: string[]) => {
    if (mode !== 'build') { setMessage('请先暂停模拟并切回建造模式。'); return; }
    const removable = layout.items.filter(item => ids.includes(item.id) && !item.locked);
    if (!removable.length) { setMessage('所选设施均已锁定，无法删除。'); return; }
    update(layout.items.filter(item => !removable.some(target => target.id === item.id)));
    setSelected(''); setSelectedMany([]);
    setMessage(`已移除 ${removable.length} 项设施，可撤销。`);
  };
  const cloneMany = () => {
    if (mode !== 'build') { setMessage('请先暂停模拟并切回建造模式。'); return false; }
    const picks = selectedItems.filter(item => !item.locked);
    if (!picks.length) { setMessage('没有可复制的设施。'); return false; }
    let items = [...layout.items];
    const copies = picks.map(item => ({...item, id: id(), x: item.x + 2.5, z: item.z + 2.5, locked: false}));
    for (const copy of copies) {
      const check = placement({...layout, items}, copy, budgetMode);
      if (check.level === 'invalid') { setMessage(`${CATALOG[copy.kind].name} 复制失败：${check.reason}`); return false; }
      items = [...items, copy];
    }
    update(items);
    const ids = copies.map(copy => copy.id);
    setSelectedMany(ids); setSelected(ids[0]);
    setMessage(`已复制 ${copies.length} 项设施，可拖动继续调整。`);
    return true;
  };
  const selectMany = (ids: string[]) => {
    const valid = ids.filter(id => layout.items.some(item => item.id === id));
    setSelectedMany(valid);
    setSelected(valid.length === 1 ? valid[0] : '');
    if (valid.length) setSelectedPerson('');
  };
  const toggleLock = (item: Item) => {
    if (mode !== 'build') { setMessage('请先切回建造模式。'); return; }
    update(layout.items.map(i => i.id === item.id ? {...i, locked: !i.locked} : i));
    setMessage(item.locked ? '设施已解锁。' : '设施已锁定，无法拖动或删除。');
  };
  const undo = () => {
    if (!history.length) return;
    setFuture(v => [...v, layout.items]);
    setLayout(prev => ({...prev, items: history.at(-1)!}));
    setHistory(v => v.slice(0, -1));
    setMessage('已撤销。');
  };
  const redo = () => {
    if (!future.length) return;
    setHistory(v => [...v, layout.items]);
    setLayout(prev => ({...prev, items: future.at(-1)!}));
    setFuture(v => v.slice(0, -1));
    setMessage('已重做。');
  };
  const pickTool = (next: Tool) => {
    if (mode !== 'build' && next !== 'observe') { setMessage('模拟进行中：暂停并编辑后才能使用建造工具。'); return; }
    setTool(next);
    setPlace(null);
    if (next === 'select' || next === 'delete' || next === 'observe') { setSelected(''); setSelectedMany([]); }
    setMessage(next === 'observe' ? '观察模式：镜头可旋转、平移、缩放，但不会选中或移动设施。' : next === 'delete' ? '删除工具：点击场地中的设施即可移除。' : next === 'select' ? '选择工具：左键选择或拖动设施，空白处拖框多选，Shift 点击增减选择。' : tools.find(t => t.id === next)!.hint);
  };
  const chooseKind = (kind: Kind) => {
    const lock = facilityLock(profile, kind);
    if (lock) { setMessage(`${CATALOG[kind].name}需要 Lv.${lock.level} 解锁，当前 Lv.${profile.level}。`); return; }
    setPlace(kind);
    setMessage(`已选择 ${CATALOG[kind].name}，在场地中点击放置。`);
  };
  const load = (next: Layout) => {
    const resumable = !!next.run && next.run.status !== 'finished';
    setRunning(false);
    setMode(resumable ? 'simulate' : 'build');
    setState(next.run ?? null);
    setLastReward(null);
    setLayout(next);
    peopleRef.current = next.people ?? null;
    peopleTimeline.current = [];
    setReplay(null); setRestorePeople(null);
    if (resumable && next.run && next.people?.length) recordPeopleSample(next.run.minute, next.people);
    setSelected(''); setPlace(null); setTool('select'); setHistory([]); setFuture([]);
    clearDraft(); setDraft(null);
    if (next.savedAt) setSavedAt(next.savedAt);
    setMessage(resumable ? '已打开存档；模拟保持暂停，人物、进度与现场事件已恢复。' : '已打开保存的场地。');
  };
  const importFile = async (f: File) => {
    try {
      if (f.size > 15_000_000) throw Error('备份文件过大');
      const next = importBackup(JSON.parse(await f.text()));
      load(next);
      setMessage('已导入活动信息，可以继续搭建场地。');
    } catch (e) { setMessage((e as Error).message); }
  };
  const reset = () => {
    if (!confirm('重置当前场地的全部设施？可使用撤销恢复。')) return;
    setHistory(v => [...v, layout.items]);
    setFuture([]);
    setLayout(prev => ({...prev, items: freshLayout(prev.activity.scene).items}));
    setState(null); setRunning(false); setMode('build'); setSelected(''); setPlace(null); setTool('select');
    peopleTimeline.current = []; setReplay(null); setRestorePeople(null);
    setMessage('场地已重置。');
  };
  const startRun = (target: Layout = layout) => {
    const blockers = analyzeLayout(target).findings.filter(finding => finding.severity === 'error');
    if (blockers.length && !confirm(`场地预检发现 ${blockers.length} 项阻塞问题：\n${blockers.slice(0, 4).map(finding => `· ${finding.title}`).join('\n')}\n\n仍要开始模拟吗？`)) return;
    try {
      const next = start(target);
      logReplay(next, {
        at: 0, kind: 'weather', title: `初始天气 · ${weatherProfile(target.weather).name}`,
        detail: suggestWeatherPreparation(target.weather ?? 'sunny'), location: 'venue',
        weather: target.weather ?? 'sunny', dedupe: 'weather:0',
      });
      peopleRef.current = null;
      peopleTimeline.current = [];
      setReplay(null); setRestorePeople(null);
      clearDraft(); setDraft(null);
      setState(next); setRunning(true); setMode('simulate'); setTool('select'); setPlace(null);
      setEventsOpen(true); setTimelineSelected(null);
      setLayout(prev => ({...prev, run: next, people: undefined}));
      setLastReward(null);
      persist({...target, run: next, people: undefined}, target.challenge ? `开始挑战：${target.challenge.name}` : '开始模拟');
      awardPending.current = true;
      const targetWarnings = issues(target);
      setMessage(target.challenge
        ? `挑战「${target.challenge.name}」已开始：${target.challenge.goals.length} 项目标、${target.challenge.fails.length} 项失败条件。`
        : targetWarnings.length ? `模拟已启动；场地有 ${targetWarnings.length} 项搭建提醒。` : '模拟已启动，人物与车辆开始活动。');
    } catch (e) { setMessage((e as Error).message); }
  };
  const pause = () => {
    setRunning(false);
    if (state) {
      const next=structuredClone(state);
      logReplay(next,{at:next.minute,kind:'action',title:'暂停活动模拟',detail:'现场状态已暂停，组织者可查看记录或调整场地。',location:'venue'});
      setState(next);
      persist({...layout, run: next, people: snapshotPeople() ?? layout.people}, '暂停');
    }
    setMessage('模拟已暂停：人物、时钟与随机事件停止，可继续观察或用“暂停并编辑”调整场地。');
  };
  const resume = () => {
    if (replayRef.current) exitReplay();
    if (!state || state.status === 'finished') { startRun(); return; }
    const next=reconcile(state, layout);
    logReplay(next,{at:next.minute,kind:'action',title:'继续活动模拟',detail:'继续执行当前活动流程。',location:'venue'});
    setState(next);
    setMode('simulate'); setTool('select'); setPlace(null); setRunning(true);
    awardPending.current = true;
    setMessage('已继续模拟，进度与突发事件保留；路径、目标与事件已重新校验。');
  };
  const pauseAndEdit = () => {
    if (replayRef.current) exitReplay();
    setRunning(false);
    if(state){const next=structuredClone(state);logReplay(next,{at:next.minute,kind:'action',title:'暂停并编辑场地',detail:'组织者返回建造模式调整设施。',location:'venue'});setState(next);if(settings.autosave)persist({...layout,run:next,people:snapshotPeople()},'暂停并编辑');}
    setLayout(prev => ({...prev, people: undefined}));
    setMode('build'); setTool('select'); setPlace(null);
    setMessage('已暂停，设施恢复可编辑；继续时会重新校验路径、目标与事件。');
  };
  const resetSim = () => {
    setState(null); setRunning(false); setMode('build'); setTool('select'); setPlace(null);
    setLayout(prev => ({...prev, run: undefined, people: undefined}));
    peopleRef.current = null;
    peopleTimeline.current = []; setReplay(null); setRestorePeople(null);
    clearDraft(); setDraft(null);
    awardPending.current = false;
    setLastReward(null);
    setMessage('模拟已重置。');
  };
  const act = (kind: Intervention) => {
    if (!state) return;
    try {
      const next = intervene(state, kind, budgetMode);
      setState(next);
      setLayout(prev => ({...prev, run: next}));
      persist({...layout, run: next, people: snapshotPeople()}, `应对：${actions.find(a => a.kind === kind)?.label ?? kind}`);
      setMessage('应对措施已改变现场资源与费用。');
    } catch (e) { setMessage((e as Error).message); }
  };
  const recoverDraft = () => {
    if (!draft) return;
    if (draft.settings) setSettings(prev => ({...prev, ...(draft.settings as Partial<GameSettings>)}));
    load(draft.layout);
    setMessage('已恢复上次中断的现场；模拟保持暂停，可检查后继续。');
  };
  const dismissDraft = () => {
    clearDraft(); setDraft(null);
    setMessage('已忽略上次中断的现场草稿。');
  };
  const restoreVersion = (version: HistoryVersion) => {
    if (!confirm(`载入「${version.label}」历史版本会替换当前场地，继续？`)) return;
    if (version.settings) setSettings(prev => ({...prev, ...(version.settings as Partial<GameSettings>)}));
    load(version.layout);
    setSettingsOpen(false);
    setMessage(`已载入历史版本：${version.label}。`);
  };
  const cam = (kind: CameraAction['kind']) => setCameraAction({kind, token: Date.now()});
  const closeAnalysis = () => { setAnalysisOpen(false); setAnalysisPreview(null); };
  const focusAnalysisFinding = (finding: AnalysisFinding) => {
    if (finding.at) {
      setCameraAction({
        kind: 'focus', token: Date.now(), target: finding.at,
        distance: Math.max(14, Math.min(34, layout.size * .38)),
      });
    }
    if (finding.items?.length) {
      setSelected(finding.items[0]);
      setSelectedMany(finding.items);
      setTool('select');
    }
    setMessage(`${finding.title}：${finding.fix}`);
  };
  const previewAnalysisPlan = () => {
    const plan = optimizeLayout(layout);
    setAnalysisPreview(plan);
    setMessage(plan.changes.length
      ? `已生成 ${plan.changes.length} 项优化预览；应用前不会修改场地。`
      : '当前布局没有可自动优化的项目。');
  };
  const applyAnalysisPlan = () => {
    if (!analysisPreview) return;
    if (!analysisPreview.changes.length) { setMessage('没有可应用的优化项。'); return; }
    const count = analysisPreview.changes.length;
    update(analysisPreview.items);
    setAnalysisPreview(null);
    setMessage(`已应用 ${count} 项优化，可按 Ctrl+Z 撤销。`);
  };
  const replaySpotPoint = (spot: ReplaySpot | undefined) => {
    const find = (...kinds: Kind[]) => layout.items.find(item => kinds.includes(item.kind));
    const item = spot === 'checkin' || spot === 'queue'
      ? find('checkin', 'checkinSmall', 'checkinLarge') ?? find('entrance')
      : spot === 'entrance' ? find('entrance')
      : spot === 'stage' ? find('stage', 'stageLarge', 'stageSmall', 'podium', 'bleachers')
      : spot === 'rest' ? find('rest', 'tent', 'tentSmall', 'service')
      : spot === 'medical' ? find('medical')
      : null;
    return item ? {x: item.x, z: item.z} : {x: 0, z: 0};
  };
  const focusReplaySpot = (spot: ReplaySpot | undefined) => {
    setCameraAction({kind: 'focus', token: Date.now(), target: replaySpotPoint(spot)});
  };
  const replayDirectorKind = selectedReplayEvent?.directorId === undefined
    ? undefined
    : state?.director?.events.find(event => event.id === selectedReplayEvent.directorId)?.kind;
  const replayInvolvedList: PersonSave[] = (() => {
    if (!selectedReplayEvent || !replayPeople?.length) return [];
    if (replayDirectorKind) {
      const group = new Set(REPLAY_STATE_GROUPS[replayDirectorKind]);
      const matched = replayPeople.filter(person => group.has(person.state));
      if (matched.length) return matched;
    }
    const point = replaySpotPoint(selectedReplayEvent.location);
    const radius = Math.max(8, layout.size * .22);
    const matched = replayPeople.filter(person => Math.hypot(person.x - point.x, person.z - point.z) <= radius);
    return matched.length ? matched : replayPeople;
  })();
  const beginReplay = () => {
    if (!state) return;
    if (!state.replay?.frames.length) { setMessage('本次运行没有逐分钟记录，无法回放；重新开始模拟后会记录快照与事件日志。'); return; }
    const live = snapshotPeople();
    if (live?.length) recordPeopleSample(state.minute, live);
    setRunning(false);
    setEventsOpen(false);
    setRestorePeople(null);
    const first = state.replay.events[0];
    setReplay({minute: 0, playing: false, speed: 1, camera: 'overview', selected: first ? String(first.id) : ''});
    focusReplaySpot('venue');
    setMessage('已进入回放：画面、指标与事件来自本次模拟逐分钟记录的快照和事件日志，不会重新随机生成。');
  };
  const exitReplay = () => {
    setReplay(null);
    setRestorePeople(peopleRef.current ?? layout.people ?? null);
    setSelectedPerson('');
    focusReplaySpot('venue');
    setMessage('已退出回放；模拟仍保持暂停，可继续观察或点击继续。');
  };
  const jumpReplay = (entry: ReplayLogEntry) => {
    setReplay(prev => prev ? {...prev, minute: Math.max(0, Math.min(replayMax, entry.at)), playing: false, selected: String(entry.id)} : prev);
    focusReplaySpot(entry.location);
  };
  const saveReplayFile = () => {
    if (!state) return;
    try {
      const layoutMeta = {
        activityId: layout.activity.id, title: layout.activity.title, scene: layout.activity.scene,
        venueId: layout.venueId, venueVariant: layout.venueVariant, size: layout.size, indoor: layout.indoor,
        terrain: layout.terrain, weather: layout.weather, weatherAuto: layout.weatherAuto,
        items: layout.items, params: layout.params, roles: layout.roles, volunteers: layout.volunteers,
      };
      const payload = buildReplayExport(state, layout.activity.title, layoutMeta, peopleTimeline.current);
      const blob = new Blob([JSON.stringify(payload)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `回放-${layout.activity.title.replace(/[\\/:*?"<>|]/g, '-')}-${state.minute}min.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMessage(`回放文件已导出：${state.replay?.events.length ?? 0} 条事件、${state.replay?.frames.length ?? 0} 个快照、${peopleTimeline.current.length} 个人物采样点。`);
    } catch (e) {
      setMessage(`回放导出失败：${(e as Error).message}`);
    }
  };
  const changeWeather = (value: WeatherKind) => {
    setLayout(prev => ({...prev, weather: value}));
    if (!state || state.status === 'finished') return;
    setState(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      logWeatherChange(next, prev.minute, layout.weather ?? 'sunny', value, weatherProfile(value).name, suggestWeatherPreparation(value));
      return next;
    });
  };
  const openAnalytics = () => {
    setAnalyticsOpen(true);
    setAnalysisOpen(false);
    setAnalysisPreview(null);
    setSettingsOpen(false);
    setChallengeOpen(false);
    setMessage(state
      ? '数据分析：热力图、轨迹与曲线来自本次模拟的逐分钟快照与人物采样，未插值或随机补点。'
      : '数据分析：开始模拟后，这里会显示真实的人流、轨迹与趋势。');
  };
  const exportAnalytics = () => {
    const report = analyticsReport ?? buildAnalytics(layout, state, peopleTimeline.current, analyticsGroup);
    downloadText(analyticsCsv(report), `分析-${safeFileName(layout.activity.title)}-${state?.minute ?? 0}min.csv`, 'text/csv;charset=utf-8');
    setMessage(`趋势 CSV 已导出：${report.curves.length} 个逐分钟快照。`);
  };
  const enterShowcase = () => {
    setShowcase(true);
    setAutoRotate(false);
    setSettingsOpen(false);
    setChallengeOpen(false);
    setEventsOpen(false);
    setAnalysisOpen(false);
    setAnalysisPreview(null);
    setAnalyticsOpen(false);
    setSelected('');
    setSelectedMany([]);
    setSelectedPerson('');
    setPlace(null);
    setTool('select');
    setMessage('展示模式：界面已隐藏，拖动旋转、滚轮缩放；底部可切换昼夜、天气、环绕并截图。Esc 退出。');
  };
  const exitShowcase = () => {
    setShowcase(false);
    setAutoRotate(false);
    setMessage('已退出展示模式。');
  };
  const changeShowcaseWeather = (value: WeatherKind) => {
    setLayout(prev => ({...prev, weatherAuto: false}));
    changeWeather(value);
  };
  const capturePhoto = () => {
    const data = captureRef.current?.();
    if (!data) { setMessage('拍照失败：3D 画面尚未就绪或浏览器禁止导出画布。'); return; }
    const anchor = document.createElement('a');
    anchor.href = data;
    anchor.download = `${safeFileName(layout.activity.title)}-${state?.minute ?? 0}min-${lighting}.png`;
    anchor.click();
    setMessage(`已保存 ${lighting === 'night' ? '夜景' : lighting === 'dusk' ? '黄昏' : '日景'} 截图（${weather.name} · 第 ${state?.minute ?? 0} 分钟）。`);
  };
  const shareShowcase = async () => {
    const report = buildAnalytics(layout, state, peopleTimeline.current, 'all');
    const summary = state
      ? `第 ${state.minute} 分钟 · 到场 ${state.arrived} · 签到 ${state.served} · 排队 ${state.queue} · 满意度 ${Math.round(state.satisfaction ?? 70)}/100`
      : `建造预览 · ${layout.items.length} 项设施`;
    const text = [
      `3MinLab · ${layout.activity.title}`,
      `${sceneNames[layout.activity.scene] ?? layout.activity.scene} · ${venue.name} · ${layout.size}×${layout.size}m · ${weather.name} · ${lighting === 'night' ? '夜景' : lighting === 'dusk' ? '黄昏' : '日景'}`,
      summary,
      report.insights[0] ?? '',
    ].filter(Boolean).join('\n');
    const copied = await copyText(text);
    setMessage(copied ? '展示文案已复制到剪贴板，可直接分享。' : `分享文案：${text.replace(/\n/g, ' · ')}`);
  };
  const saveNow = () => {
    const next = {...layout, run: state ?? layout.run, people: snapshotPeople() ?? layout.people};
    try {
      saveOne(next);
      setSaved(loadAll());
      setSavedAt(Date.now());
      setVersions(pushVersion(next, '手动保存', settings as unknown as Record<string, unknown>));
      setMessage('场地、模拟进度、人物位置、天气与现场事件已保存。');
    } catch (e) { setMessage((e as Error).message); }
  };
  const openChallenge = () => {
    setSettingsOpen(false);
    setChallengeDraft(normalizeChallenge(layout.challenge ?? defaultChallenge(`${layout.activity.title}挑战`, layout.activity.budget)));
    setChallengeOpen(true);
    setMessage('挑战编辑器：设定活动类型、场地、人数、预算、人员、天气、事件强度、目标与失败条件。');
  };
  const patchChallenge = (patch: Partial<ChallengeConfig>) => setChallengeDraft(prev => ({...prev, ...patch}));
  const patchChallengeRule = (kind: 'goals' | 'fails', ruleId: string, patch: Partial<ChallengeGoal>) => {
    setChallengeDraft(prev => {
      const list = prev[kind].map(rule => {
        if (rule.id !== ruleId) return rule;
        const merged: ChallengeGoal = {...rule, ...patch};
        if (patch.metric) {
          const info = CHALLENGE_METRICS[patch.metric];
          merged.operator = info.defaultOperator;
          merged.target = Math.max(info.min, Math.min(info.max, merged.target || info.min));
        }
        if (merged.metric === 'timeout') { merged.operator = 'atLeast'; merged.target = 1; }
        merged.label = challengeGoalLabel(merged);
        return merged;
      });
      return kind === 'goals' ? {...prev, goals: list} : {...prev, fails: list};
    });
  };
  const addChallengeRule = (kind: 'goals' | 'fails') => {
    const metric: ChallengeMetric = kind === 'goals' ? 'satisfaction' : 'peakQueue';
    const info = CHALLENGE_METRICS[metric];
    const rule: ChallengeGoal = {id: id(), metric, operator: info.defaultOperator, target: kind === 'goals' ? 70 : 80, label: ''};
    rule.label = challengeGoalLabel(rule);
    setChallengeDraft(prev => kind === 'goals'
      ? {...prev, goals: [...prev.goals, rule].slice(0, 8)}
      : {...prev, fails: [...prev.fails, rule].slice(0, 8)});
  };
  const removeChallengeRule = (kind: 'goals' | 'fails', ruleId: string) => {
    setChallengeDraft(prev => kind === 'goals'
      ? {...prev, goals: prev.goals.filter(rule => rule.id !== ruleId)}
      : {...prev, fails: prev.fails.filter(rule => rule.id !== ruleId)});
  };
  const writeChallenge = (): Layout | null => {
    if (!challengeDraft.name.trim()) { setMessage('请先填写挑战名称。'); return null; }
    if (!challengeDraft.goals.length) { setMessage('挑战至少需要一个达成目标。'); return null; }
    const normalized = normalizeChallenge({...challengeDraft, name: challengeDraft.name.trim()});
    const next: Layout = {...layout, challenge: normalized};
    setLayout(next);
    setChallengeDraft(normalized);
    return next;
  };
  const saveChallenge = () => {
    const next = writeChallenge();
    if (!next?.challenge) return;
    persist(next, '保存挑战');
    setMessage(`挑战「${next.challenge.name}」已保存：${next.challenge.goals.length} 项目标、${next.challenge.fails.length} 项失败条件。`);
  };
  const startChallenge = () => {
    const next = writeChallenge();
    if (!next) return;
    setChallengeOpen(false);
    startRun(next);
  };
  const clearChallenge = () => {
    if (!confirm('清除当前挑战设置？场地与设施会保留。')) return;
    const next: Layout = {...layout, challenge: undefined};
    setLayout(next);
    setChallengeDraft(defaultChallenge(`${layout.activity.title}挑战`, layout.activity.budget));
    persist(next, '清除挑战');
    setMessage('挑战设置已清除，场地与设施保持不变。');
  };
  const changeSceneForChallenge = (scene: Layout['activity']['scene']) => {
    if (scene === layout.activity.scene) return;
    const lock = sceneLock(profile, scene);
    if (lock) { setMessage(`「${sceneNames[scene] ?? scene}」需要 Lv.${lock.level} 解锁。`); return; }
    if (!confirm('切换活动类型会重建对应预设场地，当前设施布置将被替换。继续？')) return;
    const next = freshLayout(scene);
    next.challenge = challengeDraft;
    next.activity = {...next.activity, title: layout.activity.title, people: layout.activity.people, budget: layout.activity.budget, duration: layout.activity.duration};
    next.volunteers = layout.volunteers;
    next.params = {...next.params, staff: layout.params.staff, seed: layout.params.seed};
    next.weather = layout.weather;
    next.weatherAuto = layout.weatherAuto;
    next.budgetMode = layout.budgetMode;
    next.difficulty = layout.difficulty ?? 'normal';
    next.difficultyBase = layout.difficultyBase;
    load(next);
  };
  const switchVenueForChallenge = (venueId: string, variant: VenueSize) => {
    if (venueId === layout.venueId && variant === (layout.venueVariant ?? 'medium')) return;
    switchVenue(venueId, variant);
    setLayout(prev => ({
      ...prev, challenge: challengeDraft,
      activity: {...prev.activity, title: layout.activity.title, people: Math.min(layout.activity.people, venueVariant(venueId, variant).capacity), budget: layout.activity.budget, duration: layout.activity.duration},
      volunteers: layout.volunteers, params: {...prev.params, staff: layout.params.staff},
      weather: layout.weather, weatherAuto: layout.weatherAuto, budgetMode: layout.budgetMode,
    }));
  };
  const changeScene = (scene: Layout['activity']['scene']) => {
    const lock = sceneLock(profile, scene);
    if (lock) { setMessage(`「${sceneNames[scene] ?? scene}」需要 Lv.${lock.level} 解锁。`); return; }
    if (!confirm('切换活动场景会生成对应预设场地，当前未保存的布置将被替换。继续？')) return;
    load(applyDifficulty(freshLayout(scene), tier));
  };
  const switchVenue = (venueId: string, variant: VenueSize) => {
    if (venueId === layout.venueId && variant === (layout.venueVariant ?? 'medium')) return;
    const target = venueDefinition(venueId), info = venueVariant(venueId, variant);
    if (!confirm(`切换到「${target.name} · ${info.label}」会重建场地基础设施，当前布置将被替换。继续？`)) return;
    const base = freshLayout(layout.activity.scene);
    const people = Math.min(layout.activity.people, info.capacity);
    const built: Layout = {
      ...base,
      activity: {...layout.activity, people},
      venueId, venueVariant: variant, indoor: target.type === 'indoor', size: info.size,
      terrain: target.terrain, items: makeVenueItems(venueId, variant),
      weather: layout.weather ?? 'sunny', wallMode: layout.wallMode ?? 'auto', roofMode: layout.roofMode ?? 'translucent',
      budgetMode: layout.budgetMode ?? 'unlimited', world: layout.world,
      params: {...base.params, capacity: info.capacity},
      run: undefined, history: [],
    };
    const next = layout.difficulty && layout.difficulty !== 'normal'
      ? applyDifficulty({...built, difficulty: 'normal', difficultyBase: layout.difficultyBase}, layout.difficulty)
      : built;
    load(next);
    setMessage(`已进入 ${venueLabel(venueId, variant)}，可按需继续调整设施。`);
  };
  const changeDifficulty = (nextTier: DifficultyTier) => {
    const info = DIFFICULTIES[nextTier];
    if (profile.level < info.unlockLevel) { setMessage(`「${info.name}」需要 Lv.${info.unlockLevel} 解锁，当前 Lv.${profile.level}。`); return; }
    if (nextTier === tier) return;
    if (state && state.status !== 'finished') { setMessage('模拟进行中不能切换难度；请先结束或重置本次模拟。'); return; }
    const next = applyDifficulty(layout, nextTier);
    setLayout(next);
    setState(null);
    setLastReward(null);
    setMode('build'); setRunning(false);
    setMessage(`难度已切换为「${info.name}」：参与 ${next.activity.people} 人、工作人员 ${next.params.staff} 人、志愿者 ${next.volunteers ?? 0} 人、预算 ${money(next.activity.budget)}，奖励 ×${info.rewardScale}。${info.detail}`);
  };
  const applyChallengePreset = (presetId: string) => {
    const preset = CHALLENGE_PRESETS.find(entry => entry.id === presetId);
    if (!preset) return;
    const lock = challengeLock(profile, preset.id);
    if (lock) { setMessage(`挑战库「${preset.label}」需要 Lv.${lock.level} 解锁。`); return; }
    const next = normalizeChallenge(preset.make(layout.activity.budget));
    setChallengeDraft(next);
    setMessage(`已载入挑战库模板「${preset.label}」：${preset.description} 可按需继续修改目标与失败条件。`);
  };
  const beginTemplate = (next: Layout, label: string) => {
    if (!confirm(`以「${label}」开始会替换当前场地，未保存的布置将被清除。继续？`)) return;
    load(tier === 'normal' ? next : applyDifficulty(next, tier));
    setSettingsOpen(false);
    setMessage(`已进入「${label}」，预设设施与流程都可以继续修改。`);
  };
  const setSeed = (value: string) => {
    const seed = Math.round(Number(value));
    if (!Number.isFinite(seed) || seed === layout.world?.seed) return;
    setLayout(prev => ({...prev, world: defaultWorld(seed)}));
    setMessage('城市种子已更新，外围道路与建筑将重新生成。');
  };

  useEffect(() => {
    const target = (window as unknown as {__eventSimulator3D?: {advance?: (minutes: number) => void}}).__eventSimulator3D;
    if (!target) return;
    target.advance = (minutes: number) => {
      setState(prev => {
        if (!prev || prev.status === 'finished') return prev;
        let next = prev;
        let remaining = Math.max(0, Math.min(1440, Math.floor(minutes)));
        while (remaining > 0 && next.status !== 'finished') {
          const chunk = Math.min(20, remaining);
          next = step(next, chunk);
          remaining -= chunk;
        }
        return next;
      });
    };
    return () => { delete target.advance; };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('input,textarea,select,[contenteditable]')) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
        if (e.key.toLowerCase() === 'a' && mode === 'build') {
          e.preventDefault();
          const ids = layout.items.filter(item => !item.locked).map(item => item.id);
          setSelectedMany(ids); setSelected('');
          setMessage(`已选择 ${ids.length} 项未锁定设施，可批量移动、旋转或对齐。`);
        }
        if (e.key.toLowerCase() === 'c' && chosen) { e.preventDefault(); setClipboard(chosen); setMessage('已复制设施，按 Ctrl+V 粘贴。'); }
        if (e.key.toLowerCase() === 'v' && clipboard && mode === 'build') {
          e.preventDefault();
          const copy = {...clipboard, id: id(), x: clipboard.x + 3, z: clipboard.z + 3};
          if (notifyPlacement(copy)) { update([...layout.items, copy]); setSelected(copy.id); setSelectedMany([copy.id]); setClipboard(copy); }
        }
        return;
      }
      if (e.key === 'Escape' && showcase) {
        e.preventDefault();
        exitShowcase();
        return;
      }
      if (e.key === 'Escape' || e.key.toLowerCase() === 'q') {
        setPlace(null); setSelected(''); setSelectedMany([]);
        setMessage('已退出放置 / 选择状态。');
        return;
      }
      const lower = e.key.toLowerCase();
      if (lower === 'v') pickTool('select');
      if (lower === 'o') pickTool('observe');
      if (lower === 'b') pickTool('build');
      if (lower === 'n') pickTool('road');
      if (lower === 'g') pickTool('decor');
      if (lower === 'x') pickTool('delete');
      if (lower === 'r' && !place) {
        if (multiCount > 1) { e.preventDefault(); rotateMany(selectedMany, 1); }
        else if (chosen) { e.preventDefault(); rotate(chosen); }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (multiCount > 1) { e.preventDefault(); removeMany(selectedMany); }
        else if (chosen) { e.preventDefault(); remove(chosen.id); }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return <div className={'v3-app' + (showcase ? ' v3-showcase-mode' : '')}>
    <a className="v6-back" href="/#home">← 返回活动策划器</a>
    <button className="v6-import-button" onClick={()=>setImportOpen(true)}>导入我的活动 / 预设</button>
    {importOpen&&<div className="v6-import-scrim"><section className="v6-import-panel" role="dialog" aria-label="活动导入与场景初始化"><header><h2>活动导入与场景初始化</h2><button onClick={()=>setImportOpen(false)}>关闭</button></header><div className="v6-import-list"><h3>我的活动</h3>{bridge?.plans.map(plan=><button className={importId===plan.activityId?'active':''} key={plan.activityId} onClick={()=>{setImportId(plan.activityId);setCreateAnother(false);}}>{plan.name} · {plan.people??'人数待确认'} 人</button>)}{!bridge?.plans.length&&<p>暂无可导入活动，请先在策划器创建并保存。</p>}<h3>统一活动预设（{bridge?.templates.length??0}）</h3><select aria-label="选择活动预设" onChange={e=>{setImportId(`template:${e.target.value}`);setCreateAnother(false);}} value={importId.startsWith('template:')?importId.slice(9):''}><option value="">选择预设</option>{bridge?.templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></div>{(()=>{const plan=bridge?.plans.find(p=>p.activityId===importId),template=bridge?.templates.find(p=>`template:${p.id}`===importId),related=saved.filter(s=>s.activity.sourceId===importId),current=createAnother?undefined:related[0];if(!plan&&!template)return <button onClick={()=>{load(freshLayout());setImportOpen(false);}}>自由建造</button>;return <>{related.length>0&&<div className="v6-related"><strong>已有场景</strong>{related.map((item,i)=><button key={item.activity.id} onClick={()=>{load(item);setImportOpen(false);}}>场景 {i+1} · {new Date(item.savedAt||Date.now()).toLocaleDateString()}</button>)}<button onClick={()=>setCreateAnother(true)}>为此活动新建场景</button></div>}<div className="v6-import-report"><strong>{plan?.name||template?.name}</strong><p>人数 {plan?.people??template?.people??'待确认'} · 原预算 ¥{plan?.budget??template?.budget??'待确认'} · 工作人员 {plan?.staff??'待确认'}</p><p>工作组：{plan?.workGroups.map(g=>g.name).join('、')||'待配置'} · 流程：{plan?.workflow.map(f=>f.title).join(' → ')||template?.workflow.join(' → ')||'待配置'}</p><p>场地：{importVenue||'按类型推荐'}；未填写的信息将使用明确的演示默认值，进入后可修改。</p>{current&&plan&&current.bridgeVersion!==plan.updatedAt&&<p className="v6-stale">策划方案已更新：人数 {current.activity.people} → {plan.people??'待确认'}，预算 ¥{current.activity.budget} → ¥{plan.budget??'待确认'}，流程 {current.activity.tasks.length} → {plan.workflow.length} 项。可同步并保留设施布局，或继续使用原场景。</p>}</div><div className="v6-import-options"><button className={importMode==='recommended'?'active':''} onClick={()=>setImportMode('recommended')}>使用推荐场地</button><button className={importMode==='choose'?'active':''} onClick={()=>setImportMode('choose')}>自行选择场地</button><button className={importMode==='free'?'active':''} onClick={()=>setImportMode('free')}>自由建造</button></div>{importMode==='choose'&&<select aria-label="场地选择" value={importVenue} onChange={e=>setImportVenue(e.target.value)}><option value="">推荐场地</option>{VENUES.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select>}<div className="v6-import-actions">{current&&<button onClick={()=>{load(current);setImportOpen(false);}}>保留当前场景</button>}<button onClick={()=>{const fresh=plan?layoutFromPlan(plan,importMode==='choose'?importVenue:undefined):layoutFromTemplate(template!);const next=current&&plan?{...current,activity:{...current.activity,...fresh.activity,id:current.activity.id},params:{...current.params,staff:fresh.params.staff,budget:fresh.params.budget},volunteers:fresh.volunteers,bridgeVersion:plan.updatedAt,bridgeGroups:fresh.bridgeGroups,bridgeBudgetItems:fresh.bridgeBudgetItems,bridgeVenue:fresh.bridgeVenue,run:undefined,people:undefined}:fresh;const chosen=importMode==='free'?{...next,items:[]}:next;load(chosen);setImportOpen(false);try{saveOne(chosen);setSaved(loadAll());setMessage('已导入并保存场景；设施可继续调整。');}catch(error){setMessage(error instanceof Error?error.message:'场景未保存，请手动重试。');}}}>{current?'同步策划并保留布局':'开始搭建'}</button></div></>;})()}</section></div>}
    <div className="v3-stage">
      <div className="v3-viewport">
        <Scene3D
          layout={layout}
          state={mode === 'simulate' ? state : null}
          selected={selected}
          selectedMany={selectedMany}
          place={place}
          tool={tool}
          mode={mode}
          simSpeed={mode === 'simulate' && running && !replay ? speed : 0}
          cameraAction={cameraAction}
          quality={quality}
          shadows={settings.shadows}
          sensitivity={settings.sensitivity}
          snap={settings.snap}
          personSelected={selectedPerson}
          debug={settings.debug}
          replayPeople={replayPeople}
          restorePeople={restorePeople}
          analysisMarks={analysisMarkers}
          analysisGhosts={analysisGhosts}
          lighting={lighting}
          showcase={showcase}
          autoRotate={autoRotate}
          onSelect={id => { setSelected(id); if (id) setSelectedPerson(''); }}
          onSelectMany={selectMany}
          onEdit={itemId => { setSelected(itemId); setSelectedMany([itemId]); setSelectedPerson(''); setPanelOpen(true); setMessage('已打开设施属性面板。'); }}
          onPlace={add}
          onMove={(itemId, x, z) => change(itemId, {x, z})}
          onBatchMove={moveMany}
          onBatchRotate={rotateMany}
          onDelete={remove}
          onDeleteMany={removeMany}
          onPreview={setPreview}
          onPersonSelect={id => { setSelectedPerson(id); if (id) { setSelected(''); setMessage('已选中现场人员，右侧显示角色、任务、状态、目标与路径。'); } }}
          onPersonInfo={setPersonInfo}
          onPeopleSnapshot={people => { if (!replayRef.current) peopleRef.current = people; }}
          onPeopleProvider={provider => { peopleProvider.current = provider; }}
          onNudge={nudge}
          onDebugStats={setDebugStats}
          onCaptureReady={capture => { captureRef.current = capture; }}
        />
      </div>

      <header className="v3-hud">
        <div className="v3-brand">
          <span className="v3-logo">3M</span>
          <div><b>开放世界活动模拟器</b><span>3MinLab · Event World V4</span></div>
        </div>
        <div className="v3-activity">
          <b>{layout.activity.title}</b>
          <span>{sceneNames[layout.activity.scene] ?? layout.activity.scene} · {venue.name} · {variantInfo.label} · {indoor ? '室内' : '室外'} {layout.size}×{layout.size}m</span>
        </div>
        <div className="v3-metrics">
          <span className="v3-money">{budgetMode === 'unlimited' ? '资金 ∞' : '资金'} <b>{budgetMode === 'unlimited' ? money(used) : money(left)}</b></span>
          <span>预算 <b>{layout.activity.budget.toLocaleString()}</b></span>
          <span className={used > layout.activity.budget && budgetMode === 'challenge' ? 'warn' : ''}>已用 <b>{money(used)}</b></span>
          <span>参与 <b>{layout.activity.people}</b> / {venueCap}</span>
          <span>天气 <b>{weather.icon} {weather.name}</b>{layout.weatherAuto ? ' · 自动' : ''}</span>
          <span className={'v3-difficulty-chip' + (tier === 'extreme' ? ' hard' : '')} title={tierInfo.detail}>难度 <b>{tierInfo.name}</b></span>
          {layout.weatherAuto && state && state.status !== 'finished' && <span>变天 <b>{Math.max(0, nextWeatherChange(state.minute) - state.minute)}′</b></span>}
          <span>团队 <b>{layout.params.staff}</b>+{layout.volunteers ?? 0}</span>
          <span>状态 <b>{mode === 'build' ? '建造中' : statusLabels[state?.status ?? 'ready']}</b></span>
          {state && <span className={satisfaction < 45 ? 'warn' : ''}>满意 <b>{satisfaction}</b></span>}
          <span>设施 <b>{layout.items.length}</b> 项</span>
          <span className={warnings.length ? 'warn' : ''}>提醒 <b>{warnings.length}</b></span>
          {state?.status === 'finished' && <span className="v3-score-chip">评分 <b>{rating.score}</b></span>}
          {challenge && <span className={challengeResult?.failed ? 'warn' : 'v3-challenge-chip'} title={challenge.brief}>挑战 <b>{challenge.name}</b>{challengeResult ? ` ${challengeResult.met}/${challengeResult.total}` : ''}</span>}
        </div>
        <div className="v3-level" title={`${level.current} / ${level.target} 经验`}>
          <div><b>Lv.{profile.level}</b><span>{level.current}/{level.target} XP</span></div>
          <i><em style={{width: `${level.ratio * 100}%`}}/></i>
          <div className="v3-wallet"><span>¥{profile.currency.toLocaleString()}</span><span>声望 {profile.reputation}</span></div>
        </div>
        <div className="v3-mode">
          <button className={mode === 'build' ? 'active' : ''} onClick={() => { if (replayRef.current) exitReplay(); setMode('build'); setRunning(false); setLayout(prev => ({...prev, people: undefined})); setPlace(null); setTool('select'); setMessage('已切换到建造模式，模拟暂停；继续时会重新校验路径与目标。'); }}>建造</button>
          <button className={mode === 'simulate' ? 'active' : ''} onClick={resume}>模拟</button>
        </div>
        <div className="v3-hud-actions">
          <button className={analyticsOpen ? 'active' : ''} onClick={() => analyticsOpen ? setAnalyticsOpen(false) : openAnalytics()} title="真实数据分析：热力图、人物轨迹与逐分钟曲线">分析</button>
          <button onClick={enterShowcase} title="展示模式：隐藏界面、自由镜头、昼夜与天气、截图分享">展示</button>
          <button className={layout.challenge ? 'active' : ''} onClick={openChallenge} title="自定义挑战：目标、失败条件、事件强度与活动参数">挑战</button>
          <button onClick={saveNow} title="保存当前方案">保存</button>
          <button onClick={() => setSettingsOpen(true)} title="方案、活动与世界设置">设置</button>
        </div>
      </header>

      {draft && <div className="v3-recover" role="status" aria-label="崩溃恢复">
        <div>
          <b>检测到上次中断的现场</b>
          <span>{draft.layout.activity.title} · 第 {draft.layout.run?.minute ?? 0} 分钟 · {new Date(draft.at).toLocaleTimeString()}</span>
        </div>
        <div className="v3-recover-actions">
          <button className="v3-primary" onClick={recoverDraft}>恢复现场</button>
          <button onClick={dismissDraft}>忽略</button>
        </div>
      </div>}

      <nav className="v3-rail" aria-label="建造工具">
        {tools.map(t => <button
          key={t.id}
          className={'v3-tool ' + (tool === t.id ? 'active' : '')}
          disabled={mode !== 'build' && t.id !== 'observe'}
          title={`${t.hint}（${t.key}）`}
          onClick={() => pickTool(t.id)}
        >
          <span>{t.icon}</span>
          <small>{t.label}</small>
          <kbd>{t.key}</kbd>
        </button>)}
      </nav>

      {multiCount > 1 && mode === 'build' && <aside className="v3-multi" aria-label="批量操作">
        <div><b>{multiCount} 项已选</b><span>拖动批量移动 · 右键或 R 旋转 · Delete 删除</span></div>
        <div className="v3-multi-actions">
          <button onClick={() => rotateMany(selectedMany, 1)}>旋转 90°</button>
          <button onClick={() => alignMany(selectedMany, 'x')}>X 对齐</button>
          <button onClick={() => alignMany(selectedMany, 'z')}>Z 对齐</button>
          <button onClick={() => { cloneMany(); }}>复制</button>
          <button className="danger" onClick={() => removeMany(selectedMany)}>删除</button>
          <button onClick={() => { setSelectedMany([]); setSelected(''); }}>取消</button>
        </div>
      </aside>}

      {settings.debug && <aside className="v3-debug" aria-label="开发者调试数据">
        <div className="v3-debug-head"><b>DEBUG · V4.1</b><span>{debugStats ? `${debugStats.fps} FPS` : '采集…'}</span></div>
        {debugStats && <div className="v3-debug-grid">
          <span>人物 <b>{debugStats.people}</b></span>
          <span>座席 <b>{debugStats.seats}</b></span>
          <span>设施 <b>{debugStats.facilities}</b></span>
          <span>碰撞体 <b>{debugStats.colliders}</b></span>
          <span>寻路阻挡格 <b>{debugStats.blockedCells}</b></span>
          <span>场景对象 <b>{debugStats.objects}</b></span>
          <span>几何 <b>{debugStats.geometries}</b></span>
          <span>贴图 <b>{debugStats.textures}</b></span>
        </div>}
        <small>1m 网格 · 黄=阻挡人物 · 蓝=仅阻挡路径 · 青=可穿行 · 粉=墙体 · 橙点=目标 · 青线=路径</small>
      </aside>}

      {activeTray && <section className="v3-tray" aria-label="设施选择">
        <div className="v3-tray-head">
          <div><small>{tool === 'build' ? '活动设施' : tool === 'road' ? '道路系统' : '景观装饰'}</small><b>{tools.find(t => t.id === tool)!.label} · {trayKinds.length} 件</b></div>
          <label className="v3-check"><input type="checkbox" checked={continuous} onChange={e => setContinuous(e.target.checked)}/>连续放置</label>
          <button className="v3-icon" title="关闭" onClick={() => pickTool('select')}>✕</button>
        </div>
        <input className="v3-search" placeholder="搜索设施…" aria-label="搜索设施" value={search} onChange={e => setSearch(e.target.value)}/>
        <div className="v3-cards">
          {trayKinds.map(([kind, v]) => {
            const lock = facilityLock(profile, kind);
            return <button
              key={kind}
              draggable={!lock}
              disabled={!!lock}
              className={'v3-card ' + (place === kind ? 'picked ' : '') + (lock ? 'locked' : '')}
              title={lock ? `${v.name} · 需要 Lv.${lock.level} 解锁` : `${v.name} · ${v.description ?? '活动设施'} · 占地 ${v.w}×${v.d}`}
              onDragStart={e => { if (lock) { e.preventDefault(); return; } e.dataTransfer.setData('application/x-3minlab-facility', kind); setPlace(kind); }}
              onClick={() => chooseKind(kind)}
            >
              <span className="v3-card-icon" style={{color: hex(v.color)}}>{icon(kind)}</span>
              <b>{v.name}</b>
              <small>{lock ? `Lv.${lock.level} 解锁` : `${money(v.cost)} · ${v.w}×${v.d}`}</small>
            </button>;
          })}
          {!trayKinds.length && <p className="v3-empty">没有匹配的设施。</p>}
        </div>
        <div className="v3-tray-foot">
          <span>{place ? `放置中：${CATALOG[place].name} · 点击场地放置` : '点击卡片后在场地中放置，或直接拖入场地'}</span>
          <div className="v3-row">
            <button className={settings.snap ? 'active' : ''} onClick={() => patchSettings({snap: !settings.snap})}>{settings.snap ? '网格吸附' : '自由放置'}</button>
            {place && <button onClick={() => setPlace(null)}>取消</button>}
          </div>
        </div>
      </section>}

      <aside className={'v3-panel ' + ((chosen || personInfo) ? 'has-selection ' : '') + (panelOpen ? '' : 'collapsed')} aria-label="属性与任务" aria-expanded={panelOpen}>
        <div className="v3-panel-head">
          <div><small>{personInfo ? '现场人员' : chosen ? '设施属性' : mode === 'build' ? '现场任务' : '模拟数据'}</small><b>{personInfo ? personInfo.roleLabel : chosen ? CATALOG[chosen.kind].name : mode === 'build' ? '完成你的活动场地' : '活动实况'}</b></div>
          <div className="v3-panel-tools">
            {(chosen || personInfo) && <button className="v3-icon" title="取消选择" onClick={() => { setSelected(''); setSelectedPerson(''); }}>✕</button>}
            <button className="v3-icon" title={panelOpen ? '收起面板' : '展开面板'} onClick={() => setPanelOpen(v => !v)}>{panelOpen ? '▾' : '▸'}</button>
          </div>
        </div>
        {panelOpen && (personInfo ? <div className="v3-panel-body">
          <p className="v3-desc">模拟现场人员。点击其他人员可切换观察对象，点击空白处取消选择。</p>
          <div className="v3-venue-info">
            <h4>人员信息</h4>
            <div><span>角色</span><b>{personInfo.roleLabel}</b></div>
            <div><span>组织</span><b>{personInfo.organization}</b></div>
            <div><span>工作组</span><b>{personInfo.group}</b></div>
            <div><span>任务</span><b>{personInfo.task}</b></div>
            <div><span>状态</span><b>{personInfo.stateLabel}</b></div>
            <div><span>当前目标</span><b>{personInfo.goal}</b></div>
            <div><span>目的地</span><b>({personInfo.destination.x.toFixed(1)}, {personInfo.destination.z.toFixed(1)})</b></div>
            <div><span>路径状态</span><b>{personInfo.routeStatus === 'unreachable' ? '不可达，已安排备用目标' : personInfo.routeStatus === 'blocked' ? '受阻，正在重新规划' : '正常'}</b></div>
            <div><span>座位</span><b>{personInfo.seat ?? '—'}</b></div>
            <div><span>位置</span><b>({personInfo.position.x.toFixed(1)}, {personInfo.position.z.toFixed(1)})</b></div>
            <div><span>剩余路径</span><b>{personInfo.pathRemaining} 段</b></div>
          </div>
          <div className="v3-persona">
            <div className="v3-persona-head">
              <h4>性格与需求</h4>
              <b className={'v3-mood ' + (personInfo.mood < 35 ? 'low' : personInfo.mood < 55 ? 'mid' : 'high')}>情绪 {Math.round(personInfo.mood)}</b>
            </div>
            <div className="v3-traits">
              {(Object.keys(TRAIT_LABELS) as (keyof Personality)[]).map(key => <span
                key={key}
                title={`${TRAIT_LABELS[key]} ${Math.round(personInfo.personality[key] * 100)}%`}
              >{TRAIT_LABELS[key]} <b>{Math.round(personInfo.personality[key] * 100)}</b></span>)}
            </div>
            <div className="v3-needs">
              {(['rest', 'water', 'view', 'social', 'exit'] as NeedKey[]).map(key => <div key={key} className={'v3-need ' + (personInfo.needs[key] > .7 ? 'urgent' : '')}>
                <span>{NEED_LABELS[key]}</span>
                <i><em style={{width: needPercent(personInfo.needs[key]) + '%'}}/></i>
                <b>{needPercent(personInfo.needs[key])}%</b>
              </div>)}
            </div>
            <p className="v3-intent">当前意图 · {personInfo.intent}</p>
          </div>
          <p className="v3-seat-note">需求由时间、活动进度、设施与天气共同推动；满足休息、补水、观看、社交后情绪回升，长期得不到满足会影响目标并可能提前离场。</p>
          <div className="v3-row"><button onClick={() => { cam('center'); setMessage('镜头已对准场地中心，可继续观察人员移动。'); }}>观察场地中心</button></div>
        </div> : chosen ? <div className="v3-panel-body">
          <p className="v3-desc">{CATALOG[chosen.kind].description ?? '活动设施，可拖动、旋转与调整尺寸。'}</p>
          <div className="v3-badges">
            <span>{CATALOG[chosen.kind].group}</span>
            <span className={chosen.locked ? 'locked' : 'editable'}>{chosen.locked ? '已锁定' : '可编辑'}</span>
            <span>{money(itemCost(chosen))}</span>
            {chosen.anchored && <span>已固定</span>}
            {chosen.damaged && <span>受损</span>}
          </div>
          <p className="v3-seat-note">功能 · {FACILITY_ROLE_LABELS[facilityImpact(chosen.kind).role]}：{facilityImpact(chosen.kind).effectText}</p>
          <div className="v3-physics-badges">
            {facilityImpact(chosen.kind).throughput > 0 && <span>服务吞吐 ×{facilityImpact(chosen.kind).throughput}</span>}
            {facilityImpact(chosen.kind).seating > 0 && <span>座位系数 ×{facilityImpact(chosen.kind).seating}</span>}
            {facilityImpact(chosen.kind).shelter > 0 && <span>遮雨系数 ×{facilityImpact(chosen.kind).shelter}</span>}
            {facilityImpact(chosen.kind).medical > 0 && <span>医疗覆盖 ×{facilityImpact(chosen.kind).medical}</span>}
            {facilityImpact(chosen.kind).radius > 0 && <span>有效半径 {facilityImpact(chosen.kind).radius}m</span>}
            {facilityImpact(chosen.kind).staffNeed > 0 && <span>人力需求 {facilityImpact(chosen.kind).staffNeed}</span>}
          </div>
          <p className="v3-seat-note">{physicsFor(chosen.kind).interaction}</p>
          <div className="v3-physics-badges">
            <span>重量 {describePhysics(chosen.kind).mass}</span>
            <span>摩擦 {describePhysics(chosen.kind).friction}</span>
            <span>稳定 {describePhysics(chosen.kind).stability}</span>
            <span>耐候 {describePhysics(chosen.kind).weather}</span>
            {describePhysics(chosen.kind).flags.map(f => <span key={f}>{f}</span>)}
          </div>
          <div className="v3-grid">
            <label>X 坐标<input type="number" value={chosen.x} disabled={!editable || chosenLocked} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) change(chosen.id, {x: n}); }}/></label>
            <label>Z 坐标<input type="number" value={chosen.z} disabled={!editable || chosenLocked} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) change(chosen.id, {z: n}); }}/></label>
            <label>占地<input value={`${sizeText(bounds(chosen).w)} × ${sizeText(bounds(chosen).d)}`} disabled/></label>
            <label>容量<input value={capacityOf(chosen) || '—'} disabled/></label>
            <label>旋转<select value={chosen.rotation} disabled={!editable || chosenLocked} onChange={e => change(chosen.id, {rotation: Number(e.target.value)})}>{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n}°</option>)}</select></label>
            <label>高度<input type="range" min=".6" max="2.2" step=".1" value={chosen.height ?? 1} disabled={!editable || chosenLocked} onChange={e => change(chosen.id, {height: Number(e.target.value)})}/></label>
            <label className="wide">尺寸 <span>{(chosen.scale ?? 1).toFixed(1)}×</span><input type="range" min=".5" max="2" step=".1" value={chosen.scale ?? 1} disabled={!editable || chosenLocked} onChange={e => change(chosen.id, {scale: Number(e.target.value)})}/></label>
          </div>
          <div className="v3-status-row"><span>运行状态</span><b className={runtimeBad ? 'bad' : ''}>{runtime}</b></div>
          {!editable && <p className="v3-hint">模拟中属性只读。点击“暂停并编辑”后可继续调整。</p>}
          <div className="v3-row v3-item-actions">
            <button disabled={!editable || chosenLocked} onClick={() => rotate(chosen)}>旋转 90°</button>
            <button disabled={!editable || chosenLocked} onClick={clone}>复制</button>
            <button onClick={() => toggleLock(chosen)} disabled={!editable}>{chosen.locked ? '解锁' : '锁定'}</button>
            {physicsFor(chosen.kind).anchorable && <button disabled={!editable || chosenLocked} onClick={() => change(chosen.id, {anchored: !chosen.anchored})}>{chosen.anchored ? '解除固定' : '固定帐篷'}</button>}
            <button className="danger" disabled={!editable || chosenLocked} onClick={() => remove(chosen.id)}>删除</button>
          </div>
          <p className="v3-hint">快捷键 R 旋转 · Delete 删除 · 双击设施打开此面板。</p>
        </div> : <div className="v3-panel-body">
          <div className="v3-venue-info">
            <h4>场地信息</h4>
            <div><span>场地</span><b>{venue.name} · {variantInfo.label}</b></div>
            <div><span>类型</span><b>{indoor ? '室内' : '室外'} · {venue.category}</b></div>
            <div><span>尺寸</span><b>{venueDimensions(layout.venueId, layout.venueVariant ?? 'medium')}</b></div>
            <div><span>容量</span><b>{layout.activity.people} / {venueCap} 人</b></div>
            <div><span>出入口</span><b>{layout.items.filter(i => i.kind === 'entrance').length} 个</b></div>
            <div><span>设施</span><b>{layout.items.length} 项 · 可建造区 {(layout.size * layout.size).toLocaleString()}㎡</b></div>
            <div><span>角色</span><b>{(Object.entries(roleCounts(layout)) as [keyof typeof ROLE_LABELS, number][]).filter(([, n]) => n > 0).map(([r, n]) => `${ROLE_LABELS[r]} ${n}`).join(' · ')}</b></div>
            {state && <div><span>现场拥堵</span><b className={state.queue > 20 ? 'bad' : ''}>{state.queue} 人排队</b></div>}
          </div>
          <div className="v3-facility-card">
            <h4>设施功能影响</h4>
            <p>{facility.summary}</p>
            <div className="v3-badges">
              <span>舒适 {facility.comfort}</span>
              <span>安全 {facility.safety}</span>
              <span>视线 {facility.sightline}</span>
              <span>氛围 {facility.atmosphere}</span>
              <span>服务 {facility.scores.service}</span>
            </div>
            <div className="v3-badges">
              {facility.strengths.slice(0, 2).map(strength => <span className="ok" key={strength}>{strength}</span>)}
              {facility.warnings.slice(0, 3).map(warning => <span className="warn" key={warning}>{warning}</span>)}
            </div>
            {state && <div className="v3-live">
              <h4>导演监控</h4>
              <div><span>风险</span><b>{Math.round((state.director?.metrics?.risk ?? 0) * 100)}/100</b><span>满意度</span><b>{satisfaction}</b><span>占用</span><b>{Math.round((state.director?.metrics?.capacityUse ?? 0) * 100)}%</b><span>预警</span><b>{alerts.length}</b><span>进行中</span><b>{activeDirectorEvents.length}</b></div>
            </div>}
          </div>
          {indoor && <div className="v3-wall-modes">
            <h4>室内观察</h4>
            <div className="v3-mode-row"><span>墙体</span>{(['auto', 'translucent', 'full', 'hidden'] as const).map(m => <button key={m} className={layout.wallMode === m || (!layout.wallMode && m === 'auto') ? 'active' : ''} onClick={() => setLayout(prev => ({...prev, wallMode: m}))}>{({auto: '自动', translucent: '半透', full: '完整', hidden: '隐藏'} as const)[m]}</button>)}</div>
            <div className="v3-mode-row"><span>屋顶</span>{(['full', 'translucent', 'hidden'] as const).map(m => <button key={m} className={layout.roofMode === m || (!layout.roofMode && m === 'translucent') ? 'active' : ''} onClick={() => setLayout(prev => ({...prev, roofMode: m}))}>{({full: '完整', translucent: '半透', hidden: '隐藏'} as const)[m]}</button>)}</div>
          </div>}
          <div className="v3-budget">
            <div><span>{budgetMode === 'unlimited' ? '资金模式 · 无限' : '活动预算'}</span><b>{money(layout.activity.budget)}</b></div>
            <div className="v3-budget-bar"><i className={used > layout.activity.budget ? 'bad' : ''} style={{width: `${Math.min(100, used / Math.max(1, layout.activity.budget) * 100)}%`}}/></div>
            <div className="v3-budget-row"><span>已用 {money(used)}</span><span className={used > layout.activity.budget ? 'bad' : ''}>{budgetMode === 'unlimited' ? (used > layout.activity.budget ? `超预算 ${money(used - layout.activity.budget)}（不阻止放置）` : `预算内 · 剩 ${money(left)}`) : `剩余 ${money(left)}`}</span></div>
          </div>
          <h4>现场任务</h4>
          <ul className="v3-goals">{goals.map(g => <li key={g.label} className={g.done ? 'done' : ''}>{g.done ? '✓' : '○'} {g.label}</li>)}</ul>
          <h4>场地评估 {warnings.length ? <em>· {warnings.length} 项提醒</em> : <em className="ok">· 通过</em>}</h4>
          {warnings.length ? <ul className="v3-warnings">{warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}</ul> : <p className="v3-ok">未发现明显布局问题。</p>}
          {state && <div className="v3-live">
            <h4>模拟结果</h4>
            <div><span>到场</span><b>{state.arrived}</b><span>签到</span><b>{state.served}</b><span>峰值排队</span><b>{state.peakQueue}</b><span>延误</span><b>{state.delay} 分</b><span>评分</span><b>{rating.score}/100</b><span>应急支出</span><b>{money(state.extraSpend)}</b></div>
            {challenge && challengeResult && <p className={`v3-challenge-summary${challengeResult.failed ? ' bad' : state.status === 'finished' && challengeResult.completed ? ' ok' : ''}`}>
              挑战 · <b>{challenge.name}</b> · {state.status !== 'finished' ? '进行中' : challengeResult.failed ? `失败：${challengeResult.failure}` : challengeResult.completed ? '达成' : '未完成'} · 目标 {challengeResult.met}/{challengeResult.total}
            </p>}
          </div>}
          <div className="v3-tips">
            <b>操作提示</b>
            <span>左键选择 / 拖动设施 · 右键拖动 360° 旋转</span>
            <span>中键拖动平移 · Space + 左键平移</span>
            <span>滚轮朝光标缩放 · WASD 移动 · F 回到场地</span>
            <span>双击设施打开属性编辑 · 双击场地空白处取消</span>
          </div>
        </div>)}
      </aside>

      {analysisOpen && mode === 'build' && layoutAnalysis && <aside className="v3-analysis" aria-label="场地预检" role="dialog">
        <div className="v3-analysis-head">
          <div><small>预检 · 几何 / 动线 / 容量</small><b>场地分析</b></div>
          <div className="v3-analysis-total">
            <b className={layoutAnalysis.scores.total < 55 ? 'bad' : ''}>{layoutAnalysis.scores.total}</b>
            <button className="v3-icon" title="关闭场地分析" onClick={closeAnalysis}>✕</button>
          </div>
        </div>
        <div className="v3-analysis-body">
          <div className="v3-analysis-scores">
            <span>动线 <b>{layoutAnalysis.scores.flow}</b></span>
            <span>容量 <b>{layoutAnalysis.scores.capacity}</b></span>
            <span>安全 <b>{layoutAnalysis.scores.safety}</b></span>
            <span>舒适 <b>{layoutAnalysis.scores.comfort}</b></span>
          </div>
          <div className="v3-analysis-counts">
            <span className="error">阻塞 {analysisErrors.length}</span>
            <span className="warning">提醒 {analysisWarnings.length}</span>
            <span>通行面积 {Math.round(layoutAnalysis.circulation.freeCells / layoutAnalysis.circulation.totalCells * 100)}%</span>
          </div>
          <label className="v3-check"><input type="checkbox" checked={analysisMarksOn} onChange={e => setAnalysisMarksOn(e.target.checked)}/>在 3D 中显示分析标记</label>
          {!!layoutAnalysis.routes.length && <section>
            <h4>路径连通性 <em>{layoutAnalysis.routes.filter(route => route.reachable).length}/{layoutAnalysis.routes.length}</em></h4>
            <ul className="v3-analysis-routes">{layoutAnalysis.routes.map(route => <li key={route.id} className={route.reachable ? 'ok' : 'bad'}>
              <b>{route.label}</b>
              <span>{route.reachable ? `可通行 · ${route.length} 米 · 绕行 ${route.detour.toFixed(2)}×` : '不可通行 · 存在阻挡'}</span>
            </li>)}</ul>
          </section>}
          <section>
            <h4>预检发现 <em>{layoutAnalysis.findings.length}</em></h4>
            {layoutAnalysis.findings.length ? <ul className="v3-analysis-list">{layoutAnalysis.findings.map(finding => <li key={finding.id} className={finding.severity} onClick={() => focusAnalysisFinding(finding)}>
              <div><b>{finding.title}</b><span>{finding.detail}</span></div>
              <small>建议：{finding.fix}</small>
            </li>)}</ul> : <p className="v3-ok">没有发现问题，可以开始模拟。</p>}
          </section>
          <section className="v3-analysis-plan">
            <div className="v3-row">
              <button className="v3-primary" onClick={previewAnalysisPlan}>生成优化预览</button>
              {analysisPreview && <button onClick={applyAnalysisPlan} disabled={!analysisPreview.changes.length}>应用优化（可撤销）</button>}
              {analysisPreview && <button onClick={() => setAnalysisPreview(null)}>取消预览</button>}
            </div>
            {analysisPreview && <div className="v3-analysis-changes">
              <b>{analysisPreview.changes.length ? `${analysisPreview.changes.length} 项调整 · 成本 ${analysisPreview.cost > 0 ? '+' : ''}${money(analysisPreview.cost)}` : '没有可自动优化的项目'}</b>
              <span>预检分 {analysisPreview.before.scores.total} → {analysisPreview.after.scores.total} · 阻塞 {analysisPreview.before.findings.filter(finding => finding.severity === 'error').length} → {analysisPreview.after.findings.filter(finding => finding.severity === 'error').length}</span>
              {!!analysisPreview.changes.length && <ul>{analysisPreview.changes.map(change => <li key={change.id}>
                <b>{change.label}</b><span>{change.reason}</span><em>{change.cost ? money(change.cost) : '无新增成本'}</em>
              </li>)}</ul>}
            </div>}
            <p className="v3-hint">优化只调整真实设施的坐标、锚定与数量；应用后写入撤销栈，可按 Ctrl+Z 恢复。预览中的蓝/绿线框为建议位置，红色线框为原位置。</p>
          </section>
        </div>
      </aside>}

      {analyticsOpen && analyticsReport && <aside className="v3-analytics" aria-label="数据分析" role="dialog">
        <div className="v3-analytics-head">
          <div><small>真实记录 · 快照 / 人物采样</small><b>数据分析</b></div>
          <div className="v3-analytics-head-actions">
            <span className={analyticsReport.curves.length ? '' : 'bad'}>{analyticsReport.curves.length ? `${analyticsReport.curves.length} 快照` : '无数据'}</span>
            <button className="v3-icon" title="关闭数据分析" onClick={() => setAnalyticsOpen(false)}>✕</button>
          </div>
        </div>
        <div className="v3-analytics-body">
          <div className="v3-analytics-stats">
            <span>到场 <b>{analyticsReport.stats.arrived}</b></span>
            <span>签到率 <b>{analyticsReport.stats.servedRate.toFixed(1)}%</b></span>
            <span>峰值排队 <b>{analyticsReport.stats.peakQueue}</b><em>{analyticsReport.stats.peakQueueAt}′</em></span>
            <span>人均排队 <b>{analyticsReport.stats.avgWait.toFixed(1)}′</b></span>
            <span>满意低点 <b>{Math.round(analyticsReport.stats.satisfactionMin)}</b><em>{analyticsReport.stats.satisfactionMinAt}′</em></span>
            <span>结束满意 <b>{Math.round(analyticsReport.stats.satisfactionFinal)}</b></span>
            <span>人物采样 <b>{analyticsReport.stats.peopleSamples}</b></span>
            <span>累计支出 <b>{money(analyticsReport.stats.spend)}</b></span>
          </div>
          <div className="v3-analytics-groups">
            <span>轨迹分组</span>
            {([['all', '全部'], ['visitors', '观众'], ['staff', '工作人员']] as const).map(([value, label]) => <button
              key={value}
              className={analyticsGroup === value ? 'active' : ''}
              onClick={() => setAnalyticsGroup(value)}
            >{label}</button>)}
          </div>
          <section>
            <h4>人流热力图 <em>{analyticsReport.heat.total} 次采样</em></h4>
            <canvas ref={heatCanvas} width={264} height={264} className="v3-analytics-canvas" role="img" aria-label="人物采样密度热力图"/>
            <p className="v3-hint">颜色越暖表示该网格被采样到的人物越多；顶部为北。白点为热区排名，线框为设施实际占地。</p>
          </section>
          <section>
            <h4>趋势曲线 <em>{analyticsReport.curves.length} 个逐分钟快照</em></h4>
            <canvas ref={curveCanvas} width={340} height={210} className="v3-analytics-canvas" role="img" aria-label="排队人数与满意度趋势曲线"/>
            <div className="v3-analytics-legend"><span className="queue">排队人数</span><span className="satisfaction">满意度 0-100</span></div>
          </section>
          <section>
            <h4>人物移动轨迹 <em>{analyticsReport.trajectories.length} 条 · {analyticsGroup === 'all' ? '全部' : analyticsGroup === 'visitors' ? '观众' : '工作人员'}</em></h4>
            <canvas ref={trajectoryCanvas} width={300} height={300} className="v3-analytics-canvas" role="img" aria-label="人物移动轨迹图"/>
            <div className="v3-analytics-legend"><span className="visitor">观众 / 参与者</span><span className="staff">工作人员</span></div>
            <p className="v3-hint">轨迹按人物 ID 串联真实采样位置，移动超过 0.4m 才记录一个点；够长的轨迹才会显示。</p>
          </section>
          <section>
            <h4>结论</h4>
            <ul className="v3-analytics-insights">{analyticsReport.insights.map(insight => <li key={insight}>{insight}</li>)}</ul>
          </section>
          <div className="v3-row">
            <button className="v3-primary" onClick={exportAnalytics}>导出趋势 CSV</button>
            <button onClick={() => setAnalyticsOpen(false)}>关闭</button>
          </div>
          <p className="v3-hint">所有图表都由本次运行的回放快照与人物采样计算，不使用预设图片或随机生成的数据。</p>
        </div>
      </aside>}

      {showcase && <div className="v3-showcase-caption">
        <small>3MINLAB · SHOWCASE</small>
        <b>{layout.activity.title}</b>
        <span>{state ? `第 ${state.minute} 分钟 · ${statusLabels[state.status]}` : '建造预览'} · {weather.icon} {weather.name} · {lighting === 'night' ? '夜景' : lighting === 'dusk' ? '黄昏' : '日景'} · {autoRotate ? '环绕中' : '自由镜头'}</span>
      </div>}

      {showcase && <div className="v3-showcase-bar" role="toolbar" aria-label="展示模式控制">
        <div className="v3-showcase-lights">
          {([['day', '日景'], ['dusk', '黄昏'], ['night', '夜景']] as const).map(([value, label]) => <button
            key={value}
            className={lighting === value ? 'active' : ''}
            onClick={() => setLighting(value)}
          >{label}</button>)}
        </div>
        <label>天气<select value={layout.weather ?? 'sunny'} onChange={e => changeShowcaseWeather(e.target.value as WeatherKind)}>{(['sunny', 'cloudy', 'lightRain', 'heavyRain', 'breeze', 'gale'] as const).map(kind => <option key={kind} value={kind}>{weatherProfile(kind).icon} {weatherProfile(kind).name}</option>)}</select></label>
        <button className={autoRotate ? 'active' : ''} onClick={() => setAutoRotate(value => !value)}>{autoRotate ? '停止环绕' : '环绕镜头'}</button>
        <button onClick={capturePhoto}>拍照</button>
        <button onClick={() => void shareShowcase()}>复制分享文案</button>
        <button onClick={exitShowcase}>退出 Esc</button>
      </div>}

      {preview && <div className="v3-preview">{preview}</div>}
      {message && <div className="v3-toast" role="status">{message}</div>}

      {mode === 'build' ? <section className="v3-dock" aria-label="建造工具条">
        <div className="v3-dock-hint">
          <strong>{place ? `放置：${CATALOG[place].name}` : tool === 'delete' ? '删除工具' : '建造模式'}</strong>
          <span>{place ? '点击场地放置，Esc 取消连续放置' : tool === 'delete' ? '点击设施移除，Ctrl+Z 撤销' : '选择设施放入中央建设区；外围城市不计入预算'}</span>
        </div>
        <div className="v3-dock-actions">
          <button className={settings.snap ? 'active' : ''} title="切换建造坐标的网格吸附" onClick={() => patchSettings({snap: !settings.snap})}>{settings.snap ? '网格吸附' : '自由放置'}</button>
          <button className={analysisOpen ? 'active' : ''} title="检查几何、动线、容量与优化建议" onClick={() => setAnalysisOpen(v => !v)}>场地分析</button>
          <button onClick={undo} disabled={!history.length}>撤销</button>
          <button onClick={redo} disabled={!future.length}>重做</button>
          <div className="v3-cam">
            <button title="缩小" onClick={() => cam('zoom-out')}>−</button>
            <button title="放大" onClick={() => cam('zoom-in')}>＋</button>
            <button onClick={() => cam('center')}>居中</button>
            <button onClick={() => cam('fit')}>适应</button>
            <button onClick={() => cam('reset')}>重置 F</button>
          </div>
          <button className="v3-primary" onClick={() => startRun()}>▶ 开始模拟</button>
        </div>
      </section> : <section className="v3-sim" aria-label="模拟控制条">
        {replay ? <div className="v3-replay">
          <div className="v3-replay-head">
            <div><b>活动回放</b><span>逐分钟快照 · 事件日志驱动 · 不重新随机生成</span></div>
            <div className="v3-replay-clock"><b>{visibleMinute}′</b><span>/ {replayMax}′ · {weatherProfile((replayWeather ?? undefined) as WeatherKind | undefined).icon} {weatherProfile((replayWeather ?? undefined) as WeatherKind | undefined).name}</span></div>
            <div className="v3-replay-head-actions">
              <button onClick={saveReplayFile}>保存回放</button>
              <button onClick={exitReplay}>退出回放</button>
            </div>
          </div>
          <div className="v3-replay-track">
            <input
              type="range" min={0} max={replayMax} step={1} value={replay.minute}
              aria-label="回放时间线"
              onChange={e => { const minute = Number(e.target.value); setReplay(prev => prev ? {...prev, minute, playing: false} : prev); }}
            />
            {replayEvents.map(entry => <i
              key={entry.id}
              className={`v3-replay-mark ${entry.kind} s${entry.severity ?? 1}`}
              style={{left: `${replayMax ? Math.min(100, entry.at / replayMax * 100) : 0}%`}}
              title={`${entry.at}′ · ${entry.title}`}
              onClick={() => jumpReplay(entry)}
            />)}
          </div>
          <div className="v3-replay-controls">
            <button className="v3-primary" onClick={() => setReplay(prev => {
              if (!prev) return prev;
              if (prev.minute >= replayMax) return {...prev, minute: 0, playing: true};
              return {...prev, playing: !prev.playing};
            })}>{replay.playing ? '⏸ 暂停' : replay.minute >= replayMax ? '↺ 重播' : '▶ 播放'}</button>
            <label>速度<select value={replay.speed} onChange={e => setReplay(prev => prev ? {...prev, speed: Number(e.target.value) as 1 | 2 | 4} : prev)}>{REPLAY_SPEEDS.map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
            <div className="v3-replay-cams">
              {REPLAY_CAMERAS.map(camera => <button key={camera.id} className={replay.camera === camera.id ? 'active' : ''} onClick={() => {
                setReplay(prev => prev ? {...prev, camera: camera.id} : prev);
                focusReplaySpot(camera.spot);
              }}>{camera.label}</button>)}
            </div>
            <div className="v3-replay-nav">
              <button onClick={() => { const entry = [...replayEvents].reverse().find(item => item.at < replay.minute); if (entry) jumpReplay(entry); }}>上一事件</button>
              <button onClick={() => { const entry = replayEvents.find(item => item.at > replay.minute); if (entry) jumpReplay(entry); }}>下一事件</button>
            </div>
          </div>
          <div className="v3-replay-body">
            <div className="v3-replay-events">
              <div className="v3-replay-subhead"><b>事件日志</b><span>{replayEvents.length} 条</span></div>
              <div className="v3-replay-list">
                {replayEvents.map(entry => <button
                  key={entry.id}
                  className={'v3-replay-entry ' + entry.kind + (String(entry.id) === replay.selected ? ' active' : '')}
                  onClick={() => jumpReplay(entry)}
                >
                  <em>{entry.at}′</em><i>{replayKindMark[entry.kind] ?? '•'}</i>
                  <span>{replayEventKindLabel(entry.kind)}</span><b>{entry.title}</b>
                </button>)}
                {!replayEvents.length && <p className="v3-empty">暂无事件记录。</p>}
              </div>
            </div>
            <div className="v3-replay-detail">
              {selectedReplayEvent ? <>
                <div className="v3-replay-detail-head">
                  <em>{selectedReplayEvent.at}′</em><b>{selectedReplayEvent.title}</b>
                  <span>{replayEventKindLabel(selectedReplayEvent.kind)}{selectedReplayEvent.severity ? ` · 严重度 ${selectedReplayEvent.severity}` : ''}</span>
                </div>
                <p>{selectedReplayEvent.detail}</p>
                {selectedReplayEvent.reason && selectedReplayEvent.reason !== selectedReplayEvent.detail && <p className="v3-replay-reason">原因：{selectedReplayEvent.reason}</p>}
                {!!selectedReplayEvent.chain?.length && <small>因果链：{selectedReplayEvent.chain.join(' → ')}</small>}
                {!!selectedReplayEvent.effects?.length && <div className="v3-event-effects">{selectedReplayEvent.effects.map(effect => <span key={effect}>{effect}</span>)}</div>}
                {selectedReplayEvent.cost !== undefined && <p>支出 {money(selectedReplayEvent.cost)}</p>}
                <div className="v3-replay-people">
                  <b>涉及人物 {replayInvolvedList.length ? `· ${replayInvolvedList.length} 人` : '· 该时刻没有可用人物快照'}</b>
                  <div>{replayInvolvedList.slice(0, 8).map(person => <button key={person.id} onClick={() => {
                    setSelectedPerson(person.id);
                    setPanelOpen(true);
                    setCameraAction({kind: 'focus', token: Date.now(), target: {x: person.x, z: person.z}, distance: 14});
                    setMessage(`回放人物：${ROLE_LABELS[person.role]} · ${PERSON_STATE_LABELS[person.state as keyof typeof PERSON_STATE_LABELS] ?? person.state} · 已按第 ${replayPeopleFrame?.t ?? replay.minute}′ 快照定位。`);
                  }}>{ROLE_LABELS[person.role]} · {PERSON_STATE_LABELS[person.state as keyof typeof PERSON_STATE_LABELS] ?? person.state}</button>)}</div>
                  {replayPeopleFrame && <small>人物位置来自第 {replayPeopleFrame.t}′ 的现场采样{replayPeopleFrame.t !== replay.minute ? '（最近可用快照）' : ''}。</small>}
                </div>
                <div className="v3-row">
                  <button onClick={() => focusReplaySpot(selectedReplayEvent.location)}>镜头定位事件区域</button>
                  {selectedReplayEvent.directorId !== undefined && <button onClick={() => {
                    const target = state?.director?.events.find(event => event.id === selectedReplayEvent.directorId);
                    if (!target) return;
                    setReplay(prev => prev ? {...prev, minute: Math.min(replayMax, target.activeAt), playing: false, selected: String(selectedReplayEvent.id)} : prev);
                    focusReplaySpot(selectedReplayEvent.location);
                  }}>跳到事件生效</button>}
                </div>
              </> : <p className="v3-empty">选择一个事件查看原因、因果链与涉及人物。</p>}
            </div>
            <div className="v3-replay-metrics">
              <div className="v3-replay-subhead"><b>现场指标</b><span>{replayFrame ? `第 ${replayFrame.t}′ 记录` : '无记录'}</span></div>
              {replayFrame ? <div className="v3-replay-grid">
                <span>到场 <b>{replayFrame.arrived}</b></span>
                <span>签到 <b>{replayFrame.served}</b></span>
                <span>排队 <b>{replayFrame.queue}</b></span>
                <span>场内 <b>{replayFrame.occupancy}</b></span>
                <span>满意 <b>{Math.round(replayFrame.satisfaction)}</b></span>
                <span>风险 <b>{Math.round(replayFrame.risk * 100)}</b></span>
                <span>延误 <b>{replayFrame.delay}′</b></span>
                <span>支出 <b>{money(replayFrame.spend)}</b></span>
                <span>流程 <b>{replayFrame.tasksDone}/{replayFrame.tasksTotal}</b></span>
                <span>预警 <b>{replayFrame.warningEvents.length}</b></span>
                <span>进行中 <b>{replayFrame.activeEvents.length}</b></span>
                <span>故障 <b>{replayFrame.incidents.length}</b></span>
              </div> : <p className="v3-empty">该时间点没有快照。</p>}
              <p className="v3-hint">快照与事件日志都来自同一次模拟；时间线标记可点击定位，人物位置取最近一次真实采样，不会用随机数重建。</p>
            </div>
          </div>
        </div> : <>
        {alerts[0] && <div className="v3-alert" role="alert">
          <div><b>现场预警 · {alerts[0].title}</b><span>{alerts[0].reason}</span></div>
          <em>{Math.max(0, alerts[0].activeAt - (state?.minute ?? 0))} 分钟后可能发生</em>
          {alerts[0].mitigation && <button onClick={() => alerts[0].mitigation && act(alerts[0].mitigation)}>{DIRECTOR_MITIGATION_LABELS[alerts[0].mitigation]}</button>}
        </div>}
        <div className="v3-sim-top">
          <div className="v3-clock"><b>{state ? `${state.minute}′` : '—'}</b><span>{state ? statusLabels[state.status] : '未开始'}</span></div>
          <div className="v3-sim-stats">
            <span>到场 <b>{state?.arrived ?? 0}</b></span>
            <span>签到 <b>{state?.served ?? 0}</b></span>
            <span>排队 <b>{state?.queue ?? 0}</b></span>
            <span className={(state?.facilities?.toiletQueue ?? 0) >= 8 ? 'warn' : ''}>卫生间 <b>{state?.facilities?.toiletQueue ?? 0}</b></span>
            <span className={(state?.facilities?.vendorQueue ?? 0) >= 8 ? 'warn' : ''}>摊位 <b>{state?.facilities?.vendorQueue ?? 0}</b></span>
            <span>可轮休 <b>{state?.facilities?.restingStaff ?? 0}</b></span>
            <span className={satisfaction < 45 ? 'warn' : ''}>满意 <b>{satisfaction}</b></span>
            <span className={alerts.length ? 'warn' : ''}>预警 <b>{alerts.length}</b></span>
            {challengeResult && <span className={challengeResult.failed ? 'warn' : ''}>目标 <b>{challengeResult.met}/{challengeResult.total}</b></span>}
            <span>延误 <b>{state?.delay ?? 0}′</b></span>
            <span className={warnings.length ? 'warn' : ''}>提醒 <b>{warnings.length}</b></span>
          </div>
          <div className="v3-sim-actions">
            {state ? <>
              <button className="v3-primary" onClick={() => running ? pause() : resume()}>{state.status === 'finished' ? '▶ 重新模拟' : running ? '⏸ 暂停' : '▶ 继续'}</button>
              <button disabled={running || state.status === 'finished'} onClick={() => setState(old => old ? step(old, 1) : old)}>单步</button>
              <label>速度<select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{SPEEDS.map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
              <span className="v3-autosave" title="自动保存时间">{settings.autosave ? `自动保存 ${savedAt ? new Date(savedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '待保存'}` : '自动保存已关闭'}</span>
            </> : <button className="v3-primary" onClick={() => startRun()}>▶ 开始模拟</button>}
            <button onClick={pauseAndEdit}>暂停并编辑</button>
            <button onClick={resetSim}>重置</button>
            <button onClick={saveNow}>保存</button>
            <button disabled={!state || !state.replay?.frames.length} title="回放本次模拟的逐分钟快照与事件日志" onClick={beginReplay}>回放</button>
            <button className={eventsOpen ? 'active' : ''} onClick={() => setEventsOpen(v => !v)}>事件时间线 {eventCount}</button>
            <button className={moneyOpen ? 'active' : ''} onClick={() => setMoneyOpen(v => !v)}>资金明细 {moneyTransactions.length}</button>
            <label className="v3-check"><input type="checkbox" checked={settings.sound} onChange={e => patchSettings({sound: e.target.checked})}/>声音</label>
          </div>
        </div>
        <div className="v3-timeline"><i style={{width: `${visibleProgress}%`}}/><em>{Math.round(visibleProgress)}%</em></div>
        {moneyOpen && <section className="v7-money" aria-label="资金明细">
          <header><b>资金使用记录</b><span>{budgetMode === 'unlimited' ? '无限资金 · 费用照常记录' : '预算挑战 · 应对受余额限制'}</span></header>
          <div className="v7-money-stats"><span>活动预算 <b>{money(layout.activity.budget)}</b></span><span>设施配置 <b>{money(used)}</b></span><span>应急支出 <b>{money(state?.extraSpend ?? 0)}</b></span><span>剩余 <b>{money(Math.max(0,layout.activity.budget-used-(state?.extraSpend ?? 0)))}</b></span><span>超额 <b>{money(Math.max(0,used+(state?.extraSpend ?? 0)-layout.activity.budget))}</b></span></div>
          <small>设施金额来自当前配置；应急金额来自模拟交易。未配置的人力、场地、餐饮与宣传费用不计入已支出。</small>
          <div className="v7-money-list">{moneyTransactions.map(entry => <button key={entry.id} onClick={() => {if(entry.eventId){setEventsOpen(true);setTimelineSelected(entry.eventId)}else if(entry.category==='facility'){setSelected(entry.sourceId);setPanelOpen(true)}}}>
            <span>{entry.category === 'facility' ? '配置' : `${entry.at}′`}</span><b>{entry.title}</b><em>{entry.category === 'facility' ? '设施' : entry.category === 'action' ? '应对' : '事件'}</em><strong>{money(entry.amount)}</strong>
          </button>)}{!moneyTransactions.length && <p>尚无设施或应急交易。</p>}</div>
        </section>}
        {eventsOpen && <>
          <section className="v7-event-stream" aria-label="活动事件时间线">
            <header><b>活动时间线</b><span>最近事件优先，点击查看详情与定位</span></header>
            <div className="v7-event-filters">{([['all','全部'],['positive','顺利'],['negative','问题'],['progress','进程'],['warning','预警'],['action','操作'],['info','信息']] as const).map(([key,label]) => <button key={key} className={timelineFilter===key?'active':''} onClick={() => setTimelineFilter(key)}>{label}</button>)}</div>
            <div className="v7-event-list">{[...timelineEvents].reverse().map(entry => {const tone=timelineTone(entry),expanded=timelineSelected===entry.id,related=entry.directorId===undefined?[]:(state?.replay?.events??[]).filter(other=>other.id!==entry.id&&other.directorId===entry.directorId);return <article key={entry.id} className={`v7-event ${tone}`}>
              <button className="v7-event-summary" onClick={() => setTimelineSelected(expanded?null:entry.id)} aria-expanded={expanded}><time>{entry.at}′</time><span className="v7-event-marker" aria-hidden="true">{{positive:'✓',negative:'!',progress:'▶',warning:'⚠',action:'◆',info:'i'}[tone]}</span><b>{entry.title}</b><em>{{positive:'顺利',negative:'问题',progress:'进程',warning:'预警',action:'操作',info:'信息'}[tone]}</em></button>
              {expanded && <div className="v7-event-detail"><p>{entry.detail}</p><span>位置：{{entrance:'入口',checkin:'签到区',queue:'排队区',stage:'主舞台',rest:'休息区',medical:'医疗点',venue:'活动场地',field:'户外区域'}[entry.location??'venue']}</span>{entry.directorId!==undefined&&<span>处理状态：{{warning:'预警中',active:'进行中',resolved:'已结束',prevented:'已化解'}[state?.director?.events.find(event=>event.id===entry.directorId)?.status??'resolved']}</span>}{entry.reason&&<span>原因：{entry.reason}</span>}{entry.effects?.length?<span>影响：{entry.effects.join('；')}</span>:null}{entry.chain?.length?<span>发展：{entry.chain.join(' → ')}</span>:null}{related.length>0&&<span>关联：{related.map(item=>`${item.at}′ ${item.title}`).join('；')}</span>}{entry.cost?<span>费用：{money(entry.cost)}</span>:null}<button onClick={() => focusReplaySpot(entry.location)}>定位现场</button></div>}
            </article>})}{!timelineEvents.length&&<p>当前筛选下暂无事件。</p>}</div>
          </section>
          <div className="v3-events">
          <div className="v3-interventions">
            <b>应对措施</b>
            <div>{actions.map(a => <button key={a.kind} disabled={!state || state.status === 'finished'} onClick={() => act(a.kind)}>{a.label}</button>)}</div>
          </div>
          {state?.status === 'finished' && <div className="v3-report">
            <strong>模拟结果 · {rating.score}/100</strong>
            <span>场地 {rating.readiness}/40 · 预算 {rating.budget}/20 · 签到 {rating.service}/25 · 进度 {rating.schedule}/15</span>
            <span className={rating.satisfaction < 45 ? 'bad' : ''}>满意度 {Math.round(rating.satisfaction)}/100</span>
            <span>平均排队 {state.served ? Math.round(state.queuePersonMinutes / state.served) : 0} 分钟 · 峰值 {state.peakQueue} 人</span>
            <span>应急支出 {money(state.extraSpend)} · 延误 {state.delay} 分钟</span>
            <span>预算结算 · {budgetMode === 'unlimited' ? '无限资金' : '预算挑战'} · 建设 {money(used)} + 应急 {money(state.extraSpend)} = {money(used + state.extraSpend)}</span>
            <span className={used + state.extraSpend > layout.activity.budget ? 'bad' : ''}>
              {used + state.extraSpend > layout.activity.budget ? `超出预算 ${money(used + state.extraSpend - layout.activity.budget)}` : `预算结余 ${money(layout.activity.budget - used - state.extraSpend)}`}（预算 {money(layout.activity.budget)}）
            </span>
            {challenge && <div className="v3-challenge-report">
              <b className={challengeResult?.failed ? 'bad' : ''}>
                {challengeResult?.failed ? `挑战失败 · ${challengeResult.failure}` : challengeResult?.completed ? '挑战达成' : '挑战未完成'} · 目标 {challengeResult?.met ?? 0}/{challengeResult?.total ?? challenge.goals.length}
              </b>
              <ul>{challengeResult?.goals.map(goal => <li key={goal.id} className={goal.met ? 'ok' : 'miss'}>
                <i>{goal.met ? '✓' : '✕'}</i><span>{goal.label}</span><em>当前 {formatChallengeValue(goal.metric, goal.value)}</em>
              </li>)}</ul>
              {!!challenge.fails.length && <small>失败条件：{challenge.fails.map(rule => rule.label).join(' · ')}</small>}
            </div>}
            {difficultyOutcome && <div className="v3-difficulty-report">
              <b className={difficultyOutcome.failed ? 'bad' : 'ok'}>
                难度 · {tierInfo.name} · {difficultyOutcome.failed ? '未达成' : `评级 ${difficultyOutcome.grade}`}
              </b>
              {difficultyOutcome.rules.length ? <ul>{difficultyOutcome.rules.map(rule => <li key={rule.id} className={rule.met ? 'ok' : 'miss'}>
                <i>{rule.met ? '✓' : '✕'}</i><span>{rule.label}</span><em>当前 {formatDifficultyValue(rule.metric, rule.value)}</em>
              </li>)}</ul> : <small>新手难度不设失败条件，按结果照常结算奖励。</small>}
              {!!difficultyOutcome.requirements.length && <small>硬性要求：{difficultyOutcome.requirements.map(req => `${req.met ? '✓' : '✕'} ${req.label}`).join(' · ')}</small>}
              {difficultyOutcome.failure && <small className="bad">未达成原因：{difficultyOutcome.failure}</small>}
              {lastReward && lastReward.outcome.tier === difficultyOutcome.tier ? <div className="v3-reward-lines">
                <span>经验 <b>+{lastReward.reward.experience}</b></span>
                <span>货币 <b>+{lastReward.reward.currency}</b></span>
                <span>声望 <b>{lastReward.reward.reputation >= 0 ? '+' : ''}{lastReward.reward.reputation}</b></span>
                {!!lastReward.reward.unlocked.length && <span>新解锁 <b>{lastReward.reward.unlocked.map(entry => entry.label).join('、')}</b></span>}
              </div> : <small>该局奖励已在完成时结算；读取旧存档不会重复发放。</small>}
            </div>}
          </div>}
          </div></>}
        </>}
      </section>}
    </div>

    {settingsOpen && <>
      <div className="v3-scrim" onClick={() => setSettingsOpen(false)}/>
      <aside className="v3-settings" role="dialog" aria-label="方案设置">
        <div className="v3-settings-head"><div><small>方案与活动</small><b>设置</b></div><button className="v3-icon" onClick={() => setSettingsOpen(false)}>✕</button></div>
        <section>
          <h3>开局方式</h3>
          <div className="v3-row"><button className="v3-primary" onClick={() => beginTemplate(freeWorldLayout(), '自由世界')}>自由世界 · 空白建设区</button></div>
          <div className="v3-preset-grid">
            {presetActivities.map(p => <button key={p.id} onClick={() => beginTemplate(p.make(), p.label)}><b>{p.label}</b><small>{p.caption}</small></button>)}
          </div>
          <p className="v3-hint">预设是可自由修改的初始模板，不是固定地图；保存后会出现在“已保存方案”中。</p>
        </section>
        <section>
          <h3>场地模板</h3>
          <div className="v3-venue-grid">
            {VENUES.map(v => {
              const active = v.id === (layout.venueId ?? venueForScene(layout.activity.scene));
              return <button key={v.id} className={'v3-venue-card ' + (active ? 'active' : '')} onClick={() => switchVenue(v.id, layout.venueVariant ?? 'medium')}>
                <img src={venueThumbUrl(v.id, active ? layout.venueVariant ?? 'medium' : 'medium')} alt={`${v.name} 等距预览`}/>
                <span className="v3-venue-type">{v.type === 'indoor' ? '室内' : '室外'}</span>
                {venueIsRecommended(v.id, layout.activity.scene) && <em className="v3-rec">推荐</em>}
                <b>{v.name}</b>
                <small>{v.category} · 适合 {v.recommendedScenes.map(s => sceneNames[s] ?? s).join(' / ')}</small>
              </button>;
            })}
          </div>
          <div className="v3-variant-row">
            {VENUE_SIZES.map(size => {
              const info = venueDefinition(layout.venueId).variants[size];
              const active = (layout.venueVariant ?? 'medium') === size;
              return <button key={size} className={active ? 'active' : ''} onClick={() => switchVenue(layout.venueId ?? venueForScene(layout.activity.scene), size)}>
                <b>{size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}</b>
                <span>{info.label}</span>
                <small>{info.size}×{info.size}m · {info.capacity} 人</small>
              </button>;
            })}
          </div>
          <p className="v3-hint">适合本活动的场地：{recommendedVenues(layout.activity.scene).map(x => venueDefinition(x).name).join('、')}。推荐仅供参考，不会限制选择其他场地。</p>
        </section>
        <section>
          <h3>观察模式</h3>
          <div className="v3-mode-row">
            <span>视图</span>
            {(['normal', 'section', 'function'] as const).map(mode => <button
              key={mode}
              className={(layout.viewMode ?? 'normal') === mode ? 'active' : ''}
              onClick={() => setLayout(prev => ({...prev, viewMode: mode}))}
            >{mode === 'normal' ? '正常' : mode === 'section' ? '剖面' : '功能'}</button>)}
          </div>
          <p className="v3-hint">剖面视图自动隐藏屋顶与靠近镜头的墙体；功能视图显示入口、主动线、活动区与应急出口，并弱化次要设施。分区会跟随舞台、桌椅和出入口的实际位置更新。</p>
          <label>墙体模式<select value={layout.wallMode ?? 'auto'} disabled={!indoor || (layout.viewMode ?? 'normal') !== 'normal'} onChange={e => setLayout(prev => ({...prev, wallMode: e.target.value as Layout['wallMode']}))}><option value="auto">自动隐藏靠近镜头的墙</option><option value="translucent">半透明</option><option value="full">完整墙面</option><option value="hidden">隐藏墙体</option></select></label>
          <label>屋顶模式<select value={layout.roofMode ?? 'translucent'} disabled={!indoor || (layout.viewMode ?? 'normal') !== 'normal'} onChange={e => setLayout(prev => ({...prev, roofMode: e.target.value as Layout['roofMode']}))}><option value="full">完整屋顶</option><option value="translucent">半透明</option><option value="hidden">隐藏屋顶</option></select></label>
          <p className="v3-hint">{indoor ? '正常视图会按墙体/屋顶设置显示；剖面与功能视图会自动隐藏屋顶和近侧墙面，室内活动始终可观察。' : '当前为室外场地，墙体与屋顶设置会在切换到室内场地后生效；功能视图的分区在室外同样可用。'}</p>
        </section>
        <section>
          <h3>天气与资金</h3>
          <label>天气<select value={layout.weather ?? 'sunny'} disabled={layout.weatherAuto} onChange={e => changeWeather(e.target.value as WeatherKind)}>{(['sunny', 'cloudy', 'lightRain', 'heavyRain', 'breeze', 'gale'] as const).map(w => <option key={w} value={w}>{weatherProfile(w).icon} {weatherProfile(w).name}</option>)}</select></label>
          <label className="v3-check"><input type="checkbox" checked={!!layout.weatherAuto} onChange={e => setLayout(prev => ({...prev, weatherAuto: e.target.checked}))}/>自动天气变化（按种子确定性生成，变化前预警）</label>
          {layout.weatherAuto && <p className="v3-hint">活动开始后天气按种子变化，变化前 6 分钟提醒准备；可随时关闭自动并手动指定天气。</p>}
          <label>资金模式<select value={budgetMode} onChange={e => setLayout(prev => ({...prev, budgetMode: e.target.value as Layout['budgetMode']}))}><option value="unlimited">无限资金 · 记录费用与超预算提醒</option><option value="challenge">预算挑战 · 超预算会阻止放置</option></select></label>
          <p className="v3-hint">天气影响户外帐篷稳定性、设备与人员速度；预算挑战模式会真正限制放置，无限模式只提醒不阻止。</p>
        </section>
        <section>
          <h3>难度与成长</h3>
          <div className="v3-difficulty-grid">
            {DIFFICULTY_ORDER.map(value => {
              const info = DIFFICULTIES[value];
              const locked = profile.level < info.unlockLevel;
              return <button key={value} className={'v3-difficulty-card ' + (tier === value ? 'active ' : '') + (locked ? 'locked' : '')} disabled={locked} onClick={() => changeDifficulty(value)} title={info.detail}>
                <span className="v3-difficulty-badge">{info.badge}</span>
                <b>{info.name}</b>
                <small>{info.description}</small>
                <em>{locked ? `Lv.${info.unlockLevel} 解锁` : `奖励 ×${info.rewardScale}`}</em>
              </button>;
            })}
          </div>
          <p className="v3-hint">{tierInfo.detail} 约束：{tierInfo.rules.length ? tierInfo.rules.map(rule => rule.label).join(' · ') : '无失败条件'}；硬性要求：{tierInfo.requires.length ? tierInfo.requires.map(req => req === 'medical' ? '至少 1 个医疗点' : '至少 2 个出入口').join(' · ') : '无'}。</p>
          <div className="v3-profile-card">
            <div><b>Lv.{profile.level}</b><span>{level.current}/{level.target} XP</span></div>
            <i><em style={{width: `${level.ratio * 100}%`}}/></i>
            <div className="v3-profile-stats">
              <span>货币 <b>¥{profile.currency.toLocaleString()}</b></span>
              <span>声望 <b>{profile.reputation}</b></span>
              <span>完成 <b>{profile.completedActivities}</b></span>
              <span>解锁 <b>{profile.unlockedItems.length + profile.unlockedScenes.length}</b></span>
            </div>
          </div>
          <h4>下一批解锁</h4>
          {upcomingUnlocks.length ? <ul className="v3-unlocks">{upcomingUnlocks.map(entry => <li key={entry.id}>
            <b>{entry.label}</b><span>{entry.detail}</span><em>Lv.{entry.level}</em>
          </li>)}</ul> : <p className="v3-hint">已解锁全部设施、场景与挑战库内容。</p>}
          <p className="v3-hint">奖励由活动结果结算：经验、货币与声望随难度和评级变化；未达成仍有部分进度，但会扣除声望。设施、场景与挑战库按等级解锁，解锁后会真实出现在建造与选择列表中。</p>
        </section>
        <section>
          <h3>活动信息</h3>
          <label>场景<select value={layout.activity.scene} onChange={e => changeScene(e.target.value as Layout['activity']['scene'])}>{scenes.map(([value, name]) => { const lock = sceneLock(profile, value); return <option key={value} value={value} disabled={!!lock}>{name}{lock ? `（Lv.${lock.level} 解锁）` : ''}</option>; })}</select></label>
          <label>活动名称<input value={layout.activity.title} onChange={e => setLayout(prev => ({...prev, activity: {...prev.activity, title: e.target.value}}))}/></label>
          <label>参与人数<input type="number" min="1" max="20000" value={layout.activity.people} onChange={e => setLayout(prev => ({...prev, activity: {...prev.activity, people: Number(e.target.value)}}))}/></label>
          <label>工作人员<input type="number" min="1" max="400" value={layout.params.staff} onChange={e => setLayout(prev => ({...prev, params: {...prev.params, staff: Math.max(1, Math.min(400, Number(e.target.value) || 1))}}))}/></label>
          <label>志愿者<input type="number" min="0" max="500" value={layout.volunteers ?? 0} onChange={e => setLayout(prev => ({...prev, volunteers: Math.max(0, Math.min(500, Number(e.target.value) || 0))}))}/></label>
          <label>活动预算 ¥<input type="number" min="0" value={layout.activity.budget} onChange={e => setLayout(prev => ({...prev, activity: {...prev.activity, budget: Number(e.target.value)}}))}/></label>
          <label>场地尺寸<input type="number" min="20" max="120" value={layout.size} onChange={e => setLayout(prev => ({...prev, size: Math.max(20, Math.min(120, Number(e.target.value) || 48))}))}/></label>
          <label>地面材质<select value={layout.terrain ?? 'grass'} onChange={e => setLayout(prev => ({...prev, terrain: e.target.value as Layout['terrain']}))}><option value="grass">草地</option><option value="plaza">广场</option><option value="track">跑道</option></select></label>
        </section>
        <section>
          <h3>开放世界</h3>
          <label>城市种子<input key={layout.world?.seed} type="number" defaultValue={layout.world?.seed ?? 20261106} onBlur={e => setSeed(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}/></label>
          <p className="v3-hint">种子决定外围道路、建筑、绿化与车辆的布局，保存后会一并恢复。</p>
        </section>
        <section>
          <h3>画面与操作</h3>
          <label>画面质量<select value={settings.quality} onChange={e => patchSettings({quality: e.target.value as QualityPreference})}><option value="auto">自动（推荐 {recommendedQuality()}）</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <p className="v3-hint">当前使用 {quality} 画质：影响像素比、阴影分辨率、城市分块半径与车辆数量。</p>
          <label>镜头灵敏度 <span className="v3-value">{settings.sensitivity.toFixed(1)}×</span><input type="range" min="0.4" max="2" step="0.1" value={settings.sensitivity} onChange={e => patchSettings({sensitivity: Number(e.target.value)})}/></label>
          <label className="v3-check"><input type="checkbox" checked={settings.snap} onChange={e => patchSettings({snap: e.target.checked})}/>网格吸附（关闭后自由放置）</label>
          <label className="v3-check"><input type="checkbox" checked={settings.shadows} onChange={e => patchSettings({shadows: e.target.checked})}/>日光阴影</label>
          <label className="v3-check"><input type="checkbox" checked={settings.sound} onChange={e => patchSettings({sound: e.target.checked})}/>现场提示音</label>
          <label className="v3-check"><input type="checkbox" checked={settings.music} onChange={e => patchSettings({music: e.target.checked})}/>背景音乐</label>
          <label className="v3-check"><input type="checkbox" checked={settings.autosave} onChange={e => patchSettings({autosave: e.target.checked})}/>自动保存</label>
          <label className="v3-check"><input type="checkbox" checked={settings.debug} onChange={e => patchSettings({debug: e.target.checked})}/>开发者调试模式（1m 网格、碰撞箱、路径与目标）</label>
          <p className="v3-hint">调试模式默认关闭，开启后显示比例检查、占地、座席占用、人物路径与实时性能数据。</p>
        </section>
        <details>
          <summary>概率与资源假设</summary>
          <p className="v3-hint">演示概率仅供压力测试，所有结果由统一的模拟引擎计算。</p>
          {paramsList.map(([key, label]) => <label key={key}>{label}<input type="number" step="any" value={layout.params[key]} onChange={e => setLayout(prev => ({...prev, params: {...prev.params, [key]: Number(e.target.value)}}))}/></label>)}
        </details>
        <details>
          <summary>活动流程 · {layout.activity.tasks.length} 个环节</summary>
          {layout.activity.tasks.map(t => <label key={t.id}>{t.name}<input type="number" min="1" value={t.duration} onChange={e => setLayout(prev => ({...prev, activity: {...prev.activity, tasks: prev.activity.tasks.map(x => x.id === t.id ? {...x, duration: Number(e.target.value)} : x)}}))}/></label>)}
          <button onClick={() => {
            const name = prompt('新增环节名称');
            if (name?.trim()) setLayout(prev => ({...prev, activity: {...prev.activity, tasks: [...prev.activity.tasks, {id: id(), name: name.trim(), start: prev.activity.tasks.length * 30, duration: 30, staff: 2, equipment: false, venue: '主区域', dependencies: prev.activity.tasks.length ? [prev.activity.tasks.at(-1)!.id] : []}]}}));
          }}>＋ 新增环节</button>
        </details>
        <section>
          <h3>数据</h3>
          <div className="v3-row"><button className="v3-primary" onClick={saveNow}>保存当前方案</button><button onClick={() => file.current?.click()}>导入活动备份</button><button onClick={reset}>重置场地</button></div>
          <p className="v3-hint">布局与城市种子会保存在本机浏览器中；导入 3MinLab 活动备份会生成对应的预设场地。</p>
        </section>
        <section>
          <h3>已保存方案</h3>
          {saved.map(x => <button key={x.activity.id} className="v3-saved" onClick={() => { load(x); setSettingsOpen(false); }}><span>{x.activity.title}</span><small>{sceneNames[x.activity.scene] ?? x.activity.scene} · {x.history.length} 次模拟{savedAt ? ` · ${new Date(x.savedAt ?? savedAt).toLocaleString()}` : ''}</small></button>)}
          {!saved.length && <p className="v3-hint">暂无保存方案。</p>}
        </section>
        <section>
          <h3>历史版本 · {versions.length}</h3>
          {versions.map(version => <button key={`${version.at}-${version.label}`} className="v3-saved" onClick={() => restoreVersion(version)}>
            <span>{version.label}</span>
            <small>{new Date(version.at).toLocaleString()} · {version.layout.activity.title} · 第 {version.layout.run?.minute ?? 0} 分钟</small>
          </button>)}
          {!versions.length && <p className="v3-hint">开始、暂停、应对事件或保存模拟后会生成可恢复的历史版本。</p>}
          {!!versions.length && <div className="v3-row"><button onClick={() => { clearVersions(); setVersions([]); setMessage('历史版本已清空。'); }}>清空历史</button></div>}
        </section>
        <section>
          <div className="v3-row"><button onClick={() => { setShowGuide(true); setSettingsOpen(false); }}>查看操作指南</button><a className="v3-link" href="http://127.0.0.1:8788/#home" target="_blank" rel="noreferrer">返回 3MinLab</a></div>
        </section>
      </aside>
    </>}

    {challengeOpen && <>
      <div className="v3-scrim" onClick={() => setChallengeOpen(false)}/>
      <aside className="v3-settings v3-challenge-panel" role="dialog" aria-label="挑战编辑器">
        <div className="v3-settings-head"><div><small>自定义挑战</small><b>{challengeDraft.name.trim() || '未命名挑战'}</b></div><button className="v3-icon" onClick={() => setChallengeOpen(false)}>✕</button></div>
        <section>
          <h3>名称与说明</h3>
          <label>挑战名称<input maxLength={40} value={challengeDraft.name} onChange={e => patchChallenge({name: e.target.value})}/></label>
          <label>挑战说明<textarea rows={2} maxLength={200} value={challengeDraft.brief} onChange={e => patchChallenge({brief: e.target.value})}/></label>
        </section>
        <section>
          <h3>活动与场地</h3>
          <label>活动类型<select value={layout.activity.scene} onChange={e => changeSceneForChallenge(e.target.value as Layout['activity']['scene'])}>{scenes.map(([value, name]) => { const lock = sceneLock(profile, value); return <option key={value} value={value} disabled={!!lock}>{name}{lock ? `（Lv.${lock.level} 解锁）` : ''}</option>; })}</select></label>
          <label>场地<select value={layout.venueId ?? venueForScene(layout.activity.scene)} onChange={e => switchVenueForChallenge(e.target.value, layout.venueVariant ?? 'medium')}>{VENUES.map(v => <option key={v.id} value={v.id}>{v.name} · {v.type === 'indoor' ? '室内' : '室外'}</option>)}</select></label>
          <div className="v3-mode-row">
            <span>规模</span>
            {VENUE_SIZES.map(size => {
              const info = venueDefinition(layout.venueId ?? venueForScene(layout.activity.scene)).variants[size];
              return <button key={size} className={(layout.venueVariant ?? 'medium') === size ? 'active' : ''} onClick={() => switchVenueForChallenge(layout.venueId ?? venueForScene(layout.activity.scene), size)}>
                {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'} · {info.size}m
              </button>;
            })}
          </div>
          <div className="v3-form-grid">
            <label>参与人数<input type="number" min="1" max="20000" value={layout.activity.people} onChange={e => setLayout(prev => ({...prev, activity: {...prev.activity, people: Math.max(1, Math.min(20000, Number(e.target.value) || 1))}}))}/></label>
            <label>活动预算 ¥<input type="number" min="0" value={layout.activity.budget} onChange={e => setLayout(prev => ({...prev, activity: {...prev.activity, budget: Math.max(0, Number(e.target.value) || 0)}}))}/></label>
            <label>时长（分钟）<input type="number" min="1" max="1440" value={layout.activity.duration} onChange={e => setLayout(prev => ({...prev, activity: {...prev.activity, duration: Math.max(1, Math.min(1440, Number(e.target.value) || 1))}}))}/></label>
            <label>工作人员<input type="number" min="1" max="400" value={layout.params.staff} onChange={e => setLayout(prev => ({...prev, params: {...prev.params, staff: Math.max(1, Math.min(400, Number(e.target.value) || 1))}}))}/></label>
            <label>志愿者<input type="number" min="0" max="500" value={layout.volunteers ?? 0} onChange={e => setLayout(prev => ({...prev, volunteers: Math.max(0, Math.min(500, Number(e.target.value) || 0))}))}/></label>
            <label>场地尺寸 m<input type="number" min="20" max="120" value={layout.size} onChange={e => setLayout(prev => ({...prev, size: Math.max(20, Math.min(120, Number(e.target.value) || 48))}))}/></label>
          </div>
          <label>天气<select value={layout.weather ?? 'sunny'} disabled={layout.weatherAuto} onChange={e => changeWeather(e.target.value as WeatherKind)}>{(['sunny', 'cloudy', 'lightRain', 'heavyRain', 'breeze', 'gale'] as const).map(kind => <option key={kind} value={kind}>{weatherProfile(kind).icon} {weatherProfile(kind).name}</option>)}</select></label>
          <label className="v3-check"><input type="checkbox" checked={!!layout.weatherAuto} onChange={e => setLayout(prev => ({...prev, weatherAuto: e.target.checked}))}/>自动天气变化（按种子确定性生成）</label>
          <label className="v3-check"><input type="checkbox" checked={budgetMode === 'challenge'} onChange={e => setLayout(prev => ({...prev, budgetMode: e.target.checked ? 'challenge' : 'unlimited'}))}/>预算挑战模式（超预算会阻止放置）</label>
          <p className="v3-hint">设施成本 {money(used)} / 预算 {money(layout.activity.budget)} · 场地容量 {venueCap} 人 · 场地预检提醒 {warnings.length} 项。</p>
        </section>
        <section>
          <h3>随机事件</h3>
          <label>难度<select value={tier} disabled={!!state && state.status !== 'finished'} onChange={e => changeDifficulty(e.target.value as DifficultyTier)}>{DIFFICULTY_ORDER.map(value => { const info = DIFFICULTIES[value]; return <option key={value} value={value} disabled={profile.level < info.unlockLevel}>{info.name}{profile.level < info.unlockLevel ? `（Lv.${info.unlockLevel} 解锁）` : ''}</option>; })}</select></label>
          <p className="v3-hint">难度同时调整预算、人员、参与人数、天气与事件导演频率；结果会检查 {tierInfo.rules.length} 项约束和 {tierInfo.requires.length} 项硬性要求。</p>
          <label>事件强度<select value={challengeDraft.eventIntensity} onChange={e => patchChallenge({eventIntensity: Number(e.target.value)})}>{CHALLENGE_INTENSITIES.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}</select></label>
          <p className="v3-hint">{CHALLENGE_INTENSITIES.find(level => level.value === challengeDraft.eventIntensity)?.hint ?? CHALLENGE_INTENSITIES[1].hint}。强度会真实乘到设备故障、天气、交通、物资与价格事件的概率上。</p>
          <label className="v3-check"><input type="checkbox" checked={challengeDraft.director} onChange={e => patchChallenge({director: e.target.checked})}/>启用动态事件导演（队列、拥挤、天气、医疗、节目等预警）</label>
        </section>
        <section>
          <h3>挑战库</h3>
          <div className="v3-preset-grid">
            {CHALLENGE_PRESETS.map(preset => {
              const lock = challengeLock(profile, preset.id);
              return <button key={preset.id} disabled={!!lock} onClick={() => applyChallengePreset(preset.id)}>
                <b>{preset.label}</b><small>{preset.description}</small><em className="v3-preset-level">{lock ? `Lv.${lock.level} 解锁` : '可使用'}</em>
              </button>;
            })}
          </div>
          <p className="v3-hint">挑战库是可编辑模板，载入后仍可修改目标、失败条件、事件强度与场地；带等级的模板会随玩家等级真实解锁。</p>
        </section>
        <section>
          <h3>达成目标 · {challengeDraft.goals.length}/8</h3>
          {challengeDraft.goals.map(rule => <div className="v3-rule" key={rule.id}>
            <select value={rule.metric} onChange={e => patchChallengeRule('goals', rule.id, {metric: e.target.value as ChallengeMetric})}>{CHALLENGE_GOAL_METRICS.map(metric => <option key={metric} value={metric}>{CHALLENGE_METRICS[metric].label}</option>)}</select>
            <select value={rule.operator} onChange={e => patchChallengeRule('goals', rule.id, {operator: e.target.value as ChallengeOperator})}><option value="atLeast">≥ 不低于</option><option value="atMost">≤ 不高于</option></select>
            <input type="number" step={CHALLENGE_METRICS[rule.metric].step} min={CHALLENGE_METRICS[rule.metric].min} max={CHALLENGE_METRICS[rule.metric].max} value={rule.target} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value)) patchChallengeRule('goals', rule.id, {target: value}); }}/>
            <span className="v3-rule-unit">{CHALLENGE_METRICS[rule.metric].unit}</span>
            <button className="v3-icon" title="删除目标" onClick={() => removeChallengeRule('goals', rule.id)}>✕</button>
          </div>)}
          <div className="v3-row"><button disabled={challengeDraft.goals.length >= 8} onClick={() => addChallengeRule('goals')}>＋ 新增目标</button></div>
          <p className="v3-hint">目标在活动结束时结算，全部满足即为挑战达成；失败条件逐分钟判定，触发会立即结束活动。签到率按当前已到场人数计算。</p>
        </section>
        <section>
          <h3>失败条件 · {challengeDraft.fails.length}/8</h3>
          {challengeDraft.fails.map(rule => <div className="v3-rule" key={rule.id}>
            <select value={rule.metric} onChange={e => patchChallengeRule('fails', rule.id, {metric: e.target.value as ChallengeMetric})}>{Object.keys(CHALLENGE_METRICS).map(metric => <option key={metric} value={metric}>{CHALLENGE_METRICS[metric as ChallengeMetric].label}</option>)}</select>
            <select value={rule.operator} onChange={e => patchChallengeRule('fails', rule.id, {operator: e.target.value as ChallengeOperator})} disabled={rule.metric === 'timeout'}><option value="atLeast">≥ 达到即失败</option><option value="atMost">≤ 低于即失败</option></select>
            <input type="number" step={CHALLENGE_METRICS[rule.metric].step} min={CHALLENGE_METRICS[rule.metric].min} max={CHALLENGE_METRICS[rule.metric].max} value={rule.target} disabled={rule.metric === 'timeout'} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value)) patchChallengeRule('fails', rule.id, {target: value}); }}/>
            <span className="v3-rule-unit">{CHALLENGE_METRICS[rule.metric].unit}</span>
            <button className="v3-icon" title="删除失败条件" onClick={() => removeChallengeRule('fails', rule.id)}>✕</button>
          </div>)}
          <div className="v3-row"><button disabled={challengeDraft.fails.length >= 8} onClick={() => addChallengeRule('fails')}>＋ 新增失败条件</button></div>
          <p className="v3-hint">任一条件触发会立即结束模拟，并在事件日志与结果报告中记录失败原因。</p>
        </section>
        <section>
          <h3>开始前检查</h3>
          {challengeDraftIssues.length
            ? <ul className="v3-challenge-issues">{challengeDraftIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>
            : <p className="v3-hint v3-ok">参数完整，可以开始挑战。</p>}
        </section>
        <section>
          <div className="v3-row">
            <button className="v3-primary" onClick={startChallenge}>▶ 开始挑战</button>
            <button onClick={saveChallenge}>保存挑战</button>
            <button disabled={!layout.challenge} onClick={clearChallenge}>清除挑战</button>
          </div>
          <p className="v3-hint">开始挑战会保存当前布局，按事件强度调整随机事件概率，并由模拟引擎逐分钟判定目标与失败条件。</p>
        </section>
      </aside>
    </>}

    <input ref={file} type="file" hidden accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}/>

    {showGuide && <div className="v3-guide">
      <div className="v3-guide-card">
        <small>3MINLAB · EVENT WORLD V4</small>
        <h2>在真实尺度场地里搭建与演练</h2>
        <ol>
          <li><b>镜头</b>：右键拖动 360° 水平旋转，中键或 Space + 左键平移，滚轮朝光标缩放；俯仰角受限，不会翻转或翻滚。左键选择、拖动设施，双击编辑属性，F 恢复场地视角。</li>
          <li><b>场地</b>：设置中可选体育场、剧院、餐厅、草坪、多功能会议厅、户外音乐节六类场地，每类有 S/M/L 三种真实尺寸与容量；室内场地支持墙体自动隐藏、半透明和隐藏模式。</li>
          <li><b>建造与碰撞</b>：所有设施都有独立碰撞体，放置预览以绿/黄/红显示可行性与原因；人物使用胶囊避让与 A* 寻路，施工人员和观众会绕开障碍，工作人员还能推动桌椅。</li>
          <li><b>角色</b>：观众、参与者、演员、主持、裁判、工作人员、志愿者、安保、医疗与服务人员按活动类型进入不同状态机：签到、找座、就座、后台、上台、巡逻、服务、退场。选中人物可查看角色、任务、目标、状态与剩余路径。</li>
          <li><b>天气与预算</b>：晴天/阴天/小雨/大雨/微风/大风影响帐篷稳定、设备、速度与舒适度；可手动设定或开启带预警的自动天气。默认无限资金只记录与提醒，预算挑战模式会真正阻止超支放置，结算时给出预算对比。</li>
          <li><b>模拟</b>：开始后参与者从入口经签到、活动区移动，车辆沿道路行驶，突发事件按概率影响设施；所有原有模板、评分、保存与经验系统继续可用。</li>
        </ol>
        <p>所有预设场地都可以继续修改，完成后按模拟结果获得经验。</p>
        <button className="v3-primary" onClick={() => { setShowGuide(false); localStorage.setItem(storageKey, 'done'); }}>进入 3D 场地</button>
      </div>
    </div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
