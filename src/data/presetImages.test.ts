import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PRESETS} from './presets';
import {PRESET_IMAGES,FALLBACK_PRESET_IMAGE} from './presetImages';
describe('模板摄影资源',()=>{it('已有照片来源可追溯，模板之间不重复使用照片；未补齐项目显示占位图',()=>{expect(PRESETS.length).toBe(59);expect(new Set(Object.values(PRESET_IMAGES).map(p=>p.src)).size).toBe(Object.keys(PRESET_IMAGES).length);for(const preset of PRESETS){const image=PRESET_IMAGES[preset.id];if(!image)continue;expect(image.alt.length).toBeGreaterThan(5);const file=resolve('public'+image.src);expect(existsSync(file)).toBe(true);const bytes=readFileSync(file);expect(bytes.subarray(0,4).toString()==='RIFF'||bytes[0]===0xff&&bytes[1]===0xd8).toBe(true);expect(image.source).toContain('https://www.pexels.com/photo/');expect(image.author.length).toBeGreaterThan(2);}expect(existsSync(resolve('public'+FALLBACK_PRESET_IMAGE))).toBe(true);});});
