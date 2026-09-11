// a sky for melike
// plain canvas, no libraries. started this on a tuesday night and it got out of hand.

(function () {
  'use strict';

  var canvas = document.getElementById('sky');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };

  var note = $('note');
  var after = $('after');
  var revealBtn = $('reveal');
  var backBtn = $('back');
  var wishesEl = $('wishes');
  var door = $('door');
  var doorForm = $('door-form');
  var doorInput = $('who');
  var doorReply = $('door-reply');
  var doorTime = $('door-time');
  var fine = $('fine');
  var fineOpen = $('fine-open');
  var fineClose = $('fine-close');
  var whisper = $('whisper');
  var moonNote = $('moon-note');
  var soundBtn = $('sound');
  var entryStars = $('entry-stars');

  var inside = false;   // past the door yet?

  var W = 0, H = 0, DPR = 1;
  var mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  var now = 0;

  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var easeInOut = function (p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  var easeOut = function (p) { return 1 - Math.pow(1 - p, 3); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var TAU = Math.PI * 2;

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; } // private mode or whatever, does not matter
  }

  // ---------------------------------------------------------------
  // background stars, three layers for a bit of parallax
  // ---------------------------------------------------------------
  var layers = [];

  function seedStars() {
    layers = [];
    var densities = [9000, 15000, 32000];
    for (var l = 0; l < densities.length; l++) {
      var n = Math.round((W * H) / densities[l]);
      var arr = [];
      for (var i = 0; i < n; i++) {
        arr.push({
          x: Math.random(),
          y: Math.random(),
          r: rand(0.35, 0.75 + l * 0.45),
          ph: rand(0, TAU),
          sp: rand(0.6, 2.2),
          warm: Math.random() < 0.16
        });
      }
      layers.push(arr);
    }
  }

  // ---------------------------------------------------------------
  // the letters. each stroke is a polyline in a 0..1 box, y goes down.
  // ---------------------------------------------------------------
  var LETTERS = {
    M: { w: 1.0,  strokes: [[[0, 1], [0, 0], [0.5, 0.64], [1, 0], [1, 1]]] },
    E: { w: 0.7,  strokes: [[[0.7, 0], [0, 0], [0, 1], [0.7, 1]], [[0, 0.5], [0.52, 0.5]]] },
    L: { w: 0.68, strokes: [[[0, 0], [0, 1], [0.68, 1]]] },
    I: { w: 0.18, strokes: [[[0.09, 0], [0.09, 1]]] },
    K: { w: 0.8,  strokes: [[[0, 0], [0, 1]], [[0.8, 0], [0, 0.58]], [[0.27, 0.4], [0.8, 1]]] }
  };

  var WORD = 'MELIKE';
  var GAP = 0.34;

  // what each letter says if you tap it once the thing is formed
  var WHISPERS = [
    'M. the first one. took three tries to get the angle right.',
    'E. there are two of these. the second one came out better. don’t tell this one.',
    'L. three stars. easiest letter. still counts.',
    'I. one line. minimalist. like your texts.',
    'K. the tricky one. three strokes. worth it.',
    'E. told you. slightly better.'
  ];

  // returns { pts: [{u,v,letter}], edges: [[i,j]], width }
  function buildWord() {
    var pts = [];
    var edges = [];
    var cursor = 0;
    var letter = 0;

    function addPoint(u, v) {
      // merge with an existing point if it is basically the same spot
      for (var i = 0; i < pts.length; i++) {
        if (Math.abs(pts[i].u - u) < 0.04 && Math.abs(pts[i].v - v) < 0.04) return i;
      }
      pts.push({ u: u + rand(-0.025, 0.025), v: v + rand(-0.025, 0.025), letter: letter });
      return pts.length - 1;
    }

    for (letter = 0; letter < WORD.length; letter++) {
      var L = LETTERS[WORD[letter]];
      for (var s = 0; s < L.strokes.length; s++) {
        var stroke = L.strokes[s];
        var prev = -1;
        for (var p = 0; p < stroke.length; p++) {
          var u = cursor + stroke[p][0];
          var v = stroke[p][1];
          if (prev >= 0) {
            // long segments get a star or two in the middle so it reads as a line
            var pu = pts[prev].u, pv = pts[prev].v;
            var len = Math.hypot(u - pu, v - pv);
            var subdiv = Math.floor(len / 0.5);
            var last = prev;
            for (var k = 1; k <= subdiv; k++) {
              var f = k / (subdiv + 1);
              var mid = addPoint(pu + (u - pu) * f, pv + (v - pv) * f);
              edges.push([last, mid]);
              last = mid;
            }
            var idx = addPoint(u, v);
            edges.push([last, idx]);
            prev = idx;
          } else {
            prev = addPoint(u, v);
          }
        }
      }
      cursor += L.w + GAP;
    }
    return { pts: pts, edges: edges, width: cursor - GAP };
  }

  var word = buildWord();
  var cstars = [];          // constellation stars
  var state = 'scattered';  // scattered | gathering | formed | scattering
  var stateAt = 0;
  var linesAt = 0;
  var afterShown = false;
  var litLetter = -1;       // which letter got tapped
  var litAt = 0;
  var whisperTimer = 0;

  function layoutTargets() {
    var maxW = W * 0.78;
    var maxH = H * 0.24;
    var scale = Math.min(maxW / word.width, maxH);
    var totalW = word.width * scale;
    var x0 = (W - totalW) / 2;
    var y0 = H * 0.40 - scale / 2;
    for (var i = 0; i < word.pts.length; i++) {
      cstars[i].tx = x0 + word.pts[i].u * scale;
      cstars[i].ty = y0 + word.pts[i].v * scale;
    }
  }

  function seedConstellation() {
    cstars = [];
    for (var i = 0; i < word.pts.length; i++) {
      cstars.push({
        x: rand(0, 1), y: rand(0, 1),       // normalized while scattered
        px: 0, py: 0,                       // pixel position, computed each frame
        fx: 0, fy: 0,                       // where it was when the move started
        tx: 0, ty: 0,
        ph: rand(0, TAU),
        delay: rand(0, 0.45) + i * 0.018,
        r: rand(1.4, 2.2),
        letter: word.pts[i].letter
      });
    }
    layoutTargets();
    entryStars.textContent = cstars.length + ', give or take';
  }

  // ---------------------------------------------------------------
  // wishes (the stars you add by tapping / holding)
  // ---------------------------------------------------------------
  var wishes = [];
  var STORE = 'melike-sky-wishes';
  var lastWasBig = false;
  var pending = null;       // the one being held down right now

  function loadWishes() {
    var arr = store(STORE);
    if (arr && arr.length) {
      for (var i = 0; i < arr.length; i++) {
        wishes.push({ x: arr[i][0], y: arr[i][1], r: arr[i][2] || rand(1.1, 1.9), born: -10 - i * 0.05, ph: rand(0, TAU) });
      }
    }
    updateCounter();
  }

  function saveWishes() {
    store(STORE, wishes.slice(-400).map(function (w) { return [+w.x.toFixed(4), +w.y.toFixed(4), +w.r.toFixed(2)]; }));
  }

  function updateCounter() {
    var n = wishes.length;
    var line;
    if (n === 0) line = 'no wishes yet. tough crowd.';
    else if (n === 1) line = 'one wish. modest.';
    else if (n < 5) line = n + ' wishes.';
    else if (n < 10) line = n + ' wishes. getting greedy.';
    else if (n < 25) line = n + ' wishes. ok slow down.';
    else if (n < 60) line = n + ' wishes. the sky is not a vending machine.';
    else if (n < 100) line = n + ' wishes. i am not made of stars, you know.';
    else line = n + ' wishes. reporting you to the moon.';
    if (lastWasBig) line += ' that last one was big. what did you wish for?';
    wishesEl.textContent = line;
  }

  function holdRadius(held) {
    // tap = small star, hold up to ~1.4s = big one
    return 1.2 + easeOut(clamp(held / 1.4, 0, 1)) * 3.2;
  }

  // performance.now shares a clock with rAF timestamps, and keeps ticking
  // even when the tab is in the background and frames are paused
  var clock = function () { return performance.now() / 1000; };

  function beginWish(px, py) {
    pending = { x: px, y: py, t0: clock() };
  }

  function endWish() {
    if (!pending) return;
    var held = clock() - pending.t0;
    var r = holdRadius(held);
    wishes.push({ x: pending.x / W, y: pending.y / H, r: r, born: now, ph: rand(0, TAU) });
    lastWasBig = r > 3.4;
    pending = null;
    updateCounter();
    saveWishes();
    chime(r);
  }

  // ---------------------------------------------------------------
  // a tiny chime per wish. web audio, nothing loaded.
  // ---------------------------------------------------------------
  var audio = null;
  var soundOn = store('melike-sky-sound') !== false;
  var NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];  // C major pentatonic-ish, sounds fine

  function chime(r) {
    if (!soundOn) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      var t0 = audio.currentTime;
      var big = r > 3.4;
      var freq = NOTES[Math.floor(Math.random() * NOTES.length)] / (big ? 2 : 1);
      var gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(big ? 0.09 : 0.06, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (big ? 2.4 : 1.3));
      gain.connect(audio.destination);
      var o1 = audio.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = freq;
      var o2 = audio.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * 2.003;   // slightly off, for shimmer
      var g2 = audio.createGain();
      g2.gain.value = 0.25;
      o1.connect(gain);
      o2.connect(g2);
      g2.connect(gain);
      o1.start(t0); o2.start(t0);
      o1.stop(t0 + 2.6); o2.stop(t0 + 2.6);
    } catch (e) { /* no audio, no problem */ }
  }

  function renderSoundBtn() {
    soundBtn.textContent = soundOn ? 'sound: on' : 'sound: off';
  }

  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    store('melike-sky-sound', soundOn);
    renderSoundBtn();
    if (soundOn) chime(1.5);
  });

  // ---------------------------------------------------------------
  // the moon. actual phase for tonight.
  // ---------------------------------------------------------------
  var moon = { phase: 0, lit: 0, name: '' };

  function computeMoon() {
    // known new moon: 2000-01-06 18:14 utc. synodic month 29.530588853 days.
    var ref = Date.UTC(2000, 0, 6, 18, 14);
    var days = (Date.now() - ref) / 86400000;
    var p = (days / 29.530588853) % 1;
    if (p < 0) p += 1;
    moon.phase = p;
    moon.lit = (1 - Math.cos(p * TAU)) / 2;
    var names = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'last quarter', 'waning crescent'];
    moon.name = names[Math.round(p * 8) % 8];

    var pct = Math.round(moon.lit * 100);
    var line;
    if (moon.name === 'full') line = 'full moon tonight. i did not plan that. i’m taking credit anyway.';
    else if (moon.name === 'new') line = 'new moon tonight. so it’s just us and the stars. convenient.';
    else line = moon.name + ', ' + pct + '% lit. not that you asked.';
    moonNote.textContent = line;
  }

  function drawMoon() {
    var r = Math.max(14, Math.min(W, H) * 0.028);
    var cx = W - 22 - r;
    var cy = 24 + r;
    var c = Math.cos(moon.phase * TAU);
    var waxing = moon.phase < 0.5;

    glow(cx, cy, r * 3.2, 'rgba(255,244,214,0.35)', 0.35 + moon.lit * 0.4);

    // dark disc first
    ctx.fillStyle = '#1a1d3a';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    // then the lit bit. terminator is an ellipse, rx = r*cos(phase)
    ctx.fillStyle = '#f4efdc';
    ctx.beginPath();
    if (waxing) {
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);           // right limb, top to bottom
      ctx.ellipse(cx, cy, Math.abs(r * c), r, 0, Math.PI / 2, -Math.PI / 2, c >= 0);
    } else {
      ctx.arc(cx, cy, r, Math.PI / 2, 3 * Math.PI / 2, false);        // left limb, bottom to top
      ctx.ellipse(cx, cy, Math.abs(r * c), r, 0, -Math.PI / 2, Math.PI / 2, c >= 0);
    }
    ctx.closePath();
    ctx.fill();

    // a couple of faint maria so it doesn't look like a coin
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#6b6a8a';
    ctx.beginPath(); ctx.arc(cx - r * 0.25, cy - r * 0.2, r * 0.28, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.2, cy + r * 0.25, r * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.35, r * 0.13, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------
  // shooting stars, every so often
  // ---------------------------------------------------------------
  var shooters = [];
  var nextShooter = 2.5;

  function spawnShooter() {
    var fromLeft = Math.random() < 0.5;
    var ang = rand(0.45, 0.75);
    var speed = rand(700, 1100);
    shooters.push({
      x: fromLeft ? rand(-0.1, 0.5) * W : rand(0.5, 1.1) * W,
      y: rand(-0.05, 0.35) * H,
      vx: Math.cos(ang) * speed * (fromLeft ? 1 : -1),
      vy: Math.sin(ang) * speed,
      born: now,
      life: rand(0.55, 0.9),
      len: rand(90, 170)
    });
    nextShooter = now + rand(6, 14);
  }

  // ---------------------------------------------------------------
  // drawing
  // ---------------------------------------------------------------
  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05081a');
    g.addColorStop(0.55, '#0c1230');
    g.addColorStop(1, '#1c1a3c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // faint milky way-ish band. subtle. you only notice it if you look for it.
    var band = ctx.createLinearGradient(W * 0.1, H, W * 0.9, 0);
    band.addColorStop(0, 'rgba(120,130,200,0)');
    band.addColorStop(0.45, 'rgba(120,130,200,0.045)');
    band.addColorStop(0.55, 'rgba(160,150,210,0.055)');
    band.addColorStop(1, 'rgba(120,130,200,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars() {
    var dx = (mouse.x - 0.5), dy = (mouse.y - 0.5);
    for (var l = 0; l < layers.length; l++) {
      var arr = layers[l];
      var par = (l + 1) * 9;
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        var tw = 0.55 + 0.45 * Math.sin(now * s.sp + s.ph);
        var x = s.x * W - dx * par;
        var y = s.y * H - dy * par;
        ctx.globalAlpha = tw * (0.5 + l * 0.2);
        ctx.fillStyle = s.warm ? '#ffe9c4' : '#e8ecff';
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function glow(x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawConstellation() {
    var i, s, p;
    var dx = (mouse.x - 0.5) * 4, dy = (mouse.y - 0.5) * 4;
    var elapsed = now - stateAt;

    // positions
    for (i = 0; i < cstars.length; i++) {
      s = cstars[i];
      if (state === 'scattered') {
        s.px = s.x * W + Math.sin(now * 0.3 + s.ph) * 14 - dx;
        s.py = s.y * H + Math.cos(now * 0.23 + s.ph) * 10 - dy;
      } else if (state === 'gathering') {
        p = clamp((elapsed - s.delay) / 2.1, 0, 1);
        var e = easeInOut(p);
        s.px = s.fx + (s.tx - s.fx) * e;
        s.py = s.fy + (s.ty - s.fy) * e;
        // little arc so they do not all move in dead straight lines
        s.py -= Math.sin(p * Math.PI) * 26;
      } else if (state === 'formed') {
        s.px = s.tx + Math.sin(now * 0.8 + s.ph) * 1.2 - dx * 0.4;
        s.py = s.ty + Math.cos(now * 0.7 + s.ph) * 1.2 - dy * 0.4;
      } else if (state === 'scattering') {
        p = clamp((elapsed - s.delay * 0.5) / 1.6, 0, 1);
        s.px = s.fx + (s.x * W - s.fx) * easeInOut(p);
        s.py = s.fy + (s.y * H - s.fy) * easeInOut(p);
      }
    }

    // lines, only once formed
    if (state === 'formed') {
      var since = now - linesAt;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (i = 0; i < word.edges.length; i++) {
        var t = clamp((since - i * 0.07) / 0.4, 0, 1);
        if (t <= 0) continue;
        var a = cstars[word.edges[i][0]], b = cstars[word.edges[i][1]];
        var ex = a.px + (b.px - a.px) * easeOut(t);
        var ey = a.py + (b.py - a.py) * easeOut(t);
        var lit = a.letter === litLetter ? litGlow() : 0;
        ctx.strokeStyle = 'rgba(225,228,255,' + (0.28 + 0.06 * Math.sin(now * 1.3 + i) + lit * 0.4) + ')';
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    // the stars themselves
    for (i = 0; i < cstars.length; i++) {
      s = cstars[i];
      var bright = state === 'formed' ? 1 : 0.8;
      var tw = 0.75 + 0.25 * Math.sin(now * 1.6 + s.ph);
      var extra = (state === 'formed' && s.letter === litLetter) ? litGlow() : 0;
      glow(s.px, s.py, s.r * (7 + extra * 6), 'rgba(200,210,255,0.55)', (0.5 + extra * 0.4) * tw * bright);
      ctx.globalAlpha = Math.min(1, tw * bright + extra * 0.3);
      ctx.fillStyle = extra > 0 ? '#fff6dc' : '#fbfbff';
      ctx.beginPath();
      ctx.arc(s.px, s.py, s.r + extra * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function litGlow() {
    // fades out over ~3s after a letter tap
    return clamp(1 - (now - litAt - 2.2) / 0.8, 0, 1);
  }

  function drawWishes() {
    for (var i = 0; i < wishes.length; i++) {
      var w = wishes[i];
      var age = now - w.born;
      var x = w.x * W, y = w.y * H;
      var r = w.r;
      if (age < 1.2) {
        var p = clamp(age / 1.2, 0, 1);
        // overshoot on the way in
        r = w.r * (1 + Math.sin(p * Math.PI) * 1.6) * easeOut(p);
        // a ring that fades out
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.strokeStyle = '#ffe3a8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 6 + p * (28 + w.r * 6), 0, TAU);
        ctx.stroke();
      }
      var tw = 0.7 + 0.3 * Math.sin(now * 1.9 + w.ph);
      glow(x, y, r * 6, 'rgba(255,225,170,0.55)', 0.45 * tw);
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#fff1cf';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the one being held right now
    if (pending) {
      var held = now - pending.t0;
      var pr = holdRadius(held);
      var charge = clamp(held / 1.4, 0, 1);
      glow(pending.x, pending.y, pr * 7, 'rgba(255,225,170,0.6)', 0.35 + charge * 0.3);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff1cf';
      ctx.beginPath();
      ctx.arc(pending.x, pending.y, pr, 0, TAU);
      ctx.fill();
      // a slow ring closing in while you hold
      ctx.globalAlpha = 0.25 + charge * 0.3;
      ctx.strokeStyle = '#ffe3a8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pending.x, pending.y, 30 - charge * 22, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawShooters() {
    for (var i = shooters.length - 1; i >= 0; i--) {
      var s = shooters[i];
      var age = now - s.born;
      if (age > s.life) { shooters.splice(i, 1); continue; }
      var p = age / s.life;
      var x = s.x + s.vx * age;
      var y = s.y + s.vy * age;
      var mag = Math.hypot(s.vx, s.vy);
      var tx = x - (s.vx / mag) * s.len * (1 - p * 0.4);
      var ty = y - (s.vy / mag) * s.len * (1 - p * 0.4);
      var g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,' + (0.9 * (1 - p)) + ')');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------
  // state changes
  // ---------------------------------------------------------------
  function lookUp() {
    if (state !== 'scattered') return;
    for (var i = 0; i < cstars.length; i++) { cstars[i].fx = cstars[i].px; cstars[i].fy = cstars[i].py; }
    layoutTargets();
    state = 'gathering';
    stateAt = now;
    afterShown = false;
    note.classList.add('hidden');
  }

  function comeDown() {
    if (state !== 'formed') return;
    for (var i = 0; i < cstars.length; i++) {
      cstars[i].fx = cstars[i].px; cstars[i].fy = cstars[i].py;
      cstars[i].x = rand(0.02, 0.98); cstars[i].y = rand(0.02, 0.98);
    }
    state = 'scattering';
    stateAt = now;
    litLetter = -1;
    whisper.classList.remove('show');
    after.classList.remove('show');
  }

  function tickState() {
    var elapsed = now - stateAt;
    if (state === 'gathering' && elapsed > 2.1 + 0.45 + cstars.length * 0.018) {
      state = 'formed';
      stateAt = now;
      linesAt = now;
    } else if (state === 'formed' && !afterShown && now - linesAt > word.edges.length * 0.07 + 1.1) {
      afterShown = true;
      after.classList.add('show');
    } else if (state === 'scattering' && elapsed > 1.6 + 0.25) {
      state = 'scattered';
      stateAt = now;
      note.classList.remove('hidden');
    }
  }

  // did the tap land on one of the constellation stars?
  function letterAt(px, py) {
    if (state !== 'formed') return -1;
    var best = -1, bestD = 26;
    for (var i = 0; i < cstars.length; i++) {
      var d = Math.hypot(cstars[i].px - px, cstars[i].py - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? -1 : cstars[best].letter;
  }

  function sayWhisper(letter) {
    litLetter = letter;
    litAt = now;
    whisper.textContent = WHISPERS[letter];
    whisper.classList.add('show');
    clearTimeout(whisperTimer);
    whisperTimer = setTimeout(function () { whisper.classList.remove('show'); }, 3200);
  }

  // ---------------------------------------------------------------
  // the door
  // ---------------------------------------------------------------
  var knocks = 0;
  var wrongReplies = [
    'nice try.',
    'still not Melike.',
    'fine. come in. don’t touch anything.'
  ];

  function doorGreeting() {
    var h = new Date().getHours();
    var m = new Date().getMinutes();
    var hh = ((h + 11) % 12) + 1;
    var clock = hh + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? 'am' : 'pm');
    var line;
    if (h >= 23 || h < 5) line = 'it’s ' + clock + '. you should be asleep. so should i.';
    else if (h < 11) line = 'bit early for stars. fine.';
    else if (h < 17) line = 'stars work better at night. come back later. or don’t, i’m not your boss.';
    else line = 'good timing. it’s getting dark.';

    var visits = (store('melike-sky-visits') || 0) + 1;
    store('melike-sky-visits', visits);
    if (visits === 2) line = 'back again? ' + line;
    else if (visits > 2) line = 'visit no. ' + visits + '. i’m counting. ' + line;
    doorTime.textContent = line;
  }

  function letIn(greeting) {
    inside = true;
    doorReply.textContent = greeting;
    doorReply.classList.remove('pop');
    void doorReply.offsetWidth;
    doorReply.classList.add('pop');
    doorInput.blur();
    setTimeout(function () {
      door.classList.add('gone');
      document.body.classList.remove('at-door');
    }, 900);
    setTimeout(function () {
      note.classList.remove('hidden');
      updateCounter();
    }, 1700);
  }

  doorForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (inside) return;
    var who = doorInput.value.trim().toLowerCase();
    // turkish keyboards, typos, whatever. be generous.
    var isHer = who.replace(/[^a-z]/g, '').indexOf('melike') !== -1 || who === 'melik';
    if (isHer) {
      letIn('oh. hi.');
      return;
    }
    if (who === '') {
      doorReply.textContent = 'that’s not a name.';
    } else {
      doorReply.textContent = wrongReplies[Math.min(knocks, wrongReplies.length - 1)];
    }
    doorReply.classList.remove('pop');
    void doorReply.offsetWidth;
    doorReply.classList.add('pop');
    doorInput.classList.remove('shake');
    void doorInput.offsetWidth;
    doorInput.classList.add('shake');
    knocks++;
    if (knocks >= wrongReplies.length) {
      // alright, alright
      setTimeout(function () { letIn(wrongReplies[wrongReplies.length - 1]); }, 300);
    } else {
      doorInput.select();
    }
  });

  // some browsers/keyboards are weird about implicit submit, so be explicit
  doorInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (doorForm.requestSubmit) doorForm.requestSubmit();
      else doorForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  fineOpen.addEventListener('click', function () { fine.classList.add('show'); });
  fineClose.addEventListener('click', function () { fine.classList.remove('show'); });

  // ---------------------------------------------------------------
  // loop + events
  // ---------------------------------------------------------------
  function frame(ts) {
    now = ts / 1000;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    if (now > nextShooter) spawnShooter();
    tickState();

    drawSky();
    drawStars();
    drawMoon();
    drawShooters();
    drawWishes();
    drawConstellation();

    requestAnimationFrame(frame);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedStars();
    if (cstars.length) layoutTargets(); else seedConstellation();
  }

  window.addEventListener('resize', resize);

  window.addEventListener('pointermove', function (e) {
    mouse.tx = e.clientX / W;
    mouse.ty = e.clientY / H;
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (!inside) return;
    if (fine.classList.contains('show')) { fine.classList.remove('show'); return; }
    var letter = letterAt(e.clientX, e.clientY);
    if (letter >= 0) { sayWhisper(letter); return; }
    beginWish(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', endWish);
  window.addEventListener('pointercancel', endWish);
  window.addEventListener('blur', function () { pending = null; });

  revealBtn.addEventListener('click', lookUp);
  backBtn.addEventListener('click', comeDown);

  window.addEventListener('keydown', function (e) {
    if (!inside || e.target === doorInput) return;
    if (e.key === 'Escape') { fine.classList.remove('show'); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'scattered') lookUp();
      else if (state === 'formed') comeDown();
    }
  });

  document.addEventListener('visibilitychange', function () {
    document.title = document.hidden ? 'come back.' : 'a sky for melike';
  });

  resize();
  computeMoon();
  doorGreeting();
  loadWishes();
  renderSoundBtn();
  requestAnimationFrame(frame);
  // no autofocus on phones, the keyboard jumping up is annoying
  if (!('ontouchstart' in window)) setTimeout(function () { doorInput.focus(); }, 600);
})();
