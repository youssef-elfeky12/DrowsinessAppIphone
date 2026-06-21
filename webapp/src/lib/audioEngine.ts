// Browser port of lib/services/audio_engine.dart.
//
// Multi-track engine built on HTMLAudioElement. See DESIGN.md §4.
//   buzz     — one-shot focus reminder
//   pullover — looped pull-over voice
//   siren    — looped critical siren (volume ducking during dispatcher chain)
//   dialer   — one-shot 3-tone "112" dialing (digit offsets 71/437/701 ms)
//   calling  — ringback, played exactly 3 times
//   accept   — "911, what's your emergency"
//   intro    — pre-recorded dispatcher prefix
//   then live TTS speaks the location, and the siren ramps back up.

import { speak } from "./tts";
import { dlog } from "./debug";

const SND = "/sounds";

function shortSrc(src: string): string {
  return src.split("/").pop() ?? src;
}
export const DIAL_DIGIT_OFFSETS_MS = [71, 437, 701];

function mkAudio(src: string, loop = false): HTMLAudioElement {
  const a = new Audio(src);
  a.loop = loop;
  a.preload = "auto";
  return a;
}

export class AudioEngine {
  private buzz = mkAudio(`${SND}/buzz.mp3`);
  private pullover = mkAudio(`${SND}/PULLOVER.mp3`, true);
  private siren = mkAudio(`${SND}/sirenLoop.mp3`, true);
  private dialer = mkAudio(`${SND}/dialingButtons.m4a`);
  private calling = mkAudio(`${SND}/calling.mp3`);
  private accept = mkAudio(`${SND}/911accept.mp3`);
  private intro = mkAudio(`${SND}/dispatch_intro.mp3`);

  private master = 1.0;
  private callingPlaysLeft = 0;
  // True only while a real emergency dispatcher chain (calling → accept → intro
  // → TTS) is in progress. The chained "ended" handlers below must NOT fire
  // otherwise — e.g. during unlock(), where every clip is played briefly to
  // unlock it; without this guard, the calling clip's "ended" would spuriously
  // launch the 911-accept audio.
  private dispatcherActive = false;
  private emergencyLocationText: string | null = null;
  private dialerEndCb: (() => void) | null = null;
  private rampTimer: ReturnType<typeof setInterval> | null = null;

  init() {
    // Ringback chains: replay up to 3 times, then dispatcher pickup.
    this.calling.addEventListener("ended", () => {
      dlog(`chain: calling ended (active=${this.dispatcherActive}, left=${this.callingPlaysLeft})`);
      if (!this.dispatcherActive) return;
      this.callingPlaysLeft -= 1;
      if (this.callingPlaysLeft > 0) {
        void this.play(this.calling, this.master);
      } else {
        void this.play(this.accept, this.master);
      }
    });
    // After dispatcher pickup → cached prefix.
    this.accept.addEventListener("ended", () => {
      dlog(`chain: accept ended (active=${this.dispatcherActive}) → intro`);
      if (!this.dispatcherActive) return;
      void this.play(this.intro, this.master);
    });
    // After prefix → speak the location, then bring the siren back.
    this.intro.addEventListener("ended", async () => {
      dlog(`chain: intro ended (active=${this.dispatcherActive}) → speak location="${this.emergencyLocationText ?? "(none)"}"`);
      if (!this.dispatcherActive) return;
      await speak(this.emergencyLocationText ?? "an unknown location", this.master);
      this.unduckSiren();
      this.dispatcherActive = false;
    });
    // Dialer one-shot end.
    this.dialer.addEventListener("ended", () => {
      dlog("chain: dialer ended → callback");
      const cb = this.dialerEndCb;
      this.dialerEndCb = null;
      cb?.();
    });
  }

  /** Browsers require a user gesture to unlock audio. Call from a click. */
  async unlock() {
    const all = [this.buzz, this.pullover, this.siren, this.dialer,
      this.calling, this.accept, this.intro];
    // Pass 1: start every clip muted within the user gesture to unlock it.
    for (const a of all) {
      a.muted = true;
      // Don't let the looping siren/pullover run away if a pause gets dropped
      // (iOS); startSiren()/startPullover() re-enable looping when really used.
      a.loop = false;
      try {
        await a.play();
      } catch {
        /* autoplay blocked / interrupted — ignore */
      }
    }
    // Pass 2: hard-stop everything. Pausing here, after all the play() promises
    // have settled, is reliable on iOS — where pause-immediately-after-play is
    // frequently ignored, which used to leak the siren + dispatcher audio.
    for (const a of all) {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    }
  }

  setMasterVolume(v: number) {
    this.master = Math.max(0, Math.min(1, v));
  }

  setEmergencyLocationText(text: string | null) {
    this.emergencyLocationText = text;
  }

  private async play(a: HTMLAudioElement, volume: number) {
    try {
      a.volume = Math.max(0, Math.min(1, volume));
      a.currentTime = 0;
      await a.play();
    } catch (e) {
      dlog(`audio play FAILED: ${shortSrc(a.src)} — ${(e as Error).name}: ${(e as Error).message}`);
    }
  }

  async playBuzz() {
    this.buzz.pause();
    await this.play(this.buzz, this.master);
  }

  async startPullover() {
    if (!this.pullover.paused) return;
    this.pullover.loop = true;
    await this.play(this.pullover, this.master);
  }
  stopPullover() {
    this.pullover.pause();
    this.pullover.currentTime = 0;
  }

  async startSiren() {
    if (!this.siren.paused) return;
    this.siren.loop = true;
    await this.play(this.siren, this.master);
  }
  stopSiren() {
    this.siren.pause();
    this.siren.currentTime = 0;
  }
  // iOS Safari ignores HTMLAudioElement.volume (it's read-only on iPhone), so
  // volume-ducking is silent there and the dispatcher chain gets buried under
  // the siren. Pause the siren outright during the dispatcher chain instead —
  // reliable on every platform — then resume it once the location is spoken.
  duckSiren() {
    this.siren.pause();
  }
  unduckSiren() {
    if (this.siren.paused) {
      this.siren.loop = true;
      void this.play(this.siren, this.master);
    }
  }

  /** Plays the dialer one-shot. Returns the digit-offset timeline (ms). */
  async playDialer(): Promise<number[]> {
    dlog("chain: playDialer");
    await this.play(this.dialer, this.master);
    return DIAL_DIGIT_OFFSETS_MS;
  }

  onDialerEnd(cb: () => void) {
    this.dialerEndCb = cb;
  }

  async playCallingTimes(n: number) {
    dlog(`chain: playCallingTimes(${n})`);
    this.dispatcherActive = true; // arm the calling → accept → intro chain
    this.callingPlaysLeft = n;
    await this.play(this.calling, this.master);
  }

  stopCalling() {
    this.dispatcherActive = false;
    this.callingPlaysLeft = 0;
    this.calling.pause();
    this.calling.currentTime = 0;
  }

  stopAll() {
    this.dispatcherActive = false;
    if (this.rampTimer) {
      clearInterval(this.rampTimer);
      this.rampTimer = null;
    }
    this.stopPullover();
    this.stopSiren();
    this.stopCalling();
    for (const a of [this.dialer, this.accept, this.intro]) {
      a.pause();
      a.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.dialerEndCb = null;
  }

  private rampVolume(a: HTMLAudioElement, target: number, ms: number) {
    if (this.rampTimer) clearInterval(this.rampTimer);
    const steps = 10;
    const stepMs = Math.round(ms / steps);
    const start = a.volume;
    let i = 0;
    this.rampTimer = setInterval(() => {
      i += 1;
      const v = start + (target - start) * (i / steps);
      a.volume = Math.max(0, Math.min(1, v));
      if (i >= steps && this.rampTimer) {
        clearInterval(this.rampTimer);
        this.rampTimer = null;
      }
    }, stepMs);
  }

  dispose() {
    this.stopAll();
  }
}
