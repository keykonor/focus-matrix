import { dateFromKey, isDateKey, localDateKey } from './calendarModel';
import type { MemoPeriod } from './types';

export interface ChatEntry {
  date: string;
  period: MemoPeriod;
  hour?: number;
  text: string;
}

export interface ChatPreview {
  date?: string;
  period?: MemoPeriod;
  hour?: number;
  minute?: number;
  text: string;
}

const weekdays = '日一二三四五六';
const numerals = '零一二三四五六七八九';
const dateStamp = /^(?:(?:\d{4}\s*[-/.年]\s*)?\d{1,2}\s*[-/.月]\s*\d{1,2}\s*[日号]?|前天|昨天|今天|星期[一二三四五六日天])(?:\s*\d{1,2}\s*:\s*\d{2})?$/;

function number(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '两') return 2;
  if (value.length === 1 && value !== '十') return numerals.indexOf(value);
  const [tens, units] = value.split('十');
  return (tens ? numerals.indexOf(tens) : 1) * 10 + (units ? numerals.indexOf(units) : 0);
}

function shiftDay(base: string, days: number): string {
  const day = dateFromKey(base);
  day.setDate(day.getDate() + days);
  return localDateKey(day);
}

function dateIn(line: string, base: string, inherited?: string): string | undefined {
  const explicit = line.match(/(?:(\d{4})\s*[-/.年]\s*)?(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:日|号)?/);
  if (explicit) {
    const date = [explicit[1] ?? base.slice(0, 4), explicit[2].padStart(2, '0'), explicit[3].padStart(2, '0')].join('-');
    return isDateKey(date) ? date : undefined;
  }
  const monthDay = line.match(/(?:(上|下|本|这)(?:个)?月\s*)?(\d{1,2})\s*[日号]/);
  if (monthDay) {
    const offset = monthDay[1] === '下' ? 1 : monthDay[1] === '上' ? -1 : 0;
    const reference = dateFromKey(base);
    const month = localDateKey(new Date(reference.getFullYear(), reference.getMonth() + offset, 1, 12)).slice(0, 7);
    const date = month + '-' + monthDay[2].padStart(2, '0');
    return isDateKey(date) ? date : undefined;
  }
  if (/这[两几]天|过几天|改天|下周末|下周(?![一二三四五六日天])/.test(line)) return;
  const relative = line.match(/前天|昨天|昨日|昨晚|今天|今晚|明天|明早|明晚|后天/);
  if (relative) {
    const days = { 前天: -2, 昨天: -1, 昨日: -1, 昨晚: -1, 今天: 0, 今晚: 0, 明天: 1, 明早: 1, 明晚: 1, 后天: 2 };
    return shiftDay(base, days[relative[0] as keyof typeof days]);
  }
  const week = line.match(/(上|这|本|下)?(?:周|星期)([一二三四五六日天])/);
  if (week) {
    const weekday = weekdays.indexOf(week[2] === '天' ? '日' : week[2]);
    const current = (dateFromKey(base).getDay() + 6) % 7;
    const target = (weekday + 6) % 7;
    const offset = week[1] === '上' ? -7 : week[1] === '下' || (!week[1] && target < current) ? 7 : 0;
    return shiftDay(base, target - current + offset);
  }
  return inherited;
}

function timeIn(line: string): { period?: MemoPeriod; hour?: number; minute?: number } {
  const period = /凌晨|早上|上午|明早/.test(line) ? 'morning' :
    /中午|下午|傍晚/.test(line) ? 'afternoon' :
    /晚上|昨晚|今晚|明晚|夜里/.test(line) ? 'evening' : undefined;
  const clock = line.match(/(?:^|[^\d])(\d{1,2})\s*:\s*(\d{2})(?!\d)/);
  const colloquial = line.match(/([零一二两三四五六七八九十\d]{1,3})[点時时](?:([零一二两三四五六七八九十\d]{1,3})分?|([半]))?/);
  if (!clock && !colloquial) return { period };
  let hour = number(clock?.[1] ?? colloquial![1]);
  const minute = clock ? Number(clock[2]) : colloquial?.[3] ? 30 : colloquial?.[2] ? number(colloquial[2]) : 0;
  if (!period && !clock && hour < 12) return {};
  if (period && period !== 'morning' && hour < 12) hour += 12;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return {};
  return { period: hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening', hour, minute };
}

export function parseChatImport(input: string, selectedDate: string): ChatPreview[] {
  let chatDate: string | undefined;
  const entries: ChatPreview[] = [];
  for (const raw of input.normalize('NFKC').split(/\r?\n/)) {
    const line = raw.trim().replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, '');
    if (!line || /^(?:好的?|收到|嗯+|谢谢|OK|[0-9]{1,2}:[0-9]{2})[。！!，, ]*$/i.test(line)) continue;
    if (dateStamp.test(line)) {
      chatDate = dateIn(line, chatDate ?? selectedDate);
      continue;
    }
    const date = dateIn(line, chatDate ?? selectedDate, chatDate);
    const time = /取消|待定|暂定|改到|改为|再定|左右|前后/.test(line) ? {} : timeIn(line);
    entries.push({ date, ...time, text: line });
  }
  return entries;
}

export function chatTimeLabel(hour: number, minute: number): string {
  return [hour, minute].map(value => String(value).padStart(2, '0')).join(':');
}

export function confirmChatEntry(preview: ChatPreview): ChatEntry | undefined {
  const { date, period, hour, minute, text } = preview;
  const value = text.trim();
  if (!date || !isDateKey(date) || !period || !value) return;
  if (hour === undefined || minute === undefined) return { date, period, text: value };
  const time = chatTimeLabel(hour, minute);
  return { date, period, hour, text: value.startsWith(time + ' ') ? value : time + ' ' + value };
}

export function appendChatLine(current: string, line: string): string {
  if (current.split(/\r?\n/).includes(line)) return current;
  return current ? current + (current.endsWith('\n') ? '' : '\n') + line : line;
}

export function removeChatLine(current: string, line: string): string {
  const lines = current.split('\n');
  if (lines.filter(value => value === line).length !== 1) return current;
  return lines.filter(value => value !== line).join('\n');
}
