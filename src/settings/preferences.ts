export const defaults={theme:'green',font:'normal',background:'original',overlay:0,animation:true,speed:1,hints:true,onboarding:true,reminders:true};
export type Preferences=typeof defaults;
const key='3minlab-preferences-v1';
export function loadPreferences():Preferences{try{return {...defaults,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return {...defaults};}}
export function applyPreferences(p:Preferences){const root=document.documentElement;root.dataset.theme=p.theme;root.dataset.font=p.font;root.dataset.background=p.background;root.dataset.animation=String(p.animation);root.dataset.hints=String(p.hints);root.style.setProperty('--preference-overlay',String(p.overlay/100));}
export function savePreferences(p:Preferences){localStorage.setItem(key,JSON.stringify(p));applyPreferences(p);window.dispatchEvent(new Event('preferences-change'));}
