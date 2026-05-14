/* ─────────────────────────────────────────────
   Relax — Guided Breathing Meditation
   Application Logic
   ───────────────────────────────────────────── */

(() => {
  'use strict';

  // ── Configuration ──
  const TOTAL_BREATHS    = 5;
  const INHALE_DURATION  = 5000;  // ms
  const HOLD_DURATION    = 1000;  // ms
  const EXHALE_DURATION  = 6000;  // ms
  const BREATH_CYCLE     = INHALE_DURATION + HOLD_DURATION + EXHALE_DURATION; // 12s
  const TOTAL_DURATION   = TOTAL_BREATHS * BREATH_CYCLE; // 60s

  // Circle size range (px)
  const CIRCLE_MIN = 100;
  const CIRCLE_MAX = 220;

  // ── DOM References ──
  const screenLanding    = document.getElementById('screen-landing');
  const screenMeditation = document.getElementById('screen-meditation');
  const screenComplete   = document.getElementById('screen-complete');
  const btnStart         = document.getElementById('btn-start');
  const btnRestart       = document.getElementById('btn-restart');
  const circleOuter      = document.getElementById('circle-outer');
  const circleGlow       = document.getElementById('circle-glow');
  const breathText       = document.getElementById('breath-text');
  const breathCounter    = document.getElementById('breath-counter');
  const timerEl          = document.getElementById('timer');
  const progressBar      = document.getElementById('progress-bar');
  const canvas           = document.getElementById('particle-canvas');
  const ctx              = canvas.getContext('2d');

  // ── State ──
  let audioCtx        = null;
  let masterGain      = null;
  let meditationStart = 0;
  let animFrameId     = null;
  let isRunning       = false;

  // ─────────────────────────────────────
  //  SCREEN NAVIGATION
  // ─────────────────────────────────────
  function showScreen(screen) {
    [screenLanding, screenMeditation, screenComplete].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ─────────────────────────────────────
  //  AMBIENT MUSIC — Web Audio API
  // ─────────────────────────────────────
  function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);

    // Fade in
    masterGain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 3);

    // --- Pad layer: lush stereo pad ---
    const padNotes = [130.81, 164.81, 196.00, 261.63]; // C3, E3, G3, C4
    padNotes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Slight detune for warmth
      osc.detune.value = (i - 1.5) * 4;

      const gain = audioCtx.createGain();
      gain.gain.value = 0.08;

      // Gentle LFO tremolo
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15 + i * 0.05;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      // Subtle filter for softness
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600 + i * 100;
      filter.Q.value = 0.7;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start();
    });

    // --- Sub bass drone ---
    const sub = audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 65.41; // C2
    const subGain = audioCtx.createGain();
    subGain.gain.value = 0.06;
    sub.connect(subGain);
    subGain.connect(masterGain);
    sub.start();

    // --- Soft noise texture ---
    const bufferSize = audioCtx.sampleRate * 4;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.015;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 300;
    noise.connect(noiseFilter);
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.6;
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start();

    // --- Occasional bell chime (every ~12s) ---
    scheduleBellChimes();
  }

  function scheduleBellChimes() {
    const bellFreqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    for (let b = 0; b < TOTAL_BREATHS; b++) {
      const time = audioCtx.currentTime + b * (BREATH_CYCLE / 1000) + 0.5;
      const freq = bellFreqs[b % bellFreqs.length];

      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 4);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(time);
      osc.stop(time + 5);
    }
  }

  function fadeOutAudio(callback) {
    if (!audioCtx || !masterGain) { callback?.(); return; }
    const now = audioCtx.currentTime;
    masterGain.gain.linearRampToValueAtTime(0, now + 2);
    setTimeout(() => {
      audioCtx.close().catch(() => {});
      audioCtx = null;
      callback?.();
    }, 2200);
  }

  // ─────────────────────────────────────
  //  PARTICLE SYSTEM
  // ─────────────────────────────────────
  const particles = [];
  const PARTICLE_COUNT = 50;

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }

    reset(randomY = false) {
      this.x  = Math.random() * canvas.width;
      this.y  = randomY ? Math.random() * canvas.height : canvas.height + 10;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = -(Math.random() * 0.4 + 0.1);
      this.r  = Math.random() * 2 + 0.5;
      this.alpha = Math.random() * 0.25 + 0.05;
      this.pulse = Math.random() * Math.PI * 2;
      this.pulseSpeed = Math.random() * 0.01 + 0.005;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.pulse += this.pulseSpeed;
      if (this.y < -10 || this.x < -10 || this.x > canvas.width + 10) this.reset();
    }

    draw() {
      const a = this.alpha * (0.6 + 0.4 * Math.sin(this.pulse));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(110, 193, 228, ${a})`;
      ctx.fill();
    }
  }

  function initParticles() {
    resizeCanvas();
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());
    window.addEventListener('resize', resizeCanvas);
    renderParticles();
  }

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(renderParticles);
  }

  // ─────────────────────────────────────
  //  MEDITATION LOOP
  // ─────────────────────────────────────
  function startMeditation() {
    showScreen(screenMeditation);
    isRunning = true;
    meditationStart = performance.now();

    // Reset visuals
    setCircleSize(CIRCLE_MIN);
    breathText.textContent = 'Breathe In';
    breathText.classList.remove('fade');
    breathCounter.textContent = 'Breath 1 of 5';
    timerEl.textContent = '1:00';
    progressBar.style.width = '0%';

    initAudio();
    tick();
  }

  function tick() {
    if (!isRunning) return;

    const elapsed = performance.now() - meditationStart;

    // ── Check completion ──
    if (elapsed >= TOTAL_DURATION) {
      finishMeditation();
      return;
    }

    // ── Overall progress ──
    const overallPct = Math.min(elapsed / TOTAL_DURATION, 1);
    progressBar.style.width = `${overallPct * 100}%`;

    // ── Timer ──
    const remaining = Math.max(0, Math.ceil((TOTAL_DURATION - elapsed) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    // ── Current breath ──
    const breathIndex    = Math.min(Math.floor(elapsed / BREATH_CYCLE), TOTAL_BREATHS - 1);
    const cycleElapsed   = elapsed - breathIndex * BREATH_CYCLE;

    breathCounter.textContent = `Breath ${breathIndex + 1} of ${TOTAL_BREATHS}`;

    // ── Phase logic ──
    let size;
    if (cycleElapsed < INHALE_DURATION) {
      // INHALE
      const t = cycleElapsed / INHALE_DURATION;
      size = CIRCLE_MIN + (CIRCLE_MAX - CIRCLE_MIN) * easeInOutSine(t);
      updateBreathText('Breathe In');
    } else if (cycleElapsed < INHALE_DURATION + HOLD_DURATION) {
      // HOLD
      size = CIRCLE_MAX;
      updateBreathText('Hold');
    } else {
      // EXHALE
      const t = (cycleElapsed - INHALE_DURATION - HOLD_DURATION) / EXHALE_DURATION;
      size = CIRCLE_MAX - (CIRCLE_MAX - CIRCLE_MIN) * easeInOutSine(t);
      updateBreathText('Breathe Out');
    }

    setCircleSize(size);
    animFrameId = requestAnimationFrame(tick);
  }

  function easeInOutSine(t) {
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  let currentPhaseText = '';
  function updateBreathText(text) {
    if (text === currentPhaseText) return;
    currentPhaseText = text;
    breathText.classList.add('fade');
    setTimeout(() => {
      breathText.textContent = text;
      breathText.classList.remove('fade');
    }, 300);
  }

  function setCircleSize(size) {
    const px = `${size}px`;
    circleOuter.style.width  = px;
    circleOuter.style.height = px;
    circleGlow.style.width   = `${size * 1.6}px`;
    circleGlow.style.height  = `${size * 1.6}px`;
  }

  function finishMeditation() {
    isRunning = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    fadeOutAudio(() => {
      showScreen(screenComplete);
    });
  }

  // ─────────────────────────────────────
  //  EVENT LISTENERS
  // ─────────────────────────────────────
  btnStart.addEventListener('click', startMeditation);

  btnRestart.addEventListener('click', () => {
    currentPhaseText = '';
    showScreen(screenLanding);
  });

  // ─────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────
  initParticles();
})();
