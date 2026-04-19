'use client';
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'selectedGroupId';

function readStored(): string {
  if (typeof window === 'undefined') return '';
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}

/**
 * Persists the selected group ID to localStorage.
 * URL search param `group` takes priority over stored value.
 */
export function useSelectedGroup(urlGroupId?: string): [string, (id: string) => void] {
  const [value, setValue] = useState(() => urlGroupId || readStored());

  const setGroup = useCallback((id: string) => {
    setValue(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* noop */ }
  }, []);

  return [value, setGroup];
}
