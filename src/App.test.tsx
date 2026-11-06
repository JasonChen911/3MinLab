import { beforeAll, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App';
import { createBrief } from './rules/intake';
import { generatePlan } from './rules/generator';
import { saveLocalState, STORAGE_KEY } from './services/storage';

/**
 * 整页冒烟测试：没有浏览器环境，用最小 window/localStorage 替身，
 * 验证首页与方案工作台两条渲染路径都不会抛错。
 */
const store = new Map<string, string>();

beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  (globalThis as unknown as { window: unknown }).window = {
    location: { hash: '' },
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
    setTimeout,
  };
});

describe('整页渲染', () => {
  it('默认欢迎页只展示介绍和开始入口，保留原视觉容器', () => {
    (globalThis as unknown as { window: { location: { hash: string } } }).window.location.hash = '';
    const html = renderToString(<App/>);
    expect(html).toContain('让每一场活动');
    expect(html).toContain('活动策划欢迎页');
    expect(html).not.toContain('描述你的活动想法');
    expect(html).toContain('hero-art');
  });
  it('首页渲染想法输入、分类入口与预设卡片', () => {
    (globalThis as unknown as { window: { location: { hash: string } } }).window.location.hash = '#home';
    const html = renderToString(<App/>);
    expect(html).toContain('什么活动都能策划');
    expect(html).toContain('描述你的活动想法');
    expect(html).toContain('找一个适合你的活动起点');
    expect(html).toContain('校园教育类');
    expect(html).toContain('新生迎新活动');
    expect(html).toContain('36');
  });

  it('已有本地方案时直接进入工作台', () => {
    const plan = generatePlan(createBrief('办一场 800 人的校园马拉松，预算 6 万', { now: new Date('2026-11-01T10:00:00') }));
    saveLocalState({ recent: plan, favorites: [plan], history: [plan] }, localStorage);
    (globalThis as unknown as { window: { location: { hash: string } } }).window.location.hash = '#workspace';
    expect(store.get(STORAGE_KEY)).toBeTruthy();

    const html = renderToString(<App/>);
    expect(html).toContain('正在恢复活动项目');
  });
});
