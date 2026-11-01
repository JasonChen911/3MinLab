import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeDocumentAI,parseDocumentAI,generateDocumentAI} from './document-ai.mjs';
test('AI 推荐仅接受白名单，不执行生成的逻辑',()=>{const request=normalizeDocumentAI({mode:'recommend',tools:[{id:'a',name:'报名表'}]});assert.deepEqual(parseDocumentAI(JSON.stringify({toolIds:['a','a','malicious'],fields:['项目'],reason:'适用'}),request).toolIds,['a']);});
test('无 Key 明确报错，不伪造调用',async()=>{await assert.rejects(()=>generateDocumentAI({mode:'document'},''),/Key/);});
test('AI 文档调用包含真实上下文，返回待采用初稿',async()=>{const response=await generateDocumentAI({mode:'document',name:'主持词',context:{活动名称:'真实活动'}},'key',async(url,init)=>{assert.ok(JSON.parse(init.body).messages[1].content.includes('真实活动'));return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({text:'主持词初稿'})}}]})};});assert.equal(response.text,'主持词初稿');});
