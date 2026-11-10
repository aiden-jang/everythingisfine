export function measurementHz(value: number, min: number, max: number): number | null {
  if (![value, min, max].every(Number.isFinite) || max <= min) return null;
  return 220 * 2 ** (2 * Math.max(0, Math.min(1, (value - min) / (max - min))));
}

export function createMeasurementVoice(Context: typeof AudioContext = AudioContext) {
  const context = new Context();
  let closed = false;
  let last = -Infinity;
  let voice: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  const release = () => {
    if (!voice) return;
    voice.oscillator.onended = null;
    voice.oscillator.stop();
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    voice = null;
  };
  return {
    ready: context.resume(),
    play(value: number, min: number, max: number) {
      const hz = measurementHz(value, min, max);
      const at = context.currentTime;
      if (closed || context.state !== "running" || document.hidden || hz === null || at - last < 0.22) return;
      release();
      last = at;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      voice = { oscillator, gain };
      oscillator.type = "sine";
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.035, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (voice?.oscillator === oscillator) voice = null;
      };
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    },
    close() {
      if (closed) return;
      closed = true;
      release();
      void context.close().catch(() => {});
    },
  };
}
