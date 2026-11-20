import type { ReactNode } from 'react';
import { useT } from '../i18n/useT.ts';

/** Full-height touch sheet used for engine select, demo and settings. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="sheet-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
