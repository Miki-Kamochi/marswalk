import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAME_WALK_PACE, movementScale, SPEEDS, stormLevel, STRAIGHT_LINE_RESERVE, timeLimitForDistance } from './mission.ts';

test('simulation multipliers scale walking and game time consistently', () => {
  assert.deepEqual(SPEEDS, [1, 4, 8, 16]);
  for (const speed of SPEEDS) assert.equal(movementScale(speed) * 4, speed);
  assert.equal(movementScale(4), 1);
});

test('straight-line maximum pace leaves fifteen game minutes in reserve', () => {
  const distance = 3195.318;
  const limit = timeLimitForDistance(distance);
  assert(limit - distance / GAME_WALK_PACE >= STRAIGHT_LINE_RESERVE);
  assert(limit - distance / GAME_WALK_PACE < STRAIGHT_LINE_RESERVE + 1);
});

test('dust storm repeats every fifteen game minutes and has a visible peak', () => {
  for (const t of [0, 60, 479, 520, 610, 779, 850]) assert.equal(stormLevel(t), stormLevel(t + 900));
  assert.equal(stormLevel(0), 0.25);
  assert(stormLevel(9 * 60) > 0.25 && stormLevel(9 * 60) < 0.95);
  assert.equal(stormLevel(11 * 60), 0.95);
  assert(stormLevel(14 * 60) > 0.25 && stormLevel(14 * 60) < 0.95);
});
