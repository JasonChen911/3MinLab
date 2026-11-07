import type {WeatherKind} from '../game';

export interface WeatherProfile {
  kind: WeatherKind;
  name: string;
  icon: string;
  wind: number;
  rain: number;
  comfort: number;
  speedFactor: number;
  tentRisk: number;
  skyTop: number;
  skyBottom: number;
  fog: number;
  sunIntensity: number;
  cloudOpacity: number;
}

export const WEATHERS: Record<WeatherKind, WeatherProfile> = {
  sunny: {kind: 'sunny', name: '晴天', icon: '☀', wind: .12, rain: 0, comfort: .96, speedFactor: 1, tentRisk: 0, skyTop: 0x3f8fdd, skyBottom: 0xe2f2fb, fog: 0xcfe8f6, sunIntensity: 2.35, cloudOpacity: .88},
  cloudy: {kind: 'cloudy', name: '阴天', icon: '☁', wind: .25, rain: 0, comfort: .82, speedFactor: .98, tentRisk: .04, skyTop: 0x8296aa, skyBottom: 0xd8e1e7, fog: 0xc0ccd4, sunIntensity: 1.35, cloudOpacity: 1},
  lightRain: {kind: 'lightRain', name: '小雨', icon: '🌦', wind: .32, rain: .35, comfort: .62, speedFactor: .9, tentRisk: .12, skyTop: 0x64788b, skyBottom: 0xb9c8d3, fog: 0xaabac6, sunIntensity: .95, cloudOpacity: 1},
  heavyRain: {kind: 'heavyRain', name: '大雨', icon: '🌧', wind: .55, rain: 1, comfort: .36, speedFactor: .78, tentRisk: .38, skyTop: 0x465666, skyBottom: 0x8e9daa, fog: 0x8797a5, sunIntensity: .5, cloudOpacity: 1},
  breeze: {kind: 'breeze', name: '微风', icon: '🍃', wind: .45, rain: 0, comfort: .9, speedFactor: 1, tentRisk: .08, skyTop: 0x458ed6, skyBottom: 0xe0f1fa, fog: 0xcbe5f3, sunIntensity: 2.15, cloudOpacity: .8},
  gale: {kind: 'gale', name: '大风', icon: '🌬', wind: 1, rain: 0, comfort: .52, speedFactor: .82, tentRisk: .72, skyTop: 0x5a7285, skyBottom: 0xc3d2dd, fog: 0xb4c6d2, sunIntensity: 1.1, cloudOpacity: 1},
};

export const WEATHER_KINDS: WeatherKind[] = ['sunny', 'cloudy', 'lightRain', 'heavyRain', 'breeze', 'gale'];

export function weatherProfile(kind: WeatherKind | undefined): WeatherProfile {
  return WEATHERS[kind ?? 'sunny'] ?? WEATHERS.sunny;
}

/** Deterministic weather schedule. Manual weather stays until changed when auto is off. */
export function weatherAt(seed: number, minute: number): WeatherKind {
  if (minute < 30) return 'sunny';
  const slot = Math.floor(minute / 35);
  let state = (seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x21f0aaad) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x735a2d97) >>> 0;
  const value = ((state ^ (state >>> 15)) >>> 0) / 4294967296;
  if (value < .3) return 'sunny';
  if (value < .5) return 'cloudy';
  if (value < .64) return 'breeze';
  if (value < .76) return 'lightRain';
  if (value < .88) return 'gale';
  return 'heavyRain';
}

export function nextWeatherChange(minute: number): number {
  if (minute < 30) return 30;
  return 30 + (Math.floor((minute - 30) / 35) + 1) * 35;
}

export function weatherComfort(kind: WeatherKind, indoor: boolean, sheltered: boolean): number {
  const profile = weatherProfile(kind);
  if (indoor) return Math.min(.98, profile.comfort + .22);
  if (sheltered) return Math.min(.95, profile.comfort + .18);
  return profile.comfort;
}

export function suggestWeatherPreparation(kind: WeatherKind): string {
  switch (kind) {
    case 'gale': return '大风预警：固定帐篷和轻型设备，暂停高空作业。';
    case 'heavyRain': return '大雨预警：检查排水与防雨，户外设备建议转移或遮盖。';
    case 'lightRain': return '小雨预警：为排队区和设备准备遮雨措施。';
    case 'cloudy': return '阴天：关注后续天气变化，保留室内备用方案。';
    case 'breeze': return '微风：适合户外活动，注意轻质装饰固定。';
    default: return '天气稳定，适合正常开展活动。';
  }
}
