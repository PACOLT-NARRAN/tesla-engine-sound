/**
 * Media Session: shows REVLINE and the running engine in the car's media player (Tesla
 * Miniplayer) while the browser is minimised, with play / pause / stop working from there.
 * Does nothing where the API is missing.
 */
export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  stop: () => void;
}

function api(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
}

/** `info` null = engine off: clear the player entry. */
export function updateMediaSession(info: { engine: string; playing: boolean } | null, handlers?: MediaSessionHandlers): void {
  const ms = api();
  if (!ms) return;
  try {
    if (!info) {
      ms.metadata = null;
      ms.playbackState = 'none';
      for (const a of ['play', 'pause', 'stop'] as const) ms.setActionHandler(a, null);
      return;
    }
    if (typeof MediaMetadata !== 'undefined') {
      const icon = new URL('favicon.svg', document.baseURI).href;
      ms.metadata = new MediaMetadata({
        title: `REVLINE · ${info.engine}`,
        artist: 'REVLINE',
        album: 'Responsive Electric Vehicle Live Immersive Natural Experience',
        artwork: [{ src: icon, sizes: '512x512', type: 'image/svg+xml' }],
      });
    }
    ms.playbackState = info.playing ? 'playing' : 'paused';
    if (handlers) {
      ms.setActionHandler('play', handlers.play);
      ms.setActionHandler('pause', handlers.pause);
      ms.setActionHandler('stop', handlers.stop);
    }
  } catch {
    // Some browsers reject unknown actions; the sound itself is unaffected.
  }
}
