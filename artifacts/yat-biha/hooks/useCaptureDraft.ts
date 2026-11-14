import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_PREVIEW } from '@/config/runtime';
import type { ReportInput } from '@/context/ReportsContext';
import { CaptureDraft, readCaptureDraft } from '@/utils/reportCapture';

/** Drafts contain only the editable public report. They never contain ownership evidence. */
export function useCaptureDraft(id: string, value: ReportInput, step: number) {
  const key = `yat-biha.${IS_PREVIEW ? 'preview' : 'local'}.capture.v1.${id}`;
  const [existing, setExisting] = useState<CaptureDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [hydrationError, setHydrationError] = useState<'read' | 'corrupt' | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const active = useRef(true);
  const permitted = useRef(false);
  const readGeneration = useRef(0);
  const latest = useRef<CaptureDraft>({ version: 1, value, step, savedAt: Date.now() });
  latest.current = { version: 1, value, step, savedAt: Date.now() };

  const save = useCallback((draft: CaptureDraft) => {
    if (done.current || !permitted.current) return queue.current;
    if (active.current) setStatus('saving');
    const next = queue.current.catch(() => {}).then(async () => {
      if (done.current) return;
      await AsyncStorage.setItem(key, JSON.stringify(draft));
      if (active.current) setStatus('saved');
    });
    queue.current = next;
    void next.catch(() => { if (active.current) setStatus('error'); });
    return next;
  }, [key]);

  const retryHydration = useCallback(async () => {
    const generation = ++readGeneration.current;
    permitted.current = false;
    setResolved(false);
    setHydrating(true);
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!active.current || done.current || generation !== readGeneration.current) return;
      const draft = readCaptureDraft(raw);
      if (raw !== null && !draft) {
        setExisting(null);
        setHydrationError('corrupt');
        setStatus('error');
        return;
      }
      setHydrationError(null);
      setExisting(draft);
      setResolved(!draft);
      permitted.current = !draft;
      setStatus('idle');
    } catch {
      if (active.current && !done.current && generation === readGeneration.current) {
        // A failed read says nothing about whether a valuable draft exists.
        // Keep both autosave and unmount writes disabled until an explicit choice.
        setExisting(null);
        setHydrationError('read');
        setStatus('error');
      }
    } finally {
      if (active.current && generation === readGeneration.current) {
        setReady(true);
        setHydrating(false);
      }
    }
  }, [key]);

  useEffect(() => {
    active.current = true;
    void retryHydration();
    return () => {
      readGeneration.current++;
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      const last = latest.current.value;
      if (!done.current && permitted.current && (last.title.trim() || last.description.trim() || last.photoUri || last.place.trim())) void save(latest.current).catch(() => {});
    };
  }, [retryHydration, save]);

  const serialized = JSON.stringify({ value, step });
  useEffect(() => {
    if (!ready || !resolved || done.current) return;
    // Empty untouched forms do not create a restoration prompt.
    if (!value.title.trim() && !value.description.trim() && !value.photoUri && !value.place.trim()) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(latest.current).catch(() => {}); }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [serialized, ready, resolved, save]);

  const restore = useCallback(() => {
    setExisting(null); setResolved(true); permitted.current = true; setHydrationError(null); setStatus('saved');
  }, []);

  const discard = useCallback(async () => {
    readGeneration.current++;
    if (timer.current) clearTimeout(timer.current);
    await queue.current.catch(() => {});
    await AsyncStorage.removeItem(key);
    setExisting(null); setResolved(true); permitted.current = true; setHydrationError(null); setHydrating(false); setStatus('idle');
  }, [key]);

  const finish = useCallback(async () => {
    const ownsStoredDraft = permitted.current;
    done.current = true;
    readGeneration.current++;
    if (timer.current) clearTimeout(timer.current);
    await queue.current.catch(() => {});
    // Publishing current form data does not authorize deleting an unread draft.
    if (ownsStoredDraft) await AsyncStorage.removeItem(key).catch(() => {});
  }, [key]);

  return { existing, ready, resolved, status, hydrationError, hydrating, retryHydration, restore, discard, finish };
}
