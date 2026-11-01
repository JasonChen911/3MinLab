import { describe, expect, it } from 'vitest';
import { createWorkspace, type AthleticsData } from './model';
import { createBrief } from '../rules/intake';
import { generatePlan } from '../rules/generator';
import { generateSchedule, parseMark, rankProject, resultIssues, scheduleConflicts, teamStandings, validateEntries } from './athletics';
function sample(): AthleticsData {
 const data=createWorkspace(generatePlan(createBrief('田径运动会'))).athletics;
 data.projects=[{id:'p',name:'100米',group:'公开组',kind:'track',relay:false,lanes:2,duration:10,capacity:20,rounds:'final',venue:'跑道',officials:'裁判A',start:'09:00',tieRule:'shared'}];
 data.athletes=Array.from({length:3},(_,i)=>({id:`a${i}`,name:`选手${i}`,number:`00${i}`,team:i===2?'乙队':'甲队',group:'公开组',projects:['p'],seed:''}));
 data.results=data.athletes.map((athlete,i)=>({id:`r${i}`,projectId:'p',athleteId:athlete.id,round:'决赛',value:['12.1','11.9','12.3'][i],status:'有效',tieBreak:'',note:''})); return data;
}
describe('田径闭环计算',()=>{
 it('报名检查编号、重复项目、人数与兼项限制',()=>{const data=sample(); expect(validateEntries(data)).toEqual([]); data.athletes[1].number='000'; data.athletes[0].projects=['p','p','p','p']; data.projects[0].capacity=1; expect(validateEntries(data).length).toBeGreaterThanOrEqual(3);});
 it('分组安排道次并避开场地和兼项间隔',()=>{const data=sample(); data.projects.push({...data.projects[0],id:'q',name:'200米',venue:'跑道2',officials:'裁判B'});data.athletes[0].projects.push('q'); const result=generateSchedule(data);expect(result.races).toHaveLength(3);expect(result.races[0].athletes).toHaveLength(2);expect(scheduleConflicts(data,result.races)).toEqual([]);const clashes=[...result.races];clashes[2]={...clashes[2],start:'09:00'};expect(scheduleConflicts(data,clashes).join()).toContain('兼项间隔');});
 it('径赛时间越小越好，分钟秒解析正确',()=>{const data=sample();expect(rankProject(data,'p').map(row=>row.athlete.id)).toEqual(['a1','a0','a2']);expect(parseMark('1:02.35','track')).toBeCloseTo(62.35);expect(parseMark('1:60','track')).toBeNull();expect(parseMark('-2','track')).toBeNull();});
 it('田赛距离越大越好',()=>{const data=sample();data.projects[0].kind='field';expect(rankProject(data,'p')[0].athlete.id).toBe('a2');});
 it('团体总分使用真实成绩，成绩修正即时重算',()=>{const data=sample();expect(teamStandings(data)[0].points).toBe(16);data.results[2].value='11';expect(teamStandings(data).find(row=>row.team==='乙队')?.points).toBe(9);});
 it('接力系数独立可配',()=>{const data=sample();data.projects[0].relay=true;data.relayFactor=2;expect(rankProject(data,'p')[0].points).toBe(18);});
 it('并列分数平均，弃权无成绩不计分',()=>{const data=sample();data.results[0].value='11.9';data.results[2].status='弃权';const rows=rankProject(data,'p');expect(rows.map(row=>row.rank)).toEqual([1,1]);expect(rows.map(row=>row.points)).toEqual([8,8]);});
 it('跳高同成绩需人工核定，不猜测正式试跳规则',()=>{const data=sample();data.projects[0].kind='height';data.results.forEach(row=>row.value='1.8');expect(rankProject(data,'p').every(row=>row.rank===null)).toBe(true);expect(resultIssues(data).join()).toContain('裁判核定');data.results.forEach((row,i)=>row.tieBreak=String(i+1));expect(rankProject(data,'p').map(row=>row.rank)).toEqual([1,2,3]);});
 it('预赛完成后生成决赛，未录入时只生成预赛',()=>{const data=sample();data.projects[0].rounds='heats-final';data.results=[];expect(generateSchedule(data).races.every(row=>row.round==='预赛')).toBe(true);data.results=sample().results.map(row=>({...row,round:'预赛'}));expect(generateSchedule(data).races.some(row=>row.round==='决赛')).toBe(true);});
 it('空数据无虚构排名，重复成绩不会重复计分',()=>{const data=sample();data.results=[];expect(rankProject(data,'p')).toEqual([]);expect(teamStandings(data).every(row=>row.points===0)).toBe(true);data.results=sample().results;data.results.push({...data.results[0],id:'duplicate'});expect(resultIssues(data).join()).toContain('重复成绩');expect(teamStandings(data).find(row=>row.team==='甲队')?.points).toBe(9);});
});
