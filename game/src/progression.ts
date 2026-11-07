/**
 * Player progression: levels, currency, reputation and level-gated unlocks.
 * Rewards are derived from measured difficulty outcomes, never from UI actions.
 */
import {UNLOCKABLES, difficultyReward, type DifficultyOutcome, type DifficultyReward, type Unlockable} from './difficulty';
export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  type: 'tutorial' | 'daily' | 'challenge';
  scenes?: string[];
  goal: number;
  event: ProgressionEvent['type'] | 'activity-completed';
  rewardExperience: number;
  rewardCurrency: number;
}

export interface QuestProgress {
  questId: string;
  progress: number;
  completedAt?: string;
  claimedAt?: string;
}

export interface RewardDefinition {
  id: string;
  label: string;
  kind: RewardState['kind'];
  amount?: number;
  unlockId?: string;
}

export interface UnlockableItem {
  id: string;
  label: string;
  category: 'facility' | 'vehicle' | 'decor' | 'outfit' | 'scene' | 'terrain';
  unlockLevel: number;
}

export type UnlockableItems = UnlockableItem[];

export interface PlayerProgress {
  level: number;
  experience: number;
  completedActivities: number;
  unlockedItems: string[];
  unlockedScenes: string[];
}

export interface ExperienceSystem {
  forLevel(level: number): number;
  progress(profile: PlayerProfile): {current: number; target: number; ratio: number};
  award(profile: PlayerProfile, amount: number, note: string, scene?: string): PlayerProfile;
  completeActivity(profile: PlayerProfile, amount: number, note: string, scene?: string): PlayerProfile;
}

export interface MissionState {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed';
  progress: number;
  goal: number;
  rewardExperience: number;
  rewardCurrency: number;
}

export interface AchievementState {
  id: string;
  title: string;
  unlockedAt?: string;
}

export interface RewardState {
  id: string;
  kind: 'currency' | 'experience' | 'item' | 'scene' | 'template';
  label: string;
  amount?: number;
  claimedAt?: string;
}

export interface ProgressionEvent {
  at: string;
  type: 'experience' | 'level' | 'currency' | 'unlock' | 'mission' | 'reward';
  amount?: number;
  note: string;
}

export interface PlayerProfile {
  schema: 1;
  id: string;
  name: string;
  level: number;
  experience: number;
  currency: number;
  reputation: number;
  completedActivities: number;
  unlockedItems: string[];
  unlockedScenes: string[];
  favoriteScenes: string[];
  achievements: AchievementState[];
  missions: MissionState[];
  rewards: RewardState[];
  progressionHistory: ProgressionEvent[];
  updatedAt: string;
}

export interface ActivityAward {
  profile: PlayerProfile;
  reward: DifficultyReward;
}

const KEY = '3minlab-player-v1';

export function experienceForLevel(level: number): number {
  return Math.max(60, 100 + Math.max(0, level - 1) * 60);
}

export function defaultProfile(): PlayerProfile {
  return {
    schema: 1, id: 'local-player', name: '活动策划人', level: 1, experience: 0, currency: 0, reputation: 0,
    completedActivities: 0, unlockedItems: [], unlockedScenes: ['custom', 'athletics', 'performance', 'conference', 'community'],
    favoriteScenes: [], achievements: [], missions: [], rewards: [], progressionHistory: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Add every level-gated facility, decoration, scene and challenge the player has reached. */
export function syncUnlocks(profile: PlayerProfile): PlayerProfile {
  const unlockedItems = new Set(profile.unlockedItems);
  const unlockedScenes = new Set(profile.unlockedScenes);
  for (const entry of UNLOCKABLES) {
    if (profile.level < entry.level) continue;
    if (entry.category === 'scene') unlockedScenes.add(entry.ref);
    else unlockedItems.add(entry.category === 'challenge' ? `challenge:${entry.ref}` : entry.ref);
  }
  return {...profile, unlockedItems: [...unlockedItems], unlockedScenes: [...unlockedScenes]};
}

function newUnlocks(before: PlayerProfile, after: PlayerProfile): Unlockable[] {
  const items = new Set(before.unlockedItems), scenes = new Set(before.unlockedScenes);
  return UNLOCKABLES.filter(entry => {
    const had = entry.category === 'scene'
      ? scenes.has(entry.ref)
      : items.has(entry.category === 'challenge' ? `challenge:${entry.ref}` : entry.ref);
    if (had) return false;
    return entry.category === 'scene' ? after.unlockedScenes.includes(entry.ref) : after.unlockedItems.includes(entry.category === 'challenge' ? `challenge:${entry.ref}` : entry.ref);
  });
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as PlayerProfile | null;
    if (!raw || raw.schema !== 1) return defaultProfile();
    return syncUnlocks({...defaultProfile(), ...raw, reputation: raw.reputation ?? 0, currency: raw.currency ?? 0, completedActivities: raw.completedActivities ?? 0, unlockedScenes: raw.unlockedScenes ?? defaultProfile().unlockedScenes, favoriteScenes: raw.favoriteScenes ?? [], missions: raw.missions ?? [], rewards: raw.rewards ?? [], achievements: raw.achievements ?? [], unlockedItems: raw.unlockedItems ?? [], progressionHistory: raw.progressionHistory ?? []});
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: PlayerProfile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* optional layer */ }
}

export function addExperience(profile: PlayerProfile, amount: number, note: string): PlayerProfile {
  const next: PlayerProfile = {...profile, experience: profile.experience + Math.max(0, Math.round(amount)), updatedAt: new Date().toISOString()};
  const earnEvent: ProgressionEvent = {at: next.updatedAt, type: 'experience', amount, note};
  next.progressionHistory = [...next.progressionHistory, earnEvent].slice(-80);
  while (next.experience >= experienceForLevel(next.level)) {
    next.experience -= experienceForLevel(next.level);
    next.level += 1;
    next.progressionHistory.push({at: next.updatedAt, type: 'level', amount: next.level, note: `升级到 Lv.${next.level}`});
  }
  return next;
}

export function levelProgress(profile: PlayerProfile) {
  const target = experienceForLevel(profile.level);
  return {current: profile.experience, target, ratio: Math.max(0, Math.min(1, profile.experience / target))};
}

export function completeActivity(profile: PlayerProfile, amount: number, note: string, scene?: string): PlayerProfile {
  const next = addExperience(profile, amount, note);
  next.completedActivities += 1;
  if (scene && !next.unlockedScenes.includes(scene)) next.unlockedScenes = [...next.unlockedScenes, scene];
  const completionEvent: ProgressionEvent = {at: next.updatedAt, type: 'mission', note: `完成活动：${note}`};
  next.progressionHistory = [...next.progressionHistory, completionEvent].slice(-80);
  return syncUnlocks(next);
}

/** Settle a finished run: XP, currency, reputation and level-gated unlocks from measured results. */
export function awardActivity(profile: PlayerProfile, outcome: DifficultyOutcome, note: string, scene?: string): ActivityAward {
  const reward = difficultyReward(outcome);
  const before = profile;
  const next = addExperience(profile, reward.experience, `${outcome.profile.name} · ${outcome.grade} · ${note}`);
  next.currency = Math.max(0, next.currency + reward.currency);
  next.reputation = Math.max(0, next.reputation + reward.reputation);
  next.completedActivities += 1;
  if (scene && !next.unlockedScenes.includes(scene)) next.unlockedScenes = [...next.unlockedScenes, scene];
  next.progressionHistory = [
    ...next.progressionHistory,
    {at: next.updatedAt, type: 'currency', amount: reward.currency, note: `活动奖励 · ${note}`} satisfies ProgressionEvent,
    {at: next.updatedAt, type: 'mission', note: `完成 ${outcome.profile.name} 活动：${outcome.failed ? `未达成（${outcome.failure ?? '目标未满足'}）` : `评级 ${outcome.grade}`}`} satisfies ProgressionEvent,
    ...(reward.reputation ? [{at: next.updatedAt, type: 'reward' as const, amount: reward.reputation, note: `声望 ${reward.reputation > 0 ? '+' : ''}${reward.reputation}`}] : []),
  ].slice(-80);
  const synced = syncUnlocks(next);
  const unlocked = newUnlocks(before, synced);
  const receipt: RewardState = {
    id: `reward-${outcome.tier}-${synced.completedActivities}-${Math.random().toString(36).slice(2, 7)}`,
    kind: 'currency',
    label: `${outcome.profile.name} · ${outcome.grade} · ${reward.experience} XP / ${reward.currency} 货币 / 声望 ${reward.reputation >= 0 ? '+' : ''}${reward.reputation}${unlocked.length ? ` · 解锁 ${unlocked.map(entry => entry.label).join('、')}` : ''}`,
    amount: reward.currency,
    claimedAt: synced.updatedAt,
  };
  synced.rewards = [...synced.rewards, receipt].slice(-30);
  return {profile: synced, reward: {...reward, unlocked}};
}

export const experienceSystem: ExperienceSystem = {
  forLevel: experienceForLevel,
  progress: levelProgress,
  award: addExperience,
  completeActivity,
};
