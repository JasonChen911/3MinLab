import type { DataRow } from './model';
export interface Match { id:string; home:string; away:string; round:number; group:string; scoreHome:string; scoreAway:string; status:string; winner:string; referee:string; start:string; venue:string }
export interface SportsRules { format:'round-robin'|'groups'|'knockout'; sport:'football'|'basketball'|'badminton'|'table-tennis'; win:number; draw:number; loss:number; groups:number; teamTie:'shared'|'difference' }
export const DEFAULT_SPORTS_RULES:SportsRules={format:'round-robin',sport:'football',win:3,draw:1,loss:0,groups:2,teamTie:'difference'};
export function roundRobin(teams:string[],prefix='R',group=''):Match[] {
  const wheel=[...teams]; if(wheel.length%2)wheel.push('');const matches:Match[]=[];
  for(let round=0;round<wheel.length-1;round++) {for(let i=0;i<wheel.length/2;i++){const home=wheel[i],away=wheel[wheel.length-1-i];if(home&&away)matches.push({id:`${prefix}-${round}-${i}`,home,away,round:round+1,group,scoreHome:'',scoreAway:'',status:'待赛',winner:'',referee:'',start:'',venue:''});}wheel.splice(1,0,wheel.pop()!);}return matches;
}
export function matchWinner(match:Match,rules:SportsRules):string {
  if(match.home&&!match.away)return match.home;
  if(match.status!=='完赛')return '';
  const a=Number(match.scoreHome),b=Number(match.scoreAway);
  if(!match.scoreHome.trim()||!match.scoreAway.trim()||!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)return '';
  if(a!==b)return a>b?match.home:match.away;
  return rules.format==='knockout'&&[match.home,match.away].includes(match.winner)?match.winner:'';
}
export function fixtures(teams:string[],rules:SportsRules,recorded:Match[]=[]):Match[] {
  const byId=new Map(recorded.map(match=>[match.id,match]));
  const merge=(match:Match)=> {const old=byId.get(match.id);return old&&old.home===match.home&&old.away===match.away?{...match,...old}:match;};
  if(rules.format==='round-robin')return roundRobin(teams).map(merge);
  if(rules.format==='groups') {return Array.from({length:Math.max(1,rules.groups)},(_,index)=>roundRobin(teams.filter((_,i)=>i%rules.groups===index),`G${index+1}`,`第${index+1}组`)).flat().map(merge);}
  if(teams.length<2)return [];
  const size=2**Math.ceil(Math.log2(teams.length));const padded=[...teams,...Array<string>(size-teams.length).fill('')];let slots:string[]=[];
  // 将空位分散到首轮，不将两个空位配成一场。
  for(let i=0;i<size/2;i++)slots.push(padded[i],padded[size-1-i]);
  const all:Match[]=[]; let round=1;
  while(slots.length>1){const next:string[]=[];for(let i=0;i<slots.length;i+=2){const m=merge({id:`K-${round}-${i/2}`,home:slots[i]??'',away:slots[i+1]??'',round,group:'淘汰赛',scoreHome:'',scoreAway:'',status:'待赛',winner:'',referee:'',start:'',venue:''});all.push(m);next.push(matchWinner(m,rules));}if(next.some(v=>!v))break;slots=next;round++;}return all;
}
export function sportsIssues(matches:Match[],rules:SportsRules) {return matches.flatMap(m=>{
  if(m.status!=='完赛')return [];
  if(!m.scoreHome.trim()||!m.scoreAway.trim()||![Number(m.scoreHome),Number(m.scoreAway)].every(v=>Number.isInteger(v)&&v>=0))return [`${m.home} / ${m.away} 比分无效`];
  if(m.scoreHome===m.scoreAway && (rules.sport!=='football'||rules.format==='knockout')&&!matchWinner(m,rules))return [`${m.home} / ${m.away} 平分需录入加时/决胜结果`];return [];
});}
export function sportsStandings(teams:string[],matches:Match[],rules:SportsRules) {
  const rows=teams.map(team=>({team,played:0,won:0,drawn:0,lost:0,for:0,against:0,points:0,rank:0}));
  for(const match of matches) {
    if(match.status!=='完赛'||sportsIssues([match],rules).length)continue;
    const home=rows.find(r=>r.team===match.home),away=rows.find(r=>r.team===match.away);if(!home||!away)continue;
    const a=Number(match.scoreHome),b=Number(match.scoreAway);home.played++;away.played++;home.for+=a;home.against+=b;away.for+=b;away.against+=a;
    if(a===b){home.drawn++;away.drawn++;home.points+=rules.draw;away.points+=rules.draw;}
    else {const winner=a>b?home:away,loser=a>b?away:home;winner.won++;loser.lost++;winner.points+=rules.win;loser.points+=rules.loss;}
  }
  rows.sort((a,b)=>b.points-a.points||(rules.teamTie==='difference'?(b.for-b.against)-(a.for-a.against)||b.for-a.for:0));
  rows.forEach((row,i)=>{const prev=rows[i-1];row.rank=prev&&prev.points===row.points&&(rules.teamTie==='shared'||prev.for-prev.against===row.for-row.against&&prev.for===row.for)?prev.rank:i+1;});return rows;
}
export function orderedAgenda(rows:DataRow[],start='09:00',performance=false) {
  const [h,m]=start.split(':').map(Number);let cursor=h*60+m;
  return rows.filter(row=>!performance||row.f4==='通过').map(row=>{const minutes=Number(row[performance?'f3':'f4']);const duration=Number.isFinite(minutes)&&minutes>0?minutes:0;const from=cursor;cursor+=duration;const label=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;return {row,start:label(from),end:label(cursor),duration};});
}
export function moveRow<T>(rows:T[],index:number,direction:-1|1) {const next=[...rows];const to=index+direction;if(index<0||to<0||to>=next.length)return next;[next[index],next[to]]=[next[to],next[index]];return next;}
export interface Criterion {id:string;name:string;weight:number;max:number}
export interface JudgeScore {id:string;project:string;judge:string;criterion:string;value:string;absent:boolean}
export function judgeRanking(projects:string[],criteria:Criterion[],scores:JudgeScore[],expectedJudges:number,absence:'zero'|'exclude',ties:'shared'|'first') {
  const weight=criteria.reduce((sum,c)=>sum+c.weight,0);
  if(!criteria.length||weight<=0||criteria.some(c=>c.max<=0||c.weight<0))return [];
  const rows=projects.map(project=>{const entries=scores.filter(s=>s.project===project);const judges=[...new Set(entries.map(s=>s.judge).filter(Boolean))];let total=0,count=0;let pending=false;
    for(const judge of judges){const marks=entries.filter(s=>s.judge===judge);const absent=marks.some(s=>s.absent);if(absent){if(absence==='zero')count++;continue;}
      let score=0;for(const criterion of criteria){const matching=marks.filter(s=>s.criterion===criterion.id);const value=Number(matching[0]?.value);if(matching.length!==1||!matching[0].value.trim()||!Number.isFinite(value)||value<0||value>criterion.max){pending=true;continue;}score+=value/criterion.max*criterion.weight/weight*100;}
      total+=score;count++;
    }
    if(judges.length<expectedJudges)pending=true;
    return {project,score:count?total/count:0,pending:pending||!count,rank:0};
  });rows.sort((a,b)=>Number(a.pending)-Number(b.pending)||b.score-a.score||(ties==='first'?a.project.localeCompare(b.project,'zh-CN'):0));
  rows.forEach((row,i)=>{if(row.pending)return;const prev=rows[i-1];row.rank=prev&&prev.score===row.score&&ties==='shared'?prev.rank:i+1;});return rows;
}
