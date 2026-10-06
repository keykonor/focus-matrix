import {changedText,type EditMark} from '../../lib/syncModel';
export function EditAnnotation({mark}:{mark?:EditMark}){
 if(!mark)return null;const parts=changedText(mark.beforeText,mark.afterText);
 return <details className="edit-annotation"><summary>{mark.actor} · {new Date(mark.at).toLocaleString('zh-CN')} · {mark.conflict?'同时修改已保留':mark.fields.includes('deleted')?'删除':'已编辑'}</summary><p className="edit-fields">{mark.fields.join(' / ')}</p>{mark.beforeText!==mark.afterText&&<><p className="edit-before">修改前：{mark.beforeText||'（空）'}</p><p className="edit-after">修改后：{parts[0]}<mark>{parts[1]}</mark>{parts[2]}{!mark.afterText?'（已清空）':''}</p></>}</details>;
}
