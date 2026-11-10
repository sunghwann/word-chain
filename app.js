import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const FB_VER = '10.14.1';

/* =========================================================
   한글 · 사전
   ========================================================= */
const split = ch => { const c = ch.charCodeAt(0) - 0xAC00; return [Math.floor(c / 588), Math.floor(c % 588 / 28), c % 28]; };
const join = (a, b, c) => String.fromCharCode(0xAC00 + a * 588 + b * 28 + c);
const IY = [2, 6, 7, 12, 17, 20]; // ㅑㅕㅖㅛㅠㅣ
function dueum(ch) {
  const [i, v, f] = split(ch); const iy = IY.includes(v);
  if (i === 5) return join(iy ? 11 : 2, v, f); // ㄹ → ㅇ/ㄴ
  if (i === 2 && iy) return join(11, v, f);    // ㄴ → ㅇ
  return null;
}
const starts = ch => { const d = dueum(ch); return d ? [ch, d] : [ch]; };
const endOf = w => w[w.length - 1];
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dictUrl = w => 'https://stdict.korean.go.kr/search/searchResult.do?searchKeyword=' + encodeURIComponent(w);

let FULL = null, BY = {}, CBY = {}, COMMON = [];
async function loadDict() {
  try {
    const res = await fetch('words.bin');
    if (!res.ok) throw new Error(res.status);
    const txt = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
    const d = JSON.parse(txt);
    const f = d.f.split('\n'); COMMON = d.c.split('\n');
    FULL = new Set(f);
    for (const w of f) (BY[w[0]] || (BY[w[0]] = [])).push(w);
    for (const w of COMMON) (CBY[w[0]] || (CBY[w[0]] = [])).push(w);
    $('dictState').textContent = `사전 준비 완료 · 표제어 ${f.length.toLocaleString()}개`;
    document.querySelectorAll('[data-new]').forEach(b => b.disabled = false);
  } catch (e) {
    $('dictState').textContent = '사전을 불러오지 못했어요. 최신 브라우저에서, 웹 주소(https)로 열어 주세요.';
  }
}
// 대상 단어 집합(used)을 기준으로 남은 단어 수
function remainingFn(used) {
  const usedBy = {};
  for (const w of used) if (FULL.has(w)) usedBy[w[0]] = (usedBy[w[0]] || 0) + 1;
  return ch => starts(ch).reduce((n, s) => n + ((BY[s] || []).length - (usedBy[s] || 0)), 0);
}
const cands = (map, ch, used) => starts(ch).flatMap(s => map[s] || []).filter(w => !used.has(w));
function startWord() {
  const rem = remainingFn(new Set());
  return pick(COMMON.filter(w => w.length <= 3 && rem(endOf(w)) >= 80));
}
// 입력 검사: 오류 문구 또는 null(통과) 또는 'unknown'(사전에 없음)
function check(w, last, used) {
  if (!w) return '단어를 입력해 주세요.';
  if (!/^[가-힣]+$/.test(w)) return '완성된 한글로만 입력해 주세요.';
  if (w.length < 2) return '두 글자 이상이어야 해요.';
  if (last && !starts(last).includes(w[0])) return `“${starts(last).join('” 또는 “')}”(으)로 시작해야 해요.`;
  if (used.has(w)) return '이미 나온 단어예요.';
  if (!FULL.has(w)) return w.endsWith('다') ? '‘-다’로 끝나는 동사·형용사는 쓸 수 없어요.' : 'unknown';
  return null;
}

/* =========================================================
   공통 UI
   ========================================================= */
const LV = {
  easy: { name: '하수', time: 0, hints: 3, pt: 10, bonus: 30 },
  mid: { name: '중수', time: 20, hints: 1, pt: 20, bonus: 100 },
  hard: { name: '고수', time: 12, hints: 0, pt: 30, bonus: 250 }
};
const MAX_ACCEPT = 3;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};

let view = 'home';
function show(v) {
  view = v;
  for (const s of ['home', 'pvp', 'rank', 'rules']) $('v-' + s).classList.toggle('hidden', s !== v);
  document.querySelectorAll('.rtabs [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
  if (v === 'rank') renderBoard();
}
document.querySelectorAll('.rtabs [role=tab]').forEach(b => b.onclick = () => show(b.dataset.view));

function chainItem(w, who, opts = {}) {
  const li = document.createElement('li'); if (opts.me) li.className = 'me';
  const a = document.createElement('a'); a.className = 'w'; a.href = dictUrl(w); a.target = '_blank'; a.rel = 'noopener';
  a.title = '표준국어대사전에서 찾기';
  a.innerHTML = esc(w.slice(0, -1)) + '<b>' + esc(endOf(w)) + '</b>';
  li.appendChild(a);
  if (opts.accepted) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = '인정'; li.appendChild(t); }
  const by = document.createElement('span'); by.className = 'by'; by.textContent = who; li.appendChild(by);
  return li;
}
function sysItem(t) { const li = document.createElement('li'); li.className = 'sys'; li.textContent = t; return li; }
function noteBox(el, kind, html, acts = []) {
  el.innerHTML = '';
  if (!html) return;
  const d = document.createElement('div'); d.className = 'note' + (kind ? ' ' + kind : ''); d.innerHTML = html;
  if (acts.length) {
    const r = document.createElement('div'); r.className = 'acts';
    for (const [label, fn, primary] of acts) { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = label; b.onclick = fn; r.appendChild(b); }
    d.appendChild(r);
  }
  el.appendChild(d);
}
function nextInfo(el, last) {
  if (!last) { el.textContent = ''; return; }
  const d = dueum(last);
  el.innerHTML = `다음 글자 <b>${esc(last)}</b>${d ? ` 또는 <b>${esc(d)}</b>` : ''}`;
}
function dialog(title, desc, stat, againLabel, onAgain) {
  $('dlgTitle').textContent = title; $('dlgDesc').textContent = desc; $('dlgStat').textContent = stat || '';
  $('dlgAgain').textContent = againLabel || '한 판 더';
  $('dlgAgain').classList.toggle('hidden', !onAgain);
  $('dlgAgain').onclick = () => { closeDlg(); onAgain && onAgain(); };
  $('dlg').classList.remove('hidden'); (onAgain ? $('dlgAgain') : $('dlgClose')).focus();
}
function closeDlg() { $('dlg').classList.add('hidden'); }
$('dlgClose').onclick = closeDlg;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDlg(); });

// 작성자(닉네임)
const nickEl = $('nick');
nickEl.value = store.get('kk-nick', '');
const myNick = () => nickEl.value.trim().slice(0, 12);
nickEl.addEventListener('change', () => { store.set('kk-nick', myNick()); saveNick(); });

function status(words, mode, timer) {
  if (words != null) $('sWords').textContent = `단어 ${words}개`;
  if (mode != null) $('sMode').textContent = mode;
  if (timer !== undefined) { $('sTimer').textContent = timer || ''; $('sTimer').className = timer && /^남은 시간 [0-5]초/.test(timer) ? 'warn' : ''; }
}

/* =========================================================
   컴퓨터 대결
   ========================================================= */
const S = { level: 'easy', used: new Set(), last: null, turn: 0, hints: 0, accepts: MAX_ACCEPT, score: 0, busy: false, over: true, pending: null, tEnd: 0, raf: 0 };

function showRec() {
  const r = store.get('kk-rec', {});
  for (const k in LV) { const x = r[k] || { w: 0, l: 0 }; $('r-' + k).textContent = `${x.w}승 ${x.l}패`; }
}
function setSoloInput(on) {
  $('inp').disabled = !on; $('cGiveup').disabled = !on;
  $('cHint').disabled = !on || S.hints <= 0;
  $('cHint').lastChild.textContent = LV[S.level].hints ? `힌트 (${S.hints})` : '힌트';
  if (on) $('inp').focus();
}
function soloPlay(w, who, accepted) {
  S.used.add(w); S.last = endOf(w); S.turn++;
  if (who === 'me' && !accepted) S.score += LV[S.level].pt;
  $('chain').appendChild(chainItem(w, who === 'me' ? (myNick() || '나') : '컴퓨터', { me: who === 'me', accepted }));
  $('entryNo').textContent = (S.turn + 1) + '.';
  nextInfo($('nextInfo'), S.last);
  status(S.turn, `${LV[S.level].name} 대결 · ${S.score}점`);
  $('inp').scrollIntoView({ block: 'nearest' });
}
function soloTimer() {
  cancelAnimationFrame(S.raf); const t = LV[S.level].time;
  if (!t) { status(null, null, '제한 시간 없음'); return; }
  S.tEnd = Date.now() + t * 1000;
  const tick = () => {
    const left = Math.ceil((S.tEnd - Date.now()) / 1000);
    status(null, null, `남은 시간 ${Math.max(0, left)}초`);
    if (left <= 0) soloEnd(false, '제한 시간 안에 단어를 내지 못했어요.');
    else S.raf = requestAnimationFrame(tick);
  };
  tick();
}
function soloStart(lv) {
  if (!FULL) return;
  closeDlg(); show('home');
  Object.assign(S, { level: lv, used: new Set(), last: null, turn: 0, hints: LV[lv].hints, accepts: MAX_ACCEPT, score: 0, busy: false, over: false, pending: null });
  $('soloIdle').classList.add('hidden'); $('soloGame').classList.remove('hidden');
  $('gTitle').textContent = `${LV[lv].name}와(과) 대결`;
  $('chain').innerHTML = ''; noteBox($('note')); $('inp').value = '';
  soloPlay(startWord(), 'ai');
  setSoloInput(true); soloTimer();
}
function aiChoose() {
  const rem = remainingFn(S.used);
  const full = cands(BY, S.last, S.used), com = cands(CBY, S.last, S.used);
  if (S.level === 'easy') {
    if (S.turn >= 6 && Math.random() < .12) return null;
    let pool = com.filter(w => rem(endOf(w)) >= 5); if (!pool.length) pool = com;
    return pool.length ? pick(pool) : null;
  }
  if (S.level === 'mid') {
    const killers = full.filter(w => rem(endOf(w)) === 0);
    if (killers.length && Math.random() < .25) return pick(killers);
    let pool = com.length ? com : full.filter(w => w.length <= 4);
    if (!pool.length) return null;
    pool = pool.map(w => [w, rem(endOf(w))]).sort((a, b) => a[1] - b[1]);
    return pick(pool.slice(0, Math.max(1, Math.ceil(pool.length * .4))))[0];
  }
  if (!full.length) return null;
  let best = Infinity, bw = [];
  for (const w of full) { const r = rem(endOf(w)); if (r < best) { best = r; bw = [w]; } else if (r === best) bw.push(w); }
  const comSet = new Set(com); const cb = bw.filter(w => comSet.has(w)); const pool = cb.length ? cb : bw;
  const short = Math.min(...pool.map(w => w.length));
  return pick(pool.filter(w => w.length === short));
}
function aiTurn() {
  S.busy = true; setSoloInput(false); cancelAnimationFrame(S.raf); status(null, null, '컴퓨터 차례');
  const th = sysItem('컴퓨터가 생각하는 중…'); $('chain').appendChild(th);
  setTimeout(() => {
    th.remove(); if (S.over) return;
    const w = aiChoose();
    if (!w) { $('chain').appendChild(sysItem(`컴퓨터: “${S.last}”(으)로 시작하는 단어가 생각나지 않습니다.`)); soloEnd(true, `컴퓨터가 “${S.last}”(으)로 이어 갈 단어를 찾지 못했어요.`); return; }
    soloPlay(w, 'ai'); S.busy = false; setSoloInput(true); soloTimer();
  }, 450 + Math.random() * 600);
}
function soloSubmit() {
  if (S.busy || S.over) return;
  const w = $('inp').value.trim().replace(/\s/g, '');
  const r = check(w, S.last, S.used);
  if (r === 'unknown') {
    if (S.accepts <= 0) return noteBox($('note'), 'err', `“${esc(w)}”은(는) 사전에 없어요. 이번 판 인정 기회를 모두 썼어요.`);
    S.pending = w;
    return noteBox($('note'), '', `“<b>${esc(w)}</b>”은(는) 사전에 없는 단어예요. 사람 이름·브랜드 같은 고유명사라면 인정하고 낼 수 있어요. <span class="muted">(남은 인정 ${S.accepts}회 · 0점)</span>`,
      [['인정하고 내기', () => soloCommit(w, true), true], ['다시 입력', () => { noteBox($('note')); $('inp').select(); }]]);
  }
  if (r) { noteBox($('note'), 'err', esc(r)); $('inp').select(); return; }
  soloCommit(w, false);
}
function soloCommit(w, accepted) {
  if (S.busy || S.over) return;
  if (accepted) { if (S.pending !== w || S.accepts <= 0) return; S.accepts--; }
  S.pending = null; noteBox($('note')); $('inp').value = '';
  soloPlay(w, 'me', accepted); aiTurn();
}
function soloHint() {
  if (S.hints <= 0 || S.busy || S.over) return;
  const rem = remainingFn(S.used);
  let c = cands(CBY, S.last, S.used); if (!c.length) c = cands(BY, S.last, S.used);
  if (!c.length) return noteBox($('note'), 'err', '이어 갈 단어가 사전에 없어요. 포기하거나 고유명사를 써 보세요.');
  const safe = c.filter(w => rem(endOf(w)) > 0); const w = pick(safe.length ? safe : c);
  S.hints--; setSoloInput(true);
  noteBox($('note'), 'ok', `힌트: <b>${esc(w)}</b>`);
}
function soloEnd(win, why) {
  S.over = true; cancelAnimationFrame(S.raf); setSoloInput(false); S.pending = null;
  if (win) S.score += LV[S.level].bonus;
  const r = store.get('kk-rec', {}); const x = r[S.level] || { w: 0, l: 0 }; win ? x.w++ : x.l++; r[S.level] = x; store.set('kk-rec', r); showRec();
  const best = recordSolo(win);
  status(S.turn, `${LV[S.level].name} 대결 종료 · ${S.score}점`, '');
  setTimeout(() => dialog(win ? '승리했습니다' : '패배했습니다', why,
    `단어 ${S.turn}개 · 이번 판 ${S.score.toLocaleString()}점${best ? ' · 개인 최고 기록' : ''} · ${LV[S.level].name} 전적 ${x.w}승 ${x.l}패`,
    '한 판 더', () => soloStart(S.level)), 500);
}
function soloQuit() { if (!S.over && !S.busy) soloEnd(false, `“${S.last}”에서 포기했어요.`); }

document.querySelectorAll('[data-new]').forEach(b => { b.disabled = true; b.onclick = () => soloStart(b.dataset.new); });
$('inp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); soloSubmit(); } });
$('inp').addEventListener('input', () => { if (S.pending && $('inp').value.trim() !== S.pending) { S.pending = null; noteBox($('note')); } });
$('cHint').onclick = () => { if (view === 'home') soloHint(); };
$('cGiveup').onclick = () => { if (view === 'home') soloQuit(); };

/* =========================================================
   Firebase (랭킹 · 1:1)
   ========================================================= */
let F = null, db = null, uid = null, MINE = null, ROWS = [], rankKey = 'total';
const online = !!(firebaseConfig && firebaseConfig.apiKey);

async function initFirebase() {
  if (!online) {
    $('sNet').textContent = '오프라인 모드';
    $('pvpOff').classList.remove('hidden');
    $('rankMeta').textContent = '온라인 기능이 설정되지 않아 랭킹을 볼 수 없어요. README.md를 참고해 Firebase를 연결해 주세요.';
    $('rankSeg').classList.add('hidden');
    return;
  }
  $('sNet').textContent = '연결 중…';
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    F = fs;
    const a = app.initializeApp(firebaseConfig);
    db = fs.getFirestore(a);
    const au = auth.getAuth(a);
    const cred = await auth.signInAnonymously(au);
    uid = cred.user.uid;
    $('sNet').textContent = '온라인';
    $('pvpLobby').classList.remove('hidden');
    startRanking();
    const m = location.hash.match(/^#([A-Z0-9]{5})$/);
    if (m) { show('pvp'); joinRoom(m[1]); }
  } catch (e) {
    console.error(e);
    $('sNet').textContent = '연결 실패';
    $('pvpOff').classList.remove('hidden');
    $('pvpOff').querySelector('.note').textContent = '온라인 서버에 연결하지 못했어요. Firebase 설정(익명 로그인 사용, Firestore 생성, 승인된 도메인)을 확인해 주세요.';
    $('rankMeta').textContent = '랭킹 서버에 연결하지 못했어요.';
  }
}

/* ---------- 랭킹 ---------- */
function startRanking() {
  $('rankMeta').textContent = '친구들의 기록이 실시간으로 모입니다. 오른쪽 위 작성자 칸에 이름을 적으면 그 이름으로 올라가요.';
  F.onSnapshot(F.query(F.collection(db, 'scores'), F.limit(500)), snap => {
    ROWS = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    MINE = ROWS.find(r => r.id === uid) || null;
    if (MINE && MINE.nick && !myNick()) { nickEl.value = MINE.nick; store.set('kk-nick', MINE.nick); }
    if (view === 'rank') renderBoard();
  }, () => { $('rankMeta').textContent = '랭킹을 불러오지 못했어요. Firestore 규칙을 확인해 주세요.'; });
}
function renderBoard() {
  if (!online || !db) return;
  const k = rankKey;
  const num = v => +v || 0;
  const val = r => k === 'total' ? num(r.total) : k === 'pvp' ? num((r.pvp || {}).w) : num((r[k] || {}).best);
  const wl = r => {
    const ks = k === 'total' ? ['easy', 'mid', 'hard'] : [k];
    let w = 0, l = 0; for (const x of ks) { w += num((r[x] || {}).w); l += num((r[x] || {}).l); }
    return `${w}승 ${l}패`;
  };
  const rows = ROWS.filter(r => val(r) > 0).sort((a, b) => val(b) - val(a) || num(a.updatedAt) - num(b.updatedAt)).slice(0, 50);
  const board = $('board');
  if (!rows.length) { board.innerHTML = '<p class="muted">아직 기록이 없습니다.</p>'; return; }
  const head = k === 'pvp' ? ['순위', '이름', '승', '전적'] : ['순위', '이름', k === 'total' ? '종합 점수' : '최고 점수', '전적'];
  const t = document.createElement('table');
  t.innerHTML = `<thead><tr>${head.map((h, i) => `<th class="${i >= 2 ? 'n' : ''}"${i === 0 ? ' style="width:56px"' : ''}>${h}</th>`).join('')}</tr></thead>`;
  const tb = document.createElement('tbody');
  rows.forEach((r, i) => {
    const tr = document.createElement('tr'); if (r.id === uid) tr.className = 'mine';
    [String(i + 1), String(r.nick || '').slice(0, 12) || '이름 없음', val(r).toLocaleString(), wl(r)].forEach((c, j) => {
      const td = document.createElement('td'); td.textContent = c; if (j >= 2) td.className = 'n'; tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb); board.replaceChildren(t);
}
document.querySelectorAll('#rankSeg button').forEach(b => b.onclick = () => {
  rankKey = b.dataset.k; document.querySelectorAll('#rankSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderBoard();
});

let writeChain = Promise.resolve();
function myBody() { const b = MINE ? structuredClone(MINE) : {}; delete b.id; b.nick = myNick() || b.nick || ''; return b; }
function writeMine(b) {
  if (!db || !uid) return;
  b.total = ['easy', 'mid', 'hard'].reduce((n, k) => n + (+((b[k] || {}).best) || 0), 0);
  b.updatedAt = Date.now();
  MINE = Object.assign({ id: uid }, b);
  $('savedState').textContent = '· 저장 중…';
  writeChain = writeChain.then(() => F.setDoc(F.doc(db, 'scores', uid), b))
    .then(() => { $('savedState').textContent = '· 저장됨'; })
    .catch(e => { console.error(e); $('savedState').textContent = '· 저장 실패'; });
}
function recordSolo(win) {
  if (!db || !uid) return false;
  const b = myBody(); const x = Object.assign({ best: 0, w: 0, l: 0 }, b[S.level] || {});
  const best = S.score > x.best; if (best) x.best = S.score; win ? x.w++ : x.l++; b[S.level] = x;
  writeMine(b); return best;
}
function recordPvp(win) {
  if (!db || !uid) return;
  const b = myBody(); const x = Object.assign({ w: 0, l: 0 }, b.pvp || {}); win ? x.w++ : x.l++; b.pvp = x; writeMine(b);
}
function saveNick() { if (db && uid && MINE) { const b = myBody(); writeMine(b); } }

/* ---------- 1:1 대결 ---------- */
const PVP_LIMIT = 20;
let room = null, roomRef = null, unsubRoom = null, pTick = 0, timeoutSent = 0;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => pick(CODE_CHARS)).join('');
const other = r => r.host === uid ? r.guest : r.host;
const nameOf = (r, id) => id === r.host ? (r.hostNick || '방장') : id === r.guest ? (r.guestNick || '참가자') : '';

async function makeRoom() {
  if (!db || !FULL) return;
  $('mkRoom').disabled = true;
  try {
    for (let i = 0; i < 5; i++) {
      const code = newCode(); const ref = F.doc(db, 'rooms', code);
      const ok = await F.runTransaction(db, async t => {
        const s = await t.get(ref); if (s.exists()) return false;
        t.set(ref, { code, host: uid, hostNick: myNick() || '방장', guest: null, guestNick: '', status: 'waiting', round: 1, words: [], turn: null, turnStart: 0, pending: null, winner: null, reason: '', acc: {}, createdAt: Date.now() });
        return true;
      });
      if (ok) { openRoom(code); return; }
    }
    noteBox($('lobbyNote'), 'err', '방을 만들지 못했어요. 다시 시도해 주세요.');
  } catch (e) { console.error(e); noteBox($('lobbyNote'), 'err', '방을 만들지 못했어요. Firestore 규칙을 확인해 주세요.'); }
  finally { $('mkRoom').disabled = false; }
}
async function joinRoom(code) {
  code = (code || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{5}$/.test(code)) return noteBox($('lobbyNote'), 'err', '입장 코드 5자리를 입력해 주세요.');
  if (!db) return;
  if (!FULL) { setTimeout(() => joinRoom(code), 500); return; }
  const ref = F.doc(db, 'rooms', code);
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(ref); if (!s.exists()) throw new Error('없는 방이에요. 코드를 확인해 주세요.');
      const r = s.data();
      if (r.host === uid || r.guest === uid) return;
      if (r.guest) throw new Error('이미 두 명이 들어간 방이에요.');
      t.update(ref, { guest: uid, guestNick: myNick() || '참가자', status: 'playing', words: [{ w: startWord(), by: 'sys' }], turn: r.host, turnStart: Date.now(), pending: null, acc: { [r.host]: MAX_ACCEPT, [uid]: MAX_ACCEPT } });
    });
    openRoom(code);
  } catch (e) { noteBox($('lobbyNote'), 'err', esc(e.message || '참가하지 못했어요.')); }
}
function openRoom(code) {
  if (unsubRoom) unsubRoom();
  roomRef = F.doc(db, 'rooms', code); room = null; timeoutSent = 0;
  $('pvpLobby').classList.add('hidden'); $('pvpRoom').classList.remove('hidden'); noteBox($('lobbyNote'));
  const link = location.origin + location.pathname + '#' + code;
  $('roomCode').textContent = code; $('roomLink').value = link;
  try { history.replaceState(null, '', '#' + code); } catch (e) { }
  unsubRoom = F.onSnapshot(roomRef, s => { if (s.exists()) renderRoom(s.data()); });
  clearInterval(pTick); pTick = setInterval(pvpClock, 250);
}
function leaveRoom() {
  if (unsubRoom) unsubRoom(); unsubRoom = null; clearInterval(pTick); room = null; roomRef = null;
  $('pvpRoom').classList.add('hidden'); $('pvpLobby').classList.remove('hidden');
  try { history.replaceState(null, '', location.pathname); } catch (e) { }
  status(0, '대기', '');
}
let shownRound = null, recorded = store.get('kk-pvp-rec', {});
function renderRoom(r) {
  const prev = room; room = r;
  const me = r.host === uid || r.guest === uid;
  if (!me) { leaveRoom(); noteBox($('lobbyNote'), 'err', '이 방에 참가하지 않은 상태예요.'); return; }
  const waiting = r.status === 'waiting';
  $('roomWait').classList.toggle('hidden', !waiting); $('roomPlay').classList.toggle('hidden', waiting);
  if (waiting) { $('roomTitle').textContent = '상대를 기다리는 중'; status(0, '1:1 대기', ''); return; }

  const opp = other(r);
  $('roomTitle').textContent = `${nameOf(r, r.host)} 대 ${nameOf(r, r.guest)}`;
  const ol = $('pChain'); ol.innerHTML = '';
  r.words.forEach(x => {
    if (x.by === 'sys') { const li = chainItem(x.w, '시작 단어'); ol.appendChild(li); }
    else ol.appendChild(chainItem(x.w, nameOf(r, x.by), { me: x.by === uid, accepted: x.acc }));
  });
  const last = endOf(r.words[r.words.length - 1].w);
  const myTurn = r.status === 'playing' && r.turn === uid;
  $('pEntryNo').textContent = (r.words.length + 1) + '.';
  $('pInp').disabled = !myTurn || !!r.pending;
  $('pInp').placeholder = myTurn ? '내 차례예요. 단어를 입력하고 Enter' : r.status === 'playing' ? `${nameOf(r, opp)}의 차례` : '';
  if (myTurn && (!prev || prev.turn !== uid)) { $('pInp').value = ''; setTimeout(() => $('pInp').focus(), 30); }
  nextInfo($('pNext'), r.status === 'playing' ? last : null);
  $('pGiveup').classList.toggle('hidden', r.status !== 'playing');
  $('pRematch').classList.toggle('hidden', r.status !== 'done');

  // 인정 요청
  if (r.status === 'playing' && r.pending) {
    if (r.pending.by === uid) noteBox($('pNote'), '', `“<b>${esc(r.pending.w)}</b>” 인정 요청을 보냈어요. ${esc(nameOf(r, opp))}의 답을 기다리는 중…`);
    else noteBox($('pNote'), '', `${esc(nameOf(r, r.pending.by))}이(가) 사전에 없는 단어 “<b>${esc(r.pending.w)}</b>”을(를) 인정해 달래요.`,
      [['인정', () => answerPending(true), true], ['거절', () => answerPending(false)]]);
  } else if (prev && prev.pending && !r.pending && prev.pending.by === uid && r.turn === uid && r.status === 'playing') {
    noteBox($('pNote'), 'err', `“${esc(prev.pending.w)}”은(는) 거절됐어요. 다른 단어를 내 주세요.`);
  } else if (!prev || prev.words.length !== r.words.length || prev.status !== r.status) noteBox($('pNote'));

  status(r.words.length, `1:1 · ${nameOf(r, uid)}`);
  if (r.status === 'done') {
    const key = r.code + ':' + r.round;
    const win = r.winner === uid;
    if (!recorded[key]) { recorded[key] = 1; store.set('kk-pvp-rec', recorded); recordPvp(win); }
    if (shownRound !== key) {
      shownRound = key;
      const why = r.reason === 'timeout' ? `${nameOf(r, r.winner === r.host ? r.guest : r.host)}의 시간 초과` : `${nameOf(r, r.winner === r.host ? r.guest : r.host)}의 포기`;
      status(null, null, '');
      dialog(win ? '승리했습니다' : '패배했습니다', why, `단어 ${r.words.length}개 이어짐`, '다시 하기', rematch);
    }
  }
}
function pvpClock() {
  const r = room; if (!r || r.status !== 'playing') return;
  const left = Math.ceil((r.turnStart + PVP_LIMIT * 1000 - Date.now()) / 1000);
  status(null, null, `${r.turn === uid ? '내 차례' : nameOf(r, r.turn) + ' 차례'} · 남은 시간 ${Math.max(0, left)}초`);
  if (left <= -1 && timeoutSent !== r.turnStart) { timeoutSent = r.turnStart; finishTimeout(r.turnStart); }
}
async function finishTimeout(ts) {
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const r = s.data();
      if (r.status !== 'playing' || r.turnStart !== ts) return;
      t.update(roomRef, { status: 'done', winner: r.turn === r.host ? r.guest : r.host, reason: 'timeout', pending: null });
    });
  } catch (e) { console.error(e); }
}
async function pvpSubmit() {
  const r = room; if (!r || r.status !== 'playing' || r.turn !== uid || r.pending) return;
  const w = $('pInp').value.trim().replace(/\s/g, '');
  const used = new Set(r.words.map(x => x.w));
  const last = endOf(r.words[r.words.length - 1].w);
  const c = check(w, last, used);
  if (c === 'unknown') {
    if ((r.acc || {})[uid] <= 0) return noteBox($('pNote'), 'err', `“${esc(w)}”은(는) 사전에 없어요. 이번 판 인정 기회를 모두 썼어요.`);
    return noteBox($('pNote'), '', `“<b>${esc(w)}</b>”은(는) 사전에 없어요. 상대에게 인정을 요청할까요? <span class="muted">(남은 요청 ${(r.acc || {})[uid]}회)</span>`,
      [['인정 요청', () => requestAccept(w), true], ['다시 입력', () => { noteBox($('pNote')); $('pInp').select(); }]]);
  }
  if (c) { noteBox($('pNote'), 'err', esc(c)); $('pInp').select(); return; }
  $('pInp').disabled = true;
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const x = s.data();
      if (x.status !== 'playing' || x.turn !== uid) throw new Error('차례가 아니에요.');
      const u = new Set(x.words.map(y => y.w)); if (u.has(w)) throw new Error('이미 나온 단어예요.');
      t.update(roomRef, { words: [...x.words, { w, by: uid }], turn: other(x), turnStart: Date.now(), pending: null });
    });
    $('pInp').value = ''; noteBox($('pNote'));
  } catch (e) { noteBox($('pNote'), 'err', esc(e.message || '보내지 못했어요.')); $('pInp').disabled = false; }
}
async function requestAccept(w) {
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const x = s.data();
      if (x.status !== 'playing' || x.turn !== uid || x.pending) throw new Error('지금은 요청할 수 없어요.');
      if (!((x.acc || {})[uid] > 0)) throw new Error('인정 기회를 모두 썼어요.');
      t.update(roomRef, { pending: { w, by: uid } });
    });
  } catch (e) { noteBox($('pNote'), 'err', esc(e.message)); }
}
async function answerPending(ok) {
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const x = s.data();
      if (x.status !== 'playing' || !x.pending || x.pending.by === uid) return;
      const by = x.pending.by;
      if (!ok) { t.update(roomRef, { pending: null }); return; }
      const acc = Object.assign({}, x.acc); acc[by] = (acc[by] || 0) - 1;
      t.update(roomRef, { words: [...x.words, { w: x.pending.w, by, acc: true }], turn: uid, turnStart: Date.now(), pending: null, acc });
    });
  } catch (e) { console.error(e); }
}
async function pvpGiveup() {
  if (!room || room.status !== 'playing') return;
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const x = s.data(); if (x.status !== 'playing') return;
      t.update(roomRef, { status: 'done', winner: other(x), reason: 'giveup', pending: null });
    });
  } catch (e) { console.error(e); }
}
async function rematch() {
  if (!room || !roomRef) return;
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const x = s.data(); if (x.status !== 'done') return;
      const loser = x.winner === x.host ? x.guest : x.host;
      t.update(roomRef, { status: 'playing', round: (x.round || 1) + 1, words: [{ w: startWord(), by: 'sys' }], turn: loser, turnStart: Date.now(), pending: null, winner: null, reason: '', acc: { [x.host]: MAX_ACCEPT, [x.guest]: MAX_ACCEPT } });
    });
  } catch (e) { console.error(e); }
}

$('mkRoom').onclick = makeRoom;
$('joinBtn').onclick = () => joinRoom($('joinCode').value);
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('joinCode').value); });
$('pInp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); pvpSubmit(); } });
$('pGiveup').onclick = pvpGiveup;
$('pRematch').onclick = rematch;
$('pLeave').onclick = leaveRoom;
$('copyLink').onclick = async () => {
  try { await navigator.clipboard.writeText($('roomLink').value); $('copyLink').textContent = '복사됨'; }
  catch (e) { $('roomLink').select(); $('copyLink').textContent = 'Ctrl+C로 복사'; }
  setTimeout(() => $('copyLink').textContent = '링크 복사', 1500);
};

/* ========================================================= */
showRec();
loadDict();
initFirebase();
