/**
 * Simulation clock that keeps ticking while the page is hidden (Tesla: browser minimised,
 * audio keeps playing in the background). Timers of hidden pages are throttled by the browser;
 * timers inside a Web Worker are not, so the engine keeps following the car. Falls back to a
 * plain interval where Workers are unavailable (tests, very old browsers).
 */
export type StopClock = () => void;

const WORKER_SOURCE =
  'let id=null;onmessage=(e)=>{clearInterval(id);id=null;if(e.data>0)id=setInterval(()=>postMessage(0),e.data);};';

export function startTickClock(intervalMs: number, onTick: () => void): StopClock {
  const g = globalThis as { Worker?: typeof Worker; Blob?: typeof Blob; URL?: typeof URL };
  if (g.Worker && g.Blob && g.URL && typeof g.URL.createObjectURL === 'function') {
    try {
      const url = g.URL.createObjectURL(new g.Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      const worker = new g.Worker(url);
      worker.onmessage = () => onTick();
      worker.postMessage(intervalMs);
      return () => {
        worker.terminate();
        g.URL?.revokeObjectURL(url);
      };
    } catch {
      // Blocked worker (CSP, sandbox): use the page timer.
    }
  }
  const id = setInterval(onTick, intervalMs);
  return () => clearInterval(id);
}
