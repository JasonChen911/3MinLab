import {useEffect,useRef,useState} from 'react';
type Decision={message:string;input:boolean;initial:string;allowEmpty:boolean};
/** App-owned dialog works in embedded browsers that suppress native prompts. */
export function useDecision(){
 const [decision,setDecision]=useState<Decision|null>(null),[value,setValue]=useState('');
 const resolver=useRef<((answer:string|boolean)=>void)|null>(null);const focus=useRef<HTMLInputElement|null>(null);const panel=useRef<HTMLElement|null>(null);
 function finish(answer:string|boolean){resolver.current?.(answer);resolver.current=null;setDecision(null);}
 useEffect(()=>{if(!decision)return;const previous=document.activeElement as HTMLElement|null;if(decision.input)focus.current?.focus();else panel.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>previous?.focus();},[decision]);
 useEffect(()=>()=>{resolver.current?.(false);},[]);
 function ask(message:string,input=false,initial='',allowEmpty=false):Promise<string|boolean>{resolver.current?.(false);setValue(initial);setDecision({message,input,initial,allowEmpty});return new Promise(resolve=>{resolver.current=resolve;});}
 const dialog=decision?<div className="confirm-backdrop" onKeyDown={e=>{if(e.key==='Escape')finish(false);if(e.key==='Tab'){const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input')??[]);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><section ref={panel} className="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认操作"><h2>{decision.input?'填写信息':'请确认'}</h2><p>{decision.message}</p>{decision.input&&<input ref={focus} aria-label="确认输入" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(value.trim()||decision.allowEmpty))finish(value);}} style={{width:'100%',padding:12,marginBottom:16,boxSizing:'border-box'}}/>}<div className="confirm-actions"><button onClick={()=>finish(false)}>取消</button><button className="primary" disabled={decision.input&&!decision.allowEmpty&&!value.trim()} onClick={()=>finish(decision.input?value:true)}>确认</button></div></section></div>:null;
 return {ask,dialog};
}
