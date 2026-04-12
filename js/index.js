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
const hours = Array.from({length: 24}, (_, i) => `${String(i).padStart(2,'0')}:00`);
const tempData  = [23,22,22,21,21,22,23,24,25,26,27,28,28,29,29,28,27,27,27,28,28,28,28,28];
const humData   = [68,70,71,73,74,72,70,68,66,65,63,62,61,63,65,65,64,63,62,63,62,62,63,63];

const ctx = document.getElementById('trendChart').getContext('2d');
new Chart(ctx, {
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
        grid:  { color: 'rgba(255,255,255,0.04)' },
        min: 17, max: 35,
      },
      yHum: {
        type: 'linear', position: 'right',
        ticks: { color: '#60a5fa', font: { size: 10 } },
        grid:  { display: false },
        min: 40, max: 95,
      }
    }
  }
});

/* ── Light Bar Chart ───────────────────────────────────────── */
const lctx = document.getElementById('lightBarChart').getContext('2d');
const lightHours = ['10:00','11:00','12:00','13:00','14:00','15:00'];
const lightVals  = [410, 580, 890, 1020, 860, 742];
new Chart(lctx, {
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
      y: { ticks: { color: '#395447', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' }, min: 0, max: 1800 }
    }
  }
});

/* ── Mock Readings Table ───────────────────────────────────── */
const statuses = [
  { text: 'Optimal', cls: 'status-ok' },
  { text: 'Optimal', cls: 'status-ok' },
  { text: 'Optimal', cls: 'status-ok' },
  { text: 'Low Light', cls: 'status-warn' },
  { text: 'Optimal', cls: 'status-ok' },
];
const tbody = document.getElementById('readings-table');
const now = new Date();
for (let i = 0; i < 10; i++) {
  const t = new Date(now.getTime() - i * 5000);
  const p = n => String(n).padStart(2,'0');
  const timeStr = `${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
  const temp  = (28.4 - i * 0.05 + (Math.random() - 0.5) * 0.4).toFixed(1);
  const hum   = Math.round(63   + (Math.random() - 0.5) * 3);
  const light = Math.round(742  + (Math.random() - 0.5) * 60 - i * 4);
  const st    = statuses[i % statuses.length];
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="td-time">${10 - i}</td>
    <td class="td-time">${timeStr}</td>
    <td style="color:#f87171">${temp} °C</td>
    <td style="color:#60a5fa">${hum} %</td>
    <td style="color:#fbbf24">${light}</td>
    <td><span class="badge-sm ${st.cls}">${st.text}</span></td>
  `;
  tbody.appendChild(tr);
}

/* ── Simulated Live Updates ────────────────────────────────── */
function randomDelta(base, range) {
  return (base + (Math.random() - 0.5) * range).toFixed(1);
}
setInterval(() => {
  // temp
  const t = parseFloat(randomDelta(28.4, 0.8));
  document.getElementById('temp-val').textContent = t;
  document.getElementById('temp-gauge').style.width = Math.min(100, (t / 50) * 100) + '%';
  // hum
  const h = Math.round(63 + (Math.random() - 0.5) * 4);
  document.getElementById('hum-val').textContent = h;
  document.getElementById('hum-gauge').style.width = h + '%';
  // light
  const l = Math.round(742 + (Math.random() - 0.5) * 80);
  document.getElementById('light-val').textContent = l;
  document.getElementById('light-gauge').style.width = Math.min(100, (l / 1750) * 100) + '%';
  // radial
  const offset = 502 - (502 * (l / 1750));
  document.getElementById('radialFill').style.strokeDashoffset = offset;
}, 5000);

/* ── Computed Metrics Live Updates ─────────────────────────── */
setInterval(() => {
  // evaporation index (mm/day) 0–12 scale
  const ev = (3.8 + (Math.random() - 0.5) * 0.7).toFixed(1);
  document.getElementById('evap-val').textContent = ev;
  document.getElementById('evap-gauge').style.width = Math.min(100, (ev / 12) * 100) + '%';
  // water requirement (mL/day) 0–500 scale
  const wr = Math.round(210 + (Math.random() - 0.5) * 30);
  document.getElementById('water-val').textContent = wr;
  document.getElementById('water-gauge').style.width = Math.min(100, (wr / 500) * 100) + '%';
  // soil moisture %
  const sm = Math.round(58 + (Math.random() - 0.5) * 6);
  document.getElementById('moisture-val').textContent = sm;
  document.getElementById('moisture-gauge').style.width = Math.min(100, sm) + '%';
}, 5000);

/* ── Health Score Gauge Init ────────────────────────────────── */
(function () {
  const score = 78;
  const r = 90, circ = 2 * Math.PI * r; // ~565.5
  const offset = circ * (1 - score / 100);
  document.getElementById('hsFill').style.strokeDasharray  = circ;
  document.getElementById('hsFill').style.strokeDashoffset = offset;
})();
