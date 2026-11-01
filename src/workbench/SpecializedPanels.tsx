import Grid from './Grid';
import { moveRow, orderedAgenda, DEFAULT_SPORTS_RULES, fixtures, sportsIssues, sportsStandings, type Match } from './calculations';
import { scoringData, sportsData, tableRows, updateTable } from './documents';
import { uid, type Workspace } from './model';
export function PerformancePanel({workspace,onChange,source}:{workspace:Workspace;onChange:(data:Workspace)=>void;source:string}) {
  const table=workspace.tables[source];const rows=table?.rows??[];const start=tableRows(workspace,source+'-settings')[0]?.start??'09:00';
  const performance=source==='performances';const agenda=orderedAgenda(rows,start,performance);
  return <div><p className="wb-help">{performance?'仅“审核状态”为“通过”的节目进入正式节目单。':'按报告顺序及填写时长生成议程。'}调整顺序后，表格文档自动同步，手工编辑及 AI 文本提示重新生成。</p>
    <label>开场时间 <input type="time" value={start} onChange={e=>onChange(updateTable(workspace,source+'-settings',[{id:'start',start:e.target.value}]))}/></label>
    <div className="wb-agenda-list">{rows.map((row,index)=><div className="wb-agenda-row" key={row.id}><span className="wb-order">{index+1}</span><div><strong>{row.f0||'未填写名称'}</strong><small>{row.f1||'人员待填'} · {row[performance?'f3':'f4']||0} 分钟{performance?` · ${row.f4||'待审核'}`:''}</small></div><button type="button" disabled={index===0} onClick={()=>onChange(updateTable(workspace,source,moveRow(rows,index,-1)))}>上移</button><button type="button" disabled={index===rows.length-1} onClick={()=>onChange(updateTable(workspace,source,moveRow(rows,index,1)))}>下移</button></div>)}</div>
    <p className="wb-notice">{agenda.length} 个{performance?'已审核节目':'报告'} · 总时长 {agenda.reduce((sum,item)=>sum+item.duration,0)} 分钟 · {agenda.at(-1)?.end??start} 结束</p>
    {agenda.some(item=>item.duration<=0)&&<p className="wb-errors">存在未填写有效时长的项目，时间表需核查。</p>}
    <Grid name={performance?'节目':'报告'} fields={table?.fields??[]} rows={rows} onChange={next=>onChange(updateTable(workspace,source,next))} importable/>
  </div>;
}
export function SportsPanel({workspace,onChange}:{workspace:Workspace;onChange:(data:Workspace)=>void}) {
  const {teams,rules,matches}=sportsData(workspace);const teamRows=tableRows(workspace,'sports-team-data');const issues=sportsIssues(matches,rules);
  const settings=(patch:Partial<typeof rules>)=>onChange(updateTable(workspace,'sports-settings',[{id:'rules',json:JSON.stringify({...rules,...patch})}]));
  function saveMatches(records:Match[]) {onChange(updateTable(workspace,'sports-match-data',records as unknown as Parameters<typeof updateTable>[2]));}
  const standings=sportsStandings(teams,matches,rules);
  return <div><p className="wb-help">队伍顺序决定初始签位，可抽签打乱。球队名单或赛制变化后对阵自动重算；参与队伍变化的场次不沿用旧比分。淘汰赛获胜后显示下一轮。</p>
    <Grid name="参赛队伍" fields={[{key:'name',label:'队伍名称'},{key:'owner',label:'领队'}]} rows={teamRows} onChange={rows=>onChange(updateTable(workspace,'sports-team-data',rows))} importable/>
    {teams.length!==new Set(teams).size&&<p className="wb-errors">队伍名称重复，请修改后再使用积分榜。</p>}
    <div className="wb-form-grid">
      <label>运动项目<select value={rules.sport} onChange={e=>settings({sport:e.target.value as typeof rules.sport})}><option value="football">足球</option><option value="basketball">篮球</option><option value="badminton">羽毛球（局数）</option><option value="table-tennis">乒乓球（局数）</option></select></label>
      <label>赛制<select value={rules.format} onChange={e=>settings({format:e.target.value as typeof rules.format})}><option value="round-robin">单循环</option><option value="groups">分组循环</option><option value="knockout">单淘汰</option></select></label>
      {rules.format==='groups'&&<label>分组数量<input type="number" min="1" value={rules.groups} onChange={e=>settings({groups:Math.max(1,Math.floor(Number(e.target.value)))})}/></label>}
      {(['win','draw','loss'] as const).map((key,i)=><label key={key}>{['胜','平','负'][i]}积分<input type="number" value={rules[key]} onChange={e=>settings({[key]:Number(e.target.value)})}/></label>)}
      <label>积分相同<select value={rules.teamTie} onChange={e=>settings({teamTie:e.target.value as typeof rules.teamTie})}><option value="difference">净胜分→得分→并列</option><option value="shared">直接并列</option></select></label>
    </div>
    <button type="button" onClick={()=>{const next=[...teamRows];for(let i=next.length-1;i>0;i--){const random=new Uint32Array(1);crypto.getRandomValues(random);const j=random[0]%(i+1);[next[i],next[j]]=[next[j],next[i]];}if(window.confirm('重新抽签会改变对阵，变动场次的旧比分不会沿用。继续？'))onChange(updateTable(workspace,'sports-team-data',next));}}>随机抽签</button>
    <h4>对阵、裁判与结果</h4><Grid name="比赛结果" fields={[{key:'round',label:'轮次'},{key:'group',label:'分组'},{key:'home',label:'主队'},{key:'away',label:'客队'},{key:'scoreHome',label:'主队比分',type:'number'},{key:'scoreAway',label:'客队比分',type:'number'},{key:'status',label:'状态',options:['待赛','完赛']},{key:'winner',label:'平分决胜队'},{key:'referee',label:'裁判'},{key:'start',label:'比赛时间'},{key:'venue',label:'场地'}]} rows={matches.map(m=>({...m,round:String(m.round)}))} onChange={rows=>saveMatches(rows.map(row=>({...row,round:Number(row.round)})) as unknown as Match[])}/>
    <p className="wb-help">队名、轮次、分组由赛制产生，调整签位请修改队伍顺序或重新抽签。足球循环赛允许平局；其他项目平局须录入决胜比分。球类积分与田径积分完全独立。</p>
    {issues.length>0&&<ul className="wb-errors">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
    <div className="table-wrap"><table className="block-table"><thead><tr>{['名次','队伍','场次','胜','平','负','得分','失分','积分'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{standings.map(row=><tr key={row.team}>{[row.rank,row.team,row.played,row.won,row.drawn,row.lost,row.for,row.against,row.points].map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody></table></div>
    {rules.format==='knockout'&&<p className="wb-notice">晋级路径：{fixtures(teams,{...DEFAULT_SPORTS_RULES,...rules},matches).map(m=>`第${m.round}轮 ${m.home||'待定'} vs ${m.away||'轮空'}`).join(' → ')}</p>}
  </div>;
}
export function ScoringPanel({workspace,onChange}:{workspace:Workspace;onChange:(data:Workspace)=>void}) {
  const {criteria,rankings}=scoringData(workspace);const settings=tableRows(workspace,'judge-settings')[0]??{id:'settings',judges:'1',absence:'exclude',ties:'shared'};
  const criterionRows=tableRows(workspace,'judge-criteria');const scores=tableRows(workspace,'judge-scores');
  const projects=tableRows(workspace,'contest-projects').map(r=>r.f0).filter(Boolean);
  return <div><p className="wb-help">先在“参赛报名与作品资料”填写项目。分数按各项满分与权重归一到 100 分，再对评委求平均。缺少有效评分不排名。</p>
    <Grid name="评审标准" fields={[{key:'name',label:'指标'},{key:'weight',label:'权重',type:'number'},{key:'max',label:'满分',type:'number'}]} rows={criterionRows} onChange={rows=>onChange(updateTable(workspace,'judge-criteria',rows))}/>
    <div className="wb-form-grid"><label>应到评委数<input type="number" min="1" value={settings.judges} onChange={e=>onChange(updateTable(workspace,'judge-settings',[{...settings,judges:e.target.value}]))}/></label><label>缺席处理<select value={settings.absence} onChange={e=>onChange(updateTable(workspace,'judge-settings',[{...settings,absence:e.target.value}]))}><option value="exclude">不参与平均</option><option value="zero">计零分</option></select></label><label>同分规则<select value={settings.ties} onChange={e=>onChange(updateTable(workspace,'judge-settings',[{...settings,ties:e.target.value}]))}><option value="shared">并列</option><option value="first">项目名称顺序（须写入规程）</option></select></label></div>
    {criteria.some(c=>c.max<=0||c.weight<0)&&<p className="wb-errors">满分须大于零，权重不能为负数。</p>}
    <Grid name="评委评分" fields={[{key:'project',label:'项目',options:projects},{key:'judge',label:'评委'},{key:'criterion',label:'指标',options:criteria.map(c=>c.name)},{key:'value',label:'分数',type:'number'},{key:'absent',label:'缺席',options:['否','是']}]} rows={scores.map(row=>({...row,criterion:criteria.find(c=>c.id===row.criterion)?.name??row.criterion}))} onChange={rows=>onChange(updateTable(workspace,'judge-scores',rows.map(row=>({...row,criterion:criteria.find(c=>c.name===row.criterion)?.id??row.criterion}))))}/>
    <h4>评分汇总</h4><div className="table-wrap"><table className="block-table"><thead><tr><th>名次</th><th>项目</th><th>分数</th><th>状态</th></tr></thead><tbody>{rankings.map(row=><tr key={row.project}><td>{row.rank||'—'}</td><td>{row.project}</td><td>{row.score.toFixed(2)}</td><td>{row.pending?'缺分/无效，待核验':'已计算'}</td></tr>)}</tbody></table></div>
  </div>;
}
export const newPersonRow=()=>({id:uid(),name:'',roles:'参与者'});
