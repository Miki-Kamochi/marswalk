import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanFeedback, type ScanFeedback } from './scan-feedback.ts';

const good: ScanFeedback = {
  sampleCount: 64, repeated: false, accepted: false, improved: false,
  coverage: .7, contrast: .4, clarity: .9, orientation: .8, uniqueness: .4, quality: .7,
};

test('scan rejection explains the actual failed requirement', () => {
  assert.match(scanFeedback({ ...good, sampleCount: 8, coverage: .1 }), /視界が狭すぎます/);
  assert.match(scanFeedback({ ...good, clarity: .7 }), /周辺が暗すぎます/);
  assert.match(scanFeedback({ ...good, contrast: .02 }), /コントラストが低すぎます/);
  assert.match(scanFeedback({ ...good, uniqueness: .01 }), /似た地形が多すぎます/);
  assert.match(scanFeedback({ ...good, repeated: true }), /8 m以上移動/);
  assert.match(scanFeedback(good), /衛星写真と周辺地形が一致しません/);
});
