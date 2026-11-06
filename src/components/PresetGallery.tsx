import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Search, Sparkles, GraduationCap, Trophy, HeartHandshake, BriefcaseBusiness, Music, Users, Lightbulb, Presentation, PartyPopper } from 'lucide-react';
import { GROUPS, getCategory } from '../data/taxonomy';
import { PRESETS } from '../data/presets';
import { PRESET_IMAGES, FALLBACK_PRESET_IMAGE } from '../data/presetImages';
import type { GroupId } from '../types';

const groupIcons = { 'campus-education': GraduationCap, sports: Trophy, charity: HeartHandshake, business: BriefcaseBusiness, culture: Music, community: Users, tech: Lightbulb, conference: Presentation, festival: PartyPopper, custom: Sparkles };
type Props = { onPreset:(presetId:string)=>void; onCategory:(categoryId:string)=>void; onCustom:()=>void };

export function searchPresets(query:string,scale:'all'|'large'|'small',group:GroupId|'all'='all') {
  const terms=query.trim().toLocaleLowerCase('zh-CN').split(/\s+/).filter(Boolean);
  return PRESETS.filter(preset=>{
    const size=preset.scaleType??'large';
    if(scale!=='all'&&size!==scale)return false;
    if(group!=='all'&&preset.group!==group)return false;
    const text=[preset.name,preset.tagline,preset.intro,preset.group,getCategory(preset.categoryId).label,...(preset.keywords??[])].join(' ').toLocaleLowerCase('zh-CN');
    return terms.every(term=>text.includes(term));
  });
}

export default function PresetGallery({onPreset,onCategory,onCustom}:Props){
  const [query,setQuery]=useState(''),[scale,setScale]=useState<'all'|'large'|'small'>('all'),[group,setGroup]=useState<GroupId|'all'>('all'),[expanded,setExpanded]=useState<string|null>(null),[limit,setLimit]=useState(12);
  const filtered=useMemo(()=>searchPresets(query,scale,group),[query,scale,group]);
  const show=filtered.slice(0,limit),activeGroup=GROUPS.find(item=>item.id===group);
  const update=()=>{setLimit(12);setExpanded(null);};
  return <section className="preset-section" id="presets">
    <header className="preset-head"><div><span className="mini-label">START FROM A SCENARIO</span><h2>找一个适合你的活动起点</h2><p>筛选后选择模板；流程、人员与预算都可以修改。</p></div><button className="preset-custom" type="button" onClick={onCustom}><Sparkles size={16}/> 自定义活动 <ArrowRight size={16}/></button></header>
    <div className="preset-filters"><label><Search size={17}/><input type="search" value={query} onChange={e=>{setQuery(e.target.value);update();}} placeholder="搜索活动、场景或关键词" aria-label="搜索活动模板"/></label><select aria-label="活动规模" value={scale} onChange={e=>{setScale(e.target.value as typeof scale);update();}}><option value="all">全部活动</option><option value="large">大型活动</option><option value="small">小型活动</option></select><select aria-label="活动类型" value={group} onChange={e=>{setGroup(e.target.value as typeof group);update();}}><option value="all">全部类型</option>{GROUPS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
    <div className="preset-body"><p className="preset-group-note" role="status">找到 {filtered.length} 个模板{activeGroup?` · ${activeGroup.summary}`:' · 预设只是起点，不限制策划内容'}</p>
    {show.length?<div className="preset-grid">{show.map(preset=>{const open=expanded===preset.id,Icon=groupIcons[preset.group],image=PRESET_IMAGES[preset.id];return <article className={`preset-card ${open?'open':''}`} key={preset.id}>
      <button type="button" className="preset-main" onClick={()=>onPreset(preset.id)}><img className="preset-image" src={image?.src??FALLBACK_PRESET_IMAGE} alt={image?.alt??`${preset.name}配图待补充`} loading="lazy" width={960} height={540} onError={e=>{if(!e.currentTarget.src.endsWith(FALLBACK_PRESET_IMAGE))e.currentTarget.src=FALLBACK_PRESET_IMAGE;}}/><span className="preset-card-copy"><span className="preset-badge"><Icon size={14}/>{GROUPS.find(g=>g.id===preset.group)?.label} · {(preset.scaleType??'large')==='small'?'小型':'大型'}</span><strong>{preset.name}</strong>{!image&&<small>真实照片待补充</small>}<p>{preset.tagline}</p><span className="preset-metrics"><span>{preset.peopleRange?`${preset.peopleRange[0]}–${preset.peopleRange[1]} 人`:`约 ${preset.people} 人`}</span><span>{preset.complexity??'专业'}策划</span></span><span className="preset-go">用这个预设 <ArrowRight size={15}/></span></span></button>
      <button type="button" className="preset-detail-toggle" aria-expanded={open} onClick={()=>setExpanded(open?null:preset.id)}>{open?'收起详情':'看详情'} <ChevronDown size={14} className={open?'flip':''}/></button>
      {open&&<div className="preset-detail"><div className="preset-block"><h4>活动场景介绍</h4><p>{preset.intro}</p></div><dl className="preset-facts"><div><dt>适用人群</dt><dd>{preset.audience}</dd></div><div><dt>活动目标</dt><dd>{preset.goal}</dd></div></dl><div className="preset-block"><h4>推荐流程</h4><ol>{preset.flow.map((s,i)=><li key={`${s.name}-${i}`}><strong>{s.name}</strong><span>{s.detail}</span></li>)}</ol></div><div className="preset-columns"><div className="preset-block"><h4>人员</h4><ul>{preset.roles.map(r=><li key={r.role}>{r.role}：{r.duty}</li>)}</ul></div><div className="preset-block"><h4>物资</h4><ul>{preset.materials.map(m=><li key={m}>{m}</li>)}</ul></div><div className="preset-block"><h4>预算参考</h4><ul>{preset.budgetLines.map(b=><li key={b.category}>{b.category} {Math.round(b.ratio*100)}%</li>)}</ul></div><div className="preset-block"><h4>风险</h4><ul>{preset.risks.map(r=><li key={r.title}>{r.title}：{r.mitigation}</li>)}</ul></div></div>{image&&<p className="preset-photo-credit">摄影：{image.author} · <a href={image.source} target="_blank" rel="noreferrer">Pexels 来源</a> · <a href={image.licenseUrl} target="_blank" rel="noreferrer">使用许可</a></p>}</div>}
    </article>;})}</div>:<div className="preset-empty"><p>没有匹配的模板。可以换个关键词，或直接描述自己的活动。</p><button className="preset-custom" onClick={onCustom}>自定义活动 <ArrowRight size={16}/></button></div>}
    {limit<filtered.length&&<div className="preset-more"><button onClick={()=>setLimit(v=>v+12)}>查看更多模板（剩余 {filtered.length-limit} 个）</button></div>}
    {activeGroup&&<details className="preset-categories"><summary>从活动类型起稿</summary><div>{activeGroup.categories.map(id=><button key={id} onClick={()=>onCategory(id)}>{getCategory(id).label}</button>)}</div></details>}
    </div></section>;
}
