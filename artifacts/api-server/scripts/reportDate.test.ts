import assert from 'node:assert/strict';
import test from 'node:test';
import { saudiCalendarDate, validReportDate } from '../src/lib/reportDate';

test('Saudi midnight accepts the local calendar day before UTC rolls over', () => {
  const now = new Date('2026-11-13T21:30:00Z');
  assert.equal(saudiCalendarDate(now), '2026-11-14');
  assert.equal(validReportDate('2026-11-14', now), true);
  assert.equal(validReportDate('2026-11-15', now), false);
  assert.equal(validReportDate('2026-11-14', new Date('2026-11-13T20:59:59Z')), false);
});

test('only real canonical calendar dates are accepted', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  assert.equal(validReportDate('2024-02-29', now), true);
  for (const value of ['2025-02-29', '2026-04-31', '2026-2-01', '2026-01-01T00:00:00Z', 'invalid', '2026-00-01']) {
    assert.equal(validReportDate(value, now), false, value);
  }
});
