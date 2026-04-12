/* Particles */
(function () {
  const field = document.getElementById('particleField');
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      left:${Math.random() * 100}%;
      bottom:${Math.random() * 20}%;
      --dur:${Math.random() * 14 + 8}s;
      --delay:${Math.random() * 10}s;
      opacity:0;
    `;
    field.appendChild(p);
  }
})();

/* Fade-in */
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));
