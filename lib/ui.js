// Shared UI helpers for the school view: formatting, accessible dialog, toast.
const UI = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = n => Number(n || 0).toLocaleString('fa-IR');
  const money = n => fa(Math.round(n)) + ' تومان';
  const fdate = (iso, opt = { month: 'long', day: 'numeric' }) => iso ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', opt).format(new Date(iso)) : '—';
  const weekday = iso => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long' }).format(new Date(iso));
  const initials = name => name.split(' ').map(w => w[0]).slice(0, 2).join('‌');

  // Focus moves into the dialog, Tab stays inside it, and closing returns focus to where it was.
  let opener = null, onClose = null;
  const focusables = root => [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]')];
  function modal(html, bind, cancel) {
    close(true);
    opener = document.activeElement; onClose = cancel || null;
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">${html}</div>`;
    const h = back.querySelector('h2'); if (h) h.id = 'm-title';
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    back.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const f = focusables(back), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $('#modal-root').appendChild(back);
    bind && bind(back);
    if (typeof Voice !== "undefined") Voice.auto(back);
    (back.querySelector('input:not([type=checkbox]), select, textarea, .btn.primary') || focusables(back)[0])?.focus();
  }
  // silent: replaced by another dialog, so neither the cancel callback nor the focus return runs.
  function close(silent) {
    if (!$('#modal-root').firstChild) return;
    $('#modal-root').innerHTML = '';
    if (silent === true) return;
    const cb = onClose; onClose = null; cb && cb();
    if (opener && document.contains(opener)) opener.focus();
  }
  const isOpen = () => !!$('#modal-root').firstChild;
  let timer = 0;
  function toast(msg) { const t = $('#toast'); t.classList.remove('has-undo'); t.textContent = msg; clearTimeout(timer); timer = setTimeout(() => { t.textContent = ''; }, 2800); }
  // Delete now, offer «بازگردان» for a few seconds (instead of asking first). restore puts the data back;
  // after saves and redraws. Ctrl+Z also undoes while the notice shows.
  let undoFn = null;
  function undo(msg, restore, after) {
    const t = $('#toast'); clearTimeout(timer);
    t.textContent = ''; t.classList.add('has-undo');
    const s = document.createElement('span'); s.textContent = msg;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'undo-btn'; b.textContent = 'بازگردان';
    const end = () => { t.textContent = ''; t.classList.remove('has-undo'); undoFn = null; };
    undoFn = () => { restore(); after && after(); end(); toast('بازگردانده شد.'); };
    b.onclick = () => undoFn && undoFn();
    t.append(s, b);
    timer = setTimeout(end, 7000);
  }
  document.addEventListener('keydown', e => {
    if (undoFn && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input, textarea')) { e.preventDefault(); undoFn(); }
  });
  // Removes the first matching item from the array in place; returns a function that puts it back where it was.
  function drop(arr, pred) {
    const i = arr.findIndex(pred); if (i < 0) return () => {};
    const [item] = arr.splice(i, 1);
    return () => arr.splice(Math.min(i, arr.length), 0, item);
  }

  function ask(title, body, okLabel = 'تأیید') {
    return new Promise(res => modal(`<h2>${esc(title)}</h2><p class="muted">${esc(body)}</p>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="ok">${esc(okLabel)}</button><button class="btn" id="no">انصراف</button></div>`, root => {
      root.querySelector('#ok').onclick = () => { onClose = null; close(); res(true); };
      root.querySelector('#no').onclick = () => close();
    }, () => res(false)));
  }
  // Loads a pinned third-party script once (Excel and PDF libraries), only when a feature needs it.
  const loaded = {};
  const loadScript = src => loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('load')); };
    document.head.appendChild(s);
  }));
  // PDF of a printable sheet via html2pdf. html2canvas drops the spaces between Persian words, so a copy of the
  // sheet is made with every word in its own inline-block (positions then come from the browser's own layout).
  async function pdf(el, name) {
    try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'); }
    catch (e) { toast('ساخت PDF به اینترنت نیاز دارد؛ از «چاپ» استفاده کنید.'); return; }
    const copy = el.cloneNode(true); copy.removeAttribute('id');
    copy.querySelectorAll('textarea, input').forEach(f => { const p = document.createElement('p'); p.textContent = f.value || ' '; f.replaceWith(p); });
    const texts = [], walk = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    let n; while ((n = walk.nextNode())) if (n.nodeValue.trim()) texts.push(n);
    texts.forEach(t => {
      const frag = document.createDocumentFragment();
      t.nodeValue.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const s = document.createElement('span'); s.style.display = 'inline-block'; s.textContent = part; frag.appendChild(s);
      });
      t.replaceWith(frag);
    });
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:0;top:0;width:794px;background:#fff;z-index:-1';
    holder.appendChild(copy); document.body.appendChild(holder);
    const y = scrollY; scrollTo(0, 0);
    try {
      await window.html2pdf().set({ margin: 8, filename: name + '.pdf', image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(copy).save();
      toast('PDF ساخته شد.');
    } catch (e) { toast('ساخت PDF ممکن نشد؛ از «چاپ» استفاده کنید.'); }
    holder.remove(); scrollTo(0, y);
  }
  // Form error shown under the field itself (WCAG 3.3.1): the field gets aria-invalid, the message is linked with
  // aria-describedby and announced, and focus moves to the field. target: a selector, an element, or a list of
  // selectors (the first empty one is marked). Choice groups (fieldset, .chips) are marked as a whole.
  // The mark goes away as soon as the field is changed. Always returns undefined, so `return UI.invalid(...)` works.
  function invalid(target, msg) {
    const pick = t => typeof t === 'string' ? document.querySelector(t) : t;
    let el = Array.isArray(target) ? (target.map(pick).find(e => e && !String(e.value ?? '').trim()) || pick(target[0])) : pick(target);
    if (!el) { toast(msg); return; }
    // A Jalali date field is a hidden input; its visible button carries the error.
    if (el.type === 'hidden') el = el.parentElement.querySelector('button') || el;
    const box = el.closest('.field') || el.closest('fieldset') || el.parentElement;
    // Validation stops at the first problem, so any earlier message in the same form is stale.
    const scope = el.closest('.modal, form, .card') || box;
    scope.querySelectorAll('.field-err').forEach(e => e.remove());
    scope.querySelectorAll('[aria-invalid="true"]').forEach(e => e.removeAttribute('aria-invalid'));
    const id = 'err-' + Math.random().toString(36).slice(2, 8);
    const p = document.createElement('p'); p.className = 'field-err'; p.id = id; p.setAttribute('role', 'alert'); p.textContent = msg;
    box.appendChild(p);
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
    const clear = () => { p.remove(); el.removeAttribute('aria-invalid'); el.setAttribute('aria-describedby', (el.getAttribute('aria-describedby') || '').replace(id, '').trim()); if (!el.getAttribute('aria-describedby')) el.removeAttribute('aria-describedby'); };
    box.addEventListener('input', clear, { once: true }); box.addEventListener('change', clear, { once: true });
    const f = el.matches('input, select, textarea, button') ? el : el.querySelector('input, select, textarea, button');
    f?.focus(); f?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }
  // On a phone a wide table becomes a stack of cards (CSS, ≤600px): every cell is labelled with its column name.
  // Grids that only make sense as grids (timetables, the printable report card) are left alone.
  function cardTables(root) {
    root.querySelectorAll('table:not(.tt):not(.sched):not(.rc-table):not(.no-cards)').forEach(t => {
      if (t.closest('.rc-sheet')) return;
      const head = t.tHead?.rows[0] || [...t.rows].find(r => r.cells.length && [...r.cells].every(c => c.tagName === 'TH'));
      if (!head || head.cells.length < 3) return;
      const labels = []; [...head.cells].forEach(c => { for (let i = 0; i < (c.colSpan || 1); i++) labels.push(c.textContent.trim()); });
      head.classList.add('rt-head'); t.classList.add('rt');
      [...t.rows].forEach(r => { if (r === head) return; let i = 0; [...r.cells].forEach(c => { if (!c.hasAttribute('data-label')) c.dataset.label = c.colSpan > 1 ? '' : (labels[i] || ''); i += c.colSpan || 1; }); });
    });
  }
  const LOCK ='<svg class="icon lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  return { $, esc, fa, money, fdate, weekday, initials, modal, close, isOpen, toast, ask, loadScript, pdf, invalid, cardTables, undo, drop, LOCK };
})();
