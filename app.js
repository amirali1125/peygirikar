// «هماهنگی مهر هشتم»: a site of its own (not part of the school site) for a few colleagues (USERS below).
//   Sign-in: one of the names and that person's code; only a PBKDF2 hash of each code is kept here.
//   «ارتباطات»: like the school system's colleague desk — میزکار (tasks given to each other, with due date, «انجام شد»
//     telling the one who gave it), گفتگو (one group chat), نامه‌ها (inbox, sent, reply) and یادداشت‌ها (only the writer sees).
//   «جلسهٔ آنلاین» (lib/liveclass.js over PeerJS) is switched off for now: MEET below brings its tab back.
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
    { id: 'u4', name: 'بهنام اسماعیلی' },
  ];
  // The code hashes are not in the repository: on a PHP host api.php reads them from config.php; on a static link
  // (no server) users.js beside the page sets window.HMG_HASH. See users.example.js and config.example.php.
  const HASH = window.HMG_HASH || {};
  const KINDS = ['آموزشی', 'پرورشی', 'فضا و امکانات', 'سامانه و سایت', 'سایر'];
  const ROOM = 'hamahangi-m8k4', TITLE = 'جلسهٔ هماهنگی', NS = 'hmg8k4';
  const KEY = 'mehr8-hamahangi', COLS = ['ideas', 'tasks', 'msgs', 'letters', 'mins', 'plans'];

  let S = {}; try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* no storage */ }
  S.db = S.db || {}; COLS.forEach(k => { S.db[k] = S.db[k] || {}; });
  if (S.ideas) { Object.assign(S.db.ideas, S.ideas); delete S.ideas; } // before «ارتباطات», ideas sat at the top
  const MEET = false;   // the online meeting, off for now (its code below stays; set true and load lib/liveclass.js again)
  if (!['comms', 'week', 'ideas', ...(MEET ? ['meet'] : [])].includes(S.tab)) S.tab = 'comms';
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
  const brand = sub => `<div class="hg-brand"><div><h1>هماهنگی</h1><p>${sub}</p></div></div>`;
  const av = (id, size = 36) => `<img class="hg-av" src="img/${id}.jpg" alt="" width="${size}" height="${size}" loading="lazy">`;
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
    async function probe() { try { const r = await call({ a: 'ping' }); S2.on = r.ok === true && r.app === 'hamahangi'; } catch { S2.on = false; } return S2.on; }
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
    app.innerHTML = `<form class="card hg-card" id="hg-in" novalidate>${brand('ورود فقط برای اعضای گروه')}
      <fieldset class="hg-who"><legend>شما کدام هستید؟</legend>${USERS.map(x => `<label><input type="radio" name="who" value="${x.id}">${av(x.id, 44)}<span><b>${esc(x.name)}</b></span></label>`).join('')}</fieldset>
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
      S.user = who; wkWho = ''; wkPeople = null; save(); start();
    };
  }

  /* ---------- profiles (photo from the school site, role, and what is open between us; no résumé) ---------- */
  function profile(id) {
    const u = USERS.find(x => x.id === id); if (!u) return; const T = live('tasks');
    const open = T.filter(t => t.to === id && !t.done), late_ = open.filter(late).length, doneN = T.filter(t => t.to === id && t.done).length;
    const fromMe = id === S.user ? 0 : T.filter(t => t.from === S.user && t.to === id && !t.done).length;
    modal(`<div class="hg-prof"><img src="img/${id}.jpg" alt="${esc(u.name)}"><div><h2>${esc(u.name)}${id === S.user ? ' <small class="muted">(شما)</small>' : ''}</h2></div></div>
      <div class="hg-kpis" style="margin-top:14px"><div class="hg-kpi"><b>${fa(open.length)}</b><span>کار باز</span></div><div class="hg-kpi"><b>${fa(late_)}</b><span>دیر شده</span></div><div class="hg-kpi"><b>${fa(doneN)}</b><span>انجام‌شده</span></div>${id === S.user ? '' : `<div class="hg-kpi"><b>${fa(fromMe)}</b><span>از شما، باز</span></div>`}</div>
      <div class="row" style="margin-top:16px">${id === S.user ? '' : `<button class="btn primary" type="button" data-pa="task">+ کار برای ${esc(first(id))}</button><button class="btn" type="button" data-pa="letter">نامه</button>`}<button class="btn" type="button" data-close>بستن</button></div>`, root => {
      root.querySelector('[data-pa="task"]')?.addEventListener('click', () => { close(); taskModal(null, id); });
      root.querySelector('[data-pa="letter"]')?.addEventListener('click', () => { close(); letterModal(null, id); });
    });
  }

  /* ---------- unread counts ---------- */
  const N = {
    tasks: () => live('tasks').filter(t => (t.to === S.user && t.from !== S.user && !t.seenBy && !t.done) || (t.from === S.user && t.to !== S.user && t.done && !t.doneSeen)).length,
    chat: () => live('msgs').filter(m => m.by !== S.user && m.at > (S.chatSeen[S.user] || 0)).length,
    letters: () => live('letters').filter(l => l.to.includes(S.user) && !l.read?.[S.user]).length,
    mins: () => live('mins').filter(m => m.by !== S.user && !m.seen?.[S.user]).length,
  };
  const commsCount = () => N.tasks() + N.chat() + N.letters() + N.mins();

  /* ---------- the signed-in page ---------- */
  const TABS = [['comms', 'ارتباطات'], ['week', 'برنامهٔ هفتگی'], ...(MEET ? [['meet', 'جلسهٔ آنلاین']] : []), ['ideas', 'ایده‌ها']];
  const inMeet = () => !!window.LiveClass?.active?.();
  const tabLabel = k => k === 'comms' ? `ارتباطات${badge(commsCount())}` : k === 'ideas' ? `ایده‌ها (${fa(live('ideas').length)})` : TABS.find(t => t[0] === k)?.[1] || '';
  function page() {
    if (inMeet()) return;
    const u = me(); if (!u) return gate();
    app.className = 'hg-wrap';
    app.innerHTML = `<header class="hg-top">${brand(`سلام ${esc(u.name)}`)}<div class="hg-me"><span class="hg-team" aria-label="پروفایل‌ها">${USERS.map(x => `<button type="button" class="hg-avbtn ${x.id === S.user ? 'me' : ''}" data-prof="${x.id}" title="${esc(x.name)}" aria-label="پروفایل ${esc(x.name)}">${av(x.id, 38)}</button>`).join('')}</span><button class="btn" type="button" id="hg-out">خروج</button></div></header>
      <nav class="hg-tabs" role="tablist" aria-label="بخش‌ها">${TABS.map(([k]) => `<button type="button" role="tab" id="t-${k}" aria-selected="${S.tab === k}" aria-controls="hg-panel" data-tab="${k}">${tabLabel(k)}</button>`).join('')}</nav>
      <section id="hg-panel" role="tabpanel" aria-labelledby="t-${S.tab}">${S.tab === 'meet' ? meet() : S.tab === 'ideas' ? ideas() : S.tab === 'week' ? week() : comms()}</section>`;
    app.querySelector('.hg-team').onclick = e => { const b = e.target.closest('[data-prof]'); if (b) profile(b.dataset.prof); };
    document.getElementById('hg-out').onclick = () => { delete S.user; delete S.tok; save(); gate(); };
    const tabs = app.querySelector('.hg-tabs');
    tabs.onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; S.tab = b.dataset.tab; save(); page(); document.getElementById('t-' + S.tab)?.focus(); };
    tabs.onkeydown = e => {
      const i = TABS.findIndex(([k]) => k === S.tab), j = { ArrowLeft: i + 1, ArrowRight: i - 1 }[e.key]; if (j == null) return;
      S.tab = TABS[(j + TABS.length) % TABS.length][0]; save(); page(); document.getElementById('t-' + S.tab)?.focus();
    };
    syncBadge();
    if (S.tab === 'comms') commsBind(); else if (S.tab === 'meet') meetBind(); else if (S.tab === 'week') weekBind(); else ideasBind();
  }
  // New data from another person: redraw, unless the person is typing or a dialog is open (then only the counts).
  function refresh() {
    if (!me() || inMeet()) return;
    const busy = document.querySelector('#modal-root .modal') || (document.activeElement?.matches?.('#hg-panel input, #hg-panel textarea, #hg-panel select') && document.activeElement.value);
    if (S.tab === 'comms' && S.sub === 'chat' && document.getElementById('hg-chatlist')) { chatList(); markChat(); counts(); return; }
    if (busy) { counts(); return; }
    page();
  }
  function counts() {
    TABS.forEach(([k]) => { const t = document.getElementById('t-' + k); if (t) t.innerHTML = tabLabel(k); });
    document.querySelectorAll('[data-sub]').forEach(a => { const n = { desk: N.tasks, chat: N.chat, letters: N.letters, mins: N.mins }[a.dataset.sub]; const b = a.querySelector('.hg-badge'); if (b) b.remove(); if (n?.()) a.insertAdjacentHTML('beforeend', badge(n())); });
  }

  /* ---------- «ارتباطات» ---------- */
  const SUBS = [['desk', 'میزکار'], ['chat', 'گفتگو'], ['letters', 'نامه‌ها'], ['mins', 'صورت‌جلسه'], ['notes', 'یادداشت‌ها']];
  function comms() {
    const n = { desk: N.tasks(), chat: N.chat(), letters: N.letters(), mins: N.mins() };
    const body = S.sub === 'chat' ? chat() : S.sub === 'letters' ? letters() : S.sub === 'mins' ? mins() : S.sub === 'notes' ? notes() : desk();
    return `<div class="hg-comms"><nav class="hg-sub" aria-label="بخش‌های ارتباطات">${SUBS.map(([k, l]) => `<button type="button" data-sub="${k}" ${S.sub === k ? 'aria-current="page"' : ''}>${l}${badge(n[k])}</button>`).join('')}</nav>
      <div class="hg-body">${body}</div></div>`;
  }
  function commsBind() {
    app.querySelector('.hg-sub').onclick = e => { const b = e.target.closest('[data-sub]'); if (!b) return; S.sub = b.dataset.sub; save(); page(); };
    if (S.sub === 'chat') chatBind(); else if (S.sub === 'letters') lettersBind(); else if (S.sub === 'mins') minsBind(); else if (S.sub === 'notes') notesBind(); else deskBind();
  }

  /* میزکار: a task is { id, from, to, title, desc, due, at, done, doneAt, seenBy, doneSeen, v, del } */
  let seenT = 0;
  const late = t => !t.done && t.due && t.due < today();
  const byDue = (a, b) => (a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : b.at - a.at;
  function taskRow(t) {
    const mine = t.to === S.user, fresh = (mine && !t.seenBy && t.from !== S.user) || (t.from === S.user && t.done && !t.doneSeen && t.to !== S.user);
    const who = t.grp ? (t.from === S.user && !mine ? `برای همه · ${esc(first(t.to))}` : `برای همه · از ${t.from === S.user ? 'خودم' : esc(nameOf(t.from))}`) : t.from === t.to ? 'برای خودم' : mine ? `از ${esc(nameOf(t.from))}` : `برای ${esc(nameOf(t.to))}`;
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
        <div class="hg-people">${others().map(u => `<button class="btn" type="button" data-t="new" data-to="${u.id}">+ کار برای ${esc(first(u.id))}</button>`).join('')}<button class="btn" type="button" data-t="new" data-to="${S.user}">+ کار برای خودم</button><button class="btn" type="button" data-t="new" data-to="all">+ کار برای همه</button></div></div>
      <div class="hg-grid"><section class="card"><h2>کارهای من</h2>${list(mine, 'کار بازی ندارید.')}</section>
        <section class="card"><h2>پیگیری از دیگران</h2>${list(follow, 'کاری به کسی نداده‌اید که باز باشد.')}</section></div>
      ${done.length ? `<details class="card hg-done"><summary>انجام‌شده‌ها (${fa(done.length)})</summary>${list(done.slice(0, 40), '')}</details>` : ''}`;
  }
  function taskModal(t, to) {
    const x = t || { to };
    modal(`<h2>${t ? 'ویرایش کار' : 'کار تازه'}</h2>
      <label class="field"><span>برای</span><select class="input" id="tk-to">${USERS.map(u => `<option value="${u.id}" ${u.id === x.to ? 'selected' : ''}>${u.id === S.user ? 'خودم' : esc(u.name)}</option>`).join('')}${t ? '' : `<option value="all" ${x.to === 'all' ? 'selected' : ''}>همه (همهٔ اعضا)</option>`}</select></label>
      <label class="field"><span>عنوان کار</span><input class="input" id="tk-title" maxlength="120" value="${esc(x.title || '')}"></label>
      <label class="field"><span>توضیح</span><textarea class="input" id="tk-desc" rows="3" maxlength="2000">${esc(x.desc || '')}</textarea></label>
      <div class="field"><span>مهلت</span>${JDate.field('tk-due', x.due || today(), 'مهلت')}</div>
      <div class="row" style="margin-top:16px"><button class="btn primary" type="button" id="tk-ok">${t ? 'ذخیره' : 'سپردن کار'}</button><button class="btn" type="button" data-close>انصراف</button></div>`, root => {
      root.querySelector('#tk-ok').onclick = () => {
        const title = root.querySelector('#tk-title').value.trim(); if (title.length < 2) return UI.invalid('#tk-title', 'عنوان کار را بنویسید.');
        const nto = root.querySelector('#tk-to').value, desc = root.querySelector('#tk-desc').value.trim(), due = root.querySelector('#tk-due').value;
        // «همه»: the same task in each member's list (one copy each, so each one marks their own as done).
        if (nto === 'all') {
          const grp = uid('g');
          USERS.forEach(u => put('tasks', { id: uid('t') + u.id, grp, from: S.user, to: u.id, title, desc, due, at: Date.now(), done: false, doneAt: 0, doneSeen: false, seenBy: u.id === S.user }));
          close(); page(); return toast(`کار به همهٔ ${fa(USERS.length)} نفر سپرده شد.`);
        }
        const it = t ? { ...t } : { id: uid('t'), from: S.user, at: Date.now(), done: false, doneAt: 0, doneSeen: false }; if (!t || nto !== t.to) it.seenBy = nto === S.user;
        Object.assign(it, { to: nto, title, desc, due });
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

  /* گفتگو: one group of all members; a message is { id, by, at, text, v } */
  const chat = () => `<section class="card hg-chat"><h2>گفتگوی گروه</h2><div class="hg-chatlist" id="hg-chatlist" role="log" aria-live="polite" tabindex="0"></div>
      <form class="hg-chatform" id="hg-chatform"><label class="vh" for="hg-msg">پیام</label><textarea class="input" id="hg-msg" rows="1" maxlength="2000" placeholder="پیام…">${esc(S.draft || '')}</textarea><button class="btn primary" type="submit">فرستادن</button></form></section>`;
  function chatList() {
    const box = document.getElementById('hg-chatlist'); if (!box) return;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const l = live('msgs').sort((a, b) => a.at - b.at).slice(-300);
    let day = '';
    box.innerHTML = l.length ? l.map(m => { const d = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', month: 'long', day: 'numeric' }).format(m.at), sep = d !== day ? `<div class="hg-day">${d}</div>` : ''; day = d;
      return `${sep}<div class="hg-mwrap ${m.by === S.user ? 'me' : ''}">${m.by === S.user ? '' : av(m.by, 30)}<div class="hg-msg ${m.by === S.user ? 'me' : ''}"><b>${m.by === S.user ? 'شما' : esc(nameOf(m.by))}</b><p>${esc(m.text)}</p><time>${hm(m.at)}</time></div></div>`; }).join('')
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
  function letterModal(re, toId) {
    const to = re ? [re.from === S.user ? re.to[0] : re.from] : toId ? [toId] : [];
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

  /* صورت‌جلسه: { id, by, at, date, from, to, place, title, att: [ids], body, dec: [{ text, who: ''|id|'all', due, tids }], seen: {}, ok: { id: ms } }
     Each decision given to someone also goes to their میزکار as a task; «تأیید می‌کنم» is each attendee's sign-off. */
  const whoLabel = w => w === 'all' ? 'همه' : w ? nameOf(w) : '—';
  function minsBody(m) {
    return `<h2>${esc(m.title)}</h2>
      <p class="hg-meta">${esc(JDate.format(m.date))}${m.from ? ` · ساعت ${fa(m.from)}${m.to ? ' تا ' + fa(m.to) : ''}` : ''}${m.place ? ' · ' + esc(m.place) : ''} · نوشتهٔ ${esc(nameOf(m.by))}</p>
      <p class="hg-meta">حاضران: ${m.att.map(nameOf).map(esc).join('، ') || '—'}</p>
      ${m.body ? `<h3 class="hg-mh">شرح جلسه</h3><div class="hg-lbody">${esc(m.body)}</div>` : ''}
      ${m.dec?.length ? `<h3 class="hg-mh">مصوبات</h3><table class="hg-mtab"><thead><tr><th>#</th><th>مصوبه</th><th>مسئول</th><th>مهلت</th></tr></thead><tbody>${m.dec.map((d, i) => `<tr><td>${fa(i + 1)}</td><td>${esc(d.text)}</td><td>${esc(whoLabel(d.who))}</td><td>${d.due ? esc(JDate.format(d.due)) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
      <h3 class="hg-mh">تأیید حاضران</h3><p class="hg-sigs">${m.att.map(a => `<span class="hg-tag ${m.ok?.[a] ? 'ok' : ''}">${esc(nameOf(a))}: ${m.ok?.[a] ? 'تأیید · ' + when(m.ok[a]) : 'هنوز تأیید نکرده'}</span>`).join(' ')}</p>`;
  }
  function mins() {
    const l = live('mins').sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.at - a.at);
    const open = S.min && S.db.mins[S.min] && !S.db.mins[S.min].del ? S.db.mins[S.min] : null;
    const row = x => `<li><button type="button" class="hg-lrow ${x.by !== S.user && !x.seen?.[S.user] ? 'unread' : ''} ${open?.id === x.id ? 'on' : ''}" data-m="open" data-id="${x.id}"><b>${esc(x.title)}</b><span>${esc(JDate.format(x.date))} · ${fa(x.dec?.length || 0)} مصوبه</span></button></li>`;
    return `<div class="hg-lhead"><h2 style="margin:0">صورت‌جلسه‌ها</h2><button class="btn primary" type="button" data-m="new">صورت‌جلسهٔ تازه</button></div>
      <div class="hg-grid hg-lgrid"><section class="card">${l.length ? `<ul class="hg-llist">${l.map(row).join('')}</ul>` : '<p class="muted">هنوز صورت‌جلسه‌ای ننوشته‌اید.</p>'}</section>
        <section class="card hg-letter">${open ? minsBody(open) + `<div class="row" style="margin-top:14px">
          ${open.att.includes(S.user) && !open.ok?.[S.user] ? `<button class="btn primary" type="button" data-m="ok" data-id="${open.id}">تأیید می‌کنم</button>` : ''}
          <button class="btn" type="button" data-m="print" data-id="${open.id}">چاپ</button>
          ${open.by === S.user ? `<button class="btn" type="button" data-m="edit" data-id="${open.id}">ویرایش</button><button class="btn" type="button" data-m="del" data-id="${open.id}">حذف</button>` : ''}</div>`
          : '<p class="muted">صورت‌جلسه‌ای را از فهرست باز کنید.</p>'}</section></div>`;
  }
  let decN = 0;
  const decRow = (d = {}) => { const i = decN++;
    return `<div class="hg-dec" data-i="${i}"><label class="vh" for="dc-t${i}">مصوبه</label><input class="input" id="dc-t${i}" maxlength="300" placeholder="متن مصوبه" value="${esc(d.text || '')}">
      <label class="vh" for="dc-w${i}">مسئول</label><select class="input" id="dc-w${i}"><option value="">بدون مسئول</option>${USERS.map(u => `<option value="${u.id}" ${d.who === u.id ? 'selected' : ''}>${u.id === S.user ? 'خودم' : esc(u.name)}</option>`).join('')}<option value="all" ${d.who === 'all' ? 'selected' : ''}>همه</option></select>
      <div>${JDate.field('dc-d' + i, d.due || '', 'مهلت')}</div><button class="btn" type="button" data-x aria-label="حذف این مصوبه">×</button></div>`; };
  function minsModal(m, preset) {
    const x = m || { date: today(), att: USERS.map(u => u.id), dec: [], ...preset }, p = n => String(n).padStart(2, '0'), t = new Date();
    modal(`<h2>${m ? 'ویرایش صورت‌جلسه' : 'صورت‌جلسهٔ تازه'}</h2>
      <label class="field"><span>موضوع جلسه</span><input class="input" id="mn-title" maxlength="140" value="${esc(x.title || '')}"></label>
      <div class="hg-mrow"><div class="field"><span>تاریخ</span>${JDate.field('mn-date', x.date, 'تاریخ جلسه')}</div>
        <label class="field"><span>از ساعت</span><input class="input" id="mn-from" type="time" value="${esc(x.from ?? `${p(t.getHours())}:${p(t.getMinutes())}`)}"></label>
        <label class="field"><span>تا ساعت</span><input class="input" id="mn-to" type="time" value="${esc(x.to || '')}"></label></div>
      <label class="field"><span>محل یا شکل جلسه</span><input class="input" id="mn-place" maxlength="80" placeholder="مثلاً دفتر مدرسه یا جلسهٔ آنلاین" value="${esc(x.place || '')}"></label>
      <fieldset class="field hg-to"><legend>حاضران</legend>${USERS.map(u => `<label><input type="checkbox" value="${u.id}" ${x.att.includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</fieldset>
      <label class="field"><span>شرح جلسه</span><textarea class="input" id="mn-body" rows="5" maxlength="8000">${esc(x.body || '')}</textarea></label>
      <div class="field"><span>مصوبات <small class="muted">(هر مصوبه‌ای که مسئول دارد، در میزکار او هم می‌آید)</small></span><div id="mn-decs">${(x.dec.length ? x.dec : [{}]).map(decRow).join('')}</div>
        <button class="btn" type="button" id="mn-add" style="margin-top:8px">+ مصوبهٔ دیگر</button></div>
      <div class="row" style="margin-top:16px"><button class="btn primary" type="button" id="mn-ok">${m ? 'ذخیره' : 'ثبت صورت‌جلسه'}</button><button class="btn" type="button" data-close>انصراف</button></div>`, root => {
      const decs = root.querySelector('#mn-decs');
      root.querySelector('#mn-add').onclick = () => { decs.insertAdjacentHTML('beforeend', decRow()); decs.lastElementChild.querySelector('input').focus(); };
      decs.onclick = e => { if (e.target.closest('[data-x]')) e.target.closest('.hg-dec').remove(); };
      root.querySelector('#mn-ok').onclick = () => {
        const title = root.querySelector('#mn-title').value.trim(); if (title.length < 2) return UI.invalid('#mn-title', 'موضوع جلسه را بنویسید.');
        const att = [...root.querySelectorAll('.hg-to input:checked')].map(i => i.value); if (!att.length) return toast('حاضران جلسه را انتخاب کنید.');
        const old = m?.dec || [];
        const dec = [...decs.querySelectorAll('.hg-dec')].map(r => { const i = r.dataset.i; return { text: r.querySelector('#dc-t' + i).value.trim(), who: r.querySelector('#dc-w' + i).value, due: r.querySelector('#dc-d' + i)?.value || '' }; }).filter(d => d.text);
        const it = m ? { ...m } : { id: uid('m'), by: S.user, at: Date.now(), seen: {}, ok: {} };
        Object.assign(it, { title, date: root.querySelector('#mn-date').value || today(), from: root.querySelector('#mn-from').value, to: root.querySelector('#mn-to').value, place: root.querySelector('#mn-place').value.trim(), att, body: root.querySelector('#mn-body').value.trim() });
        // A changed record asks the attendees to sign off again.
        if (m) it.ok = {};
        let n = 0;
        it.dec = dec.map(d => {
          const same = old.find(o => o.text === d.text && o.who === d.who && o.tids?.length);
          if (same) return { ...d, tids: same.tids };
          if (!d.who) return d;
          const tids = (d.who === 'all' ? USERS.map(u => u.id) : [d.who]).map(to => { const tid = uid('t') + to;
            put('tasks', { id: tid, from: S.user, to, title: d.text, desc: `از صورت‌جلسهٔ «${title}»`, due: d.due || '', at: Date.now(), done: false, doneAt: 0, doneSeen: false, seenBy: to === S.user, mid: it.id }); n++; return tid; });
          return { ...d, tids };
        });
        put('mins', it); S.min = it.id; save(); close(); page();
        toast((m ? 'صورت‌جلسه ذخیره شد' : 'صورت‌جلسه ثبت شد') + (n ? `؛ ${fa(n)} کار به میزکار رفت.` : '.'));
      };
    });
  }
  function printMins(m) {
    let box = document.getElementById('hg-print'); if (!box) { box = document.createElement('div'); box.id = 'hg-print'; document.body.append(box); }
    box.innerHTML = `<div class="hg-pr-head"><div><b>صورت‌جلسه</b><span>هماهنگی</span></div></div>${minsBody(m)}`;
    document.body.classList.add('hg-printing');
    const done = () => { document.body.classList.remove('hg-printing'); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done); setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  }
  function minsBind() {
    const o = S.min && S.db.mins[S.min];
    if (o && !o.del && o.by !== S.user && !o.seen?.[S.user]) { put('mins', { ...o, seen: { ...(o.seen || {}), [S.user]: 1 } }); counts(); }
    app.querySelector('.hg-body').onclick = async e => {
      const b = e.target.closest('[data-m]'); if (!b) return; const m = S.db.mins[b.dataset.id];
      if (b.dataset.m === 'new') return minsModal(null);
      if (b.dataset.m === 'open') { S.min = b.dataset.id; save(); return page(); }
      if (!m) return;
      if (b.dataset.m === 'ok') { put('mins', { ...m, ok: { ...(m.ok || {}), [S.user]: Date.now() } }); page(); toast('تأیید شما ثبت شد.'); }
      else if (b.dataset.m === 'print') printMins(m);
      else if (b.dataset.m === 'edit') minsModal(m);
      else if (b.dataset.m === 'del' && await UI.ask('حذف صورت‌جلسه', `صورت‌جلسهٔ «${m.title}» حذف شود؟ کارهایی که از آن به میزکار رفته‌اند می‌مانند.`, 'حذف کن')) { put('mins', { id: m.id, by: m.by, del: true }); S.min = ''; save(); page(); toast('صورت‌جلسه حذف شد.'); }
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

  /* ---------- «برنامهٔ هفتگی» ----------
     Laid out like the school's printed weekly timetable: dark bell and day headers, a striped break column («نماز | ناهار |
     بازی»), and coloured cells by kind; the same thing in neighbouring bells of a day (e.g. «دانشگاه» all morning) is shown
     as one wide cell with its hours. شنبه to جمعه, the school's bells (grades 7-9 seven bells, grades 10-12 six, at other
     times). Each person fills in their own week (one bell set or both) and marks the days they are not at school.
     «خالی‌های مشترک» finds, by clock time, when everyone chosen is at school and free, so the two bell sets mix.
     A plan (collection plans): { id: 'p-' + user, by, cells: { 'set|day|bell': cell }, off: { day: 1 }, v }, where a cell is
     { t: title, s: name or note, tag: class such as «الف», k: kind } (older plans kept plain strings: the title).
     «از برنامهٔ مدرسه» fills a plan from the school's timetable (lib/tt-mehr8.js) by the person's surname there.
     The toolbar saves the table as PNG or PDF (coloured, or grey for printing) through html2canvas and jsPDF. */
  const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const hm2 = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const BSETS = {
    m1: { name: 'دورهٔ اول (هفتم تا نهم)', short: 'دورهٔ اول', times: ['07:45', '08:45', '09:45', '10:45', '12:45', '13:45', '14:45'], ends: ['08:30', '09:30', '10:30', '11:30', '13:30', '14:30', '15:30'], brk: { after: 4, from: '11:30', to: '12:40' } },
    m2: { name: 'دورهٔ دوم (دهم تا دوازدهم)', short: 'دورهٔ دوم', times: ['07:30', '08:45', '10:00', '11:15', '13:25', '14:35'], ends: ['08:25', '09:45', '11:00', '12:15', '14:20', '15:30'], brk: { after: 4, from: '12:15', to: '13:20' } },
  };
  // After school (both sets end at 15:30), one-hour bells without a break from 16:00 up to midnight, numbered on from the
  // school's bells.
  Object.values(BSETS).forEach(s => { s.school = s.times.length; const last = toMin(s.ends[s.school - 1]);
    for (let h = Math.ceil(last / 60) * 60; h < 24 * 60; h += 60) { s.times.push(hm2(h)); s.ends.push(hm2(h + 60)); } });
  const bellName = (s, b) => `زنگ ${fa(b + 1)}`;
  const DAY_FROM = '07:30', DAY_TO = '24:00';
  // Kinds of cell and their colours (like the printed timetable); a new cell guesses its kind from its title.
  const KINDS_W = { cls: 'کلاس', mosh: 'مشاورهٔ تحصیلی', meet: 'مشاوره و جلسه', exam: 'آزمون', out: 'بیرون از مدرسه', other: 'سایر' };
  const guessKind = t => /دانشگاه|بیرون|اداره|مأموریت/.test(t) ? 'out' : /آزمون|امتحان/.test(t) ? 'exam' : /مشاوره(ٔ|ی)? تحصیلی/.test(t) ? 'mosh' : /مشاوره|جلسه|شورا/.test(t) ? 'meet' : 'cls';
  const norm = v => !v ? null : typeof v === 'string' ? { t: v, k: guessKind(v) } : { k: guessKind(v.t || ''), ...v };
  // The surname each person has in the school's timetable; Behnam Esmaeili's grade 12 has no timetable there yet (the
  // «اسماعیلی» in it is grade 11's), so his plan is filled by hand.
  const TT_NAME = { u1: 'مخبریان', u2: 'جاودانی', u3: 'پیمان' };
  const hhmm = m => fa(hm2(m));
  const planOf = id => { const p = S.db.plans['p-' + id]; return p && !p.del ? { cells: {}, off: {}, ...p } : { id: 'p-' + id, by: id, cells: {}, off: {} }; };
  const busyOf = (id, day) => Object.entries(planOf(id).cells).flatMap(([k, v]) => {
    const c = norm(v), [set, d, b] = k.split('|'), s = BSETS[set]; return c?.t && s && s.times[b] && +d === day ? [[toMin(s.times[b]), toMin(s.ends[b]), c.t, set]] : []; });
  function freeOf(ids, day) {
    const busy = ids.flatMap(id => busyOf(id, day)).sort((a, b) => a[0] - b[0]), out = []; let cur = toMin(DAY_FROM);
    busy.forEach(([f, t]) => { if (f > cur) out.push([cur, f]); cur = Math.max(cur, t); });
    if (toMin(DAY_TO) > cur) out.push([cur, toMin(DAY_TO)]);
    return out;
  }
  function fromSchool(id) {
    const n = TT_NAME[id], T = window.TT_MEHR8; if (!n || !T) return null; const cells = {};
    Object.entries(T).forEach(([cls, rows]) => {
      const set = /دهم|یازدهم|دوازدهم/.test(cls) ? 'm2' : 'm1';
      rows.forEach((row, day) => { let last = null;
        row.split('|').forEach((c, b) => { let [su, t] = c.split('@'); if (!t && last && last[0] === su) t = last[1]; last = [su, t];
          if (t === n) { const k = `${set}|${day}|${b}`; cells[k] = cells[k] ? { ...cells[k], tag: `${cells[k].tag}، ${cls}` } : { t: su, tag: cls, k: guessKind(su) }; } }); });
    });
    return cells;
  }
  const ICON = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  };
  let wkAuto = '', wkWho = '', wkSet = 'm1', wkMin = 30, wkPeople = null, wkEdit = false, wkFull = false;
  const week = () => `<nav class="hg-sub hg-wsub" aria-label="بخش‌های برنامهٔ هفتگی"><button type="button" data-w="sub" data-v="plan" ${S.wsub !== 'free' ? 'aria-current="page"' : ''}>برنامهٔ هر نفر</button><button type="button" data-w="sub" data-v="free" ${S.wsub === 'free' ? 'aria-current="page"' : ''}>خالی‌های مشترک</button></nav>
    <div class="hg-wbody">${S.wsub === 'free' ? freeView() : planView()}</div>`;

  // One cell's inside, like the printed timetable: a pill for a class letter, a white box for a name, hours when wide.
  function cellInner(c, from, to, span) {
    if (!c) return '';
    const pill = c.tag && c.tag.length <= 3, hours = span > 1 ? `<span class="hg-hours">${hhmm(from)} تا ${hhmm(to)}</span>` : '';
    if (c.s) return `<span class="hg-ctop">${esc(c.t)}${c.tag ? ' · ' + esc(c.tag) : ''}</span><span class="hg-cname">${esc(c.s)}</span>${hours}`;
    return `${pill ? `<span class="hg-pill">${esc(c.tag)}</span>` : ''}<b class="hg-ctitle">${esc(c.t)}</b>${c.tag && !pill ? `<span class="hg-csub">${esc(c.tag)}</span>` : ''}${hours}`;
  }
  function planTable(p, set, mine) {
    const s = BSETS[set], n = s.times.length, A = s.brk.after;
    const head = `<tr><th class="hg-corner">روز / زنگ</th>${s.times.map((t, b) => `${b === A ? `<th class="hg-brk"><span>${fa(s.brk.from)} تا</span><span>${fa(s.brk.to)}</span></th>` : ''}<th class="hg-bell ${b >= s.school ? 'eve' : ''}">${bellName(s, b)}<small>${fa(t)} تا ${fa(s.ends[b])}</small></th>`).join('')}</tr>`;
    const rows = DAYS.map((d, day) => {
      const off = p.off[day], key = b => `${set}|${day}|${b}`, same = (x, y) => x && y && JSON.stringify(x) === JSON.stringify(y);
      let tds = '';
      for (let b = 0; b < n; b++) {
        if (b === A) tds += day === 0 ? `<td class="hg-brk" rowspan="${DAYS.length}"><span>نماز | ناهار | بازی</span></td>` : '';
        const c = norm(p.cells[key(b)]);
        if (off) { tds += `<td class="hg-c off">${b === 0 ? '<span class="hg-csub">مدرسه نیست</span>' : ''}</td>`; continue; }
        if (wkEdit && mine) { tds += `<td class="hg-c ${c ? 'k-' + c.k : 'empty'}"><button type="button" class="hg-cellbtn" data-w="cell" data-k="${key(b)}" aria-label="${d}، ${bellName(s, b)}: ${esc(c?.t || 'خالی')}">${c ? cellInner(c) : '<span class="hg-plus">+</span>'}</button></td>`; continue; }
        // Neighbouring bells with the same cell join into one, never across the break.
        let e = b; while (c && e + 1 < n && e + 1 !== A && same(c, norm(p.cells[key(e + 1)]))) e++;
        tds += `<td class="hg-c ${c ? 'k-' + c.k : 'empty'}" ${e > b ? `colspan="${e - b + 1}"` : ''}>${cellInner(c, toMin(s.times[b]), toMin(s.ends[e]), e - b + 1)}</td>`;
        b = e;
      }
      return `<tr><th class="hg-day" scope="row">${d}${mine && wkEdit ? `<label class="hg-off"><input type="checkbox" data-w="off" data-v="${day}" ${off ? 'checked' : ''}> مدرسه نیستم</label>` : ''}</th>${tds}</tr>`;
    }).join('');
    return `<table class="hg-tt2">${head}${rows}</table>`;
  }
  function planView() {
    if (!USERS.some(u => u.id === wkWho)) wkWho = S.user;
    const p = planOf(wkWho), mine = wkWho === S.user, filled = Object.values(p.cells).filter(Boolean).length;
    if (!mine) wkEdit = false;
    // Open on the bell set that has this person's classes.
    const used = Object.keys(p.cells).map(k => k.split('|')[0]);
    if (wkAuto !== wkWho) { wkAuto = wkWho; if (used.length && !used.includes(wkSet)) wkSet = used[0]; }
    const tool = (w, icon, label, extra = '') => `<button type="button" class="hg-tool ${extra}" data-w="${w}">${ICON[icon]}<span>${label}</span></button>`;
    return `<div class="hg-whead">
        <div class="hg-people2" role="group" aria-label="برنامهٔ چه کسی">${USERS.map(u => `<button type="button" class="hg-pchip" data-w="who" data-v="${u.id}" aria-pressed="${u.id === wkWho}">${av(u.id, 26)}${u.id === S.user ? 'من' : esc(first(u.id))}</button>`).join('')}</div>
        <div class="hg-seg" role="group" aria-label="زنگ‌های کدام دوره">${Object.entries(BSETS).map(([k, v]) => `<button type="button" data-w="set" data-v="${k}" aria-pressed="${k === wkSet}">${v.name}</button>`).join('')}</div></div>
      <div class="hg-ttcard ${wkFull ? 'full' : ''}" id="hg-ttcard">
        <div class="hg-tools">${mine ? tool('edit', 'edit', wkEdit ? 'پایان ویرایش' : 'ویرایش برنامه', wkEdit ? 'on' : '') : `<span class="hg-ttwho">${av(wkWho, 28)}برنامهٔ ${esc(nameOf(wkWho))}</span>`}
          <span class="hg-tools-end">${tool('full', 'full', wkFull ? 'بستن تمام صفحه' : 'تمام صفحه')}${tool('png', 'down', 'تصویر PNG')}${tool('pdf', 'down', 'PDF رنگی')}${tool('pdfbw', 'down', 'PDF سیاه‌وسفید (چاپ)')}</span></div>
        ${wkEdit ? `<p class="hg-edithint">روی هر خانه بزنید. برای چند زنگ پشت سر هم (مثلاً «دانشگاه») در همان پنجره «تا زنگ» را انتخاب کنید. ${TT_NAME[S.user] && window.TT_MEHR8 ? '<button class="btn sm" type="button" data-w="import">پر کردن از برنامهٔ مدرسه</button>' : ''} ${filled ? '<button class="btn sm" type="button" data-w="clear">پاک کردن کل برنامه</button>' : ''}</p>` : ''}
        <div class="hg-ttscroll"><div class="hg-ttsheet" id="hg-ttsheet">${planTable(p, wkSet, mine)}</div></div>
        ${!filled && !wkEdit ? `<p class="muted" style="margin-top:10px">${mine ? 'هنوز برنامه‌ای ثبت نکرده‌اید؛ «ویرایش برنامه» را بزنید.' : 'هنوز برنامه‌ای ثبت نکرده است.'}</p>` : ''}
      </div>`;
  }
  function freeView() {
    wkPeople = (wkPeople || USERS.map(u => u.id)).filter(id => USERS.some(u => u.id === id));
    const ids = wkPeople, empty = ids.filter(id => !Object.values(planOf(id).cells).some(Boolean));
    const DF = toMin(DAY_FROM), DT = toMin(DAY_TO), pct = m => ((m - DF) / (DT - DF) * 100).toFixed(2);
    const rows = DAYS.map((d, day) => {
      const away = ids.filter(id => planOf(id).off[day]);
      if (away.length) return `<li class="hg-fday"><b>${d}</b><p class="muted">${away.map(nameOf).map(esc).join(' و ')} این روز مدرسه ${away.length > 1 ? 'نیستند' : 'نیست'}.</p></li>`;
      const free = freeOf(ids, day).filter(([f, t]) => t - f >= wkMin);
      const busy = ids.flatMap(id => busyOf(id, day));
      return `<li class="hg-fday"><b>${d}</b>
        <div class="hg-bar" aria-hidden="true">${busy.map(([f, t]) => `<i class="b" style="right:${pct(f)}%;width:${(pct(t) - pct(f)).toFixed(2)}%"></i>`).join('')}${free.map(([f, t]) => `<i class="f" style="right:${pct(f)}%;width:${(pct(t) - pct(f)).toFixed(2)}%"></i>`).join('')}</div>
        ${free.length ? `<ul class="hg-slots">${free.map(([f, t]) => `<li><span>${hhmm(f)} تا ${hhmm(t)}</span><small>${fa(t - f)} دقیقه</small><button class="btn sm" type="button" data-w="meet" data-day="${day}" data-f="${f}" data-t="${t}">صورت‌جلسه برای این زمان</button></li>`).join('')}</ul>` : `<p class="muted">زمان خالی مشترکِ ${fa(wkMin)} دقیقه‌ای ندارند.</p>`}</li>`;
    });
    return `<div class="card"><div class="hg-whead">
        <div class="hg-people2" role="group" aria-label="خالی مشترک چه کسانی">${USERS.map(u => `<button type="button" class="hg-pchip" data-w="pick" data-v="${u.id}" aria-pressed="${ids.includes(u.id)}">${av(u.id, 26)}${u.id === S.user ? 'من' : esc(first(u.id))}</button>`).join('')}</div>
        <label class="hg-minsel">دست‌کم <select class="input" data-w="min">${[15, 30, 45, 60, 90].map(m => `<option value="${m}" ${m === wkMin ? 'selected' : ''}>${fa(m)} دقیقه</option>`).join('')}</select></label></div>
      <p class="muted small">زمان‌هایی از ${hhmm(DF)} تا ${hhmm(DT)} که ${ids.length > 1 ? 'همهٔ این افراد' : 'این فرد'} در مدرسه ${ids.length > 1 ? 'هستند' : 'است'} و کلاس ${ids.length > 1 ? 'ندارند' : 'ندارد'}؛ زنگ تفریح و ناهار هم حساب شده است.</p>
      ${empty.length ? `<p class="hg-warn">${empty.map(nameOf).map(esc).join('، ')} هنوز برنامه‌ای ${empty.length > 1 ? 'ثبت نکرده‌اند' : 'ثبت نکرده'}؛ ${empty.length > 1 ? 'همهٔ وقتشان' : 'همهٔ وقتش'} خالی حساب می‌شود.</p>` : ''}
      ${ids.length ? `<div class="hg-legend small"><span><i class="f"></i>خالی مشترک</span><span><i class="b"></i>کلاس دارد</span></div><ul class="hg-free">${rows.join('')}</ul>` : '<p class="muted">دست‌کم یک نفر را انتخاب کنید.</p>'}</div>`;
  }
  function cellModal(k) {
    const p = planOf(S.user), [set, day, b] = k.split('|'), s = BSETS[set], c = norm(p.cells[k]) || { t: '', k: 'cls' };
    const A = s.brk.after, lastB = +b < A ? A - 1 : s.times.length - 1;   // a block runs at most to the break or the day's end
    const recent = [...new Map(Object.values(p.cells).map(norm).filter(Boolean).map(x => [JSON.stringify(x), x])).values()].slice(0, 10);
    const tags = ['', 'الف', 'ب', 'الف و ب'];
    modal(`<h2>${DAYS[day]}، ${bellName(s, +b)}</h2><p class="muted small">${s.name} · ${fa(s.times[b])} تا ${fa(s.ends[b])}</p>
      ${recent.length ? `<div class="hg-recent" role="group" aria-label="از همین برنامه"><span class="muted small">از همین برنامه:</span>${recent.map((r, i) => `<button type="button" class="pchip k-${r.k}" data-r="${i}">${esc(r.t)}${r.tag ? ' · ' + esc(r.tag) : ''}${r.s ? ' · ' + esc(r.s) : ''}</button>`).join('')}</div>` : ''}
      <label class="field"><span>عنوان (درس یا کار)</span><input class="input" id="wk-t" maxlength="50" placeholder="مثلاً فیزیک | شیمی، مشاورهٔ تحصیلی، دانشگاه" value="${esc(c.t)}"></label>
      <label class="field"><span>نام یا توضیح <small class="muted">(اختیاری؛ مثلاً نام دانش‌آموز)</small></span><input class="input" id="wk-s" maxlength="50" value="${esc(c.s || '')}"></label>
      <div class="field"><span>کلاس</span><div class="hg-seg" role="group" aria-label="کلاس">${tags.map(t => `<button type="button" data-tag="${t}" aria-pressed="${(c.tag || '') === t}">${t || 'بدون'}</button>`).join('')}</div>
        <input class="input" id="wk-tag" maxlength="30" placeholder="یا بنویسید، مثلاً هشتم الف" value="${esc(tags.includes(c.tag || '') ? '' : c.tag)}" style="margin-top:6px"></div>
      <div class="field"><span>رنگ و نوع</span><div class="hg-kinds" role="group" aria-label="نوع">${Object.entries(KINDS_W).map(([kk, l]) => `<button type="button" class="hg-kind k-${kk}" data-kind="${kk}" aria-pressed="${c.k === kk}">${l}</button>`).join('')}</div></div>
      ${lastB > +b ? `<label class="field"><span>تا</span><select class="input" id="wk-to">${Array.from({ length: lastB - b + 1 }, (_, i) => +b + i).map(x => `<option value="${x}">${bellName(s, x)} (تا ${fa(s.ends[x])})</option>`).join('')}</select></label>` : ''}
      <div class="row" style="margin-top:16px"><button class="btn primary" type="button" id="wk-ok">ذخیره</button>${p.cells[k] ? '<button class="btn" type="button" id="wk-del">خالی کردن</button>' : ''}<button class="btn" type="button" data-close>انصراف</button></div>`, root => {
      let tag = tags.includes(c.tag || '') ? c.tag || '' : null, kind = c.k, kindSet = !!p.cells[k];
      const $ = q => root.querySelector(q), inp = $('#wk-t');
      const write = v => { const q = planOf(S.user), to = +($('#wk-to')?.value ?? b); q.cells = { ...q.cells };
        for (let x = +b; x <= to; x++) { const kk = `${set}|${day}|${x}`; if (v) q.cells[kk] = v; else delete q.cells[kk]; }
        put('plans', q); close(); page(); };
      root.querySelectorAll('[data-tag]').forEach(x => { x.onclick = () => { tag = x.dataset.tag; $('#wk-tag').value = ''; root.querySelectorAll('[data-tag]').forEach(y => y.setAttribute('aria-pressed', y === x)); }; });
      $('#wk-tag').oninput = () => { tag = null; root.querySelectorAll('[data-tag]').forEach(y => y.setAttribute('aria-pressed', 'false')); };
      root.querySelectorAll('[data-kind]').forEach(x => { x.onclick = () => { kind = x.dataset.kind; kindSet = true; root.querySelectorAll('[data-kind]').forEach(y => y.setAttribute('aria-pressed', y === x)); }; });
      inp.oninput = () => { if (kindSet) return; kind = guessKind(inp.value); root.querySelectorAll('[data-kind]').forEach(y => y.setAttribute('aria-pressed', y.dataset.kind === kind)); };
      root.querySelectorAll('[data-r]').forEach(x => { x.onclick = () => write(recent[x.dataset.r]); });
      $('#wk-ok').onclick = () => { const t = inp.value.trim(); if (!t) return UI.invalid('#wk-t', 'عنوان را بنویسید یا «خالی کردن» را بزنید.');
        const tg = tag ?? $('#wk-tag').value.trim(), sv = $('#wk-s').value.trim(), v = { t, k: kind }; if (tg) v.tag = tg; if (sv) v.s = sv; write(v); };
      $('#wk-del')?.addEventListener('click', () => write(null));
      setTimeout(() => inp.focus(), 50);
    });
  }

  /* Saving the table: drawn with html2canvas (loaded the first time), then PNG, or PDF through jsPDF; on claude.ai the
     file goes through the page's «downloads» permission, elsewhere a normal download. */
  const libs = {};
  const lib = src => libs[src] ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete libs[src]; no(new Error('lib')); }; document.head.append(s); });
  async function saveFile(name, blob) {
    try { const d = await window.claude?.use?.('downloads'); if (d) { await d.save({ filename: name, data: blob }); return true; } }
    catch (e) { if (e?.code === 'declined') return false; if (!['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e?.code)) throw e; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return true;
  }
  async function exportTable(kind) {
    const sheet = document.getElementById('hg-ttsheet'); if (!sheet) return;
    const name = `برنامهٔ هفتگی ${nameOf(wkWho)} - ${BSETS[wkSet].short}`;
    toast('در حال آماده کردن فایل…');
    try {
      await lib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const ttl = document.createElement('div'); ttl.className = 'hg-shot-title'; ttl.textContent = name; sheet.prepend(ttl); sheet.classList.add('hg-shot');
      let cv; try { cv = await window.html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: sheet.scrollWidth + 80 }); } finally { sheet.classList.remove('hg-shot'); ttl.remove(); }
      if (kind === 'pdfbw') { const g = cv.getContext('2d'), im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
        for (let i = 0; i < d.length; i += 4) { const y = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; d[i] = d[i + 1] = d[i + 2] = y; } g.putImageData(im, 0, 0); }
      if (kind === 'png') { const blob = await new Promise(r => cv.toBlob(r, 'image/png')); if (await saveFile(name + '.png', blob)) toast('تصویر آماده شد.'); return; }
      await lib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), W = 297, H = 210, m = 8;
      const r = Math.min((W - 2 * m) / cv.width, (H - 2 * m) / cv.height), w = cv.width * r, h = cv.height * r;
      pdf.addImage(cv.toDataURL(kind === 'pdfbw' ? 'image/jpeg' : 'image/png', .92), kind === 'pdfbw' ? 'JPEG' : 'PNG', (W - w) / 2, m, w, h);
      if (await saveFile(name + '.pdf', pdf.output('blob'))) toast('PDF آماده شد.');
    } catch { toast('ساختن فایل نشد؛ اینترنت را بررسی کنید و دوباره امتحان کنید.'); }
  }
  function weekBind() {
    const box = app.querySelector('#hg-panel');
    box.onchange = e => {
      const w = e.target.dataset.w;
      if (w === 'off') { const q = planOf(S.user); q.off = { ...q.off }; if (e.target.checked) q.off[e.target.dataset.v] = 1; else delete q.off[e.target.dataset.v]; put('plans', q); page(); }
      else if (w === 'min') { wkMin = +e.target.value; page(); }
    };
    box.onclick = async e => {
      const b = e.target.closest('[data-w]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return; const w = b.dataset.w;
      if (w === 'sub') { S.wsub = b.dataset.v; save(); page(); }
      else if (w === 'who') { wkWho = b.dataset.v; wkEdit = false; page(); }
      else if (w === 'set') { wkSet = b.dataset.v; page(); }
      else if (w === 'edit') { wkEdit = !wkEdit; page(); }
      else if (w === 'full') { wkFull = !wkFull; page(); }
      else if (w === 'png' || w === 'pdf' || w === 'pdfbw') { const was = wkEdit; if (was) { wkEdit = false; page(); } await exportTable(w); if (was) { wkEdit = true; page(); } }
      else if (w === 'cell') cellModal(b.dataset.k);
      else if (w === 'pick') { const v = b.dataset.v; wkPeople = wkPeople.includes(v) ? wkPeople.filter(x => x !== v) : [...wkPeople, v]; page(); }
      else if (w === 'import') {
        const c = fromSchool(S.user); if (!c || !Object.keys(c).length) return toast('در برنامهٔ مدرسه کلاسی به نام شما پیدا نشد.');
        const q = planOf(S.user), had = Object.values(q.cells).some(Boolean);
        if (had && !await UI.ask('پر کردن از برنامهٔ مدرسه', 'برنامهٔ فعلی شما جای خود را به برنامهٔ مدرسه می‌دهد. ادامه می‌دهید؟', 'جایگزین کن')) return;
        q.cells = c; put('plans', q); wkSet = Object.keys(c).some(k => k.startsWith('m1')) ? 'm1' : 'm2'; page(); toast(`${fa(Object.keys(c).length)} زنگ از برنامهٔ مدرسه آمد.`);
      }
      else if (w === 'clear' && await UI.ask('پاک کردن برنامه', 'همهٔ زنگ‌های برنامهٔ شما پاک شود؟', 'پاک کن')) { const q = planOf(S.user); q.cells = {}; put('plans', q); page(); toast('برنامه پاک شد.'); }
      else if (w === 'meet') {
        // Opens a new minutes record on the next such weekday at this time, with the people chosen.
        const day = +b.dataset.day, now = new Date(), wd = (now.getDay() + 1) % 7, dt = new Date(now); dt.setDate(now.getDate() + (day - wd + 7) % 7);
        const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        S.tab = 'comms'; S.sub = 'mins'; save(); page(); minsModal(null, { date: iso, from: hm2(+b.dataset.f), to: hm2(Math.min(+b.dataset.t, +b.dataset.f + 60)), att: [...wkPeople] });
      }
    };
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && wkFull && !document.querySelector('#modal-root .modal')) { wkFull = false; page(); } });

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
      else if (b.dataset.i === 'del' && await UI.ask('حذف ایده', `ایدهٔ «${i.title}» حذف شود؟ برای بقیهٔ اعضا هم حذف می‌شود.`, 'حذف کن')) { put('ideas', { id: i.id, by: i.by, del: true }); toast('ایده حذف شد.'); page(); }
    };
  }

  /* ---------- keeping everyone in step (PeerJS, one address per person) ---------- */
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
