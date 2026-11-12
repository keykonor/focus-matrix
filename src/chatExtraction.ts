import { dateFromKey, isDateKey, localDateKey } from './calendarModel';
import type { ChatPreview } from './chatImport';
import { memoPeriods } from './types';

const weekdays = '日一二三四五六';

export function buildChatExtractionInput(text: string, reference: string): string {
  if (!isDateKey(reference)) throw Error('参考日期无效，请返回日历重新选择。');
  if (!text.trim()) throw Error('没有读到聊天文字。');
  if (text.length > 12_000) throw Error('每次最多提取 12,000 字，请分批导入。');
  const base = dateFromKey(reference);
  const monday = base.getDate() - (base.getDay() + 6) % 7;
  const weeks = ['上周', '本周', '下周', '下下周'].map((label, week) => {
    const days = Array.from({ length: 7 }, (_, day) => {
      const date = new Date(base.getFullYear(), base.getMonth(), monday + 7 * (week - 1) + day, 12);
      return localDateKey(date) + '（周' + weekdays[date.getDay()] + '）';
    });
    return label + ' ' + days.join('、');
  });
  const source = text.normalize('NFKC').trim().replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, '');
  return JSON.stringify({ reference, calendar: weeks, source });
}

function field(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : '';
}

function clock(value: unknown): string | undefined {
  const time = field(value, 16);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : undefined;
}

function compact(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '');
}

function weekdayDeadlineDate(source: string, time: string, reference: string): string | undefined {
  const hints = [...source.matchAll(/(上|本|这|下下|下)?(?:周|星期)([一二三四五六日天])(?:早上|上午|中午|下午|晚上|凌晨)?(\d{1,2}:\d{2})(?:以前|之前|前)/g)]
    .filter(match => match[3].padStart(5, '0') === time &&
      !/\d{1,2}(?:月\d{1,2}[日号]?|[./-]\d{1,2})[（(]?$/.test(source.slice(Math.max(0, match.index - 15), match.index)));
  const date = dateFromKey(reference);
  const weekday = (date.getDay() + 6) % 7;
  const dates = new Set(hints.map(([, qualifier, day]) => {
    const target = (weekdays.indexOf(day === '天' ? '日' : day) + 6) % 7;
    const offset = qualifier === '上' ? -7 : qualifier === '下' ? 7 : qualifier === '下下' ? 14 :
      !qualifier && target < weekday ? 7 : 0;
    return localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + target - weekday + offset, 12));
  }));
  return dates.size === 1 ? [...dates][0] : undefined;
}

export function previewChatEvents(output: string, source: string, reference?: string): ChatPreview[] {
  let result: unknown;
  try { result = JSON.parse(output); }
  catch { throw Error('本地模型未返回可读取的事项，请重试。'); }
  if (!result || typeof result !== 'object' || !('events' in result) || !Array.isArray(result.events)) {
    throw Error('本地模型返回的事项格式有误，请重试。');
  }
  const original = compact(source);
  const events = result.events.slice(0, 24).filter((value): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && field(value.title, 150) &&
      (value.kind === 'event' || value.kind === 'deadline')));
  const activity = events.find(event => event.kind === 'event');
  const formDeadline = events.find(event => event.kind === 'deadline' && /填表|表格|提交|报送/.test(field(event.title, 150)));
  const activityPreparation = field(activity?.preparation, 360);
  // A single notice sometimes returns the form instructions on the activity and an empty deadline.
  const movePreparation = events.length === 2 && activity && formDeadline &&
    !field(formDeadline.preparation, 360) && /填表|填[写报].{0,12}表/.test(activityPreparation);
  const previews: ChatPreview[] = [];
  for (const event of events) {
    const title = field(event.title, 150);
    const modelDate = field(event.date, 16);
    const location = field(event.location, 200);
    const address = field(event.address, 200);
    const preparation = movePreparation ? (event === formDeadline ? activityPreparation : '') : field(event.preparation, 360);
    const deadline = event.kind === 'deadline';
    const time = clock(event.time);
    const date = (deadline && time && reference && isDateKey(reference) ? weekdayDeadlineDate(original, time, reference) : undefined)
      ?? (isDateKey(modelDate) ? modelDate : undefined);
    const endTime = time && !deadline ? clock(event.end) : undefined;
    const hour = time === undefined ? undefined : Number(time.slice(0, 2));
    const period = hour === undefined ? memoPeriods.find(value => value === event.period) :
      hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const text = [title, location && '地点 ' + location, address && original.includes(compact(address)) && '地址 ' + address,
      preparation && '准备 ' + preparation].filter(Boolean).join(' · ');
    previews.push({ date, period, hour,
      minute: time === undefined ? undefined : Number(time.slice(3)), endTime, deadline, text });
  }
  return previews;
}
