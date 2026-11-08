import type {FacilityParameters, Kind} from './game';

const key = '3minlab:facility-parameter-library:v1';
export interface ParameterPreset {id:string; name:string; kind:Kind; parameters:FacilityParameters; savedAt:string}

export function loadParameterLibrary():ParameterPreset[] {
  try {
    const value=JSON.parse(localStorage.getItem(key)??'[]');
    return Array.isArray(value)?value.filter((entry):entry is ParameterPreset=>!!entry&&typeof entry.id==='string'&&typeof entry.name==='string'&&typeof entry.kind==='string'&&entry.parameters&&typeof entry.parameters==='object').slice(0,200):[];
  } catch {return [];}
}
export function saveParameterLibrary(entries:ParameterPreset[]):void {
  localStorage.setItem(key,JSON.stringify(entries.slice(0,200)));
}
export function upsertParameterPreset(entries:ParameterPreset[],preset:ParameterPreset):ParameterPreset[] {
  const remaining=entries.filter(entry=>entry.id!==preset.id);
  return [preset,...remaining].slice(0,200);
}
