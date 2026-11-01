import type { Field, Scene, ToolDefinition, Workspace } from './model';
export const SCENES: { id: Scene; name: string }[] = [{id:'athletics',name:'田径运动会'},{id:'performance',name:'音乐节与文艺演出'},{id:'conference',name:'学术会议与讲座'},{id:'sports',name:'体育竞赛'},{id:'charity',name:'公益志愿'},{id:'business',name:'商业会议与发布会'},{id:'competition',name:'创新创业与学术竞赛'},{id:'community',name:'社区与节庆'},{id:'custom',name:'自定义活动'}];
export const fields = (labels: string[]): Field[] => labels.map((label, index) => ({key:`f${index}`,label}));
const template = '活动名称：{{活动名称}}\n时间：{{举办时间}}\n地点：{{举办地点}}\n主办单位：{{主办单位}}\n负责人：{{负责人}}\n主题：{{活动主题}}\n目标：{{活动目标}}';
const definitions: ToolDefinition[] = [];
function table(scene: Scene, id: string, name: string, labels: string[], category: ToolDefinition['category'] = '活动专属文件') {
  definitions.push({id,scene,name,description:`管理${name}，可逐格编辑、导入和导出。`,kind:'table',category,fields:fields(labels)});
}
function text(scene: Scene, id: string, name: string, body: string, category: ToolDefinition['category'] = '活动专属文件') {
  definitions.push({id,scene,name,description:`根据当前活动资料生成${name}，支持编辑及 AI 起草。`,kind:'text',category,body:`${template}\n\n${body}`});
}
text('athletics','ath-rules','竞赛规程','参赛单位：待确认\n比赛项目：{{比赛项目}}\n参赛资格：待主办方确认\n报名办法：填写运动员编号、组别与项目，审核重复及兼项限制\n竞赛办法：按项目设置预赛/决赛与场地资源，赛程须人工核查\n计分规则：{{计分规则}}\n录取名次：{{录取名次}}\n奖励办法：待主办方确认\n注意事项：同成绩、接力队构成与跳高试跳规则须按正式规程核对');
for (const [id,name] of [['ath-entry','运动员报名管理'],['ath-schedule','赛程编排'],['ath-checkin','检录单与成绩登记表'],['ath-results','成绩录入与自动排名'],['ath-team','团体积分榜'],['ath-awards','成绩公告与获奖名单']]) definitions.push({id,name,scene:'athletics',kind:'athletics',category:id==='ath-entry'?'报名与人员资料':'成绩与统计文件',description:'关联真实报名、赛程和成绩；排名和积分由程序计算。'});
table('performance','performances','节目征集与审核',['节目名称','演出人员','团队','时长（分钟）','审核状态','舞台设备','彩排时间','备注']);
for (const [id,name] of [['show-order','节目单与顺序'],['show-duration','演出时长汇总'],['show-rehearsal','彩排时间安排表'],['show-stage','舞台调度表'],['show-equipment','灯光音响设备需求表']]) definitions.push({id,name,scene:'performance',kind:'performance',source:'performances',category:'活动流程文件',description:'使用审核通过的节目，拖动替代为上移/下移，顺序和时长联动更新。'});
table('performance','show-people','演出人员信息与签到',['姓名','所属节目','角色','到场状态','备注'],'报名与人员资料');
text('performance','show-script','主持词','节目顺序：{{节目单}}\n\n开场：欢迎各位来到{{活动名称}}。\n节目衔接：请根据实际节目逐一介绍，未确认人员不得编造。\n结束语：感谢参与，按现场指引有序离场。');
text('performance','show-emergency','演出突发情况应急流程','设备故障：技术负责人排查，主持人切换交流环节。\n节目缺席：核实人员情况后调整顺序，同步通知舞台、灯光与音响。\n安全事件：暂停演出，启动现场负责人确认的疏散流程。');
text('conference','conference-notice','会议通知','会议议程：{{会议议程}}\n参会要求：待确认\n报名方式：待确认');
text('conference','conference-invite','嘉宾邀请函','尊敬的嘉宾：\n诚邀您参加{{活动名称}}，围绕{{活动主题}}交流。报告题目、时长与交通安排请双方确认。');
table('conference','conference-registration','会议报名表',['姓名','单位','角色','参会方式','备注'],'报名与人员资料');
table('conference','reports','嘉宾报告与摘要管理',['报告题目','主讲人','所属单位','报告摘要','时长（分钟）','场地','设备']);
for (const [id,name] of [['conference-agenda','会议议程表'],['conference-abstracts','报告题目与摘要汇总']]) definitions.push({id,name,scene:'conference',kind:'performance',source:'reports',category:'活动流程文件',description:'依据真实报告与时长生成，可调整报告顺序。'});
table('conference','conference-seats','座位安排表',['区域','排号','座位','姓名','备注']);
table('conference','conference-checkin','参会签到表',['姓名','单位','签到时间','状态'],'报名与人员资料');
text('conference','conference-script','主持人串词','会议议程：{{会议议程}}\n开场与报告衔接：请核对主讲人姓名、单位和题目后使用。');
text('conference','conference-minutes','会议纪要模板','参会人员：{{参与人员}}\n议程：{{会议议程}}\n讨论要点：待会后填写\n决定事项：待确认\n跟进责任人与期限：待填写');
table('conference','conference-feedback','参会反馈问卷',['问题','题型','选项','反馈记录'],'总结与反馈文件');
text('conference','conference-summary','会议总结报告','报名与报告数据：{{统计数据}}\n实际成果：待会后据实填写\n问题与改进：待填写','总结与反馈文件');
for (const [id,name] of [['sports-teams','参赛队伍报名'],['sports-format','赛制分组与抽签'],['sports-fixtures','比赛对阵与裁判安排'],['sports-results','比赛结果登记'],['sports-standings','积分榜与淘汰赛晋级'],['sports-awards','体育比赛获奖名单']]) definitions.push({id,name,scene:'sports',kind:'sports',category:'成绩与统计文件',description:'支持单循环、分组循环和单淘汰；使用独立胜平负规则。'});
table('sports','sports-athletes','运动员名单',['姓名','编号','队伍','角色','备注'],'报名与人员资料');
table('charity','volunteers','志愿者报名与岗位',['姓名','组织','岗位','值班开始','值班结束','实际服务小时','签到状态'],'报名与人员资料');
table('charity','charity-needs','服务对象需求登记',['服务对象代号','需求','优先级','负责人','状态']);
table('charity','charity-materials','服务物资领取与归还',['物资名称','数量','用途','领用人','领取时间','归还数量'],'预算与物资文件');
table('charity','charity-shifts','志愿者排班与签到',['姓名','岗位','开始时间','结束时间','签到','签退'],'任务分工文件');
table('charity','charity-outcomes','服务时长与成果登记',['成果名称','负责人','数量','核验依据','备注'],'总结与反馈文件');
text('charity','charity-summary','公益活动总结','真实服务统计：{{统计数据}}\n实际服务成果与反馈：待据实填写\n改进事项：待填写','总结与反馈文件');
for (const [id,name,labels] of [
 ['business-guests','嘉宾与媒体邀请名单',['姓名','单位','身份','邀请状态','接待负责人']],
 ['business-reception','嘉宾接待安排',['嘉宾','到达时间','接待人','地点','备注']],
 ['business-agenda','活动议程与现场执行',['开始时间','结束时间','环节','负责人','场地','设备']],
 ['business-budget','预算执行表',['项目','预算金额','实际金额','负责人','票据状态']],
] as [string,string,string[]][]) table('business',id,name,labels,id.includes('budget')?'预算与物资文件':'活动专属文件');
for (const [id,name,body] of [['business-invite','活动邀请函','诚邀您参加{{活动名称}}，时间地点如上。请确认出席及交流主题。'],['business-speech','演讲稿','主题：{{活动主题}}\n目标：{{活动目标}}\n产品信息、论据与演讲者身份请据实补充。'],['business-script','主持词','议程：{{活动流程}}\n嘉宾介绍与衔接：待确认。'],['business-news','新闻通稿','活动基本信息如上。真实成果、发布内容与引语待确认，不将计划当作已发生成果。'],['business-promotion','宣传内容','欢迎参与{{活动名称}}。时间：{{举办时间}}；地点：{{举办地点}}。报名方式待确认。'],['business-feedback','活动反馈报告','实际统计：{{统计数据}}\n反馈、成果与改进：待据实填写。']]) text('business',id,name,body);
text('competition','contest-notice','竞赛通知','比赛主题：{{活动主题}}\n参赛资格、报名方式、截止时间与奖励办法：待组委会确认。');
table('competition','contest-projects','参赛报名与作品资料',['项目名称','团队','负责人','资料清单','展示顺序','答辩分钟','提交状态']);
for (const [id,name] of [['contest-rules','评审标准与评分规则'],['contest-scores','评委评分与自动汇总'],['contest-ranking','排名与获奖名单']]) definitions.push({id,name,scene:'competition',kind:'scoring',category:'成绩与统计文件',description:'配置权重、缺席与同分规则，实际评分由程序汇总。'});
table('competition','contest-defense','作品展示与答辩安排',['顺序','项目','开始时间','结束时间','场地','评委']);
table('competition','contest-certificates','证书信息表',['姓名或团队','项目','奖项','证书编号','核对状态']);
for (const [id,name,labels] of [['community-registration','活动报名表',['姓名或代号','组织','参与项目','备注']],['community-areas','摊位与区域规划',['区域','摊位编号','用途','负责人','容量','动线备注']],['community-shifts','志愿者排班',['姓名','岗位','开始时间','结束时间']],['community-materials','物资管理',['物资','数量','负责人','状态']],['community-program','节目与互动项目清单',['项目','时长（分钟）','负责人','设备']],['community-safety','人流与安全管理检查',['检查项','区域','责任人','状态','备注']],['community-feedback','活动反馈问卷',['问题','选项','反馈']]] as [string,string,string[]][]) table('community',id,name,labels);
text('community','community-promotion','活动宣传材料','欢迎参加{{活动名称}}。活动目标：{{活动目标}}。参与方式待确认。');
text('community','community-summary','社区节庆活动总结','真实统计：{{统计数据}}\n成果与参与者反馈：待据实填写。','总结与反馈文件');
table('custom','custom-table','自定义表格',['名称','负责人','状态','备注']);
text('custom','custom-document','自定义文档模板','{{活动流程}}\n\n请补充该活动所需的专属内容。');
export const TOOLS = definitions;
export const getTool = (id: string) => TOOLS.find((tool) => tool.id === id);
export function recommendedTools(workspace: Workspace) { return TOOLS.filter((tool) => tool.scene === workspace.scene || tool.scene === 'custom'); }
