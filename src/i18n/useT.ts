import { useSessionState } from '../hooks/SessionContext.ts';
import { translator, type Translator } from './index.ts';

/** Translator for the current UI language; components re-render when the language changes. */
export function useT(): Translator {
  return translator(useSessionState().locale);
}
