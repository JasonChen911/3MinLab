import { useState } from 'react';
import Grid from './Grid';
import { clock, generateSchedule, rankProject, resultIssues, scheduleConflicts, scheduleFingerprint, teamStandings, validateEntries } from './athletics';
import { uid, type AthleticsData, type AthleticResult, type DataRow, type EventProject, type Field } from './model';
const projectFields:Field[]=[{key:'name',label:'项目名称'},{key:'group',label:'组别'},{key:'kind',label:'成绩方向',options:['track','field','height']},{key:'relay',label:'接力',options:['否','是']},{key:'lanes',label:'道数/每组容量',type:'number'},{key:'duration',label:'每组分钟',type:'number'},{key:'capacity',label:'报名限额(0不限)',type:'number'},{key:'rounds',label:'轮次',options:['final','heats-final']},{key:'venue',label:'场地资源'},{key:'officials',label:'裁判资源'},{key:'start',label:'最早开始',type:'time'},{key:'tieRule',label:'同成绩',options:['shared','manual']}];
const athleteFields:Field[]=[{key:'number',label:'运动员编号'},{key:'name',label:'姓名'},{key:'team',label:'队伍'},{key:'group',label:'组别'},{key:'projects',label:'参赛项目（逗号分隔）'},{key:'seed',label:'报名成绩'}];
export default function AthleticsPanel({data,onChange,toolId}:{data:AthleticsData;onChange:(data:AthleticsData)=>void;toolId:string}) {
  const initial=toolId==='ath-entry'?'entry':toolId==='ath-schedule'||toolId==='ath-checkin'?'schedule':toolId==='ath-team'||toolId==='ath-awards'?'standings':'results';
  const [tab,setTab]=useState(initial); const [message,setMessage]=useState(''); const [projectId,setProjectId]=useState(data.projects[0]?.id??'');const [round,setRound]=useState<AthleticResult['round']>('决赛');
  const project=data.projects.find(item=>item.id===projectId)??data.projects[0];
  const entryIssues=validateEntries(data), issues=resultIssues(data); const conflicts=scheduleConflicts(data);
  const names=(ids:string[])=>ids.map(id=>data.athletes.find(item=>item.id===id)?.number??id).join(',');
  function changeProjectRows(rows:DataRow[]) {onChange({...data,projects:rows.map(row=>({id:row.id,name:row.name||'未命名项目',group:row.group??'',kind:(row.kind||'track') as EventProject['kind'],relay:row.relay==='是',lanes:Math.max(1,Math.floor(Number(row.lanes)||1)),duration:Math.max(1,Number(row.duration)||10),capacity:Math.max(0,Number(row.capacity)||0),rounds:(row.rounds||'final') as EventProject['rounds'],venue:row.venue??'',officials:row.officials??'',start:row.start||'09:00',tieRule:(row.tieRule||'shared') as EventProject['tieRule']}))});}
  function changeAthletes(rows:DataRow[]) {
    const unknown:string[]=[];
    const athletes=rows.map(row=>({...row,number:row.number??'',name:row.name??'',team:row.team??'',group:row.group??'',seed:row.seed??'',projects:(row.projects??'').split(/[,，、]/).map(v=>v.trim()).filter(Boolean).map(name=>{const p=data.projects.find(item=>item.name===name||item.id===name);if(!p)unknown.push(name);return p?.id??name;})}));
    setMessage(unknown.length?`待核对的项目：${unknown.join('、')}`:'');onChange({...data,athletes});
  }
  function generate() {const result=generateSchedule(data);if(data.races.length&&!window.confirm('重新编排会替换现有手动赛程，是否继续？'))return;onChange({...data,races:result.races,scheduleSource:scheduleFingerprint(data)});setMessage(result.issues.join('；'));}
  function seedResults() {
    if(!project)return;
    const additions=data.athletes.filter(item=>item.projects.includes(project.id)&&!data.results.some(row=>row.projectId===project.id&&row.athleteId===item.id&&row.round===round)).map(item=>({id:uid(),projectId:project.id,athleteId:item.id,round,value:'',status:'无成绩' as const,tieBreak:'',note:''}));
    onChange({...data,results:[...data.results,...additions]});
  }
  const selectedResults=data.results.filter(row=>row.projectId===project?.id&&row.round===round);
  return <div className="wb-special">
    <p className="wb-help">先配置项目，再报名、编排、录入成绩。track＝用时越短越好（秒或 分:秒）；field＝距离越大越好；height＝跳高，同成绩须裁判核定。接力按队伍代表条目报名，队员构成另行核验。</p>
    <div className="wb-tabs">{[['projects','项目与规则'],['entry','运动员报名'],['schedule','赛程与检录'],['results','成绩与排名'],['standings','团体与获奖']].map(([id,name])=><button type="button" key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{name}</button>)}</div>
    {message&&<p className="wb-notice" role="status">{message}</p>}
    {tab==='projects'&&<>
      <Grid name="比赛项目" fields={projectFields} rows={data.projects.map(p=>({...Object.fromEntries(Object.entries(p).map(([k,v])=>[k,String(v)])),id:p.id,relay:p.relay?'是':'否'}))} onChange={changeProjectRows}/>
      <div className="wb-form-grid">
        <label>每人最多兼项<input type="number" min="1" value={data.maxEntries} onChange={e=>onChange({...data,maxEntries:Math.max(1,Number(e.target.value))})}/></label>
        <label>运动员最少间隔（分钟）<input type="number" min="0" value={data.restMinutes} onChange={e=>onChange({...data,restMinutes:Math.max(0,Number(e.target.value))})}/></label>
        <label>名次积分（逗号分隔）<input value={data.points.join(',')} onChange={e=>{const values=e.target.value.split(/[,，]/).map(Number);if(values.every(v=>Number.isFinite(v)&&v>=0))onChange({...data,points:values});}}/></label>
        <label>接力积分系数<input type="number" min="0" step="0.5" value={data.relayFactor} onChange={e=>onChange({...data,relayFactor:Math.max(0,Number(e.target.value))})}/></label>
        <label>并列积分<select value={data.tiePoints} onChange={e=>onChange({...data,tiePoints:e.target.value as AthleticsData['tiePoints']})}><option value="average">所占名次分数平均</option><option value="place">按并列名次积分</option></select></label>
        <label>团体同分<select value={data.teamTie} onChange={e=>onChange({...data,teamTie:e.target.value as AthleticsData['teamTie']})}><option value="shared">并列</option><option value="gold">金牌数优先，再并列</option></select></label>
        <label>录取前几名<input type="number" min="1" value={data.awardPlaces} onChange={e=>onChange({...data,awardPlaces:Math.max(1,Number(e.target.value))})}/></label>
      </div>
    </>}
    {tab==='entry'&&<><p className="wb-help">同一项目不同组别请建立独立项目，并使用不同项目名称。导入表头须与列名一致。</p><Grid name="运动员报名" fields={athleteFields} rows={data.athletes.map(item=>({...item,projects:item.projects.map(id=>data.projects.find(p=>p.id===id)?.name??id).join(',')}))} onChange={changeAthletes} importable/>{entryIssues.length>0&&<ul className="wb-errors">{entryIssues.map(issue=><li key={issue}>{issue}</li>)}</ul>}</>}
    {tab==='schedule'&&<>
      <button className="primary" type="button" onClick={generate}>生成 / 更新赛程</button>
      {!!data.races.length&&data.scheduleSource!==scheduleFingerprint(data)&&<p className="wb-notice">报名或项目规则已变化，赛程待重新编排；现有手动调整尚未覆盖。</p>}
      <p className="wb-help">同场地或同裁判不并行；兼项按最少间隔避让。预赛完整后再更新决赛。自动编排须人工核查，场地数量通过不同资源名称配置。</p>
      <Grid name="赛程" fields={[{key:'project',label:'项目'},{key:'round',label:'轮次',options:['预赛','决赛']},{key:'heat',label:'组次',type:'number'},{key:'start',label:'开始',type:'time'},{key:'duration',label:'分钟',type:'number'},{key:'venue',label:'场地'},{key:'officials',label:'裁判（逗号分隔）'},{key:'athletes',label:'道次顺序（编号逗号分隔）'}]} rows={data.races.map(race=>({...race,project:data.projects.find(p=>p.id===race.projectId)?.name??'',heat:String(race.heat),duration:String(race.duration),athletes:names(race.athletes)}))} onChange={rows=>onChange({...data,races:rows.map(row=>({id:row.id,projectId:data.projects.find(p=>p.name===row.project)?.id??'',round:row.round==='预赛'?'预赛':'决赛',heat:Math.max(1,Number(row.heat)||1),start:row.start??'',duration:Math.max(1,Number(row.duration)||10),venue:row.venue??'',officials:row.officials??'',athletes:(row.athletes??'').split(/[,，]/).map(v=>v.trim()).filter(Boolean).map(number=>data.athletes.find(a=>a.number===number)?.id??number)}))})}/>
      {conflicts.length>0&&<ul className="wb-errors">{conflicts.map(issue=><li key={issue}>{issue}</li>)}</ul>}
      <h4>检录单（成绩另在成绩页录入）</h4><div className="table-wrap"><table className="block-table"><thead><tr>{['项目','轮次/组','时间','道次','编号','姓名','队伍','检录/备注'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{data.races.flatMap(race=>race.athletes.map((id,i)=>{const athlete=data.athletes.find(a=>a.id===id);return <tr key={race.id+id}><td>{data.projects.find(p=>p.id===race.projectId)?.name}</td><td>{race.round} / {race.heat}</td><td>{race.start}–{clock((Number(race.start.split(':')[0])*60+Number(race.start.split(':')[1]))+race.duration)}</td><td>{i+1}</td><td>{athlete?.number}</td><td>{athlete?.name}</td><td>{athlete?.team}</td><td>待检录</td></tr>;}))}</tbody></table></div>
    </>}
    {tab==='results'&&<>
      <div className="wb-grid-actions"><select aria-label="成绩项目" value={project?.id??''} onChange={e=>setProjectId(e.target.value)}>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name} · {p.group}</option>)}</select><select aria-label="成绩轮次" value={round} onChange={e=>setRound(e.target.value as AthleticResult['round'])}><option>预赛</option><option>决赛</option></select><button type="button" onClick={seedResults}>从报名名单创建空白成绩行</button></div>
      <Grid name="成绩" fields={[{key:'athleteId',label:'运动员',options:data.athletes.filter(a=>a.projects.includes(project?.id??'')).map(a=>a.number+' '+a.name)},{key:'value',label:project?.kind==='track'?'用时（秒/分:秒）':'距离/高度（米）'},{key:'status',label:'成绩状态',options:['有效','未出赛','弃权','犯规','无成绩']},{key:'tieBreak',label:'裁判核定同成绩顺位',type:'number'},{key:'note',label:'备注'}]} rows={selectedResults.map(row=>({...row,athleteId:data.athletes.find(a=>a.id===row.athleteId)?.number+' '+data.athletes.find(a=>a.id===row.athleteId)?.name}))} onChange={rows=>onChange({...data,results:[...data.results.filter(row=>!selectedResults.some(item=>item.id===row.id)),...rows.map(row=>({id:row.id,projectId:project?.id??'',athleteId:data.athletes.find(a=>a.number+' '+a.name===row.athleteId)?.id??'',round,value:row.value??'',status:(row.status||'无成绩') as AthleticResult['status'],tieBreak:row.tieBreak??'',note:row.note??''}))]})}/>
      {issues.length>0&&<ul className="wb-errors">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
      <h4>当前项目排名（只计有效成绩）</h4><div className="table-wrap"><table className="block-table"><thead><tr>{['名次','编号','姓名','队伍','成绩','积分','提示'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{rankProject(data,project?.id??'',round).map(row=><tr key={row.result.id}><td>{row.rank??'待裁判核定'}</td><td>{row.athlete.number}</td><td>{row.athlete.name}</td><td>{row.athlete.team}</td><td>{row.result.value}</td><td>{row.points}</td><td>{row.issue}</td></tr>)}</tbody></table></div>
    </>}
    {tab==='standings'&&<><p className="wb-help">仅决赛有效成绩计入；零分不代表已完成比赛。并列与接力积分按项目规则计算，同成绩未核定时不计分。</p><div className="table-wrap"><table className="block-table"><thead><tr><th>团体名次</th><th>队伍</th><th>总分</th><th>第一名次数</th></tr></thead><tbody>{teamStandings(data).map(row=><tr key={row.team}><td>{row.rank}</td><td>{row.team}</td><td>{row.points}</td><td>{row.golds}</td></tr>)}</tbody></table></div><h4>单项获奖名单</h4><div className="table-wrap"><table className="block-table"><thead><tr>{['项目','组别','名次','姓名','队伍','成绩','积分'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{data.projects.flatMap(p=>rankProject(data,p.id).filter(row=>row.rank!==null&&row.rank<=data.awardPlaces).map(row=><tr key={row.result.id}><td>{p.name}</td><td>{p.group}</td><td>{row.rank}</td><td>{row.athlete.name}</td><td>{row.athlete.team}</td><td>{row.result.value}</td><td>{row.points}</td></tr>))}</tbody></table></div></>}
  </div>;
}
