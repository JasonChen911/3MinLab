import { parseDelimited } from '../workbench/Grid';
import { uid, type Athlete, type DataRow, type Field, type Workspace } from '../workbench/model';
export const FILE_CATEGORIES=['报名与人员名单','经费与预算','活动流程','物资与设备','场地与资源','活动通知','比赛与演出资料','其他文件','组织者活动思路'];
export type ImportTarget='registrations'|'athletes'|'expenses'|'materials'|'tasks'|'programs';
export const IMPORT_TARGETS:{id:ImportTarget;name:string;fields:Field[];required:string[];table:string}[]=[
{id:'registrations',name:'通用报名名单',table:'registrations',required:['name'],fields:[{key:'name',label:'姓名'},{key:'organization',label:'所属队伍或单位'},{key:'project',label:'报名项目'},{key:'status',label:'报名状态'},{key:'note',label:'备注'}]},
{id:'athletes',name:'田径运动员报名',table:'athletes',required:['number','name','team','group','projects'],fields:[{key:'number',label:'运动员编号'},{key:'name',label:'姓名'},{key:'team',label:'队伍'},{key:'group',label:'组别'},{key:'projects',label:'参赛项目'},{key:'seed',label:'报名成绩'}]},
{id:'expenses',name:'经费使用记录',table:'expenses',required:['item','actual'],fields:[{key:'item',label:'支出项目'},{key:'budget',label:'预算金额',type:'number'},{key:'actual',label:'实际支出',type:'number'},{key:'date',label:'支出日期',type:'date'},{key:'owner',label:'经办人'},{key:'category',label:'支出类别'},{key:'note',label:'备注'}]},
{id:'materials',name:'物资管理',table:'materials',required:['name','quantity'],fields:[{key:'name',label:'物资名称'},{key:'quantity',label:'数量',type:'number'},{key:'unit',label:'单位'},{key:'segment',label:'使用环节'},{key:'owner',label:'负责人'},{key:'status',label:'采购状态'},{key:'actual',label:'实际费用',type:'number'}]},
{id:'tasks',name:'人员任务分工',table:'tasks',required:['title'],fields:[{key:'title',label:'任务'},{key:'owner',label:'负责人'},{key:'due',label:'完成期限',type:'date'},{key:'status',label:'状态'},{key:'resources',label:'资源'},{key:'note',label:'备注'}]},
{id:'programs',name:'演出节目单',table:'performances',required:['f0'],fields:[{key:'f0',label:'节目名称'},{key:'f1',label:'演出人员'},{key:'f2',label:'团队'},{key:'f3',label:'时长（分钟）',type:'number'},{key:'f4',label:'审核状态'},{key:'f5',label:'舞台设备'},{key:'f6',label:'彩排时间'},{key:'f7',label:'备注'}]},
];
const aliases:Record<string,string[]>={name:['姓名','运动员姓名','参赛者','参与者','志愿者姓名','物资名称'],number:['编号','运动员编号','运动员号码','号码'],team:['队伍','代表队','参赛队伍','所属队伍或单位','所属单位'],organization:['单位','所属单位','队伍','所属队伍或单位'],group:['组别','竞赛组别','性别'],projects:['参赛项目','比赛项目','报名项目','项目'],item:['支出项目','项目','项目名称','费用项目'],budget:['预算金额','预算','计划金额'],actual:['实际支出','支出金额','实际费用','金额','已支出'],date:['支出日期','日期'],owner:['经办人','负责人','责任人'],category:['支出类别','类别'],quantity:['数量','物资数量'],title:['任务','工作内容','任务名称'],f0:['节目名称','节目','报告题目'],f1:['演出人员','表演者'],f3:['时长（分钟）','节目时长','时长'],f4:['审核状态','状态']};
export function suggestMapping(headers:string[],target:ImportTarget) {
  const config=IMPORT_TARGETS.find(item=>item.id===target)!;
  return Object.fromEntries(config.fields.map(field=>{const index=headers.findIndex(header=>header.trim()===field.label||(aliases[field.key]??[]).includes(header.trim()));return [field.key,index];}));
}
export function mapRows(matrix:string[][],mapping:Record<string,number>,target:ImportTarget):DataRow[] {const fields=IMPORT_TARGETS.find(item=>item.id===target)!.fields;return matrix.slice(1).filter(row=>row.some(value=>value.trim())).map(row=>({id:uid(),...Object.fromEntries(fields.map(field=>[field.key,mapping[field.key]>=0?String(row[mapping[field.key]]??'').trim(): '']))}));}
export function parseCsvBytes(bytes:ArrayBuffer) {const raw=new Uint8Array(bytes);let text:string;
  if(raw[0]===0xff&&raw[1]===0xfe)text=new TextDecoder('utf-16le').decode(bytes);
  else {try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('gb18030').decode(bytes);}}
  if(text.includes('\0'))throw new Error('CSV 含无效二进制字符');const rows=parseDelimited(text);if(rows.length>2001)throw new Error('单次最多导入 2000 行');if((rows[0]?.length??0)>30)throw new Error('单次最多导入 30 列');return rows;
}
export function validateImport(rows:DataRow[],target:ImportTarget,workspace:Workspace):string[] {
  const config=IMPORT_TARGETS.find(item=>item.id===target)!;const issues:string[]=[];const signatures=new Set<string>();const existing=workspace.tables[config.table]?.rows??[];
  rows.forEach((row,index)=>{
    for(const key of config.required)if(!row[key]?.trim())issues.push(`第 ${index+2} 行缺少${config.fields.find(f=>f.key===key)?.label}`);
    for(const field of config.fields.filter(f=>f.type==='number'))if(row[field.key]&&(!Number.isFinite(Number(row[field.key]))||Number(row[field.key])<0))issues.push(`第 ${index+2} 行${field.label}须为非负数字`);
    if(target==='expenses'&&row.date&&!/^\d{4}-\d{2}-\d{2}$/.test(row.date))issues.push(`第 ${index+2} 行支出日期须为 YYYY-MM-DD`);
    const signature=target==='athletes'?row.number:target==='registrations'?`${row.name}|${row.organization}|${row.project}`:target==='expenses'?`${row.item}|${row.date}|${row.actual}|${row.owner}`:config.fields.map(f=>row[f.key]).join('|');
    if(signatures.has(signature))issues.push(`第 ${index+2} 行与本次导入的其他记录重复`);signatures.add(signature);
    if(target==='athletes') {
      if(workspace.athletics.athletes.some(a=>a.number===row.number))issues.push(`编号 ${row.number} 已存在，未覆盖原报名`);
      const projectNames=row.projects?.split(/[,，、]/).map(v=>v.trim()).filter(Boolean)??[];
      if(projectNames.length>workspace.athletics.maxEntries)issues.push(`${row.name} 超过兼项限制`);
      for(const name of projectNames){const project=workspace.athletics.projects.find(p=>p.name===name||p.id===name);if(!project)issues.push(`项目“${name}”尚未配置，请先在田径工具箱配置`);else if(project.group&&project.group!==row.group)issues.push(`${row.name} 与项目“${name}”组别不符`);}
    } else if(existing.some(old=> target==='registrations'?old.name===row.name&&old.organization===row.organization&&old.project===row.project:target==='expenses'?old.item===row.item&&old.actual===row.actual&&old.date===row.date&&old.owner===row.owner:config.fields.every(f=>(old[f.key]??'')===(row[f.key]??''))))issues.push(`第 ${index+2} 行与已有记录重复`);
  });
  if(target==='athletes')for(const project of workspace.athletics.projects){const extra=rows.filter(row=>(row.projects??'').split(/[,，、]/).some(v=>v.trim()===project.name||v.trim()===project.id)).length;const current=workspace.athletics.athletes.filter(a=>a.projects.includes(project.id)).length;if(project.capacity>0&&current+extra>project.capacity)issues.push(`${project.name} 导入后超过项目人数限制 ${project.capacity}`);}
  return [...new Set(issues)];
}
export function applyImport(workspace:Workspace,target:ImportTarget,rows:DataRow[]):Workspace {
  const issues=validateImport(rows,target,workspace);if(issues.length)throw new Error(issues.join('；'));
  if(target==='athletes'){const athletes:Athlete[]=rows.map(row=>({id:row.id,number:row.number,name:row.name,team:row.team,group:row.group,seed:row.seed??'',projects:row.projects.split(/[,，、]/).map(name=>workspace.athletics.projects.find(project=>project.name===name.trim()||project.id===name.trim())!.id)}));return {...workspace,athletics:{...workspace.athletics,athletes:[...workspace.athletics.athletes,...athletes]}};}
  const config=IMPORT_TARGETS.find(item=>item.id===target)!;const old=workspace.tables[config.table];return {...workspace,tables:{...workspace.tables,[config.table]:{id:config.table,name:config.name,fields:config.fields,rows:[...(old?.rows??[]),...rows],revision:(old?.revision??0)+1}}};
}
export function expenseStats(workspace:Workspace,totalBudget:number) {const rows=workspace.tables.expenses?.rows??[];const total=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.actual)||0),0);const planned=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.budget)||0),0);const categories:Record<string,number>={};for(const row of rows){const key=row.category||'未分类';categories[key]=(categories[key]??0)+Math.max(0,Number(row.actual)||0);}const invalid=rows.filter(row=>!row.actual?.trim()||!Number.isFinite(Number(row.actual))||Number(row.actual)<0);return {invalid,used:total,remaining:totalBudget-total,planned,categories,overBudget:rows.filter(row=>row.budget!==''&&Number(row.actual)>Number(row.budget))};}
export async function validateFile(file:File) {const ext=file.name.split('.').at(-1)?.toLowerCase()??'';if(!['xlsx','xls','csv','docx','pdf','png','jpg','jpeg','webp'].includes(ext))throw new Error('仅支持 Excel、CSV、Word、PDF 和指定图片格式');if(file.size===0)throw new Error('文件为空');if(file.size>10*1024*1024)throw new Error('每个文件最多 10 MB；Excel 解析最多 5 MB');const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());const ascii=new TextDecoder().decode(bytes);const matches=ext==='csv'||['xlsx','docx'].includes(ext)&&bytes[0]===0x50&&bytes[1]===0x4b||ext==='pdf'&&ascii.startsWith('%PDF')||ext==='png'&&bytes[0]===0x89&&bytes[1]===0x50||['jpg','jpeg'].includes(ext)&&bytes[0]===0xff&&bytes[1]===0xd8||ext==='webp'&&ascii.startsWith('RIFF')&&ascii.includes('WEBP')||ext==='xls'&&bytes[0]===0xd0&&bytes[1]===0xcf;if(!matches)throw new Error('文件内容与扩展名不匹配');return ext;}
