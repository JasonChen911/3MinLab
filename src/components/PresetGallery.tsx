import { useState } from 'react';
import { ArrowRight, ChevronDown, Sparkles, GraduationCap, Trophy, HeartHandshake, BriefcaseBusiness, Music, Users, Lightbulb, Presentation, PartyPopper } from 'lucide-react';
import { GROUPS, getCategory } from '../data/taxonomy';
import { PRESETS, presetsInGroup } from '../data/presets';
import { PRESET_IMAGES, FALLBACK_PRESET_IMAGE } from '../data/presetImages';
import type { GroupId } from '../types';

const groupIcons = { 'campus-education': GraduationCap, sports: Trophy, charity: HeartHandshake, business: BriefcaseBusiness, culture: Music, community: Users, tech: Lightbulb, conference: Presentation, festival: PartyPopper, custom: Sparkles };

interface Props {
  onPreset: (presetId: string) => void;
  onCategory: (categoryId: string) => void;
  onCustom: () => void;
}

/** 首页预设区：分类入口 + 12 个预设卡片（可展开看八项内容） */
export default function PresetGallery({ onPreset, onCategory, onCustom }: Props) {
  const [group, setGroup] = useState<GroupId | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const activeGroup = GROUPS.find((item) => item.id === group) ?? GROUPS[0];
  const presets = group === 'all' ? PRESETS : presetsInGroup(group);

  return <section className="preset-section" id="presets">
    <header className="preset-head">
      <div>
        <span className="mini-label">START FROM A SCENARIO</span>
        <h2>按类型找起点</h2>
        <p>选择一个起点，流程、人员与预算会提前填好，所有内容都能修改。</p>
      </div>
      <button className="preset-custom" type="button" onClick={onCustom}>
        <Sparkles size={16}/> 自定义活动 <ArrowRight size={16}/>
      </button>
    </header>

    <div className="preset-groups" role="tablist" aria-label="活动分类">
      <button type="button" role="tab" aria-selected={group === 'all'} className={group === 'all' ? 'active' : ''} onClick={() => { setGroup('all'); setExpanded(null); }}>全部预设（{PRESETS.length}）</button>
      {GROUPS.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={item.id === group}
        className={item.id === group ? 'active' : ''}
        onClick={() => { setGroup(item.id); setExpanded(null); }}
      >{item.label}</button>)}
    </div>

    <div className="preset-body">
      <p className="preset-group-note">{group === 'all' ? '预设是起点。你的活动，不受模板限制。' : activeGroup.summary}</p>

      {presets.length > 0
        ? <div className="preset-grid">
          {presets.map((preset) => {
            const open = expanded === preset.id;
            const CategoryIcon = groupIcons[preset.group];
            return <article className={`preset-card ${open ? 'open' : ''}`} key={preset.id}>
              <button type="button" className="preset-main" onClick={() => onPreset(preset.id)}>
                <img className="preset-image" src={PRESET_IMAGES[preset.id]?.src ?? FALLBACK_PRESET_IMAGE} alt={PRESET_IMAGES[preset.id]?.alt ?? preset.name} loading="lazy" width={960} height={540} onError={(event) => { if (!event.currentTarget.src.endsWith(FALLBACK_PRESET_IMAGE)) event.currentTarget.src = FALLBACK_PRESET_IMAGE; }}/>
                <span className="preset-card-copy">
                <span className="preset-badge"><CategoryIcon size={14}/>{GROUPS.find((item) => item.id === preset.group)?.label}</span>
                <strong>{preset.name}</strong>
                <p>{preset.tagline}</p>
                <span className="preset-metrics">
                  <span>{preset.people} 人</span>
                  <span>{Math.round(preset.duration / 60)} 小时</span>
                  <span>¥{preset.budget.toLocaleString('zh-CN')}</span>
                </span>
                <span className="preset-go">用这个预设 <ArrowRight size={15}/></span></span>
              </button>
              <button
                type="button"
                className="preset-detail-toggle"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : preset.id)}
              >{open ? '收起详情' : '看详情'} <ChevronDown size={14} className={open ? 'flip' : ''}/></button>
              {open && <div className="preset-detail">
                <div className="preset-block"><h4>活动场景介绍</h4><p className="preset-intro">{preset.intro}</p></div>
                <dl className="preset-facts">
                  <div><dt>适用人群</dt><dd>{preset.audience}</dd></div>
                  <div><dt>预设目标</dt><dd>{preset.goal}</dd></div>
                </dl>
                <div className="preset-block">
                  <h4>推荐流程</h4>
                  <ol>{preset.flow.map((step) => <li key={step.name}><strong>{step.name}</strong><span>{step.detail}</span></li>)}</ol>
                </div>
                <p className="preset-photo-credit">摄影：{PRESET_IMAGES[preset.id]?.author} · <a href={PRESET_IMAGES[preset.id]?.source} target="_blank" rel="noreferrer">Pexels 来源</a> · <a href={PRESET_IMAGES[preset.id]?.licenseUrl} target="_blank" rel="noreferrer">使用许可</a></p>
                <div className="preset-columns">
                  <div className="preset-block">
                    <h4>人员配置</h4>
                    <ul>{preset.roles.map((role) => <li key={role.role}><strong>{role.role}</strong>：{role.duty}</li>)}</ul>
                  </div>
                  <div className="preset-block">
                    <h4>物资需求</h4>
                    <ul className="inline-list">{preset.materials.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div className="preset-block">
                    <h4>预算结构</h4>
                    <ul>{preset.budgetLines.map((line) => <li key={line.category}><strong>{Math.round(line.ratio * 100)}%</strong> {line.category}</li>)}</ul>
                  </div>
                  <div className="preset-block">
                    <h4>特有风险</h4>
                    <ul>{preset.risks.map((risk) => <li key={risk.title}><strong>{risk.title}</strong>：{risk.mitigation}；应急：{risk.contingency}</li>)}</ul>
                  </div>
                </div>
              </div>}
            </article>;
          })}
        </div>
        : <div className="preset-empty">
          <p>这个分类还没有预设模板，可以直接选一个类型开始，或描述你的想法。</p>
          <button className="preset-custom" type="button" onClick={onCustom}><Sparkles size={16}/> 自定义活动 <ArrowRight size={16}/></button>
        </div>}

      {group !== 'all' && <div className="preset-categories">
        <span>该分类下的活动类型（从类型起稿，不套预设）</span>
        <div>
          {activeGroup.categories.map((categoryId) => <button key={categoryId} type="button" onClick={() => onCategory(categoryId)}>
            {getCategory(categoryId).label}
          </button>)}
        </div>
      </div>}
    </div>
  </section>;
}
