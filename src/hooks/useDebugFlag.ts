export function isDebugEnabled(): boolean {
  if (typeof location === 'undefined') return false;
  const v = new URLSearchParams(location.search).get('debug');
  return v === '1' || v === 'true';
}
