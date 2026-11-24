// audio.js — one job: every sound in Solmar Bay, synthesized with WebAudio.
// No audio files: engine hum, sirens, gunshots, chimes and a simple music
// loop are all oscillators and filtered noise, built after the first user
// gesture (browsers block audio before one).

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.muted = false;
    this.started = false;
  }

  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this._startEngine();
      this._startMusic();
    } catch (err) { /* audio unavailable: the game stays silent */ }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed, maxSpeed, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed));
    this.engineOsc.frequency.setTargetAtTime(55 + ratio * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + ratio * 0.06 : 0.0, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        high = !high;
        this.sirenOsc.frequency.setTargetAtTime(high ? 950 : 720, this.ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      try { this.sirenOsc.stop(); } catch (err) { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
  }

  shot() {
    if (!this.ctx) return;
    const dur = 0.12;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  chime() {
    if (!this.ctx) return;
    [523, 659, 784].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      const t0 = this.ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  }

  thud() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  // A slow four-chord pad loop (Am – F – C – G) with a soft bass note.
  _startMusic() {
    const chords = [
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 261.6, 329.6],
      [196.0, 246.9, 293.7],
    ];
    const bass = [110.0, 87.3, 130.8, 98.0];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const chord = chords[this.musicStep % chords.length];
      const root = bass[this.musicStep % bass.length];
      this.musicStep += 1;
      const t0 = this.ctx.currentTime;
      chord.forEach((freq) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.035, t0 + 0.4);
        gain.gain.setValueAtTime(0.035, t0 + 1.4);
        gain.gain.linearRampToValueAtTime(0, t0 + 2.0);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(t0);
        osc.stop(t0 + 2.05);
      });
      const b = this.ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = root;
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0, t0);
      bg.gain.linearRampToValueAtTime(0.06, t0 + 0.1);
      bg.gain.linearRampToValueAtTime(0, t0 + 1.9);
      b.connect(bg);
      bg.connect(this.master);
      b.start(t0);
      b.stop(t0 + 2.0);
    }, 2000);
  }
}
