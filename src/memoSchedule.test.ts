import { expect, it } from 'vitest';
import { parseMemoSchedules } from './memoSchedule';
import { withDocuments } from './taskDocuments';

it('retains local files for both daytime and hourly memo slots when reopening', () => {
  const files = withDocuments('', [{ id: 'a'.repeat(64) + '.pdf', name: '资料.pdf' }]);
  const schedules = {
    '2026-11-09': { mode: 'hourly', hours: [8], notes: { '8': '计划' }, attachments: { morning: files, 'hour-8': files } },
  };
  expect(parseMemoSchedules(schedules)).toEqual(schedules);
});
