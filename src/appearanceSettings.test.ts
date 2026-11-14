import { describe, expect, it } from 'vitest';
import { parseSettings } from './taskModel';

describe('appearance settings', () => {
  it('preserves supported choices and an existing opacity preference', () => {
    expect(parseSettings({ theme: 'warm-gray', density: 'compact', opacity: 86 }))
      .toMatchObject({ theme: 'warm-gray', density: 'compact', opacity: 86 });
  });

  it('uses the original palette and spacing for older or invalid settings', () => {
    expect(parseSettings({ calendarOpen: true, opacity: 82 }))
      .toMatchObject({ theme: 'classic', density: 'comfortable', calendarOpen: true, opacity: 82 });
    expect(parseSettings({ theme: 'invalid', density: 'invalid' }))
      .toMatchObject({ theme: 'classic', density: 'comfortable' });
  });
});
