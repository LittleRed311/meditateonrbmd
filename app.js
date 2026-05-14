/* ─────────────────────────────────────────────
   Relax — Guided Breathing Meditation
   Application Logic

   Meta Ray-Ban Display (MRBD) Best Practices:
   • D-pad navigation (Arrow keys + Enter)
   • Focus management via .focusable class
   • No mouse/touch dependency
   ───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // ── Configuration ──
  var TOTAL_BREATHS    = 5;
  var INHALE_DURATION  = 5000;  // ms
  var HOLD_DURATION    = 1000;  // ms
  var EXHALE_DURATION  = 6000;  // ms
  var BREATH_CYCLE     = INHALE_DURATION + HOLD_DURATION + EXHALE_DURATION; // 12s
  var TOTAL_DURATION   = TOTAL_BREATHS * BREATH_CYCLE; // 60s

  // Circle size range (px)
  var CIRCLE_MIN = 100;
  var CIRCLE_MAX = 220;

  // Display dimensions (MRBD)
  var DISPLAY_W = 600;
  var DISPLAY_H = 600;

  // ── DOM References ──
  var screenLanding    = document.getElementById('screen-landing');
  var screenMeditation = document.getElementById('screen-meditation');
  var screenComplete   = document.getElementById('screen-complete');
  var btnStart         = document.getElementById('btn-start');
  var btnRestart       = document.getElementById('btn-restart');
  var circleOuter      = document.getElementById('circle-outer');
  var circleGlow       = document.getElementById('circle-glow');
  var breathText       = document.getElementById('breath-text');
  var breathCounter    = document.getElementById('breath-counter');
  var timerEl          = document.getElementById('timer');
  var progressBar      = document.getElementById('progress-bar');
  var canvas           = document.getElementById('particle-canvas');
  var ctx              = canvas.getContext('2d');

  // ── State ──
  var audioCtx        = null;
  var masterGain      = null;
  var meditationStart = 0;
  var animFrameId     = null;
  var isRunning       = false;
  var currentPhaseText = '';

  // ─────────────────────────────────────
  //  D-PAD INPUT (MRBD)
  // ─────────────────────────────────────
  var DPAD = {
    UP:     'ArrowUp',
    DOWN:   'ArrowDown',
    LEFT:   'ArrowLeft',
    RIGHT:  'ArrowRight',
    SELECT: 'Enter',
    BACK:   'Escape'
  };

  function moveFocus(direction) {
    var focusables = Array.from(
      document.querySelectorAll('.focusable:not([disabled]):not(.hidden)')
    );
    // Only include focusables in the active screen
    var activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
      focusables = focusables.filter(function (el) {
        return activeScreen.contains(el);
      });
    }
    if (!focusables.length) return;

    var idx = focusables.indexOf(document.activeElement);
    if (idx === -1) {
      focusables[0].focus();
      return;
    }

    var next;
    if (direction === 'up' || direction === 'left') {
      next = idx > 0 ? idx - 1 : focusables.length - 1;
    } else {
      next = idx < focusables.length - 1 ? idx + 1 : 0;
    }
    focusables[next].focus();
    focusables[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case DPAD.UP:     moveFocus('up');    break;
      case DPAD.DOWN:   moveFocus('down');  break;
      case DPAD.LEFT:   moveFocus('left');  break;
      case DPAD.RIGHT:  moveFocus('right'); break;
      case DPAD.SELECT:
        if (document.activeElement && document.activeElement.classList.contains('focusable')) {
          document.activeElement.click();
        }
        break;
      case DPAD.BACK:
        // If meditating, go back to landing
        if (isRunning) {
          isRunning = false;
          if (animFrameId) cancelAnimationFrame(animFrameId);
          fadeOutAudio(function () {
            currentPhaseText = '';
            showScreen(screenLanding);
          });
        }
        break;
      default:
        return; // don't preventDefault on unhandled keys
    }
    e.preventDefault();
  });

  // ─────────────────────────────────────
  //  SCREEN NAVIGATION
  // ─────────────────────────────────────
  function showScreen(screen) {
    [screenLanding, screenMeditation, screenComplete].forEach(function (s) {
      s.classList.remove('active');
    });
    screen.classList.add('active');

    // Auto-focus first focusable in the new screen
    setTimeout(function () {
      var first = screen.querySelector('.focusable');
      if (first) first.focus();
    }, 100);
  }

  // ─────────────────────────────────────
  //  AMBIENT MUSIC — Web Audio API
  // ─────────────────────────────────────
  function initAudio() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      // Audio not supported — continue silently
      return;
    }
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);

    // Fade in
    masterGain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 3);

    // --- Pad layer: lush chord ---
    var padNotes = [130.81, 164.81, 196.00, 261.63]; // C3, E3, G3, C4
    padNotes.forEach(function (freq, i) {
      var osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Slight detune for warmth
      osc.detune.value = (i - 1.5) * 4;

      var gain = audioCtx.createGain();
      gain.gain.value = 0.08;

      // Gentle LFO tremolo
      var lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15 + i * 0.05;
      var lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      // Subtle filter for softness
      var filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600 + i * 100;
      filter.Q.value = 0.7;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start();
    });

    // --- Sub bass drone ---
    var sub = audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 65.41; // C2
    var subGain = audioCtx.createGain();
    subGain.gain.value = 0.06;
    sub.connect(subGain);
    subGain.connect(masterGain);
    sub.start();

    // --- Soft noise texture ---
    var bufferSize = audioCtx.sampleRate * 4;
    var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.015;
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    var noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 300;
    noise.connect(noiseFilter);
    var noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.6;
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start();

    // --- Bell chimes at each breath start ---
    scheduleBellChimes();
  }

  function scheduleBellChimes() {
    if (!audioCtx) return;
    var bellFreqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    for (var b = 0; b < TOTAL_BREATHS; b++) {
      var time = audioCtx.currentTime + b * (BREATH_CYCLE / 1000) + 0.5;
      var freq = bellFreqs[b % bellFreqs.length];

      var osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      var gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 4);

      var filter = audioCtx.createBiquadFilter();
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
    if (!audioCtx || !masterGain) {
      if (callback) callback();
      return;
    }
    var now = audioCtx.currentTime;
    masterGain.gain.linearRampToValueAtTime(0, now + 2);
    setTimeout(function () {
      try { audioCtx.close(); } catch (e) { /* ignore */ }
      audioCtx = null;
      if (callback) callback();
    }, 2200);
  }

  // ─────────────────────────────────────
  //  PARTICLE SYSTEM
  // ─────────────────────────────────────
  var particles = [];
  var PARTICLE_COUNT = 40;

  function resizeCanvas() {
    canvas.width  = DISPLAY_W;
    canvas.height = DISPLAY_H;
  }

  function createParticle(randomY) {
    return {
      x:  Math.random() * DISPLAY_W,
      y:  randomY ? Math.random() * DISPLAY_H : DISPLAY_H + 10,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(Math.random() * 0.4 + 0.1),
      r:  Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.25 + 0.05,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.01 + 0.005
    };
  }

  function resetParticle(p) {
    p.x  = Math.random() * DISPLAY_W;
    p.y  = DISPLAY_H + 10;
    p.vx = (Math.random() - 0.5) * 0.3;
    p.vy = -(Math.random() * 0.4 + 0.1);
    p.r  = Math.random() * 2 + 0.5;
    p.alpha = Math.random() * 0.25 + 0.05;
    p.pulse = Math.random() * Math.PI * 2;
    p.pulseSpeed = Math.random() * 0.01 + 0.005;
  }

  function initParticles() {
    resizeCanvas();
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(true));
    }
    renderParticles();
  }

  function renderParticles() {
    ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += p.pulseSpeed;
      if (p.y < -10 || p.x < -10 || p.x > DISPLAY_W + 10) {
        resetParticle(p);
      }
      var a = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(110, 193, 228, ' + a + ')';
      ctx.fill();
    }
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

    var elapsed = performance.now() - meditationStart;

    // ── Check completion ──
    if (elapsed >= TOTAL_DURATION) {
      finishMeditation();
      return;
    }

    // ── Overall progress ──
    var overallPct = Math.min(elapsed / TOTAL_DURATION, 1);
    progressBar.style.width = (overallPct * 100) + '%';

    // ── Timer ──
    var remaining = Math.max(0, Math.ceil((TOTAL_DURATION - elapsed) / 1000));
    var mins = Math.floor(remaining / 60);
    var secs = remaining % 60;
    timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;

    // ── Current breath ──
    var breathIndex  = Math.min(Math.floor(elapsed / BREATH_CYCLE), TOTAL_BREATHS - 1);
    var cycleElapsed = elapsed - breathIndex * BREATH_CYCLE;

    breathCounter.textContent = 'Breath ' + (breathIndex + 1) + ' of ' + TOTAL_BREATHS;

    // ── Phase logic ──
    var size;
    if (cycleElapsed < INHALE_DURATION) {
      // INHALE
      var t = cycleElapsed / INHALE_DURATION;
      size = CIRCLE_MIN + (CIRCLE_MAX - CIRCLE_MIN) * easeInOutSine(t);
      updateBreathText('Breathe In');
    } else if (cycleElapsed < INHALE_DURATION + HOLD_DURATION) {
      // HOLD
      size = CIRCLE_MAX;
      updateBreathText('Hold');
    } else {
      // EXHALE
      var t2 = (cycleElapsed - INHALE_DURATION - HOLD_DURATION) / EXHALE_DURATION;
      size = CIRCLE_MAX - (CIRCLE_MAX - CIRCLE_MIN) * easeInOutSine(t2);
      updateBreathText('Breathe Out');
    }

    setCircleSize(size);
    animFrameId = requestAnimationFrame(tick);
  }

  function easeInOutSine(t) {
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  function updateBreathText(text) {
    if (text === currentPhaseText) return;
    currentPhaseText = text;
    breathText.classList.add('fade');
    setTimeout(function () {
      breathText.textContent = text;
      breathText.classList.remove('fade');
    }, 300);
  }

  function setCircleSize(size) {
    var px = size + 'px';
    circleOuter.style.width  = px;
    circleOuter.style.height = px;
    circleGlow.style.width   = (size * 1.6) + 'px';
    circleGlow.style.height  = (size * 1.6) + 'px';
  }

  function finishMeditation() {
    isRunning = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    fadeOutAudio(function () {
      showScreen(screenComplete);
    });
  }

  // ─────────────────────────────────────
  //  EVENT LISTENERS
  // ─────────────────────────────────────
  btnStart.addEventListener('click', startMeditation);

  btnRestart.addEventListener('click', function () {
    currentPhaseText = '';
    showScreen(screenLanding);
  });

  // ─────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────
  initParticles();

  // Focus the start button on load
  if (btnStart) btnStart.focus();
});
