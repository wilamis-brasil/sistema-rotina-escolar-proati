import type { NotificationSoundId } from "../../domain/types";

interface ToneStep {
  freq: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
}

type ToneRecipe = ToneStep[];

const RECIPES: Record<Exclude<NotificationSoundId, "none">, ToneRecipe> = {
  default: [
    { freq: 880, duration: 0.16 },
    { freq: 660, duration: 0.18 },
  ],
  soft: [
    { freq: 523.25, duration: 0.18, type: "sine", volume: 0.05 },
    { freq: 659.25, duration: 0.22, type: "sine", volume: 0.05 },
  ],
  alert: [
    { freq: 1200, duration: 0.1, type: "square" },
    { freq: 0, duration: 0.04 },
    { freq: 1200, duration: 0.1, type: "square" },
  ],
  bell: [
    { freq: 988, duration: 0.22, type: "triangle" },
    { freq: 740, duration: 0.32, type: "triangle", volume: 0.06 },
  ],
};

interface SoundPlayer {
  play(soundId: NotificationSoundId): Promise<void>;
}

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext) return sharedContext;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
    return sharedContext;
  } catch {
    return null;
  }
}

export function createSoundPlayer(): SoundPlayer {
  async function play(soundId: NotificationSoundId): Promise<void> {
    if (soundId === "none") return;
    const recipe = RECIPES[soundId];
    if (!recipe) return;

    const ctx = getContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }

    let time = ctx.currentTime;
    recipe.forEach((step) => {
      if (step.freq === 0) {
        time += step.duration;
        return;
      }
      const osc = ctx.createOscillator();
      osc.type = step.type ?? "sine";
      osc.frequency.setValueAtTime(step.freq, time);
      const gain = ctx.createGain();
      const volume = step.volume ?? 0.08;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + step.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + step.duration + 0.02);
      time += step.duration;
    });
  }

  return { play };
}
