export const SPEEDS = [1, 4, 8, 16] as const;
export type Speed = typeof SPEEDS[number];
export const STRAIGHT_LINE_RESERVE = 15 * 60;
/** Maximum suited walking speed measured in game-time metres per second. */
export const GAME_WALK_PACE = 1.15;

/** Gives a perfect straight, unobstructed run exactly fifteen minutes in reserve. */
export const timeLimitForDistance = (distance: number) => Math.ceil(distance / GAME_WALK_PACE + STRAIGHT_LINE_RESERVE);

/** Player.update already encodes the old 4x speed, so this keeps 4x unchanged. */
export const movementScale = (speed: Speed) => speed / 4;

/** 15-minute game-time cycle: 8 clear, 2 building, 3 at peak, 2 fading. */
export function stormLevel(time: number): number {
  const cycle = ((time % (15 * 60)) + 15 * 60) % (15 * 60);
  if (cycle < 8 * 60) return 0.25;
  if (cycle < 10 * 60) return 0.25 + 0.7 * (cycle - 8 * 60) / 120;
  if (cycle < 13 * 60) return 0.95;
  return 0.95 - 0.7 * (cycle - 13 * 60) / 120;
}
