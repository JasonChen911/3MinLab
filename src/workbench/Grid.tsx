import {useDecision} from '../components/useDecision';
import { useRef, useState } from 'react';
import { uid, type DataRow, type Field } from './model';
export function parseDelimited(text: string): string[][] {
  const delimiter=text.split('\n')[0].includes('\t')?'\t':',';
  text=text.replace(/^\uFEFF/,'');
  const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===delimiter&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('引号未闭合，请检查 CSV');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export default function Grid({ fields, rows, onChange, onFields, name='数据表', importable=false }: {fields:Field[];rows:DataRow[];onChange:(rows:DataRow[])=>void;onFields?:(fields:Field[])=>void;name?:string;importable?:boolean}) {
  const {ask,dialog}=useDecision();
  const [query,setQuery]=useState(''); const [error,setError]=useState(''); const input=useRef<HTMLInputElement>(null);
  const update=(id:string,key:string,value:string)=>onChange(rows.map(row=>row.id===id?{...row,[key]:value}:row));
  async function importFile(file: File) {
    try {
      let matrix:string[][];
      if(/\.xlsx$/i.test(file.name)) {const form=new FormData();form.append('file',file);const response=await fetch('/api/files/import-xlsx',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:await file.arrayBuffer()});const data=await response.json();if(!response.ok)throw new Error(data.error??'导入失败');matrix=data.rows;}
      else matrix=parseDelimited(await file.text());
      if(!matrix.length)throw new Error('文件没有数据');
      const header=matrix[0].map(v=>String(v).trim());
      const mapped=fields.map(field=>header.indexOf(field.label));
      if(mapped.every(index=>index<0))throw new Error(`首行必须包含表头：${fields.map(field=>field.label).join('、')}`);
      if(matrix.length>2001)throw new Error('单次最多导入 2000 行');
      const incoming=matrix.slice(1).map(cells=>Object.fromEntries([['id',uid()],...fields.map((field,i)=>[field.key,mapped[i]<0?'':String(cells[mapped[i]]??'')])]) as DataRow);
      onChange([...rows,...incoming]);setError(`已导入 ${incoming.length} 行，请核对数据与重复记录。`);
    }catch(err){setError(err instanceof Error?err.message:'导入失败');}
  }
  return <div className="wb-grid">
    <div className="wb-grid-actions"><input aria-label={`查询${name}`} placeholder="搜索当前表格…" value={query} onChange={event=>setQuery(event.target.value)}/>
      <button type="button" onClick={async()=>onChange([...rows,{id:uid(),...Object.fromEntries(fields.map(field=>[field.key,'']))}])}>＋ 添加一行</button>
      {importable&&<><button type="button" onClick={async()=>input.current?.click()}>导入 CSV / TSV / Excel</button><input ref={input} type="file" accept=".csv,.tsv,.xlsx" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void importFile(file);event.target.value='';}}/></>}
      {onFields&&<button type="button" onClick={async()=>{const label=await ask('新字段名称',true);if(typeof label==='string'&&label.trim())onFields([...fields,{key:uid(),label:label.trim()}]);}}>＋ 自定义字段</button>}
      <span>{rows.length} 条记录</span>
    </div>
    {error&&<p role="status" className="wb-notice">{error}</p>}
    {onFields&&<p className="wb-help">点击列名可重命名；清空列名可移除该列。所有数据保存在本浏览器。</p>}
    <div className="table-wrap"><table className="block-table"><thead><tr>{fields.map(field=><th key={field.key}>{onFields?<button type="button" className="text-button" onClick={async()=>{const label=await ask('列名（留空删除该列）',true,field.label,true);if(typeof label!=='string')return;if(!label.trim()&&!await ask('移除这列？此列内容将不再显示。'))return;onFields(label.trim()?fields.map(item=>item.key===field.key?{...item,label:label.trim()}:item):fields.filter(item=>item.key!==field.key));}}>{field.label}</button>:field.label}</th>)}<th>操作</th></tr></thead>
    <tbody>{rows.filter(row=>!query||fields.some(field=>(row[field.key]??'').includes(query))).map(row=><tr key={row.id}>{fields.map(field=><td key={field.key}>{field.options?<select aria-label={`${name} ${field.label}`} value={row[field.key]??''} onChange={event=>update(row.id,field.key,event.target.value)}><option value="">请选择</option>{field.options.map(option=><option key={option}>{option}</option>)}</select>:<input className="cell-input" type={field.type??'text'} aria-label={`${name} ${field.label}`} value={row[field.key]??''} onChange={event=>update(row.id,field.key,event.target.value)}/>}</td>)}<td><button className="row-delete" type="button" aria-label={`删除${name}行`} onClick={async()=>{if(await ask('删除这条记录？请确认已有备份或不再需要。'))onChange(rows.filter(item=>item.id!==row.id));}}>删除</button></td></tr>)}</tbody></table></div>
    {!rows.length&&<div className="wb-empty">还没有记录。添加一行或导入自己的真实数据即可开始。</div>}
    {dialog}
  </div>;
}
