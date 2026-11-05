import {describe,it,expect} from 'vitest';
import {createBriefFromPreset} from '../rules/intake';
import {generatePlan} from '../rules/generator';
import {createWorkspace} from '../workbench/model';
import {createDocument,documentSource,syncDocuments} from '../workbench/documents';
import {checkPlan,minutes} from './health';
import {withTable,suggestAssignments,reviewReport,taskFields,emergencyDraft,reviewFingerprint} from './records';
const fixture=()=>{const p=generatePlan(createBriefFromPreset('campus-welcome'));return {p,w:createWorkspace(p)};};
describe('活动全生命周期真实数据规则',()=>{
 it('应急与复盘重新生成仍使用正确数据，手工文档仅标记过期',()=>{const {p,w}=fixture();const next=withTable(w,'emergency','应急',[],emergencyDraft(w));const doc=createDocument(next,p,'emergency');expect(doc.name).toBe('应急预案');expect(doc.text).toContain('触发条件');next.documents=[{...doc,manual:true,text:'人工审定内容'}];next.tables.emergency.rows[0].owner='真实负责人';const synced=syncDocuments(next,p);expect(synced.documents[0].text).toBe('人工审定内容');expect(documentSource(next,p,'emergency')).not.toBe(doc.source);expect(createDocument(next,p,'actual-review').text).toContain('实际记录复盘');});
 it('相同资源时间重叠检出，非重叠不误报',()=>{const {p,w}=fixture();w.flow=[{id:'a',title:'签到',start:'09:00',end:'10:00',owner:'甲',people:[],venue:'礼堂',equipment:'音响',status:'',note:''},{id:'b',title:'演讲',start:'09:30',end:'10:30',owner:'甲',people:[],venue:'礼堂',equipment:'音响',status:'',note:''}];expect(checkPlan(p,w).some(c=>c.id.startsWith('conflict-'))).toBe(true);w.flow[1].start='10:05';expect(checkPlan(p,w).some(c=>c.id.startsWith('conflict-'))).toBe(false);});
 it('容量和超支不依赖 AI',()=>{const {p,w}=fixture();w.tables['activity-settings']={id:'s',name:'s',fields:[],revision:1,rows:[{id:'s',capacity:'1'}]};w.tables.expenses={id:'e',name:'e',fields:[],revision:1,rows:[{id:'e',actual:String(p.brief.budget+1),budget:'0'}]};const checks=checkPlan(p,w);expect(checks.find(c=>c.id==='capacity')?.level).toBe('error');expect(checks.find(c=>c.id==='budget')?.level).toBe('error');});
 it('未填容量不能当作通过',()=>{const {p,w}=fixture();expect(checkPlan(p,w).find(c=>c.id==='capacity')?.level).toBe('warning');expect(minutes('25:00')).toBeNull();expect(minutes('9:61')).toBeNull();});
 it('分工遵守技能和不可用状态，原名单不被修改',()=>{const {w}=fixture();w.people=[{id:'1',name:'甲',roles:[],fields:{skills:'音响',available:'不可用'}},{id:'2',name:'乙',roles:[],fields:{skills:'音响',available:'可用'}}];const next=withTable(w,'tasks','tasks',taskFields,[{id:'t',title:'调音',skill:'音响',owner:''}]);const before=JSON.stringify(next);expect(suggestAssignments(next)[0].owner).toBe('乙');expect(JSON.stringify(next)).toBe(before);expect(w.tables.tasks).toBeUndefined();});
 it('已指定人员保留、无合适人员保持空缺',()=>{const {w}=fixture();const next=withTable(w,'tasks','tasks',taskFields,[{id:'a',owner:'原负责人'},{id:'b',owner:'',skill:'医疗'}]);expect(suggestAssignments(next).map(t=>t.owner)).toEqual(['原负责人','']);});
 it('复盘只使用签到与实际支出，不把预算和模拟当作实际值',()=>{const {p,w}=fixture();expect(reviewReport(p,w)).toContain('实际签到记录：未记录');const next=withTable(w,'registrations','报名',[],[{id:'a',name:'甲',status:'已报名',checkin:'已签到'},{id:'b',name:'乙',status:'已报名'}]);expect(reviewReport(p,next)).toContain('实际签到记录：1');expect(reviewReport(p,next)).toContain('已记录实际支出：未记录');});
 it('不同场景生成不同预案，负责人保持待确认',()=>{const {w}=fixture();expect(emergencyDraft({...w,scene:'performance'})[0].name).not.toBe(emergencyDraft({...w,scene:'athletics'})[0].name);expect(emergencyDraft(w)[0].owner).toContain('待指定');});
 it('任务前置依赖真实核验',()=>{const {p,w}=fixture();const next=withTable(w,'tasks','任务',taskFields,[{id:'a',title:'备料',status:'待执行'},{id:'b',title:'开场',status:'已完成',depends:'a'}]);expect(checkPlan(p,next).find(c=>c.id==='order-b')?.level).toBe('error');});
 it('实际记录变更后不能继续声称已确认，历史快照可独立留存',()=>{const {p,w}=fixture();let next=withTable(w,'actual-review','复盘',[],[{id:'a',duration:'120',notes:'实际经验'}]);next.tables['actual-review'].rows[0].confirmed='是';next.tables['actual-review'].rows[0].confirmedFingerprint=reviewFingerprint(p,next);expect(reviewReport(p,next)).toContain('组织者已确认记录');next=withTable(next,'registrations','报名',[],[{id:'a',name:'新签到者',checkin:'已签到'}]);expect(reviewReport(p,next)).toContain('尚未确认');});

});
