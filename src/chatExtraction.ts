import { dateFromKey, isDateKey, localDateKey } from './calendarModel';
import { chatPeriodForHour, chatTimeLabel, type ChatPreview } from './chatImport';

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

function taskDescription(value: unknown, limit: number): string {
  return field(value, limit)
    .split(/(?:^|[。；;·]|\s)\s*(?:分析|推理|推断|判断依据|日期依据|解释|说明)\s*[:：]/, 1)[0]
    .trim().replace(/[。；;]+$/, '');
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
const chatDateHeader = /^\[?(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:\s+\d{1,2}\s*:\s*\d{2})?\]?$/;
const inlineChatTimestamp = /^\[?(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s+\d{1,2}\s*:\s*\d{2}\]?\s+(?=.{0,20}(?:明[天早晚]|今[天早晚]|后天|前天|昨[天晚]|星期|周))/;

function exactDurationDeadline(source: string) {
  const match = source.normalize('NFKC').trim().match(
    /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\s+(\d{1,2})\s*:\s*(\d{2})\s+(\d{1,5})\s*(小时|分钟)(?:之)?内[。.!！]?$/,
  );
  if (!match) return;
  const [, year, month, day, hour, minute, amount, unit] = match;
  const date = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  if (!isDateKey(date) || !clock(hour.padStart(2, '0') + ':' + minute) || Number(amount) === 0) return;
  const start = dateFromKey(date);
  start.setHours(Number(hour), Number(minute), 0, 0);
  const end = new Date(start.getTime() + Number(amount) * (unit === '小时' ? 3_600_000 : 60_000));
  return { date: localDateKey(end), time: chatTimeLabel(end.getHours(), end.getMinutes()) };
}

function offsetDate(base: Date, days: number) {
  return localDateKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12));
}

function dateEvidence(source: string, reference?: string): string | undefined {
  const text = compact(source);
  const base = reference ? dateFromKey(reference) : undefined;
  const explicit = [...text.matchAll(/(?<![\d:])(?:(\d{4})[年./-])?(\d{1,2})(?:月|[./-])(\d{1,2})(?:[日号]|(?=$|[^\d.:]))/g)];
  const days = [...text.matchAll(/(?<![\d星])(?<!星期)(\d{1,2})[日号]/g)]
    .filter(match => !explicit.some(date => match.index >= date.index && match.index < date.index + date[0].length));
  const tokens = [...text.matchAll(/大前天|大后天|前天|昨天|昨晚|今天|今早|今晚|明天|明早|明晚|后天|(上上|上|本|这|下下|下)?(?:周|星期)([一二三四五六日天])/g)];
  if (explicit.length + days.length > 1) return undefined;
  if (explicit.length + days.length && tokens.length && /或(?:者)?|待定|未定/.test(text)) return undefined;
  if (explicit.length || days.length) {
    const [, year, month, day] = explicit[0] ?? ['', '', base ? String(base.getMonth() + 1) : '', days[0][1]];
    if (!year && !base) return undefined;
    let numericYear = Number(year || base?.getFullYear());
    const numericMonth = Number(month);
    if (!year && base && base.getMonth() + 1 - numericMonth > 6) numericYear++;
    const key = [String(numericYear), month.padStart(2, '0'), day.padStart(2, '0')].join('-');
    return isDateKey(key) ? key : undefined;
  }
  if (!base) return undefined;
  if (tokens.length !== 1) return undefined;
  const [token, qualifier, weekday] = tokens[0];
  if (!weekday) return offsetDate(base, relativeDays[token as keyof typeof relativeDays]);
  const current = (base.getDay() + 6) % 7;
  const target = (weekdays.indexOf(weekday === '天' ? '日' : weekday) + 6) % 7;
  const week = qualifier === '上上' ? -2 : qualifier === '上' ? -1 : qualifier === '下下' ? 2 :
    qualifier === '下' || (!qualifier && target < current) ? 1 : 0;
  return offsetDate(base, target - current + week * 7);
}

function sourceClauses(source: string, reference?: string) {
  let base = reference;
  return source.normalize('NFKC').replace(/(中午|凌晨|上午|下午|晚上|早上|傍晚)\s*\r?\n[ \t]*(?=\d)/g, '$1').split(/\r?\n/).flatMap(line => {
    if (/^【截图 \d+】$/.test(line.trim())) { base = reference; return []; }
    const trimmed = line.trim();
    const header = trimmed.match(chatDateHeader) ?? trimmed.match(inlineChatTimestamp);
    if (header) {
      const key = [header[1], header[2].padStart(2, '0'), header[3].padStart(2, '0')].join('-');
      base = isDateKey(key) ? key : reference;
    }
    return trimmed.slice(header?.[0].length ?? 0).split(/[。！？；!?;]|[,，](?=\s*(?:明[天早晚]|今[天早晚]|后天|周[一二三四五六日天]|下周|\d{1,2}月))/)
      .map(value => value.trim()).filter(Boolean).map(text => ({ text, base, times: sourceClockTimes(text) }));
  });
}

function inferPeriod(source: string) {
  const periods = new Set([...source.matchAll(/凌晨|早上|上午|今早|明早|中午|下午|傍晚|晚上|昨晚|今晚|明晚/g)]
    .map(([label]) => /凌晨|早上|上午|今早|明早/.test(label) ? 'morning' as const :
      /中午|下午/.test(label) ? 'afternoon' as const : 'evening' as const));
  return periods.size === 1 ? [...periods][0] : undefined;
}

export function previewChatEvents(output: string, source: string, reference?: string): ChatPreview[] {
  let result: unknown;
  try { result = JSON.parse(output); }
  catch { throw Error('本地模型未返回可读取的事项，请重试。'); }
  if (!result || typeof result !== 'object' || !('events' in result) || !Array.isArray(result.events)) {
    throw Error('本地模型返回的事项格式有误，请重试。');
  }
  const original = compact(source);
  const clauses = sourceClauses(source, reference && isDateKey(reference) ? reference : undefined);
  const events = result.events.slice(0, 24).filter((value): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && taskDescription(value.title, 150) &&
      (value.kind === 'event' || value.kind === 'deadline')));
  const durationDeadline = events.length === 1 && events[0].kind === 'deadline' ? exactDurationDeadline(source) : undefined;
  const activity = events.find(event => event.kind === 'event');
  const formDeadline = events.find(event => event.kind === 'deadline' && /填表|表格|提交|报送/.test(field(event.title, 150)));
  const activityPreparation = taskDescription(activity?.preparation, 360);
  // A single notice sometimes returns the form instructions on the activity and an empty deadline.
  const movePreparation = events.length === 2 && activity && formDeadline &&
    !taskDescription(formDeadline.preparation, 360) && /填表|填[写报].{0,12}表/.test(activityPreparation);
  const previews: ChatPreview[] = [];
  for (const event of events) {
    let title = taskDescription(event.title, 150);
    const location = field(event.location, 200);
    const address = field(event.address, 200);
    let preparation = movePreparation ? (event === formDeadline ? activityPreparation : '') : taskDescription(event.preparation, 360);
    const duration = compact(title).match(/^(\d+(?:\.\d+)?(?:小时|分钟|天))期限$/)?.[1];
    if (duration && compact(preparation) === duration + '内完成') {
      title = preparation;
      preparation = '';
    } else if (preparation && compact(title) === compact(preparation)) {
      preparation = '';
    }
    const deadline = event.kind === 'deadline';
    const proposedTime = clock(event.time);
    const byTitle = clauses.filter(clause => compact(clause.text).includes(compact(title)));
    const quote = field(event.source, 600);
    const quoteText = compact(quote);
    const quoteMatchesTitle = byTitle.length === 0 || byTitle.some(clause =>
      compact(clause.text).includes(quoteText) || quoteText.includes(compact(clause.text)));
    const quoted = quoteText && quoteMatchesTitle && original.includes(quoteText) ? quote : undefined;
    const byTime = proposedTime ? clauses.filter(clause => clause.times.has(proposedTime)) : [];
    const matching = byTitle.length ? byTitle : quote ? [] : byTime;
    const bound = matching.length === 1 ? matching[0] : events.length === 1 && clauses.length === 1 ? clauses[0] : undefined;
    const quotedClauses = quoted ? clauses.filter(clause =>
      compact(quoted).includes(compact(clause.text)) || compact(clause.text).includes(compact(quoted))) : [];
    const quotedBases = new Set(quotedClauses.map(clause => clause.base));
    const evidence = quoted ?? bound?.text ?? (durationDeadline ? source : '');
    const base = quoted ? quotedBases.size === 1 ? [...quotedBases][0] : undefined : bound?.base;
    const evidenceTimes = sourceClockTimes(evidence);
    const time = durationDeadline?.time ?? (proposedTime && evidenceTimes.has(proposedTime) ? proposedTime : undefined);
    const date = durationDeadline?.date ?? dateEvidence(evidence, base);
    const proposedEnd = clock(event.end);
    const endTime = time && !deadline && proposedEnd && proposedEnd > time && evidenceTimes.has(proposedEnd) ? proposedEnd : undefined;
    const hour = time === undefined ? undefined : Number(time.slice(0, 2));
    const period = hour === undefined ? inferPeriod(evidence) : chatPeriodForHour(hour);
    const text = [title, location && '地点 ' + location, address && original.includes(compact(address)) && '地址 ' + address,
      preparation && '准备 ' + preparation].filter(Boolean).join(' · ');
    previews.push({ date, period, hour,
      minute: time === undefined ? undefined : Number(time.slice(3)), endTime, deadline, text, sourceText: evidence || undefined });
  }
  return previews;
}
