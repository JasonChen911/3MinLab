import { useState } from 'react';
import type { SimulationState } from './model';

function Person({x,y,color,label}:{x:number;y:number;color:string;label:string}) {return <g transform={`translate(${x},${y})`}><title>{label}</title><circle cy="-4" r="3" fill={color}/><path d="M-4 6 Q-4 -1 0 -1 Q4 -1 4 6" fill={color}/></g>;}
export default function Sandbox({state:s}:{state:SimulationState}) {
  const [zoom,setZoom]=useState(1);
  const unit=Math.max(1,Math.ceil(s.snapshot.people/80));
  const queue=Math.ceil(s.queue/unit),crowd=Math.ceil(Math.max(0,s.served-s.departed)/unit),exited=Math.ceil(s.departed/unit);
  const running=s.tasks.find(t=>t.status==='进行中');
  const track=['athletics','sports'].includes(s.snapshot.scene);
  const meeting=['conference','business','competition'].includes(s.snapshot.scene);
  return <figure className="sim-sandbox"><div className="sim-map-tools"><label>沙盘缩放 <input aria-label="沙盘缩放" type="range" min="1" max="2" step=".25" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><span>窄屏可左右滑动查看场地</span></div><div className="sim-map-scroll"><svg style={{width:`${zoom*100}%`}} viewBox="0 0 900 520" role="img" aria-label={`活动沙盘，排队${s.queue}人，场内${s.served-s.departed}人，${s.snapshot.activityName}${s.weatherClosed?'关闭':'开放'}`}>
    <defs><pattern id="sim-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#dce6d3" strokeWidth=".5"/></pattern></defs>
    <rect width="900" height="520" rx="18" fill="#f6f7ed"/><rect width="900" height="520" fill="url(#sim-grid)"/>
    <path d="M45 265H300M700 265H855" stroke="#e3d8b9" strokeWidth="46"/>
    <text x="30" y="223">入口 →</text><text x="809" y="223">→ 出口</text>
    <rect x="90" y="65" width="185" height="125" rx="12" fill="#fff8e5" stroke="#d8bd83"/><text x="105" y="89">等候区 · {s.queue} 人</text>
    <rect x="95" y="300" width="180" height="76" rx="9" fill="#e4eedb" stroke="#97ae7f"/><text x="111" y="323">签到台 · {Math.min(s.parameters.checkinStaff,Math.max(0,s.availableStaff-2))} 人值守</text>
    <rect x="300" y="65" width="395" height="340" rx="16" fill={s.weatherClosed?'#f2dad5':track?'#efdfc5':'#edf2df'} stroke={s.weatherClosed?'#bd5c48':'#9cae83'} strokeWidth="2"/>
    <text x="320" y="91">{s.snapshot.activityName} · {s.weatherClosed?'暂时关闭':`${s.served-s.departed}/${s.parameters.capacity} 人`}</text>
    {track?<><rect x="330" y="125" width="335" height="245" rx="95" fill="#c98d6e"/>{[0,1,2].map(i=><rect key={i} x={342+i*8} y={137+i*8} width={311-i*16} height={221-i*16} rx={82-i*8} fill="none" stroke="#f7ede3"/>)}<rect x="390" y="183" width="215" height="128" rx="52" fill="#a7ba8b"/></>:meeting?<>{[0,1,2].map(i=><rect key={i} x={350+i*105} y="210" width="80" height="115" rx="16" fill="#d6c5a7"/>)}<rect x="382" y="120" width="220" height="55" rx="8" fill="#95aa78"/><text x="445" y="153">演讲 / 展示</text></>:<><rect x="365" y="125" width="260" height="70" rx="8" fill="#8da277"/><text x="468" y="165">{s.snapshot.scene==='charity'?'服务台':'主舞台'}</text><path d="M355 210H635" stroke="#c7d6b4" strokeWidth="5"/></>}
    <rect x="720" y="65" width="155" height="125" rx="12" fill={s.equipmentDown?'#f7d8cf':'#e6ede0'} stroke="#a5b58e"/><text x="733" y="90">设备区</text><rect x="750" y="107" width="45" height="32" rx="4" fill={s.equipmentDown?'#b44f3a':'#617d50'}/><text x="733" y="167">{s.snapshot.equipmentName}{s.equipmentDown?' ⚠ 故障':' · 正常'}</text>
    <rect x="720" y="310" width="155" height="95" rx="12" fill="#edf0e4" stroke="#bac8a9"/><text x="733" y="335">休息 / 工作人员区</text>
    <rect x="90" y="430" width="185" height="65" rx="9" fill={s.supplyDown?'#fae2bf':'#e8eddf'}/><text x="107" y="455">物资 · {s.supplyDown?'短缺':'可用'}</text><text x="107" y="479">备用设备 {s.parameters.spare-s.usedSpare} 套</text>
    {Array.from({length:Math.min(80,queue)},(_,i)=><Person key={`q${i}`} x={107+i%12*13} y={110+Math.floor(i/12)*13} color="#b7853b" label={`排队人群，每点至多 ${unit} 人`}/>)}
    {Array.from({length:Math.min(80,crowd)},(_,i)=>{const phase=s.minute%6/6;return <Person key={`c${i}`} x={340+i%20*16+phase*3} y={meeting?340+Math.floor(i/20)*13:220+Math.floor(i/20)*23} color={track?'#486e8c':'#66834c'} label="场内参与者"/>;})}
    {Array.from({length:Math.min(10,s.availableStaff)},(_,i)=><Person key={`s${i}`} x={733+i%8*16} y={359+Math.floor(i/8)*19} color="#42643d" label="可用工作人员，每点1人（最多显示10人）"/>)}
    {Array.from({length:Math.min(6,exited)},(_,i)=><Person key={`e${i}`} x={803+i*10} y={262} color="#8f9d83" label="已离场参与者（抽样显示）"/>)}
    {(s.transfers??[]).filter(t=>s.minute-t.at<3).map((t,i)=>{const fraction=(s.minute-t.at+1)/3;const x=t.kind==='arrival'?45+90*fraction:t.kind==='admission'?240+85*fraction:700+155*fraction;return <g key={`${t.at}-${t.kind}`}><Person x={x} y={255+i%3*13} color={t.kind==='exit'?'#8a9980':'#4e7792'} label={`${t.count}人${t.kind==='arrival'?'正在到达':t.kind==='admission'?'签到后进入':'离场'}`}/></g>;})}
    {s.queue>0&&<path d="M175 191V266L190 299" fill="none" stroke="#ba9858" strokeDasharray="4 5"/>}
    {crowd>0&&<path d="M275 340L322 300" fill="none" stroke="#73915b" strokeDasharray="4 5"/>}
    <text x="320" y="449">当前任务：{running?.name.slice(0,24)??(s.status==='finished'?'本次模拟结束':'等待到场 / 资源 / 前置任务')}</text>
    <text x="320" y="477">{s.weatherClosed?'天气影响场地 → 任务暂停':s.equipmentDown?'设备故障 → 依赖设备任务暂停':'场地与设备正常，按依赖和人员配置推进'}</text>
  </svg></div><figcaption>人群每点最多代表 {unit} 人，工作人员最多显示 10 点；总量以指标为准。路途中人物代表最近3分钟的实际流动人群；位置、队列、场地和设备均取自当前仿真状态。</figcaption></figure>;
}
