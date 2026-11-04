import { expect, it } from 'vitest';
import { visibleTaskText } from './taskImages';
import { imageIds, withTaskImages } from './taskImages';
import { taskDocuments, withDocuments } from './taskDocuments';
it('hides attachment metadata without hiding the task description', () => {
  expect(visibleTaskText('任务\n[FocusMatrix文档:' + 'a'.repeat(64) + '.pdf:report.pdf]')).toBe('任务');
});
it('retains documents and images when task text is edited', () => {
  const docs=[{id:'b'.repeat(64)+'.pdf',name:'报告[最终版].pdf'}];
  const original=withDocuments(withTaskImages('原文',['a'.repeat(64)]),docs);
  expect(taskDocuments(original)).toEqual(docs);
  expect(imageIds(original)).toEqual(['a'.repeat(64)]);
  const edited=withDocuments(withTaskImages('新文',imageIds(original)),taskDocuments(original));
  expect(visibleTaskText(edited)).toBe('新文');expect(taskDocuments(edited)).toEqual(docs);
});
