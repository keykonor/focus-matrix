import { useState } from 'react';
import { quadrantNames, type AppSettings, type QuadrantType, type Task } from '../types';
import { TaskItem } from './TaskItem';
import type {EditMark} from '../../cloud-site/lib/syncModel';

interface Props {
  quadrant: QuadrantType;
  marks?:Record<string,EditMark>;
  tasks: Task[];
  focusId: string | null;
  fontSize: AppSettings['fontSize'];
  onAdd: (quadrant: QuadrantType, afterId?: string) => void;
  onChange: (id: string, patch: Partial<Pick<Task, 'text' | 'completed'>>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, quadrant: QuadrantType) => void;
}

export function Quadrant({ quadrant, marks, tasks, focusId, fontSize, onAdd, onChange, onDelete, onMove }: Props) {
  const [dragOver, setDragOver] = useState(false);
  return <section className={`quadrant quadrant-${quadrant}${dragOver ? ' drag-over' : ''}`}
    onClick={(event) => { if (event.target === event.currentTarget) onAdd(quadrant); }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes('text/task-id')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
    onDrop={(event) => { event.preventDefault(); setDragOver(false); const id = event.dataTransfer.getData('text/task-id'); if (id) onMove(id, quadrant); }}>
    <div className="quadrant-heading"><h2>{quadrantNames[quadrant]}</h2></div>
    <div className="task-list">{tasks.map((task) => <TaskItem key={task.id} task={task} mark={marks?.[task.id]} focus={focusId === task.id} fontSize={fontSize} onChange={onChange} onDelete={onDelete} onEnter={onAdd} />)}</div>
    <button className="add-task" type="button" onClick={() => onAdd(quadrant)}>＋ <span>添加任务</span></button>
    {tasks.length === 0 && <div className="empty-hint" onClick={() => onAdd(quadrant)}>点击这里，记下第一件事</div>}
  </section>;
}
