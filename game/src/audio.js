// Tiny WebAudio synth: engine hum, police siren, gunshots, impacts and UI
// jingles, all generated — the game ships no audio assets.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  resume() {
    if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  shot() {
    this.noise(0.14, 0.5, 2600);
    this.tone(140, 0.1, 'square', 0.25, 50);
  }

  hit() {
    this.noise(0.08, 0.3, 900);
  }

  crash(intensity = 1) {
    this.noise(0.3, 0.4 * intensity, 500);
    this.tone(70, 0.3, 'sine', 0.4 * intensity, 34);
  }

  pickup() {
    this.tone(660, 0.09, 'sine', 0.22);
    this.tone(990, 0.14, 'sine', 0.22, null, 0.08);
  }

  beep() {
    this.tone(880, 0.07, 'square', 0.12);
  }

  checkpoint() {
    this.tone(523, 0.1, 'triangle', 0.25);
    this.tone(784, 0.16, 'triangle', 0.25, null, 0.09);
  }

  success() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.24, null, i * 0.11));
  }

  fail() {
    this.tone(220, 0.3, 'sawtooth', 0.18, 110);
  }

  engine(on, rpm = 0) {
    if (!this.ensure()) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      sub.type = 'square';
      gain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      sub.start();
      this.engineNodes = { osc, sub, gain, filter };
    }
    if (this.engineNodes) {
      const n = this.engineNodes;
      const target = on ? 0.05 + rpm * 0.05 : 0;
      n.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      const f = 55 + rpm * 130;
      n.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      n.sub.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.05);
      n.filter.frequency.setTargetAtTime(300 + rpm * 700, this.ctx.currentTime, 0.1);
    }
  }

  siren(on) {
    if (!this.ensure()) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 800;
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.035;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    } else if (!on && this.sirenNodes) {
      const n = this.sirenNodes;
      try {
        n.osc.stop();
        n.lfo.stop();
      } catch { /* already stopped */ }
      this.sirenNodes = null;
    }
  }
}
