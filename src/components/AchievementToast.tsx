import { useEffect } from 'react';
import { useSession, useSessionState } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';

const SHOW_MS = 6000;

/** Short, non-blocking "achievement unlocked" note. Tap to close; disappears on its own. */
export function AchievementToast() {
  const session = useSession();
  const toast = useSessionState().achievementToast;
  const t = useT();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => session.dismissAchievementToast(), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast, session]);
  if (!toast || toast.ids.length === 0) return null;
  const first = toast.ids[0] as string;
  const more = toast.ids.length - 1;
  return (
    <button className="ach-toast" role="status" aria-live="polite" onClick={() => session.dismissAchievementToast()}>
      <span className="ach-toast-medal" aria-hidden="true">✓</span>
      <span>
        <small>{t('profile.toast')}</small>
        <strong>{t.dyn(`ach.${first}.title`) ?? first}{more > 0 ? ` ${t('profile.toastMore', { n: more })}` : ''}</strong>
      </span>
    </button>
  );
}
