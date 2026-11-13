import {expect,it} from 'vitest';
import {KEY,DRAFT_KEY,HISTORY_KEY} from './storage';

it('独立游戏使用自己的存档命名空间，不覆盖集成版',()=>{
 expect([KEY,DRAFT_KEY,HISTORY_KEY].every(key=>key.startsWith('3minlab-standalone-'))).toBe(true);
 expect(new Set([KEY,DRAFT_KEY,HISTORY_KEY]).size).toBe(3);
});
