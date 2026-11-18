// Procedural WebAudio: engine hum tied to speed, two-tone siren, gunshot,
// punch, pickup chime and UI clicks. No audio files, created on first gesture.
export class AudioSys {
  constructor() { this.ctx = null; this.muted = false; this.sirenOn = false; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);
    // Engine: sawtooth through a lowpass, pitch follows speed.
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 40;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 300;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter).connect(this.engGain).connect(this.master);
    this.engOsc.start();
    // Siren: square LFO between two tones.
    this.sirOsc = ctx.createOscillator(); this.sirOsc.type = 'triangle'; this.sirOsc.frequency.value = 700;
    this.sirGain = ctx.createGain(); this.sirGain.gain.value = 0;
    this.sirOsc.connect(this.sirGain).connect(this.master); this.sirOsc.start();
    this.sirPhase = 0;
  }
  tone(freq, dur, type = 'sine', vol = 0.25, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }
  noise(dur, vol = 0.4) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x40000000 - 1) * (1 - i / len); }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(g).connect(this.master); src.start();
  }
  shot() { this.noise(0.16, 0.5); this.tone(160, 0.1, 'square', 0.2, -100); }
  punch() { this.tone(90, 0.12, 'sine', 0.5, -40); }
  pickup() { this.tone(660, 0.09, 'sine', 0.25); setTimeout(() => this.tone(990, 0.14, 'sine', 0.25), 70); }
  click() { this.tone(440, 0.05, 'square', 0.12); }
  update(dt, speed, driving, sirenNear) {
    if (!this.ctx) return;
    const m = this.muted ? 0 : 1;
    if (this.engGain) {
      const target = driving ? 0.05 + Math.min(0.1, Math.abs(speed) * 0.004) : 0;
      this.engGain.gain.value += (target * m - this.engGain.gain.value) * 0.2;
      this.engOsc.frequency.value = 42 + Math.abs(speed) * 3.4;
    }
    if (this.sirGain) {
      this.sirPhase += dt * 2.2;
      this.sirOsc.frequency.value = (Math.sin(this.sirPhase * Math.PI) > 0) ? 880 : 660;
      const target = sirenNear && !this.muted ? 0.045 : 0;
      this.sirGain.gain.value += (target - this.sirGain.gain.value) * 0.3;
    }
  }
  toggleMute() { this.muted = !this.muted; return this.muted; }
}
