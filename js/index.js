/* Particles */
(function () {
  const field = document.getElementById('particleField');
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      left:${Math.random()*100}%;
      bottom:${Math.random()*20}%;
      --dur:${Math.random()*14+8}s;
      --delay:${Math.random()*10}s;
      opacity:0;
    `;
    field.appendChild(p);
  }
})();

/* Fade-in on scroll */
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));

/* Clock */
function updateClock() {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  document.getElementById('last-updated').textContent =
    `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}
updateClock();
setInterval(updateClock, 1000);

/* ── Trend Chart (Chart.js) ──────────────────────────────── */
const hours = []; // Driven by live data
const tempData  = [];
const humData   = [];

const ctx = document.getElementById('trendChart').getContext('2d');
window.trendChartInstance = new Chart(ctx, {
  type: 'line',
  data: {
    labels: hours,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: tempData,
        borderColor: '#f87171',
        backgroundColor: 'rgba(248,113,113,0.08)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#f87171',
        tension: 0.42,
        fill: true,
        yAxisID: 'yTemp',
      },
      {
        label: 'Humidity (%)',
        data: humData,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.07)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#60a5fa',
        tension: 0.42,
        fill: true,
        yAxisID: 'yHum',
      },
      {
        label: 'Moisture (%)',
        data: [],
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167,139,250,0.07)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#a78bfa',
        tension: 0.42,
        fill: true,
        yAxisID: 'yHum', 
      }
    ]
  },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: 'rgba(8,15,11,0.92)',
      borderColor: 'rgba(74,222,128,0.2)',
      borderWidth: 1,
      titleColor: '#e8f5ee',
      bodyColor: '#7aab8a',
      padding: 10,
    }},
    scales: {
      x: {
        ticks: { color: '#395447', font: { size: 10 }, maxTicksLimit: 8 },
        grid:  { color: 'rgba(255,255,255,0.03)' },
      },
      yTemp: {
        type: 'linear', position: 'left',
        ticks: { color: '#f87171', font: { size: 10 } },
        grid:  { color: 'rgba(255,255,255,0.04)' }
      },
      yHum: {
        type: 'linear', position: 'right',
        ticks: { color: '#60a5fa', font: { size: 10 } },
        grid:  { display: false }
      }
    }
  }
});

/* ── Light Bar Chart ───────────────────────────────────────── */
const lctx = document.getElementById('lightBarChart').getContext('2d');
const lightHours = [];
const lightVals  = [];
window.lightChartInstance = new Chart(lctx, {
  type: 'bar',
  data: {
    labels: lightHours,
    datasets: [{
      label: 'Light (lx)',
      data: lightVals,
      backgroundColor: 'rgba(251,191,36,0.22)',
      borderColor: '#fbbf24',
      borderWidth: 1.5,
      borderRadius: 6,
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: 'rgba(8,15,11,0.92)',
      borderColor: 'rgba(251,191,36,0.2)',
      borderWidth: 1,
      titleColor: '#e8f5ee',
      bodyColor: '#7aab8a',
      padding: 8,
    }},
    scales: {
      x: { ticks: { color: '#395447', font: { size: 9 } }, grid: { display: false } },
      y: { ticks: { color: '#395447', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' } }
    }
  }
});

/* ── Readings Table ───────────────────────────────────── */
const tbody = document.getElementById('readings-table');
let readingsCount = 0;

/* ── Live Hardware/Cloud Hybrid Updates ───────── */
const isCloud = window.location.hostname.includes("netlify.app");

let socket = {};
const handlers = {};
socket.on = function(event, callback) { handlers[event] = callback; };
socket.emit = function(event, data) {
  if (!isCloud && window._realSocket) window._realSocket.emit(event, data);
};

if (!isCloud) {
  window._realSocket = io('http://localhost:5051');
  window._realSocket.on('connect', () => { if(handlers['connect']) handlers['connect'](); });
  window._realSocket.on('disconnect', () => { if(handlers['disconnect']) handlers['disconnect'](); });
  window._realSocket.on('connection_status', (d) => { if(handlers['connection_status']) handlers['connection_status'](d); });
  window._realSocket.on('backend_log', (d) => { if(handlers['backend_log']) handlers['backend_log'](d); });
  window._realSocket.on('serial_log', (d) => { if(handlers['serial_log']) handlers['serial_log'](d); });
  window._realSocket.on('sensor_data', (d) => { if(handlers['sensor_data']) handlers['sensor_data'](d); });
} else {
  const clientId = 'pythosense_web_' + Math.random().toString(16).substr(2, 8);
  const mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', { clientId });

  mqttClient.on('connect', () => {
    if(handlers['connect']) handlers['connect']();
    mqttClient.subscribe('madhur/pythosense/status');
    mqttClient.subscribe('madhur/pythosense/log');
    mqttClient.subscribe('madhur/pythosense/sensor');
  });

  mqttClient.on('message', (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      if (topic === 'madhur/pythosense/status' && handlers['connection_status']) handlers['connection_status'](data);
      else if (topic === 'madhur/pythosense/log') {
        if (data.log && data.log.startsWith('[RAW]') && handlers['serial_log']) handlers['serial_log']({log: data.log.replace('[RAW] ', '')});
        else if (handlers['backend_log']) handlers['backend_log'](data);
      }
      else if (topic === 'madhur/pythosense/sensor' && handlers['sensor_data']) handlers['sensor_data'](data);
    } catch(e) {}
  });

  mqttClient.on('close', () => { if(handlers['disconnect']) handlers['disconnect'](); });
}

const connBadge = document.getElementById('conn-badge');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const portIdEl = document.getElementById('serial-port-id');
const serialTerminal = document.getElementById('serial-terminal');
const backendTerminal = document.getElementById('backend-terminal');
const btnReconnect = document.getElementById('btn-reconnect');

btnReconnect.addEventListener('click', () => {
  socket.emit('force_reconnect');
});

// Format timestamp
function getTS() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// Write to terminal
function logTerminal(msg, isRaw = true) {
  const div = document.createElement('div');
  const ts = `<span style="color:#60a5fa">[${getTS()}]</span>`;
  if (isRaw) {
    div.innerHTML = `${ts} <span style="color:#e8f5ee">${msg}</span>`;
  } else {
    div.innerHTML = `${ts} <span style="color:#fbbf24">${msg}</span>`;
  }
  serialTerminal.appendChild(div);
  // Auto-scroll
  if(serialTerminal.childElementCount > 100) {
    serialTerminal.removeChild(serialTerminal.firstChild);
  }
  serialTerminal.scrollTop = serialTerminal.scrollHeight;
}

socket.on('connect', () => {
  logTerminal('WebSocket connected to Python Backend.', false);
});

socket.on('disconnect', () => {
  connBadge.style.background = 'rgba(248,113,113,0.12)';
  connBadge.style.borderColor = 'rgba(248,113,113,0.25)';
  connBadge.style.color = '#f87171';
  connDot.style.background = '#f87171';
  connDot.style.boxShadow = 'none';
  connDot.style.animation = 'none';
  connText.textContent = 'Disconnected';
  portIdEl.textContent = 'Port: Unknown';
  logTerminal('WebSocket disconnected.', false);
});

socket.on('connection_status', (data) => {
  if (data.status === 'connected') {
    connBadge.style.background = 'rgba(74,222,128,0.12)';
    connBadge.style.borderColor = 'rgba(74,222,128,0.25)';
    connBadge.style.color = '#4ade80';
    connDot.style.background = '#4ade80';
    connDot.style.boxShadow = '0 0 0 0 rgba(74,222,128,0.6)';
    connDot.style.animation = 'pulse-green 2s infinite';
    connText.textContent = 'Connected';
    portIdEl.textContent = `Port: ${data.port}`;
    logTerminal(`ESP32 Connected on ${data.port}`, false);
  } else {
    connBadge.style.background = 'rgba(251,191,36,0.12)';
    connBadge.style.borderColor = 'rgba(251,191,36,0.25)';
    connBadge.style.color = '#fbbf24';
    connDot.style.background = '#fbbf24';
    connDot.style.boxShadow = 'none';
    connDot.style.animation = 'pulse-orange 2s infinite';
    connText.textContent = 'Waiting for USB...';
    portIdEl.textContent = `Port: Scanning...`;
  }
});

socket.on('backend_log', (data) => {
  const div = document.createElement('div');
  const ts = `<span style="color:#60a5fa">[${getTS()}]</span>`;
  let color = '#94a3b8'; // Default muted blue-gray
  if (data.log.includes('❌')) color = '#f87171';
  else if (data.log.includes('⚠️')) color = '#fbbf24';
  else if (data.log.includes('Successfully')) color = '#4ade80';
  else if (data.log.includes('🔄')) color = '#fbbf24';
  
  div.innerHTML = `${ts} <span style="color:${color}">${data.log}</span>`;
  backendTerminal.appendChild(div);
  
  if(backendTerminal.childElementCount > 50) {
    backendTerminal.removeChild(backendTerminal.firstChild);
  }
  backendTerminal.scrollTop = backendTerminal.scrollHeight;
});

socket.on('serial_log', (data) => {
  logTerminal(data.log, true);
});

socket.on('sensor_data', (data) => {
  // Update log
  logTerminal(data.raw_line, true);

  // Update temp
  document.getElementById('temp-val').textContent = data.temperature.toFixed(1);
  document.getElementById('temp-gauge').style.width = Math.min(100, (data.temperature / 50) * 100) + '%';
  // Update Hum
  document.getElementById('hum-val').textContent = data.humidity;
  document.getElementById('hum-gauge').style.width = Math.min(100, (data.humidity / 100) * 100) + '%';
  // Update Light
  document.getElementById('light-val').textContent = data.light_lux;
  document.getElementById('light-gauge').style.width = Math.min(100, (data.light_lux / 1750) * 100) + '%';
  const offset = 502 - (502 * (data.light_lux / 1750));
  document.getElementById('radialFill').style.strokeDashoffset = offset;
  // Update Moisture with Hardware Fault Checking
  let actual_moisture_pct = data.soil_pct;
  const moistStatus = document.getElementById('moisture-status');
  document.getElementById('moisture-raw-val').textContent = data.soil_raw;
  
  if (data.soil_raw < 100) {
    actual_moisture_pct = 0;
    moistStatus.className = 'card-status status-warn';
    moistStatus.innerHTML = '❌ FAULT / DISCONNECTED';
  } else {
    // Dynamic Software Calibration: Override ESP32 map limits entirely using JS
    // Standard Sensor: ~3200 (Dry) to ~1200 (Wet)
    let r = data.soil_raw;
    let computed_pct = ((r - 3200) / (1200 - 3200)) * 100;
    actual_moisture_pct = Math.round(Math.max(0, Math.min(100, computed_pct)));
    
    moistStatus.className = 'card-status status-ok';
    moistStatus.innerHTML = '✔ Active';
  }
  
  document.getElementById('moisture-val').textContent = actual_moisture_pct;
  document.getElementById('moisture-gauge').style.width = actual_moisture_pct + '%';
  
  // Custom Overrides requested by User (Ignore python backend math, rely on Javascript with new weights focused on Soil Moisture)
  let evap = ((data.temperature * 0.2) + ((100 - data.humidity) * 0.05)) * (actual_moisture_pct > 20 ? 1 : 0.2);
  evap = Math.max(0, Math.min(12, evap)).toFixed(1);

  let deficit = Math.max(0, 100 - actual_moisture_pct);
  let water = Math.round((deficit * 4.5) + (evap * 15));

  let s_moist = (actual_moisture_pct >= 40 && actual_moisture_pct <= 75) ? 100 : Math.max(0, 100 - Math.pow(Math.abs(actual_moisture_pct - 60)/30, 2)*100);
  let s_temp  = (data.temperature >= 20 && data.temperature <= 30) ? 100 : Math.max(0, 100 - Math.pow(Math.abs(data.temperature - 25)/15, 2)*100);
  let s_light = (data.light_lux >= 500) ? 100 : Math.max(0, 100 - Math.pow(Math.abs(data.light_lux - 1000)/500, 2)*100);
  
  let score = Math.round((s_moist * 0.5) + (s_temp * 0.2) + (s_light * 0.3));
  let grade = "D", label = "Critical 🚨";
  if (score >= 90) { grade = "A+"; label = "Excellent 🌟"; }
  else if (score >= 80) { grade = "A"; label = "Very Good 🌿"; }
  else if (score >= 70) { grade = "B+"; label = "Good 🍀"; }
  else if (score >= 60) { grade = "B"; label = "Fair 🌱"; }
  else if (score >= 45) { grade = "C"; label = "Needs Attention ⚠️"; }

  // Computed
  document.getElementById('evap-val').textContent = evap;
  document.getElementById('evap-gauge').style.width = Math.min(100, (evap / 12) * 100) + '%';
  document.getElementById('water-val').textContent = water;
  document.getElementById('water-gauge').style.width = Math.min(100, (water / 500) * 100) + '%';

  // Update Health Score & Breakdown Chips
  document.getElementById('hs-score-num').textContent = score;
  document.getElementById('hs-grade').textContent = 'Grade ' + grade;
  document.getElementById('hs-title').textContent = label;
  
  if (document.getElementById('hs-temp-val')) {
    document.getElementById('hs-temp-val').textContent = data.temperature.toFixed(1) + ' °C';
    document.getElementById('hs-hum-val').textContent = data.humidity + ' %';
    document.getElementById('hs-light-val').textContent = data.light_lux + ' lx';
    document.getElementById('hs-moist-val').textContent = actual_moisture_pct + ' %';
    document.getElementById('hs-evap-val').textContent = evap + ' mm/d';
    document.getElementById('hs-water-val').textContent = water + ' mL/d';
  }
  
  const r = 90, circ = 2 * Math.PI * r; 
  const hsOffset = circ * (1 - score / 100);
  document.getElementById('hsFill').style.strokeDashoffset = hsOffset;
  
  // Update Charts directly via instances for solid reactivity
  const trend = window.trendChartInstance;
  const lightChart = window.lightChartInstance;
  const nowStr = getTS();
  
  trend.data.labels.push(nowStr);
  trend.data.datasets[0].data.push(data.temperature);
  trend.data.datasets[1].data.push(data.humidity);
  trend.data.datasets[2].data.push(actual_moisture_pct);
  
  lightChart.data.labels.push(nowStr);
  lightChart.data.datasets[0].data.push(data.light_lux);

  // Keep last 150 data points for ultra-smooth 100ms scroll (15 seconds total)
  if (trend.data.labels.length > 150) {
    trend.data.labels.shift();
    trend.data.datasets[0].data.shift();
    trend.data.datasets[1].data.shift();
    trend.data.datasets[2].data.shift();
  }
  if (lightChart.data.labels.length > 150) {
    lightChart.data.labels.shift();
    lightChart.data.datasets[0].data.shift();
  }

  trend.update('none'); // Update without full animation reset
  lightChart.update('none');

  // Update Readings Table
  readingsCount++;
  const tr = document.createElement('tr');
  const statusBadge = (score >= 70) ? '<span class="badge-sm status-ok">Optimal</span>' : '<span class="badge-sm status-warn">Attention</span>';
  tr.innerHTML = `
    <td class="td-time">${readingsCount}</td>
    <td class="td-time">${nowStr}</td>
    <td style="color:#f87171">${data.temperature.toFixed(1)} °C</td>
    <td style="color:#60a5fa">${data.humidity} %</td>
    <td style="color:#fbbf24">${data.light_lux}</td>
    <td>${statusBadge}</td>
  `;
  tbody.prepend(tr);
  if (tbody.childElementCount > 10) {
    tbody.removeChild(tbody.lastChild);
  }
});


/* ── Health Score Gauge Init ────────────────────────────────── */
(function () {
  const score = 78;
  const r = 90, circ = 2 * Math.PI * r; // ~565.5
  const offset = circ * (1 - score / 100);
  document.getElementById('hsFill').style.strokeDasharray  = circ;
  document.getElementById('hsFill').style.strokeDashoffset = offset;
})();
