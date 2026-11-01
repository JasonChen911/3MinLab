import test from 'node:test';
import assert from 'node:assert/strict';
import { assistWithDeepSeek, normalizeAssist, parseAssist } from './ai.mjs';

test('clarify 请求会收敛字段并拒绝越界输入', () => {
  const request = normalizeAssist({
    mode: 'clarify',
    idea: '  办一场校园迎新  ',
    brief: { people: 400, budget: 8000, duration: 240, venue: 'indoor-large', category: 'campus-welcome' },
  });
  assert.equal(request.mode, 'clarify');
  assert.equal(request.idea, '办一场校园迎新');
  assert.equal(request.brief.people, 400);

  assert.throws(() => normalizeAssist({ mode: 'unknown', idea: 'x' }), /未知的 AI 模式/);
  assert.throws(() => normalizeAssist({ mode: 'clarify', idea: '' }), /请先描述活动想法/);
  assert.throws(() => normalizeAssist({ mode: 'clarify', idea: 'x', brief: { people: -5 } }), /人数不正确/);
});

test('enrich 请求只接受白名单模块', () => {
  const request = normalizeAssist({
    mode: 'enrich',
    moduleId: 'risk',
    instruction: '更关注天气',
    plan: { title: '校园马拉松', people: 800, budget: 60000, duration: 360 },
  });
  assert.equal(request.moduleId, 'risk');
  assert.equal(request.plan.people, 800);
  assert.throws(() => normalizeAssist({ mode: 'enrich', moduleId: 'unknown-module' }), /模块不存在/);
});

test('解析 clarify 结果并裁剪问题数量', () => {
  const questions = Array.from({ length: 5 }, (_, index) => ({
    field: ['people', 'budget', 'date', 'venue', 'goal'][index],
    prompt: `问题 ${index}`,
    options: [{ label: 'A', value: '1' }, { label: 'B', value: '2', hint: '提示' }],
  }));
  const result = parseAssist(JSON.stringify({ reply: '好的', questions }), 'clarify');
  assert.equal(result.questions.length, 3);
  assert.equal(result.reply, '好的');
  assert.equal(result.questions[0].field, 'people');

  assert.throws(
    () => parseAssist(JSON.stringify({ questions: [{ field: 'vibes', prompt: 'x', options: [{ label: 'a', value: 'b' }] }] }), 'clarify'),
    /字段无效/,
  );
  assert.throws(() => parseAssist('not json', 'clarify'), /格式不正确/);
});

test('解析 enrich 结果并限制条数与长度', () => {
  const items = Array.from({ length: 9 }, (_, index) => `建议 ${index} ${'长'.repeat(200)}`);
  const result = parseAssist(JSON.stringify({ reply: '补充', items }), 'enrich');
  assert.equal(result.items.length, 6);
  assert.ok(result.items.every((item) => item.length <= 120));
  assert.throws(() => parseAssist(JSON.stringify({ reply: '补充', items: [] }), 'enrich'), /没有给出可用建议/);
});

test('调用 DeepSeek 时使用服务端 Key 与 JSON 输出', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: '建议如下', items: ['第一条', '第二条'] }) } }] }),
    };
  };

  const result = await assistWithDeepSeek({ mode: 'enrich', moduleId: 'budget', plan: { people: 100 } }, 'sk-test', fakeFetch);

  assert.deepEqual(result.items, ['第一条', '第二条']);
  assert.ok(captured);
  assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(captured.init.headers.Authorization, 'Bearer sk-test');
  const body = JSON.parse(String(captured.init.body));
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.model, 'deepseek-flash');
  assert.ok(String(body.messages[0].content).includes('JSON'));
  await assert.rejects(() => assistWithDeepSeek({ mode: 'enrich', moduleId: 'risk' }, '', fakeFetch), /未配置/);
});

test('revise 请求收敛文本与已知条件', () => {
  const request = normalizeAssist({
    mode: 'revise',
    text: '  把预算压到 5000  ',
    brief: { people: 300, budget: 12000, duration: 240, venue: 'outdoor' },
  });
  assert.equal(request.mode, 'revise');
  assert.equal(request.text, '把预算压到 5000');
  assert.equal(request.brief.people, 300);
  assert.throws(() => normalizeAssist({ mode: 'revise', text: '' }), /修改要求/);
  assert.throws(() => normalizeAssist({ mode: 'revise', text: 'x', brief: { people: 0 } }), /人数不正确/);
});

test('解析 revise 补丁并拒绝越界值', () => {
  const ok = parseAssist(JSON.stringify({
    reply: '好的',
    patch: { budget: 5000, staffScale: 0.8, extraInteractions: ['现场抽奖', '分组问答'] },
    note: '同时建议缩小规模',
  }), 'revise');
  assert.equal(ok.patch.budget, 5000);
  assert.equal(ok.patch.staffScale, 0.8);
  assert.deepEqual(ok.patch.extraInteractions, ['现场抽奖', '分组问答']);
  assert.equal(ok.note, '同时建议缩小规模');

  assert.throws(() => parseAssist(JSON.stringify({ patch: { venue: 'moon' } }), 'revise'), /场地无效/);
  assert.throws(() => parseAssist(JSON.stringify({ patch: {} }), 'revise'), /可执行的修改/);
  assert.throws(() => parseAssist(JSON.stringify({ patch: { people: -1 } }), 'revise'), /人数无效/);
});
