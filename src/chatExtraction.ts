import { dateFromKey, isDateKey, localDateKey } from './calendarModel';
import { chatTimeLabel, type ChatPreview } from './chatImport';
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

function spokenNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digit = (symbol: string) => symbol === '两' ? 2 : '零一二三四五六七八九'.indexOf(symbol);
  if (!value.includes('十')) return digit(value);
  const [tens, units] = value.split('十');
  return (tens ? digit(tens) : 1) * 10 + (units ? digit(units) : 0);
}

function sourceClockTimes(source: string): Set<string> {
  const times = new Set<string>();
  const add = (hour: number, minute: number) => {
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) times.add(chatTimeLabel(hour, minute));
  };
  for (const clause of source.normalize('NFKC').split(/[\n，,。！？；!?;]/)) {
    const text = clause.replace(/[ \t]/g, '');
    for (const match of text.matchAll(/(?<!\d)(?:(上午|早上|凌晨|中午|下午|晚上|傍晚))?(\d{1,2}):(\d{2})(?!\d)/g)) {
      let hour = Number(match[2]);
      if (hour < 12 && /中午|下午|晚上|傍晚/.test(match[1] ?? '')) hour += 12;
      add(hour, Number(match[3]));
    }
    for (const match of text.matchAll(/([零一二两三四五六七八九十\d]{1,3})[点時时](?:(半)|([零一二两三四五六七八九十\d]{1,3})分?)?/g)) {
      let hour = spokenNumber(match[1]);
      const prefix = text.slice(0, match.index);
      const periods = [...prefix.matchAll(/凌晨|早上|上午|中午|下午|傍晚|晚上|今晚|明晚/g)];
      const period = periods.at(-1)?.[0];
      if (hour < 12 && !period) continue;
      if (hour < 12 && period && /中午|下午|傍晚|晚上|今晚|明晚/.test(period)) hour += 12;
      add(hour, match[2] ? 30 : match[3] ? spokenNumber(match[3]) : 0);
    }
  }
  return times;
}

const relativeDays = {
  大前天: -3, 前天: -2, 昨天: -1, 昨晚: -1, 今天: 0, 今早: 0, 今晚: 0,
  明天: 1, 明早: 1, 明晚: 1, 后天: 2, 大后天: 3,
};
const chatDateHeader = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:\s+\d{1,2}\s*:\s*\d{2})?$/;

function relativeDateEvidence(source: string, reference: string) {
  let base = reference;
  return source.normalize('NFKC').split(/\r?\n/).flatMap(line => {
    const header = line.trim().match(chatDateHeader);
    if (header) {
      const key = [header[1], header[2].padStart(2, '0'), header[3].padStart(2, '0')].join('-');
      base = isDateKey(key) ? key : reference;
      return [];
    }
    return line.split(/[。！？；!?;]/).filter(clause => clause.trim()).map(clause => {
      const value = compact(clause);
      const explicit = /(?:\d{1,2}月\d{1,2}|\d{1,2}[./-]\d{1,2}|\d{1,2}[日号]|(?:周|星期)[一二三四五六日天])/.test(value);
      const tokens = value.match(/大前天|大后天|前天|昨天|昨晚|今天|今早|今晚|明天|明早|明晚|后天/g);
      const token = !explicit && tokens?.length === 1 ? tokens[0] as keyof typeof relativeDays : undefined;
      const day = dateFromKey(base);
      const date = token ? localDateKey(new Date(day.getFullYear(), day.getMonth(), day.getDate() + relativeDays[token], 12)) : undefined;
      return { date, explicit, times: sourceClockTimes(clause) };
    });
  });
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
  const sourceTimes = sourceClockTimes(source);
  const relative = reference && isDateKey(reference) ? relativeDateEvidence(source, reference) : [];
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
    const proposedTime = clock(event.time);
    const time = proposedTime && sourceTimes.has(proposedTime) ? proposedTime : undefined;
    const matching = time ? relative.filter(hint => hint.times.has(time)) : [];
    const relativeDate = matching.length === 1 ? matching[0].date :
      !matching.length && events.length === 1 && !relative.some(hint => hint.explicit) && relative.filter(hint => hint.date).length === 1
        ? relative.find(hint => hint.date)?.date : undefined;
    const date = relativeDate
      ?? (deadline && time && reference && isDateKey(reference) ? weekdayDeadlineDate(original, time, reference) : undefined)
      ?? (isDateKey(modelDate) ? modelDate : undefined);
    const proposedEnd = clock(event.end);
    const endTime = time && !deadline && proposedEnd && sourceTimes.has(proposedEnd) ? proposedEnd : undefined;
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
