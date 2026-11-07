// The live online class («کلاس آنلاین») of a course page (classroom.js), shaped like BigBlueButton / Skyroom:
//   sessions planned ahead or started at once; a room with a stage (whiteboard and uploaded presentations with notes on
//   every page, the teacher's screen or camera as content, a shared external video), a strip of cameras, a side panel
//   (public chat, shared notes, users, polls and quizzes), the presenter's «+» menu (presentations, poll, external video,
//   countdown, camera as content), moderation (admission policy, lock viewers, mute, presenter, board access, remove,
//   breakout rooms, learning dashboard), reactions, raised hands, away status, layouts, settings and keyboard shortcuts.
//   Recording draws the stage, the teacher's camera and the class's sound into a video kept in this browser; it plays
//   back from the class page and the session report, and downloads as a file.
// Live sync: the teacher's tab is the host and the only one that saves. Every tab of the same browser joins through a
//   BroadcastChannel (breakout rooms get one each); cameras and microphones travel as WebRTC signalled over it. Between
//   devices the same protocol needs a relay server; until then the course's own link (BigBlueButton / Skyroom, set in
//   «تنظیمات») carries video and sound, offered in the room as «سرور مدرسه».
// Data: course.live = { sessions: [{ id, title, date, from, to, cls, status: planned|live|done, startedAt, endedAt,
//   att: { sid: { first, last, mins } }, chat, polls: [{ id, q, type, opts, anon, quiz, correct, votes: { sid: i|text } }],
//   decks: [{ id, name, pages: [{ s: [stroke], bg }] }], notes, stats: { sid: { msgs, reacts, hands, votes, correct } },
//   breakouts: [{ name, members, chat, pages }], recs: [{ id, at, secs, size }], cfg, sample }] }.
//   Slide images and recordings live in IndexedDB (too big for the page's storage), keyed by session.
const LiveClass = (() => {
  const { esc, fa, modal, close, toast } = UI;
  const J = JDate, D = SchoolData;
  const pad = n => String(n).padStart(2, '0');
  const dg = s => String(s ?? '').replace(/\d/g, c => '۰۱۲۳۴۵۶۷۸۹'[c]);
  const nowIso = () => new Date().toISOString();
  const hm = (t = new Date()) => `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const today = () => J.todayIso();
  const rid = () => Math.random().toString(36).slice(2, 10);
  const clock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return dg(h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`); };
  const tm = iso => iso ? dg(hm(new Date(iso))) : '—';
  const size = b => b > 1048576 ? `${fa(Math.round(b / 104857.6) / 10)} مگابایت` : `${fa(Math.max(1, Math.round(b / 1024)))} کیلوبایت`;
  const saveBlob = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };
  const download = (name, text, type = 'text/plain') => saveBlob(name, new Blob(['﻿' + text], { type: type + ';charset=utf-8' }));
  const csv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const SV = (p, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    star: SV('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
    cam: SV('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'),
    camOff: SV('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3M2 2l20 20"/>'),
    mic: SV('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    micOff: SV('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/>'),
    screen: SV('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 13V7M9 10l3-3 3 3"/>'),
    slide: SV('<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="m3 14 5-4 4 3 3-2 6 4"/><circle cx="16" cy="8" r="1.5"/>'),
    present: SV('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8M8 12l3-3 2 2 3-3"/>'),
    rec: SV('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>'),
    play: SV('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z" fill="currentColor"/>'),
    hand: SV('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.6 15.4a1.6 1.6 0 0 1 2.4-2.1L8 16"/>'),
    chat: SV('<path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    users: SV('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.2 3.2 0 0 1 0 6.4M18 14a6 6 0 0 1 3 6"/>'),
    notes: SV('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>'),
    poll: SV('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
    chart: SV('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
    leave: SV('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>'),
    end: SV('<path d="M3 15c5-4 13-4 18 0l-2 3-4-1.5v-2.5a10 10 0 0 0-6 0v2.5L5 18z"/>'),
    link: SV('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    select: SV('<path d="M5 3l13 7.5-5.5 1.6L10 18z"/><path d="m13 13 5 5"/>'),
    pan: SV('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.6 15.4a1.6 1.6 0 0 1 2.4-2.1L8 16"/>'),
    pen: SV('<path d="M4 20l4-1 10-10-3-3L5 16z"/>'), marker: SV('<path d="M9 15 4 20h5l2-2M14 4l6 6-8 8-6-6z"/>'),
    eraser: SV('<path d="M4 16 13 7l6 6-7 7H8zM9 20h11"/>'), line: SV('<path d="M5 19 19 5"/>'), arrow: SV('<path d="M5 19 19 5M10 5h9v9"/>'),
    rect: SV('<rect x="4" y="6" width="16" height="12" rx="1"/>'), ellipse: SV('<ellipse cx="12" cy="12" rx="8" ry="6"/>'),
    text: SV('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'), note: SV('<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>'),
    undo: SV('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'), redo: SV('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
    trash: SV('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'), prev: SV('<path d="m9 6 6 6-6 6"/>'), next: SV('<path d="m15 6-6 6 6 6"/>'),
    plus: SV('<path d="M12 5v14M5 12h14"/>'), minus: SV('<path d="M5 12h14"/>'), fit: SV('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    min: SV('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>'), chevUp: SV('<path d="m6 15 6-6 6 6"/>'), chev: SV('<path d="m6 9 6 6 6-6"/>', 16),
    lock: SV('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    send: SV('<path d="M20 4 3 11l7 2 2 7z"/><path d="m10 13 4-4"/>'),
    live: SV('<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'),
    report: SV('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    emoji: SV('<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>'),
    more: SV('<circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>'),
    gear: SV('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
    info: SV('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'), help: SV('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>'),
    kbd: SV('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
    layout: SV('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/>'),
    full: SV('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'), upload: SV('<path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9M12 12v8M9 15l3-3 3 3"/>'),
    film: SV('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'), timer: SV('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
    door: SV('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
    dl: SV('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'), copy: SV('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    userx: SV('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M16 8l5 5M21 8l-5 5"/>'), guest: SV('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
    side: SV('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'), clear: SV('<path d="M5 5l14 14M19 5 5 19"/>'), away: SV('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  };
  const COLORS = [['#1f2937', 'مشکی'], ['#b91c1c', 'قرمز'], ['#1d4ed8', 'آبی'], ['#047857', 'سبز'], ['#b45309', 'نارنجی'], ['#6d28d9', 'بنفش'], ['#db2777', 'صورتی'], ['#ffffff', 'سفید']];
  const WIDTHS = [['نازک', .0025], ['متوسط', .004], ['ضخیم', .008]];
  const REACTS = [['👍', 'موافقم'], ['👏', 'آفرین'], ['😂', 'خنده‌دار'], ['😮', 'تعجب'], ['🤔', 'فکر می‌کنم'], ['❤️', 'عالی بود'], ['🙌', 'فهمیدم'], ['👎', 'مخالفم']];
  const TOOLS = [['select', 'انتخاب', 'V'], ['pan', 'جابه‌جایی صفحه', 'H'], ['pen', 'قلم', 'P'], ['marker', 'ماژیک', 'M'], ['eraser', 'پاک‌کن', 'E'], ['arrow', 'پیکان', 'A'], ['line', 'خط', 'L'],
    ['text', 'متن', 'T'], ['note', 'یادداشت چسبان', 'N'], ['rect', 'مستطیل', 'R'], ['ellipse', 'بیضی', 'O']];
  const PTYPES = [['yn', 'بله / خیر', ['بله', 'خیر']], ['tf', 'درست / نادرست', ['درست', 'نادرست']], ['abcd', 'الف ب ج د', ['الف', 'ب', 'ج', 'د']], ['custom', 'گزینه‌های دلخواه', ['', '', '']], ['text', 'پاسخ متنی', []]];
  const LOCKS = [['cam', 'دوربین'], ['mic', 'میکروفون'], ['chat', 'گفت‌وگوی عمومی'], ['notes', 'ویرایش یادداشت‌های همرسانده'], ['users', 'دیدن فهرست دیگر کاربران']];
  const NOTE = .16, PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', PDFJS_W = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* ======================= small stores ======================= */
  const IDB = (() => {
    let db;
    const open = () => db || (db = new Promise((ok, no) => { const r = indexedDB.open('mehr8-live', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
    const run = async (mode, fn) => { const d = await open(); return new Promise((ok, no) => { const t = d.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = () => ok(q?.result); t.onerror = () => no(t.error); }); };
    return { get: k => run('readonly', s => s.get(k)).catch(() => null), set: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => null), del: k => run('readwrite', s => s.delete(k)).catch(() => null) };
  })();
  const PREF = 'mehr8-live-prefs', PDEF = { font: 'n', sound: true, motion: true, saver: false, layout: 'smart', side: true, theme: 'dark', board: 'paper', rest: true };
  const prefs = (() => { try { return { ...PDEF, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { ...PDEF }; } })();
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch { /* private window */ } };
  let AC;
  const beep = (f = 880, d = .12) => { if (!prefs.sound) return; try { AC = AC || new AudioContext(); const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; g.gain.setValueAtTime(.06, AC.currentTime); g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + d); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + d); } catch { /* no audio */ } };

  /* ======================= sessions ======================= */
  const live = c => (c.live = c.live || { sessions: [] });
  const sessOf = (c, id) => live(c).sessions.find(s => s.id === id);
  const clsName = (o, id) => id ? o.className(id) : 'همهٔ کلاس‌ها';
  const roster = (o, s) => o.students().filter(x => !s.cls || x.cls === s.cls);
  const fdate = iso => J.format(iso);
  const mins = s => s.startedAt && s.endedAt ? Math.max(1, Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 60000)) : 0;
  const present = s => Object.keys(s.att || {}).length;
  const sorted = c => { const l = live(c).sessions;
    return [...l.filter(s => s.status === 'live'), ...l.filter(s => s.status === 'planned').sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)),
      ...l.filter(s => s.status === 'done').sort((a, b) => (b.date + b.from).localeCompare(a.date + a.from))]; };
  // Older sessions kept the board as `boards: [[stroke]]`.
  const decksOf = x => x.decks || [{ id: 'wb', name: 'تختهٔ سفید', pages: (x.boards?.length ? x.boards : [[]]).map(s => ({ s: s.map(k => ({ id: k.id || rid(), ...k })) })) }];
  // A session is on air only while the teacher's room is open: it stamps `hostAt` every half minute and clears it on leaving.
  // One left open (tab closed, temporary exit) shows as unfinished; one left from an earlier day is closed by itself.
  const onAir = x => x.status === 'live' && !!x.hostAt && Date.now() - x.hostAt < 90000;
  const paused = x => x.status === 'live' && !onAir(x);
  function finish(x) {
    const at = x.hostAt || x.lastAt || (x.startedAt ? +new Date(x.startedAt) + 45 * 60000 : Date.now());
    Object.values(x.att || {}).forEach(a => { if (a.since) { a.mins = (a.mins || 0) + Math.max(1, Math.round((at - a.since) / 60000)); delete a.since; } });
    x.status = 'done'; x.endedAt = new Date(Math.min(Date.now(), Math.max(at, +new Date(x.startedAt || at)))).toISOString(); x.hostAt = 0;
    (x.polls || []).forEach(p => { p.closed = true; });
  }
  function sweep(c, o) {
    let ch = false;
    live(c).sessions.forEach(x => { if (paused(x) && x.date < today() && !(R && R.x === x)) { finish(x); ch = true; } });
    if (ch) o.save();
  }
  const blank = rec => ({ id: D.uid('lv'), ...rec, status: 'planned', att: {}, chat: [], polls: [], recs: [], stats: {}, notes: '' });

  // Two past sessions and one for today in the demo teacher's subject, so the tab and the report have something to show.
  function seed(c, o) {
    if (live(c).seeded || o.sub !== D.TEACHER_SUBJECT) return;
    const ss = o.students(), cls = o.classes()[0]?.id || null, mine = ss.filter(x => !cls || x.cls === cls);
    const day = n => { let x = D.shift(n); while (D.dayIndex(x) === null) x = D.shift(-1, x); return x; };
    const past = (n, title, from, to, polls) => { const date = day(n), att = {}, stats = {}, start = new Date(`${date}T${from}:00`);
      mine.forEach((x, i) => { if (i % 7 === 3) return; const m = 40 - (i % 5) * 4; att[x.id] = { first: new Date(+start + (i % 4) * 60000).toISOString(), last: new Date(+start + m * 60000).toISOString(), mins: m };
        stats[x.id] = { msgs: i < 3 ? 1 : 0, reacts: i % 3, hands: i % 4 === 0 ? 1 : 0, votes: polls.length && polls[0].votes[x.id] != null ? 1 : 0, correct: polls.length && polls[0].votes[x.id] === 0 ? 1 : 0 }; });
      return { id: D.uid('lv'), title: `${title} (نمونه)`, date, from, to, cls, status: 'done', startedAt: start.toISOString(), endedAt: new Date(+start + 45 * 60000).toISOString(), att, stats,
        chat: [{ who: o.me(), host: true, text: 'سلام بچه‌ها، صدای من را دارید؟', at: start.toISOString() }, ...mine.slice(0, 3).map((x, i) => ({ who: x.name, sid: x.id, text: ['بله آقا، صدا خوبه', 'سلام، بله', 'آقا تمرین ۳ رو هم حل می‌کنید؟'][i], at: new Date(+start + (i + 1) * 60000).toISOString() }))],
        polls, notes: '', recs: [], sample: true,
        decks: [{ id: 'wb', name: 'تختهٔ سفید', pages: [{ s: [{ id: rid(), k: 'text', x: .94, y: .06, s: title, c: '#1d4ed8', w: .045 }, { id: rid(), k: 'line', p: [[.4, .14], [.94, .14]], c: '#b45309', w: .004 }] }] }] }; };
    const votes = {}; mine.slice(0, 18).forEach((x, i) => { votes[x.id] = i % 3 === 0 ? 1 : 0; });
    live(c).sessions.push(
      past(-7, 'معادله‌های درجهٔ اول', '10:00', '10:45', []),
      past(-2, 'حل تمرین فصل سوم', '10:00', '10:45', [{ id: rid(), q: 'تمرین‌های فصل را حل کرده‌اید؟', type: 'custom', opts: ['بله، همه را', 'نه هنوز'], votes, closed: true, quiz: false, anon: false }]),
      { ...blank({ title: 'رفع اشکال پیش از آزمون (نمونه)', date: today(), from: '16:00', to: '16:45', cls }), sample: true });
    live(c).seeded = true; o.save();
  }

  // The course page's card: the class going on now, or the next one, and the way in.
  function card(c, o, s) {
    seed(c, o); sweep(c, o);
    const l = sorted(c), cur = l.find(x => x.status === 'live'), next = l.find(x => x.status === 'planned' && (!s || !x.cls || x.cls === s.cls));
    const done = l.filter(x => x.status === 'done' && (!s || !x.cls || x.cls === s.cls));
    const target = cur && (!s || !cur.cls || cur.cls === s.cls) ? cur : next;
    const canJoin = target && (target.status === 'live' || target.date === today());
    const when = x => `${fdate(x.date)}، ساعت ${dg(x.from)}${x.to ? ` تا ${dg(x.to)}` : ''}`;
    const mine = s ? done.filter(x => x.att?.[s.id]).length : 0, recs = done.filter(x => (x.recs || []).length);
    const air = target && onAir(target), half = target && paused(target);
    const state = air ? '<b class="lv-dot">در حال برگزاری</b> · ' : half ? `<b class="lv-half">${s ? 'منتظر ورود معلم' : 'نیمه‌تمام'}</b> · ` : '';
    return `<div class="card lv-card ${air ? 'is-live' : ''}"><div class="card-head"><div class="row"><span class="tile lv-ic">${IC.cam}</span><div><h2 style="margin:0">کلاس آنلاین</h2>
        <span class="small muted">${target ? `${state}${esc(target.title)} · ${when(target)}` : 'جلسه‌ای در برنامه نیست.'}</span></div></div>
      <div class="row">${target ? `<button type="button" class="btn ${canJoin ? 'primary' : ''}" data-act="lv-join" data-id="${target.id}" ${canJoin ? '' : 'disabled'}>${s ? 'ورود به کلاس' : air ? 'بازگشت به کلاس' : half ? 'ادامهٔ کلاس' : 'شروع کلاس'}</button>` : ''}
        ${half && !s && !o.ro ? `<button type="button" class="btn" data-act="lv-finish" data-id="${target.id}">پایان جلسه</button>` : ''}
        ${!s && !o.ro ? '<button type="button" class="btn" data-act="lv-now">شروع فوری</button>' : ''}${recs.length ? `<button type="button" class="btn" data-act="lv-recs">${IC.play} ضبط‌ها (${fa(recs.reduce((a, x) => a + x.recs.length, 0))})</button>` : ''}${c.link ? `<a class="btn" href="${esc(c.link)}" target="_blank" rel="noopener">${IC.link} سرور مدرسه</a>` : ''}</div></div>
      ${s && done.length ? `<p class="small muted" style="margin:0">در ${fa(mine)} جلسه از ${fa(done.length)} جلسهٔ برگزارشده حاضر بوده‌ای.</p>` : ''}</div>`;
  }

  // The «کلاس آنلاین» tab: sessions ahead, the live one, past ones with their reports, dashboards and recordings.
  function tab(c, o) {
    seed(c, o); sweep(c, o);
    const l = sorted(c), up = l.filter(x => x.status !== 'done'), past = l.filter(x => x.status === 'done');
    const row = x => `<tr class="${onAir(x) ? 'lv-row-live' : ''}"><td><b>${esc(x.title)}</b>${onAir(x) ? ' <span class="tag bad">زنده</span>' : paused(x) ? ' <span class="tag warn">نیمه‌تمام</span>' : x.date === today() ? ' <span class="tag warn">امروز</span>' : ''}</td>
      <td>${esc(fdate(x.date))}</td><td class="num">${dg(x.from)}${x.to ? `–${dg(x.to)}` : ''}</td><td>${esc(clsName(o, x.cls))}</td>
      <td class="lv-acts">${o.ro ? '' : `<button type="button" class="btn sm primary" data-act="lv-join" data-id="${x.id}">${onAir(x) ? 'بازگشت به کلاس' : paused(x) ? 'ادامه' : 'شروع'}</button>${paused(x) ? `<button type="button" class="btn sm" data-act="lv-finish" data-id="${x.id}">پایان جلسه</button>` : ''}
        <button type="button" class="btn sm" data-act="lv-edit" data-id="${x.id}">ویرایش</button><button type="button" class="btn sm danger" data-act="lv-del" data-id="${x.id}" aria-label="حذف ${esc(x.title)}">حذف</button>`}</td></tr>`;
    const prow = x => { const r = roster(o, x).length, nr = (x.recs || []).length;
      return `<tr><td><b>${esc(x.title)}</b></td><td>${esc(fdate(x.date))}</td><td class="num">${fa(mins(x))} دقیقه</td><td class="num">${fa(present(x))} از ${fa(r)}</td>
        <td class="num">${fa((x.chat || []).length)}</td><td class="lv-acts"><button type="button" class="btn sm" data-act="lv-report" data-id="${x.id}">${IC.report} گزارش</button>
        <button type="button" class="btn sm" data-act="lv-dash" data-id="${x.id}">${IC.chart} داشبورد</button>${nr ? `<button type="button" class="btn sm" data-act="lv-rec" data-id="${x.id}">${IC.play} ضبط${nr > 1 ? ` (${fa(nr)})` : ''}</button>` : ''}</td></tr>`; };
    const totalP = past.reduce((a, x) => a + present(x), 0), totalR = past.reduce((a, x) => a + roster(o, x).length, 0), nrec = past.reduce((a, x) => a + (x.recs || []).length, 0);
    return `<div class="grid g4 lv-kpis">${o.kpi('جلسه‌های برگزارشده', fa(past.length), past.length ? `${fa(past.reduce((a, x) => a + mins(x), 0))} دقیقه کلاس` : 'هنوز جلسه‌ای نبوده', '', 'blue')}
        ${o.kpi('میانگین حضور', totalR ? `${fa(Math.round(totalP / totalR * 100))}٪` : '—', 'در جلسه‌های آنلاین', '', 'teal')}
        ${o.kpi('جلسه‌های پیش رو', fa(up.filter(x => x.status === 'planned').length), up[0] ? `بعدی: ${fdate(up[0].date)}` : '', '', 'violet')}
        ${o.kpi('ضبط‌ها', fa(nrec), nrec ? 'نمایش از جدول پایین' : 'هنوز ضبطی نیست', '', 'amber')}</div>
      <div class="card"><div class="card-head"><h2 style="margin:0">جلسه‌های پیش رو</h2>${o.ro ? '' : `<div class="row"><button type="button" class="btn primary" data-act="lv-now">${IC.live} شروع فوری کلاس</button><button type="button" class="btn" data-act="lv-new">+ برنامه‌ریزی جلسه</button></div>`}</div>
        ${up.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="جلسه‌های پیش رو"><table><tr><th>عنوان</th><th>روز</th><th>ساعت</th><th>کلاس</th><th></th></tr>${up.map(row).join('')}</table></div>` : o.empty('جلسه‌ای برنامه‌ریزی نشده.')}</div>
      <div class="card"><h2>جلسه‌های برگزارشده</h2>${past.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="جلسه‌های برگزارشده"><table><tr><th>عنوان</th><th>روز</th><th>مدت</th><th>حاضر</th><th>پیام</th><th></th></tr>${past.map(prow).join('')}</table></div>` : o.empty('هنوز کلاسی برگزار نشده.')}</div>`;
  }

  function sessionModal(c, o, x) {
    modal(`<h2>${x ? 'ویرایش جلسه' : 'برنامه‌ریزی جلسهٔ آنلاین'}</h2>
      <label class="field"><span>عنوان جلسه</span><input class="input" id="lv-t" value="${esc(x?.title || '')}" placeholder="مثلاً حل تمرین فصل چهارم"></label>
      <div class="grid g3" style="gap:0 12px"><div class="field"><span>روز</span>${J.field('lv-d', x?.date || today())}</div>
        <label class="field"><span>از ساعت</span><input class="input" type="time" id="lv-f" value="${esc(x?.from || hm())}"></label>
        <label class="field"><span>تا ساعت</span><input class="input" type="time" id="lv-e" value="${esc(x?.to || '')}"></label></div>
      <label class="field"><span>کلاس</span><select class="input" id="lv-c"><option value="">همهٔ کلاس‌ها</option>${o.classes().map(k => `<option value="${k.id}" ${x?.cls === k.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
      <div class="row" style="margin-top:18px"><button class="btn primary" id="lv-ok">${x ? 'ذخیره' : 'ثبت جلسه'}</button><button class="btn" data-close>انصراف</button></div>`, root => {
      root.querySelector('#lv-ok').onclick = () => {
        const title = root.querySelector('#lv-t').value.trim(); if (!title) return UI.invalid('#lv-t', 'عنوان جلسه را بنویسید.');
        const rec = { title, date: root.querySelector('#lv-d').value || today(), from: root.querySelector('#lv-f').value, to: root.querySelector('#lv-e').value, cls: root.querySelector('#lv-c').value || null };
        if (rec.to && rec.from && rec.to <= rec.from) return UI.invalid('#lv-e', 'پایان باید بعد از شروع باشد.');
        if (x) Object.assign(x, rec); else live(c).sessions.push(blank(rec));
        o.save(); close(); o.render(); toast(x ? 'جلسه ویرایش شد.' : 'جلسه ثبت شد.');
      };
    });
  }

  /* ======================= after the class: report, dashboard, recordings ======================= */
  const counts = p => p.opts.map((_, i) => Object.values(p.votes || {}).filter(v => v === i).length);
  function pollResult(p, nameOf) {
    const n = p.n ?? Object.keys(p.votes || {}).length;
    const head = `<b>${esc(p.q)}</b> <span class="small muted">${fa(n)} ${p.type === 'text' ? 'پاسخ' : 'رأی'}${p.anon ? ' · بی‌نام' : ''}${p.quiz ? ' · آزمونک' : ''}</span>`;
    if (p.type === 'text') { const l = p.texts || Object.entries(p.votes || {}).map(([sid, v]) => ({ who: p.anon || !nameOf ? '' : nameOf(sid), v }));
      return `<div class="lv-poll-r">${head}<ul class="lv-texts">${l.map(a => `<li>${a.who ? `<b>${esc(a.who)}:</b> ` : ''}${esc(a.v)}</li>`).join('') || '<li class="muted">پاسخی نیامده.</li>'}</ul></div>`; }
    const cnt = p.cnt || counts(p);
    return `<div class="lv-poll-r">${head}${p.opts.map((op, i) => { const ok = p.quiz && p.correct === i;
      return `<div class="lv-bar ${ok ? 'ok' : ''}"><span>${esc(op)}${ok ? ' ✓' : ''}</span><i style="--w:${n ? cnt[i] / n * 100 : 0}%"></i><b class="num">${fa(cnt[i])}</b></div>`; }).join('')}</div>`;
  }
  const nameIn = o => sid => o.students().find(s => s.id === sid)?.name || '';
  // The student's photo from the profiles, or their initial.
  const face = (s, name) => { const ph = s && D.photoOf ? D.photoOf(s) : ''; return ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : esc((name || s?.name || '؟').trim()[0]); };
  const who = s => `<span class="lv-who-n"><span class="lv-face" aria-hidden="true">${face(s)}</span>${esc(s.name)}</span>`;

  function report(c, o, x) {
    const r = roster(o, x), pr = r.filter(s => x.att?.[s.id]).length, decks = decksOf(x), pages = [];
    decks.forEach(d => d.pages.forEach((p, i) => { if (p.s.length || p.bg) pages.push({ d, i, p }); }));
    const brs = x.breakouts || [], recs = x.recs || [];
    modal(`<h2>گزارش جلسه: ${esc(x.title)}</h2><p class="muted" style="margin-top:-6px">${esc(fdate(x.date))} · ${fa(mins(x))} دقیقه · ${esc(clsName(o, x.cls))}</p>
      <div class="grid g4 lv-kpis">${o.kpi('حاضر', `${fa(pr)} از ${fa(r.length)}`, '', '', 'teal')}${o.kpi('پیام‌ها', fa((x.chat || []).length), '', '', 'blue')}${o.kpi('نظرسنجی', fa((x.polls || []).length), '', '', 'violet')}${o.kpi('ضبط', fa(recs.length), '', '', 'amber')}</div>
      ${recs.length ? `<h3 class="lv-h3">ضبط‌ها</h3><div class="lv-recl">${recs.map((q, i) => `<button type="button" class="btn" data-rec="${i}">${IC.play} ضبط ${fa(i + 1)} · ${tm(q.at)} · ${clock(q.secs)}</button>`).join('')}</div>` : ''}
      <h3 class="lv-h3">حضور</h3><div class="table-wrap lv-rep" tabindex="0" role="region" aria-label="حضور جلسه"><table><tr><th>دانش‌آموز</th><th>کلاس</th><th>ورود</th><th>مدت</th></tr>
        ${[...r].sort((a, b) => !x.att?.[a.id] - !x.att?.[b.id]).map(s => { const a = x.att?.[s.id]; return `<tr><td>${who(s)}</td><td>${esc(o.className(s.cls))}</td><td class="num">${a ? tm(a.first) : '<span class="tag bad">غایب</span>'}</td><td class="num">${a ? `${fa(a.mins || 0)} دقیقه` : '—'}</td></tr>`; }).join('')}</table></div>
      ${(x.polls || []).length ? `<h3 class="lv-h3">نظرسنجی‌ها و آزمونک‌ها</h3>${x.polls.map(p => pollResult(p, nameIn(o))).join('')}` : ''}
      ${x.notes ? `<h3 class="lv-h3">یادداشت‌های همرسانده</h3><div class="lv-replog"><p style="white-space:pre-wrap">${esc(x.notes)}</p></div>` : ''}
      ${brs.length ? `<h3 class="lv-h3">اتاق‌های جانبی</h3>${brs.map(b => `<p class="small"><b>${esc(b.name)}</b> · ${esc((b.members || []).join('، ') || '—')} · ${fa((b.chat || []).length)} پیام</p>`).join('')}` : ''}
      ${(x.chat || []).length ? `<h3 class="lv-h3">گفت‌وگو</h3><div class="lv-replog">${x.chat.map(m => m.sys ? `<p class="muted small">${esc(m.text)}</p>` : `<p><b>${esc(m.who)}</b> <span class="muted small num">${tm(m.at)}</span><br>${esc(m.text)}</p>`).join('')}</div>` : ''}
      ${pages.length ? `<h3 class="lv-h3">صفحه‌های تخته و ارائه</h3><div class="lv-thumbs">${pages.slice(0, 24).map((_, i) => `<canvas class="lv-thumb" width="320" height="180" data-pg="${i}" role="img" aria-label="صفحهٔ ${fa(i + 1)}"></canvas>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-rd">${IC.chart} داشبورد یادگیری</button><button class="btn" id="lv-rcsv">${IC.dl} فهرست حضور</button><button class="btn" data-close>بستن</button></div>`, async root => {
      root.querySelector('#lv-rd').onclick = () => dashboard(x, o);
      root.querySelector('#lv-rcsv').onclick = () => namesCsv(x, o);
      root.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => playRec(x, +b.dataset.rec));
      const bgs = {}; await Promise.all(decks.filter(d => d.pages.some(p => p.bg)).map(async d => { bgs[d.id] = await IDB.get(x.id + ':' + d.id) || []; }));
      root.querySelectorAll('.lv-thumb').forEach(cv => { const q = pages[+cv.dataset.pg], src = bgs[q.d.id]?.[q.i], draw = im => paint(cv.getContext('2d'), q.p.s, cv.width, cv.height, im);
        if (src) { const im = new Image(); im.onload = () => draw(im); im.onerror = () => draw(null); im.src = src; } else draw(null); });
    });
  }

  // Time in class, messages, reactions, hands and poll answers per student, with an activity score out of 100.
  function dashboard(x, o) {
    const isLive = R && R.x === x, r = roster(o, x), on = isLive ? new Set([...R.people.values()].map(v => v.sid)) : new Set(), now = Date.now();
    const total = Math.max(1, x.startedAt ? ((x.endedAt && !isLive ? +new Date(x.endedAt) : now) - new Date(x.startedAt)) / 60000 : 1), np = (x.polls || []).length;
    const minsOf = sid => { const a = x.att?.[sid]; return a ? (a.mins || 0) + (a.since ? (now - a.since) / 60000 : 0) : 0; };
    const rows = r.map(s => { const t = x.stats?.[s.id] || {}, m = minsOf(s.id), here = !!x.att?.[s.id];
      const score = here ? Math.round(Math.min(1, m / total) * 50 + Math.min(t.msgs || 0, 5) * 3 + Math.min((t.reacts || 0) + (t.hands || 0), 5) * 2 + (np ? Math.min(1, (t.votes || 0) / np) * 25 : 25)) : 0;
      return { s, t, m: Math.round(m), here, st: on.has(s.id) ? 'آنلاین' : here ? (isLive ? 'رفته' : 'حاضر') : 'غایب', score }; }).sort((a, b) => b.score - a.score);
    const pres = rows.filter(q => q.here), kpi = (l, v) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`;
    modal(`<h2>داشبورد تحلیل یادگیری</h2><p class="muted" style="margin-top:-6px">${esc(x.title)} · ${esc(fdate(x.date))}</p>
      <div class="grid g4 lv-kpis">${kpi('حاضر', `${fa(pres.length)} از ${fa(r.length)}`)}${kpi('میانگین حضور', `${fa(pres.length ? Math.round(pres.reduce((a, q) => a + q.m, 0) / pres.length) : 0)} دقیقه`)}
        ${kpi('پیام‌ها', fa(rows.reduce((a, q) => a + (q.t.msgs || 0), 0)))}${kpi('مشارکت در نظرسنجی', np && pres.length ? `${fa(Math.round(rows.reduce((a, q) => a + Math.min(np, q.t.votes || 0), 0) / (np * pres.length) * 100))}٪` : '—')}</div>
      <div class="table-wrap lv-dash" tabindex="0" role="region" aria-label="فعالیت دانش‌آموزان"><table><tr><th>دانش‌آموز</th><th>وضعیت</th><th>حضور</th><th>پیام</th><th>واکنش</th><th>دست بالا</th><th>نظرسنجی</th><th>امتیاز فعالیت</th></tr>
        ${rows.map(q => `<tr><td>${who(q.s)}</td><td><span class="tag ${q.st === 'غایب' ? 'bad' : q.st === 'آنلاین' ? 'ok' : ''}">${q.st}</span></td><td class="num">${q.here ? `${fa(q.m)} دقیقه` : '—'}</td>
          <td class="num">${fa(q.t.msgs || 0)}</td><td class="num">${fa(q.t.reacts || 0)}</td><td class="num">${fa(q.t.hands || 0)}</td>
          <td class="num">${np ? `${fa(q.t.votes || 0)} از ${fa(np)}${q.t.correct ? ` · ${fa(q.t.correct)} درست` : ''}` : '—'}</td><td><span class="lv-score"><i style="--w:${q.score}%"></i><b class="num">${fa(q.score)}</b></span></td></tr>`).join('')}</table></div>
      <div class="row" style="margin-top:16px"><button class="btn" id="lv-dcsv">${IC.dl} دانلود</button><button class="btn" data-close>بستن</button></div>`, root => {
      root.querySelector('#lv-dcsv').onclick = () => download(`داشبورد-${x.title}.csv`, csv([['دانش‌آموز', 'وضعیت', 'حضور (دقیقه)', 'پیام', 'واکنش', 'دست بالا', 'پاسخ نظرسنجی', 'پاسخ درست', 'امتیاز فعالیت'],
        ...rows.map(q => [q.s.name, q.st, q.m, q.t.msgs || 0, q.t.reacts || 0, q.t.hands || 0, q.t.votes || 0, q.t.correct || 0, q.score])]), 'text/csv');
    });
  }
  function namesCsv(x, o) {
    const on = R && R.x === x ? new Set([...R.people.values()].map(v => v.sid)) : new Set();
    download(`حضور-${x.title}.csv`, csv([['نام', 'کلاس', 'وضعیت', 'ورود', 'مدت (دقیقه)'], ...roster(o, x).map(s => { const a = x.att?.[s.id];
      return [s.name, o.className(s.cls), on.has(s.id) ? 'آنلاین' : a ? 'حاضر' : 'غایب', a ? hm(new Date(a.first)) : '', a ? Math.round((a.mins || 0) + (a.since ? (Date.now() - a.since) / 60000 : 0)) : 0]; })]), 'text/csv');
  }

  // A recording plays back here from this browser's store; it can also be saved as a file.
  async function playRec(x, i) {
    const q = x.recs[i], blob = await IDB.get('rec:' + q.id);
    if (!blob) return modal(`<h2>ضبط ${fa(i + 1)}: ${esc(x.title)}</h2><p>فایل این ضبط روی همین رایانه‌ای است که کلاس را ضبط کرد؛ در این مرورگر پیدا نشد.</p><div class="row"><button class="btn" data-close>بستن</button></div>`);
    const url = URL.createObjectURL(blob);
    modal(`<h2>ضبط کلاس: ${esc(x.title)}</h2><p class="muted" style="margin-top:-6px">${esc(fdate(x.date))} · ساعت ${tm(q.at)} · ${clock(q.secs)} · ${size(q.size || blob.size)}</p>
      <video class="lv-player" src="${url}" controls playsinline preload="metadata"></video>
      ${x.recs.length > 1 ? `<div class="lv-recl">${x.recs.map((r, k) => `<button type="button" class="btn sm ${k === i ? 'primary' : ''}" data-k="${k}">ضبط ${fa(k + 1)}</button>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn" id="lv-rdl">${IC.dl} ذخیرهٔ فایل</button><button class="btn danger" id="lv-rdel">حذف ضبط</button><button class="btn" data-close>بستن</button></div>`, root => {
      // MediaRecorder files carry no length; seeking to the end once makes the browser measure it, so the seek bar works.
      const v = root.querySelector('.lv-player');
      v.addEventListener('loadedmetadata', () => { if (v.duration !== Infinity) return; v.addEventListener('durationchange', () => { v.currentTime = 0; }, { once: true }); v.currentTime = 1e9; }, { once: true });
      root.querySelector('#lv-rdl').onclick = () => saveBlob(`کلاس-${x.title}-${fa(i + 1)}.webm`, blob);
      root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { URL.revokeObjectURL(url); playRec(x, +b.dataset.k); });
      root.querySelector('#lv-rdel').onclick = async () => { const o = REC_CTX.get(x); if (!await UI.ask('حذف ضبط', 'این ضبط برای همیشه حذف شود؟', 'حذف کن')) return; await IDB.del('rec:' + q.id); x.recs.splice(i, 1); o?.save(); o?.render(); toast('ضبط حذف شد.'); };
    });
  }
  const REC_CTX = new WeakMap();
  function recsModal(c, o) {
    const l = sorted(c).filter(x => (x.recs || []).length); l.forEach(x => REC_CTX.set(x, o));
    modal(`<h2>ضبط‌های کلاس ${esc(o.sub)}</h2><div class="lv-recs">${l.map(x => `<div class="lv-recrow"><div><b>${esc(x.title)}</b><span class="small muted">${esc(fdate(x.date))}</span></div>
        <div class="row">${x.recs.map((q, i) => `<button type="button" class="btn sm" data-x="${x.id}" data-i="${i}">${IC.play} ${clock(q.secs)}</button>`).join('')}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>بستن</button></div>`, root => {
      root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => playRec(sessOf(c, b.dataset.x), +b.dataset.i));
    });
  }

  /* ======================= the board ======================= */
  // Board units: 0..1 across, 0..9/16 down, so every screen draws the same. The view (zoom and pan) is in the same units.
  const MC = document.createElement('canvas').getContext('2d');
  const textW = s => { MC.font = '600 100px Vazirmatn, Tahoma, sans-serif'; return MC.measureText(s.s || '').width / 100 * s.w; };
  function wrapText(g, text, x, y, maxW, lh, max) {
    const words = String(text).split(/\s+/); let line = '', n = 0;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); line = w; if (++n >= max) return; } else line = t; }
    if (line) g.fillText(line, x, y + n * lh);
  }
  // A warm paper board is gentler on the eyes over a long class than pure white (settings › راحتی چشم).
  const PAPER = () => prefs.board === 'white' ? '#ffffff' : '#f4f0e6';
  function paint(g, strokes, W, H, bg, vp = { z: 1, x: 0, y: 0 }, extra) {
    g.save(); g.fillStyle = PAPER(); g.fillRect(0, 0, W, H); g.scale(vp.z, vp.z); g.translate(-vp.x * W, -vp.y * W);
    if (bg?.complete && bg.naturalWidth) { const r = Math.min(W / bg.naturalWidth, H / bg.naturalHeight), w = bg.naturalWidth * r, h = bg.naturalHeight * r; g.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    (strokes || []).forEach(s => drawStroke(g, extra?.swap?.id === s.id ? extra.swap : s, W));
    if (extra?.cur) drawStroke(g, extra.cur, W);
    if (extra?.sel) { const b = bbox(extra.sel), p = 6 / vp.z; g.save(); g.setLineDash([6 / vp.z, 4 / vp.z]); g.strokeStyle = '#0f766e'; g.lineWidth = 1.5 / vp.z; g.strokeRect(b[0] * W - p, b[1] * W - p, (b[2] - b[0]) * W + 2 * p, (b[3] - b[1]) * W + 2 * p); g.restore(); }
    g.restore();
  }
  function drawStroke(g, s, W) {
    g.save(); g.strokeStyle = g.fillStyle = s.c || '#1f2937'; g.lineWidth = Math.max(1, (s.w || .004) * W); g.globalAlpha = s.k === 'marker' ? .35 : 1;
    if (s.k === 'eraser') { g.strokeStyle = PAPER(); g.globalAlpha = 1; }
    const P = (s.p || []).map(([x, y]) => [x * W, y * W]);
    if (s.k === 'text') { g.font = `600 ${s.w * W}px Vazirmatn, Tahoma, sans-serif`; g.textBaseline = 'top'; g.direction = 'rtl'; g.textAlign = 'right'; g.fillText(s.s, s.x * W, s.y * W); }
    else if (s.k === 'note') { const x = s.x * W, y = s.y * W, n = NOTE * W; g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 8; g.shadowOffsetY = 2; g.fillStyle = '#fde68a'; g.fillRect(x - n, y, n, n); g.shadowColor = 'transparent';
      g.fillStyle = '#1f2937'; g.font = `600 ${.019 * W}px Vazirmatn, Tahoma, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'top'; g.direction = 'rtl'; wrapText(g, s.s, x - .01 * W, y + .012 * W, n - .02 * W, .027 * W, 5); }
    else if (s.k === 'poll') { const x = s.x * W, y = s.y * W, bw = .34 * W, rh = .032 * W, bh = (.05 + s.opts.length * .032) * W, n = s.n || 0;
      g.fillStyle = '#fff'; g.strokeStyle = '#0f766e'; g.lineWidth = Math.max(1, .002 * W); g.fillRect(x - bw, y, bw, bh); g.strokeRect(x - bw, y, bw, bh);
      g.fillStyle = '#0f5f59'; g.font = `700 ${.016 * W}px Vazirmatn, Tahoma, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'top'; g.direction = 'rtl'; g.fillText(s.q.slice(0, 48), x - .01 * W, y + .012 * W);
      s.opts.forEach((op, i) => { const yy = y + .045 * W + i * rh, c = s.cnt[i] || 0; g.fillStyle = '#1f2937'; g.font = `500 ${.013 * W}px Vazirmatn, Tahoma, sans-serif`; g.fillText(op.slice(0, 16), x - .01 * W, yy);
        g.fillStyle = '#e0f2ef'; g.fillRect(x - bw + .05 * W, yy + .002 * W, .16 * W, .016 * W); g.fillStyle = '#0f766e'; g.fillRect(x - bw + .05 * W + .16 * W * (1 - (n ? c / n : 0)), yy + .002 * W, .16 * W * (n ? c / n : 0), .016 * W);
        g.fillStyle = '#1f2937'; g.textAlign = 'left'; g.fillText(dg(c), x - bw + .012 * W, yy); g.textAlign = 'right'; }); }
    else if ((s.k === 'line' || s.k === 'arrow') && P.length > 1) { const a = P[0], b = P[P.length - 1]; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      if (s.k === 'arrow') { const an = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = Math.max(10, g.lineWidth * 4); g.beginPath(); g.moveTo(b[0] - hl * Math.cos(an - .45), b[1] - hl * Math.sin(an - .45)); g.lineTo(...b); g.lineTo(b[0] - hl * Math.cos(an + .45), b[1] - hl * Math.sin(an + .45)); g.stroke(); } }
    else if (s.k === 'rect' && P.length > 1) { const [a, b] = [P[0], P[P.length - 1]]; g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    else if (s.k === 'ellipse' && P.length > 1) { const [a, b] = [P[0], P[P.length - 1]]; g.beginPath(); g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2); g.stroke(); }
    else if (P.length) { g.beginPath(); g.moveTo(...P[0]); P.slice(1).forEach(p => g.lineTo(...p)); if (P.length === 1) g.lineTo(P[0][0] + .1, P[0][1]); g.stroke(); }
    g.restore();
  }
  function bbox(s) {
    if (s.k === 'text') { const w = textW(s); return [s.x - w, s.y, s.x, s.y + s.w * 1.25]; }
    if (s.k === 'note') return [s.x - NOTE, s.y, s.x, s.y + NOTE];
    if (s.k === 'poll') return [s.x - .34, s.y, s.x, s.y + .05 + s.opts.length * .032];
    const xs = s.p.map(q => q[0]), ys = s.p.map(q => q[1]), m = (s.w || .004) / 2;
    return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
  }
  const segDist = ([ax, ay], [bx, by], x, y) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0; return Math.hypot(ax + t * dx - x, ay + t * dy - y); };
  function hit(s, [x, y], tol) {
    const b = bbox(s); if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) return false;
    if (!['pen', 'marker', 'line', 'arrow', 'eraser'].includes(s.k)) return true;
    const P = s.k === 'line' || s.k === 'arrow' ? [s.p[0], s.p[s.p.length - 1]] : s.p, r = tol + (s.w || .004) / 2;
    if (P.length === 1) return Math.hypot(P[0][0] - x, P[0][1] - y) <= r;
    for (let i = 1; i < P.length; i++) if (segDist(P[i - 1], P[i], x, y) <= r) return true;
    return false;
  }
  const moved = (s, dx, dy) => s.p ? { ...s, p: s.p.map(([x, y]) => [+(x + dx).toFixed(4), +(y + dy).toFixed(4)]) } : { ...s, x: +(s.x + dx).toFixed(4), y: +(s.y + dy).toFixed(4) };
  const clampVp = vp => { vp.x = Math.max(0, Math.min(1 - 1 / vp.z, vp.x)); vp.y = Math.max(0, Math.min(.5625 - .5625 / vp.z, vp.y)); };

  /* ======================= the room ======================= */
  let R = null;
  const newSp = () => ({ decks: [{ id: 'wb', name: 'تختهٔ سفید', pages: [{ s: [] }] }], deck: 0, page: 0, chat: [], vp: { z: 1, x: 0, y: 0 } });
  const pageOf = (sp, d = sp.deck, p = sp.page) => sp.decks[d]?.pages[p];
  const curPage = () => pageOf(R.sp);
  const $room = () => document.getElementById('lv-room');
  const $r = s => document.querySelector('#lv-room ' + s);
  const set = (s, t) => { const e = $r(s); if (e && e.textContent !== t) e.textContent = t; };
  const send = m => { try { R?.chan.postMessage(m); } catch { /* closed */ } };
  const chanOf = sp => sp === R.main ? R.chan : R.host ? R.br?.rooms.find(r => r.sp === sp)?.chan : R.room?.chan;
  const spSend = m => { try { chanOf(R.sp)?.postMessage(m); } catch { /* closed */ } };
  const canNav = () => R.host || R.presenter === R.me.key || R.sp !== R.main;
  const mayDraw = () => R.sp !== R.main || R.host || R.presenter === R.me.key || R.allWrite || R.writers.has(R.me.sid);
  const st = sid => (R.x.stats[sid] = R.x.stats[sid] || { msgs: 0, reacts: 0, hands: 0, votes: 0, correct: 0 });
  const count = () => R.host ? R.people.size + 1 : R.waiting ? 0 : R.people.size + 2;
  const stuOf = sid => sid ? R.o.students().find(s => s.id === sid) : null;
  const nameOfSid = sid => stuOf(sid)?.name || '';
  const btnIcon = (act, ic, label, extra = '') => `<button type="button" class="lv-ib" data-lv="${act}" aria-label="${label}" title="${label}" ${extra}>${ic}</button>`;
  const addIce = (pc, c) => { if (!pc) return; if (pc.remoteDescription) pc.addIceCandidate(c).catch(() => {}); else (pc._q = pc._q || []).push(c); };
  const flushIce = pc => { (pc._q || []).forEach(c => pc.addIceCandidate(c).catch(() => {})); pc._q = []; };
  const img = src => { if (!src) return null; let im = R.imgs.get(src); if (!im) { im = new Image(); im.onload = () => paintBoard(); im.src = src; R.imgs.set(src, im); } return im; };

  /* ---- between devices (online.html): a PeerJS link to the teacher's tab carries every channel's messages ----
     The teacher's tab is the hub, as with BroadcastChannel: what one student sends reaches the host and is passed on
     to the others; cameras and microphones keep their own WebRTC connections, with PeerJS's public STUN/TURN servers. */
  const NET = { on: false, peer: null, conns: new Set(), chans: new Map(), host: false, hostId: '', dialT: 0 };
  const ICE_DEF = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }] };
  const ICE = () => NET.on ? (window.peerjs?.util?.defaultConfig || ICE_DEF) : undefined;
  const pid = id => 'mehr8lv-' + String(id).replace(/[^\w-]/g, '');
  function mkChan(name) {
    if (!NET.on) return new BroadcastChannel(name);
    const ch = { onmessage: null, postMessage: m => netOut({ n: name, m }), close: () => { if (NET.chans.get(name) === ch) NET.chans.delete(name); } };
    NET.chans.set(name, ch); return ch;
  }
  function netOut(pk, except) { NET.conns.forEach(c => { if (c !== except && c.open) try { c.send(pk); } catch { /* closing */ } }); }
  function netIn(c, pk) {
    if (!pk || typeof pk.n !== 'string') return;
    if (NET.host) { if (pk.m?.t === 'hello' && pk.m.from) c.key = pk.m.from; netOut(pk, c); }
    NET.chans.get(pk.n)?.onmessage?.({ data: pk.m });
  }
  const redial = () => { clearTimeout(NET.dialT); if (NET.on && !NET.host) NET.dialT = setTimeout(netDial, 3000); };
  function netWire(c) {
    c.on('open', () => { clearTimeout(NET.dialT); NET.conns.add(c); if (!NET.host && R && !R.host) hello(); });
    c.on('data', d => netIn(c, d));
    c.on('close', () => {
      NET.conns.delete(c);
      if (NET.host && c.key && R) { const pk = { n: 'mehr8-live:' + R.x.id, m: { t: 'bye', from: c.key } }; netOut(pk, c); NET.chans.get(pk.n)?.onmessage?.({ data: pk.m }); }
      if (!NET.host) redial();
    });
  }
  function netDial() {
    if (!NET.on || NET.host || !NET.peer || NET.peer.destroyed) return;
    const c = NET.peer.connect(NET.hostId, { reliable: true }); netWire(c);
    NET.dialT = setTimeout(() => { if (!c.open) { c.close(); redial(); } }, 10000);
  }
  function netStart(id, host) {
    return new Promise((ok, no) => {
      if (!window.Peer) return no({ type: 'no-lib' });
      Object.assign(NET, { on: true, host, hostId: pid(id) });
      // Closing the tab frees the room's address on the PeerJS server at once, so a reload can host again.
      addEventListener('pagehide', netStop, { once: true });
      const p = NET.peer = host ? new Peer(NET.hostId) : new Peer();
      const t = setTimeout(() => no({ type: 'timeout' }), 15000);
      p.on('open', () => { clearTimeout(t); if (host) p.on('connection', c => netWire(c)); else netDial(); ok(); });
      p.on('error', e => { if (e.type === 'peer-unavailable') return redial(); if (!p.open) { clearTimeout(t); no(e); } });
      p.on('disconnected', () => { if (NET.on && !p.destroyed) try { p.reconnect(); } catch { /* gone */ } });
    });
  }
  function netStop() {
    clearTimeout(NET.dialT); NET.conns.forEach(c => { try { c.close(); } catch { /* closed */ } });
    try { NET.peer?.destroy(); } catch { /* gone */ }
    Object.assign(NET, { on: false, peer: null, conns: new Set(), chans: new Map(), host: false, hostId: '' });
  }

  async function open(c, o, x, as) {
    if (R) leave(false);
    const host = !as;
    if (o.relay) {
      try { await netStart(x.id, host); }
      catch (e) { netStop(); if (!(o.tryHost && e?.type === 'unavailable-id')) toast(e?.type === 'unavailable-id' ? 'این جلسه همین حالا در زبانه یا دستگاه دیگری باز است.' : 'اتصال به سرور واسط برقرار نشد؛ اینترنت را بررسی کنید و دوباره امتحان کنید.'); return e?.type || 'error'; }
    }
    const me = host ? { key: 'host', name: o.me() } : { key: 's:' + as.id + ':' + rid().slice(0, 4), sid: as.id, name: as.name };
    const main = newSp();
    if (host) {
      if (x.status !== 'live') { x.status = 'live'; x.startedAt = x.startedAt || nowIso(); }
      x.hostAt = Date.now();
      x.cfg = { policy: 'accept', joinMuted: true, askTalk: true, ok: [], kicked: [], ...(x.cfg || {}) }; x.cfg.locks = { cam: false, mic: false, chat: false, notes: false, users: false, ...(x.cfg.locks || {}) };
      x.att = x.att || {}; x.stats = x.stats || {}; x.polls = x.polls || []; x.recs = x.recs || []; x.chat = x.chat || [];
      main.decks = decksOf(x); main.chat = x.chat;
      await Promise.all(main.decks.map(async d => { if (d.pages.some(p => p.bg)) { const bgs = await IDB.get(x.id + ':' + d.id) || []; d.pages.forEach((p, i) => { p.bg = bgs[i] || null; }); } }));
      o.save();
    }
    R = { c, o, x, host, me, cfg: host ? x.cfg : { locks: {}, joinMuted: true, askTalk: true }, main, sp: main, room: null, view: 'board', mainView: 'board', ext: null, notes: host ? x.notes || '' : '', notesBy: '',
      poll: host ? x.polls.find(p => !p.closed) || null : null, myVote: {}, pf: null,
      people: new Map(), pending: new Map(), kicked: new Set(host ? x.cfg.kicked : []), allWrite: false, writers: new Set(), presenter: null,
      hostName: host ? me.name : 'معلم', hostAway: false, hostReact: null, away: false, hand: false, self: null,
      tool: 'pen', color: COLORS[0][0], width: .004, sel: null, undo: [], redo: [], tbFold: false, imgs: new Map(), bgLen: new WeakMap(),
      cam: null, mic: null, screen: null, rCam: null, rScreen: null, peers: new Map(), pc: null, up: null,
      rec: null, recOn: false, timer: null, br: null, visit: null, startedAt: host ? x.startedAt : null, started: Date.now(),
      waiting: !host, side: 'chat', unread: 0, presMin: false, menu: null };
    R.chan = mkChan('mehr8-live:' + x.id);
    R.chan.onmessage = e => onMain(e.data);
    shell(); applyLayout(); setView('board'); renderAll(); R.tickT = setInterval(tick, 1000); R.vadT = setInterval(listen, 200);
    if (host) send({ t: 'host-here' }); else { hello(); try { if (window.Notification?.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* not supported */ } }
    addEventListener('beforeunload', unload); document.addEventListener('keydown', onKey);
  }
  const hello = () => send({ t: 'hello', from: R.me.key, sid: R.me.sid, name: R.me.name });
  const unload = () => { if (!R) return; if (R.host) { R.x.lastAt = Date.now(); R.x.hostAt = 0; persist(); send({ t: 'host-away' }); } else send({ t: 'bye', from: R.me.key }); };

  // Only the host saves; strokes come fast, so saving waits for a quiet moment.
  const saveSoon = () => { if (!R?.host) return; clearTimeout(R.saveT); R.saveT = setTimeout(persist, 700); };
  function persist() {
    if (!R?.host) return; const { x } = R; clearTimeout(R.saveT);
    x.decks = R.main.decks.map(d => ({ id: d.id, name: d.name, pages: d.pages.map(p => ({ s: p.s, bg: !!p.bg })) })); delete x.boards;
    R.main.decks.forEach(d => { if (d.pages.some(p => p.bg) && R.bgLen.get(d) !== d.pages.length) { R.bgLen.set(d, d.pages.length); IDB.set(x.id + ':' + d.id, d.pages.map(p => p.bg || null)); } });
    x.notes = R.notes; x.cfg = R.cfg; R.o.save();
  }

  function shell() {
    const { x, host } = R;
    const el = document.createElement('div'); el.id = 'lv-room'; el.className = 'lv-room'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'کلاس آنلاین: ' + x.title);
    const fb = (act, ic, label, extra = '') => `<button type="button" class="lv-fb" data-lv="${act}" aria-label="${label}" title="${label}" ${extra}>${ic}</button>`;
    el.innerHTML = `<header class="lv-top"><div class="lv-tl"><span class="lv-live">${IC.live} زنده</span>
          <button type="button" class="lv-title" data-lv="details" aria-haspopup="true" aria-expanded="false" title="جزئیات جلسه"><b>${esc(x.title)}</b>${IC.chev}</button>
          ${host ? `<button type="button" class="lv-recbtn" data-lv="rec" aria-pressed="false">${IC.rec}<span>شروع ضبط</span></button>` : `<span class="lv-rec-on" hidden>${IC.rec} در حال ضبط</span>`}</div>
        <div class="lv-talk" role="status" aria-live="polite" hidden>${IC.mic}<span class="lv-talk-l">در حال صحبت:</span><b></b></div>
        <div class="lv-tr">${host ? `<button type="button" class="lv-timer" data-lv="timer-menu" aria-haspopup="true" hidden>${IC.timer}<b class="num"></b></button>` : `<span class="lv-timer" hidden>${IC.timer}<b class="num"></b></span>`}
          <span class="lv-clock num" aria-label="مدت کلاس"></span><span class="lv-count" title="شرکت‌کنندگان">${IC.users}<b class="num"></b></span>
          ${host ? btnIcon('dash', IC.chart, 'داشبورد تحلیل یادگیری') : ''}
          <button type="button" class="lv-leave" data-lv="leave" aria-label="${host ? 'خروج یا پایان کلاس' : 'خروج از کلاس'}" title="${host ? 'خروج یا پایان کلاس' : 'خروج از کلاس'}" ${host ? 'aria-haspopup="true"' : ''}>${IC.leave}</button>
          ${btnIcon('more', IC.more, 'گزینه‌های بیشتر', 'aria-haspopup="true" aria-expanded="false"')}</div></header>
      <div class="lv-body"><div class="lv-main"><div class="lv-strip" aria-label="تصویر شرکت‌کنندگان"></div>
          <div class="lv-stage" aria-label="صفحهٔ کلاس">
            <div class="lv-wait" ${R.waiting ? '' : 'hidden'}><div class="lv-spin" aria-hidden="true"></div><b>منتظر ورود معلم…</b><span class="small">کلاس با ورود معلم خودش باز می‌شود.</span></div>
            <div class="lv-brbar" hidden></div>
            <div class="lv-boardwrap" data-v="board"><canvas class="lv-board" aria-label="تختهٔ کلاس" role="img"></canvas><textarea class="lv-txt" rows="1" hidden aria-label="نوشتن روی تخته"></textarea></div>
            <video class="lv-video" data-v="video" playsinline autoplay muted hidden aria-label="تصویر کلاس"></video>
            <div class="lv-ext" data-v="ext" hidden></div>
            <div class="lv-bt" role="toolbar" aria-label="ابزار تخته" aria-orientation="vertical"></div>
            <div class="lv-flies" aria-hidden="true"></div>
          </div>
          <div class="lv-nav" role="toolbar" aria-label="صفحه‌های ارائه"></div></div>
        <aside class="lv-side" aria-label="پنل کناری"><div class="lv-stabs" role="tablist">
            <button type="button" role="tab" data-side="chat" aria-selected="true">${IC.chat}<span>گفت‌وگو</span><i class="lv-badge" hidden></i></button>
            <button type="button" role="tab" data-side="users" aria-selected="false">${IC.users}<span>کاربران</span><i class="lv-hbadge" hidden></i></button>
            <button type="button" role="tab" data-side="notes" aria-selected="false">${IC.notes}<span>یادداشت</span></button>
            <button type="button" role="tab" data-side="poll" aria-selected="false">${IC.poll}<span>نظرسنجی</span></button></div>
          <div class="lv-spanel" role="tabpanel"></div></aside></div>
      <footer class="lv-ctrls" role="toolbar" aria-label="کنترل‌های کلاس">
        <div class="lv-fg">${host ? fb('plus', IC.plus, 'کارهای ارائه‌دهنده', 'aria-haspopup="true" aria-expanded="false"') : ''}${R.c.link ? `<a class="lv-fb" href="${esc(R.c.link)}" target="_blank" rel="noopener" title="تصویر و صدا از سرور مدرسه" aria-label="سرور مدرسه">${IC.link}</a>` : ''}</div>
        <div class="lv-fg lv-fc">${fb('mic', IC.micOff, 'میکروفون', 'aria-pressed="false"')}${fb('cam', IC.camOff, 'دوربین', 'aria-pressed="false"')}${host ? fb('screen', IC.screen, 'اشتراک صفحه', 'aria-pressed="false"') : ''}${fb('react', IC.emoji, 'واکنش', 'aria-haspopup="true" aria-expanded="false"')}</div>
        <div class="lv-fg">${host ? '' : fb('hand', IC.hand, 'بالا بردن دست', 'aria-pressed="false"')}${fb('pres', IC.present, 'نمایش ارائه', 'aria-pressed="true"')}${fb('side', IC.side, 'پنل کناری', 'aria-pressed="true"')}</div></footer>`;
    document.body.appendChild(el); document.body.classList.add('lv-open');
    el.querySelector('.lv-stabs').addEventListener('keydown', e => {
      const tabs = [...el.querySelectorAll('[data-side]')], i = tabs.indexOf(document.activeElement); if (i < 0) return;
      const j = { ArrowLeft: i + 1, ArrowRight: i - 1, Home: 0, End: tabs.length - 1 }[e.key]; if (j == null) return;
      e.preventDefault(); const t = tabs[(j + tabs.length) % tabs.length]; openSide(t.dataset.side); t.focus();
    });
    el.addEventListener('click', onClick); el.addEventListener('submit', onSubmit); el.addEventListener('input', onInput); el.addEventListener('change', onChange);
    wireBoard();
    R.ro = new ResizeObserver(() => paintBoard()); R.ro.observe($r('.lv-boardwrap'));
    setTimeout(() => (el.querySelector('.lv-ctrls button') || el).focus(), 50);
  }
  function renderAll() { renderTools(); renderNav(); renderSide(); renderBrbar(); renderTiles(); paintBoard(); tick(); }

  function applyLayout() {
    const el = $room(); if (!el) return;
    el.dataset.lay = R.presMin ? 'video' : prefs.layout; el.dataset.fs = prefs.font; el.dataset.th = prefs.theme;
    el.classList.toggle('no-side', !prefs.side); el.classList.toggle('still', !prefs.motion);
    fbState('pres', !R.presMin); fbState('side', prefs.side); renderTiles(); requestAnimationFrame(paintBoard);
  }
  function fbState(k, on, icOn, icOff) {
    const b = $r(`.lv-ctrls [data-lv="${k}"]`); if (!b) return;
    b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', String(!!on)); if (icOn) b.innerHTML = on ? icOn : icOff;
  }

  function tick() {
    if (!R) return; const now = Date.now();
    set('.lv-clock', clock((now - (R.startedAt ? +new Date(R.startedAt) : R.started)) / 1000));
    set('.lv-count b', fa(count()));
    if (prefs.rest && now >= (R.restAt || (R.restAt = now + 20 * 60000))) { R.restAt = now + 20 * 60000; restCard(); }
    if (R.host) set('.lv-recbtn span', R.rec ? 'توقف ضبط ' + clock((now - R.recAt) / 1000) : 'شروع ضبط');
    const tc = $r('.lv-timer'); if (tc) { const t = R.timer; tc.hidden = !t;
      if (t) { const s = t.mode === 'down' ? (t.end - now) / 1000 : (now - t.start) / 1000; tc.querySelector('b').textContent = clock(s); tc.classList.toggle('over', t.mode === 'down' && s <= 0);
        if (t.mode === 'down' && s <= 0 && !t.rang) { t.rang = true; beep(880, .2); setTimeout(() => beep(990, .3), 260); toast('زمان تمام شد.'); } } }
    const until = R.room ? R.room.until : R.host && R.visit != null ? R.br?.until : null;
    if (until) set('.lv-brbar span', `${R.room ? `شما در «${R.room.name}» هستید` : `در حال بازدید از «${R.br.rooms[R.visit].name}»`} · ${clock((until - now) / 1000)} مانده`);
    if (R.br) set('.lv-brclock', clock((R.br.until - now) / 1000));
    if (R.host) {
      if (now - (R.x.hostAt || 0) > 30000) { R.x.hostAt = now; R.o.save(); }
      let ch = false; R.people.forEach(v => { if (v.react && now - v.reactAt > 60000) { v.react = null; ch = true; } });
      if (R.hostReact && now - R.hostReactAt > 60000) { R.hostReact = null; ch = true; }
      if (ch) { sendPeople(); renderSide('users'); }
      if (R.br && now >= R.br.until) endBr();
    }
  }

  // 20-20-20: every 20 minutes, 20 seconds looking at something far away rests the eyes.
  function restCard() {
    $r('.lv-rest')?.remove(); const el = document.createElement('div'); el.className = 'lv-rest'; el.setAttribute('role', 'status');
    el.innerHTML = `<b>استراحت چشم</b><span>۲۰ ثانیه به جایی دور نگاه کن و چند بار پلک بزن.</span><i class="num">${fa(20)}</i>${btnIcon('rest-x', IC.clear, 'بستن')}`;
    $room().appendChild(el); let n = 20; const t = setInterval(() => { n--; if (!el.isConnected || n <= 0) { clearInterval(t); el.remove(); return; } el.querySelector('i').textContent = fa(n); }, 1000);
  }

  /* ---- views of the stage ---- */
  function setView(v) {
    R.view = v; if (!R.room && R.visit == null) R.mainView = v;
    const show = v === 'screen' || v === 'cam' ? 'video' : v;
    document.querySelectorAll('#lv-room [data-v]').forEach(e => { e.hidden = e.dataset.v !== show; });
    const vid = $r('.lv-video');
    if (show === 'video') { const s = v === 'screen' ? (R.host ? R.screen : R.rScreen) : (R.host ? R.cam : R.rCam); if (vid.srcObject !== (s || null)) vid.srcObject = s || null; vid.classList.toggle('mirror', R.host && v === 'cam'); }
    else if (vid) vid.srcObject = null;
    const xv = $r('.lv-ext video'); if (xv && show !== 'ext' && !xv.paused) xv.pause(); if (show === 'ext') syncExt();
    $r('.lv-bt').hidden = show !== 'board'; renderNav(); if (show === 'board') paintBoard();
  }
  // The host changes what everyone sees.
  function hostView(v) { R.mainView = v; if (R.visit == null) setView(v); send({ t: 'view', view: v }); }

  /* ---- board ---- */
  function paintBoard() {
    if (!R) return; const cv = $r('.lv-board'), wrap = $r('.lv-boardwrap'); if (!cv || wrap.hidden || !wrap.clientWidth) return;
    const W = wrap.clientWidth, H = wrap.clientHeight, w = Math.min(W, H * 16 / 9), h = w * 9 / 16, dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    R.bw = w; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pg = curPage(), sel = R.sel && (R.drag?.s || pg?.s.find(s => s.id === R.sel));
    paint(g, pg?.s, w, h, img(pg?.bg), R.sp.vp, { cur: R.cur, swap: R.drag?.s, sel });
  }
  function wireBoard() {
    const cv = $r('.lv-board');
    const pt = e => { const b = cv.getBoundingClientRect(), vp = R.sp.vp; return [+(vp.x + (e.clientX - b.left) / b.width / vp.z).toFixed(4), +(vp.y + (e.clientY - b.top) / b.width / vp.z).toFixed(4)]; };
    cv.addEventListener('pointerdown', e => {
      if (R.view !== 'board' || e.button > 0) return; const p = pt(e), tool = R.tool;
      const grab = () => { try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } };
      if (tool === 'pan') { if (!canNav()) return; R.panning = { sx: e.clientX, sy: e.clientY, vp: { ...R.sp.vp } }; return grab(); }
      if (!mayDraw()) return;
      if (tool === 'text' || tool === 'note') return textAt(p, tool);
      if (tool === 'select') { const s = hitTop(p); R.sel = s?.id || null; if (s) { R.drag = { from: p, orig: s, s }; grab(); } paintBoard(); return; }
      if (tool === 'eraser') { R.erasing = true; eraseAt(p); return grab(); }
      R.cur = { id: rid(), k: tool, c: R.color, w: tool === 'marker' ? Math.max(.012, R.width * 3) : R.width, p: [p], by: R.me.key }; grab();
    });
    cv.addEventListener('pointermove', e => {
      if (R.panning) { const vp = R.sp.vp; vp.x = R.panning.vp.x - (e.clientX - R.panning.sx) / R.bw / vp.z; vp.y = R.panning.vp.y - (e.clientY - R.panning.sy) / R.bw / vp.z; clampVp(vp); return paintBoard(); }
      if (R.erasing) return eraseAt(pt(e));
      if (R.drag) { const p = pt(e); R.drag.s = moved(R.drag.orig, +(p[0] - R.drag.from[0]).toFixed(4), +(p[1] - R.drag.from[1]).toFixed(4)); return paintBoard(); }
      if (!R.cur) return; const p = pt(e);
      if (['line', 'arrow', 'rect', 'ellipse'].includes(R.cur.k)) R.cur.p = [R.cur.p[0], p]; else R.cur.p.push(p);
      paintBoard();
    });
    const up = () => {
      if (R.panning) { R.panning = null; return sendVp(); }
      if (R.erasing) { R.erasing = false; return; }
      if (R.drag) { const d = R.drag; R.drag = null; if (d.s !== d.orig) doOp({ t: 'upd', s: d.s }, { t: 'upd', s: d.orig }); else paintBoard(); return; }
      if (!R.cur) return; const s = R.cur; R.cur = null;
      if (s.p.length > 1 || s.k === 'pen' || s.k === 'marker') doOp({ t: 'add', s }, { t: 'del', id: s.id }); else paintBoard();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (!e.ctrlKey || !canNav() || R.view !== 'board') return; e.preventDefault(); zoom(R.sp.vp.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
    const inp = $r('.lv-txt');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.hidden = true; inp.value = ''; R.txt = null; }
    });
    inp.addEventListener('blur', () => setTimeout(commitText, 120));
  }
  const hitTop = p => { const l = curPage()?.s || []; for (let i = l.length - 1; i >= 0; i--) if (hit(l[i], p, .006 / R.sp.vp.z)) return l[i]; return null; };
  function eraseAt(p) { (curPage()?.s || []).filter(s => hit(s, p, .008 / R.sp.vp.z)).forEach(s => doOp({ t: 'del', id: s.id }, { t: 'add', s })); }
  function textAt(p, kind) {
    const inp = $r('.lv-txt'), cv = $r('.lv-board'), b = cv.getBoundingClientRect(), wb = $r('.lv-boardwrap').getBoundingClientRect(), vp = R.sp.vp;
    commitText(); R.txt = { p, kind }; inp.hidden = false; inp.value = ''; inp.classList.toggle('note', kind === 'note');
    inp.style.top = (b.top - wb.top + (p[1] - vp.y) * vp.z * b.width) + 'px'; inp.style.right = Math.max(0, wb.right - (b.left + (p[0] - vp.x) * vp.z * b.width)) + 'px';
    inp.placeholder = kind === 'note' ? 'یادداشت را بنویسید' : 'بنویسید و Enter بزنید'; inp.focus();
  }
  function commitText() {
    const inp = R && $r('.lv-txt'); if (!inp || inp.hidden || !R.txt) return; const s = inp.value.trim(), { p, kind } = R.txt; R.txt = null; inp.hidden = true; inp.value = '';
    if (s) { const st = kind === 'note' ? { id: rid(), k: 'note', x: p[0], y: p[1], s, by: R.me.key } : { id: rid(), k: 'text', x: p[0], y: p[1], s, c: R.color === '#ffffff' ? '#1f2937' : R.color, w: .032, by: R.me.key }; doOp({ t: 'add', s: st }, { t: 'del', id: st.id }); }
  }
  // Every change to a page is an operation: done here, sent to the others, and kept for undo.
  function doOp(op, inv, rec = true) {
    const sp = R.sp, m = { ...op, d: sp.deck, p: sp.page, from: R.me.key };
    applyOp(sp, m); spSend(m);
    if (rec) { R.undo.push({ op: m, inv: { ...inv, d: m.d, p: m.p } }); if (R.undo.length > 100) R.undo.shift(); R.redo = []; }
  }
  function applyOp(sp, m) {
    const pg = pageOf(sp, m.d, m.p); if (!pg) return;
    if (m.t === 'add') { if (!pg.s.some(s => s.id === m.s.id)) pg.s.push(m.s); }
    else if (m.t === 'del') pg.s = pg.s.filter(s => s.id !== m.id);
    else if (m.t === 'upd') { const i = pg.s.findIndex(s => s.id === m.s.id); if (i >= 0) pg.s[i] = m.s; }
    else if (m.t === 'set') pg.s = m.s.slice();
    if (sp === R.sp && m.d === sp.deck && m.p === sp.page) { if (R.sel && !pg.s.some(s => s.id === R.sel)) R.sel = null; paintBoard(); }
    if (R.host && sp === R.main) saveSoon();
  }
  function undo(redo) {
    if (!mayDraw()) return; const a = (redo ? R.redo : R.undo).pop(); if (!a) return;
    const m = { ...(redo ? a.op : a.inv), from: R.me.key }; applyOp(R.sp, m); spSend(m); (redo ? R.undo : R.redo).push(a);
  }
  async function clearPage() {
    const pg = curPage(); if (!pg?.s.length) return;
    if (!await UI.ask('پاک کردن صفحه', 'همهٔ نوشته‌های این صفحه پاک شود؟', 'پاک کن')) return;
    doOp({ t: 'set', s: [] }, { t: 'set', s: pg.s.slice() });
  }
  function setTool(t) { if (t === 'pan' && !canNav()) return; commitText(); R.tool = t; if (t !== 'select') R.sel = null; renderTools(); paintBoard(); }
  function goPage(d, p) { const sp = R.sp; if (!canNav() || !sp.decks[d]?.pages[p]) return; const m = { t: 'page', d, p, from: R.me.key }; applyPage(sp, m); spSend(m); }
  function applyPage(sp, m) {
    if (!sp.decks[m.d]?.pages[m.p]) return; sp.deck = m.d; sp.page = m.p; sp.vp = { z: 1, x: 0, y: 0 };
    if (sp === R.sp) { R.sel = null; paintBoard(); renderNav(); }
  }
  function addPage() { const sp = R.sp, m = { t: 'pg-add', d: sp.deck, at: sp.page + 1, from: R.me.key }; applyPgAdd(sp, m); spSend(m); goPage(sp.deck, m.at); }
  function applyPgAdd(sp, m) { sp.decks[m.d]?.pages.splice(m.at, 0, { s: [] }); if (sp === R.sp) renderNav(); if (R.host && sp === R.main) saveSoon(); }
  function zoom(z) {
    const vp = R.sp.vp, cx = vp.x + .5 / vp.z, cy = vp.y + .28125 / vp.z; vp.z = Math.max(1, Math.min(4, +z.toFixed(2)));
    vp.x = cx - .5 / vp.z; vp.y = cy - .28125 / vp.z; clampVp(vp); paintBoard(); renderNav(); sendVp();
  }
  const sendVp = () => { if (R.sp === R.main && canNav()) send({ t: 'vp', vp: R.sp.vp, from: R.me.key }); };

  function renderTools() {
    const bt = $r('.lv-bt'); if (!bt) return; const can = mayDraw(); bt.classList.toggle('off', !can);
    if (!can) { bt.innerHTML = ''; return; }
    if (R.tool === 'pan' && !canNav()) R.tool = 'pen';
    const pres = R.host || R.presenter === R.me.key || R.sp !== R.main, tb = (k, ic, l, extra = '') => `<button type="button" class="lv-tool" data-lv="${k}" aria-label="${l}" title="${l}" ${extra}>${ic}</button>`;
    bt.innerHTML = (R.tbFold ? '' : TOOLS.filter(([k]) => k !== 'pan' || canNav()).map(([k, l, key]) => `<button type="button" class="lv-tool ${R.tool === k ? 'on' : ''}" data-tool="${k}" aria-pressed="${R.tool === k}" aria-label="${l}" title="${l} (${key})">${IC[k]}</button>`).join('')
      + `<span class="lv-sep"></span>${tb('palette', `<i class="lv-dotc" style="--c:${R.color}"></i>`, 'رنگ و ضخامت', 'aria-haspopup="true" aria-expanded="false"')}${tb('undo', IC.undo, 'برگرداندن (Ctrl+Z)')}${tb('redo', IC.redo, 'انجام دوباره (Ctrl+Y)')}`
      + (pres ? tb('clear', IC.trash, 'پاک کردن صفحه') : '')
      + (R.host && R.sp === R.main ? `<button type="button" class="lv-tool ${R.allWrite ? 'on' : ''}" data-lv="multi" aria-pressed="${R.allWrite}" aria-label="تختهٔ چندکاربره" title="تختهٔ چندکاربره">${IC.users}</button>` : ''))
      + tb('tb-fold', R.tbFold ? IC.pen : IC.chevUp, R.tbFold ? 'باز کردن ابزار' : 'جمع کردن ابزار', `aria-expanded="${!R.tbFold}"`);
  }
  function renderNav() {
    const nv = $r('.lv-nav'); if (!nv) return; const sp = R.sp, d = sp.decks[sp.deck], n = d?.pages.length || 1, can = canNav(), kind = d?.pages.some(p => p.bg) ? 'اسلاید' : 'صفحه';
    nv.hidden = R.view !== 'board';
    nv.innerHTML = `<div class="lv-nz">${btnIcon('min', IC.min, 'کوچک کردن ارائه')}${can ? `${btnIcon('fit', IC.fit, 'اندازهٔ کامل')}${btnIcon('zoom-out', IC.minus, 'کوچک‌نمایی', sp.vp.z <= 1 ? 'disabled' : '')}<span class="num lv-zp">${fa(Math.round(sp.vp.z * 100))}٪</span>${btnIcon('zoom-in', IC.plus, 'بزرگ‌نمایی', sp.vp.z >= 4 ? 'disabled' : '')}` : ''}</div>
      <div class="lv-np">${can ? `${btnIcon('pg-prev', IC.prev, 'صفحهٔ قبل', sp.page ? '' : 'disabled')}<select id="lv-pgsel" class="lv-pgsel" aria-label="رفتن به صفحه">${d.pages.map((_, i) => `<option value="${i}" ${i === sp.page ? 'selected' : ''}>${kind} ${fa(i + 1)}</option>`).join('')}</select>${btnIcon('pg-next', IC.next, 'صفحهٔ بعد', sp.page < n - 1 ? '' : 'disabled')}${btnIcon('pg-add', IC.plus, 'صفحهٔ تازه')}`
        : `<span class="lv-pgl num">${kind} ${fa(sp.page + 1)} از ${fa(n)}</span>`}</div>
      <div class="lv-nd">${R.host && sp === R.main ? `<button type="button" class="lv-deckbtn" data-lv="pres-mgr" title="ارائه‌ها">${IC.slide}<span>${esc(d.name)}</span></button>` : `<span class="lv-deckname">${esc(d?.name || '')}</span>`}</div>`;
  }

  /* ---- menus ---- */
  function menu(btn, items, opts = {}) {
    closeMenu();
    const list = items.filter(Boolean), m = document.createElement('div'); m.className = 'lv-menu ' + (opts.cls || ''); m.setAttribute('role', 'menu');
    m.innerHTML = (opts.head || '') + list.map((it, i) => it === '-' ? '<hr>' : `<button type="button" role="${it.check != null ? 'menuitemcheckbox' : 'menuitem'}" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.check != null ? `aria-checked="${!!it.check}"` : ''} ${it.emo ? `aria-label="${esc(it.label)}" title="${esc(it.label)}"` : ''}>${it.emo ? `<span class="lv-emo">${it.emo}</span>` : `${it.ic || ''}<span>${esc(it.label)}</span>${it.check != null ? `<i class="lv-sw ${it.check ? 'on' : ''}" aria-hidden="true"></i>` : ''}`}</button>`).join('');
    $room().appendChild(m);
    const b = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    let top = b.bottom + 6; if (top + mh > innerHeight - 8) top = Math.max(8, b.top - mh - 6);
    let left = b.right - mw; if (left < 8) left = Math.min(b.left, innerWidth - 8 - mw); left = Math.max(8, left);
    m.style.top = top + 'px'; m.style.left = left + 'px';
    m.addEventListener('click', e => { const h = e.target.closest('[data-h]'); if (h) return opts.onHead?.(h); const x = e.target.closest('[data-i]'); if (!x) return; const it = list[+x.dataset.i]; closeMenu(); it.run(); });
    m.addEventListener('keydown', e => {
      const bs = [...m.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length]?.focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); btn.focus(); }
    });
    R.menu = { m, btn }; btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => m.querySelector('button')?.focus(), 0);
  }
  function closeMenu() { if (!R?.menu) return; R.menu.m.remove(); R.menu.btn.setAttribute('aria-expanded', 'false'); R.menu = null; }

  function detailsMenu(b) {
    const x = R.x, pres = R.presenter ? (R.people.get(R.presenter)?.name || (R.presenter === R.me.key ? R.me.name : '')) : R.hostName;
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    menu(b, R.c.link ? [{ ic: IC.link, label: 'تصویر و صدا از سرور مدرسه', run: () => window.open(R.c.link, '_blank', 'noopener') }] : [], { cls: 'wide', head: `<div class="lv-mhead"><b>${esc(x.title)}</b><dl class="lv-dl">${row('درس', esc(R.o.sub))}${row('کلاس', esc(clsName(R.o, x.cls)))}${row('معلم', esc(R.hostName))}${row('ارائه‌دهنده', esc(pres || R.hostName))}${row('شروع', tm(R.startedAt))}${row('شرکت‌کنندگان', fa(count()))}${row('ضبط', (R.host ? R.rec : R.recOn) ? 'در حال ضبط' : 'خاموش')}</dl></div>` });
  }
  function moreMenu(b) {
    menu(b, [{ ic: IC.away, label: 'حاضر هستم', check: !R.away, run: () => setAway(!R.away) }, '-',
      { ic: IC.full, label: document.fullscreenElement ? 'خروج از تمام‌صفحه' : 'برنامهٔ تمام‌صفحه', run: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => toast('تمام‌صفحه در دسترس نیست.')) },
      { ic: IC.gear, label: 'تنظیمات', run: settingsModal }, { ic: IC.info, label: 'دربارهٔ کلاس آنلاین', run: aboutModal }, { ic: IC.help, label: 'کمک', run: helpModal },
      { ic: IC.kbd, label: 'میان‌برهای صفحه‌کلید', run: keysModal }, { ic: IC.layout, label: 'مدیریت چیدمان', run: layoutModal }]);
  }
  function plusMenu(b) {
    menu(b, [{ ic: IC.upload, label: 'بارگذاری و مدیریت ارائه‌ها', run: presModal },
      { ic: IC.poll, label: 'نظرسنجی و آزمونک', run: () => { if (R.poll?.closed) { R.poll = null; send({ t: 'poll', poll: null }); } openSide('poll'); } },
      { ic: IC.film, label: R.ext ? 'توقف ویدیوی خارجی' : 'همرسانی ویدیوی خارجی', run: () => R.ext ? stopExt() : extModal() },
      { ic: IC.timer, label: 'شمارش معکوس / زمان‌سنج', run: timerModal },
      { ic: IC.cam, label: R.mainView === 'cam' ? 'توقف نمایش دوربین به‌عنوان محتوا' : 'همرسانی دوربین به‌عنوان محتوا', run: camContent }]);
  }
  function gearMenu(b) {
    const c = R.cfg;
    menu(b, [{ ic: IC.micOff, label: 'پیوستن کاربران با میکروفون خاموش', check: c.joinMuted, run: () => { c.joinMuted = !c.joinMuted; cfgChanged(); } },
      { ic: IC.hand, label: 'صحبت دانش‌آموزان فقط با اجازهٔ معلم', check: c.askTalk, run: () => { c.askTalk = !c.askTalk; cfgChanged(); } },
      { ic: IC.micOff, label: 'خاموش کردن میکروفون همه به جز ارائه‌دهنده', run: () => { send({ t: 'mute', all: true, except: R.presenter }); R.people.forEach((v, k) => { if (k !== R.presenter) v.talk = false; }); sendPeople(); renderSide('users'); toast('میکروفون همه خاموش شد.'); } },
      { ic: IC.lock, label: 'قفل کردن کاربران', run: locksModal }, { ic: IC.guest, label: 'سیاست پذیرش مهمان', run: policyModal },
      { ic: IC.dl, label: 'ذخیرهٔ نام‌های کاربری', run: () => namesCsv(R.x, R.o) },
      { ic: IC.clear, label: 'پاک کردن همهٔ واکنش‌ها', run: () => { R.people.forEach(v => { v.react = null; v.hand = 0; }); R.hostReact = null; sendPeople(); renderSide('users'); toast('واکنش‌ها و دست‌ها پاک شد.'); } }, '-',
      { ic: IC.door, label: R.br ? 'مدیریت اتاق‌های جانبی' : 'ایجاد اتاق‌های جانبی', run: () => R.br ? openSide('users') : brModal() },
      { ic: IC.chart, label: 'داشبورد تحلیل یادگیری', run: () => dashboard(R.x, R.o) }]);
  }
  function userMenu(b, key) {
    const v = R.people.get(key); if (!v) return;
    menu(b, [{ ic: IC.present, label: R.presenter === key ? 'پس گرفتن ارائه' : 'ارائه‌دهنده کن', run: () => { R.presenter = R.presenter === key ? null : key; sendPeople(); renderTools(); renderNav(); renderSide('users'); } },
      v.sid && R.o.data && typeof Behavior !== 'undefined' && { ic: IC.star, label: 'امتیاز رفتاری', run: () => Behavior.giveModal(R.o.data(), [v.sid], { sub: R.o.sub, by: R.me.name, save: R.o.save,
        after: l => l.forEach(e => send({ t: 'praise', to: key, k: e.k, v: e.v, sub: e.sub })) }) },
      { ic: IC.pen, label: 'اجازهٔ نوشتن روی تخته', check: R.writers.has(v.sid), run: () => { R.writers.has(v.sid) ? R.writers.delete(v.sid) : R.writers.add(v.sid); sendPeople(); renderSide('users'); } },
      R.cfg.askTalk && { ic: IC.mic, label: 'اجازهٔ صحبت', check: !!v.talk, run: () => giveTalk(key, !v.talk) },
      v.mic && { ic: IC.micOff, label: 'خاموش کردن میکروفون', run: () => { v.talk = false; send({ t: 'mute', to: key }); sendPeople(); } },
      v.hand && { ic: IC.hand, label: 'پایین آوردن دست', run: () => { v.hand = 0; sendPeople(); renderSide('users'); } }, '-',
      { ic: IC.userx, label: 'بیرون کردن از کلاس', danger: true, run: async () => {
        if (!await UI.ask('بیرون کردن از کلاس', `${v.name} از این جلسه بیرون شود؟ تا پایان جلسه نمی‌تواند برگردد.`, 'بیرون کن')) return;
        R.kicked.add(v.sid); R.cfg.kicked = [...R.kicked]; send({ t: 'kick', to: key }); depart(key); sendPeople(); renderSide('users'); renderTiles(); saveSoon(); } }],
      { head: `<div class="lv-mhead"><b>${esc(v.name)}</b></div>` });
  }
  // Talking needs the teacher's go-ahead: granting lowers the hand and turns the student's mic on; taking it back mutes it.
  function giveTalk(key, on) {
    const v = R.people.get(key); if (!v) return; v.talk = on; if (on) v.hand = 0;
    send({ t: 'talk', to: key, on }); sendPeople(); renderSide('users');
  }
  function chatMenu(b) {
    const sp = R.sp, lines = () => sp.chat.map(m => m.sys ? `— ${m.text}` : `[${tm(m.at)}] ${m.who}: ${m.text}`).join('\r\n');
    menu(b, [{ ic: IC.dl, label: 'ذخیرهٔ گفت‌وگو', run: () => download(`گفت‌وگو-${R.x.title}.txt`, lines()) },
      { ic: IC.copy, label: 'رونوشت گفت‌وگو', run: () => navigator.clipboard?.writeText(lines()).then(() => toast('گفت‌وگو رونوشت شد.'), () => toast('رونوشت ممکن نشد.')) },
      R.host && { ic: IC.trash, label: 'پاک کردن گفت‌وگو', danger: true, run: async () => { if (!await UI.ask('پاک کردن گفت‌وگو', 'همهٔ پیام‌ها برای همه پاک شود؟', 'پاک کن')) return; sp.chat.length = 0; spSend({ t: 'chat-clear' }); renderSide('chat'); saveSoon(); } }]);
  }
  function reactMenu(b) {
    menu(b, [...REACTS.map(([e, l]) => ({ emo: e, label: l, run: () => react(e) })), (R.host ? R.hostReact : R.self?.react) && { ic: IC.clear, label: 'برداشتن واکنش', run: () => react(null) }], { cls: 'emo' });
  }
  function palette(b) {
    menu(b, [], { cls: 'pal', head: `<div class="lv-pal" role="group" aria-label="رنگ">${COLORS.map(([c, l]) => `<button type="button" class="lv-color ${R.color === c ? 'on' : ''}" data-h="c" data-v="${c}" style="--c:${c}" aria-label="${l}" title="${l}" aria-pressed="${R.color === c}"></button>`).join('')}</div>
      <div class="lv-wid" role="group" aria-label="ضخامت">${WIDTHS.map(([l, w]) => `<button type="button" class="${R.width === w ? 'on' : ''}" data-h="w" data-v="${w}" aria-pressed="${R.width === w}"><i style="height:${Math.max(2, Math.round(w * 700))}px"></i>${l}</button>`).join('')}</div>`,
    onHead: el => {
      if (el.dataset.h === 'c') { R.color = el.dataset.v; if (['eraser', 'pan'].includes(R.tool)) R.tool = 'pen';
        const s = R.sel && curPage()?.s.find(x => x.id === R.sel); if (s && s.k !== 'note' && s.k !== 'poll') doOp({ t: 'upd', s: { ...s, c: R.color } }, { t: 'upd', s }); }
      else R.width = +el.dataset.v;
      closeMenu(); renderTools();
    } });
  }

  /* ---- modals of the room ---- */
  const cfgChanged = () => { saveSoon(); send({ t: 'cfg', cfg: pubCfg() }); renderSide(); };
  const pubCfg = () => ({ locks: R.cfg.locks, joinMuted: R.cfg.joinMuted, askTalk: R.cfg.askTalk });
  function locksModal() {
    modal(`<h2>قفل کردن کاربران</h2><fieldset class="lv-fs"><legend>بستن برای دانش‌آموزان</legend>${LOCKS.map(([k, l]) => `<label class="lv-chk"><input type="checkbox" data-k="${k}" ${R.cfg.locks[k] ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-lok">اعمال</button><button class="btn" data-close>انصراف</button></div>`, root => {
      root.querySelector('#lv-lok').onclick = () => { root.querySelectorAll('[data-k]').forEach(i => { R.cfg.locks[i.dataset.k] = i.checked; }); cfgChanged(); close(); toast('قفل‌ها اعمال شد.'); };
    });
  }
  function policyModal() {
    const P = [['accept', 'همیشه بپذیر'], ['ask', 'از معلم بپرس'], ['deny', 'همیشه رد کن']];
    modal(`<h2>سیاست پذیرش مهمان</h2><fieldset class="lv-fs"><legend>ورود دانش‌آموز تازه</legend>${P.map(([k, l]) => `<label class="lv-chk"><input type="radio" name="lv-pol" value="${k}" ${R.cfg.policy === k ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-pok">اعمال</button><button class="btn" data-close>انصراف</button></div>`, root => {
      root.querySelector('#lv-pok').onclick = () => { R.cfg.policy = root.querySelector('[name=lv-pol]:checked').value; cfgChanged(); close(); toast('سیاست پذیرش ذخیره شد.'); };
    });
  }
  function timerModal() {
    modal(`<h2>شمارش معکوس / زمان‌سنج</h2><fieldset class="lv-fs"><legend>نوع</legend><label class="lv-chk"><input type="radio" name="lv-tm" value="down" checked> شمارش معکوس</label><label class="lv-chk"><input type="radio" name="lv-tm" value="up"> زمان‌سنج</label></fieldset>
      <div class="grid g2" id="lv-tdur" style="gap:0 12px"><label class="field"><span>دقیقه</span><input class="input" type="number" id="lv-tmn" min="0" max="180" value="5"></label><label class="field"><span>ثانیه</span><input class="input" type="number" id="lv-tsc" min="0" max="59" value="0"></label></div>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-tok">شروع</button>${R.timer ? '<button class="btn" id="lv-tstop">توقف</button>' : ''}<button class="btn" data-close>انصراف</button></div>`, root => {
      root.querySelectorAll('[name=lv-tm]').forEach(r => r.onchange = () => { root.querySelector('#lv-tdur').style.display = root.querySelector('[name=lv-tm]:checked').value === 'up' ? 'none' : ''; });
      root.querySelector('#lv-tok').onclick = () => { const mode = root.querySelector('[name=lv-tm]:checked').value, s = (+root.querySelector('#lv-tmn').value || 0) * 60 + (+root.querySelector('#lv-tsc').value || 0);
        if (mode === 'down' && s <= 0) return UI.invalid('#lv-tmn', 'زمان را بنویسید.'); setTimer(mode === 'down' ? { mode, end: Date.now() + s * 1000 } : { mode, start: Date.now() }); close(); };
      root.querySelector('#lv-tstop')?.addEventListener('click', () => { setTimer(null); close(); });
    });
  }
  const setTimer = t => { R.timer = t; send({ t: 'timer', timer: t }); tick(); };
  function settingsModal() {
    modal(`<h2>تنظیمات</h2><fieldset class="lv-fs"><legend>اندازهٔ نوشته‌های گفت‌وگو و یادداشت</legend>${[['s', 'کوچک'], ['n', 'معمولی'], ['l', 'بزرگ']].map(([k, l]) => `<label class="lv-chk"><input type="radio" name="lv-fsz" value="${k}" ${prefs.font === k ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
      <fieldset class="lv-fs"><legend>راحتی چشم</legend>${[['dark', 'تیرهٔ ملایم'], ['light', 'روشن گرم']].map(([k, l]) => `<label class="lv-chk"><input type="radio" name="lv-th" value="${k}" ${prefs.theme === k ? 'checked' : ''}> رنگ کلاس: ${l}</label>`).join('')}
        ${[['paper', 'کاغذی'], ['white', 'سفید']].map(([k, l]) => `<label class="lv-chk"><input type="radio" name="lv-bd" value="${k}" ${prefs.board === k ? 'checked' : ''}> رنگ تخته: ${l}</label>`).join('')}
        <label class="lv-chk"><input type="checkbox" id="lv-pr" ${prefs.rest ? 'checked' : ''}> یادآور استراحت چشم هر ۲۰ دقیقه</label></fieldset>
      <fieldset class="lv-fs"><legend>اعلان و نمایش</legend><label class="lv-chk"><input type="checkbox" id="lv-ps" ${prefs.sound ? 'checked' : ''}> صدای اعلان</label>
        <label class="lv-chk"><input type="checkbox" id="lv-pm" ${prefs.motion ? 'checked' : ''}> جلوه‌های حرکتی واکنش‌ها</label>
        <label class="lv-chk"><input type="checkbox" id="lv-pv" ${prefs.saver ? 'checked' : ''}> صرفه‌جویی در اینترنت: نمایش ندادن تصویر وبکم دیگران</label></fieldset>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-sok">ذخیره</button><button class="btn" data-close>انصراف</button></div>`, root => {
      root.querySelector('#lv-sok').onclick = () => { prefs.font = root.querySelector('[name=lv-fsz]:checked').value; prefs.sound = root.querySelector('#lv-ps').checked; prefs.motion = root.querySelector('#lv-pm').checked; prefs.saver = root.querySelector('#lv-pv').checked;
        prefs.theme = root.querySelector('[name=lv-th]:checked').value; prefs.board = root.querySelector('[name=lv-bd]:checked').value; prefs.rest = root.querySelector('#lv-pr').checked; R.imgs.clear();
        savePrefs(); applyLayout(); close(); toast('تنظیمات ذخیره شد.'); };
    });
  }
  function layoutModal() {
    const L = [['smart', 'چیدمان هوشمند'], ['pres', 'تمرکز روی ارائه'], ['video', 'تمرکز روی تصویر']];
    modal(`<h2>مدیریت چیدمان</h2><div class="lv-lays" role="radiogroup" aria-label="چیدمان">${L.map(([k, l]) => `<label class="lv-lay"><input type="radio" name="lv-lay" value="${k}" ${prefs.layout === k ? 'checked' : ''}><span class="lv-lpic lp-${k}" aria-hidden="true"><i></i><i></i><i></i></span><b>${l}</b></label>`).join('')}</div>
      <label class="lv-chk"><input type="checkbox" id="lv-lside" ${prefs.side ? 'checked' : ''}> پنل کناری</label>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-lok">اعمال</button><button class="btn" data-close>انصراف</button></div>`, root => {
      root.querySelector('#lv-lok').onclick = () => { prefs.layout = root.querySelector('[name=lv-lay]:checked').value; prefs.side = root.querySelector('#lv-lside').checked; R.presMin = false; savePrefs(); applyLayout(); close(); };
    });
  }
  function aboutModal() {
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    modal(`<h2>دربارهٔ کلاس آنلاین</h2><dl class="lv-dl lv-dlm">${row('برنامه', 'کلاس آنلاین سامانهٔ جامع مدرسه')}${row('نسخه', '۲٫۰ · آبان ۱۴۰۵')}
      ${row('امکانات', 'تخته و ارائه، تصویر و صدا، اشتراک صفحه، ویدیوی خارجی، گفت‌وگو، یادداشت همرسانده، نظرسنجی و آزمونک، اتاق‌های جانبی، ضبط و نمایش، داشبورد یادگیری')}
      ${row('تصویر و صدا', R.c.link ? `<a href="${esc(R.c.link)}" target="_blank" rel="noopener">سرور مدرسه</a> و همین مرورگر` : 'همین مرورگر')}</dl><div class="row" style="margin-top:14px"><button class="btn" data-close>بستن</button></div>`);
  }
  function helpModal() {
    const H = R.host ? [['تخته و ارائه', 'ابزارها کنار صفحه‌اند؛ صفحه‌ها و بزرگ‌نمایی زیر صفحه. PDF یا عکس را از «+» › «بارگذاری و مدیریت ارائه‌ها» بیاورید؛ روی هر اسلاید می‌شود نوشت.'],
      ['کاربران', 'از چرخ‌دندهٔ «کاربران»: قفل، پذیرش، خاموش کردن میکروفون‌ها، اتاق‌های جانبی و داشبورد. با «⋯» کنار هر نام، ارائه یا اجازهٔ نوشتن بدهید.'],
      ['ضبط', '«شروع ضبط» صفحهٔ کلاس، دوربین و صدای کلاس را ضبط می‌کند؛ پس از پایان از صفحهٔ درس قابل نمایش و ذخیره است.']]
      : [['ورود', 'اگر معلم هنوز نیامده، صفحه منتظر می‌ماند و خودش باز می‌شود.'], ['سؤال', 'دست را بالا ببرید یا در گفت‌وگو بنویسید؛ معلم می‌بیند.'], ['تخته', 'اگر معلم اجازه بدهد، ابزارهای تخته کنار صفحه ظاهر می‌شوند.']];
    modal(`<h2>کمک</h2>${H.map(([t, d]) => `<h3 class="lv-h3">${t}</h3><p>${d}</p>`).join('')}<div class="row" style="margin-top:14px"><button class="btn" data-close>بستن</button></div>`);
  }
  function keysModal() {
    const K = [['Alt + M', 'میکروفون'], ['Alt + C', 'دوربین'], ['Alt + H', 'بالا/پایین بردن دست'], ['Alt + R', 'واکنش'], ['Alt + U', 'کاربران'], ['Alt + G', 'گفت‌وگو'],
      ['V / H / P / M / E', 'انتخاب، جابه‌جایی، قلم، ماژیک، پاک‌کن'], ['A / L / T / N / R / O', 'پیکان، خط، متن، یادداشت چسبان، مستطیل، بیضی'],
      ['Ctrl + Z / Ctrl + Y', 'برگرداندن / انجام دوباره'], ['Delete', 'حذف شکل انتخاب‌شده'], ['← / →', 'صفحهٔ بعد / قبل'], ['+ / − / 0', 'بزرگ‌نمایی، کوچک‌نمایی، اندازهٔ کامل']];
    modal(`<h2>میان‌برهای صفحه‌کلید</h2><div class="table-wrap"><table><tr><th>کلید</th><th>کار</th></tr>${K.map(([k, d]) => `<tr><td dir="ltr" class="lv-kbd"><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table></div><div class="row" style="margin-top:14px"><button class="btn" data-close>بستن</button></div>`);
  }

  /* ---- presentations (host) ---- */
  const courseFiles = re => (R.c.items || []).filter(i => i.type === 'file').flatMap(i => (i.files || []).map(f => ({ ...f, item: i.title }))).filter(f => re.test(f.type || '') || re.test(f.name));
  const readURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
  const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
  async function shrink(src, max = 1600) {
    const im = await loadImg(src), r = Math.min(1, max / im.naturalWidth), cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * r); cv.height = Math.round(im.naturalHeight * r);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', .85);
  }
  async function pdfPages(buf, onPage) {
    await UI.loadScript(PDFJS); const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = PDFJS_W;
    const doc = await lib.getDocument({ data: buf, isEvalSupported: false }).promise, out = [];
    for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
      const pg = await doc.getPage(i), v = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 1600 / v.width }), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); await pg.render({ canvasContext: g, viewport: vp }).promise; out.push(cv.toDataURL('image/jpeg', .82)); onPage?.(i, doc.numPages);
    }
    return out;
  }
  const importFile = async (f, onPage) => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? pdfPages(await f.arrayBuffer(), onPage) : [await shrink(await readURL(f))];
  function presModal() {
    const decks = R.main.decks, files = courseFiles(/^image\/|^application\/pdf|\.(png|jpe?g|gif|webp|pdf)$/i);
    modal(`<h2>بارگذاری و مدیریت ارائه‌ها</h2>
      <ul class="lv-decks">${decks.map((d, i) => `<li class="${i === R.main.deck ? 'cur' : ''}">${IC.slide}<b>${esc(d.name)}</b><span class="small muted">${fa(d.pages.length)} صفحه</span>
        ${i === R.main.deck ? '<span class="tag ok">در حال نمایش</span>' : `<button type="button" class="btn sm" data-dk="show" data-i="${i}">نمایش</button>`}${i ? `<button type="button" class="btn sm danger" data-dk="del" data-i="${i}" aria-label="حذف ${esc(d.name)}">حذف</button>` : ''}</li>`).join('')}</ul>
      <label class="field"><span>بارگذاری PDF یا عکس</span><input class="input" type="file" id="lv-up" accept="image/*,application/pdf,.pdf" multiple></label>
      ${files.length ? `<h3 class="lv-h3">از فایل‌های این درس</h3><div class="lv-files">${files.map((f, i) => `<button type="button" class="lv-file" data-f="${i}"><b>${esc(f.name)}</b><span class="small muted">${esc(f.item)}</span></button>`).join('')}</div>` : ''}
      <p class="lv-busy" role="status" hidden></p>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>بستن</button></div>`, root => {
      const busy = t => { const p = root.querySelector('.lv-busy'); p.hidden = !t; p.textContent = t || ''; root.querySelectorAll('button, input').forEach(x => { x.disabled = !!t; }); };
      const prog = (i, n) => busy(`آماده‌سازی صفحهٔ ${fa(i)} از ${fa(n)}…`);
      root.addEventListener('click', async e => {
        const b = e.target.closest('[data-dk]');
        if (b) { const i = +b.dataset.i; if (b.dataset.dk === 'show') { showDeck(i); close(); } else if (await UI.ask('حذف ارائه', `«${decks[i].name}» حذف شود؟`, 'حذف کن')) { removeDeck(i); presModal(); } return; }
        const f = e.target.closest('[data-f]'); if (!f) return; const x = files[+f.dataset.f]; busy('در حال آماده‌سازی…');
        try { const blob = await (await fetch(x.data)).blob(); if (await addDeck(x.name, [new File([blob], x.name, { type: x.type || blob.type })], prog)) close(); else busy(''); } catch { busy(''); toast('این فایل باز نشد.'); }
      });
      root.querySelector('#lv-up').onchange = async e => {
        const fl = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'fa', { numeric: true })); if (!fl.length) return;
        if (fl.some(f => f.size > 25 * 1048576)) return toast('هر فایل باید کمتر از ۲۵ مگابایت باشد.');
        busy('در حال آماده‌سازی…'); if (await addDeck(fl.length === 1 ? fl[0].name : 'عکس‌ها', fl, prog)) close(); else busy('');
      };
    });
  }
  async function addDeck(name, files, onPage) {
    let bgs = [];
    for (const f of files) { try { bgs = bgs.concat(await importFile(f, onPage)); } catch { toast(/pdf/i.test(f.type || f.name) ? 'PDF باز نشد؛ برای خواندن PDF اتصال اینترنت لازم است.' : 'این فایل باز نشد.'); } }
    if (!R || !bgs.length) return false;
    const d = { id: rid(), name: name.replace(/\.[^.]+$/, ''), pages: bgs.map(bg => ({ bg, s: [] })) };
    R.main.decks.push(d); showDeck(R.main.decks.length - 1); toast(`«${d.name}» با ${fa(bgs.length)} صفحه آماده شد.`); return true;
  }
  function showDeck(i) {
    const m = R.main; m.deck = i; m.page = 0; m.vp = { z: 1, x: 0, y: 0 }; send({ t: 'decks', decks: m.decks, d: i, p: 0 }); persist();
    if (R.sp === m) { R.sel = null; paintBoard(); renderNav(); } hostView('board');
  }
  function removeDeck(i) {
    const m = R.main, [d] = m.decks.splice(i, 1); IDB.del(R.x.id + ':' + d.id);
    if (m.deck === i) { m.deck = 0; m.page = 0; } else if (m.deck > i) m.deck--;
    send({ t: 'decks', decks: m.decks, d: m.deck, p: m.page }); persist(); if (R.sp === m) { paintBoard(); renderNav(); }
  }

  /* ---- external video (host) ---- */
  function embedOf(u) {
    let m = u.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/); if (m) return { kind: 'embed', src: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` };
    m = u.match(/aparat\.com\/v\/([\w-]+)/); if (m) return { kind: 'embed', src: `https://www.aparat.com/video/video/embed/videohash/${m[1]}/vt/frame?autoplay=true` };
    if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(u)) return { kind: 'file', src: u };
    return { kind: 'embed', src: u };
  }
  function extModal() {
    const vids = courseFiles(/^video\/|\.(mp4|webm|ogg|ogv|mov|m4v)$/i);
    modal(`<h2>همرسانی ویدیوی خارجی</h2><label class="field"><span>نشانی ویدیو (آپارات، یوتیوب یا فایل)</span><input class="input" id="lv-xu" dir="ltr" placeholder="https://www.aparat.com/v/…"></label>
      ${vids.length ? `<h3 class="lv-h3">از فایل‌های این درس</h3><div class="lv-files">${vids.map((f, i) => `<button type="button" class="lv-file" data-f="${i}"><b>${esc(f.name)}</b><span class="small muted">${esc(f.item)}</span></button>`).join('')}</div>` : ''}
      <label class="field"><span>یا فایل ویدیو از رایانه</span><input class="input" type="file" id="lv-xf" accept="video/*"></label>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-xok">همرسانی</button><button class="btn" data-close>انصراف</button></div>`, root => {
      root.querySelector('#lv-xok').onclick = () => { const u = root.querySelector('#lv-xu').value.trim(); if (!/^https?:\/\/\S+$/i.test(u)) return UI.invalid('#lv-xu', 'نشانی باید با http:// یا https:// شروع شود.'); startExt({ ...embedOf(u), name: u }); close(); };
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const f = vids[+b.dataset.f]; startExt({ kind: 'file', src: f.data, name: f.name }); close(); });
      root.querySelector('#lv-xf').onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 200 * 1048576) return toast('فایل بزرگ‌تر از ۲۰۰ مگابایت است.'); startExt({ kind: 'file', blob: f, name: f.name }); close(); };
    });
  }
  function startExt(e) { R.ext = { ...e, playing: false, t: 0, at: Date.now() }; renderExt(); send({ t: 'ext', ext: R.ext }); hostView('ext'); }
  function stopExt() { R.ext = null; renderExt(); send({ t: 'ext', ext: null }); hostView('board'); }
  function renderExt() {
    const box = $r('.lv-ext'); if (!box) return;
    if (R.extUrl) { URL.revokeObjectURL(R.extUrl); R.extUrl = null; }
    const e = R.ext; if (!e) { box.innerHTML = ''; if (R.view === 'ext' && !R.host) setView('board'); return; }
    if (e.kind === 'embed') { box.innerHTML = `<iframe src="${esc(e.src)}" title="${esc(e.name || 'ویدیو')}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>`; return; }
    const src = e.blob ? (R.extUrl = URL.createObjectURL(e.blob)) : e.src;
    box.innerHTML = `<video class="lv-xv" playsinline ${R.host ? 'controls' : ''} src="${esc(src)}"></video>${R.host ? '' : '<button type="button" class="btn sm lv-unmute" data-lv="unmute" hidden>روشن کردن صدا</button>'}`;
    const v = box.querySelector('video');
    if (R.host) { const ctl = () => { if (!R?.ext) return; Object.assign(R.ext, { playing: !v.paused, t: v.currentTime, at: Date.now() }); send({ t: 'ext-ctl', playing: R.ext.playing, t: R.ext.t, at: R.ext.at }); }; ['play', 'pause', 'seeked'].forEach(k => v.addEventListener(k, ctl)); }
    else v.addEventListener('loadedmetadata', syncExt, { once: true });
  }
  function syncExt() {
    const v = $r('.lv-ext video'), e = R.ext; if (!v || !e || R.host || v.readyState < 1) return;
    const t = e.t + (e.playing ? (Date.now() - e.at) / 1000 : 0); if (Math.abs(v.currentTime - t) > .8) v.currentTime = t;
    if (e.playing && R.view === 'ext') v.play().catch(() => { v.muted = true; v.play().catch(() => {}); const b = $r('.lv-unmute'); if (b) b.hidden = false; }); else v.pause();
  }
  async function camContent() {
    if (R.mainView === 'cam') return hostView('board');
    if (!R.cam) await toggleCam(); if (R.cam) hostView('cam');
  }

  /* ---- recording (host): the stage, the teacher's camera and the class's sound, kept in this browser ---- */
  async function toggleRec() {
    if (R.rec) { R.rec.stop(); return; }
    if (!window.MediaRecorder) return toast('این مرورگر ضبط را پشتیبانی نمی‌کند.');
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d');
    const draw = () => {
      if (!R) return; g.fillStyle = '#0f1d1c'; g.fillRect(0, 0, 1280, 720);
      const src = R.view === 'board' ? $r('.lv-board') : R.view === 'ext' ? $r('.lv-ext video') : $r('.lv-video');
      const w = src?.videoWidth || src?.width || 0, h = src?.videoHeight || src?.height || 0;
      if (w && h) { const r = Math.min(1280 / w, 720 / h); g.drawImage(src, (1280 - w * r) / 2, (720 - h * r) / 2, w * r, h * r); }
      else if (R.view === 'ext') { g.fillStyle = '#e7f3f1'; g.font = '600 32px Vazirmatn, Tahoma, sans-serif'; g.textAlign = 'center'; g.direction = 'rtl'; g.fillText('ویدیوی خارجی: ' + (R.ext?.name || ''), 640, 360); }
      const cam = $r('.lv-tile[data-id="me"] video');
      if (R.cam && cam?.videoWidth && R.view !== 'cam') { g.save(); g.beginPath(); g.roundRect?.(1280 - 276, 720 - 160, 260, 146, 12); g.clip(); g.drawImage(cam, 1280 - 276, 720 - 160, 260, 146); g.restore(); }
    };
    R.recDraw = setInterval(draw, 1000 / 15); draw();
    let ac; const out = cv.captureStream(15), tracks = [...out.getVideoTracks()];
    try { ac = new AudioContext(); const dest = ac.createMediaStreamDestination(), add = s => { if (s?.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest); };
      add(R.mic); R.peers.forEach(p => add(p.stream)); R.recMix = { ac, dest, add }; tracks.push(...dest.stream.getAudioTracks()); } catch { /* video only */ }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type, videoBitsPerSecond: 1500000 } : {}), parts = [], x = R.x, o = R.o, draws = R.recDraw;
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    rec.onstop = async () => {
      clearInterval(draws); ac?.close(); out.getTracks().forEach(t => t.stop());
      const blob = new Blob(parts, { type: 'video/webm' }), q = { id: rid(), at: new Date(rec.startAt).toISOString(), secs: Math.round((Date.now() - rec.startAt) / 1000), size: blob.size };
      await IDB.set('rec:' + q.id, blob); (x.recs = x.recs || []).push(q); o.save();
      if (R && R.rec === rec) { R.rec = null; R.recMix = null; const b = $r('.lv-recbtn'); b?.classList.remove('on'); b?.setAttribute('aria-pressed', 'false'); send({ t: 'rec', on: false }); tick(); }
      else if (!R) o.render();
      toast(`ضبط ${clock(q.secs)} ذخیره شد؛ از صفحهٔ درس قابل نمایش است.`);
    };
    rec.startAt = Date.now(); rec.start(1000); R.rec = rec; R.recAt = Date.now();
    const b = $r('.lv-recbtn'); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); send({ t: 'rec', on: true }); tick(); toast('ضبط کلاس شروع شد.');
  }

  /* ---- media ---- */
  async function toggleMic(force) {
    if (R.mic || force === false) { if (!R.mic) return; R.mic.getTracks().forEach(t => t.stop()); R.mic = null; }
    else { if (!R.host && R.cfg.locks.mic) return toast('معلم میکروفون دانش‌آموزان را بسته است.');
      if (!R.host && R.cfg.askTalk && !R.mayTalk) { if (!R.hand) setHand(true); toast('برای صحبت باید معلم اجازه بدهد؛ دستت بالاست و با اجازهٔ معلم میکروفونت روشن می‌شود.'); return; }
      try { R.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return toast('میکروفون در دسترس نیست یا اجازه داده نشد.'); }
      R.recMix?.add(R.mic); }
    hear(R.me.key, R.mic); fbState('mic', !!R.mic, IC.mic, IC.micOff); mediaOut();
  }
  async function toggleCam(force) {
    if (R.cam || force === false) { if (!R.cam) return; R.cam.getTracks().forEach(t => t.stop()); R.cam = null; if (R.host && R.mainView === 'cam') hostView('board'); }
    else { if (!R.host && R.cfg.locks.cam) return toast('معلم دوربین دانش‌آموزان را بسته است.');
      try { R.cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } }); } catch { return toast('دوربین در دسترس نیست یا اجازه داده نشد.'); } }
    fbState('cam', !!R.cam, IC.cam, IC.camOff); mediaOut();
  }
  async function toggleScreen() {
    if (R.screen) { R.screen.getTracks().forEach(t => t.stop()); R.screen = null; fbState('screen', false); if (R.mainView === 'screen') hostView('board'); return mediaOut(); }
    try { R.screen = await navigator.mediaDevices.getDisplayMedia({ video: true }); } catch { return toast('اشتراک صفحه لغو شد.'); }
    R.screen.getVideoTracks()[0].onended = () => { if (R?.screen) toggleScreen(); };
    fbState('screen', true); mediaOut(); hostView('screen');
  }
  const mediaOut = () => { renderTiles(); if (R.host) { R.people.forEach((_, k) => offer(k)); sendPeople(); } else upOffer(); if (R.view === 'cam' || R.view === 'screen') setView(R.view); };
  const peer = k => { if (!R.peers.has(k)) R.peers.set(k, {}); return R.peers.get(k); };
  // Students hear each other through the teacher's tab: each student gets one mixed track of everyone else's microphone
  // (never their own, so no echo); a voice joins or leaves the mix without a new connection.
  function bus() { const B = R.bus || (R.bus = { ac: new AudioContext(), dst: new Map(), src: new Map() }); B.ac.resume?.().catch(() => {}); return B; }
  function busOut(key) {
    const B = bus(); let d = B.dst.get(key);
    if (!d) { d = B.ac.createMediaStreamDestination(); B.dst.set(key, d); B.src.forEach((s, k) => k !== key && s.connect(d)); }
    return d.stream;
  }
  function busIn(key, stream) {
    if (!R.bus && !stream) return; const B = bus(), old = B.src.get(key); if (old) { try { old.disconnect(); } catch { /* gone */ } B.src.delete(key); }
    const tr = stream?.getAudioTracks().find(t => t.readyState === 'live'); if (!tr) return;
    try { const s = B.ac.createMediaStreamSource(new MediaStream([tr])); B.src.set(key, s); B.dst.forEach((d, k) => k !== key && s.connect(d)); } catch { /* no audio */ }
  }
  function busDrop(key) { busIn(key, null); const d = R.bus?.dst.get(key); if (!d) return; R.bus.src.forEach(s => { try { s.disconnect(d); } catch { /* not linked */ } }); R.bus.dst.delete(key); }
  // Host → each student: the camera with the microphone in one stream, the screen in another, the class's voices in a third.
  async function offer(key) {
    const p = peer(key); p.pc?.close(); p.pc = null;
    const t = []; if (R.cam) t.push([R.cam.getVideoTracks()[0], 'cam']); if (R.mic) t.push([R.mic.getAudioTracks()[0], 'cam']); if (R.screen) t.push([R.screen.getVideoTracks()[0], 'screen']);
    let mx = null; try { mx = busOut(key).getAudioTracks()[0]; } catch { /* no mixing */ }
    if (!t.filter(([x]) => x).length && !mx) return send({ t: 'nomedia', to: key });
    const pc = p.pc = new RTCPeerConnection(ICE()), cm = new MediaStream(), sc = new MediaStream(), mm = new MediaStream();
    t.forEach(([tr, k]) => tr && pc.addTrack(tr, k === 'cam' ? cm : sc)); if (mx) pc.addTrack(mx, mm);
    pc.onicecandidate = e => e.candidate && send({ t: 'ice', to: key, c: e.candidate.toJSON() });
    await pc.setLocalDescription(await pc.createOffer());
    send({ t: 'offer', to: key, sdp: pc.localDescription.toJSON(), ids: { cam: cm.id, screen: sc.id, mix: mm.id } });
  }
  // Student → host: the student's own microphone and camera.
  async function upOffer() {
    R.up?.close(); R.up = null;
    send({ t: 'media', from: R.me.key, mic: !!R.mic, cam: !!R.cam });
    const t = [...(R.mic?.getAudioTracks() || []), ...(R.cam?.getVideoTracks() || [])];
    if (!t.length || R.waiting) return send({ t: 'up-none', from: R.me.key });
    const pc = R.up = new RTCPeerConnection(ICE()), ms = new MediaStream(t); t.forEach(tr => pc.addTrack(tr, ms));
    pc.onicecandidate = e => e.candidate && send({ t: 'up-ice', from: R.me.key, c: e.candidate.toJSON() });
    await pc.setLocalDescription(await pc.createOffer()); send({ t: 'up-offer', from: R.me.key, sdp: pc.localDescription.toJSON() });
  }
  function renderTiles() {
    const stp = $r('.lv-strip'); if (!stp) return; const list = [];
    if (R.host) { if (R.cam) list.push({ id: 'me', name: R.me.name + ' (شما)', s: R.cam, self: true });
      R.peers.forEach((p, k) => { if (p.stream && R.people.has(k)) list.push({ id: k, name: R.people.get(k).name, sid: R.people.get(k).sid, s: p.stream }); }); }
    else { if (R.rCam) list.push({ id: 'host', name: R.hostName, s: R.rCam }); if (R.cam) list.push({ id: 'me', name: 'شما', sid: R.me.sid, s: R.cam, self: true }); }
    const have = new Map([...stp.children].map(e => [e.dataset.id, e]));
    list.forEach(t => {
      let el = have.get(t.id); have.delete(t.id);
      if (!el) { el = document.createElement('div'); el.className = 'lv-tile'; el.dataset.id = t.id; el.innerHTML = '<video playsinline autoplay></video><span class="lv-av" aria-hidden="true"></span><b></b>'; stp.appendChild(el); }
      const v = el.querySelector('video'); v.muted = !!t.self; v.classList.toggle('mirror', !!t.self);
      if (v.srcObject !== t.s) { v.srcObject = t.s; v.play?.().catch(() => {}); }
      el.classList.toggle('novid', !t.s.getVideoTracks().some(x => x.readyState === 'live') || (prefs.saver && !t.self));
      const fc = face(stuOf(t.sid), t.name); if (el.dataset.fc !== fc) { el.dataset.fc = fc; el.querySelector('.lv-av').innerHTML = fc; } el.querySelector('b').textContent = t.name;
    });
    have.forEach(e => e.remove());
    stp.querySelectorAll('.lv-tile').forEach(t => t.classList.toggle('talk', !!R.talk?.has(t.dataset.id === 'me' ? R.me.key : t.dataset.id)));
    $room()?.classList.toggle('has-tiles', list.length > 0);
  }

  /* ---- who is talking ---- */
  // Every microphone gets an analyser; a voice counts as talking while its level is above a floor, held a moment so the
  // label does not flicker. The teacher's tab hears everyone and sends the list; a student also hears their own mic at once.
  function hear(key, stream) {
    const V = R.vad || (R.vad = { ac: null, m: new Map() }), cur = V.m.get(key), tr = stream?.getAudioTracks().find(t => t.readyState === 'live');
    if (cur && cur.tr === tr) return;
    if (cur) { try { cur.src.disconnect(); } catch { /* gone */ } V.m.delete(key); }
    if (!tr) return;
    try { V.ac = V.ac || new AudioContext(); V.ac.resume?.().catch(() => {});
      const src = V.ac.createMediaStreamSource(new MediaStream([tr])), an = V.ac.createAnalyser(); an.fftSize = 512; src.connect(an);
      V.m.set(key, { tr, src, an, buf: new Float32Array(an.fftSize), until: 0 }); } catch { /* no audio */ }
  }
  function listen() {
    if (!R) return; const now = Date.now(), on = new Set();
    R.vad?.m.forEach((a, k) => { if (a.tr.readyState !== 'live' || !a.tr.enabled) return; a.an.getFloatTimeDomainData(a.buf);
      let e = 0; for (const x of a.buf) e += x * x; if (Math.sqrt(e / a.buf.length) > .02) a.until = now + 700; if (a.until > now) on.add(k); });
    let keys;
    if (R.host) keys = [...on].filter(k => k === R.me.key || R.people.has(k));
    else keys = [...(R.heard || []).filter(k => k !== R.me.key), ...(on.has(R.me.key) ? [R.me.key] : [])];
    keys.sort(); const sig = keys.join();
    if (sig === R.talkSig) return; R.talkSig = sig;
    if (R.host) send({ t: 'speak', keys });
    showTalk(keys);
  }
  function showTalk(keys) {
    R.talk = new Set(keys);
    const nm = k => k === R.me.key ? 'شما' : k === 'host' ? R.hostName : R.people.get(k)?.name;
    const names = keys.map(nm).filter(Boolean), box = $r('.lv-talk');
    if (box) { box.hidden = !names.length; box.querySelector('b').textContent = names.length > 3 ? `${names.slice(0, 3).join('، ')} و ${fa(names.length - 3)} نفر دیگر` : names.join('، '); }
    document.querySelectorAll('#lv-room .lv-tile').forEach(t => t.classList.toggle('talk', R.talk.has(t.dataset.id === 'me' ? R.me.key : t.dataset.id)));
    document.querySelectorAll('#lv-room .lv-people li[data-key]').forEach(li => li.classList.toggle('talk', R.talk.has(li.dataset.key)));
  }

  /* ---- side panel ---- */
  function openSide(k) { R.side = k; if (!prefs.side) { prefs.side = true; savePrefs(); applyLayout(); } renderSide(); }
  function renderSide(kind) {
    if (!R) return; if (kind && kind !== R.side) return badges();
    const p = $r('.lv-spanel'); if (!p) return;
    document.querySelectorAll('#lv-room [data-side]').forEach(b => { const on = b.dataset.side === R.side; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    const a = document.activeElement, foc = p.contains(a) && a.id ? { id: a.id, at: a.selectionStart } : null;
    p.innerHTML = { chat: sideChat, users: sideUsers, notes: sideNotes, poll: sidePoll }[R.side]();
    if (foc) { const i = p.querySelector('#' + foc.id); if (i) { i.focus(); try { i.setSelectionRange(foc.at, foc.at); } catch { /* not text */ } } }
    if (R.side === 'chat' && prefs.side) { R.unread = 0; const ch = p.querySelector('.lv-chat'); if (ch) ch.scrollTop = ch.scrollHeight; }
    badges();
  }
  function badges() {
    const bd = $r('.lv-badge'); if (bd) { bd.hidden = !R.unread; bd.textContent = fa(R.unread); }
    const hb = $r('.lv-hbadge'); if (hb) { const n = [...R.people.values()].filter(v => v.hand).length + (R.host ? R.pending.size : 0); hb.hidden = !n; hb.textContent = fa(n); }
  }
  const roomName = () => R.room ? R.room.name : R.visit != null ? R.br.rooms[R.visit].name : '';
  function sideChat() {
    const sp = R.sp, locked = !R.host && sp === R.main && R.cfg.locks.chat;
    const mine = m => m.by ? m.by === R.me.key : R.host ? m.host || !m.sid : m.sid === R.me.sid;
    return `<div class="lv-sh"><b>${sp === R.main ? 'گفت‌وگوی عمومی' : `گفت‌وگوی ${esc(roomName())}`}</b>${btnIcon('chat-more', IC.more, 'گزینه‌های گفت‌وگو', 'aria-haspopup="true" aria-expanded="false"')}</div>
      <div class="lv-chat" aria-live="polite">${sp.chat.length ? sp.chat.map(m => m.sys ? `<p class="lv-sys">${esc(m.text)}</p>` : `<div class="lv-msg ${mine(m) ? 'me' : ''} ${m.host || !m.sid ? 'host' : ''}"><b>${esc(m.who)}</b><span class="num">${tm(m.at)}</span><p>${esc(m.text)}</p></div>`).join('') : '<p class="lv-empty">هنوز پیامی نیست.</p>'}</div>
      ${locked ? '<p class="lv-locked">گفت‌وگوی عمومی را معلم بسته است.</p>' : `<form class="lv-send"><input class="input" id="lv-msg" placeholder="پیام ${sp === R.main ? 'گفت‌وگوی عمومی' : 'به اتاق'}" aria-label="پیام" autocomplete="off" maxlength="500" value="${esc(R.draft || '')}"><button class="btn primary" aria-label="فرستادن">${IC.send}</button></form>`}`;
  }
  function sideNotes() {
    const ro = !R.host && R.cfg.locks.notes;
    return `<div class="lv-sh"><b>یادداشت‌های همرسانده</b>${btnIcon('notes-dl', IC.dl, 'دانلود یادداشت‌ها')}</div>${ro ? '<p class="lv-locked">ویرایش یادداشت‌ها را معلم بسته است.</p>' : ''}
      <textarea id="lv-notes" class="input lv-notes" aria-label="یادداشت‌های همرسانده" ${ro ? 'readonly' : ''}>${esc(R.notes)}</textarea><p class="lv-nby small">${R.notesBy ? `آخرین ویرایش: ${esc(R.notesBy)}` : ''}</p>`;
  }
  const userRow = (v, opts = {}) => {
    const isPres = v.key === R.presenter || (v.key === 'host' && !R.presenter), canW = v.sid && (R.allWrite || R.writers.has(v.sid));
    return `<li class="lv-p-on ${v.away ? 'away' : ''} ${R.talk?.has(v.key) ? 'talk' : ''}" data-key="${esc(v.key)}"><span class="lv-av2" aria-hidden="true">${face(stuOf(v.sid), v.name)}${isPres ? `<em>${IC.present}</em>` : ''}</span>
      <span class="lv-pn">${esc(v.name)}${opts.role ? ` <small>${opts.role}</small>` : ''}${isPres ? ' <small>ارائه‌دهنده</small>' : ''}${v.away ? ' <small>دور از کلاس</small>' : ''}${opts.menu && R.cfg.askTalk && v.hand && !v.talk ? `<button type="button" class="lv-give" data-lv="give-talk" data-key="${esc(v.key)}">اجازهٔ صحبت</button>` : ''}</span>
      <span class="lv-pst">${v.hand ? `<span class="lv-ihand" title="دست بالا">${IC.hand}</span>` : ''}${v.react ? `<span class="lv-emo" title="واکنش">${v.react}</span>` : ''}${canW ? `<span title="اجازهٔ نوشتن">${IC.pen}</span>` : ''}${v.cam ? `<span title="دوربین روشن">${IC.cam}</span>` : ''}${v.mic ? `<span title="میکروفون روشن">${IC.mic}</span>` : `<span class="dim" title="میکروفون خاموش">${IC.micOff}</span>`}</span>
      ${opts.menu ? `<button type="button" class="lv-ib" data-lv="user-more" data-key="${esc(v.key)}" aria-label="کارهای ${esc(v.name)}" aria-haspopup="true" aria-expanded="false">${IC.more}</button>` : ''}</li>`;
  };
  const byHand = (a, b) => (a.hand ? a.hand : Infinity) - (b.hand ? b.hand : Infinity) || a.name.localeCompare(b.name, 'fa');
  function sideUsers() {
    const onl = [...R.people.values()].sort(byHand);
    if (!R.host) {
      const others = R.cfg.locks.users ? [] : onl;
      return `<div class="lv-sh"><b>کاربران (${fa(count())})</b></div><ul class="lv-people">${userRow({ key: 'host', name: R.hostName, away: R.hostAway, react: R.hostReact, mic: R.hostMic, cam: R.hostCam }, { role: 'معلم' })}
        ${R.self ? userRow({ ...R.self, name: R.me.name }, { role: '(شما)' }) : ''}${others.map(v => userRow(v)).join('')}</ul>${R.cfg.locks.users ? '<p class="lv-locked">فهرست دیگر کاربران را معلم بسته است.</p>' : ''}`;
    }
    const ros = roster(R.o, R.x), onSid = new Set(onl.map(v => v.sid));
    const left = ros.filter(s => !onSid.has(s.id) && R.x.att[s.id]), off = ros.filter(s => !onSid.has(s.id) && !R.x.att[s.id]), pend = [...R.pending.values()];
    return `<div class="lv-sh"><b>کاربران (${fa(onl.length + 1)})</b>${btnIcon('users-gear', IC.gear, 'مدیریت کاربران', 'aria-haspopup="true" aria-expanded="false"')}</div>
      ${pend.length ? `<div class="lv-pend"><b>${IC.guest} منتظر پذیرش (${fa(pend.length)})</b>${pend.map(v => `<div class="lv-hrow"><span>${esc(v.name)}</span><span><button type="button" class="btn sm primary" data-lv="admit" data-key="${esc(v.key)}">پذیرش</button> <button type="button" class="btn sm" data-lv="deny" data-key="${esc(v.key)}">رد</button></span></div>`).join('')}${pend.length > 1 ? '<button type="button" class="btn sm" data-lv="admit-all">پذیرش همه</button>' : ''}</div>` : ''}
      ${R.br ? brCard() : ''}
      <ul class="lv-people">${userRow({ key: 'host', name: R.me.name, away: R.away, react: R.hostReact, mic: !!R.mic, cam: !!R.cam }, { role: '(شما)' })}${onl.map(v => userRow(v, { menu: true })).join('')}</ul>
      ${left.length ? `<p class="lv-plh">رفته (${fa(left.length)})</p><ul class="lv-people">${left.map(s => `<li class="lv-p-left"><span class="lv-av2 sm" aria-hidden="true">${face(s)}</span><span class="lv-pn">${esc(s.name)}</span><span class="small">${fa(R.x.att[s.id].mins || 0)} دقیقه</span></li>`).join('')}</ul>` : ''}
      ${off.length ? `<p class="lv-plh">وارد نشده (${fa(off.length)})</p><ul class="lv-people">${off.map(s => `<li class="lv-p-off"><span class="lv-av2 sm" aria-hidden="true">${face(s)}</span><span class="lv-pn">${esc(s.name)}</span></li>`).join('')}</ul>` : ''}`;
  }

  /* ---- polls ---- */
  const pf = () => R.pf || (R.pf = { type: 'yn', q: '', opts: ['بله', 'خیر'], anon: false, quiz: false, correct: 0 });
  const pollPublic = p => { const closed = !!p.closed;
    return { id: p.id, q: p.q, type: p.type, opts: p.opts, anon: p.anon, quiz: p.quiz, closed, n: Object.keys(p.votes).length, cnt: closed ? counts(p) : null, correct: closed ? p.correct : null,
      texts: closed && p.type === 'text' ? Object.entries(p.votes).map(([sid, v]) => ({ who: p.anon ? '' : nameOfSid(sid), v })) : null }; };
  function sidePoll() {
    const head = '<div class="lv-sh"><b>نظرسنجی و آزمونک</b></div>', p = R.poll;
    if (!R.host) {
      if (!p) return head + '<p class="lv-empty">نظرسنجی‌ای در جریان نیست.</p>';
      const mine = R.myVote[p.id];
      if (p.closed) return head + pollResult(p) + (p.quiz && mine != null ? `<p class="lv-qres ${mine === p.correct ? 'ok' : 'no'}">${mine === p.correct ? 'پاسخ شما درست بود.' : `پاسخ درست: ${esc(p.opts[p.correct])}`}</p>` : '');
      if (p.type === 'text') return head + `<form class="lv-ptext"><b>${esc(p.q)}</b><textarea class="input" id="lv-pans" maxlength="300" aria-label="پاسخ شما">${esc(mine || '')}</textarea><button class="btn primary">${mine ? 'ویرایش پاسخ' : 'فرستادن پاسخ'}</button></form>`;
      return head + `<div class="lv-pvote"><b>${esc(p.q)}</b>${p.opts.map((op, i) => `<button type="button" class="btn ${mine === i ? 'primary' : ''}" data-lv="vote" data-i="${i}" aria-pressed="${mine === i}">${esc(op)}</button>`).join('')}${mine != null ? '<p class="small">رأی شما ثبت شد.</p>' : ''}</div>`;
    }
    if (p && !p.closed) {
      const who = !p.anon && p.type !== 'text' ? `<ul class="lv-who">${Object.entries(p.votes).map(([sid, v]) => `<li><span>${esc(nameOfSid(sid))}</span><b>${esc(p.opts[v] ?? '')}</b></li>`).join('')}</ul>` : '';
      return head + `<div class="lv-plive">${pollResult(p, nameOfSid)}<p class="small">${fa(Object.keys(p.votes).length)} از ${fa(R.people.size)} نفر پاسخ داده‌اند</p>${who}<button type="button" class="btn primary" data-lv="poll-close">پایان و انتشار نتیجه</button></div>`;
    }
    if (p && p.closed) return head + pollResult(p, nameOfSid) + `<div class="row">${p.type === 'text' ? '' : '<button type="button" class="btn" data-lv="poll-board">نمایش نتیجه روی تخته</button>'}<button type="button" class="btn primary" data-lv="poll-new">نظرسنجی تازه</button></div>`;
    const f = pf();
    return head + `<form class="lv-pform"><div class="lv-ptypes" role="radiogroup" aria-label="نوع پرسش">${PTYPES.map(([k, l]) => `<button type="button" role="radio" aria-checked="${f.type === k}" data-lv="ptype" data-k="${k}">${l}</button>`).join('')}</div>
      <label class="field"><span>پرسش</span><input class="input" id="lv-pq" value="${esc(f.q)}" maxlength="200" autocomplete="off"></label>
      ${f.type === 'text' ? '' : `<div class="field"><span>گزینه‌ها</span>${f.opts.map((v, i) => `<div class="lv-popt">${f.quiz ? `<input type="radio" name="lv-pc" class="lv-pc" value="${i}" ${f.correct === i ? 'checked' : ''} aria-label="پاسخ درست: گزینهٔ ${fa(i + 1)}" title="پاسخ درست">` : ''}<input class="input lv-po" id="lv-po${i}" data-i="${i}" value="${esc(v)}" aria-label="گزینهٔ ${fa(i + 1)}" maxlength="80" autocomplete="off"></div>`).join('')}
        ${f.type === 'custom' && f.opts.length < 6 ? '<button type="button" class="btn sm" data-lv="popt-add">+ گزینه</button>' : ''}</div>`}
      <label class="lv-chk"><input type="checkbox" id="lv-panon" ${f.anon ? 'checked' : ''}> بی‌نام</label>
      ${f.type === 'text' ? '' : `<label class="lv-chk"><input type="checkbox" id="lv-pquiz" ${f.quiz ? 'checked' : ''}> آزمونک (پاسخ درست دارد)</label>`}
      <button class="btn primary">شروع</button></form>`;
  }
  function pollStart() {
    const f = pf(), q = f.q.trim(); if (!q) return UI.invalid('#lv-pq', 'پرسش را بنویسید.');
    const opts = f.type === 'text' ? [] : f.opts.map(s => s.trim()); if (f.type !== 'text' && opts.filter(Boolean).length < 2) return toast('دست‌کم دو گزینه لازم است.');
    const keep = opts.map((s, i) => [s, i]).filter(([s]) => s), correct = f.quiz ? Math.max(0, keep.findIndex(([, i]) => i === f.correct)) : null;
    R.poll = { id: rid(), q, type: f.type, opts: keep.map(([s]) => s), anon: f.anon, quiz: f.type !== 'text' && f.quiz, correct, votes: {}, closed: false, at: nowIso() };
    R.x.polls.push(R.poll); R.pf = null; saveSoon(); send({ t: 'poll', poll: pollPublic(R.poll) }); renderSide('poll'); toast('نظرسنجی شروع شد.');
  }
  function pollClose() {
    const p = R.poll; if (!p) return; p.closed = true;
    if (p.quiz) Object.entries(p.votes).forEach(([sid, v]) => { if (v === p.correct) st(sid).correct++; });
    saveSoon(); send({ t: 'poll', poll: pollPublic(p) }); renderSide('poll');
  }
  function pollBoard() {
    const p = R.poll; if (!p) return; if (R.sp !== R.main) return toast('برای نمایش روی تخته به کلاس اصلی برگردید.');
    const s = { id: rid(), k: 'poll', x: .97, y: .03, q: p.q, opts: p.opts, cnt: counts(p), n: Object.keys(p.votes).length, by: R.me.key };
    if (R.mainView !== 'board') hostView('board'); doOp({ t: 'add', s }, { t: 'del', id: s.id }); toast('نتیجه روی تخته آمد.');
  }
  // A new poll reaches every student at once: a card over the class with the answers in it, a sound, and — when the
  // class tab is in the background — a browser notification and a changed tab title.
  function pollNotice(p) {
    beep(820); setTimeout(() => beep(990), 160); pollPop(p);
    if (document.hidden) {
      try { if (window.Notification?.permission === 'granted') { const n = new Notification('نظرسنجی تازه در کلاس ' + R.o.sub, { body: p.q, tag: 'lv-poll' }); n.onclick = () => { focus(); n.close(); }; } } catch { /* not allowed here */ }
      if (!R.title0) { R.title0 = document.title; document.title = '🔔 نظرسنجی تازه · ' + R.title0;
        const back = () => { if (document.hidden) return; if (R?.title0) { document.title = R.title0; R.title0 = null; } document.removeEventListener('visibilitychange', back); };
        document.addEventListener('visibilitychange', back); }
    }
  }
  function pollPop(p) {
    $r('.lv-ppop')?.remove(); if (!p || !R || R.host) return;
    const el = document.createElement('div'); el.className = 'lv-ppop'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'نظرسنجی تازه');
    el.innerHTML = `<div class="lv-pph">${IC.poll}<b>${p.quiz ? 'آزمونک تازه' : 'نظرسنجی تازه'}</b>${btnIcon('ppop-x', IC.clear, 'بستن')}</div><p>${esc(p.q)}</p>
      ${p.type === 'text' ? '<button type="button" class="btn primary" data-lv="ppop-open">پاسخ دادن</button>' : `<div class="lv-ppo">${p.opts.map((op, i) => `<button type="button" class="btn" data-lv="vote" data-i="${i}">${esc(op)}</button>`).join('')}</div>`}`;
    $room().appendChild(el); setTimeout(() => el.querySelector('.lv-ppo button, [data-lv="ppop-open"]')?.focus(), 50);
  }
  function vote(v) { const p = R.poll; if (!p || p.closed) return; pollPop(null); if (R.myVote[p.id] == null) toast('پاسخ شما ثبت شد.'); R.myVote[p.id] = v; send({ t: 'vote', id: p.id, sid: R.me.sid, v }); renderSide('poll'); }

  /* ---- chat, notes, reactions, status ---- */
  function sendChat(text) {
    if (!R.host && R.sp === R.main && R.cfg.locks.chat) return;
    const m = { id: rid(), by: R.me.key, who: R.me.name, sid: R.me.sid || null, host: R.host, text, at: nowIso() };
    R.draft = ''; addChat(R.sp, m); spSend({ t: 'chat', m });
    if (R.host && R.sp === R.main) saveSoon();
  }
  function addChat(sp, m) {
    if (m.id && sp.chat.some(x => x.id === m.id)) return;
    sp.chat.push(m); if (sp.chat.length > 500) sp.chat.splice(0, sp.chat.length - 500);
    if (R.host && sp === R.main) saveSoon();
    if (sp === R.sp) { if (R.side !== 'chat' || !prefs.side) R.unread++; if (m.by !== R.me.key && !m.sys) beep(660, .08); renderSide('chat'); }
  }
  function setNotes(text, by) {
    R.notes = text; R.notesBy = by; const t = $r('#lv-notes'); if (t && document.activeElement !== t) t.value = text;
    const nb = $r('.lv-nby'); if (nb) nb.textContent = by ? `آخرین ویرایش: ${by}` : ''; if (R.host) saveSoon();
  }
  function react(e) {
    if (R.host) { R.hostReact = e; R.hostReactAt = Date.now(); sendPeople(); renderSide('users'); } else send({ t: 'react', from: R.me.key, e });
    if (e) { fly(e); send({ t: 'fly', e }); }
  }
  function fly(e) {
    if (!prefs.motion) return; const box = $r('.lv-flies'); if (!box) return;
    const s = document.createElement('span'); s.className = 'lv-fly'; s.textContent = e; s.style.insetInlineStart = (10 + Math.random() * 70) + '%'; box.appendChild(s); setTimeout(() => s.remove(), 2400);
  }
  function setHand(up) { R.hand = up; fbState('hand', up); send({ t: 'hand', from: R.me.key, name: R.me.name, up }); toast(up ? 'دستت بالا رفت؛ معلم می‌بیند.' : 'دستت پایین آمد.'); }
  function setAway(a) { R.away = a; if (R.host) { sendPeople(); renderSide('users'); } else send({ t: 'status', from: R.me.key, away: a }); toast(a ? 'وضعیت شما: دور از کلاس' : 'وضعیت شما: حاضر'); }

  /* ---- people (host) ---- */
  const peopleMsg = () => ({ t: 'people', list: [...R.people.values()].map(({ key, sid, name, hand, react, away, mic, cam, talk }) => ({ key, sid, name, hand, react, away, mic, cam, talk: !!talk })),
    host: { name: R.me.name, away: R.away, react: R.hostReact, mic: !!R.mic, cam: !!R.cam }, presenter: R.presenter, allWrite: R.allWrite, writers: [...R.writers] });
  const sendPeople = () => { clearTimeout(R.pT); R.pT = setTimeout(() => R && send(peopleMsg()), 60); badges(); };
  function arrive(v) {
    R.people.set(v.key, { mic: false, cam: false, hand: 0, react: null, away: false, ...v });
    if (v.sid) { const a = R.x.att[v.sid] = R.x.att[v.sid] || { first: nowIso(), mins: 0 }; a.since = Date.now(); st(v.sid); saveSoon(); }
  }
  function depart(key) {
    const v = R.people.get(key); if (!v) return; R.people.delete(key);
    const p = R.peers.get(key); p?.pc?.close(); p?.up?.close(); R.peers.delete(key); hear(key, null); busDrop(key);
    if (R.presenter === key) R.presenter = null;
    if (v.sid && R.x.att[v.sid]?.since) { const a = R.x.att[v.sid]; a.mins = (a.mins || 0) + Math.max(1, Math.round((Date.now() - a.since) / 60000)); a.last = nowIso(); delete a.since; saveSoon(); }
  }
  function admit(v) {
    R.pending.delete(v.key); if (v.sid && !R.cfg.ok.includes(v.sid)) R.cfg.ok.push(v.sid);
    arrive(v); sendState(v.key); offer(v.key); sendPeople(); renderSide('users'); renderTiles(); beep(740); toast(`${v.name} وارد کلاس شد.`);
  }
  const sendState = key => send({ t: 'state', to: key, hostName: R.me.name, startedAt: R.x.startedAt, main: R.main, view: R.mainView, ext: R.ext, notes: R.notes, notesBy: R.notesBy,
    poll: R.poll && pollPublic(R.poll), cfg: pubCfg(), timer: R.timer, rec: !!R.rec });

  /* ---- breakout rooms ---- */
  function brModal() {
    const onl = [...R.people.values()]; if (!onl.length) return toast('هنوز دانش‌آموزی وارد کلاس نشده.');
    const n0 = Math.min(4, Math.max(2, Math.ceil(onl.length / 3)));
    modal(`<h2>ایجاد اتاق‌های جانبی</h2><div class="grid g2" style="gap:0 12px"><label class="field"><span>تعداد اتاق‌ها</span><select class="input" id="lv-brn">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === n0 ? 'selected' : ''}>${fa(n)}</option>`).join('')}</select></label>
        <label class="field"><span>مدت (دقیقه)</span><input class="input" type="number" id="lv-brt" min="1" max="120" value="10"></label></div>
      <fieldset class="lv-fs"><legend>چیدمان دانش‌آموزان</legend><label class="lv-chk"><input type="radio" name="lv-bra" value="r" checked> تصادفی</label><label class="lv-chk"><input type="radio" name="lv-bra" value="m"> دستی</label></fieldset>
      <div id="lv-brman" style="display:none"><div class="table-wrap"><table><tr><th>دانش‌آموز</th><th>اتاق</th></tr>${onl.map(v => `<tr><td>${esc(v.name)}</td><td><select class="input lv-brs" data-key="${esc(v.key)}" aria-label="اتاق ${esc(v.name)}"></select></td></tr>`).join('')}</table></div></div>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="lv-brok">شروع اتاق‌ها</button><button class="btn" data-close>انصراف</button></div>`, root => {
      const fill = () => { const n = +root.querySelector('#lv-brn').value; root.querySelectorAll('.lv-brs').forEach((s, i) => { const cur = s.value ? Math.min(+s.value, n - 1) : i % n; s.innerHTML = Array.from({ length: n }, (_, k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>اتاق ${fa(k + 1)}</option>`).join(''); }); };
      fill(); root.querySelector('#lv-brn').onchange = fill;
      root.querySelectorAll('[name=lv-bra]').forEach(r => r.onchange = () => { root.querySelector('#lv-brman').style.display = root.querySelector('[name=lv-bra]:checked').value === 'm' ? '' : 'none'; });
      root.querySelector('#lv-brok').onclick = () => {
        const n = +root.querySelector('#lv-brn').value, m = Math.max(1, Math.min(120, Math.round(+root.querySelector('#lv-brt').value) || 10)), assign = new Map();
        if (root.querySelector('[name=lv-bra]:checked').value === 'm') root.querySelectorAll('.lv-brs').forEach(s => assign.set(s.dataset.key, +s.value));
        else [...onl].sort(() => Math.random() - .5).forEach((v, i) => assign.set(v.key, i % n));
        startBr(n, m, assign); close();
      };
    });
  }
  function startBr(n, m, assign) {
    R.br = { until: Date.now() + m * 60000, rooms: Array.from({ length: n }, (_, k) => ({ k, name: `اتاق ${fa(k + 1)}`, keys: [], names: [], sp: newSp() })) };
    assign.forEach((k, key) => { const r = R.br.rooms[k]; r.keys.push(key); r.names.push(R.people.get(key)?.name || ''); });
    R.br.rooms.forEach(r => { r.chan = mkChan(`mehr8-live:${R.x.id}:br${r.k}`); r.chan.onmessage = e => onRoom(r, e.data); });
    send({ t: 'breakout', br: { until: R.br.until, rooms: R.br.rooms.map(({ k, name, keys }) => ({ k, name, keys })) } });
    openSide('users'); toast(`${fa(n)} اتاق جانبی برای ${fa(m)} دقیقه باز شد.`);
  }
  const brCard = () => `<div class="lv-brcard"><div class="lv-brh"><b>${IC.door} اتاق‌های جانبی</b><span class="num lv-brclock">${clock((R.br.until - Date.now()) / 1000)}</span></div>
    ${R.br.rooms.map(r => `<div class="lv-brrow"><div><b>${esc(r.name)}</b><span class="small">${esc(r.names.join('، ') || '—')}</span></div>${R.visit === r.k ? '<button type="button" class="btn sm" data-lv="br-back">بازگشت</button>' : `<button type="button" class="btn sm" data-lv="br-go" data-k="${r.k}">ورود</button>`}</div>`).join('')}
    <form class="lv-brmsg"><input class="input" id="lv-brm" placeholder="پیام به همهٔ اتاق‌ها" aria-label="پیام به همهٔ اتاق‌ها" autocomplete="off" value="${esc(R.brDraft || '')}"><button class="btn sm primary">فرستادن</button></form>
    <div class="row"><button type="button" class="btn sm" data-lv="br-more">+۵ دقیقه</button><button type="button" class="btn sm danger" data-lv="br-end">پایان اتاق‌ها</button></div></div>`;
  function onRoom(r, m) {
    if (!R?.br) return;
    if (m.t === 'r-hello') return r.chan.postMessage({ t: 'r-state', to: m.from, sp: r.sp });
    if (['add', 'del', 'upd', 'set'].includes(m.t)) applyOp(r.sp, m);
    else if (m.t === 'page') applyPage(r.sp, m); else if (m.t === 'pg-add') applyPgAdd(r.sp, m);
    else if (m.t === 'chat') { addChat(r.sp, m.m); if (m.m.sid) st(m.m.sid).msgs++; }
    else if (m.t === 'chat-clear') { r.sp.chat.length = 0; if (R.sp === r.sp) renderSide('chat'); }
  }
  function visitRoom(k) { R.visit = k; R.sp = R.br.rooms[k].sp; R.sel = null; setView('board'); renderAll(); }
  function backMain() { R.visit = null; R.sp = R.main; R.sel = null; setView(R.mainView); renderAll(); }
  function endBr() {
    const br = R.br; if (!br) return;
    R.x.breakouts = [...(R.x.breakouts || []), ...br.rooms.map(r => ({ name: r.name, at: nowIso(), members: r.names, chat: r.sp.chat, pages: r.sp.decks[0].pages.map(p => ({ s: p.s })) }))];
    send({ t: 'br-end' }); br.rooms.forEach(r => r.chan.close());
    if (R.visit != null) { R.visit = null; R.sp = R.main; setView(R.mainView); }
    R.br = null; saveSoon(); renderAll(); toast('اتاق‌های جانبی تمام شد.');
  }
  function enterRoom(info, until) {
    R.room = { k: info.k, name: info.name, until, sp: newSp(), chan: mkChan(`mehr8-live:${R.x.id}:br${info.k}`) };
    R.room.chan.onmessage = e => onRoomMsg(e.data); R.sp = R.room.sp; R.sel = null; setView('board'); renderAll();
    R.room.chan.postMessage({ t: 'r-hello', from: R.me.key, name: R.me.name }); beep(600); toast(`به «${info.name}» رفتید.`);
  }
  function leaveRoom() { if (!R.room) return; R.room.chan.close(); R.room = null; R.sp = R.main; R.sel = null; setView(R.mainView || 'board'); renderAll(); }
  function onRoomMsg(m) {
    if (!R?.room) return;
    if (m.t === 'r-state') { if (m.to !== R.me.key) return; const was = R.sp === R.room.sp; R.room.sp = m.sp; if (was) R.sp = m.sp; renderAll(); return; }
    const sp = R.room.sp;
    if (['add', 'del', 'upd', 'set'].includes(m.t)) applyOp(sp, m); else if (m.t === 'page') applyPage(sp, m); else if (m.t === 'pg-add') applyPgAdd(sp, m);
    else if (m.t === 'chat') addChat(sp, m.m); else if (m.t === 'chat-clear') { sp.chat.length = 0; renderSide('chat'); }
  }
  function renderBrbar() {
    const bb = $r('.lv-brbar'); if (!bb) return; const on = !!R.room || (R.host && R.visit != null); bb.hidden = !on;
    if (on) bb.innerHTML = `${IC.door}<span></span>${R.host ? '<button type="button" class="btn sm" data-lv="br-back">بازگشت به کلاس اصلی</button>' : ''}`;
  }

  /* ---- messages ---- */
  const HOST = {
    hello(m) {
      const ok = (R.cfg.ok || []).includes(m.sid);
      // A room with a size limit (online.html): the host plus o.max - 1 others.
      if (R.o.max && !R.people.has(m.from) && R.people.size + 1 >= R.o.max) return send({ t: 'denied', to: m.from, full: R.o.max });
      if (R.kicked.has(m.sid) || (R.cfg.policy === 'deny' && !ok)) return send({ t: 'denied', to: m.from });
      if (R.cfg.policy === 'ask' && !ok) { R.pending.set(m.from, { key: m.from, sid: m.sid, name: m.name }); send({ t: 'held', to: m.from }); beep(520); toast(`${m.name} منتظر پذیرش است.`); renderSide('users'); badges(); return; }
      admit({ key: m.from, sid: m.sid, name: m.name });
    },
    bye(m) { R.pending.delete(m.from); depart(m.from); sendPeople(); renderSide('users'); renderTiles(); },
    answer(m) { const pc = R.peers.get(m.from)?.pc; pc?.setRemoteDescription(m.sdp).then(() => flushIce(pc)).catch(() => {}); },
    ice(m) { if (m.from) addIce(R.peers.get(m.from)?.pc, m.c); },
    async 'up-offer'(m) {
      if (!R.people.has(m.from)) return; const p = peer(m.from); p.up?.close(); const pc = p.up = new RTCPeerConnection(ICE());
      pc.ontrack = e => { p.stream = e.streams[0]; R.recMix?.add(p.stream); hear(m.from, p.stream); busIn(m.from, p.stream); renderTiles(); };
      pc.onicecandidate = e => e.candidate && send({ t: 'up-ice', to: m.from, c: e.candidate.toJSON() });
      await pc.setRemoteDescription(m.sdp); flushIce(pc); await pc.setLocalDescription(await pc.createAnswer()); send({ t: 'up-answer', to: m.from, sdp: pc.localDescription.toJSON() });
    },
    'up-ice'(m) { if (m.from) addIce(R.peers.get(m.from)?.up, m.c); },
    'up-none'(m) { hear(m.from, null); busIn(m.from, null); const p = R.peers.get(m.from); if (p) { p.up?.close(); p.up = null; p.stream = null; renderTiles(); } },
    media(m) { const v = R.people.get(m.from); if (v) { v.mic = m.mic; v.cam = m.cam; sendPeople(); renderSide('users'); } },
    hand(m) { const v = R.people.get(m.from); if (!v) return; v.hand = m.up ? Date.now() : 0; if (m.up) { if (v.sid) st(v.sid).hands++; beep(700); toast(`${v.name} دستش را بالا برد.`); } sendPeople(); renderSide('users'); },
    react(m) { const v = R.people.get(m.from); if (!v) return; v.react = m.e; v.reactAt = Date.now(); if (m.e && v.sid) st(v.sid).reacts++; sendPeople(); renderSide('users'); },
    status(m) { const v = R.people.get(m.from); if (v) { v.away = m.away; sendPeople(); renderSide('users'); } },
    vote(m) { const p = R.poll; if (!p || p.closed || p.id !== m.id || !m.sid) return; if (p.votes[m.sid] == null) st(m.sid).votes++; p.votes[m.sid] = m.v; saveSoon(); send({ t: 'poll', poll: pollPublic(p) }); renderSide('poll'); },
    chat(m) { if (R.cfg.locks.chat && !m.m.host) return; addChat(R.main, m.m); if (m.m.sid) st(m.m.sid).msgs++; },
    notes(m) { if (!R.cfg.locks.notes) setNotes(m.text, m.by); },
    page(m) { if (m.from === R.presenter) applyPage(R.main, m); },
    'pg-add'(m) { if (m.from === R.presenter) applyPgAdd(R.main, m); },
    vp(m) { if (m.from === R.presenter) { R.main.vp = m.vp; if (R.sp === R.main) { paintBoard(); renderNav(); } } },
    fly(m) { fly(m.e); },
  };
  const allowed = from => { const v = R.people.get(from); return v && (from === R.presenter || R.allWrite || R.writers.has(v.sid)); };
  ['add', 'del', 'upd', 'set'].forEach(k => { HOST[k] = m => { if (allowed(m.from)) applyOp(R.main, m); }; });
  const STUDENT = {
    'host-here'() { R.waiting = true; waitMsg('منتظر ورود معلم…'); hello(); },
    held() { waitMsg('منتظر پذیرش معلم…'); },
    denied(m) { out('ورود ممکن نشد', m.full ? `ظرفیت این جلسه (${fa(m.full)} نفر) پر است.` : 'معلم ورود شما به این کلاس را نپذیرفت.'); },
    kick() { out('بیرون از کلاس', 'معلم شما را از این جلسه بیرون کرد.'); },
    state(m) {
      R.waiting = false; waitMsg(null); R.hostName = m.hostName; R.startedAt = m.startedAt; R.main = m.main; if (!R.room) R.sp = R.main;
      R.cfg = m.cfg; R.notes = m.notes || ''; R.notesBy = m.notesBy || ''; R.poll = m.poll; R.timer = m.timer; R.recOn = m.rec; R.ext = m.ext; renderExt();
      R.mainView = m.view; if (!R.room) setView(m.view);
      const rr = $r('.lv-rec-on'); if (rr) rr.hidden = !R.recOn;
      applyLocks(); renderAll(); if (R.poll && !R.poll.closed && R.myVote[R.poll.id] == null) pollPop(R.poll);
      if (R.mic || R.cam) upOffer(); else if (!R.cfg.joinMuted && !R.cfg.locks.mic && !R.cfg.askTalk && !R.triedMic) { R.triedMic = true; toggleMic(); }
    },
    people(m) {
      R.people = new Map(m.list.filter(v => v.key !== R.me.key).map(v => [v.key, v])); R.self = m.list.find(v => v.key === R.me.key) || null;
      R.hostName = m.host.name; R.hostAway = m.host.away; R.hostReact = m.host.react; R.hostMic = m.host.mic; R.hostCam = m.host.cam;
      const pr = R.presenter !== m.presenter || R.allWrite !== m.allWrite || R.writers.has(R.me.sid) !== m.writers.includes(R.me.sid);
      R.presenter = m.presenter; R.allWrite = m.allWrite; R.writers = new Set(m.writers);
      if (R.self) { R.hand = !!R.self.hand; fbState('hand', R.hand); R.mayTalk = !!R.self.talk; }
      if (pr) { renderTools(); renderNav(); if (!mayDraw()) { R.cur = null; R.sel = null; } }
      renderSide('users'); badges();
    },
    page(m) { applyPage(R.main, m); }, 'pg-add'(m) { applyPgAdd(R.main, m); },
    vp(m) { R.main.vp = m.vp; if (R.sp === R.main) { paintBoard(); renderNav(); } },
    decks(m) { const s = R.main; s.decks = m.decks; s.deck = m.d; s.page = m.p; s.vp = { z: 1, x: 0, y: 0 }; if (R.sp === s) { paintBoard(); renderNav(); } },
    view(m) { R.mainView = m.view; if (!R.room) setView(m.view); },
    ext(m) { R.ext = m.ext; renderExt(); if (R.ext && R.view === 'ext') syncExt(); },
    'ext-ctl'(m) { if (R.ext) { Object.assign(R.ext, { playing: m.playing, t: m.t, at: m.at }); syncExt(); } },
    chat(m) { addChat(R.main, m.m); }, 'chat-clear'() { R.main.chat.length = 0; renderSide('chat'); },
    poll(m) { const was = R.poll?.id; R.poll = m.poll; if (m.poll && !m.poll.closed && m.poll.id !== was) pollNotice(m.poll); else if (!m.poll || m.poll.closed) { pollPop(null); const p = m.poll, v = p && R.myVote[p.id];
      if (p?.closed && p.quiz && v != null && !p.told) { p.told = true; toast(v === p.correct ? 'آزمونک تمام شد: پاسخ شما درست بود.' : `آزمونک تمام شد؛ پاسخ درست: ${p.opts[p.correct]}`); } } renderSide('poll'); },
    cfg(m) { R.cfg = m.cfg; applyLocks(); },
    async offer(m) {
      R.pc?.close(); R.rCam = R.rScreen = null; const pc = R.pc = new RTCPeerConnection(ICE());
      pc.ontrack = e => { const s = e.streams[0]; if (s.id === m.ids.mix) { const a = R.mixEl || (R.mixEl = new Audio()); a.srcObject = s; a.play().catch(() => {}); return; } if (s.id === m.ids.screen) R.rScreen = s; else R.rCam = s; renderTiles(); if (R.view === 'screen' || R.view === 'cam') setView(R.view); };
      pc.onicecandidate = e => e.candidate && send({ t: 'ice', from: R.me.key, c: e.candidate.toJSON() });
      await pc.setRemoteDescription(m.sdp); flushIce(pc); await pc.setLocalDescription(await pc.createAnswer()); send({ t: 'answer', from: R.me.key, sdp: pc.localDescription.toJSON() });
    },
    ice(m) { if (m.to) addIce(R.pc, m.c); },
    nomedia() { R.pc?.close(); R.pc = null; R.rCam = R.rScreen = null; renderTiles(); if (R.view === 'screen' || R.view === 'cam') setView(R.view); },
    'up-answer'(m) { R.up?.setRemoteDescription(m.sdp).then(() => flushIce(R.up)).catch(() => {}); },
    'up-ice'(m) { if (m.to) addIce(R.up, m.c); },
    praise(m) { const l = Behavior.skill(m.k)[1]; beep(m.v > 0 ? 990 : 440, .18); toast(m.v > 0 ? `آفرین! +۱ ${l} از ${R.hostName}` : `−۱ ${l}؛ ${R.hostName} یادآوری کرد.`); },
    talk(m) { R.mayTalk = m.on; beep(m.on ? 880 : 520); if (m.on) { if (!R.mic) toggleMic().then(() => R?.mic && toast('معلم اجازهٔ صحبت داد؛ میکروفونت روشن است.')); } else { if (R.mic) toggleMic(false); toast('اجازهٔ صحبت تمام شد.'); } },
    mute(m) { if (m.all && m.except === R.me.key) return; R.mayTalk = false; if (R.mic) { toggleMic(false); toast('معلم میکروفون شما را خاموش کرد.'); } },
    timer(m) { R.timer = m.timer; tick(); },
    notes(m) { setNotes(m.text, m.by); },
    rec(m) { R.recOn = m.on; const rr = $r('.lv-rec-on'); if (rr) rr.hidden = !m.on; },
    fly(m) { fly(m.e); },
    speak(m) { R.heard = m.keys; },
    breakout(m) { const r = m.br.rooms.find(x => x.keys.includes(R.me.key)); if (r) enterRoom(r, m.br.until); },
    'br-time'(m) { if (R.room) R.room.until = m.until; },
    'br-msg'(m) { toast(`پیام معلم: ${m.text}`); beep(700); const sp = R.room?.sp || R.main; addChat(sp, { id: rid(), sys: true, text: `پیام معلم به همهٔ اتاق‌ها: ${m.text}`, at: nowIso() }); },
    'br-end'() { if (R.room) { leaveRoom(); toast('اتاق‌های جانبی تمام شد؛ به کلاس اصلی برگشتید.'); } },
    'host-away'() { R.waiting = true; waitMsg('معلم موقتاً از کلاس بیرون رفت…'); },
    end(m) { const o = R.o; leave(false); o.render(); modal(`<h2>کلاس تمام شد</h2><p>معلم کلاس «${esc(m.title)}» را به پایان رساند. ممنون که آمدی!</p><div class="row" style="margin-top:14px"><button class="btn primary" data-close>باشه</button></div>`); },
  };
  ['add', 'del', 'upd', 'set'].forEach(k => { STUDENT[k] = m => applyOp(R.main, m); });
  function onMain(m) {
    if (!R) return;
    if (R.host) return HOST[m.t]?.(m);
    if (m.to && m.to !== R.me.key) return;
    STUDENT[m.t]?.(m);
  }
  function waitMsg(t) { const w = $r('.lv-wait'); if (!w) return; w.hidden = !t; if (t) w.querySelector('b').textContent = t; }
  function out(title, text) { const o = R.o; leave(false); o.render(); modal(`<h2>${title}</h2><p>${text}</p><div class="row" style="margin-top:14px"><button class="btn primary" data-close>باشه</button></div>`); }
  function applyLocks() {
    const l = R.cfg.locks || {}; if (l.mic && R.mic) toggleMic(false); if (!R.host && R.cfg.askTalk && !R.mayTalk && R.mic) toggleMic(false); if (l.cam && R.cam) toggleCam(false);
    ['mic', 'cam'].forEach(k => { const b = $r(`.lv-ctrls [data-lv="${k}"]`); if (b) { b.classList.toggle('locked', !!l[k]); b.title = l[k] ? 'معلم بسته است' : k === 'mic' ? 'میکروفون' : 'دوربین'; } });
    renderSide();
  }

  /* ---- events ---- */
  const ACT = {
    details: b => detailsMenu(b), rec: () => toggleRec(), dash: () => dashboard(R.x, R.o), more: b => moreMenu(b), plus: b => plusMenu(b),
    leave: b => R.host ? menu(b, [{ ic: IC.leave, label: 'خروج موقت از کلاس', run: () => leave(true) }, { ic: IC.end, label: 'پایان کلاس برای همه', danger: true, run: endAsk }]) : leave(true),
    'timer-menu': b => menu(b, [{ ic: IC.timer, label: 'زمان‌سنج تازه', run: timerModal }, { ic: IC.clear, label: 'توقف زمان‌سنج', run: () => setTimer(null) }]),
    mic: () => toggleMic(), cam: () => toggleCam(), screen: () => toggleScreen(), react: b => reactMenu(b), hand: () => setHand(!R.hand),
    pres: () => { R.presMin = !R.presMin; applyLayout(); }, min: () => { R.presMin = true; applyLayout(); }, side: () => { prefs.side = !prefs.side; savePrefs(); applyLayout(); if (prefs.side) renderSide(); },
    palette: b => palette(b), undo: () => undo(false), redo: () => undo(true), clear: () => clearPage(), 'tb-fold': () => { R.tbFold = !R.tbFold; renderTools(); },
    multi: () => { R.allWrite = !R.allWrite; sendPeople(); renderTools(); renderSide('users'); toast(R.allWrite ? 'تختهٔ چندکاربره: همه می‌توانند بنویسند.' : 'نوشتن دانش‌آموزان بسته شد.'); },
    'pg-prev': () => goPage(R.sp.deck, R.sp.page - 1), 'pg-next': () => goPage(R.sp.deck, R.sp.page + 1), 'pg-add': () => addPage(),
    'zoom-in': () => zoom(R.sp.vp.z + .25), 'zoom-out': () => zoom(R.sp.vp.z - .25), fit: () => zoom(1), 'pres-mgr': () => presModal(),
    'chat-more': b => chatMenu(b), 'users-gear': b => gearMenu(b), 'user-more': b => userMenu(b, b.dataset.key), 'give-talk': b => giveTalk(b.dataset.key, true), 'notes-dl': () => download(`یادداشت-${R.x.title}.txt`, R.notes),
    admit: b => { const v = R.pending.get(b.dataset.key); if (v) admit(v); }, 'admit-all': () => [...R.pending.values()].forEach(admit),
    deny: b => { R.pending.delete(b.dataset.key); send({ t: 'denied', to: b.dataset.key }); renderSide('users'); },
    'br-go': b => visitRoom(+b.dataset.k), 'br-back': () => backMain(),
    'br-more': () => { R.br.until += 300000; send({ t: 'br-time', until: R.br.until }); tick(); toast('۵ دقیقه به اتاق‌ها اضافه شد.'); },
    'br-end': async () => { if (await UI.ask('پایان اتاق‌ها', 'همهٔ دانش‌آموزان به کلاس اصلی برگردند؟', 'پایان اتاق‌ها')) endBr(); },
    ptype: b => { const f = pf(), t = PTYPES.find(p => p[0] === b.dataset.k); f.type = t[0]; f.opts = t[2].slice(); f.correct = 0; if (f.type === 'text') f.quiz = false; renderSide('poll'); },
    'popt-add': () => { pf().opts.push(''); renderSide('poll'); }, 'poll-close': () => pollClose(), 'poll-board': () => pollBoard(),
    'poll-new': () => { R.poll = null; send({ t: 'poll', poll: null }); renderSide('poll'); },
    vote: b => vote(+b.dataset.i), 'ppop-x': () => pollPop(null), 'rest-x': () => $r('.lv-rest')?.remove(), 'ppop-open': () => { pollPop(null); openSide('poll'); $r('#lv-pans')?.focus(); }, unmute: b => { const v = $r('.lv-ext video'); if (v) { v.muted = false; b.hidden = true; } },
  };
  function onClick(e) {
    if (!R) return;
    if (R.menu && !e.target.closest('.lv-menu')) { const same = e.target.closest('[data-lv]') === R.menu.btn; closeMenu(); if (same) return; }
    if (e.target.closest('.lv-menu')) return;
    const t = e.target.closest('[data-tool]'); if (t) return setTool(t.dataset.tool);
    const sd = e.target.closest('[data-side]'); if (sd) return openSide(sd.dataset.side);
    const b = e.target.closest('[data-lv]'); if (!b || b.disabled) return;
    ACT[b.dataset.lv]?.(b, e);
  }
  function onSubmit(e) {
    e.preventDefault(); const f = e.target;
    if (f.matches('.lv-send')) { const i = f.querySelector('#lv-msg'), t = i.value.trim(); if (t) sendChat(t); }
    else if (f.matches('.lv-pform')) pollStart();
    else if (f.matches('.lv-ptext')) { const t = f.querySelector('#lv-pans').value.trim(); if (t) vote(t); }
    else if (f.matches('.lv-brmsg')) { const t = f.querySelector('#lv-brm').value.trim(); if (!t) return; send({ t: 'br-msg', text: t }); R.brDraft = ''; f.querySelector('#lv-brm').value = ''; toast('پیام به همهٔ اتاق‌ها رفت.'); }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'lv-msg') R.draft = t.value;
    else if (t.id === 'lv-brm') R.brDraft = t.value;
    else if (t.id === 'lv-notes') { R.notes = t.value; R.notesBy = R.me.name; clearTimeout(R.nT); R.nT = setTimeout(() => { send({ t: 'notes', text: R.notes, by: R.me.name }); if (R.host) saveSoon(); }, 350); }
    else if (t.id === 'lv-pq') pf().q = t.value;
    else if (t.classList.contains('lv-po')) pf().opts[+t.dataset.i] = t.value;
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'lv-pgsel') goPage(R.sp.deck, +t.value);
    else if (t.id === 'lv-panon') pf().anon = t.checked;
    else if (t.id === 'lv-pquiz') { pf().quiz = t.checked; renderSide('poll'); }
    else if (t.classList.contains('lv-pc')) pf().correct = +t.value;
  }
  function onKey(e) {
    if (!R || document.querySelector('.modal-back')) return;
    if (e.key === 'Escape' && R.menu) { closeMenu(); return; }
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = { KeyM: () => toggleMic(), KeyC: () => toggleCam(), KeyH: () => !R.host && setHand(!R.hand), KeyR: () => reactMenu($r('[data-lv="react"]')), KeyU: () => openSide('users'), KeyG: () => { openSide('chat'); $r('#lv-msg')?.focus(); } }[e.code];
      if (k) { e.preventDefault(); k(); } return;
    }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); return undo(e.shiftKey); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); return undo(true); }
    if (e.ctrlKey || e.metaKey || R.view !== 'board') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && R.sel && mayDraw()) { const s = curPage()?.s.find(x => x.id === R.sel); if (s) { e.preventDefault(); R.sel = null; doOp({ t: 'del', id: s.id }, { t: 'add', s }); } return; }
    const tool = { KeyV: 'select', KeyH: 'pan', KeyP: 'pen', KeyM: 'marker', KeyE: 'eraser', KeyA: 'arrow', KeyL: 'line', KeyT: 'text', KeyN: 'note', KeyR: 'rect', KeyO: 'ellipse' }[e.code];
    if (tool && mayDraw()) { e.preventDefault(); return setTool(tool); }
    if (!canNav()) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPage(R.sp.deck, R.sp.page + 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); goPage(R.sp.deck, R.sp.page - 1); }
    else if (e.key === '+' || e.key === '=') zoom(R.sp.vp.z + .25); else if (e.key === '-') zoom(R.sp.vp.z - .25); else if (e.code === 'Digit0') zoom(1);
  }

  async function endAsk() { if (await UI.ask('پایان کلاس', 'کلاس برای همه بسته شود؟ حضور، گفت‌وگو، تخته و ضبط در گزارش جلسه می‌ماند.', 'پایان کلاس')) end(); }
  function end() {
    const { x, o } = R;
    if (R.br) endBr();
    [...R.people.keys()].forEach(depart); Object.values(x.att).forEach(a => { delete a.since; });
    x.status = 'done'; x.endedAt = nowIso(); x.hostAt = 0; persist();
    send({ t: 'end', title: x.title });
    leave(false); if (o.after) o.after(x.id); else o.render(); toast(`کلاس تمام شد · ${fa(present(x))} نفر حاضر بودند.`);
  }
  function leave(announce) {
    if (!R) return;
    closeMenu(); commitText();
    if (R.rec?.state === 'recording') R.rec.stop();
    if (announce) unload(); else if (R.host) persist();
    [R.cam, R.mic, R.screen].forEach(s => s?.getTracks().forEach(t => t.stop()));
    R.peers.forEach(p => { p.pc?.close(); p.up?.close(); }); R.pc?.close(); R.up?.close();
    R.br?.rooms.forEach(r => r.chan.close()); R.room?.chan.close();
    clearInterval(R.tickT); clearInterval(R.vadT); R.vad?.ac?.close().catch(() => {}); R.bus?.ac.close().catch(() => {}); if (R.mixEl) { R.mixEl.pause(); R.mixEl.srcObject = null; } clearTimeout(R.pT); clearTimeout(R.nT); R.ro?.disconnect(); R.chan.close(); if (NET.on) netStop(); if (R.extUrl) URL.revokeObjectURL(R.extUrl);
    removeEventListener('beforeunload', unload); document.removeEventListener('keydown', onKey);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (R.title0) document.title = R.title0;
    $room()?.remove(); document.body.classList.remove('lv-open');
    const o = R.o; R = null; if (announce) o.render();
  }

  /* ======================= course page actions ======================= */
  function act(name, b, c, o) {
    const x = b?.dataset.id ? sessOf(c, b.dataset.id) : null; if (x) REC_CTX.set(x, o);
    if (name === 'lv-new') return sessionModal(c, o);
    if (name === 'lv-edit') return sessionModal(c, o, x);
    if (name === 'lv-report') return report(c, o, x);
    if (name === 'lv-dash') return dashboard(x, o);
    if (name === 'lv-rec') return x.recs.length > 1 ? recsModal(c, o) : playRec(x, 0);
    if (name === 'lv-recs') return recsModal(c, o);
    if (name === 'lv-finish') return UI.ask('پایان جلسه', `جلسهٔ «${x.title}» تمام‌شده ثبت شود؟ حضور و گفت‌وگو در گزارش جلسه می‌ماند.`, 'پایان جلسه').then(ok => { if (!ok) return; finish(x); o.save(); if (o.after) o.after(x.id); else o.render(); toast('جلسه به پایان رسید.'); });
    if (name === 'lv-del') return UI.ask('حذف جلسه', `جلسهٔ «${x.title}» حذف شود؟`, 'حذف کن').then(ok => { if (!ok) return; (x.recs || []).forEach(q => IDB.del('rec:' + q.id)); live(c).sessions = live(c).sessions.filter(y => y.id !== x.id); o.save(); o.render(); });
    if (name === 'lv-now') { const s = blank({ title: `کلاس ${o.sub}`, date: today(), from: hm(), to: '', cls: null }); live(c).sessions.push(s); o.save(); return open(c, o, s, null); }
    if (name === 'lv-join') return open(c, o, x, o.as());
  }

  // Classes on air now for a student, across every subject (the home page's quick entry).
  const onAirFor = (x, s) => Object.entries(x.classroom || {}).flatMap(([sub, c]) => (c.live?.sessions || [])
    .filter(v => onAir(v) && (!v.cls || v.cls === s.cls)).map(v => ({ sub, id: v.id, title: v.title, startedAt: v.startedAt })));
  // One ended session in numbers, for the page that opens after the class (classroom.js).
  function brief(c, o, id) {
    const x = sessOf(c, id); if (!x) return null; const r = roster(o, x);
    return { x, mins: mins(x), total: r.length, present: r.filter(s => x.att?.[s.id]).length, absent: r.filter(s => !x.att?.[s.id]), chat: (x.chat || []).filter(m => !m.sys).length, polls: (x.polls || []).length, recs: (x.recs || []).length, cls: clsName(o, x.cls) };
  }
  return { card, tab, act, onAirFor, brief, room: open, active: () => !!R };
})();
