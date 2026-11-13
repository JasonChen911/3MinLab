import {bounds,type Item} from './game';
import {pathBlockedCells} from './world/collision';
export type Point={x:number;z:number};
const key=(x:number,z:number)=>`${x},${z}`;

export type RouteOptions={snap?:boolean};

/** Nearest free grid cell to a point that sits inside its own facility collider. */
function snapOpen(point:Point,blocked:Set<string>,half:number,maxRadius=8):Point|null{
 if(!blocked.has(key(point.x,point.z)))return point;
 for(let radius=1;radius<=maxRadius;radius++){
  let best:Point|null=null,bestDistance=Infinity;
  for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
   if(Math.max(Math.abs(dx),Math.abs(dz))!==radius)continue;
   const x=point.x+dx,z=point.z+dz;
   if(Math.abs(x)>half||Math.abs(z)>half||blocked.has(key(x,z)))continue;
   const distance=dx*dx+dz*dz;
   if(distance<bestDistance||distance===bestDistance&&best&&(x<best.x||x===best.x&&z<best.z)){best={x,z};bestDistance=distance;}
  }
  if(best)return best;
 }
 return null;
}

/** Weighted grid route: roads are preferred, shared collider data blocks passage. */
export function route(items:Item[],size:number,from:Point,to:Point,options:RouteOptions={}):Point[]{
 const half=Math.floor(size/2),blocked=pathBlockedCells(items,half),roads=new Map<string,number>();
 for(const item of items){const b=bounds(item),road=item.kind==='road'||item.kind==='path';if(!road)continue;
  for(let x=Math.ceil(item.x-b.w/2);x<=Math.floor(item.x+b.w/2);x++)for(let z=Math.ceil(item.z-b.d/2);z<=Math.floor(item.z+b.d/2);z++){
   roads.set(key(x,z),item.kind==='road'?.55:.72);
  }
 }
 let start={x:Math.round(from.x),z:Math.round(from.z)},goal={x:Math.round(to.x),z:Math.round(to.z)};
 if(options.snap){start=snapOpen(start,blocked,half)??start;goal=snapOpen(goal,blocked,half)??goal;}
 blocked.delete(key(start.x,start.z));blocked.delete(key(goal.x,goal.z));
 const open=[start],score=new Map([[key(start.x,start.z),0]]),parents=new Map<string,string>(),visited=new Set<string>();
 for(let loops=0;open.length&&loops<20000;loops++){
  open.sort((a,b)=>(score.get(key(a.x,a.z))??Infinity)+.5*(Math.abs(goal.x-a.x)+Math.abs(goal.z-a.z))-(score.get(key(b.x,b.z))??Infinity)-.5*(Math.abs(goal.x-b.x)+Math.abs(goal.z-b.z)));
  const at=open.shift()!,current=key(at.x,at.z);if(visited.has(current))continue;visited.add(current);
  if(at.x===goal.x&&at.z===goal.z){const result:Point[]=[];let cursor=current;while(cursor){const [x,z]=cursor.split(',').map(Number);result.unshift({x,z});cursor=parents.get(cursor)||'';}return result;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=at.x+dx,z=at.z+dz,k=key(x,z);if(Math.abs(x)>half||Math.abs(z)>half||blocked.has(k))continue;const next=(score.get(current)??0)+(roads.get(k)??1);if(next<(score.get(k)??Infinity)){score.set(k,next);parents.set(k,current);open.push({x,z});}}
 }
 return [];
}
