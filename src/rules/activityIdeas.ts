import { activities } from '../data/activities';
import type { Activity, LibraryVenue, VenueKind } from '../types';

/**
 * 环节库适配：把通用场地类型映射到环节库的场地枚举，
 * 再按人数、可用时长筛出可用的互动玩法。
 * 环节库只作为"活动内容"模块的灵感来源，不决定整场方案结构。
 */
const VENUE_MAP: Record<VenueKind, LibraryVenue> = {
  'indoor-small': 'classroom',
  'indoor-large': 'hall',
  outdoor: 'outdoor',
  stadium: 'outdoor',
  hotel: 'hall',
  expo: 'hall',
  online: 'online',
  mixed: 'outdoor',
};

export interface InteractionIdea {
  id: string;
  name: string;
  tagline: string;
  duration: number;
  energy: Activity['energy'];
}

export function suggestInteractions(
  venue: VenueKind,
  people: number,
  availableMinutes: number,
  limit = 3,
): InteractionIdea[] {
  const libraryVenue = VENUE_MAP[venue];
  const candidates = activities
    .filter((item) => item.venues.includes(libraryVenue))
    .filter((item) => item.duration <= Math.max(15, availableMinutes))
    .filter((item) => people >= item.minPeople * 0.6 && people <= item.maxPeople * 3.5)
    .sort((a, b) => Math.abs(a.duration - 20) - Math.abs(b.duration - 20));

  return candidates.slice(0, limit).map((item) => ({
    id: item.id,
    name: item.name,
    tagline: item.tagline,
    duration: item.duration,
    energy: item.energy,
  }));
}
