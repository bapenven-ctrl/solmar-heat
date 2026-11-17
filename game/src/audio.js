// All sound is procedural WebAudio: an engine hum that follows speed, a
// two-tone police siren, a gunshot, a punch thump, a pickup chime and UI
// clicks. No audio file is ever loaded.
export function createSoundEngine() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 42;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(context.destination);
      sirenOsc.start();
    } catch {
      context = null;
    }
  }

  function resume() {
    ensure();
    if (context && context.state === 'suspended') context.resume();
  }

  function noiseBurst(duration, volume, frequency) {
    if (!context) return;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();
  }

  function tone(freqStart, freqEnd, duration, volume, type) {
    if (!context) return;
    const osc = context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqStart, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  return {
    /** Call from any user gesture so the browser lets audio start. */
    unlock() {
      resume();
    },
    /** speed01 is 0..1; 0 silences the engine. */
    engine(speed01) {
      if (!context || muted) return;
      engineOsc.frequency.value = 42 + speed01 * 95;
      engineGain.gain.value = speed01 > 0.02 ? 0.035 + speed01 * 0.05 : 0;
    },
    /** dt is the fixed step; the siren alternates two tones while on. */
    siren(on, dt) {
      if (!context) return;
      if (!on || muted) {
        sirenGain.gain.value = 0;
        return;
      }
      sirenPhase += dt;
      const high = Math.floor(sirenPhase / 0.45) % 2 === 0;
      sirenOsc.frequency.value = high ? 950 : 680;
      sirenGain.gain.value = 0.028;
    },
    gunshot() {
      if (muted) return;
      resume();
      noiseBurst(0.14, 0.5, 1800);
      tone(180, 60, 0.12, 0.25, 'square');
    },
    punch() {
      if (muted) return;
      resume();
      tone(150, 55, 0.12, 0.4, 'sine');
      noiseBurst(0.06, 0.2, 900);
    },
    pickup() {
      if (muted) return;
      resume();
      tone(660, 660, 0.09, 0.22, 'sine');
      setTimeout(() => tone(990, 990, 0.14, 0.22, 'sine'), 90);
    },
    click() {
      if (muted) return;
      resume();
      tone(880, 880, 0.05, 0.15, 'sine');
    },
    toggleMute() {
      muted = !muted;
      if (muted && engineGain) engineGain.gain.value = 0;
      if (muted && sirenGain) sirenGain.gain.value = 0;
      return muted;
    },
    get isMuted() {
      return muted;
    },
  };
}
