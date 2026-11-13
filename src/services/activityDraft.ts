import { CATEGORIES, getCategory } from '../data/taxonomy';
import { createBrief, refreshBrief } from '../rules/intake';
import { recommendPlanningMode } from '../planning/mode';
import type { BriefFieldKey, EventBrief, PlanningMode, VenueKind } from '../types';
import { aiRequest } from './AIService';

export interface ActivityDraft {
  title: string; categoryId: string; planningMode: PlanningMode; people: number | null;
  budget: number | null; durationMinutes: number | null; date: string; venue: VenueKind | '';
  audience: string; goal: string; features: string[]; flow: string[]; staff: string[];
  materials: string[]; confirmedFields: string[]; questions: string[];
  conversation?: ActivityTurn[];
}
export interface ActivityTurn {question:string;answer:string}

export function requestActivityDraft(idea: string, signal?: AbortSignal) {
  return aiRequest<ActivityDraft>('/api/ai/activity-draft', { idea, categories: CATEGORIES.map(c => ({ id: c.id, label: c.label })) }, signal);
}

export function briefFromActivityDraft(idea: string, draft: ActivityDraft): EventBrief {
  const base=createBrief(idea),sources={...base.sources};
  // A later organizer answer can correct even a value explicitly stated in the first sentence.
  const revised=!!draft.conversation?.length;
  const offered=(key:BriefFieldKey)=>revised||base.sources[key]==='assumed';
  // The model may infer a value from context without the organizer stating it verbatim.
  // Such a value is still an AI result to review, not a generic fallback to re-ask.
  const mark=(key:BriefFieldKey,applied:boolean)=>{if(applied)sources[key]='inferred';};
  const validCategory=CATEGORIES.some(c=>c.id===draft.categoryId)?draft.categoryId:base.categoryId;
  const categoryId=offered('category')?validCategory:base.categoryId;
  mark('category',offered('category')&&validCategory!=='generic-event');
  const explicitPeople=idea.match(/(\d{1,6})\s*(?:人|名|位|个(?:朋友|同学|学生|嘉宾|伙伴))/);
  const people=explicitPeople&&!revised?Number(explicitPeople[1]):offered('people')&&draft.people!==null&&Number.isInteger(draft.people)&&draft.people>=1&&draft.people<=200000?draft.people:base.people;
  const budget=offered('budget')&&draft.budget!==null&&draft.budget>=0&&draft.budget<=100000000?draft.budget:base.budget;
  const durationMinutes=offered('duration')&&draft.durationMinutes!==null&&draft.durationMinutes>=15&&draft.durationMinutes<=720?draft.durationMinutes:base.durationMinutes;
  const venue=offered('venue')&&draft.venue?draft.venue:base.venue;
  const date=offered('date')&&/^\d{4}-\d{2}-\d{2}$/.test(draft.date)?draft.date:base.date;
  const audience=offered('audience')&&draft.audience?draft.audience:base.audience;
  const goal=offered('goal')&&draft.goal?draft.goal:base.goal;
  mark('people',offered('people')&&draft.people!==null&&Number.isInteger(draft.people)&&draft.people>=1&&draft.people<=200000);if(explicitPeople&&!revised)sources.people='inferred';
  mark('budget',offered('budget')&&draft.budget!==null&&draft.budget>=0&&draft.budget<=100000000);
  mark('duration',offered('duration')&&draft.durationMinutes!==null&&draft.durationMinutes>=15&&draft.durationMinutes<=720);
  mark('venue',offered('venue')&&!!draft.venue);mark('date',offered('date')&&/^\d{4}-\d{2}-\d{2}$/.test(draft.date));
  mark('audience',offered('audience')&&!!draft.audience);mark('goal',offered('goal')&&!!draft.goal);
  mark('title',!!draft.title);
  const next:EventBrief={...base,title:draft.title||base.title,categoryId,family:getCategory(categoryId).family,people,budget,durationMinutes,venue,date,audience,goal,sources,planningMode:draft.planningMode,aiDraft:{flow:draft.flow,staff:draft.staff,materials:draft.materials,features:draft.features,questions:draft.questions,conversation:draft.conversation}};
  if(!next.planningMode)next.planningMode=recommendPlanningMode(next);
  if(!next.title)next.sources.title='assumed';
  return refreshBrief(next);
}
