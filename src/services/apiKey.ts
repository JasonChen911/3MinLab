export const API_KEY_STORAGE_KEY = 'activity-lab-deepseek-key';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadApiKey(storage: StorageLike = localStorage): string {
  try { storage.removeItem(API_KEY_STORAGE_KEY); return ''; } catch { return ''; }
}

export function saveApiKey(value: string, storage: StorageLike = localStorage): boolean {
  void value; try { storage.removeItem(API_KEY_STORAGE_KEY); } catch { /* no persistence */ } return false;
}

export function clearApiKey(storage: StorageLike = localStorage): boolean {
  try { storage.removeItem(API_KEY_STORAGE_KEY); return true; } catch { return false; }
}
