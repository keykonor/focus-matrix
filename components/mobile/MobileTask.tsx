import {useEffect,useLayoutEffect,useRef} from 'react';
import type {SyncTask,EditMark} from '../../lib/syncModel';
import {EditAnnotation} from './EditAnnotation';
export const names=['重要不紧急','重要紧急','不重要不紧急','紧急不重要'];
export const ids=['important-not-urgent','important-urgent','not-important-not-urgent','urgent-not-important'] as const;
export function AutoText({value,onChange,label,disabled=false,focus=false}:{value:string;onChange:(value:string)=>void;label:string;disabled?:boolean;focus?:boolean}){
 const ref=useRef<HTMLTextAreaElement>(null);useLayoutEffect(()=>{const el=ref.current;if(!el)return;const resize=()=>{el.style.height='auto';el.style.height=`${el.scrollHeight}px`;};resize();let width=el.clientWidth;const observer=new ResizeObserver(()=>{if(width!==el.clientWidth){width=el.clientWidth;resize();}});observer.observe(el);return()=>observer.disconnect();},[value]);useEffect(()=>{if(focus)ref.current?.focus();},[focus]);
 return <textarea ref={ref} rows={1} aria-label={label} placeholder={label} value={value} readOnly={disabled} onChange={event=>onChange(event.target.value)}/>;
}
export function MobileTask({task,mark,editable,focus,onChange,onDelete}:{task:SyncTask;mark?:EditMark;editable:boolean;focus:boolean;onChange:(patch:Partial<SyncTask>)=>void;onDelete:()=>void}){
 return <article className={`mobile-task${task.completed?' complete':''}`} data-task-id={task.id}><div className="task-line"><input type="checkbox" aria-label="完成任务" checked={task.completed} disabled={!editable} onChange={event=>onChange({completed:event.target.checked})}/><AutoText value={task.text} label="任务内容" disabled={!editable} focus={focus} onChange={text=>onChange({text})}/>{editable&&<button className="remove" aria-label="删除任务" onClick={onDelete}>×</button>}</div>{editable&&<select className="move-task" aria-label="移动任务到象限" value={task.quadrant} onChange={event=>onChange({quadrant:event.target.value as SyncTask['quadrant']})}>{ids.map((id,i)=><option key={id} value={id}>{names[i]}</option>)}</select>}<EditAnnotation mark={mark}/></article>;
}

