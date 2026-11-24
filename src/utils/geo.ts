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

/** Initial bearing (degrees clockwise from north, 0..360) from point 1 to point 2. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Signed smallest difference b - a between two headings, -180..180. */
export function headingDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/** Move a point by `metres` along heading `deg` (demo source: curvy roads). */
export function offsetHeading(lat: number, lon: number, metres: number, deg: number): { lat: number; lon: number } {
  const r = toRad(deg);
  const dLat = (metres * Math.cos(r)) / EARTH_RADIUS_M;
  const dLon = (metres * Math.sin(r)) / (EARTH_RADIUS_M * Math.cos(toRad(lat)));
  return { lat: lat + (dLat * 180) / Math.PI, lon: lon + (dLon * 180) / Math.PI };
}
