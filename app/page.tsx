'use client';
import {useEffect,useState} from 'react';
import {quadrantIds,responseSchema,type PlanContent} from '@/lib/plans';
const names=['重要不紧急','重要紧急','不重要不紧急','紧急不重要'];
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export default function Plans(){
 const [data,setData]=useState<{content:PlanContent;updatedAt:number}|null>(null);
 const [message,setMessage]=useState('正在读取分享链接…'); const [date,setDate]=useState(localDate); const [section,setSection]=useState<'matrix'|'calendar'>('matrix');
 useEffect(()=>{
  let stopped=false;const token=window.location.hash.slice(1);
  if(!/^[a-f0-9]{64}$/.test(token)){setMessage('请使用桌面软件提供的完整分享链接。');return;}
  const refresh=async()=>{if(document.hidden)return;try {const res=await fetch('/api/plan',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!res.ok){if(res.status===404){setData(null);setMessage('链接无效，或分享已关闭。');}else setMessage('暂时无法更新，请稍后重试。');return;}const next=responseSchema.parse(await res.json());if(!stopped){setData(next);setMessage('');}}catch{if(!stopped)setMessage('网络连接中断，正在显示上一次读取的内容。');}};
  void refresh();const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 const memo=data?.content.dailyMemos[date];
 return <div className="site"><header><div className="wordmark">Focus Matrix <span>计划分享</span></div>{data&&<nav><button className={section==='matrix'?'active':''} onClick={()=>setSection('matrix')}>四象限</button><button className={section==='calendar'?'active':''} onClick={()=>setSection('calendar')}>日期备忘录</button></nav>}</header>
 {message&&<p className={data?'notice':'empty'} role="status">{message}</p>}
 {data&&<>{section==='matrix'?<main className="matrix">{quadrantIds.map((id,index)=><section key={id} className={`quadrant q${index}`}><h1>{names[index]}</h1><ul>{data.content.tasks.filter(task=>task.quadrant===id).map(task=><li className={task.completed?'completed':''} key={task.id}><span className="check" aria-label={task.completed?'已完成':'待完成'}>{task.completed?'✓':''}</span><span>{task.text||'未填写任务'}</span></li>)}</ul>{!data.content.tasks.some(task=>task.quadrant===id)&&<p className="quiet">暂无任务</p>}</section>)}</main>:<main className="calendar"><div className="date-heading"><h1>日期备忘录</h1><input aria-label="查看日期" type="date" value={date} onChange={event=>setDate(event.target.value)}/><button onClick={()=>setDate(localDate())}>今天</button></div><div className="periods">{(['morning','afternoon','evening'] as const).map((period,index)=><section key={period}><h2>{['早上','下午','晚上'][index]}</h2><p>{memo?.[period]||'暂无备忘录'}</p></section>)}</div><details><summary>有备忘录的日期</summary><div className="dates">{Object.keys(data.content.dailyMemos).sort().reverse().map(day=><button key={day} onClick={()=>setDate(day)}>{day}</button>)}</div></details></main>}<footer><span>只读分享 · {data.content.tasks.filter(t=>!t.completed).length} 项待办</span><span>最后同步 {new Date(data.updatedAt).toLocaleString('zh-CN')} · 每 30 秒更新</span></footer></>}
 </div>;
}
