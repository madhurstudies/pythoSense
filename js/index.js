/* ─── Particles ──────────────────────────────────────────────── */
(function () {
  const field = document.getElementById('particleField');
  if (!field) return;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;bottom:${Math.random()*20}%;--dur:${Math.random()*14+8}s;--delay:${Math.random()*10}s;opacity:0;`;
    field.appendChild(p);
  }
})();

/* ─── Fade-in on scroll ─────────────────────────────────────── */
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));

/* ─── Clock ─────────────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const el = document.getElementById('last-updated');
  if (el) el.textContent = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}
updateClock();
setInterval(updateClock, 1000);

/* ─── Trend Chart ───────────────────────────────────────────── */
const hours = Array.from({length: 24}, (_, i) => `${String(i).padStart(2,'0')}:00`);
const tempData = [23,22,22,21,21,22,23,24,25,26,27,28,28,29,29,28,27,27,27,28,28,28,28,28];
const humData  = [68,70,71,73,74,72,70,68,66,65,63,62,61,63,65,65,64,63,62,63,62,62,63,63];
const soilData = [55,56,54,53,52,54,56,58,60,62,64,65,66,65,64,62,60,58,56,55,54,55,56,57];

const ctx = document.getElementById('trendChart').getContext('2d');
const trendChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: hours,
    datasets: [
      { label: 'Temperature (°C)', data: tempData, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#f87171', tension: 0.42, fill: true, yAxisID: 'yTemp' },
      { label: 'Humidity (%)',      data: humData,  borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.07)',  borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#60a5fa', tension: 0.42, fill: true, yAxisID: 'yHum'  },
      { label: 'Soil Moisture (%)',data: soilData, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#4ade80', tension: 0.42, fill: true, yAxisID: 'ySoil' },
    ]
  },
  options: {
    responsive: true, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', labels: { color: '#395447', font: { size: 10 }, usePointStyle: true, padding: 15 } },
      tooltip: { backgroundColor: 'rgba(8,15,11,0.92)', borderColor: 'rgba(74,222,128,0.2)', borderWidth: 1, titleColor: '#e8f5ee', bodyColor: '#7aab8a', padding: 10 }
    },
    scales: {
      x:     { ticks: { color: '#395447', font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.03)' } },
      yTemp: { type: 'linear', position: 'left',  ticks: { color: '#f87171', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, min: 17, max: 45 },
      yHum:  { type: 'linear', position: 'right', ticks: { color: '#60a5fa', font: { size: 10 } }, grid: { display: false }, min: 20, max: 100 },
      ySoil: { type: 'linear', position: 'right', ticks: { color: '#4ade80', font: { size: 10 } }, grid: { display: false }, min: 0, max: 100, display: false }
    }
  }
});

/* ─── Light Bar Chart ───────────────────────────────────────── */
const lctx = document.getElementById('lightBarChart').getContext('2d');
const lightBarChart = new Chart(lctx, {
  type: 'bar',
  data: { labels: [], datasets: [{ label: 'Light (lx)', data: [], backgroundColor: 'rgba(251,191,36,0.22)', borderColor: '#fbbf24', borderWidth: 1.5, borderRadius: 6 }] },
  options: {
    responsive: true, animation: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(8,15,11,0.92)', borderColor: 'rgba(251,191,36,0.2)', borderWidth: 1, titleColor: '#e8f5ee', bodyColor: '#7aab8a', padding: 8 } },
    scales: {
      x: { ticks: { display: false }, grid: { display: false } },
      y: { ticks: { color: '#395447', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' }, min: 0, max: 1800 }
    }
  }
});

/* ─── Initial health gauge arc ──────────────────────────────── */
(function () {
  const circ = 2 * Math.PI * 90;
  const hsFill = document.getElementById('hsFill');
  if (hsFill) { hsFill.style.strokeDasharray = circ; hsFill.style.strokeDashoffset = circ * (1 - 78 / 100); }
})();

/* ─── State variables ───────────────────────────────────────── */
let liveChartsInitialized = false;
let lastTelemetrySeq      = 0;
let lastSerialTelemFallback = '';
let hasLiveTelemetry      = false;
let lastLiveTelemetryMs   = 0;
let lastChartUpdateMs     = 0;
let apiBase               = null;
let serverMode            = false;
let backendEsp32Connected = false;
let backendProbeInterval  = null;

/* ─── DOM refs ──────────────────────────────────────────────── */
const terminalStatusEl = document.getElementById('terminal-status');
const terminalSerialEl = document.getElementById('terminal-serial');
const serialConnectBtn = document.getElementById('serial-connect-btn');
const reconnectBtn     = document.getElementById('reconnect-btn');
const serialStatusDot  = document.getElementById('serial-status');
const serialStatusText = document.getElementById('serial-status-text');
const serialPortName   = document.getElementById('serial-port-name');

/* ─── Helpers ───────────────────────────────────────────────── */
function setEl(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function setWidth(id, pct) { const e = document.getElementById(id); if (e) e.style.width = `${Math.min(100, Math.max(0, pct))}%`; }

function setRefreshHint(text) { setEl('refresh-hint', text); }

function updateNavBadge(connected, portName) {
  const label = document.getElementById('esp32-status-label');
  const dot   = document.getElementById('esp32-pulse-dot');
  const badge = document.getElementById('esp32-status-badge');
  if (!label) return;
  if (connected) {
    label.textContent = portName ? `Connected · ${portName}` : 'Connected';
    if (dot)   dot.style.background   = '#4ade80';
    if (badge) badge.style.borderColor = 'rgba(74,222,128,0.35)';
  } else {
    label.textContent = 'Disconnected';
    if (dot)   dot.style.background   = 'rgba(255,255,255,0.20)';
    if (badge) badge.style.borderColor = 'rgba(255,255,255,0.06)';
  }
}

/* Show "--" on all sensor cards when disconnected */
function showDisconnectedState() {
  const dash = '--';
  setEl('temp-val',     dash); setWidth('temp-gauge',     0);
  setEl('hum-val',      dash); setWidth('hum-gauge',      0);
  setEl('light-val',    dash); setWidth('light-gauge',    0);
  setEl('evap-val',     dash); setWidth('evap-gauge',     0);
  setEl('water-val',    dash); setWidth('water-gauge',    0);
  setEl('moisture-val', dash); setWidth('moisture-gauge', 0);
  const radialVal = document.querySelector('.radial-val');
  if (radialVal) radialVal.textContent = dash;
  const el = document.getElementById('radialFill');
  if (el) el.style.strokeDashoffset = 502;
  /* chip grid */
  document.querySelectorAll('.hs-chip-val').forEach(e => { e.textContent = dash; });
  /* card status badges */
  ['card-temp','card-hum','card-light','card-moisture','card-evap','card-water'].forEach(c => {
    const el = document.querySelector(`.${c} .card-status`);
    if (el) { el.textContent = '— No Data'; el.className = 'card-status status-warn'; }
  });
}

function markLiveSessionEnd() {
  liveChartsInitialized   = false;
  lastTelemetrySeq        = 0;
  lastSerialTelemFallback = '';
  hasLiveTelemetry        = false;
}

function ensureLiveChartsReset() {
  if (liveChartsInitialized) return;
  liveChartsInitialized = true;
  trendChart.data.labels = [];
  trendChart.data.datasets.forEach(d => { d.data = []; });
  lightBarChart.data.labels = [];
  lightBarChart.data.datasets[0].data = [];
  trendChart.update('none');
  lightBarChart.update('none');
}

/* ─── Chart update (throttled to 1 pt/s) ───────────────────── */
function updateTrendChart(temp, hum, soilPct) {
  const now = Date.now();
  if (now - lastChartUpdateMs < 1000) return;
  lastChartUpdateMs = now;
  const d = new Date(now);
  const lbl = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  const max = 120;
  if (trendChart.data.labels.length >= max) {
    trendChart.data.labels.shift();
    trendChart.data.datasets.forEach(ds => ds.data.shift());
  }
  trendChart.data.labels.push(lbl);
  trendChart.data.datasets[0].data.push(temp);
  trendChart.data.datasets[1].data.push(hum);
  trendChart.data.datasets[2].data.push(soilPct);
  trendChart.update('none');
}

function updateLightBarChart(lightLux) {
  if (Date.now() - lastChartUpdateMs > 100) return; // only fire if trend just updated this tick
  const max = 60;
  if (lightBarChart.data.labels.length >= max) {
    lightBarChart.data.labels.shift();
    lightBarChart.data.datasets[0].data.shift();
  }
  lightBarChart.data.labels.push('');
  lightBarChart.data.datasets[0].data.push(lightLux);
  lightBarChart.update('none');
}

/* ─── Core metric update ────────────────────────────────────── */
function updateMetricValues({ temp, hum, lightLux, soilPct, evap, waterNeed, healthScore }) {
  setEl('temp-val', temp.toFixed(1));
  setWidth('temp-gauge', (temp / 50) * 100);

  setEl('hum-val', Math.round(hum));
  setWidth('hum-gauge', hum);

  setEl('light-val', lightLux);
  setWidth('light-gauge', (lightLux / 1750) * 100);
  const rFill = document.getElementById('radialFill');
  if (rFill) rFill.style.strokeDashoffset = 502 - (502 * Math.min(lightLux, 1750) / 1750);
  const radialVal = document.querySelector('.radial-val');
  if (radialVal) radialVal.textContent = String(lightLux);

  /* card status badges */
  const tempStatus  = temp < 10 ? ['⚠ Too Cold','status-warn'] : temp > 38 ? ['⚠ Too Hot','status-warn'] : ['✔ Optimal Range','status-ok'];
  const humStatus   = hum  < 30 ? ['⚠ Too Dry','status-warn'] : hum  > 80 ? ['⚠ Too Humid','status-warn'] : ['✔ Well Balanced','status-ok'];
  const lightStatus = lightLux < 300 ? ['⚠ Very Low','status-warn'] : lightLux < 600 ? ['⚠ Slightly Low','status-warn'] : ['✔ Good Exposure','status-ok'];
  const soilStatus  = soilPct < 30 ? ['⚠ Dry — Water Now','status-warn'] : soilPct > 85 ? ['⚠ Waterlogged','status-warn'] : ['✔ Moist & Healthy','status-ok'];
  const setCardStatus = (cls, [text, badge]) => {
    const el = document.querySelector(`.${cls} .card-status`);
    if (el) { el.textContent = text; el.className = `card-status ${badge}`; }
  };
  setCardStatus('card-temp',     tempStatus);
  setCardStatus('card-hum',      humStatus);
  setCardStatus('card-light',    lightStatus);
  setCardStatus('card-moisture', soilStatus);

  /* computed cards */
  const evapNum = typeof evap === 'number' ? evap : parseFloat(evap);
  setEl('evap-val', Number.isFinite(evapNum) ? evapNum.toFixed(1) : '—');
  setWidth('evap-gauge', (Number.isFinite(evapNum) ? evapNum : 0) / 12 * 100);
  setEl('water-val', waterNeed);
  setWidth('water-gauge', (waterNeed / 500) * 100);
  setEl('moisture-val', soilPct);
  setWidth('moisture-gauge', soilPct);

  /* health score */
  setEl('hs-score-num', healthScore);
  const hsFill = document.getElementById('hsFill');
  if (hsFill) hsFill.style.strokeDashoffset = 565.48 * (1 - healthScore / 100);
  setEl('hs-grade', `Grade ${healthScore >= 90 ? 'A' : healthScore >= 80 ? 'B+' : healthScore >= 70 ? 'B' : 'C'}`);
  setEl('hs-title', healthScore >= 80 ? 'Good Condition 🌿' : healthScore >= 65 ? 'Fair Condition' : 'Needs Attention');
  setEl('hs-desc', `Live ESP32 · Soil: ${soilPct}% · Light: ${lightLux} lx · Temp: ${temp.toFixed(1)}°C`);

  /* health chip grid */
  const chips = document.querySelectorAll('.hs-metric-chip');
  const chipData = [
    { val: `${temp.toFixed(1)} °C`, badge: tempStatus[0].replace(/[✔⚠] /,''),  cls: tempStatus[1]  },
    { val: `${Math.round(hum)} %`,  badge: humStatus[0].replace(/[✔⚠] /,''),   cls: humStatus[1]   },
    { val: `${lightLux} lx`,        badge: lightStatus[0].replace(/[✔⚠] /,''), cls: lightStatus[1] },
    { val: `${soilPct} %`,          badge: soilStatus[0].replace(/[✔⚠] /,''),  cls: soilStatus[1]  },
    { val: `${Number.isFinite(evapNum) ? evapNum.toFixed(1) : '—'} mm/d`, badge: evapNum > 6 ? 'High' : 'Low', cls: evapNum > 6 ? 'status-warn' : 'status-ok' },
    { val: `${waterNeed} mL/d`,     badge: waterNeed > 350 ? 'High' : 'Normal', cls: waterNeed > 350 ? 'status-warn' : 'status-ok' },
  ];
  chips.forEach((chip, i) => {
    if (!chipData[i]) return;
    const valEl   = chip.querySelector('.hs-chip-val');
    const badgeEl = chip.querySelector('.hs-chip-badge');
    if (valEl)   valEl.textContent = chipData[i].val;
    if (badgeEl) { badgeEl.textContent = chipData[i].badge; badgeEl.className = `hs-chip-badge ${chipData[i].cls}`; }
  });
}

/* ─── Apply telemetry payload (from Python backend) ─────────── */
function applyTelemetryFromPayload(d) {
  hasLiveTelemetry  = true;
  lastLiveTelemetryMs = Date.now();
  const temp        = d.temperature;
  const hum         = d.humidity;
  const soilPct     = d.soil_percent;
  const lightLux    = d.light_lux;
  const evap        = typeof d.evaporation_index === 'number' ? d.evaporation_index : parseFloat(d.evaporation_index);
  const waterNeed   = d.water_requirement;
  const healthScore = d.health_score;
  updateMetricValues({ temp, hum, lightLux, soilPct, evap, waterNeed, healthScore });
  updateTrendChart(temp, hum, soilPct);
  updateLightBarChart(lightLux);
  updateClock();
}

/* ─── Parse a raw serial line (Web Serial path) ─────────────── */
function parseSerialLine(line) {
  const match = line.match(/T:([0-9.+-]+),H:([0-9.+-]+),SR:(\d+),SP:(\d+),LR:(\d+),LP:(\d+)/);
  if (!match) return;
  hasLiveTelemetry  = true;
  lastLiveTelemetryMs = Date.now();

  const temp    = parseFloat(match[1]);
  const hum     = parseFloat(match[2]);
  const soilPct = parseInt(match[4], 10);
  const ldrRaw  = parseInt(match[5], 10);
  const ldrPct  = parseInt(match[6], 10);
  const lightLux = Math.round((ldrRaw / 4095) * 1750);
  const evap     = Math.max(0, (0.15 * temp + 0.03 * hum)).toFixed(1);
  const waterNeed = Math.round(Math.max(120, Math.min(420, (100 - soilPct) * 2.1 + parseFloat(evap) * 7)));
  const healthScore = Math.min(100, Math.max(45, Math.round(84 - (100 - soilPct) * 0.16 - (75 - ldrPct) * 0.1)));

  ensureLiveChartsReset();
  updateMetricValues({ temp, hum, lightLux, soilPct, evap, waterNeed, healthScore });
  updateTrendChart(temp, hum, soilPct);
  updateLightBarChart(lightLux);
  updateClock();
}

/* ─── Backend poll (100ms when server mode active) ──────────── */
async function pollLive() {
  if (!serverMode || apiBase === null) return;
  const url = apiBase === '' ? '/api/live' : `${apiBase}/api/live`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { status, data, serial_lines: serialLines } = await r.json();

    backendEsp32Connected = !!status.connected;
    if (serialPortName) serialPortName.textContent = status.port || '—';
    if (serialStatusDot) serialStatusDot.className = `status-dot ${status.connected ? 'status-ok' : 'status-off'}`;
    if (serialStatusText) serialStatusText.textContent = status.connected
      ? `Connected${status.port ? ` · ${status.port}` : ''}`
      : `Disconnected${status.error ? ` · ${status.error}` : ''}`;
    updateNavBadge(status.connected, status.port);
    refreshConnectButton();

    if (terminalStatusEl) terminalStatusEl.textContent = [
      'Source: Python backend (USB auto-detect)',
      `ESP32: ${status.connected ? 'CONNECTED' : 'DISCONNECTED'}`,
      status.port  ? `COM port: ${status.port}` : 'COM port: —',
      status.error ? `Error: ${status.error}` : '',
      'Page: works from file:// — keep start_server.py running',
      'USB: plug in anytime — backend rescans ~0.8 s',
      'UI poll: 100 ms',
    ].filter(Boolean).join('\n');

    if (terminalSerialEl) {
      terminalSerialEl.textContent = (serialLines && serialLines.length)
        ? serialLines.slice(-30).join('\n')
        : '(waiting for serial lines…)';
      terminalSerialEl.scrollTop = terminalSerialEl.scrollHeight;
    }

    if (!status.connected) {
      /* ESP32 unplugged — show "--" on cards */
      if (hasLiveTelemetry) {
        hasLiveTelemetry  = false;
        lastTelemetrySeq  = 0;
        lastSerialTelemFallback = '';
        showDisconnectedState();
      }
    } else {
      /* reset seq counter if backend restarted */
      if (data && typeof data.telemetry_seq === 'number' && data.telemetry_seq === 0 && lastTelemetrySeq > 0) {
        lastTelemetrySeq = 0;
      }
      if (data && typeof data.telemetry_seq === 'number' && data.telemetry_seq > 0 && data.telemetry_seq !== lastTelemetrySeq) {
        lastTelemetrySeq = data.telemetry_seq;
        ensureLiveChartsReset();
        applyTelemetryFromPayload(data);
      } else if (serialLines && serialLines.length) {
        /* fallback: parse latest matching line */
        for (let i = serialLines.length - 1; i >= 0; i--) {
          const line = serialLines[i].trim();
          if (/^T:[0-9.+-]+,H:[0-9.+-]+,SR:\d+,SP:\d+,LR:\d+,LP:\d+/.test(line)) {
            if (line !== lastSerialTelemFallback) {
              lastSerialTelemFallback = line;
              ensureLiveChartsReset();
              parseSerialLine(line);
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    /* backend unreachable */
    if (terminalStatusEl) terminalStatusEl.textContent = [
      'Python backend: NOT REACHABLE',
      'Run:  python start_server.py',
      'Tried: http://127.0.0.1:5000 and http://localhost:5000',
    ].join('\n');
  }
}

/* ─── Toggle backend ESP32 connect / disconnect ─────────────── */
async function toggleBackendEsp32() {
  const root = apiBase || '';
  try {
    const stRes = await fetch(`${root}/api/status`, { cache: 'no-store' });
    const st = await stRes.json();
    const action = st.connected ? '/api/disconnect' : '/api/connect';
    await fetch(`${root}${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await pollLive();
  } catch (e) {
    if (terminalStatusEl) terminalStatusEl.textContent = `Server request failed:\n${e.message || e}`;
  }
}

/* ─── Backend base URL detection ────────────────────────────── */
function backendProbeBases() {
  const isRemote = window.location.protocol === 'file:' || !['localhost','127.0.0.1'].includes(window.location.hostname);
  return isRemote ? ['http://127.0.0.1:5000', 'http://localhost:5000'] : ['', 'http://127.0.0.1:5000'];
}

/* ─── Web Serial ────────────────────────────────────────────── */
let port = null, reader = null, keepReading = false, isSerialConnected = false;
const webSerialLines = [];

function refreshConnectButton() {
  if (!serialConnectBtn) return;
  if (serverMode) {
    serialConnectBtn.textContent = backendEsp32Connected ? 'Disconnect ESP32' : 'Connect ESP32';
  } else {
    serialConnectBtn.textContent = isSerialConnected ? 'Disconnect ESP32' : 'Connect ESP32';
  }
}

function pushWebSerialLine(line) {
  webSerialLines.push(line);
  if (webSerialLines.length > 120) webSerialLines.shift();
  if (!serverMode && terminalSerialEl) {
    terminalSerialEl.textContent = webSerialLines.join('\n');
    terminalSerialEl.scrollTop = terminalSerialEl.scrollHeight;
  }
}

function updateSerialStatus(connected, detail = '') {
  if (serialStatusDot)  serialStatusDot.className  = `status-dot ${connected ? 'status-ok' : 'status-off'}`;
  if (serialStatusText) serialStatusText.textContent = connected
    ? `Connected${detail ? ` · ${detail}` : ''}` : `Disconnected${detail ? ` · ${detail}` : ''}`;
  updateNavBadge(connected, connected ? (serialPortName ? serialPortName.textContent : null) : null);
  refreshConnectButton();
  if (!serverMode && terminalStatusEl) {
    terminalStatusEl.textContent = [
      'Source: Web Serial (browser)',
      `USB: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`,
      serialPortName ? `Port: ${serialPortName.textContent}` : '',
      detail ? `Note: ${detail}` : '',
      'Rate: 100 ms (ESP32)',
    ].filter(Boolean).join('\n');
  }
  if (!connected) showDisconnectedState();
}

async function openWebSerialDevice(serialPort) {
  if (serverMode || isSerialConnected) return false;
  try {
    const info = serialPort.getInfo ? serialPort.getInfo() : {};
    if (serialPortName) serialPortName.textContent = info.usbVendorId ? `USB VID:${info.usbVendorId} PID:${info.usbProductId}` : 'Unknown port';
    await serialPort.open({ baudRate: 115200 });
    port = serialPort;
    webSerialLines.length = 0;
    if (terminalSerialEl) terminalSerialEl.textContent = '';
    keepReading = true;
    isSerialConnected = true;
    markLiveSessionEnd();
    updateSerialStatus(true);
    readSerialLoop();
    return true;
  } catch (err) {
    updateSerialStatus(false, err.message || 'Open failed');
    port = null;
    return false;
  }
}

async function connectSerialPort() {
  if (!('serial' in navigator)) { updateSerialStatus(false, 'Web Serial not supported — use Chrome/Edge or Python backend'); return; }
  if (!window.isSecureContext)  { updateSerialStatus(false, 'Web Serial needs https or localhost'); return; }
  try {
    const chosen = await navigator.serial.requestPort();
    await openWebSerialDevice(chosen);
  } catch (err) {
    if (err && err.name !== 'NotFoundError') updateSerialStatus(false, err.message || 'Connection failed');
    port = null;
  }
}

async function disconnectSerialPort() {
  keepReading = false;
  if (reader) { try { await reader.cancel(); } catch (e) {} reader.releaseLock(); reader = null; }
  if (port)   { try { await port.close();    } catch (e) {} port = null; }
  isSerialConnected = false;
  markLiveSessionEnd();
  updateSerialStatus(false, 'Disconnected');
}

async function readSerialLoop() {
  if (!port?.readable) return;
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);
  reader = decoder.readable.getReader();
  let buf = '';
  try {
    while (keepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buf += value;
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).replace(/\r/g, '').trim();
          buf = buf.slice(idx + 1);
          if (line) { pushWebSerialLine(line); parseSerialLine(line); }
        }
      }
    }
  } catch (err) {
    updateSerialStatus(false, 'Read error: ' + (err.message || err));
  } finally {
    try { reader.releaseLock(); } catch (e) {}
    if (isSerialConnected) { isSerialConnected = false; markLiveSessionEnd(); updateSerialStatus(false); }
  }
}

/* ─── Button handlers ───────────────────────────────────────── */
if (serialConnectBtn) {
  serialConnectBtn.addEventListener('click', () => {
    if (serverMode) { toggleBackendEsp32(); return; }
    isSerialConnected ? disconnectSerialPort() : connectSerialPort();
  });
}

if (reconnectBtn) {
  reconnectBtn.addEventListener('click', async () => {
    if (serverMode) {
      const root = apiBase || '';
      try {
        await fetch(`${root}/api/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        await new Promise(r => setTimeout(r, 500));
        await fetch(`${root}/api/connect`,    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        await pollLive();
      } catch (e) {
        if (terminalStatusEl) terminalStatusEl.textContent = `Reconnect failed:\n${e.message || e}`;
      }
      return;
    }
    if (isSerialConnected) {
      await disconnectSerialPort();
      setTimeout(() => connectSerialPort(), 800);
    } else {
      connectSerialPort();
    }
  });
}

/* ─── Fallback simulation (only when totally offline) ───────── */
function randomDelta(base, variance) { return (base + (Math.random() - 0.5) * variance).toFixed(1); }

setInterval(() => {
  if (serverMode)        return; // backend handles it
  if (isSerialConnected) return; // real data flowing
  if (Date.now() - lastLiveTelemetryMs < 10000) return; // grace period after disconnect
  if (hasLiveTelemetry)  return; // session had real data — show "--" instead of fake

  const t = parseFloat(randomDelta(25.0, 0.8));
  const h = Math.round(60 + (Math.random() - 0.5) * 4);
  const l = Math.round(742 + (Math.random() - 0.5) * 80);
  const s = Math.round(58  + (Math.random() - 0.5) * 6);
  const evap      = parseFloat(Math.max(0, 0.15 * t + 0.03 * h).toFixed(1));
  const waterNeed = Math.round(Math.max(120, Math.min(420, (100 - s) * 2.1 + evap * 7)));
  const healthScore = Math.min(100, Math.max(45, Math.round(84 - (100 - s) * 0.16)));
  updateMetricValues({ temp: t, hum: h, lightLux: l, soilPct: s, evap, waterNeed, healthScore });
  updateTrendChart(t, h, s);
  updateLightBarChart(l);
}, 1000);

/* ─── Web Serial auto-connect ───────────────────────────────── */
let webSerialHooksInstalled = false;

async function initWebSerialAuto() {
  if (serverMode || webSerialHooksInstalled) return;
  if (!('serial' in navigator) || !window.isSecureContext) return;
  webSerialHooksInstalled = true;

  navigator.serial.addEventListener('connect', ev => {
    if (serverMode || isSerialConnected || !ev.port) return;
    openWebSerialDevice(ev.port).catch(() => {});
  });
  navigator.serial.addEventListener('disconnect', ev => {
    if (port && ev.port && ev.port === port) disconnectSerialPort().catch(() => {});
  });

  try {
    const existing = await navigator.serial.getPorts();
    for (const p of existing) { if (await openWebSerialDevice(p)) break; }
  } catch { /* ignore */ }

  /* on first user gesture, prompt for new port if none granted yet */
  const onFirstGesture = async () => {
    document.removeEventListener('pointerdown', onFirstGesture, true);
    if (serverMode || isSerialConnected) return;
    try {
      const granted = await navigator.serial.getPorts();
      if (granted.length > 0) return;
      const picked = await navigator.serial.requestPort();
      await openWebSerialDevice(picked);
    } catch (e) {
      if (e && e.name !== 'NotFoundError' && e.name !== 'AbortError' && terminalSerialEl) {
        terminalSerialEl.textContent = `USB permission: ${e.message || e}\n(Try the Connect ESP32 button.)`;
      }
    }
  };
  document.addEventListener('pointerdown', onFirstGesture, { capture: true, once: true });
}

/* ─── Backend probe helpers ─────────────────────────────────── */
async function tryActivateBackend() {
  for (const b of backendProbeBases()) {
    try {
      const url = b === '' ? '/api/live' : `${b}/api/live`;
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return b;
    } catch { /* try next */ }
  }
  return null;
}

/* ─── Main init ─────────────────────────────────────────────── */
async function initDataPath() {
  const found = await tryActivateBackend();

  if (found !== null) {
    if (backendProbeInterval) { clearInterval(backendProbeInterval); backendProbeInterval = null; }
    apiBase    = found;
    serverMode = true;
    setRefreshHint('⚡ Live · 100 ms · ESP32 auto-detected via Python');
    if (!window._pollLiveInstalled) {
      window._pollLiveInstalled = true;
      setInterval(pollLive, 100);
    }
    await pollLive();
    refreshConnectButton();
    return;
  }

  /* backend not found — use Web Serial */
  serverMode = false;
  apiBase    = null;
  setRefreshHint('🔌 No backend · plug in USB to connect (Web Serial)');
  updateSerialStatus(false, 'Waiting for USB…');
  showDisconnectedState();
  if (terminalStatusEl) terminalStatusEl.textContent = [
    'Python backend not detected.',
    'Option A: run  python start_server.py  then refresh.',
    'Option B: plug in ESP32 and click Connect ESP32 once.',
    'After first grant, future plug-ins are fully automatic.',
  ].join('\n');
  if (terminalSerialEl) terminalSerialEl.textContent = '(waiting for serial data…)';
  await initWebSerialAuto();

  /* keep probing — if backend starts later, switch automatically */
  if (!backendProbeInterval) {
    backendProbeInterval = setInterval(async () => {
      if (serverMode) { clearInterval(backendProbeInterval); backendProbeInterval = null; return; }
      const b = await tryActivateBackend();
      if (b !== null) {
        clearInterval(backendProbeInterval); backendProbeInterval = null;
        if (isSerialConnected) await disconnectSerialPort();
        initDataPath();
      }
    }, 2000);
  }
}

initDataPath();
