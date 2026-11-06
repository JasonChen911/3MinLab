import type { GroupId, VenueKind } from '../types';
import type { ScenarioPreset } from './presets';

type Seed = [id:string, name:string, categoryId:string, group:GroupId, tagline:string, people:number, budget:number, venue:VenueKind, flow:string[], materials:string[], risk:string, imagePresetId:string, keywords?:string[]];

const large:Seed[] = [
 ['athletics','田径运动会','sports-meet','sports','检录、赛程与成绩都能落地',800,60000,'stadium',['运动员检录','开幕与热身','分项比赛','成绩复核','颁奖退场'],['跑道标识','计时器','号码布','急救包'],'高温与运动损伤','preset-sports-match',['田径','运动会']],
 ['campus-culture','校园文化节','arts-culture','culture','把校园创意变成可参与的现场',1200,80000,'mixed',['展位报到','开幕展演','社团体验','文化工作坊','巡场与散场'],['展位桌椅','导览图','音响','分类垃圾桶'],'热门展位拥挤','preset-community-festival'],
 ['concert','大型演唱会','arts-performance','culture','围绕观众体验安排演出和保障',3000,500000,'expo',['票务核验','观众入场','暖场演出','主舞台演出','有序退场'],['舞台','音响','灯光','安检设备'],'舞台设备故障与疏散','preset-music-festival'],
 ['club-recruit','社团招新活动','campus-club','campus-education','让新生真正找到感兴趣的社团',600,20000,'outdoor',['社团布展','分区导览','体验活动','现场报名','名单核对'],['社团展位','二维码','宣传册','遮阳棚'],'报名信息遗漏','preset-welcome'],
 ['academic-conference','学术会议','academic-conference','conference','让嘉宾、议程和讨论衔接顺畅',500,150000,'indoor-large',['嘉宾签到','主旨报告','分论坛','圆桌讨论','成果发布'],['报告厅','投影','嘉宾席卡','同传设备'],'嘉宾行程与分论坛冲突','preset-lecture'],
 ['large-charity','大型公益活动','charity-service','charity','明确服务对象和现场分工',1000,90000,'mixed',['志愿者培训','受助者签到','分区服务','物资发放','反馈回收'],['服务台','物资包','指示牌','饮用水'],'物资发放与人流失衡','preset-charity-service'],
 ['exhibition','大型展览','business-expo','business','展区动线、观众体验与展商服务并重',2500,300000,'expo',['展商布展','观众入场','主题导览','互动展示','撤展交接'],['展台','导览牌','照明','安保设施'],'展区拥堵与展品安全','preset-business-meeting'],
 ['product-launch','企业发布会','business-launch','business','产品信息清晰呈现，媒体接待有序',600,250000,'indoor-large',['媒体签到','产品发布','现场演示','问答采访','合作洽谈'],['主屏','演示设备','媒体资料','备用电源'],'演示设备故障','preset-business-meeting'],
 ['graduation-show','校园毕业晚会','arts-graduation','culture','把毕业记忆留在舞台和观众席',1500,120000,'indoor-large',['观众入场','毕业致辞','节目演出','毕业生互动','合影散场'],['舞台','音响','投影','毕业纪念品'],'节目超时与舞台安全','preset-music-festival'],
 ['major-sports','大型体育赛事','sports-match','sports','赛制、裁判和结果必须可复核',2000,180000,'stadium',['检录分组','规则宣读','分场比赛','成绩复核','颁奖退场'],['计分系统','检录牌','裁判用具','医疗点'],'赛程冲突与运动损伤','preset-sports-match'],
];

const small:Seed[] = [
 ['boardgame','桌游局','social-party','community','轻松组局，玩得尽兴',16,600,'indoor-small',['确认游戏和人数','分组讲规则','轮换桌游','复盘收纳'],['桌游','桌椅','计分纸','饮用水'],'游戏人数与规则不匹配','preset-community-festival',['朋友聚会','桌游']],
 ['mahjong','麻将体验局','social-party','community','新手也能安心入门',12,500,'indoor-small',['确认人数与桌数','讲解规则','分桌体验','收牌交流'],['麻将牌','桌椅','计分纸','饮用水'],'桌数不足或规则争议','preset-community-festival'],
 ['werewolf','狼人杀派对','social-party','community','用主持节奏带起推理气氛',15,450,'indoor-small',['角色与规则说明','分发身份','多轮推理','讨论复盘'],['角色卡','计时器','座椅','饮用水'],'游戏时长失控','preset-community-festival'],
 ['murder-mystery','剧本杀','social-party','community','选对剧本，让每个人都参与',8,700,'indoor-small',['确认剧本与角色','阅读线索','分幕讨论','真相复盘'],['剧本','线索卡','桌椅','场景道具'],'内容不适合参与者','preset-community-festival'],
 ['escape-room','密室逃脱组局','social-party','community','预约、集合、解谜一气呵成',8,900,'indoor-small',['预约与集合','安全说明','团队解谜','结束复盘'],['预约凭证','联络方式','饮用水','安全须知'],'场地安全与迟到','preset-community-festival'],
 ['movie-night','电影之夜','social-party','community','一部好片和一场好讨论',20,800,'indoor-small',['选片和授权核对','布置放映','观影','映后交流'],['放映设备','音响','座椅','零食'],'播放授权与设备故障','preset-music-festival',['朋友聚会','电影']],
 ['karaoke','K歌聚会','social-party','community','轮流点歌，人人有机会开唱',12,1000,'indoor-small',['预约包厢','点歌顺序','合唱互动','结算离场'],['话筒','音响','点歌设备','饮水'],'音量扰邻与时间超时','preset-music-festival'],
 ['hotpot','火锅聚会','social-party','community','把口味和食材安排妥当',14,1200,'indoor-small',['确认忌口','食材采购','用餐交流','清洁结算'],['锅具','食材','餐具','饮品'],'食物过敏与用电安全','preset-community-festival'],
 ['birthday','生日派对','social-party','community','让主角有属于自己的时刻',25,1800,'indoor-small',['嘉宾邀请','现场布置','游戏互动','蛋糕祝福','合影散场'],['蛋糕','装饰','音响','餐具'],'食物过敏与时间冲突','preset-annual'],
 ['costume','主题换装派对','social-party','community','用一个主题打开陌生人的话题',30,1600,'indoor-small',['公布主题','换装签到','展示互动','投票合影'],['服装提示','镜子','拍照区','投票卡'],'服装要求造成参与门槛','preset-annual'],
 ['gift-swap','朋友交换礼物','social-party','community','事先定规则，交换更有惊喜',20,700,'indoor-small',['约定预算','礼物签到','抽签交换','分享合影'],['礼物标签','抽签纸','包装袋','桌椅'],'礼物价值差异争议','preset-annual'],
 ['picnic','公园野餐','social-trip','community','轻装出行，留出聊天时间',20,900,'outdoor',['查看天气','集合入园','野餐互动','清洁离场'],['野餐垫','食品','垃圾袋','防晒用品'],'天气与食品保存','preset-green'],
 ['camping','露营','social-trip','community','出行、装备和天气提前核对',18,2600,'outdoor',['确认营地与交通','装备检查','搭帐篷','营地活动','熄火离营'],['帐篷','照明','饮水','急救包'],'天气、用火与夜间安全','preset-green',['户外','露营']],
 ['hiking','徒步','sports-outdoor','sports','按体能选路线，结伴完成',20,1000,'outdoor',['路线与天气确认','集合热身','分段徒步','补给休息','清点返程'],['路线图','饮水','急救包','反光用品'],'迷路、失温或扭伤','preset-sports-match'],
 ['city-walk','城市漫步','social-trip','community','沿一条路线重新认识城市',15,500,'outdoor',['选定路线','集合说明','街区漫步','主题分享','返程确认'],['路线图','饮水','联络群','垃圾袋'],'交通穿行与走散','preset-community-festival'],
 ['cycling','骑行','sports-outdoor','sports','路线和安全优先于速度',20,1400,'outdoor',['检查车辆','安全说明','分组骑行','途中补给','清点返程'],['头盔','反光衣','修车工具','饮水'],'道路交通与车辆故障','preset-sports-match'],
 ['sunset-photo','日落摄影','social-trip','community','踩准日落时间，分享拍摄心得',12,500,'outdoor',['踩点与天气','器材检查','日落拍摄','作品交流'],['相机或手机','备用电源','三脚架','手电'],'天黑返程与天气变化','preset-green'],
 ['frisbee','飞盘活动','sports-match','sports','轻规则、重配合的户外运动',24,900,'outdoor',['场地检查','规则热身','分队比赛','拉伸复盘'],['飞盘','标志桶','饮水','急救包'],'碰撞与运动损伤','preset-sports-match'],
 ['fun-games','趣味运动会','sports-meet','sports','小比赛也要有清楚的赛制',40,1800,'stadium',['报名分组','规则说明','趣味项目','计分颁奖'],['项目道具','计分表','饮水','急救包'],'项目冲突与运动损伤','preset-sports-match'],
 ['badminton','羽毛球友谊赛','sports-match','sports','分组、轮场和计分都清楚',24,1200,'stadium',['预约场地','抽签分组','循环比赛','成绩核对','合影'],['球拍','羽毛球','计分表','饮水'],'场地冲突与扭伤','preset-sports-match'],
 ['diy','DIY手工活动','education-workshop','campus-education','带着一件亲手完成的作品离开',18,1200,'indoor-small',['材料分发','安全示范','动手制作','作品展示','清洁'],['材料包','工具','桌垫','垃圾袋'],'工具使用与材料不足','preset-science'],
 ['pottery','陶艺体验','education-workshop','campus-education','泥土与手感带来慢节奏体验',15,1800,'indoor-small',['材料和围裙','拉坯示范','制作体验','作品标记','清洁'],['陶土','拉坯机','围裙','作品标签'],'设备和湿滑地面','preset-science'],
 ['aroma','香薰制作','education-workshop','campus-education','选择香味，做一份自己的作品',16,1500,'indoor-small',['香料说明','配比示范','制作灌装','标记分享'],['香料','容器','量杯','手套'],'过敏与热蜡烫伤','preset-science'],
 ['succulent','多肉植物微景观制作','education-workshop','campus-education','把小生态装进容器',20,1300,'indoor-small',['植物知识','材料分发','组合种植','养护分享'],['多肉植物','营养土','容器','小铲'],'土壤卫生与材料损耗','preset-science'],
 ['jewelry','手工饰品制作','education-workshop','campus-education','从设计到成品的轻手作',18,1000,'indoor-small',['样式展示','材料分发','制作','作品分享'],['串珠','线材','剪钳','收纳盒'],'小零件误吞与工具划伤','preset-science'],
 ['painting','绘画聚会','education-workshop','campus-education','放下技巧压力，一起画画',20,1100,'indoor-small',['主题介绍','材料准备','自由绘画','作品交流'],['画纸','画笔','颜料','桌垫'],'颜料过敏与桌面清洁','preset-science'],
 ['secondhand','旧物交换活动','charity-green','charity','让闲置物找到下一个使用者',30,500,'indoor-small',['物品登记','分类展示','自由交换','剩余物处理'],['分类标签','桌椅','登记表','纸袋'],'物品状况与交换争议','preset-green'],
 ['book-club','读书会','academic-salon','conference','把一本书聊出新问题',15,400,'indoor-small',['选书与预读','观点分享','主题讨论','推荐下一本'],['书籍','摘录卡','白板','饮水'],'讨论被少数人占据','preset-lecture'],
 ['music-share','音乐分享会','arts-culture','culture','用歌单交换故事',20,600,'indoor-small',['征集歌单','轮流播放','故事分享','合辑整理'],['音响','播放设备','歌单','座椅'],'播放版权与设备连接','preset-music-festival'],
 ['guess-song','音乐猜歌挑战','social-party','community','在熟悉的旋律里轻松破冰',20,500,'indoor-small',['曲库准备','规则分组','多轮猜歌','计分颁奖'],['音响','曲目清单','计分表','小礼品'],'曲库偏差与版权','preset-music-festival'],
 ['quiz','趣味知识问答','academic-contest','tech','把知识变成团队游戏',25,700,'indoor-small',['题库核对','规则分组','抢答挑战','成绩复核'],['题卡','计时器','计分表','小礼品'],'题目争议与计分错误','preset-lecture'],
 ['coffee','咖啡品鉴','social-party','community','从香气到风味的感官交流',14,1100,'indoor-small',['风味介绍','冲泡示范','盲品记录','交流收尾'],['咖啡豆','滤杯','热水','品鉴卡'],'热水烫伤与咖啡因不适','preset-community-festival'],
 ['food-share','美食分享会','social-party','community','每个人带一道故事上桌',25,1200,'indoor-small',['菜品登记','摆台说明','品尝交流','清洁打包'],['餐具','菜品标签','饮水','垃圾袋'],'食物过敏与保存温度','preset-community-festival'],
 ['photo-talk','摄影交流会','academic-salon','conference','看作品，也聊拍摄选择',16,500,'indoor-small',['作品征集','轮流展示','主题讨论','交流总结'],['投影','作品文件','座椅','饮水'],'未经授权展示他人作品','preset-science'],
 ['skill-swap','技能交换活动','education-workshop','campus-education','每个人教一点，也学一点',24,800,'indoor-small',['技能登记','分组配对','轮换教学','成果分享'],['技能卡','白板','桌椅','计时器'],'技能水平与需求不匹配','preset-community-festival'],
 ['choir','一日合唱团','arts-performance','culture','零基础也能一起唱完一首歌',30,1200,'indoor-small',['分声部','热身练习','分段排练','合唱录制'],['歌词','音响','话筒','饮水'],'嗓音疲劳与场地噪音','preset-music-festival'],
 ['interest-meetup','线下兴趣交友活动','social-party','community','用共同爱好开启对话',25,900,'indoor-small',['报名兴趣筛选','破冰介绍','主题分组','自由交流'],['姓名贴','兴趣卡','桌椅','饮水'],'隐私与社交边界','preset-community-festival'],
];

function build(seed:Seed, scaleType:'large'|'small'):ScenarioPreset {
 const [id,name,categoryId,group,tagline,people,budget,venue,steps,materials,risk,imagePresetId,keywords]=seed;
 const host=scaleType==='small'?'组织者':'总协调',support=scaleType==='small'?'现场协助':'现场执行组';
 return {id:`preset-${id}`,name,categoryId,group,tagline,intro:`${name}：${tagline}。先确认参与者需求与场地条件，再按“${steps.join('、')}”推进。重点提前处理${risk}，具体人数与开支由组织者确认。`,audience:scaleType==='small'?'朋友与兴趣参与者':'报名参与者、组织团队及相关嘉宾',goal:`${tagline}，让参与者有明确收获`,people,budget,duration:scaleType==='small'?150:360,venue,scaleType,complexity:scaleType==='small'?'轻量':'专业',professionalLevel:scaleType==='small'?'低':'高',peopleRange:scaleType==='small'?[Math.max(4,Math.floor(people/2)),Math.max(people+10,people*2)]:[Math.floor(people/2),people*2],planningMode:scaleType==='small'?'light':'full',keywords,imagePresetId,
 flow:steps.map((step,index)=>({name:step,share:1/steps.length,detail:index===0?'开始前确认人数、场地和必要条件。':index===steps.length-1?'结束后清点人员、物资并收集反馈。':`按“${step}”的实际规则与资源执行，记录需要调整的事项。`})),
 roles:[{role:host,fixed:1,perPeople:0,min:1,max:2,duty:'统筹时间、场地与现场沟通'},{role:support,fixed:scaleType==='small'?0:2,perPeople:scaleType==='small'?12:80,min:scaleType==='small'?0:2,max:scaleType==='small'?4:30,duty:'签到、物资和流程协助'},...(scaleType==='large'?[{role:'安全与后勤',fixed:2,perPeople:150,min:2,max:20,duty:`关注${risk}并保障物资`},{role:'技术与记录',fixed:2,perPeople:200,min:2,max:15,duty:'保障设备、记录流程和异常'}]:[])],materials:scaleType==='large'?[...materials,'现场指示牌','备用物资','应急联络表']:materials,
 budgetLines:scaleType==='large'?[{category:'场地',item:'场地使用与布置',ratio:.2,note:'按实际报价确认'},{category:'设备',item:materials.slice(0,2).join('、'),ratio:.2,note:'优先复用'},{category:'物资',item:materials.slice(2).join('、'),ratio:.25,note:'按人数核实'},{category:'人员',item:'现场保障',ratio:.15,note:''},{category:'通知',item:'参与者联络',ratio:.08,note:''},{category:'机动',item:'风险与临时调整',ratio:.12,note:''}]:[{category:'场地与设备',item:materials.slice(0,2).join('、'),ratio:.3,note:'已有资源可复用'},{category:'活动物资',item:materials.slice(2).join('、'),ratio:.45,note:'按实际人数采购'},{category:'机动费用',item:'临时补充与调整',ratio:.25,note:'未使用无需支出'}],
 risks:[{title:risk,cause:'场地、人员或条件变化',likelihood:2 as const,impact:scaleType==='small'?2 as const:3 as const,mitigation:'活动前确认条件并准备替代方案',contingency:'暂停相关环节，组织者核实后调整',owner:host},...(scaleType==='large'?[{title:'入场与离场拥堵',cause:'人流集中',likelihood:2 as const,impact:3 as const,mitigation:'分区引导并留出通道',contingency:'分批放行并调配现场人员',owner:'安全与后勤'},{title:'流程超时',cause:'环节衔接不顺',likelihood:2 as const,impact:2 as const,mitigation:'设置计时与备用环节',contingency:'压缩非核心环节并通知参与者',owner:host}]:[])],highlights:steps.slice(1,3)};
}

export const EXTRA_PRESETS:ScenarioPreset[]=[...large.map(seed=>build(seed,'large')),...small.map(seed=>build(seed,'small'))];
