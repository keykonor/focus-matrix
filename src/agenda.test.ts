import { describe, expect, it } from 'vitest';
import { agendaConflicts, agendaForDate, dueReminders, EMPTY_AGENDA, importAgendaEntries, parseAgenda, setAgendaCompletion, undoAgendaImport } from './agenda';

const date = '2028-02-29';
const now = '2028-02-29T00:00:00.000Z';
const later = '2028-02-29T01:00:00.000Z';
const timed = { date, period: 'morning' as const, startTime: '09:35', endTime: '10:15', text: '事项' };
function imported(entries = [timed]) {
  let id = 0;
  return importAgendaEntries(EMPTY_AGENDA, entries, now, () => String(++id));
}
describe('agenda', () => {
  it('deduplicates equivalent descriptions and preserves precise ranges', () => {
    const result = imported([timed, { ...timed, text: '  事项  ' }]);
    expect(result.count).toBe(1);
    expect(result.agenda.events[0]).toMatchObject(timed);
    expect(parseAgenda(result.agenda)).toEqual(result.agenda);
  });

  it('keeps same-start events with distinct end times', () => {
    expect(imported([timed, { ...timed, endTime: '10:30' }]).count).toBe(2);
  });

  it('rejects invalid dates, IDs and dangling batch ownership', () => {
    const { agenda } = imported();
    expect(() => parseAgenda({ ...agenda, events: [{ ...agenda.events[0], date: '2027-02-29' }] })).toThrow();
    expect(() => parseAgenda({ ...agenda, events: [...agenda.events, ...agenda.events] })).toThrow();
    expect(() => parseAgenda({ ...agenda, batches: [] })).toThrow();
  });

  it('undoes only untouched, unlinked entries and survives reload', () => {
    const { agenda, batchId } = imported([timed, { ...timed, text: '修改' }, { ...timed, text: '任务' }]);
    agenda.events[1].updatedAt = later;
    agenda.events[2].taskId = 'task';
    const result = undoAgendaImport(parseAgenda(agenda), batchId!, later);
    expect([result.count, result.retained]).toEqual([1, 2]);
    expect(parseAgenda(result.agenda).events.map(event => event.text)).toEqual(['修改', '任务']);
    expect(undoAgendaImport(result.agenda, batchId!, later).count).toBe(0);
  });

  it('projects weekly occurrences and completes individual dates', () => {
    const { agenda } = imported();
    agenda.events[0].repeat = 'weekly';
    const id = agenda.events[0].id;
    const changed = setAgendaCompletion(agenda, id, '2028-03-07', true, later);
    expect(agendaForDate(changed, '2028-03-07')[0].isCompleted).toBe(true);
    expect(agendaForDate(changed, '2028-03-14')[0].isCompleted).toBe(false);
    expect(agendaForDate(changed, '2028-03-01')).toEqual([]);
  });

  it('detects actual overlap, including an overnight range', () => {
    const { agenda } = imported([
      { ...timed, startTime: '23:30', endTime: '00:15' },
      { ...timed, date: '2028-03-01', startTime: '00:10', endTime: '00:35', text: '冲突' },
      { ...timed, date: '2028-03-01', startTime: '00:35', endTime: '01:00', text: '相邻' },
    ]);
    expect(agendaConflicts(agenda, '2028-03-01')).toEqual([[agenda.events[0].id, agenda.events[1].id]]);
  });

  it('catches missed reminders during the due day and deduplicates persisted receipts', () => {
    const { agenda } = imported();
    agenda.events[0].remindMinutes = 15;
    expect(dueReminders(agenda, new Date(2028, 1, 29, 9, 19))).toHaveLength(0);
    const due = dueReminders(agenda, new Date(2028, 1, 29, 10));
    expect(due).toHaveLength(1);
    expect(dueReminders({ ...agenda, receipts: [due[0].receipt] }, new Date(2028, 1, 29, 10))).toHaveLength(0);
    expect(dueReminders(agenda, new Date(2028, 2, 1, 9, 19))).toHaveLength(0);
  });

  it('delivers advance reminders on the evening before an occurrence', () => {
    const { agenda } = imported([{ ...timed, startTime: '00:10', endTime: '00:30' }]);
    agenda.events[0].remindMinutes = 30;
    expect(dueReminders(agenda, new Date(2028, 1, 28, 23, 39))).toEqual([]);
    const due = dueReminders(agenda, new Date(2028, 1, 28, 23, 40));
    expect(due.map(({ receipt }) => receipt.occurrenceDate)).toEqual([date]);
    expect(dueReminders({ ...agenda, receipts: [due[0].receipt] }, new Date(2028, 1, 29, 0))).toEqual([]);
  });
});
