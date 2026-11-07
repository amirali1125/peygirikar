// «هماهنگی مهر هشتم»: a site of its own (not part of the school site) for three people.
//   Sign-in: one of three names and that person's code; only a PBKDF2 hash of each code is kept here.
//   «ارتباطات»: like the school system's colleague desk — میزکار (tasks given to each other, with due date, «انجام شد»
//     telling the one who gave it), گفتگو (one group chat), نامه‌ها (inbox, sent, reply) and یادداشت‌ها (only the writer sees).
//   «جلسهٔ آنلاین»: the live room of lib/liveclass.js over PeerJS; the first one in hosts, the room holds three.
//   «ایده‌ها»: ideas with «موافقم» and «انجام شد».
// Tasks, chat, letters and ideas are kept in each browser. On a PHP host, api.php beside this page keeps them too, so
// they reach the others even when nobody else is online; without it (e.g. a static link) they are merged whenever two
// of them have the site open at the same time (PeerJS). Every item carries v, the time of its last change.
(() => {
  const { esc, toast, modal, close } = UI;
  const USERS = [
    { id: 'u1', name: 'پوریا مخبریان' },
    { id: 'u2', name: 'امیرحسین جاودانی' },
    { id: 'u3', name: 'امیرعلی پیمان' },
  ];
  // The code hashes are not in the repository: on a PHP host api.php reads them from config.php; on a static link
  // (no server) users.js beside the page sets window.HMG_HASH. See users.example.js and config.example.php.
  const HASH = window.HMG_HASH || {};
  const KINDS = ['آموزشی', 'پرورشی', 'فضا و امکانات', 'سامانه و سایت', 'سایر'];
  const ROOM = 'hamahangi-m8k4', TITLE = 'جلسهٔ هماهنگی', NS = 'hmg8k4';
  const KEY = 'mehr8-hamahangi', COLS = ['ideas', 'tasks', 'msgs', 'letters'];

  let S = {}; try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* no storage */ }
  S.db = S.db || {}; COLS.forEach(k => { S.db[k] = S.db[k] || {}; });
  if (S.ideas) { Object.assign(S.db.ideas, S.ideas); delete S.ideas; } // before «ارتباطات», ideas sat at the top
  if (!['comms', 'meet', 'ideas'].includes(S.tab)) S.tab = 'comms';
  S.sub = S.sub || 'desk'; S.notes = S.notes || {}; S.chatSeen = S.chatSeen || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* no storage */ } };
  const me = () => USERS.find(u => u.id === S.user);
  const others = () => USERS.filter(u => u.id !== S.user);
  const nameOf = id => USERS.find(u => u.id === id)?.name || '';
  const first = id => nameOf(id).split(' ')[0];
  const fa = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const en = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const today = () => JDate.todayIso();
  const when = ms => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
  const hm = ms => new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(ms);
  const uid = p => `${p}-${S.user}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const live = k => Object.values(S.db[k]).filter(i => !i.del);
  const app = document.getElementById('app');
  const brand = sub => `<div class="hg-brand"><img src="logo.png" alt=""><div><h1>هماهنگی مهر هشتم</h1><p>${sub}</p></div></div>`;
  const badge = n => n ? `<span class="hg-badge">${fa(n)}</span>` : '';
  async function hash(id, code) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
    const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('mehr8-hmg|' + id), iterations: 200000 }, k, 256);
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  // Every change goes through here: stamped, saved and sent (to the server, or else to whoever is online).
  const put = (col, item) => { item.v = Date.now(); S.db[col][item.id] = item; save(); if (Server.on) Server.soon(); else Sync.push(); };
  // New data from anywhere: the newer copy of each item wins.
  function merge(db) {
    let ch = false;
    COLS.forEach(k => Object.values(db?.[k] || {}).forEach(i => { if (!i?.id || typeof i.v !== 'number') return; const h = S.db[k][i.id]; if (!h || i.v > h.v) { S.db[k][i.id] = i; ch = true; } }));
    if (ch) { save(); refresh(); }
  }

  /* ---------- the server (api.php beside this page, on a PHP host such as cPanel) ----------
     When it answers, it keeps everything and the page asks it for news every few seconds; sign-in then also goes
     through it and gives a token for 30 days. Where there is no server (a plain static link), PeerJS is the fallback. */
  const Server = (() => {
    const S2 = { on: false, t: 0, busy: false, again: false, err: '' };
    const call = async body => { const r = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      const j = await r.json().catch(() => ({ ok: false })); return { status: r.status, ...j }; };
    async function probe() { try { const r = await call({ a: 'ping' }); S2.on = !!r.ok; } catch { S2.on = false; } return S2.on; }
    async function login(user, code) { const r = await call({ a: 'login', user, code }); if (!r.ok) return false; S.tok = r.token; S.tokExp = r.exp; save(); return true; }
    async function sync() {
      if (!S2.on || !S.tok) return; if (S2.busy) { S2.again = true; return; } S2.busy = true;
      try {
        const r = await call({ a: 'sync', token: S.tok, db: S.db });
        if (r.status === 401) { S2.err = 'signin'; delete S.tok; save(); gate('ورود شما تمام شده؛ دوباره وارد شوید.'); return; }
        if (!r.ok) throw new Error(r.error); S2.err = ''; merge(r.db);
      } catch { S2.err = 'net'; }
      finally { S2.busy = false; syncBadge(); if (S2.again) { S2.again = false; soon(); } }
    }
    const soon = () => { clearTimeout(S2.soonT); S2.soonT = setTimeout(sync, 250); };
    function start() { if (!S2.on) return; sync(); clearInterval(S2.t); S2.t = setInterval(() => { if (!document.hidden) sync(); }, 4000); }
    addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    const stop = () => clearInterval(S2.t);
    return { get on() { return S2.on; }, get err() { return S2.err; }, probe, login, sync, soon, start, stop };
  })();

  /* ---------- sign-in ---------- */
  function gate(msg = '') {
    Server.stop(); Sync.stop();
    app.className = 'hg-gate';
    app.innerHTML = `<form class="card hg-card" id="hg-in" novalidate>${brand('ورود فقط برای سه نفر')}
      <fieldset class="hg-who"><legend>شما کدام هستید؟</legend>${USERS.map(x => `<label><input type="radio" name="who" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</fieldset>
      <label class="hg-code">کد ورود<input id="hg-code" type="password" inputmode="numeric" autocomplete="off" maxlength="12"></label>
      <p class="hg-err" id="hg-err" role="alert">${esc(msg)}</p>
      <button class="btn primary wide" type="submit">ورود</button></form>`;
    document.getElementById('hg-in').onsubmit = async e => {
      e.preventDefault();
      const err = document.getElementById('hg-err'), inp = document.getElementById('hg-code'), b = e.currentTarget.querySelector('button');
      const who = app.querySelector('[name=who]:checked')?.value, code = en(inp.value.trim());
      if (!who) { err.textContent = 'نام خود را انتخاب کنید.'; return; }
      if (!code) { err.textContent = 'کد ورود را بنویسید.'; inp.focus(); return; }
      b.disabled = true; b.textContent = 'در حال بررسی…';
      let ok = false;
      try { ok = Server.on ? await Server.login(who, code) : (HASH[who] ? await hash(who, code) === HASH[who] : (err.textContent = 'روی این نشانی نه سرور هست و نه فایل users.js؛ ورود ممکن نیست.', null)); if (ok === null) { b.disabled = false; b.textContent = 'ورود'; return; } }
      catch { b.disabled = false; b.textContent = 'ورود'; err.textContent = 'سرور در دسترس نیست؛ کمی بعد دوباره امتحان کنید.'; return; }
      b.disabled = false; b.textContent = 'ورود';
      if (!ok) { err.textContent = 'کد ورود درست نیست.'; inp.select(); return; }
      S.user = who; save(); start();
    };
  }

  /* ---------- unread counts ---------- */
  const N = {
    tasks: () => live('tasks').filter(t => (t.to === S.user && t.from !== S.user && !t.seenBy && !t.done) || (t.from === S.user && t.to !== S.user && t.done && !t.doneSeen)).length,
    chat: () => live('msgs').filter(m => m.by !== S.user && m.at > (S.chatSeen[S.user] || 0)).length,
    letters: () => live('letters').filter(l => l.to.includes(S.user) && !l.read?.[S.user]).length,
  };
  const commsCount = () => N.tasks() + N.chat() + N.letters();

  /* ---------- the signed-in page ---------- */
  const TABS = [['comms', 'ارتباطات'], ['meet', 'جلسهٔ آنلاین'], ['ideas', 'ایده‌ها']];
  const tabLabel = k => k === 'comms' ? `ارتباطات${badge(commsCount())}` : k === 'ideas' ? `ایده‌ها (${fa(live('ideas').length)})` : 'جلسهٔ آنلاین';
  function page() {
    if (LiveClass.active()) return;
    const u = me(); if (!u) return gate();
    app.className = 'hg-wrap';
    app.innerHTML = `<header class="hg-top">${brand(`سلام ${esc(u.name)}`)}<div class="hg-me"><span class="hg-sync" id="hg-sync"><i></i><span></span></span><button class="btn" type="button" id="hg-out">خروج</button></div></header>
      <nav class="hg-tabs" role="tablist" aria-label="بخش‌ها">${TABS.map(([k]) => `<button type="button" role="tab" id="t-${k}" aria-selected="${S.tab === k}" aria-controls="hg-panel" data-tab="${k}">${tabLabel(k)}</button>`).join('')}</nav>
      <section id="hg-panel" role="tabpanel" aria-labelledby="t-${S.tab}">${S.tab === 'meet' ? meet() : S.tab === 'ideas' ? ideas() : comms()}</section>`;
    document.getElementById('hg-out').onclick = () => { delete S.user; delete S.tok; save(); gate(); };
    const tabs = app.querySelector('.hg-tabs');
    tabs.onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; S.tab = b.dataset.tab; save(); page(); document.getElementById('t-' + S.tab)?.focus(); };
    tabs.onkeydown = e => {
      const i = TABS.findIndex(([k]) => k === S.tab), j = { ArrowLeft: i + 1, ArrowRight: i - 1 }[e.key]; if (j == null) return;
      S.tab = TABS[(j + TABS.length) % TABS.length][0]; save(); page(); document.getElementById('t-' + S.tab)?.focus();
    };
    syncBadge();
    if (S.tab === 'comms') commsBind(); else if (S.tab === 'meet') meetBind(); else ideasBind();
  }
  // New data from another person: redraw, unless the person is typing or a dialog is open (then only the counts).
  function refresh() {
    if (!me() || LiveClass.active()) return;
    const busy = document.querySelector('#modal-root .modal') || (document.activeElement?.matches?.('#hg-panel input, #hg-panel textarea, #hg-panel select') && document.activeElement.value);
    if (S.tab === 'comms' && S.sub === 'chat' && document.getElementById('hg-chatlist')) { chatList(); markChat(); counts(); return; }
    if (busy) { counts(); return; }
    page();
  }
  function counts() {
    TABS.forEach(([k]) => { const t = document.getElementById('t-' + k); if (t) t.innerHTML = tabLabel(k); });
    document.querySelectorAll('[data-sub]').forEach(a => { const n = { desk: N.tasks, chat: N.chat, letters: N.letters }[a.dataset.sub]; const b = a.querySelector('.hg-badge'); if (b) b.remove(); if (n?.()) a.insertAdjacentHTML('beforeend', badge(n())); });
  }

  /* ---------- «ارتباطات» ---------- */
  const SUBS = [['desk', 'میزکار'], ['chat', 'گفتگو'], ['letters', 'نامه‌ها'], ['notes', 'یادداشت‌ها']];
  function comms() {
    const n = { desk: N.tasks(), chat: N.chat(), letters: N.letters() };
    const body = S.sub === 'chat' ? chat() : S.sub === 'letters' ? letters() : S.sub === 'notes' ? notes() : desk();
    return `<div class="hg-comms"><nav class="hg-sub" aria-label="بخش‌های ارتباطات">${SUBS.map(([k, l]) => `<button type="button" data-sub="${k}" ${S.sub === k ? 'aria-current="page"' : ''}>${l}${badge(n[k])}</button>`).join('')}</nav>
      <div class="hg-body">${body}</div></div>`;
  }
  function commsBind() {
    app.querySelector('.hg-sub').onclick = e => { const b = e.target.closest('[data-sub]'); if (!b) return; S.sub = b.dataset.sub; save(); page(); };
    if (S.sub === 'chat') chatBind(); else if (S.sub === 'letters') lettersBind(); else if (S.sub === 'notes') notesBind(); else deskBind();
  }

  /* میزکار: a task is { id, from, to, title, desc, due, at, done, doneAt, seenBy, doneSeen, v, del } */
  let seenT = 0;
  const late = t => !t.done && t.due && t.due < today();
  const byDue = (a, b) => (a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : b.at - a.at;
  function taskRow(t) {
    const mine = t.to === S.user, fresh = (mine && !t.seenBy && t.from !== S.user) || (t.from === S.user && t.done && !t.doneSeen && t.to !== S.user);
    const who = t.from === t.to ? 'برای خودم' : mine ? `از ${esc(nameOf(t.from))}` : `برای ${esc(nameOf(t.to))}`;
    return `<li class="hg-task ${t.done ? 'done' : ''} ${late(t) ? 'late' : ''} ${fresh ? 'fresh' : ''}">
      <div class="hg-task-main"><h3>${esc(t.title)}</h3>${t.desc ? `<p>${esc(t.desc)}</p>` : ''}
        <div class="hg-meta"><span>${who}</span>${t.due ? `<span class="hg-tag ${late(t) ? 'bad' : ''}">${late(t) ? 'دیر شده · ' : 'تا '}${esc(JDate.format(t.due))}</span>` : ''}${t.done ? `<span class="hg-tag ok">انجام شد${t.doneAt ? ' · ' + when(t.doneAt) : ''}</span>` : ''}${fresh ? '<span class="hg-tag new">تازه</span>' : ''}</div></div>
      <div class="hg-acts">${mine ? `<button class="btn ${t.done ? '' : 'primary'}" type="button" data-t="done" data-id="${t.id}">${t.done ? 'برگرداندن' : 'انجام شد'}</button>` : ''}
        ${t.from === S.user ? `<button class="btn" type="button" data-t="edit" data-id="${t.id}">ویرایش</button><button class="btn" type="button" data-t="del" data-id="${t.id}">حذف</button>` : ''}</div></li>`;
  }
  function desk() {
    const T = live('tasks'), mine = T.filter(t => t.to === S.user && !t.done).sort(byDue), follow = T.filter(t => t.from === S.user && t.to !== S.user && !t.done).sort(byDue);
    const done = T.filter(t => t.done && (t.to === S.user || t.from === S.user)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const list = (l, e) => l.length ? `<ul class="hg-tasks">${l.map(taskRow).join('')}</ul>` : `<p class="muted">${e}</p>`;
    const k = (l, t) => `<div class="hg-kpi"><b>${fa(l)}</b><span>${t}</span></div>`;
    return `<div class="hg-deskhead"><div class="hg-kpis">${k(mine.length, 'کار باز من')}${k(mine.filter(late).length + follow.filter(late).length, 'دیر شده')}${k(follow.length, 'در پیگیری')}</div>
        <div class="hg-people">${others().map(u => `<button class="btn" type="button" data-t="new" data-to="${u.id}">+ کار برای ${esc(first(u.id))}</button>`).join('')}<button class="btn" type="button" data-t="new" data-to="${S.user}">+ کار برای خودم</button></div></div>
      <div class="hg-grid"><section class="card"><h2>کارهای من</h2>${list(mine, 'کار بازی ندارید.')}</section>
        <section class="card"><h2>پیگیری از دیگران</h2>${list(follow, 'کاری به کسی نداده‌اید که باز باشد.')}</section></div>
      ${done.length ? `<details class="card hg-done"><summary>انجام‌شده‌ها (${fa(done.length)})</summary>${list(done.slice(0, 40), '')}</details>` : ''}`;
  }
  function taskModal(t, to) {
    const x = t || { to };
    modal(`<h2>${t ? 'ویرایش کار' : 'کار تازه'}</h2>
      <label class="field"><span>برای</span><select class="input" id="tk-to">${USERS.map(u => `<option value="${u.id}" ${u.id === x.to ? 'selected' : ''}>${u.id === S.user ? 'خودم' : esc(u.name)}</option>`).join('')}</select></label>
      <label class="field"><span>عنوان کار</span><input class="input" id="tk-title" maxlength="120" value="${esc(x.title || '')}"></label>
      <label class="field"><span>توضیح</span><textarea class="input" id="tk-desc" rows="3" maxlength="2000">${esc(x.desc || '')}</textarea></label>
      <div class="field"><span>مهلت</span>${JDate.field('tk-due', x.due || today(), 'مهلت')}</div>
      <div class="row" style="margin-top:16px"><button class="btn primary" type="button" id="tk-ok">${t ? 'ذخیره' : 'سپردن کار'}</button><button class="btn" type="button" data-close>انصراف</button></div>`, root => {
      root.querySelector('#tk-ok').onclick = () => {
        const title = root.querySelector('#tk-title').value.trim(); if (title.length < 2) return UI.invalid('#tk-title', 'عنوان کار را بنویسید.');
        const it = t ? { ...t } : { id: uid('t'), from: S.user, at: Date.now(), done: false, doneAt: 0, doneSeen: false };
        const nto = root.querySelector('#tk-to').value; if (!t || nto !== t.to) it.seenBy = nto === S.user;
        Object.assign(it, { to: nto, title, desc: root.querySelector('#tk-desc').value.trim(), due: root.querySelector('#tk-due').value });
        put('tasks', it); close(); page(); toast(t ? 'کار ویرایش شد.' : nto === S.user ? 'کار در فهرست شما آمد.' : `کار به ${nameOf(nto)} سپرده شد.`);
      };
    });
  }
  function deskBind() {
    // Opening the desk counts as seeing new tasks and newly finished follow-ups.
    // After a few seconds on the page, so the «تازه» mark is seen first; the task is read again then, not copied now.
    clearTimeout(seenT);
    seenT = setTimeout(() => {
      if (S.tab !== 'comms' || S.sub !== 'desk' || !me()) return; let n = 0;
      live('tasks').forEach(t => {
        if (t.to === S.user && !t.seenBy && t.from !== S.user) { put('tasks', { ...t, seenBy: true }); n++; }
        else if (t.from === S.user && t.done && !t.doneSeen && t.to !== S.user) { put('tasks', { ...t, doneSeen: true }); n++; }
      });
      if (n) counts();
    }, 4000);
    app.querySelector('.hg-body').onclick = async e => {
      const b = e.target.closest('[data-t]'); if (!b) return; const t = S.db.tasks[b.dataset.id];
      if (b.dataset.t === 'new') return taskModal(null, b.dataset.to);
      if (!t) return;
      if (b.dataset.t === 'done') { put('tasks', { ...t, done: !t.done, doneAt: t.done ? 0 : Date.now(), doneSeen: t.from === S.user, seenBy: true }); page(); toast(t.done ? 'کار دوباره باز شد.' : t.from === S.user ? 'انجام شد.' : `انجام شد؛ ${nameOf(t.from)} هم می‌بیند.`); }
      else if (b.dataset.t === 'edit') taskModal(t);
      else if (b.dataset.t === 'del' && await UI.ask('حذف کار', `کار «${t.title}» حذف شود؟`, 'حذف کن')) { put('tasks', { id: t.id, del: true }); page(); toast('کار حذف شد.'); }
    };
  }

  /* گفتگو: one group of the three; a message is { id, by, at, text, v } */
  const chat = () => `<section class="card hg-chat"><h2>گفتگوی سه‌نفره</h2><div class="hg-chatlist" id="hg-chatlist" role="log" aria-live="polite" tabindex="0"></div>
      <form class="hg-chatform" id="hg-chatform"><label class="vh" for="hg-msg">پیام</label><textarea class="input" id="hg-msg" rows="1" maxlength="2000" placeholder="پیام…">${esc(S.draft || '')}</textarea><button class="btn primary" type="submit">فرستادن</button></form></section>`;
  function chatList() {
    const box = document.getElementById('hg-chatlist'); if (!box) return;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const l = live('msgs').sort((a, b) => a.at - b.at).slice(-300);
    let day = '';
    box.innerHTML = l.length ? l.map(m => { const d = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', month: 'long', day: 'numeric' }).format(m.at), sep = d !== day ? `<div class="hg-day">${d}</div>` : ''; day = d;
      return `${sep}<div class="hg-msg ${m.by === S.user ? 'me' : ''}"><b>${m.by === S.user ? 'شما' : esc(nameOf(m.by))}</b><p>${esc(m.text)}</p><time>${hm(m.at)}</time></div>`; }).join('')
      : '<p class="muted">هنوز پیامی نیست. اولین پیام را بنویسید.</p>';
    if (atEnd || !box.dataset.ready) box.scrollTop = box.scrollHeight; box.dataset.ready = 1;
  }
  const markChat = () => { const last = Math.max(0, ...live('msgs').map(m => m.at)); if (last > (S.chatSeen[S.user] || 0)) { S.chatSeen[S.user] = last; save(); } };
  function chatBind() {
    chatList(); markChat(); counts();
    const f = document.getElementById('hg-chatform'), t = document.getElementById('hg-msg');
    t.oninput = () => { S.draft = t.value; save(); };
    t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } };
    f.onsubmit = e => { e.preventDefault(); const text = t.value.trim(); if (!text) return;
      put('msgs', { id: uid('m'), by: S.user, at: Date.now(), text }); t.value = ''; S.draft = ''; save(); chatList(); markChat(); document.getElementById('hg-chatlist').scrollTop = 1e9; t.focus(); };
  }

  /* نامه‌ها: a letter is { id, from, to: [ids], subject, body, at, re, read: { uid: 1 }, v } */
  function letters() {
    const box = S.box === 'sent' ? 'sent' : 'in';
    const l = live('letters').filter(x => box === 'in' ? x.to.includes(S.user) : x.from === S.user).sort((a, b) => b.at - a.at);
    const open = S.letter && S.db.letters[S.letter] && !S.db.letters[S.letter].del ? S.db.letters[S.letter] : null;
    const row = x => { const unread = box === 'in' && !x.read?.[S.user];
      return `<li><button type="button" class="hg-lrow ${unread ? 'unread' : ''} ${open?.id === x.id ? 'on' : ''}" data-l="open" data-id="${x.id}"><b>${esc(x.subject)}</b><span>${box === 'in' ? 'از ' + esc(nameOf(x.from)) : 'به ' + x.to.map(nameOf).map(esc).join('، ')} · ${when(x.at)}</span></button></li>`; };
    return `<div class="hg-lhead"><div class="hg-seg" role="group" aria-label="صندوق"><button type="button" data-l="box" data-box="in" aria-pressed="${box === 'in'}">دریافتی${badge(N.letters())}</button><button type="button" data-l="box" data-box="sent" aria-pressed="${box === 'sent'}">فرستاده</button></div>
        <button class="btn primary" type="button" data-l="new">نامهٔ تازه</button></div>
      <div class="hg-grid hg-lgrid"><section class="card">${l.length ? `<ul class="hg-llist">${l.map(row).join('')}</ul>` : `<p class="muted">${box === 'in' ? 'نامه‌ای نرسیده.' : 'نامه‌ای نفرستاده‌اید.'}</p>`}</section>
        <section class="card hg-letter">${open ? `<h2>${esc(open.subject)}</h2><p class="hg-meta">از ${esc(nameOf(open.from))} به ${open.to.map(nameOf).map(esc).join('، ')} · ${when(open.at)}</p>
          ${open.re && S.db.letters[open.re] ? `<p class="hg-meta">در پاسخ به «${esc(S.db.letters[open.re].subject)}»</p>` : ''}<div class="hg-lbody">${esc(open.body)}</div>
          <div class="row" style="margin-top:14px"><button class="btn" type="button" data-l="reply" data-id="${open.id}">پاسخ</button>${open.to.map(nameOf).length ? `<span class="muted small">${open.to.filter(t => open.read?.[t]).length ? 'خوانده شد: ' + open.to.filter(t => open.read?.[t]).map(nameOf).map(esc).join('، ') : 'هنوز خوانده نشده'}</span>` : ''}</div>`
          : '<p class="muted">نامه‌ای را از فهرست باز کنید.</p>'}</section></div>`;
  }
  function letterModal(re) {
    const to = re ? [re.from === S.user ? re.to[0] : re.from] : [];
    modal(`<h2>${re ? 'پاسخ' : 'نامهٔ تازه'}</h2>
      <fieldset class="field hg-to"><legend>گیرنده</legend>${others().map(u => `<label><input type="checkbox" value="${u.id}" ${to.includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</fieldset>
      <label class="field"><span>موضوع</span><input class="input" id="lt-sub" maxlength="140" value="${esc(re ? (re.subject.startsWith('پاسخ: ') ? re.subject : 'پاسخ: ' + re.subject) : '')}"></label>
      <label class="field"><span>متن نامه</span><textarea class="input" id="lt-body" rows="6" maxlength="8000"></textarea></label>
      <div class="row" style="margin-top:16px"><button class="btn primary" type="button" id="lt-ok">فرستادن</button><button class="btn" type="button" data-close>انصراف</button></div>`, root => {
      root.querySelector('#lt-ok').onclick = () => {
        const rc = [...root.querySelectorAll('.hg-to input:checked')].map(i => i.value), subject = root.querySelector('#lt-sub').value.trim(), body = root.querySelector('#lt-body').value.trim();
        if (!rc.length) return toast('گیرنده را انتخاب کنید.');
        if (!subject) return UI.invalid('#lt-sub', 'موضوع را بنویسید.');
        if (!body) return UI.invalid('#lt-body', 'متن نامه را بنویسید.');
        const it = { id: uid('l'), from: S.user, to: rc, subject, body, at: Date.now(), re: re?.id || null, read: {} };
        put('letters', it); S.box = 'sent'; S.letter = it.id; save(); close(); page(); toast(`نامه برای ${rc.map(nameOf).join(' و ')} فرستاده شد.`);
      };
    });
  }
  function lettersBind() {
    const o = S.letter && S.db.letters[S.letter];
    if (o && o.to.includes(S.user) && !o.read?.[S.user]) { put('letters', { ...o, read: { ...(o.read || {}), [S.user]: 1 } }); counts(); }
    app.querySelector('.hg-body').onclick = e => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      if (b.dataset.l === 'box') { S.box = b.dataset.box; S.letter = ''; save(); page(); }
      else if (b.dataset.l === 'new') letterModal(null);
      else if (b.dataset.l === 'open') { S.letter = b.dataset.id; save(); page(); }
      else if (b.dataset.l === 'reply') letterModal(S.db.letters[b.dataset.id]);
    };
  }

  /* یادداشت‌ها: only in this browser, for this person */
  function notes() {
    const l = Object.values(S.notes[S.user] || {}).sort((a, b) => b.at - a.at);
    return `<form class="card" id="hg-nform"><h2>یادداشت تازه</h2><label class="vh" for="hg-note">یادداشت</label><textarea class="input" id="hg-note" rows="3" maxlength="4000" style="width:100%"></textarea>
        <p class="muted small">یادداشت‌ها فقط برای خود شما و فقط روی همین دستگاه است.</p><button class="btn primary" type="submit">نگه داشتن</button></form>
      ${l.length ? `<ul class="hg-ideas" style="margin-top:14px">${l.map(n => `<li class="hg-idea"><p>${esc(n.text)}</p><div class="hg-meta"><span>${when(n.at)}</span><button class="btn" type="button" data-n="${n.id}">حذف</button></div></li>`).join('')}</ul>` : ''}`;
  }
  function notesBind() {
    const mine = () => (S.notes[S.user] = S.notes[S.user] || {});
    document.getElementById('hg-nform').onsubmit = e => { e.preventDefault(); const t = document.getElementById('hg-note').value.trim(); if (!t) return; const id = uid('n'); mine()[id] = { id, text: t, at: Date.now() }; save(); page(); };
    app.querySelector('.hg-body').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; delete mine()[b.dataset.n]; save(); page(); };
  }

  /* ---------- «جلسهٔ آنلاین» ---------- */
  const fresh = () => { const t = new Date(), p = n => String(n).padStart(2, '0');
    return { id: ROOM, title: TITLE, date: today(), from: `${p(t.getHours())}:${p(t.getMinutes())}`, to: '', cls: null, status: 'planned', att: {}, chat: [], polls: [], recs: [], stats: {}, notes: '' }; };
  const O = { relay: true, tryHost: true, max: 3, sub: 'هماهنگی', ro: false,
    me: () => me()?.name || 'میزبان', students: () => others().map(u => ({ id: u.id, name: u.name, cls: null })),
    classes: () => [], className: () => '', save, render: () => page(),
    empty: t => `<p class="muted">${esc(t)}</p>`, kpi: (l, v) => `<div class="card"><b>${v}</b><div class="small">${esc(l)}</div></div>`, as: () => null,
    after: () => { page(); toast('جلسه تمام شد.'); } };
  const meet = () => `<div class="card hg-meet"><h2>${TITLE}</h2>
      <ul><li>اولین نفری که وارد شود میزبان جلسه است و بقیه به او وصل می‌شوند.</li><li>ظرفیت جلسه ${fa(3)} نفر است.</li>
        <li>تخته، گفت‌وگو، یادداشت مشترک، نظرسنجی، صدا و تصویر در خود جلسه است؛ اجازهٔ میکروفون و دوربین را به مرورگر بدهید.</li></ul>
      <button class="btn primary hg-go" type="button" id="hg-go">ورود به جلسه</button></div>`;
  function meetBind() { document.getElementById('hg-go').onclick = e => enter(e.currentTarget); }
  async function enter(b) {
    b.disabled = true; b.textContent = 'در حال اتصال…';
    if (!S.x || S.x.status === 'done') { S.x = fresh(); save(); }
    const c = { live: { sessions: [S.x] }, link: '' };
    let r = await LiveClass.room(c, O, S.x, null);
    if (r === 'unavailable-id') r = await LiveClass.room(c, O, { id: ROOM, title: TITLE }, { id: S.user, name: me().name });
    if (typeof r === 'string' && b.isConnected) { b.disabled = false; b.textContent = 'ورود به جلسه'; }
  }

  /* ---------- «ایده‌ها» ---------- */
  // An idea: { id, by, at, v, title, text, k, done, likes: { uid: 1 }, del }.
  let filter = 'all', editing = null;
  function ideas() {
    const l = live('ideas').filter(i => filter === 'all' || (filter === 'open' ? !i.done : filter === 'done' ? i.done : i.k === filter))
      .sort((a, b) => !!a.done - !!b.done || Object.keys(b.likes || {}).length - Object.keys(a.likes || {}).length || b.at - a.at);
    const e = editing && S.db.ideas[editing];
    return `<form class="card" id="hg-iform" novalidate><h2>${e ? 'ویرایش ایده' : 'ایدهٔ تازه'}</h2><div class="hg-iform">
        <label>عنوان<input name="title" maxlength="90" required value="${esc(e?.title || '')}"></label>
        <label>دربارهٔ<select name="k">${KINDS.map(k => `<option ${e?.k === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="wide">شرح ایده<textarea name="text" rows="3" maxlength="3000">${esc(e?.text || '')}</textarea></label></div>
        <p class="hg-err" id="hg-ierr" role="alert"></p>
        <div class="row"><button class="btn primary" type="submit">${e ? 'ذخیرهٔ تغییر' : 'ثبت ایده'}</button>${e ? '<button class="btn" type="button" data-i="cancel">انصراف</button>' : ''}</div></form>
      <div class="hg-filter" role="group" aria-label="نمایش">${[['all', 'همه'], ['open', 'باز'], ['done', 'انجام‌شده'], ...KINDS.map(k => [k, k])].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div>
      ${l.length ? `<ul class="hg-ideas">${l.map(card).join('')}</ul>` : `<div class="card"><p class="muted">${live('ideas').length ? 'ایده‌ای با این فیلتر نیست.' : 'هنوز ایده‌ای ثبت نشده. اولین ایده را بنویسید.'}</p></div>`}`;
  }
  function card(i) {
    const n = Object.keys(i.likes || {}).length, mine = !!i.likes?.[S.user];
    return `<li class="hg-idea ${i.done ? 'done' : ''}"><h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ''}
      <div class="hg-meta"><span class="hg-tag">${esc(i.k)}</span>${i.done ? '<span class="hg-tag ok">انجام شد</span>' : ''}<span>${esc(nameOf(i.by))} · ${when(i.at)}</span><span>${fa(n)} موافق${n ? `: ${Object.keys(i.likes).map(nameOf).map(esc).join('، ')}` : ''}</span></div>
      <div class="hg-acts"><button class="btn" type="button" data-i="like" data-id="${i.id}" aria-pressed="${mine}">${mine ? 'موافقم ✓' : 'موافقم'}</button>
        <button class="btn" type="button" data-i="done" data-id="${i.id}">${i.done ? 'باز کردن دوباره' : 'انجام شد'}</button>
        ${i.by === S.user ? `<button class="btn" type="button" data-i="edit" data-id="${i.id}">ویرایش</button><button class="btn" type="button" data-i="del" data-id="${i.id}">حذف</button>` : ''}</div></li>`;
  }
  function ideasBind() {
    const f = document.getElementById('hg-iform');
    f.onsubmit = e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(f)), err = document.getElementById('hg-ierr');
      if (d.title.trim().length < 3) { err.textContent = 'یک عنوان کوتاه برای ایده بنویسید.'; f.elements.title.focus(); return; }
      const i = editing ? { ...S.db.ideas[editing] } : { id: uid('i'), by: S.user, at: Date.now(), likes: {}, done: false };
      Object.assign(i, { title: d.title.trim(), text: d.text.trim(), k: d.k }); put('ideas', i);
      toast(editing ? 'ایده ویرایش شد.' : 'ایده ثبت شد.'); editing = null; page();
    };
    app.querySelector('#hg-panel').onclick = async e => {
      const fb = e.target.closest('[data-f]'); if (fb) { filter = fb.dataset.f; page(); return; }
      const b = e.target.closest('[data-i]'); if (!b) return; const i = S.db.ideas[b.dataset.id];
      if (b.dataset.i === 'cancel') { editing = null; page(); return; }
      if (!i) return;
      if (b.dataset.i === 'like') { const likes = { ...(i.likes || {}) }; if (likes[S.user]) delete likes[S.user]; else likes[S.user] = 1; put('ideas', { ...i, likes }); page(); }
      else if (b.dataset.i === 'done') { put('ideas', { ...i, done: !i.done }); page(); }
      else if (b.dataset.i === 'edit') { editing = i.id; page(); document.querySelector('#hg-iform input')?.focus(); }
      else if (b.dataset.i === 'del' && await UI.ask('حذف ایده', `ایدهٔ «${i.title}» حذف شود؟ برای دو نفر دیگر هم حذف می‌شود.`, 'حذف کن')) { put('ideas', { id: i.id, by: i.by, del: true }); toast('ایده حذف شد.'); page(); }
    };
  }

  /* ---------- keeping the three in step (PeerJS, one address per person) ---------- */
  const Sync = (() => {
    let peer = null, retry = 0, again = 0; const conns = new Map();
    const pidOf = id => `${NS}-ideas-${id}`;
    // Older pages sent only the ideas ({ t: 'ideas', list }); they are still understood.
    const all = () => ({ t: 'db', db: S.db, list: Object.values(S.db.ideas) });
    function wire(c) {
      c.on('open', () => { conns.set(c.peer, c); c.send(all()); syncBadge(); });
      c.on('data', d => { if (d?.t === 'db') merge(d.db); else if (d?.t === 'ideas') merge({ ideas: Object.fromEntries((d.list || []).map(i => [i.id, i])) }); });
      c.on('close', () => { if (conns.get(c.peer) === c) conns.delete(c.peer); syncBadge(); });
      c.on('error', () => {});
    }
    function dial() {
      if (!peer?.open) return;
      others().filter(u => !conns.has(pidOf(u.id))).forEach(u => wire(peer.connect(pidOf(u.id), { reliable: true })));
    }
    function start() {
      if (peer || !window.Peer || !S.user) return;
      peer = new Peer(pidOf(S.user));
      peer.on('open', () => { note = ''; dial(); retry = setInterval(dial, 20000); syncBadge(); });
      peer.on('connection', c => wire(c));
      // The address is still held: by another open tab of this person, or by a page closed a moment ago (the PeerJS
      // server lets it go within about a minute). Try again every 30 s.
      peer.on('error', e => { if (e.type === 'unavailable-id') { stop(); note = 'همگام‌سازی در زبانهٔ دیگری باز است؛ دوباره امتحان می‌شود…'; syncBadge(); clearTimeout(again); again = setTimeout(() => { if (S.user) start(); }, 30000); } });
      peer.on('disconnected', () => { try { peer?.reconnect(); } catch { /* gone */ } });
      addEventListener('pagehide', stop, { once: true });
    }
    function stop(e) { if (e?.type === 'pagehide') clearTimeout(again); clearInterval(retry); conns.forEach(c => { try { c.close(); } catch { /* closed */ } }); conns.clear(); try { peer?.destroy(); } catch { /* gone */ } peer = null; }
    const push = () => { const m = all(); conns.forEach(c => { if (c.open) try { c.send(m); } catch { /* closing */ } }); };
    const online = () => [...conns.keys()].map(p => nameOf(p.split('-').pop()));
    return { start, stop, push, online };
  })();
  let note = '';
  function syncBadge() {
    const b = document.getElementById('hg-sync'); if (!b) return;
    if (Server.on) { b.classList.toggle('on', !Server.err); b.querySelector('span').textContent = Server.err ? 'سرور در دسترس نیست؛ تغییرها نگه داشته می‌شوند' : 'همگام با سرور'; return; }
    const on = Sync.online();
    b.classList.toggle('on', on.length > 0);
    b.querySelector('span').textContent = note || (on.length ? `همگام با ${on.join('، ')}` : 'دیگران آفلاین‌اند؛ بعداً همگام می‌شود');
  }

  // With a server: its token is needed (an old sign-in from before the server asks once more). Without: PeerJS.
  function start() {
    if (Server.on && !S.tok) return gate();
    if (Server.on) Server.start(); else Sync.start();
    page();
  }
  app.innerHTML = '<p class="hg-wait">در حال آماده‌سازی…</p>';
  Promise.race([Server.probe(), new Promise(r => setTimeout(r, 4000))]).finally(() => { if (me()) start(); else gate(); });
})();
