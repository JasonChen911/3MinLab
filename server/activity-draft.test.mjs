import test from 'node:test';
import assert from 'node:assert/strict';
import {configureAI,createActivityDraft} from './ai-service.mjs';

test('首页活动初稿使用统一 AI 配置并校验结构',async()=>{
 configureAI({provider:'OpenAI-compatible',baseUrl:'https://example.com/v1',model:'test-model',temperature:.2,maxTokens:1200,key:'test-only-secret'},false);
 let request;
 const fetchImpl=async(url,options)=>{request={url,body:JSON.parse(options.body),authorization:options.headers.Authorization};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'桌游局',categoryId:'social-party',planningMode:'light',people:15,budget:null,flow:['签到','桌游'],staff:['组织者'],materials:['桌游'],questions:['场地在哪？','何时开始？','预算多少？','多余问题'],confirmedFields:['people']})}}]}),{status:200});};
 const draft=await createActivityDraft({idea:'我想和15个朋友办桌游局',categories:[{id:'social-party',label:'聚会'}]},undefined,fetchImpl);
 assert.equal(request.url,'https://example.com/v1/chat/completions');assert.equal(request.body.model,'test-model');assert.equal(request.authorization,'Bearer test-only-secret');assert.equal(draft.planningMode,'light');assert.equal(draft.people,15);assert.equal(draft.budget,null);assert.equal(draft.questions.length,3);
});
