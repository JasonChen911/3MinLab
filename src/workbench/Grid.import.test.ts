import {describe,expect,it} from 'vitest';
import {parseDelimited,prepareGridImport} from './Grid';
import type {Field} from './model';

const fields:Field[]=[{key:'name',label:'姓名或代号'},{key:'roles',label:'角色（逗号分隔）'},{key:'organization',label:'组织单位'},{key:'note',label:'备注'}];
describe('人员名册导入回归',()=>{
 it('常见表头映射后保留姓名、角色和组织单位，并跳过重复行',()=>{
  const matrix=parseDelimited('姓名,角色,组织单位,备注\n李四,志愿者,学生会,上午\n李四,志愿者,学生会,上午\n王五,裁判,体育部,下午');
  const result=prepareGridImport(matrix,fields,[],'人员');
  expect(result.incoming).toMatchObject([{name:'李四',roles:'志愿者',organization:'学生会'},{name:'王五',roles:'裁判',organization:'体育部'}]);
  expect(result.skipped).toBe(1);
 });
 it('不匹配的列、空文件和重复导入均阻断，不虚报成功',()=>{
  expect(()=>prepareGridImport(parseDelimited('姓名,陌生字段\n李四,值'),fields,[],'人员')).toThrow('未匹配');
  expect(()=>prepareGridImport(parseDelimited('姓名,角色'),fields,[],'人员')).toThrow('没有数据行');
  expect(()=>prepareGridImport(parseDelimited('姓名,角色,组织单位\n李四,志愿者,学生会'),fields,[{id:'old',name:'李四',roles:'志愿者',organization:'学生会'}],'人员')).toThrow('没有可新增');
 });
});
