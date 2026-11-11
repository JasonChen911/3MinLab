import {describe,expect,it} from 'vitest';
import {briefFromActivityDraft,type ActivityDraft} from './activityDraft';

describe('AI 追问修正初始活动信息',()=>{
 it('组织者后续更改人数和预算时采用新回答，并保留问答记录',()=>{
  const draft:ActivityDraft={title:'校园讲座',categoryId:'academic-lecture',planningMode:'full',people:200,budget:6000,durationMinutes:120,date:'',venue:'indoor-large',audience:'大学生',goal:'交流研究成果',features:[],flow:['签到','演讲','问答'],staff:[],materials:[],confirmedFields:['people','budget'],questions:[],conversation:[{question:'人数和预算是否确定？',answer:'改为200人，预算6000元'}]};
  const brief=briefFromActivityDraft('校园讲座，100人，预算3000元',draft);
  expect(brief.people).toBe(200);
  expect(brief.budget).toBe(6000);
  expect(brief.aiDraft?.conversation).toEqual(draft.conversation);
 });
});
