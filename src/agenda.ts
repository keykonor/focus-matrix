import { isDateKey, localDateKey } from './calendarModel';
import { chatEntryFingerprint, type ChatEntry } from './chatImport';
import type { MemoPeriod } from './types';

export interface CalendarEvent {
  id: string;
  date: string;
  period: MemoPeriod;
  startTime?: string;
  endTime?: string;
  deadline?: boolean;
  text: string;
  completed: boolean;
  completedDates?: string[];
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  batchId?: string;
  sourceText?: string;
  remindMinutes?: number;
  repeat?: 'none' | 'daily' | 'weekly';
}

export interface ImportBatch {
  id: string;
  createdAt: string;
  eventIds: string[];
  undoneAt?: string;
}

export interface ReminderReceipt {
  eventId: string;
  occurrenceDate: string;
  scheduledTime: string;
}

export interface AgendaData {
  events: CalendarEvent[];
  batches: ImportBatch[];
  receipts: ReminderReceipt[];
}

export type AgendaOccurrence = CalendarEvent & { occurrenceDate: string; isCompleted: boolean };

export interface AgendaImportEntry extends ChatEntry {
  description?: string;
  startTime?: string;
  endTime?: string;
  deadline?: boolean;
  sourceText?: string;
}

export const EMPTY_AGENDA: AgendaData = { events: [], batches: [], receipts: [] };

const periods: MemoPeriod[] = ['morning', 'afternoon', 'evening'];
const dayLength = 86_400_000;
const validTime = (value: unknown): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validDate = (value: unknown): value is string => typeof value === 'string' && isDateKey(value);
const validStamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  validDate(value.slice(0, 10)) && validTime(value.slice(11, 16)) && Number(value.slice(17, 19)) < 60;
const optional = (value: unknown, validate: (value: unknown) => boolean) => value === undefined || validate(value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueList(value: unknown, validate: (item: unknown) => boolean): value is string[] {
  return Array.isArray(value) && value.every(validate) && new Set(value).size === value.length;
}

function isEvent(value: unknown): value is CalendarEvent {
  if (!isRecord(value)) return false;
  return nonempty(value.id) && validDate(value.date) && periods.includes(value.period as MemoPeriod) &&
    nonempty(value.text) && typeof value.completed === 'boolean' && validStamp(value.createdAt) && validStamp(value.updatedAt) &&
    optional(value.startTime, validTime) &&
    optional(value.endTime, time => validTime(time) && value.startTime !== undefined && time !== value.startTime) &&
    optional(value.deadline, deadline => typeof deadline === 'boolean' && (!deadline || (value.startTime !== undefined && value.endTime === undefined))) &&
    optional(value.taskId, nonempty) && optional(value.batchId, nonempty) &&
    optional(value.sourceText, text => typeof text === 'string') &&
    optional(value.completedDates, dates => uniqueList(dates, validDate)) &&
    optional(value.repeat, repeat => repeat === 'none' || repeat === 'daily' || repeat === 'weekly') &&
    optional(value.remindMinutes, minutes => typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440);
}

function isBatch(value: unknown): value is ImportBatch {
  return isRecord(value) && nonempty(value.id) && validStamp(value.createdAt) &&
    uniqueList(value.eventIds, nonempty) && optional(value.undoneAt, validStamp);
}

function isReceipt(value: unknown): value is ReminderReceipt {
  return isRecord(value) && nonempty(value.eventId) && validDate(value.occurrenceDate) && validStamp(value.scheduledTime);
}

function receiptKey(receipt: ReminderReceipt): string {
  return JSON.stringify([receipt.eventId, receipt.occurrenceDate, receipt.scheduledTime]);
}

export function parseAgenda(value: unknown): AgendaData {
  if (!isRecord(value) || !Array.isArray(value.events) || !value.events.every(isEvent) ||
    !Array.isArray(value.batches) || !value.batches.every(isBatch) ||
    !Array.isArray(value.receipts) || !value.receipts.every(isReceipt)) {
    throw new Error('日程数据格式无效');
  }
  const events: CalendarEvent[] = value.events;
  const batches: ImportBatch[] = value.batches;
  const receipts: ReminderReceipt[] = value.receipts;
  const eventsById = new Map(events.map(event => [event.id, event]));
  const batchesById = new Map(batches.map(batch => [batch.id, { ...batch, eventIds: new Set(batch.eventIds) }]));
  if (eventsById.size !== events.length || batchesById.size !== batches.length ||
    new Set(receipts.map(receiptKey)).size !== receipts.length) {
    throw new Error('日程数据含有重复标识');
  }
  const ownedIds = new Set<string>();
  for (const batch of batches) {
    for (const id of batch.eventIds) {
      const event = eventsById.get(id);
      if (ownedIds.has(id) || (event && event.batchId !== batch.id)) throw new Error('日程导入批次引用无效');
      ownedIds.add(id);
    }
  }
  if (events.some(event => event.batchId && !batchesById.get(event.batchId)?.eventIds.has(event.id))) {
    throw new Error('日程缺少对应的导入批次');
  }
  return { ...value, events, batches, receipts };
}

export function importAgendaEntries(agenda: AgendaData, entries: readonly AgendaImportEntry[], now: string, createId: () => string) {
  const keys = new Set(agenda.events.map(chatEntryFingerprint));
  const events: CalendarEvent[] = [];
  let batchId: string | undefined;
  for (const entry of entries) {
    const legacy = entry.hour === undefined ? null : /^(\d\d:\d\d)(?:(?:–|-)(\d\d:\d\d)|( 前))?\s+/.exec(entry.text);
    const { date, period, sourceText } = entry;
    const startTime = entry.startTime ?? legacy?.[1];
    const endTime = entry.endTime ?? legacy?.[2];
    const deadline = entry.deadline ?? (legacy?.[3] ? true : undefined);
    const text = (entry.description ?? (legacy ? entry.text.slice(legacy[0].length) : entry.text)).trim();
    const fields = { date, period, startTime, endTime, deadline, sourceText, text, createdAt: now, updatedAt: now, completed: false };
    const key = chatEntryFingerprint(fields);
    if (keys.has(key)) continue;
    batchId ??= createId();
    const event = { ...fields, id: createId(), batchId };
    if (!isEvent(event)) throw new Error('导入日程的日期或时间无效');
    events.push(event);
    keys.add(key);
  }
  if (!batchId) return { agenda, count: 0 };
  const batch = { id: batchId, createdAt: now, eventIds: events.map(event => event.id) };
  return {
    agenda: parseAgenda({ ...agenda, events: [...agenda.events, ...events], batches: [...agenda.batches, batch] }),
    count: events.length,
    batchId,
  };
}

export function undoAgendaImport(agenda: AgendaData, batchId: string, now: string) {
  const batch = agenda.batches.find(item => item.id === batchId);
  if (!batch || batch.undoneAt) return { agenda, count: 0, retained: 0 };
  let retained = 0;
  const removedIds = new Set<string>();
  const events = agenda.events.filter(event => {
    if (event.batchId !== batchId) return true;
    if (event.taskId || event.completed || event.completedDates?.length ||
      event.createdAt !== batch.createdAt || event.updatedAt !== event.createdAt) {
      retained += 1;
      return true;
    }
    removedIds.add(event.id);
    return false;
  });
  const batches = agenda.batches.map(item => item === batch ? { ...item, undoneAt: now } : item);
  return { agenda: { ...agenda, events, batches }, count: removedIds.size, retained };
}

function occursOn(event: CalendarEvent, date: string): boolean {
  if (date < event.date) return false;
  if (date === event.date || event.repeat === 'daily') return true;
  return event.repeat === 'weekly' && (Date.parse(date) - Date.parse(event.date)) % (7 * dayLength) === 0;
}

function isRepeating(event: CalendarEvent): boolean {
  return event.repeat === 'daily' || event.repeat === 'weekly';
}

function minutesAt(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export function agendaForDate(agenda: AgendaData, date: string): AgendaOccurrence[] {
  if (!validDate(date)) return [];
  return agenda.events.filter(event => occursOn(event, date))
    .map(event => ({
      ...event,
      occurrenceDate: date,
      isCompleted: isRepeating(event) ? (event.completedDates?.includes(date) ?? false) : event.completed,
    }))
    .sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return periods.indexOf(a.period) - periods.indexOf(b.period);
    });
}

export function setAgendaCompletion(agenda: AgendaData, eventId: string, occurrenceDate: string, completed: boolean, now: string): AgendaData {
  const occurrence = agendaForDate(agenda, occurrenceDate).find(event => event.id === eventId);
  if (!occurrence || occurrence.isCompleted === completed) return agenda;
  const events = agenda.events.map(event => {
    if (event.id !== eventId) return event;
    if (!isRepeating(event)) return { ...event, completed, updatedAt: now };
    const dates = event.completedDates ?? [];
    return { ...event, updatedAt: now, completedDates: completed ? [...dates, occurrenceDate].sort() : dates.filter(date => date !== occurrenceDate) };
  });
  return { ...agenda, events };
}

function nearbyDate(date: string, offset: number): string {
  return new Date(Date.parse(date) + offset * dayLength).toISOString().slice(0, 10);
}

export function agendaConflicts(agenda: AgendaData, date: string): Array<[string, string]> {
  if (!validDate(date)) return [];
  const ranges = [nearbyDate(date, -1), date].flatMap((key, index) => agendaForDate(agenda, key).flatMap(event => {
    if (!event.startTime || !event.endTime || event.deadline) return [];
    const start = minutesAt(event.startTime);
    let end = minutesAt(event.endTime);
    if (end < start) end += 1440;
    const offset = index === 0 ? -1440 : 0;
    return end + offset > 0 ? [{ id: event.id, start: Math.max(0, start + offset), end: Math.min(1440, end + offset) }] : [];
  }));
  const conflicts: Array<[string, string]> = [];
  ranges.forEach((a, index) => {
    for (const b of ranges.slice(index + 1)) {
      if (a.id !== b.id && a.start < b.end && b.start < a.end) conflicts.push([a.id, b.id]);
    }
  });
  return conflicts;
}

export function dueReminders(agenda: AgendaData, now: Date): Array<{ event: AgendaOccurrence; receipt: ReminderReceipt }> {
  const date = localDateKey(now);
  if (!validDate(date)) return [];
  const delivered = new Set(agenda.receipts.map(receiptKey));
  return [date, nearbyDate(date, 1)].flatMap(occurrenceDate =>
    agendaForDate(agenda, occurrenceDate).flatMap(event => {
      if (event.isCompleted || !event.startTime || event.remindMinutes === undefined) return [];
      const scheduled = new Date(`${occurrenceDate}T${event.startTime}:00`);
      scheduled.setTime(scheduled.getTime() - event.remindMinutes * 60_000);
      if (scheduled > now || localDateKey(scheduled) < date && occurrenceDate !== date) return [];
      const receipt = { eventId: event.id, occurrenceDate, scheduledTime: scheduled.toISOString() };
      return delivered.has(receiptKey(receipt)) ? [] : [{ event, receipt }];
    }),
  );
}
