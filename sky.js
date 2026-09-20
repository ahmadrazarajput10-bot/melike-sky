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
  var doorLabel = $('door-label');
  var fine = $('fine');
  var fineOpen = $('fine-open');
  var fineClose = $('fine-close');
  var whisper = $('whisper');
  var moonNote = $('moon-note');
  var bdayEl = $('bday');
  var soundBtn = $('sound');
  var entryStars = $('entry-stars');
  var wishbox = $('wishbox');
  var wishboxTitle = $('wishbox-title');
  var wishboxText = $('wishbox-text');
  var wishboxInput = $('wishbox-input');
  var wishboxKeep = $('wishbox-keep');
  var wishboxDrop = $('wishbox-drop');
  var wishboxDot = $('wishbox-dot');
  var wishboxOk = $('wishbox-ok');

  var inside = false;   // past the door yet?
  var enteredAt = 0;
  var isTouch = 'ontouchstart' in window;

  var W = 0, H = 0, DPR = 1;
  var mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  var now = 0;

  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var easeInOut = function (p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  var easeOut = function (p) { return 1 - Math.pow(1 - p, 3); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var TAU = Math.PI * 2;

  // performance.now shares a clock with rAF timestamps, and keeps ticking
  // even when the tab is in the background and frames are paused
  var clock = function () { return performance.now() / 1000; };

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; } // private mode or whatever, does not matter
  }

  // ---------------------------------------------------------------
  // june 7. the countdown is real, the day is special.
  // add ?when=2027-06-07 to the url to see what the day looks like.
  // ---------------------------------------------------------------
  var BDAY_MONTH = 5;   // june, zero-based because javascript
  var BDAY_DAY = 7;
  var fakeOffset = 0;

  (function () {
    var m = /[?&]when=(\d{4})-(\d{2})-(\d{2})/.exec(location.search);
    if (m) {
      var pretend = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
      fakeOffset = pretend.getTime() - Date.now();
    }
  })();

  function today() { return new Date(Date.now() + fakeOffset); }

  var birthday = (function () {
    var d = today();
    return d.getMonth() === BDAY_MONTH && d.getDate() === BDAY_DAY;
  })();

  function nextBirthday() {
    var d = today();
    var y = d.getFullYear();
    var next = new Date(y, BDAY_MONTH, BDAY_DAY, 0, 0, 0);
    if (next.getTime() <= d.getTime()) next = new Date(y + 1, BDAY_MONTH, BDAY_DAY, 0, 0, 0);
    return next;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function tickCountdown() {
    if (birthday) {
      bdayEl.textContent = 'it’s june 7.\nhappy birthday, Melike.';
      return;
    }
    var ms = nextBirthday().getTime() - today().getTime();
    var s = Math.max(0, Math.floor(ms / 1000));
    var days = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var mnt = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var line;
    if (days === 0) line = h + 'h ' + pad(mnt) + 'm ' + pad(sec) + 's till june 7.\nalmost.';
    else if (days === 1) line = '1 day, ' + h + 'h ' + pad(mnt) + 'm ' + pad(sec) + 's\ntill june 7. tomorrow, then.';
    else line = days + ' days, ' + h + 'h ' + pad(mnt) + 'm ' + pad(sec) + 's\ntill june 7. not that i’m counting.';
    bdayEl.textContent = line;
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
          warm: Math.random() < (birthday ? 0.4 : 0.16)   // a bit more gold on the day
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
    'I. one line. the easiest, and somehow the one i got wrong twice.',
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

  function layoutTargets() {
    var maxW = W * 0.78;
    var maxH = H * 0.24;
    var scale = Math.min(maxW / word.width, maxH);
    var totalW = word.width * scale;
    var x0 = (W - totalW) / 2;
    var y0 = H * 0.38 - scale / 2;
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
  // the whisper line at the top. letters use it, the sky uses it.
  // ---------------------------------------------------------------
  var whisperTimer = 0;

  function say(text, hold) {
    whisper.textContent = text;
    whisper.classList.add('show');
    document.body.classList.add('whispering');   // moon note steps aside
    clearTimeout(whisperTimer);
    whisperTimer = setTimeout(function () {
      whisper.classList.remove('show');
      document.body.classList.remove('whispering');
    }, hold || 3400);
  }

  function sayLetter(letter) {
    litLetter = letter;
    litAt = now;
    say(WHISPERS[letter]);
  }

  // ---------------------------------------------------------------
  // wishes. tap for a star, hold for a big one, tap it again to
  // write on it. the three silver ones were already there.
  // ---------------------------------------------------------------
  var wishes = [];
  var STORE = 'melike-sky-wishes';
  var lastWasBig = false;
  var pending = null;       // the one being held down right now
  var wishEdges = [];       // pairs of wishes close enough to join up
  var biggestGroup = 0;
  var sparks = [];
  var flashes = [];

  var SEEDS = [
    { x: 0.12, y: 0.20, text: 'that you actually opened this.' },
    { x: 0.87, y: 0.64, text: 'that you’re doing alright. genuinely.' },
    { x: 0.30, y: 0.88, text: '(this one’s still private.)' }
  ];
  var seeds = SEEDS.map(function (s, i) {
    return { x: s.x, y: s.y, r: 1.9, born: -20, ph: i * 2.1, text: s.text, seed: true };
  });

  function loadWishes() {
    var arr = store(STORE);
    if (arr && arr.length) {
      for (var i = 0; i < arr.length; i++) {
        wishes.push({
          x: arr[i][0], y: arr[i][1],
          r: arr[i][2] || rand(1.1, 1.9),
          text: arr[i][3] || '',
          born: -10 - i * 0.05,
          ph: rand(0, TAU)
        });
      }
    }
    rebuildEdges();
    updateCounter();
  }

  function saveWishes() {
    store(STORE, wishes.slice(-400).map(function (w) {
      return [+w.x.toFixed(4), +w.y.toFixed(4), +w.r.toFixed(2), w.text || ''];
    }));
  }

  // wishes that land near each other join up into her own little constellation.
  // each one only reaches for its two nearest neighbours, otherwise a busy
  // sky turns into a spider web. learned that the hard way.
  function rebuildEdges() {
    wishEdges = [];
    var D = Math.min(W, H) * 0.17;
    var i, j, seen = {};
    for (i = 0; i < wishes.length; i++) {
      var near = [];
      for (j = 0; j < wishes.length; j++) {
        if (i === j) continue;
        var dx = (wishes[i].x - wishes[j].x) * W;
        var dy = (wishes[i].y - wishes[j].y) * H;
        var d2 = dx * dx + dy * dy;
        if (d2 < D * D) near.push([d2, j]);
      }
      near.sort(function (a, b) { return a[0] - b[0]; });
      for (var k = 0; k < near.length && k < 2; k++) {
        var a = Math.min(i, near[k][1]), b = Math.max(i, near[k][1]);
        var key = a + '-' + b;
        if (!seen[key]) { seen[key] = true; wishEdges.push([a, b]); }
      }
    }
    // biggest connected bunch, for the potato line
    var parent = [];
    for (i = 0; i < wishes.length; i++) parent[i] = i;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    for (i = 0; i < wishEdges.length; i++) parent[find(wishEdges[i][0])] = find(wishEdges[i][1]);
    var sizes = {};
    biggestGroup = 0;
    for (i = 0; i < wishes.length; i++) {
      var root = find(i);
      sizes[root] = (sizes[root] || 0) + 1;
      if (sizes[root] > biggestGroup) biggestGroup = sizes[root];
    }
  }

  function updateCounter() {
    var n = wishes.length;
    var line;
    if (n === 0) line = 'no wishes yet. tough crowd.';
    else if (n === 1) line = 'one wish. modest.';
    else if (n < 5) line = n + ' wishes.' + (wishEdges.length ? ' they’re starting to connect.' : '');
    else if (n < 10) line = n + ' wishes. getting greedy.';
    else if (n < 25) line = n + ' wishes. ok slow down.';
    else if (n < 60) line = n + ' wishes. the sky is not a vending machine.';
    else if (n < 100) line = n + ' wishes. i am not made of stars, you know.';
    else line = n + ' wishes. reporting you to the moon.';
    if (birthday && n > 0) line += ' birthday ones count double. rule.';
    if (lastWasBig) line += ' that last one was big. what did you wish for?';
    wishesEl.textContent = line;
  }

  function holdRadius(held) {
    // tap = small star, hold up to ~1.4s = big one
    return 1.6 + easeOut(clamp(held / 1.4, 0, 1)) * 3.0;
  }

  function beginWish(px, py) {
    pending = { x: px, y: py, t0: clock() };
  }

  function endWish() {
    if (!pending) return;
    var held = clock() - pending.t0;
    var r = holdRadius(held);
    var w = { x: pending.x / W, y: pending.y / H, r: r, born: now, ph: rand(0, TAU), text: '' };
    wishes.push(w);
    burst(pending.x, pending.y, birthday ? r + 1.5 : r, birthday && Math.random() < 0.5 ? 'silver' : 'gold');
    lastWasBig = r > 3.4;
    pending = null;
    rebuildEdges();
    updateCounter();
    saveWishes();
    chime(r);

    // one line at a time. the potato beats the milestones beats the hint.
    var n = wishes.length;
    var hinted = store('melike-sky-hinted') || 0;
    if (biggestGroup >= 5 && !store('melike-sky-potato')) {
      store('melike-sky-potato', true);
      say('that’s a constellation now. it looks like a potato. i love it.');
    } else if (n === 7) {
      spawnShooter();
      say('a real one. that’s for the seventh.');
    } else if (n === 21) {
      say('twenty-one. are you even wishing anymore, or just poking the sky?');
    } else if (n === 50) {
      say('fifty. ok. the moon says hi.');
    } else if (n === 100) {
      say('a hundred. genuinely impressed. slightly worried.');
    } else if (hinted < 2) {
      store('melike-sky-hinted', hinted + 1);
      say('tap it to write the wish.');
    }
  }

  function burst(px, py, r, tint) {
    var n = 14 + Math.round(r * 4);
    for (var i = 0; i < n; i++) {
      var a = rand(0, TAU);
      var sp = rand(30, 140) * (0.6 + r / 3);
      sparks.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: now, life: rand(0.5, 1.1), s: rand(0.5, 1.3), tint: tint || 'gold' });
    }
    flashes.push({ x: px, y: py, r: 12 + r * 10, born: now, tint: tint || 'gold' });
  }

  // which star did the tap land on, if any. hers or the silver ones.
  function wishAt(px, py) {
    var best = null, bestD = isTouch ? 24 : 20;
    var all = wishes.concat(seeds);
    for (var i = 0; i < all.length; i++) {
      var d = Math.hypot(all[i].x * W - px, all[i].y * H - py);
      if (d < bestD) { bestD = d; best = all[i]; }
    }
    return best;
  }

  // ---------------------------------------------------------------
  // the note box on a star
  // ---------------------------------------------------------------
  var openWish = null;

  var REPLIES = ['noted.', 'kept.', 'the moon has been informed.', 'filed under: pending.', 'ok. that one’s a good one.', 'i’ll see what i can do.'];

  function replyTo(t) {
    var s = t.toLowerCase();
    if (/more wish/.test(s)) return 'more wishes? i said no.';
    if (s.length > 80) return 'that’s not a wish, that’s a paragraph. kept it anyway.';
    if (/melike/.test(s)) return 'wishing for yourself? bold. respect.';
    if (/sleep|nap/.test(s)) return 'granted. eventually.';
    if (/coffee|tea|çay|chai/.test(s)) return 'granted. you know where the kettle is.';
    if (/pizza|food|cake|chocolate|dessert|burger/.test(s)) return 'granted, probably. i’m not made of money.';
    if (/\?$/.test(s)) return 'that’s a question, not a wish. kept it anyway.';
    if (birthday) return 'birthday wish. those go to the front of the queue.';
    return REPLIES[Math.floor(Math.random() * REPLIES.length)];
  }

  function openBox(w, px, py) {
    openWish = w;
    if (w.seed) {
      wishboxTitle.textContent = 'someone’s wish. from a while ago.';
      wishboxText.textContent = w.text;
      wishboxText.hidden = false;
      wishboxInput.hidden = true;
      wishboxKeep.hidden = true;
      wishboxDot.hidden = true;
      wishboxDrop.hidden = true;
      wishboxOk.hidden = false;
    } else {
      var idx = wishes.indexOf(w) + 1;
      wishboxTitle.textContent = 'wish no. ' + idx + (w.r > 3.4 ? '. the big one.' : '');
      wishboxText.hidden = true;
      wishboxInput.hidden = false;
      wishboxInput.value = w.text || '';
      wishboxKeep.hidden = false;
      wishboxDot.hidden = false;
      wishboxDrop.hidden = false;
      wishboxOk.hidden = true;
    }
    wishbox.classList.add('show');
    placeBox(px, py);
    if (!w.seed) setTimeout(function () { wishboxInput.focus(); }, 40);
  }

  function placeBox(px, py) {
    var bw = wishbox.offsetWidth, bh = wishbox.offsetHeight;
    var left, top;
    if (W < 600) {
      // phones: keep it up top so the keyboard doesn't sit on it
      left = (W - bw) / 2;
      top = Math.max(12, H * 0.10);
    } else {
      left = clamp(px - bw / 2, 12, W - bw - 12);
      top = py < H * 0.55 ? py + 26 : py - bh - 26;
      top = clamp(top, 12, H - bh - 12);
    }
    wishbox.style.left = left + 'px';
    wishbox.style.top = top + 'px';
  }

  function closeBox() {
    if (!openWish) return;
    openWish = null;
    wishbox.classList.remove('show');
    wishboxInput.blur();
  }

  function keepWish() {
    if (!openWish || openWish.seed) return;
    var t = wishboxInput.value.trim().slice(0, 120);
    var changed = t !== (openWish.text || '');
    openWish.text = t;
    saveWishes();
    closeBox();
    if (t && changed) {
      say(replyTo(t));
      chime(1.2, true);
    }
  }

  function dropWish() {
    if (!openWish || openWish.seed) return;
    var i = wishes.indexOf(openWish);
    if (i >= 0) wishes.splice(i, 1);
    closeBox();
    lastWasBig = false;
    rebuildEdges();
    updateCounter();
    saveWishes();
    say('gone. no one saw.');
  }

  wishboxKeep.addEventListener('click', keepWish);
  wishboxDrop.addEventListener('click', dropWish);
  wishboxOk.addEventListener('click', closeBox);
  wishboxInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); keepWish(); }
    else if (e.key === 'Escape') { closeBox(); }
  });

  // ---------------------------------------------------------------
  // a tiny chime per wish. web audio, nothing loaded.
  // ---------------------------------------------------------------
  var audio = null;
  var soundOn = store('melike-sky-sound') !== false;
  var NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];  // C major pentatonic-ish, sounds fine

  function tone(freq, when, len, vol) {
    var gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(vol, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + len);
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
    o1.start(when); o2.start(when);
    o1.stop(when + len + 0.2); o2.stop(when + len + 0.2);
  }

  function ensureAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  }

  function chime(r, soft) {
    if (!soundOn) return;
    try {
      ensureAudio();
      var big = r > 3.4;
      var freq = NOTES[Math.floor(Math.random() * NOTES.length)] / (big || soft ? 2 : 1);
      tone(freq, audio.currentTime, soft ? 0.7 : big ? 2.4 : 1.3, soft ? 0.04 : big ? 0.09 : 0.06);
    } catch (e) { /* no audio, no problem */ }
  }

  // a little climbing figure. only on the day.
  function fanfare() {
    if (!soundOn) return;
    try {
      ensureAudio();
      var t0 = audio.currentTime;
      var seq = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < seq.length; i++) tone(seq[i], t0 + i * 0.16, 1.6, 0.05);
    } catch (e) {}
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
    var days = (today().getTime() - ref) / 86400000;
    var p = (days / 29.530588853) % 1;
    if (p < 0) p += 1;
    moon.phase = p;
    moon.lit = (1 - Math.cos(p * TAU)) / 2;
    var names = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'last quarter', 'waning crescent'];
    moon.name = names[Math.round(p * 8) % 8];

    var pct = Math.round(moon.lit * 100);
    var line;
    if (birthday) line = moon.name === 'full' ? 'full moon on your birthday. i’d like to say i arranged that.' : 'the moon is ' + pct + '% lit tonight. it tried its best for you.';
    else if (moon.name === 'full') line = 'full moon tonight. i did not plan that. i’m taking credit anyway.';
    else if (moon.name === 'new') line = 'new moon tonight. so it’s just the stars. convenient.';
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
  // shooting stars, every so often. a lot more often on the day.
  // ---------------------------------------------------------------
  var shooters = [];
  var nextShooter = 2.5;
  var nextFirework = 0;

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
    if (birthday && inside) {
      // a shower for the first minute, then a steady trickle all day
      nextShooter = now + (now - enteredAt < 60 ? rand(0.3, 1.1) : rand(2, 5));
    } else {
      nextShooter = now + rand(6, 14);
    }
  }

  // distant fireworks. only on the day.
  function spawnFirework() {
    var px = rand(0.1, 0.9) * W;
    var py = rand(0.08, 0.55) * H;
    burst(px, py, rand(3, 5), Math.random() < 0.5 ? 'gold' : 'silver');
    nextFirework = now + rand(1.5, 4);
  }

  // ---------------------------------------------------------------
  // drawing. gradients are cached, phones did not enjoy making
  // sixty of them per frame.
  // ---------------------------------------------------------------
  var skyGrad = null, bandGrad = null;
  var glowCache = {};

  function buildGradients() {
    skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#05081a');
    skyGrad.addColorStop(0.55, '#0c1230');
    skyGrad.addColorStop(1, '#1c1a3c');
    // faint milky way-ish band. subtle. you only notice it if you look for it.
    bandGrad = ctx.createLinearGradient(W * 0.1, H, W * 0.9, 0);
    bandGrad.addColorStop(0, 'rgba(120,130,200,0)');
    bandGrad.addColorStop(0.45, 'rgba(120,130,200,0.045)');
    bandGrad.addColorStop(0.55, 'rgba(160,150,210,0.055)');
    bandGrad.addColorStop(1, 'rgba(120,130,200,0)');
  }

  function glowSprite(color) {
    var sp = glowCache[color];
    if (sp) return sp;
    sp = document.createElement('canvas');
    sp.width = sp.height = 64;
    var c = sp.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    glowCache[color] = sp;
    return sp;
  }

  function glow(x, y, r, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  function drawSky() {
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = bandGrad;
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

  function litGlow() {
    // fades out over ~3s after a letter tap
    return clamp(1 - (now - litAt - 2.2) / 0.8, 0, 1);
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
    var starColor = birthday ? 'rgba(255,236,200,0.6)' : 'rgba(200,210,255,0.55)';
    for (i = 0; i < cstars.length; i++) {
      s = cstars[i];
      var bright = state === 'formed' ? 1 : 0.8;
      var tw = 0.75 + 0.25 * Math.sin(now * 1.6 + s.ph);
      var extra = (state === 'formed' && s.letter === litLetter) ? litGlow() : 0;
      glow(s.px, s.py, s.r * (7 + extra * 6), starColor, (0.5 + extra * 0.4) * tw * bright);
      ctx.globalAlpha = Math.min(1, tw * bright + extra * 0.3);
      ctx.fillStyle = extra > 0 ? '#fff6dc' : '#fbfbff';
      ctx.beginPath();
      ctx.arc(s.px, s.py, s.r + extra * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWishes() {
    var i, w, x, y;

    // the joins between neighbouring wishes
    if (wishEdges.length) {
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (i = 0; i < wishEdges.length; i++) {
        var a = wishes[wishEdges[i][0]], b = wishes[wishEdges[i][1]];
        if (!a || !b) continue;
        var young = Math.min(now - a.born, now - b.born);
        ctx.globalAlpha = 0.18 * clamp(young / 1.2, 0, 1);
        ctx.strokeStyle = '#ffe3a8';
        ctx.beginPath();
        ctx.moveTo(a.x * W, a.y * H);
        ctx.lineTo(b.x * W, b.y * H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // the three that were here first. silver, slow pulse, a ring now and then.
    for (i = 0; i < seeds.length; i++) {
      w = seeds[i];
      x = w.x * W; y = w.y * H;
      var pulse = 0.6 + 0.4 * Math.sin(now * 0.9 + w.ph);
      var ringP = (now * 0.3 + w.ph) % 1;
      glow(x, y, w.r * 8, 'rgba(200,215,255,0.6)', 0.5 * pulse);
      ctx.globalAlpha = 0.22 * (1 - ringP);
      ctx.strokeStyle = '#dfe6ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 7 + ringP * 16, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.85 + 0.15 * pulse;
      ctx.fillStyle = '#eef2ff';
      ctx.beginPath();
      ctx.arc(x, y, w.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // hers
    for (i = 0; i < wishes.length; i++) {
      w = wishes[i];
      var age = now - w.born;
      x = w.x * W; y = w.y * H;
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
      glow(x, y, r * 6 + 4, 'rgba(255,225,170,0.6)', 0.5 * tw);
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#fff1cf';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      // ones with words on them glint now and then
      if (w.text) {
        var g = Math.sin(now * 0.8 + w.ph);
        if (g > 0.6) {
          var ga = (g - 0.6) / 0.4;
          var len = r * 4 + 5;
          ctx.globalAlpha = ga * 0.6;
          ctx.strokeStyle = '#fff6dc';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
          ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
          ctx.stroke();
        }
      }
      // the one you're looking at right now
      if (w === openWish) {
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now * 3);
        ctx.strokeStyle = '#ffe3a8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // the one being held right now
    if (pending) {
      var held = clock() - pending.t0;
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

  function drawSparks() {
    var i;
    for (i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i];
      var fp = (now - f.born) / 0.4;
      if (fp >= 1) { flashes.splice(i, 1); continue; }
      glow(f.x, f.y, f.r * (1 + fp * 1.5), f.tint === 'silver' ? 'rgba(225,232,255,0.9)' : 'rgba(255,238,200,0.9)', (1 - fp) * 0.6);
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      var k = sparks[i];
      var age = now - k.born;
      if (age > k.life) { sparks.splice(i, 1); continue; }
      var p = age / k.life;
      var d = age * (1 - p * 0.55);   // slows down as it goes
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.fillStyle = k.tint === 'silver' ? '#e6ecff' : '#ffe7b0';
      ctx.beginPath();
      ctx.arc(k.x + k.vx * d, k.y + k.vy * d, k.s * (1 - p * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    closeBox();
    for (var i = 0; i < cstars.length; i++) { cstars[i].fx = cstars[i].px; cstars[i].fy = cstars[i].py; }
    layoutTargets();
    state = 'gathering';
    stateAt = now;
    afterShown = false;
    note.classList.add('hidden');
  }

  function comeDown() {
    if (state !== 'formed') return;
    closeBox();
    for (var i = 0; i < cstars.length; i++) {
      cstars[i].fx = cstars[i].px; cstars[i].fy = cstars[i].py;
      cstars[i].x = rand(0.02, 0.98); cstars[i].y = rand(0.02, 0.98);
    }
    state = 'scattering';
    stateAt = now;
    litLetter = -1;
    whisper.classList.remove('show');
    document.body.classList.remove('whispering');
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
    var best = -1, bestD = isTouch ? 30 : 26;
    for (var i = 0; i < cstars.length; i++) {
      var d = Math.hypot(cstars[i].px - px, cstars[i].py - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? -1 : cstars[best].letter;
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
    var d = today();
    var h = d.getHours();
    var m = d.getMinutes();
    var hh = ((h + 11) % 12) + 1;
    var clockStr = hh + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? 'am' : 'pm');
    var line;
    if (h >= 23 || h < 5) line = 'it’s ' + clockStr + '. you should be asleep. so should i.';
    else if (h < 11) line = 'bit early for stars. fine.';
    else if (h < 17) line = 'stars work better at night. come back later. or don’t, i’m not your boss.';
    else line = 'good timing. it’s getting dark.';

    var visits = (store('melike-sky-visits') || 0) + 1;
    store('melike-sky-visits', visits);
    if (visits === 2) line = 'back again? ' + line;
    else if (visits > 2) line = 'visit no. ' + visits + '. i’m counting. ' + line;

    if (birthday) {
      line = 'it’s june 7. no password today.';
      doorLabel.textContent = 'just knock.';
      doorInput.placeholder = 'anything works today';
    }
    doorTime.textContent = line;
  }

  function letIn(greeting) {
    inside = true;
    enteredAt = now;
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
    if (birthday) {
      nextShooter = now + 1.2;
      nextFirework = now + 2.5;
      setTimeout(fanfare, 1000);
      setTimeout(function () { say('the sky’s yours today. it always was, but today it’s official.', 5000); }, 4200);
    }
  }

  doorForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (inside) return;
    var who = doorInput.value.trim().toLowerCase();
    if (birthday) {
      letIn('happy birthday. get in.');
      return;
    }
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

  fineOpen.addEventListener('click', function () { closeBox(); fine.classList.add('show'); resetArmed = false; resetBtn.textContent = 'start over'; });
  fineClose.addEventListener('click', function () { fine.classList.remove('show'); });

  // wipe the wishes. two taps, so a stray thumb doesn't do it.
  var resetBtn = $('reset');
  var resetArmed = false;
  resetBtn.addEventListener('click', function () {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = 'sure? tap again.';
      return;
    }
    wishes = [];
    lastWasBig = false;
    store(STORE, []);
    store('melike-sky-potato', false);
    store('melike-sky-hinted', 0);
    rebuildEdges();
    updateCounter();
    resetArmed = false;
    resetBtn.textContent = 'start over';
    fine.classList.remove('show');
    say('clean sky. no one saw.');
  });

  // ---------------------------------------------------------------
  // loop + events
  // ---------------------------------------------------------------
  function frame(ts) {
    now = ts / 1000;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    if (now > nextShooter) spawnShooter();
    if (birthday && inside && now > nextFirework) spawnFirework();
    tickState();

    drawSky();
    drawStars();
    drawMoon();
    drawShooters();
    drawWishes();
    drawSparks();
    drawConstellation();

    requestAnimationFrame(frame);
  }

  var lastW = 0, lastH = 0;

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    // a phone keyboard opening only changes the height. leave everything
    // where it is or the box you're typing in jumps around and closes.
    if (typing && w === lastW) return;
    var fresh = w !== lastW || Math.abs(h - lastH) > lastH * 0.35;
    lastW = w; lastH = h;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = w; H = h;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildGradients();
    if (fresh || !layers.length) seedStars();
    if (cstars.length) layoutTargets(); else seedConstellation();
    rebuildEdges();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 250); });

  window.addEventListener('pointermove', function (e) {
    mouse.tx = e.clientX / W;
    mouse.ty = e.clientY / H;
  });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('pointerdown', function (e) {
    if (!inside) return;
    if (fine.classList.contains('show')) { fine.classList.remove('show'); return; }
    if (openWish) { closeBox(); return; }
    var letter = letterAt(e.clientX, e.clientY);
    if (letter >= 0) { sayLetter(letter); return; }
    var w = wishAt(e.clientX, e.clientY);
    if (w) { openBox(w, e.clientX, e.clientY); return; }
    beginWish(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', endWish);
  window.addEventListener('pointercancel', endWish);
  window.addEventListener('blur', function () { pending = null; });

  revealBtn.addEventListener('click', lookUp);
  backBtn.addEventListener('click', comeDown);

  window.addEventListener('keydown', function (e) {
    if (!inside || e.target === doorInput || e.target === wishboxInput) return;
    if (e.key === 'Escape') { fine.classList.remove('show'); closeBox(); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'scattered') lookUp();
      else if (state === 'formed') comeDown();
    }
  });

  document.addEventListener('visibilitychange', function () {
    document.title = document.hidden ? 'come back.' : 'a sky for melike';
  });

  if (birthday) document.body.classList.add('birthday');
  resize();
  computeMoon();
  doorGreeting();
  loadWishes();
  renderSoundBtn();
  tickCountdown();
  setInterval(tickCountdown, 1000);
  requestAnimationFrame(frame);
  // no autofocus on phones, the keyboard jumping up is annoying
  if (!isTouch) setTimeout(function () { doorInput.focus(); }, 600);
})();
