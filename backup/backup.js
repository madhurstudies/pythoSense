/* ====================================================
   SENTINEL Command Center — backup.js
   Completely isolated simulation (no ESP32 / backend needed)
   Simulates: radar sweep, threat zones, DHT11, IR, soil
   ==================================================== */

/* ─── Canvas setup ─────────────────────────────────────────── */
const canvas = document.getElementById('radarCanvas');
const C = canvas.getContext('2d');
const W = 540, H = 300;
canvas.width = W; canvas.height = H;
const CX = W / 2, CY = H - 10;  // centre at bottom-centre
const MAX_R = H - 20;            // max radar radius

/* ─── State ────────────────────────────────────────────────── */
const state = {
  angle: 0,          // current servo angle 0-180
  dir: 1,            // sweep direction
  distances: new Float32Array(181).fill(400), // distance at each angle
  sweepTrail: [],    // [{angle,dist,ts}] — blip history
  threat: { level: 'CLEAR', angle: 90, dist: 400 },
  sensors: { temp: 29.4, hum: 58, soil1: 1200, soil2: 1180, ir: false, tilt: false, laser: false },
  suspended: false,
  uptime: 0,
};

// Scenario: occasional "intruder" appears at a random angle/dist
let intruder = null;
let injectNextIn = randomMs(6000, 14000);
let intruderDwell = 0;

function randomMs(min, max) { return min + Math.random() * (max - min); }
function rnd(min, max)      { return min + Math.random() * (max - min); }

/* ─── Clock & uptime ───────────────────────────────────────── */
function tick() {
  const now = new Date(), p = n => String(n).padStart(2,'0');
  const timeStr = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  document.getElementById('clock').textContent = timeStr;
  state.uptime++;
  const mins = Math.floor(state.uptime / 60), secs = state.uptime % 60;
  document.getElementById('uptime').textContent = `${p(mins)}:${p(secs)}`;
}
setInterval(tick, 1000); tick();

/* ─── Simulation step ──────────────────────────────────────── */
function step() {
  if (state.suspended) return;

  /* Advance servo */
  state.angle += state.dir * 2;
  if (state.angle >= 180) { state.angle = 180; state.dir = -1; }
  if (state.angle <= 0)   { state.angle = 0;   state.dir =  1; }

  /* Manage intruder scenario */
  injectNextIn -= 60; // ~60ms per step
  if (injectNextIn <= 0 && !intruder) {
    intruder = { angle: Math.round(rnd(20, 160)), dist: rnd(30, 200) };
    intruderDwell = randomMs(3000, 8000);
    logEvent(`MOTION DETECTED: perimeter probe initiated`, 'warn');
    injectNextIn = randomMs(12000, 30000);
  }
  if (intruder) {
    intruderDwell -= 60;
    if (intruderDwell <= 0) {
      intruder = null;
      logEvent('Contact lost — resuming normal sweep', 'ok');
    }
  }

  /* Build distance map */
  for (let a = 0; a <= 180; a++) {
    let base = 380 + rnd(-20, 20); // background "wall" at ~380
    if (intruder) {
      const delta = Math.abs(a - intruder.angle);
      if (delta < 12) {
        const fade = 1 - delta / 12;
        base = Math.min(base, intruder.dist + rnd(-8, 8) / fade);
      }
    }
    state.distances[a] = base;
  }
  // Current angle reading with noise
  const rawDist = state.distances[state.angle] + rnd(-4, 4);

  /* Blip trail */
  state.sweepTrail.push({ angle: state.angle, dist: Math.min(rawDist, 400), ts: Date.now() });
  if (state.sweepTrail.length > 600) state.sweepTrail.shift();

  /* Find closest threat */
  let minDist = 400, minAngle = 90;
  for (let a = 0; a <= 180; a++) {
    if (state.distances[a] < minDist) { minDist = state.distances[a]; minAngle = a; }
  }

  /* Determine threat level */
  const CLEAR = 150, ALERT = 50;
  const prev = state.threat.level;
  if (minDist < ALERT) {
    state.threat.level = 'LOCK';
    state.sensors.ir    = true;
    state.sensors.laser = true;
  } else if (minDist < CLEAR) {
    state.threat.level = 'ALERT';
    state.sensors.ir    = minDist < 100;
    state.sensors.laser = false;
  } else {
    state.threat.level   = 'CLEAR';
    state.sensors.ir     = false;
    state.sensors.laser  = false;
  }
  state.threat.angle = minAngle;
  state.threat.dist  = minDist;

  if (prev !== state.threat.level) {
    const msgs = {
      LOCK:  `LOCK ACQUIRED — ${minDist.toFixed(0)}cm @ ${minAngle}° — LASER ARMED`,
      ALERT: `ALERT — contact @ ${minDist.toFixed(0)}cm bearing ${minAngle}°`,
      CLEAR: 'Perimeter secured. Threat neutralised.',
    };
    logEvent(msgs[state.threat.level], state.threat.level.toLowerCase());
  }

  /* Drift sensor values */
  state.sensors.temp = 29 + 2 * Math.sin(Date.now() / 18000) + rnd(-0.2, 0.2);
  state.sensors.hum  = 57 + 4 * Math.sin(Date.now() / 22000) + rnd(-0.5, 0.5);
  state.sensors.soil1 = 1200 + rnd(-40, 40);
  state.sensors.soil2 = 1150 + rnd(-40, 40);
  state.sensors.tilt  = false; // stays false unless user triggers demo

  /* Render */
  drawRadar();
  updateUI();
}

/* ─── Radar drawing ────────────────────────────────────────── */
function polarToXY(angleDeg, r) {
  // 0° = left, 90° = top, 180° = right (semicircle at bottom)
  const rad = (180 - angleDeg) * Math.PI / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function drawRadar() {
  C.clearRect(0, 0, W, H);

  /* ── Background dark fill */
  C.fillStyle = '#000a00';
  C.fillRect(0, 0, W, H);

  /* ── Zone rings */
  const zones = [
    { r: (50  / 400) * MAX_R, color: 'rgba(255,32,32,0.15)',   label: 'LOCK <50cm'   },
    { r: (150 / 400) * MAX_R, color: 'rgba(255,179,0,0.08)',   label: 'ALERT <150cm' },
    { r: (400 / 400) * MAX_R, color: 'rgba(0,255,65,0.04)',    label: 'CLEAR'        },
  ];
  zones.forEach(z => {
    C.beginPath();
    C.arc(CX, CY, z.r, Math.PI, 0); // semicircle (top half only)
    C.strokeStyle = z.color.replace('0.', '0.4').replace('0.04', '0.15');
    C.lineWidth = 1;
    C.stroke();
    // Fill zone
    C.beginPath();
    C.moveTo(CX - z.r, CY);
    C.arc(CX, CY, z.r, Math.PI, 0);
    C.closePath();
    C.fillStyle = z.color;
    C.fill();
  });

  /* ── Grid lines every 30° */
  for (let a = 0; a <= 180; a += 30) {
    const end = polarToXY(a, MAX_R);
    C.beginPath();
    C.moveTo(CX, CY);
    C.lineTo(end.x, end.y);
    C.strokeStyle = 'rgba(0,255,65,0.09)';
    C.lineWidth = 1;
    C.stroke();
    // Angle label
    const lbl = polarToXY(a, MAX_R + (a % 90 === 0 ? -16 : -14));
    C.fillStyle = 'rgba(0,200,50,0.5)';
    C.font = '9px "Share Tech Mono", monospace';
    C.textAlign = 'center'; C.textBaseline = 'middle';
    C.fillText(`${a}°`, lbl.x, lbl.y);
  }

  /* ── Baseline */
  C.beginPath();
  C.moveTo(CX - MAX_R - 4, CY);
  C.lineTo(CX + MAX_R + 4, CY);
  C.strokeStyle = 'rgba(0,255,65,0.25)';
  C.lineWidth = 1.5;
  C.stroke();

  /* ── Blip trail (faded echoes) */
  const now = Date.now();
  state.sweepTrail.forEach(blip => {
    const age = now - blip.ts;
    if (age > 4000) return;
    const alpha = (1 - age / 4000) * 0.6;
    const r = (blip.dist / 400) * MAX_R;
    const { x, y } = polarToXY(blip.angle, r);
    C.beginPath();
    C.arc(x, y, 2, 0, Math.PI * 2);
    C.fillStyle = `rgba(0,255,65,${alpha})`;
    C.fill();
  });

  /* ── Threat blips (bright) */
  if (state.threat.level !== 'CLEAR') {
    const r = Math.min((state.threat.dist / 400) * MAX_R, MAX_R);
    const { x, y } = polarToXY(state.threat.angle, r);
    const blipColor = state.threat.level === 'LOCK' ? '#ff2020' : '#ffb300';
    // Pulse ring
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
    C.beginPath();
    C.arc(x, y, 6 + pulse * 5, 0, Math.PI * 2);
    C.strokeStyle = blipColor + '80';
    C.lineWidth = 1.5; C.stroke();
    // Blip dot
    C.beginPath();
    C.arc(x, y, 4, 0, Math.PI * 2);
    C.fillStyle = blipColor;
    C.shadowColor = blipColor; C.shadowBlur = 12;
    C.fill();
    C.shadowBlur = 0;
    // Distance label
    C.fillStyle = blipColor;
    C.font = 'bold 10px "Share Tech Mono", monospace';
    C.textAlign = 'center'; C.textBaseline = 'bottom';
    C.fillText(`${state.threat.dist.toFixed(0)}cm`, x, y - 7);
  }

  /* ── Sweep line */
  const sweepEnd = polarToXY(state.angle, MAX_R);
  const sweepGrad = C.createLinearGradient(CX, CY, sweepEnd.x, sweepEnd.y);
  sweepGrad.addColorStop(0, 'rgba(0,255,65,0)');
  sweepGrad.addColorStop(1, 'rgba(0,255,65,0.9)');
  C.beginPath();
  C.moveTo(CX, CY);
  C.lineTo(sweepEnd.x, sweepEnd.y);
  C.strokeStyle = sweepGrad;
  C.lineWidth = 2;
  C.shadowColor = '#00ff41'; C.shadowBlur = 8;
  C.stroke(); C.shadowBlur = 0;

  /* ── Centre dot */
  C.beginPath();
  C.arc(CX, CY, 4, 0, Math.PI * 2);
  C.fillStyle = '#00ff41';
  C.shadowColor = '#00ff41'; C.shadowBlur = 10;
  C.fill(); C.shadowBlur = 0;

  /* ── Sweep angle label */
  C.fillStyle = 'rgba(0,255,65,0.55)';
  C.font = '10px "Share Tech Mono", monospace';
  C.textAlign = 'left'; C.textBaseline = 'top';
  C.fillText(`SWEEP: ${state.angle}°`, 8, 8);
  C.textAlign = 'right';
  C.fillText(`D: ${state.distances[state.angle].toFixed(0)}cm`, W - 8, 8);
}

/* ─── UI elements ──────────────────────────────────────────── */
function setEl(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function setW(id, pct, cap=100) { const e = document.getElementById(id); if (e) e.style.width = `${Math.min(cap, Math.max(0, pct))}%`; }
function setClass(id, cls) { const e = document.getElementById(id); if (e) e.className = cls; }
function setPill(id, on, label, mode='') {
  const e = document.getElementById(id); if (!e) return;
  e.className = `stat-pill ${on ? (mode || 'pill-on') : 'pill-off'}`;
  const v = e.querySelector('.stat-pill-val'); if (v) v.textContent = on ? '■ ON' : '□ OFF';
}

function updateUI() {
  const { threat, sensors } = state;

  /* Threat badge in nav */
  const badge = document.getElementById('threatBadge');
  if (badge) {
    badge.textContent = threat.level === 'CLEAR' ? '● PERIMETER CLEAR'
                      : threat.level === 'ALERT' ? '▲ ALERT — CONTACT'
                      : '⬛ LOCK — FIRE AUTH';
    badge.className = `threat-badge ${threat.level.toLowerCase()}`;
  }

  /* Radar stats */
  setEl('statDist',  threat.dist < 400 ? `${threat.dist.toFixed(0)} cm` : '— cm');
  setEl('statAngle', `${threat.angle}°`);
  setEl('statLevel', threat.level);

  /* Sensor cards */
  setEl('distVal',  threat.dist < 400 ? threat.dist.toFixed(0) : '---');
  setW('distBar', (1 - Math.min(threat.dist, 400) / 400) * 100);

  setEl('angleVal', state.angle);
  setW('angleBar', (state.angle / 180) * 100);

  setEl('tempVal', sensors.temp.toFixed(1));
  setW('tempBar', (sensors.temp / 60) * 100);
  document.getElementById('tempFill') && (document.getElementById('tempFill').style.background =
    sensors.temp > 40 ? '#ff2020' : sensors.temp > 35 ? '#ffb300' : '#fbbf24');

  setEl('humVal', Math.round(sensors.hum));
  setW('humBar', sensors.hum);

  setEl('soil1Val', sensors.soil1.toFixed(0));
  setEl('soil2Val', sensors.soil2.toFixed(0));

  const irEl = document.getElementById('irVal');
  if (irEl) {
    irEl.textContent = sensors.ir ? 'CONFIRMED' : 'NEGATIVE';
    irEl.style.color = sensors.ir ? '#ff2020' : '#4a6e4a';
    irEl.style.textShadow = sensors.ir ? '0 0 8px #ff202080' : 'none';
  }

  /* Status pills */
  setPill('pillLaser',  sensors.laser,  '', sensors.laser ? 'pill-red' : '');
  setPill('pillIR',     sensors.ir,     '', sensors.ir    ? 'pill-amb' : '');
  setPill('pillTilt',   sensors.tilt,   '', sensors.tilt  ? 'pill-red' : '');
  setPill('pillSweep',  !state.suspended, '', '');
}

/* ─── Event log ────────────────────────────────────────────── */
const logEl = document.getElementById('eventLog');
let logCount = 0;

function logEvent(msg, type = 'ok') {
  if (!logEl) return;
  const now = new Date(), p = n => String(n).padStart(2,'0');
  const time = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg ${type}">${msg}</span>`;
  logEl.prepend(line);
  logCount++;
  // Keep last 60 entries
  while (logEl.children.length > 60) logEl.removeChild(logEl.lastChild);
}

/* ─── Boot sequence ────────────────────────────────────────── */
(function boot() {
  const msgs = [
    ['SENTINEL v1.3.0 initialised', 'sys'],
    ['ESP32 DevKit — 240 MHz dual core', 'sys'],
    ['Servo sweep: 0°→180° active', 'sys'],
    ['DHT11 Online — temp nominal', 'ok'],
    ['Soil tripwires CH34/CH35 armed', 'ok'],
    ['IR cross-check module: STANDBY', 'ok'],
    ['WiFi AP: SENTINEL_AP active', 'ok'],
    ['Radar sweep commenced. Perimeter armed.', 'ok'],
  ];
  msgs.forEach((m, i) => setTimeout(() => logEvent(...m), i * 280));
})();

/* ─── Tripwire demo trigger ────────────────────────────────── */
setInterval(() => {
  if (Math.random() < 0.02) { // ~2% per second
    logEvent('SOIL TRIPWIRE CH34 — conductivity spike detected!', 'warn');
    setTimeout(() => logEvent('Tripwire Ch34 returned to baseline', 'ok'), 2000);
  }
}, 1000);

/* ─── Main loop ────────────────────────────────────────────── */
setInterval(step, 60); // ~16 fps
