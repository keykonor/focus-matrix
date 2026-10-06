export const syncQuadrants = ['important-not-urgent','important-urgent','not-important-not-urgent','urgent-not-important'] as const;
export type SyncQuadrant = typeof syncQuadrants[number];
export interface SyncTask {id:string;text:string;completed:boolean;createdAt:string;updatedAt:string;quadrant:SyncQuadrant;}
export interface SyncMemo {morning:string;afternoon:string;evening:string;updatedAt:string;}
export interface SyncContent {tasks:SyncTask[];dailyMemos:Record<string,SyncMemo>;}
export interface EditMark {entity:string;actor:string;source:'desktop'|'mobile'|'share';at:number;fields:string[];beforeText:string;afterText:string;conflict?:boolean;}
export interface SyncSnapshot {content:SyncContent;revision:number;updatedAt:number;marks:Record<string,EditMark>;}
export const emptyContent = ():SyncContent=>({tasks:[],dailyMemos:{}});
export function same(a:unknown,b:unknown):boolean {
 if(a===b)return true;if(a==null||b==null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>same(value,b[index]));
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(key=>key in right&&same(left[key],right[key]));
}
function stableId(value:unknown){let a=2166136261,b=3339675911;for(const char of JSON.stringify(value)){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b^char.charCodeAt(0),2246822519);}return `conflict-${(a>>>0).toString(16)}${(b>>>0).toString(16)}`;}
const taskFields=['text','completed','quadrant'] as const;
const periods=['morning','afternoon','evening'] as const;
const taskSame=(a:SyncTask,b:SyncTask)=>taskFields.every(field=>a[field]===b[field]);
export function mergeContent(base:SyncContent,local:SyncContent,remote:SyncContent):{content:SyncContent;conflictIds:string[]} {
 const original=new Map(base.tasks.map(task=>[task.id,task])),edited=new Map(local.tasks.map(task=>[task.id,task])),current=new Map(remote.tasks.map(task=>[task.id,task]));
 const result=new Map<string,SyncTask>(),conflictIds:string[]=[];
 const preserve=(task:SyncTask)=>{const copy={...task,id:stableId(task)};result.set(copy.id,copy);conflictIds.push(copy.id);};
 for(const id of new Set([...current.keys(),...edited.keys(),...original.keys()])){
  const previous=original.get(id),mine=edited.get(id),theirs=current.get(id);
  if(!previous){if(mine&&theirs){if(taskSame(mine,theirs))result.set(id,theirs);else{result.set(id,theirs);preserve(mine);}}else if(mine||theirs)result.set(id,(mine??theirs)!);continue;}
  if(!mine&&!theirs)continue;
  if(!mine){if(theirs&&!taskSame(previous,theirs)){result.set(id,theirs);conflictIds.push(id);}continue;}
  if(!theirs){if(!taskSame(previous,mine))preserve(mine);continue;}
  const merged={...theirs};let conflict=false,localChanged=false;
  for(const field of taskFields){if(mine[field]===previous[field]||mine[field]===theirs[field])continue;if(theirs[field]!==previous[field]){conflict=true;continue;}Object.assign(merged,{[field]:mine[field]});localChanged=true;}
  if(localChanged)merged.updatedAt=mine.updatedAt;result.set(id,merged);if(conflict)preserve(mine);
 }
 const order=remote.tasks.map(task=>task.id).filter(id=>result.has(id));
 for(let index=0;index<local.tasks.length;index++){const id=local.tasks[index].id;if(!result.has(id)||order.includes(id))continue;let position=-1;for(let before=index-1;before>=0;before--){position=order.indexOf(local.tasks[before].id);if(position>=0)break;}order.splice(position>=0?position+1:order.length,0,id);}
 for(const id of result.keys())if(!order.includes(id))order.push(id);
 const memos:Record<string,SyncMemo>={};
 for(const date of new Set([...Object.keys(remote.dailyMemos),...Object.keys(local.dailyMemos),...Object.keys(base.dailyMemos)])){
  const previous=base.dailyMemos[date],mine=local.dailyMemos[date],theirs=remote.dailyMemos[date];
  if(!mine&&!theirs)continue;
  const memo:SyncMemo={morning:'',afternoon:'',evening:'',updatedAt:theirs?.updatedAt??mine?.updatedAt??''};
  for(const period of periods){const old=previous?.[period]??'',left=mine?.[period]??'',right=theirs?.[period]??'';
   if(left===old||left===right)memo[period]=right;else if(right===old){memo[period]=left;memo.updatedAt=mine?.updatedAt??memo.updatedAt;}else{memo[period]=`${right}\n\n—— 同时修改，已保留两份 ——\n${left}`;conflictIds.push(`memo:${date}:${period}`);}
  }
  if(periods.some(period=>memo[period])||mine||theirs)memos[date]=memo;
 }
 return {content:{tasks:order.map(id=>result.get(id)!),dailyMemos:memos},conflictIds};
}
export function contentChanges(before:SyncContent,after:SyncContent,actor:string,source:EditMark['source'],at:number,conflicts:string[]=[]):EditMark[]{
 const marks:EditMark[]=[];const old=new Map(before.tasks.map(task=>[task.id,task])),next=new Map(after.tasks.map(task=>[task.id,task]));
 for(const id of new Set([...old.keys(),...next.keys()])){const previous=old.get(id),current=next.get(id);const fields=!previous?['created']:!current?['deleted']:taskFields.filter(field=>previous[field]!==current[field]);if(fields.length)marks.push({entity:id,actor,source,at,fields,beforeText:previous?.text??'',afterText:current?.text??'',...(conflicts.includes(id)?{conflict:true}:{})});}
 for(const date of new Set([...Object.keys(before.dailyMemos),...Object.keys(after.dailyMemos)]))for(const period of periods){const left=before.dailyMemos[date]?.[period]??'',right=after.dailyMemos[date]?.[period]??'';if(left!==right){const entity=`memo:${date}:${period}`;marks.push({entity,actor,source,at,fields:[period],beforeText:left,afterText:right,...(conflicts.includes(entity)?{conflict:true}:{})});}}
 return marks;
}
export function changedText(before:string,after:string):[string,string,string]{let start=0,end=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;return [after.slice(0,start),after.slice(start,end?after.length-end:undefined),end?after.slice(-end):''];}
