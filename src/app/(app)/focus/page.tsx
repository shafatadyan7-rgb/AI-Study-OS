'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';

type Mode = 'pomodoro' | 'stopwatch' | 'countdown';

const POMODORO_SECONDS = 25 * 60;

export default function FocusPage() {
  const [mode, setMode] = useState<Mode>('pomodoro');
  const [countdownMinutes, setCountdownMinutes] = useState(20);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [reflection, setReflection] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [summary, setSummary] = useState<{ minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running]);

  const start = async () => {
    setError(null);
    try {
      const s = await api.focus.start({ activity: 'focus' });
      setSessionId(s.sessionId);
      setElapsed(0);
      setSummary(null);
      setRunning(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a focus session.');
    }
  };

  const finish = async () => {
    if (!sessionId) return;
    setRunning(false);
    try {
      // Duration is computed server-side from the stored start time — the
      // elapsed count shown here is only a display, never sent as the truth.
      const r = await api.focus.finish({ sessionId, reflection: reflection || undefined, confidence });
      setSummary({ minutes: Math.round(r.durationSeconds / 60) });
      setSessionId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that session.');
    }
  };

  const target = mode === 'pomodoro' ? POMODORO_SECONDS : mode === 'countdown' ? countdownMinutes * 60 : null;
  const display = target !== null ? Math.max(target - elapsed, 0) : elapsed;
  const mm = String(Math.floor(display / 60)).padStart(2, '0');
  const ss = String(display % 60).padStart(2, '0');

  useEffect(() => {
    if (target !== null && elapsed >= target && running) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  return (
    <div className="focus-center">
      <div className="scopebar" role="radiogroup" aria-label="Timer mode">
        {(['pomodoro', 'countdown', 'stopwatch'] as Mode[]).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} className={`scopechip ${mode === m ? 'active' : ''}`}
            onClick={() => { if (!running) setMode(m); }} disabled={running}>
            {m === 'pomodoro' ? 'Pomodoro' : m === 'countdown' ? 'Countdown' : 'Stopwatch'}
          </button>
        ))}
      </div>

      {mode === 'countdown' && !running && (
        <div>
          <label htmlFor="cd" className="dim" style={{ fontSize: 12 }}>Minutes</label>{' '}
          <input id="cd" type="number" min={5} max={120} value={countdownMinutes}
            onChange={(e) => setCountdownMinutes(Number(e.target.value))} style={{ width: 70, display: 'inline-block' }} />
        </div>
      )}

      <div className="focus-timer" aria-live="polite">{mm}:{ss}</div>

      {!running && (
        <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="What are you working on? (optional)"
          style={{ maxWidth: 320 }} aria-label="Current task" />
      )}
      {task && <p className="focus-task">{task}</p>}

      {error && <p className="error" role="alert">{error}</p>}

      <div className="focus-controls">
        {!running && !sessionId && <button className="btn primary" onClick={start}>Start</button>}
        {running && <button className="btn" onClick={finish}>Finish</button>}
      </div>

      {summary && (
        <div className="card" style={{ maxWidth: 380, textAlign: 'left' }}>
          <p style={{ marginBottom: 10 }}>Session saved — {summary.minutes} minute{summary.minutes === 1 ? '' : 's'}.</p>
          <label htmlFor="refl" className="dim" style={{ fontSize: 12 }}>What did you learn?</label>
          <textarea id="refl" value={reflection} onChange={(e) => setReflection(e.target.value)} rows={2} style={{ marginBottom: 8 }} />
          <label htmlFor="conf" className="dim" style={{ fontSize: 12 }}>Confidence (1–5)</label>
          <input id="conf" type="range" min={1} max={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
        </div>
      )}
    </div>
  );
}
