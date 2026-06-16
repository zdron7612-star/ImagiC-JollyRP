/**
 * Web Audio Ambient Soundscape Synthesizer
 * Generates procedural, looping ambient noises (rain, fireplace, neon hum, cosmic pad)
 * locally using the Web Audio API. Requires zero external audio downloads.
 */

class SoundscapeManager {
  constructor() {
    this.audioCtx = null;
    this.sources = {};
    this.gains = {};
    this.masterGain = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      // Create Web Audio Context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
      
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
      
      this.initialized = true;
      console.log("Web Audio Synthesizer Initialized.");
    } catch (e) {
      console.error("Web Audio API not supported on this browser:", e);
    }
  }

  /**
   * Helper to create custom audio buffer containing white noise
   */
  createNoiseBuffer(seconds = 2) {
    const bufferSize = this.audioCtx.sampleRate * seconds;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Synthesize Tavern Fireplace (Warm low crackle + high sparks)
   */
  startFireplace() {
    this.init();
    if (!this.audioCtx) return;

    const key = "fireplace";
    if (this.sources[key]) return;

    // 1. Low Log Rumble (Brown-ish filtered noise)
    const rumbleSource = this.audioCtx.createBufferSource();
    rumbleSource.buffer = this.createNoiseBuffer(2);
    rumbleSource.loop = true;

    const rumbleFilter = this.audioCtx.createBiquadFilter();
    rumbleFilter.type = "bandpass";
    rumbleFilter.frequency.setValueAtTime(120, this.audioCtx.currentTime);
    rumbleFilter.Q.setValueAtTime(1.5, this.audioCtx.currentTime);

    const rumbleGain = this.audioCtx.createGain();
    rumbleGain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);

    // Modulate rumble volume to simulate flickering wood embers
    const rumbleMod = this.audioCtx.createOscillator();
    rumbleMod.frequency.setValueAtTime(0.7, this.audioCtx.currentTime);
    const rumbleModGain = this.audioCtx.createGain();
    rumbleModGain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);

    rumbleMod.connect(rumbleModGain);
    rumbleModGain.connect(rumbleGain.gain);

    rumbleSource.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);

    // 2. High Sparks & Crackles
    const crackleSource = this.audioCtx.createBufferSource();
    crackleSource.buffer = this.createNoiseBuffer(1);
    crackleSource.loop = true;

    const crackleFilter = this.audioCtx.createBiquadFilter();
    crackleFilter.type = "highpass";
    crackleFilter.frequency.setValueAtTime(4500, this.audioCtx.currentTime);

    const crackleGain = this.audioCtx.createGain();
    crackleGain.gain.setValueAtTime(0.008, this.audioCtx.currentTime);

    // Crackle modulator (high amplitude rapid jumps)
    const crackleMod = this.audioCtx.createOscillator();
    crackleMod.frequency.setValueAtTime(12, this.audioCtx.currentTime);
    const crackleModGain = this.audioCtx.createGain();
    crackleModGain.gain.setValueAtTime(0.006, this.audioCtx.currentTime);
    
    crackleMod.connect(crackleModGain);
    crackleModGain.connect(crackleGain.gain);

    crackleSource.connect(crackleFilter);
    crackleFilter.connect(crackleGain);

    // Master path for Fireplace
    const fireMasterGain = this.audioCtx.createGain();
    fireMasterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    fireMasterGain.gain.linearRampToValueAtTime(0.6, this.audioCtx.currentTime + 1.5);

    rumbleGain.connect(fireMasterGain);
    crackleGain.connect(fireMasterGain);
    fireMasterGain.connect(this.masterGain);

    // Start playback
    rumbleSource.start(0);
    crackleSource.start(0);
    rumbleMod.start(0);
    crackleMod.start(0);

    this.sources[key] = {
      nodes: [rumbleSource, crackleSource, rumbleMod, crackleMod, rumbleFilter, crackleFilter, rumbleGain, crackleGain, fireMasterGain],
      master: fireMasterGain
    };
  }

  /**
   * Synthesize Soft Rain (Broadband low-passed wind noise)
   */
  startRain() {
    this.init();
    if (!this.audioCtx) return;

    const key = "rain";
    if (this.sources[key]) return;

    const noiseSource = this.audioCtx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer(3);
    noiseSource.loop = true;

    const rainFilter = this.audioCtx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.setValueAtTime(900, this.audioCtx.currentTime);
    rainFilter.Q.setValueAtTime(0.7, this.audioCtx.currentTime);

    const rainGain = this.audioCtx.createGain();
    rainGain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);

    // Slow wind sway modulator
    const windMod = this.audioCtx.createOscillator();
    windMod.frequency.setValueAtTime(0.15, this.audioCtx.currentTime); // slow wave
    const windGain = this.audioCtx.createGain();
    windGain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);

    windMod.connect(windGain);
    windGain.connect(rainGain.gain);

    noiseSource.connect(rainFilter);
    rainFilter.connect(rainGain);

    const rainMasterGain = this.audioCtx.createGain();
    rainMasterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    rainMasterGain.gain.linearRampToValueAtTime(0.5, this.audioCtx.currentTime + 1.5);

    rainGain.connect(rainMasterGain);
    rainMasterGain.connect(this.masterGain);

    noiseSource.start(0);
    windMod.start(0);

    this.sources[key] = {
      nodes: [noiseSource, rainFilter, rainGain, windMod, windGain, rainMasterGain],
      master: rainMasterGain
    };
  }

  /**
   * Synthesize Cyberpunk Neon Hum (Detuned low sawtooths + lowpass filter LFO sweep)
   */
  startNeonHum() {
    this.init();
    if (!this.audioCtx) return;

    const key = "neonhum";
    if (this.sources[key]) return;

    // Sub-oscillator A (55Hz - A1)
    const oscA = this.audioCtx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.setValueAtTime(55.0, this.audioCtx.currentTime);

    // Detuned sub-oscillator B (55.4Hz)
    const oscB = this.audioCtx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.setValueAtTime(55.4, this.audioCtx.currentTime);

    // Neon buzz oscillator (high harmonics low volume)
    const oscC = this.audioCtx.createOscillator();
    oscC.type = "sawtooth";
    oscC.frequency.setValueAtTime(220.0, this.audioCtx.currentTime); // A3

    const lowpass = this.audioCtx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(110, this.audioCtx.currentTime);
    lowpass.Q.setValueAtTime(2.0, this.audioCtx.currentTime);

    // Sweep LFO
    const sweepLfo = this.audioCtx.createOscillator();
    sweepLfo.frequency.setValueAtTime(0.1, this.audioCtx.currentTime); // Sweeps every 10s
    const sweepGain = this.audioCtx.createGain();
    sweepGain.gain.setValueAtTime(40, this.audioCtx.currentTime); // sweep range +-40Hz

    sweepLfo.connect(sweepGain);
    sweepGain.connect(lowpass.frequency);

    const gainA = this.audioCtx.createGain();
    gainA.gain.setValueAtTime(0.12, this.audioCtx.currentTime);

    const gainB = this.audioCtx.createGain();
    gainB.gain.setValueAtTime(0.15, this.audioCtx.currentTime);

    const gainC = this.audioCtx.createGain();
    gainC.gain.setValueAtTime(0.003, this.audioCtx.currentTime);

    oscA.connect(gainA);
    oscB.connect(gainB);
    oscC.connect(gainC);

    gainA.connect(lowpass);
    gainB.connect(lowpass);
    gainC.connect(this.masterGain); // let neon buzz bypass lowpass slightly for crispness

    const neonMasterGain = this.audioCtx.createGain();
    neonMasterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    neonMasterGain.gain.linearRampToValueAtTime(0.6, this.audioCtx.currentTime + 1.5);

    lowpass.connect(neonMasterGain);
    neonMasterGain.connect(this.masterGain);

    oscA.start(0);
    oscB.start(0);
    oscC.start(0);
    sweepLfo.start(0);

    this.sources[key] = {
      nodes: [oscA, oscB, oscC, sweepLfo, sweepGain, lowpass, gainA, gainB, gainC, neonMasterGain],
      master: neonMasterGain
    };
  }

  /**
   * Synthesize Cosmic Canopy (Eldritch floating sine pads with slow fading envelopes)
   */
  startCosmic() {
    this.init();
    if (!this.audioCtx) return;

    const key = "cosmic";
    if (this.sources[key]) return;

    // Frequencies representing a lush Major 7th chord (C3, G3, C4, E4)
    const freqs = [130.81, 196.00, 261.63, 329.63];
    const nodes = [];

    const cosmicMasterGain = this.audioCtx.createGain();
    cosmicMasterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    cosmicMasterGain.gain.linearRampToValueAtTime(0.4, this.audioCtx.currentTime + 2.0);

    freqs.forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);

      // Unique slow LFO for each node volume to make the pad float organic
      const lfo = this.audioCtx.createOscillator();
      lfo.frequency.setValueAtTime(0.05 + idx * 0.02, this.audioCtx.currentTime);
      const lfoGain = this.audioCtx.createGain();
      lfoGain.gain.setValueAtTime(0.03, this.audioCtx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.connect(gain);
      gain.connect(cosmicMasterGain);

      osc.start(0);
      lfo.start(0);
      
      nodes.push(osc, lfo, lfoGain, gain);
    });

    cosmicMasterGain.connect(this.masterGain);
    nodes.push(cosmicMasterGain);

    this.sources[key] = {
      nodes: nodes,
      master: cosmicMasterGain
    };
  }

  /**
   * Stop an active soundscape with a smooth fade-out
   */
  stop(key) {
    const active = this.sources[key];
    if (!active) return;

    const currentCtx = this.audioCtx;
    if (!currentCtx) return;

    const targetGain = active.master;
    try {
      targetGain.gain.cancelScheduledValues(currentCtx.currentTime);
      targetGain.gain.setValueAtTime(targetGain.gain.value, currentCtx.currentTime);
      targetGain.gain.linearRampToValueAtTime(0, currentCtx.currentTime + 1.0);
      
      setTimeout(() => {
        // Disconnect and stop all nodes after fade completes
        active.nodes.forEach(node => {
          try {
            if (node.stop) node.stop();
            node.disconnect();
          } catch (e) {}
        });
        delete this.sources[key];
      }, 1100);
    } catch (err) {
      console.error("Error stopping soundscape node:", err);
      delete this.sources[key];
    }
  }

  /**
   * Adjust overall master volume
   * @param {number} value - Volume between 0 and 1
   */
  setMasterVolume(value) {
    this.init();
    if (!this.masterGain) return;
    const cleanVal = Math.max(0, Math.min(1, value));
    this.masterGain.gain.linearRampToValueAtTime(cleanVal * 0.5, this.audioCtx.currentTime + 0.2);
  }

  /**
   * Alter sound parameters depending on current active sentiment
   * @param {string} mood - cozy | spooky | danger | romantic | scifi | neutral
   */
  adjustForMood(mood) {
    if (!this.initialized || !this.audioCtx) return;

    // Modify volume parameters globally based on intensity of story
    if (mood === "danger") {
      // Elevate master volume slightly, maybe sharpen fireplace crackles if running
      this.masterGain.gain.linearRampToValueAtTime(0.7, this.audioCtx.currentTime + 1.0);
      if (this.sources["fireplace"]) {
        const fireMaster = this.sources["fireplace"].master;
        fireMaster.gain.setValueAtTime(0.8, this.audioCtx.currentTime);
      }
    } else if (mood === "spooky") {
      // Lower ambient volumes, damp high crackles, slow down rain wind cycles
      this.masterGain.gain.linearRampToValueAtTime(0.3, this.audioCtx.currentTime + 1.0);
    } else {
      this.masterGain.gain.linearRampToValueAtTime(0.5, this.audioCtx.currentTime + 1.0);
    }
  }
}

export const soundManager = new SoundscapeManager();
