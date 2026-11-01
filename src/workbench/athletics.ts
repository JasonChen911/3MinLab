import { uid, type Athlete, type AthleticsData, type AthleticResult, type EventProject, type Race } from './model';
export interface RankedResult { result: AthleticResult; athlete: Athlete; value: number; rank: number | null; points: number; issue?: string }
export function timeMinutes(time: string) { const match=/^(\d{1,2}):(\d{2})$/.exec(time); if (!match || Number(match[1])>23 || Number(match[2])>59) return NaN; return Number(match[1])*60+Number(match[2]); }
export function clock(minutes: number) { return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`; }
export function parseMark(value: string, kind: EventProject['kind']): number | null {
  const text=value.trim();
  if (!text) return null;
  if (kind !== 'track') { if (!/^\d+(?:\.\d+)?$/.test(text)) return null; const n=Number(text); return n>0 && Number.isFinite(n)?n:null; }
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text)>0?Number(text):null;
  const m=/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/.exec(text);
  if (!m || Number(m[3])>=60 || (m[1] && Number(m[2])>=60)) return null;
  const n=Number(m[1]??0)*3600+Number(m[2])*60+Number(m[3]); return n>0?n:null;
}
export function validateEntries(data: AthleticsData): string[] {
  const issues: string[]=[]; const seen=new Set<string>();
  for (const athlete of data.athletes) {
    if (!athlete.number.trim() || !athlete.name.trim() || !athlete.team.trim()) issues.push('运动员编号、姓名与队伍不能为空');
    if (seen.has(athlete.number.trim())) issues.push(`编号 ${athlete.number} 重复`); seen.add(athlete.number.trim());
    if (new Set(athlete.projects).size!==athlete.projects.length) issues.push(`${athlete.name} 重复报名同一项目`);
    if (athlete.projects.length>data.maxEntries) issues.push(`${athlete.name} 超过每人 ${data.maxEntries} 项限制`);
    for (const id of athlete.projects) { const project=data.projects.find(item=>item.id===id); if (!project) issues.push(`${athlete.name} 报名项目不存在`); else if (project.group && project.group!==athlete.group) issues.push(`${athlete.name} 的组别与 ${project.name} 不符`); }
  }
  for (const project of data.projects) {
    const entries=data.athletes.filter(item=>item.projects.includes(project.id));
    if (project.capacity>0 && entries.length>project.capacity) issues.push(`${project.name} 报名 ${entries.length} 人，超过项目限额 ${project.capacity}`);
    if (project.relay && new Set(entries.map(item=>item.team)).size!==entries.length) issues.push(`${project.name} 同一队重复报名接力。每队以一个队伍代表条目报名，队员构成须按规程核验`);
  }
  return [...new Set(issues)];
}
export function rankProject(data: AthleticsData, projectId: string, round: AthleticResult['round']='决赛'): RankedResult[] {
  const project=data.projects.find(item=>item.id===projectId); if (!project) return [];
  const results=data.results.filter(item=>item.projectId===projectId && item.round===round);
  const valid=results.flatMap(result=> { const athlete=data.athletes.find(item=>item.id===result.athleteId); const value=parseMark(result.value,project.kind); return athlete && athlete.projects.includes(project.id) && result.status==='有效' && value!==null ? [{result,athlete,value,rank:null as number|null,points:0,issue:undefined as string|undefined}] : []; });
  valid.sort((a,b)=>(project.kind==='track'?a.value-b.value:b.value-a.value) || Number(a.result.tieBreak||Infinity)-Number(b.result.tieBreak||Infinity));
  let index=0;
  while (index<valid.length) {
    let end=index+1; while (end<valid.length && valid[end].value===valid[index].value) end++;
    const tied=valid.slice(index,end); const manual=tied.length>1 && (project.kind==='height' || project.tieRule==='manual');
    const keys=tied.map(item=>Number(item.result.tieBreak));
    const resolved=manual && keys.every(key=>Number.isInteger(key)&&key>0) && new Set(keys).size===keys.length;
    for(let j=index;j<end;j++) {
      const row=valid[j];
      if (manual && !resolved) { row.issue='同成绩需裁判核定：填写不重复的同成绩顺位后计分'; continue; }
      row.rank=resolved?j+1:index+1;
      if (round==='决赛') {
        const base=!resolved && tied.length>1 && data.tiePoints==='average'
          ? Array.from({length:end-index},(_,k)=>data.points[index+k]??0).reduce((a,b)=>a+b,0)/tied.length
          : data.points[(row.rank??1)-1]??0;
        row.points=base*(project.relay?data.relayFactor:1);
      }
    }
    index=end;
  }
  return valid;
}
export function resultIssues(data: AthleticsData): string[] {
  const issues: string[]=[]; const seen=new Set<string>();
  for (const row of data.results) {
    const project=data.projects.find(item=>item.id===row.projectId); const athlete=data.athletes.find(item=>item.id===row.athleteId);
    const key=`${row.projectId}:${row.athleteId}:${row.round}`;
    if(seen.has(key)) issues.push('同项目、同运动员、同轮次有重复成绩'); seen.add(key);
    if (!project || !athlete || !athlete.projects.includes(row.projectId)) issues.push('存在未报名项目的成绩');
    if (row.status==='有效' && project && parseMark(row.value,project.kind)===null) issues.push(`${athlete?.name??'运动员'} 的成绩格式无效`);
  }
  for(const project of data.projects) issues.push(...rankProject(data,project.id).flatMap(row=>row.issue?[`${project.name}：${row.issue}`]:[]));
  return [...new Set(issues)];
}
export function teamStandings(data: AthleticsData) {
  const map=new Map<string,{team:string;points:number;golds:number;rank:number}>();
  for(const athlete of data.athletes) if(athlete.team.trim()) map.set(athlete.team,{team:athlete.team,points:0,golds:0,rank:0});
  // 拒绝将重复成绩计入团体总分。
  const duplicate=new Set<string>(); const seen=new Set<string>();
  for (const result of data.results) { const key=`${result.projectId}:${result.athleteId}:${result.round}`; if(seen.has(key)) duplicate.add(key); seen.add(key); }
  for(const project of data.projects) for(const row of rankProject(data,project.id)) {
    if(row.rank===null || duplicate.has(`${project.id}:${row.athlete.id}:决赛`)) continue;
    const entry=map.get(row.athlete.team)!; entry.points+=row.points; if(row.rank===1) entry.golds++;
  }
  const rows=[...map.values()].sort((a,b)=>b.points-a.points || (data.teamTie==='gold'?b.golds-a.golds:0) || a.team.localeCompare(b.team,'zh-CN'));
  rows.forEach((row,i)=>{const prev=rows[i-1]; row.rank=prev && prev.points===row.points && (data.teamTie==='shared'||prev.golds===row.golds)?prev.rank:i+1;});return rows;
}
export function scheduleFingerprint(data: AthleticsData) { return JSON.stringify([data.projects,data.athletes,data.restMinutes]); }
function overlaps(a: number,ad: number,b: number,bd: number,gap=0) {return a < b+bd+gap && b < a+ad+gap;}
function officialsOverlap(a:string,b:string) { const keys=a.split(/[,，、]/).map(v=>v.trim()).filter(Boolean); return keys.some(key=>b.split(/[,，、]/).map(v=>v.trim()).includes(key)); }
export function scheduleConflicts(data: AthleticsData, races: Race[]=data.races) {
  const issues: string[]=[];
  for(let i=0;i<races.length;i++) {
    const a=races[i], at=timeMinutes(a.start);
    if(!Number.isFinite(at)||a.duration<=0||!a.venue.trim()||!a.officials.trim()) issues.push(`第 ${i+1} 组缺少有效时间、时长、场地或裁判`);
    const project=data.projects.find(item=>item.id===a.projectId);
    if(!project) issues.push(`第 ${i+1} 组的项目不存在`);
    if(project && a.athletes.length>project.lanes) issues.push(`第 ${i+1} 组超过道数或出场容量`);
    if(a.athletes.some(id=>!data.athletes.find(item=>item.id===id)?.projects.includes(a.projectId))) issues.push(`第 ${i+1} 组有未报名运动员`);
    for(let j=0;j<i;j++) {
      const b=races[j],bt=timeMinutes(b.start);
      if(overlaps(at,a.duration,bt,b.duration) && (a.venue===b.venue || officialsOverlap(a.officials,b.officials))) issues.push(`第 ${j+1} / ${i+1} 组场地或裁判资源冲突`);
      if(a.athletes.some(id=>b.athletes.includes(id)) && overlaps(at,a.duration,bt,b.duration,data.restMinutes)) issues.push(`第 ${j+1} / ${i+1} 组运动员兼项间隔不足 ${data.restMinutes} 分钟`);
    }
  }
  return [...new Set(issues)];
}
export function generateSchedule(data: AthleticsData): { races: Race[]; issues: string[] } {
  const issues=validateEntries(data); if(issues.length) return {races:[],issues};
  const races: Race[]=[];
  const add=(project:EventProject,athletes:Athlete[],round:Race['round'])=> {
    const lanes=Math.max(1,Math.floor(project.lanes));
    for(let i=0;i<athletes.length;i+=lanes) {
      let start=timeMinutes(project.start||'09:00'); if(!Number.isFinite(start)) {issues.push(`${project.name} 开始时间无效`);continue;}
      const entries=athletes.slice(i,i+lanes).map(item=>item.id);
      for(let attempts=0;attempts<1440;attempts++) {
        const clash=races.some(race=>overlaps(start,project.duration,timeMinutes(race.start),race.duration) && (race.venue===project.venue || officialsOverlap(race.officials,project.officials)) || entries.some(id=>race.athletes.includes(id)) && overlaps(start,project.duration,timeMinutes(race.start),race.duration,data.restMinutes));
        if(!clash)break;start++;
      }
      if(start+project.duration>24*60) {issues.push(`${project.name} 超过当日可编排范围，需手动分日`);continue;}
      races.push({id:uid(),projectId:project.id,round,heat:Math.floor(i/lanes)+1,start:clock(start),duration:project.duration,venue:project.venue,officials:project.officials,athletes:entries});
    }
  };
  for(const project of data.projects) {
    if(project.duration<=0 || project.lanes<1 || !project.venue.trim() || !project.officials.trim()) {issues.push(`${project.name} 请设置有效时长、场地、道数与裁判资源`);continue;}
    const entrants=data.athletes.filter(item=>item.status!=='退赛'&&item.projects.includes(project.id));
    if(project.rounds==='heats-final' && entrants.length>project.lanes) {
      add(project,entrants,'预赛');
      const marks=data.results.filter(item=>item.projectId===project.id&&item.round==='预赛');
      if(entrants.every(item=>marks.some(row=>row.athleteId===item.id&&(row.status!=='有效'||parseMark(row.value,project.kind)!==null)))) {
        const ranked=rankProject(data,project.id,'预赛'); const finalists=ranked.filter(row=>row.rank!==null && row.rank<=project.lanes);
        if(finalists.length>project.lanes) issues.push(`${project.name} 晋级边界并列，决赛名单需人工核定`);
        else add(project,finalists.map(row=>row.athlete),'决赛');
      } else issues.push(`${project.name} 决赛待预赛成绩完整录入后重新编排，晋级名单须人工核查`);
    } else add(project,entrants,'决赛');
  }
  return {races,issues:[...issues,...scheduleConflicts(data,races),'自动编排未涵盖所有正式规程与现场限制，请人工核查赛程、轮次和接力队员构成。']};
}
