/**
 * Garage engine preview: a short scripted rev sequence played with the car standing still,
 * using the same drivetrain + audio pipeline as driving (REV pedal held / released).
 * Pure data, unit tested.
 */

/** [start s, end s) windows in which the REV pedal is held. */
export const PREVIEW_REV_WINDOWS: readonly (readonly [number, number])[] = [
  [1.0, 1.25], // short blip after start-up
  [2.0, 3.6], // long pull toward the limiter
  [5.0, 5.2], // final blip
];

/** Total preview length in seconds (then the engine is switched off). */
export const PREVIEW_SECONDS = 6.5;

export function revPedalAt(t: number): boolean {
  return PREVIEW_REV_WINDOWS.some(([a, b]) => t >= a && t < b);
}
