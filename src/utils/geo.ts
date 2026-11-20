const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two WGS84 points. */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Move a point north by `metres` (used by the demo source to synthesise coordinates). */
export function offsetNorth(lat: number, lon: number, metres: number): { lat: number; lon: number } {
  return { lat: lat + (metres / EARTH_RADIUS_M) * (180 / Math.PI), lon };
}
