import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
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
  const writeEpoch = useRef(0);
  const savedContent = useRef<string | null>(null);
  const stagedFields = useRef<Partial<ReportInput>>({});
  const stagedStep = useRef<number | null>(null);
  const latest = useRef<CaptureDraft>({ version: 1, value, step, savedAt: Date.now() });
  // Input handlers can run before React commits their state updates. Retain
  // their synchronous snapshot until the corresponding values reach render.
  for (const field of Object.keys(stagedFields.current) as (keyof ReportInput)[]) {
    if (Object.is(value[field], stagedFields.current[field])) delete stagedFields.current[field];
  }
  if (step === stagedStep.current) stagedStep.current = null;
  latest.current = { version: 1, value: { ...value, ...stagedFields.current }, step: stagedStep.current ?? step, savedAt: Date.now() };

  const save = useCallback((draft: CaptureDraft, synchronousWebFlush = false) => {
    if (done.current || !permitted.current) return queue.current;
    // AsyncStorage's web adapter writes localStorage synchronously within
    // setItem. Invoke it before pagehide returns, rather than enqueueing a
    // promise callback that the browser may discard during navigation.
    const epoch = synchronousWebFlush ? ++writeEpoch.current : writeEpoch.current;
    const content = JSON.stringify({ value: draft.value, step: draft.step });
    if (active.current) setStatus('saving');
    const write = async () => {
      if (done.current || !permitted.current || epoch !== writeEpoch.current) return;
      await AsyncStorage.setItem(key, JSON.stringify(draft));
      if (epoch !== writeEpoch.current) return;
      savedContent.current = content;
      const currentContent = JSON.stringify({ value: latest.current.value, step: latest.current.step });
      if (active.current) setStatus(content === currentContent ? 'saved' : 'saving');
    };
    const next = synchronousWebFlush ? write() : queue.current.catch(() => {}).then(write);
    queue.current = next;
    void next.catch(() => { if (active.current && epoch === writeEpoch.current) setStatus('error'); });
    return next;
  }, [key]);

  const stageEdit = useCallback((patch: Partial<ReportInput>, nextStep?: number): ReportInput => {
    stagedFields.current = { ...stagedFields.current, ...patch };
    if (nextStep !== undefined) stagedStep.current = nextStep;
    const nextValue = { ...latest.current.value, ...patch };
    latest.current = { version: 1, value: nextValue, step: nextStep ?? latest.current.step, savedAt: Date.now() };
    if (!done.current && permitted.current && (nextValue.title.trim() || nextValue.description.trim() || nextValue.photoUri || nextValue.place.trim() || savedContent.current !== null)) {
      if (active.current) setStatus('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void save(latest.current).catch(() => {}); }, 450);
    }
    return nextValue;
  }, [save]);

  const flushLatest = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const last = latest.current.value;
    if (!done.current && permitted.current && (last.title.trim() || last.description.trim() || last.photoUri || last.place.trim() || savedContent.current !== null)) {
      void save(latest.current, Platform.OS === 'web').catch(() => {});
    }
  }, [save]);

  const retryHydration = useCallback(async () => {
    const generation = ++readGeneration.current;
    writeEpoch.current++;
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
      flushLatest();
    };
  }, [retryHydration, flushLatest]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flushLatest(); };
      window.addEventListener('pagehide', flushLatest);
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => {
        window.removeEventListener('pagehide', flushLatest);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') flushLatest();
    });
    return () => subscription.remove();
  }, [flushLatest]);

  const serialized = JSON.stringify({ value: latest.current.value, step: latest.current.step });
  useEffect(() => {
    if (!ready || !resolved || done.current) return;
    // Empty untouched forms do not create a restoration prompt.
    const current = latest.current.value;
    if (!current.title.trim() && !current.description.trim() && !current.photoUri && !current.place.trim() && savedContent.current === null) return;
    setStatus('saving');
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

  // Rendering new text must never display a stale "saved" acknowledgement,
  // even in the render before the debounce effect marks the edit pending.
  const currentStatus = status === 'saved' && resolved && serialized !== savedContent.current ? 'saving' : status;
  return { existing, ready, resolved, status: currentStatus, hydrationError, hydrating, retryHydration, stageEdit, restore, discard, finish };
}
