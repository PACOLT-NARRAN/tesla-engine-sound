import { useEffect, useState } from 'react';
import { RESEND_COOLDOWN_MS } from '../backend/account.ts';
import { EMAIL_MAX } from '../backend/authApi.ts';
import { useAccount, useSession } from '../hooks/SessionContext.ts';
import { useT } from '../i18n/useT.ts';

/**
 * Profile → Account. Optional sign-in with an e-mail one-time code (typed in the car, no link to
 * open). Signing in unlocks nothing yet; it prepares purchases and restoring them on another device.
 */
export function AccountSection() {
  const session = useSession();
  const a = useAccount();
  const t = useT();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [, tick] = useState(0);

  // Re-render once a second while the "send again" cooldown runs.
  useEffect(() => {
    if (a.status !== 'code-sent') return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [a.status]);

  const error = a.error ? <p className="account-error" role="alert">{t(`account.err.${a.error}`)}</p> : null;

  let body;
  if (a.status === 'unavailable') {
    body = <p className="profile-local">{t('account.unavailable')}</p>;
  } else if (a.status === 'signed-in') {
    body = (
      <>
        <p className="account-who">{t('account.signedInAs')} <strong data-testid="account-email">{a.email}</strong></p>
        <p className="profile-local">{t('account.signedInHint')}</p>
        <div className="profile-buttons">
          <button className="btn" data-action="account-sign-out" onClick={() => void session.account.signOut()}>{t('account.signOut')}</button>
        </div>
      </>
    );
  } else if (a.status === 'code-sent') {
    const waitS = a.codeSentAt === null ? 0 : Math.max(0, Math.ceil((a.codeSentAt + RESEND_COOLDOWN_MS - Date.now()) / 1000));
    const verify = async () => {
      if (await session.account.verifyCode(code)) setCode('');
    };
    body = (
      <form className="account-form" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <p className="profile-local">{t('account.codeSent', { email: a.email ?? '' })}</p>
        <label className="studio-field">
          <span className="studio-label">{t('account.code')}</span>
          <input
            className="account-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={12}
            placeholder="123456" onChange={(e) => setCode(e.target.value)} data-testid="account-code"
          />
        </label>
        {error}
        <div className="profile-buttons">
          <button type="submit" className="btn btn-primary" disabled={a.busy || code.trim() === ''}>{a.busy ? t('account.working') : t('account.verify')}</button>
          <button type="button" className="btn" disabled={a.busy || waitS > 0} onClick={() => void session.account.resendCode()} data-action="account-resend">
            {waitS > 0 ? t('account.resendIn', { s: waitS }) : t('account.resend')}
          </button>
          <button type="button" className="btn" disabled={a.busy} onClick={() => { setCode(''); session.account.cancelCode(); }}>{t('account.otherEmail')}</button>
        </div>
        <p className="setting-hint">{t('account.codeHint')}</p>
      </form>
    );
  } else {
    body = (
      <form className="account-form" noValidate onSubmit={(e) => { e.preventDefault(); void session.account.requestCode(email); }}>
        <p className="profile-local">{t('account.intro')}</p>
        <label className="studio-field">
          <span className="studio-label">{t('account.email')}</span>
          <input
            type="email" value={email} maxLength={EMAIL_MAX} autoComplete="email" inputMode="email"
            placeholder={t('account.emailPlaceholder')} onChange={(e) => setEmail(e.target.value)} data-testid="account-email-input"
          />
        </label>
        {error}
        <div className="profile-buttons">
          <button type="submit" className="btn btn-primary" disabled={a.busy || email.trim() === ''}>{a.busy ? t('account.working') : t('account.sendCode')}</button>
        </div>
        <p className="setting-hint">{t('account.privacy')}</p>
      </form>
    );
  }

  return (
    <section className="profile-section account" data-account={a.status}>
      <h3>{t('account.title')}</h3>
      {body}
    </section>
  );
}
