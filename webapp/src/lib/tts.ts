// Web Speech API TTS for the dispatcher location tail. Replaces flutter_tts.
// Picks a US English female-ish voice when available; falls back to default.

export function speak(text: string, volume = 1.0): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    try {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.9;
      u.pitch = 1.0;
      u.volume = Math.max(0, Math.min(1, volume));

      const voices = synth.getVoices();
      const preferred = voices.find((v) => {
        const n = v.name.toLowerCase();
        const isUs = v.lang.toLowerCase().startsWith("en-us");
        const isFemale =
          n.includes("female") ||
          n.includes("zira") ||
          n.includes("aria") ||
          n.includes("jenny") ||
          n.includes("samantha") ||
          n.includes("google us english");
        return isUs && isFemale;
      });
      if (preferred) u.voice = preferred;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      // Safety timeout so the dispatcher chain never hangs.
      setTimeout(finish, 12000);
      // iOS can leave the queue paused after prior audio; resume + cancel any
      // stale silent prime before speaking the real text.
      try {
        synth.cancel();
        synth.resume();
      } catch {
        /* ignore */
      }
      synth.speak(u);
    } catch {
      resolve();
    }
  });
}

// Warm the voice list AND unlock speech. MUST be called from within a user
// gesture (e.g. the Start tap), synchronously, before any await.
//
// iOS Safari refuses speechSynthesis.speak() unless the engine has first been
// triggered by a speak() that originated inside a user gesture. The location is
// spoken much later — deep in the emergency dispatcher chain, with no gesture
// nearby — so without this prime, iOS silently drops it (the bug where the AI
// voice never says the location on iPhone). We speak a silent utterance now to
// satisfy that requirement. Desktop browsers don't need it but it's harmless.
export function warmUpVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.getVoices(); // kick off async voice-list loading
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}
