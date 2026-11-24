/** Engines a random pick (long press on ENGINE) may land on: drivable now and not the current one. */
export function randomEnginePool(ids: readonly string[], currentId: string, drivable: (id: string) => boolean): string[] {
  return ids.filter((id) => id !== currentId && drivable(id));
}
