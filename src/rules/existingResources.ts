import type {EventBrief} from '../types';

export type AvailableResource='venue'|'equipment'|'staff';
const proof='已有|现有|自有|免费|无偿|提供|借用|赞助|无需(?:租赁|采购|付费)|不收(?:场地费|租金)';
const resourceTerms:Record<AvailableResource,string>={venue:'场地|操场|礼堂|教室|会议室|体育馆|活动室',equipment:'设备|器材|音响|投影|计时器|桌椅',staff:'工作人员|志愿者|裁判|主持人|医护人员'};
/** Only a nearby explicit availability statement can remove a cash cost. */
export function existingResources(brief:Pick<EventBrief,'idea'|'constraints'|'venueNote'> & {aiDraft?:EventBrief['aiDraft']}):Set<AvailableResource>{
 const text=[brief.idea,brief.constraints,brief.venueNote,...(brief.aiDraft?.conversation??[]).map(turn=>turn.answer),...Object.values(brief.aiDraft?.stageAnswers??{}).flat().map(turn=>turn.answer)].filter(Boolean).join('。');
 const result=new Set<AvailableResource>();
 for(const [resource,terms] of Object.entries(resourceTerms) as [AvailableResource,string][]){
  const nearby=new RegExp(`(?:${terms})[^。；;\n]{0,16}(?:${proof})|(?:${proof})[^。；;\n]{0,16}(?:${terms})`);
  if(nearby.test(text))result.add(resource);
 }
 return result;
}
