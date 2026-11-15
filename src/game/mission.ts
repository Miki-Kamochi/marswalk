export const SPEEDS = [1, 4, 8, 16, 32] as const;
export type Speed = typeof SPEEDS[number];
export const STRAIGHT_LINE_RESERVE = 15 * 60;
/** Maximum suited walking speed measured in game-time metres per second. */
export const GAME_WALK_PACE = 1.15;

/** Gives a perfect straight, unobstructed run exactly fifteen minutes in reserve. */
export const timeLimitForDistance = (distance: number) => Math.ceil(distance / GAME_WALK_PACE + STRAIGHT_LINE_RESERVE);

/** Player.update already encodes the old 4x speed, so this keeps 4x unchanged. */
export const movementScale = (speed: Speed) => speed / 4;

/** 15-minute game-time cycle with a mild, periodic increase in airborne dust. */
export function stormLevel(time: number): number {
  const cycle = ((time % (15 * 60)) + 15 * 60) % (15 * 60);
  if (cycle < 8 * 60) return 0.2;
  if (cycle < 10 * 60) return 0.2 + 0.4 * (cycle - 8 * 60) / 120;
  if (cycle < 13 * 60) return 0.6;
  return 0.6 - 0.4 * (cycle - 13 * 60) / 120;
}
