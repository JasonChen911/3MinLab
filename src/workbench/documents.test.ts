import { describe,it,expect } from 'vitest';
import {createBrief} from '../rules/intake';import {generatePlan} from '../rules/generator';
import {createWorkspace} from './model';import {createDocument,fillTemplate,syncDocuments,updateTable} from './documents';
import {loadWorkspace,saveWorkspace} from './storage';
import {parseDelimited} from './Grid';
const plan=generatePlan(createBrief('音乐节，100人'));
describe('文档依赖、保存与批量导入',()=>{
 it('系统表格自动同步，手动文档保留原内容并标记来源变化',()=>{let data=createWorkspace(plan);data=updateTable(data,'performances',[{id:'p',f0:'合唱',f1:'真实团队',f3:'5',f4:'通过'}]);const doc=createDocument(data,plan,'show-order');data.documents=[doc,{...doc,id:'manual',manual:true,rows:[['自定节目']]}];const changed=updateTable(data,'performances',[{id:'p',f0:'器乐',f1:'真实团队',f3:'8',f4:'通过'}]);const synced=syncDocuments(changed,plan);expect(synced.documents[0].rows[0]).toContain('器乐');expect(synced.documents[0].version).toBe(2);expect(synced.documents[1].rows).toEqual([['自定节目']]);expect(synced.documents[0].source).not.toBe(synced.documents[1].source);});
 it('文档保存后重新读取可继续编辑，保留活动关联与版本',()=>{const map=new Map<string,string>();const storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,v:string)=>{map.set(key,v);}};const data=createWorkspace(plan);data.documents=[{...createDocument(data,plan,'show-script'),text:'自行修改主持词',manual:true,version:4}];saveWorkspace(data,storage);const restored=loadWorkspace(plan,storage).data;expect(restored.documents[0].text).toBe('自行修改主持词');expect(restored.documents[0].version).toBe(4);expect(restored.documents[0].activityId).toBe(plan.id);});
 it('动态变量复用只取当前活动的资料',()=>{expect(fillTemplate('{{活动名称}} / {{负责人}}',{活动名称:'本次活动',负责人:'甲'})).toBe('本次活动 / 甲');});
 it('CSV 识别中文BOM、双引号、逗号和换行，TSV 表格可导入',()=>{expect(parseDelimited('\uFEFF姓名,备注\r\n"甲","含,逗号"\r\n"乙","两行\n文字"')).toEqual([['姓名','备注'],['甲','含,逗号'],['乙','两行\n文字']]);expect(parseDelimited('姓名\t组别\n甲\t公开组')[1]).toEqual(['甲','公开组']);expect(()=>parseDelimited('"bad')).toThrow();});
});
