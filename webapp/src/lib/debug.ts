// Tiny on-screen debug log bus. Lets non-UI modules (audioEngine, tts, location)
// report what's happening so it can be shown on a phone where the dev console
// isn't reachable. No-op cost is trivial; safe to leave wired in.

type Listener = (lines: string[]) => void;

const listeners = new Set<Listener>();
const buffer: string[] = [];
let startMs = 0;

export function dlog(msg: string): void {
  if (startMs === 0) startMs = Date.now();
  const t = ((Date.now() - startMs) / 1000).toFixed(1).padStart(5, " ");
  const line = `${t}s  ${msg}`;
  buffer.push(line);
  if (buffer.length > 60) buffer.shift();
  // eslint-disable-next-line no-console
  console.log("[dbg]", line);
  for (const l of listeners) l([...buffer]);
}

export function clearDebug(): void {
  buffer.length = 0;
  startMs = 0;
}

export function getDebug(): string[] {
  return [...buffer];
}

export function subscribeDebug(l: Listener): () => void {
  listeners.add(l);
  l([...buffer]);
  return () => {
    listeners.delete(l);
  };
}
