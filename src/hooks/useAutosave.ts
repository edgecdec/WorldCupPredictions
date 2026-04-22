import { useState, useEffect, useRef, useCallback } from 'react';

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 2000;

interface UseAutosaveOptions {
  /** Current data serialized as JSON string */
  dataJson: string;
  /** Whether autosave is disabled (locked, no user, etc.) */
  disabled: boolean;
  /** Async function that performs the save. Return true on success. */
  saveFn: () => Promise<boolean>;
}

export function useAutosave({ dataJson, disabled, saveFn }: UseAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const savedRef = useRef<string>(dataJson);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  // Reset saved ref when disabled changes (e.g. user logs in and loads picks)
  const prevDisabled = useRef(disabled);
  useEffect(() => {
    if (prevDisabled.current && !disabled) {
      savedRef.current = dataJson;
    }
    prevDisabled.current = disabled;
  }, [disabled, dataJson]);

  // Sync saved ref when data is loaded from server
  const markSaved = useCallback((json: string) => {
    savedRef.current = json;
    setStatus('idle');
  }, []);

  // Debounced autosave
  useEffect(() => {
    if (disabled) return;
    if (dataJson === savedRef.current) return;
    // Don't autosave empty data
    if (dataJson === '{}' || dataJson === '[]' || dataJson === '""') return;

    setStatus('unsaved');
    const timer = setTimeout(async () => {
      setStatus('saving');
      try {
        const ok = await saveFnRef.current();
        if (ok) {
          savedRef.current = dataJson;
          setStatus('saved');
        } else {
          setStatus('error');
        }
      } catch {
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dataJson, disabled]);

  // Warn on unsaved changes
  useEffect(() => {
    if (disabled || dataJson === savedRef.current) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dataJson, disabled]);

  return { status, markSaved };
}
