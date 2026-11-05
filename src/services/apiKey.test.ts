import { describe, expect, it } from 'vitest';
import { clearApiKey, loadApiKey, saveApiKey } from './apiKey';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('DeepSeek key settings', () => {
  it('removes legacy browser secrets and refuses new persistence', () => {
    const storage = memoryStorage();
    storage.setItem('activity-lab-deepseek-key','old-private-secret');
    expect(loadApiKey(storage)).toBe('');
    expect(storage.getItem('activity-lab-deepseek-key')).toBeNull();
    expect(saveApiKey('sk-example',storage)).toBe(false);
    expect(clearApiKey(storage)).toBe(true);
  });

  it('rejects empty and malformed keys', () => {
    const storage = memoryStorage();
    expect(saveApiKey(' ', storage)).toBe(false);
    expect(saveApiKey('bad\nkey', storage)).toBe(false);
    expect(loadApiKey(storage)).toBe('');
  });
});
