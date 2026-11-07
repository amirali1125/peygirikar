// Jalali (Solar Hijri) dates: conversion, formatting and a calendar date picker.
// Conversion is a port of jalaali-js 2.0.1 (MIT, github.com/jalaali/jalaali-js), the same code the
// MIT-licensed farjadp/taghvim calendar uses. Dates are kept as ISO "YYYY-MM-DD" strings everywhere.
const JDate = (() => {
  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;
  const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  function jalCal(jy) {
    let gy = jy + 621, leapJ = -14, jp = BREAKS[0], jump = 0;
    for (let i = 1; i < BREAKS.length; i++) {
      const jm = BREAKS[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1;
    return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
  }
  function toJ(gy, gm, gd) {
    const jdn = g2d(gy, gm, gd), g = d2g(jdn).gy;
    let jy = g - 621;
    const r = jalCal(jy), start = g2d(g, 3, r.march);
    let k = jdn - start;
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }
  function toG(jy, jm, jd) {
    const r = jalCal(jy);
    return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1);
  }
  const monthLength = (jy, jm) => jm <= 6 ? 31 : jm <= 11 ? 30 : jalCal(jy).leap === 0 ? 30 : 29;

  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const WD = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const pad = n => String(n).padStart(2, '0');
  const fa = n => Number(n).toLocaleString('fa-IR', { useGrouping: false });
  const isoToJ = iso => { const [y, m, d] = iso.split('-').map(Number); return toJ(y, m, d); };
  const jToIso = (jy, jm, jd) => { const g = toG(jy, jm, jd); return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`; };
  // Saturday = 0.
  const weekday = (jy, jm, jd) => { const g = toG(jy, jm, jd); return (new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay() + 1) % 7; };
  const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
  function format(iso, withYear = true) {
    if (!iso) return '—';
    const j = isoToJ(iso);
    return `${fa(j.jd)} ${MONTHS[j.jm - 1]}${withYear ? ' ' + fa(j.jy) : ''}`;
  }

  /* ---------------- picker ---------------- */
  // A button showing the chosen date plus a hidden input holding the ISO value; a calendar opens on click.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function field(id, iso = todayIso(), label = 'تاریخ') {
    return `<span class="jdate-wrap"><button type="button" class="input jdate" data-jdate="${id}" aria-haspopup="dialog" aria-label="${esc(label)}: ${esc(format(iso))}">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      <span>${esc(format(iso))}</span></button><input type="hidden" id="${id}" value="${iso}"></span>`;
  }
  let pop = null, view = null, anchor = null;
  function close() { if (pop) { pop.remove(); pop = null; anchor?.focus(); anchor = null; } }
  function draw() {
    const input = document.getElementById(anchor.dataset.jdate), sel = input.value, t = todayIso();
    const { jy, jm } = view, first = weekday(jy, jm, 1), len = monthLength(jy, jm);
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= len; d++) {
      const iso = jToIso(jy, jm, d);
      cells += `<button type="button" data-day="${iso}" class="${iso === sel ? 'sel' : ''} ${iso === t ? 'today' : ''} ${(first + d - 1) % 7 === 6 ? 'fri' : ''}" aria-label="${esc(format(iso))}">${fa(d)}</button>`;
    }
    pop.innerHTML = `<div class="jcal-head"><button type="button" data-step="-1" aria-label="ماه قبل">‹</button><b>${MONTHS[jm - 1]} ${fa(jy)}</b><button type="button" data-step="1" aria-label="ماه بعد">›</button></div>
      <div class="jcal-grid">${WD.map(w => `<span class="wd">${w}</span>`).join('')}${cells}</div>
      <div class="jcal-foot"><button type="button" data-day="${t}">امروز</button></div>`;
  }
  function open(btn) {
    close();
    anchor = btn;
    const iso = document.getElementById(btn.dataset.jdate).value || todayIso(), j = isoToJ(iso);
    view = { jy: j.jy, jm: j.jm };
    pop = document.createElement('div');
    pop.className = 'jcal'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'انتخاب تاریخ');
    document.body.appendChild(pop);
    draw();
    const r = btn.getBoundingClientRect(), w = 280;
    pop.style.top = Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    pop.querySelector('.sel, .today, [data-day]')?.focus();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-jdate]');
    if (b) { e.preventDefault(); pop && anchor === b ? close() : open(b); return; }
    if (!pop) return;
    if (!pop.contains(e.target)) { close(); return; }
    const step = e.target.closest('[data-step]');
    if (step) {
      let m = view.jm + +step.dataset.step, y = view.jy;
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      view = { jy: y, jm: m }; draw(); return;
    }
    const day = e.target.closest('[data-day]');
    if (day) {
      const input = document.getElementById(anchor.dataset.jdate);
      input.value = day.dataset.day;
      anchor.querySelector('span').textContent = format(day.dataset.day);
      anchor.setAttribute('aria-label', `تاریخ: ${format(day.dataset.day)}`);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }
  }, true);
  document.addEventListener('keydown', e => { if (pop && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  window.addEventListener('scroll', () => close(), true);

  return { toJ, toG, monthLength, isoToJ, jToIso, format, field, todayIso, MONTHS };
})();
