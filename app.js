import { firebaseConfig, appCheckSiteKey } from './firebase-config.js?v=202611100836';

// 배포할 때마다 바꾸는 버전. version.json과 같아야 함
const APP_VERSION = '202611100836';

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
// 입력창 밑줄을 남은 시간만큼 줄임 (frac: 0~1, null이면 꽉 참)
function timeBar(el, frac, low) {
  el.style.setProperty('--t', (frac == null ? 100 : Math.max(0, Math.min(1, frac)) * 100) + '%');
  el.classList.toggle('low', !!low);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dictUrl = w => 'https://stdict.korean.go.kr/search/searchResult.do?searchKeyword=' + encodeURIComponent(w);

let FULL = null, VERBS = new Set(), EXTRA = new Set(), BY = {}, CBY = {}, COMMON = [];
async function loadDict() {
  try {
    const res = await fetch('words.bin?v=' + APP_VERSION);
    if (!res.ok) throw new Error(res.status);
    const txt = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
    const d = JSON.parse(txt);
    const f = d.f.split('\n'); COMMON = d.c.split('\n');
    FULL = new Set(f);
    for (const w of f) (BY[w[0]] || (BY[w[0]] = [])).push(w);
    for (const w of COMMON) (CBY[w[0]] || (CBY[w[0]] = [])).push(w);
    if (d.v) VERBS = new Set(d.v.split('\n'));
    if (d.x) EXTRA = new Set(d.x.split('\n')); // 방언·옛말·북한어: 사람만 // 동사·형용사: 사람만 쓸 수 있음(컴퓨터·힌트는 명사만)
    $('dictState').textContent = `사전 준비 완료 · 명사 ${f.length.toLocaleString()}개 · 동사·형용사 ${VERBS.size.toLocaleString()}개 · 방언·옛말·북한어 ${EXTRA.size.toLocaleString()}개`;
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
// 입력 검사: 오류 문구 또는 null(통과)
function check(w, last, used, allowExtra = true) {
  if (!w) return '단어를 입력해 주세요.';
  if (!/^[가-힣]+$/.test(w)) return '완성된 한글로만 입력해 주세요.';
  if (w.length < 2) return '두 글자 이상이어야 해요.';
  if (last && !starts(last).includes(w[0])) return `“${starts(last).join('” 또는 “')}”(으)로 시작해야 해요.`;
  if (used.has(w)) return '이미 나온 단어예요.';
  if (EXTRA.has(w) && !FULL.has(w) && !VERBS.has(w) && !allowExtra) return `“${w}”은(는) 방언·옛말·북한어라 고수에서만 쓸 수 있어요.`;
  if (!FULL.has(w) && !VERBS.has(w) && !EXTRA.has(w)) return `“${w}”은(는) 사전에 없는 단어예요.`;
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
  if (EXTRA.has(w)) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = '비표준어'; t.title = '방언·옛말·북한어'; li.appendChild(t); }
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

// 닉네임이 없으면 먼저 입력받고 이어서 진행
let nickThen = null;
function needNick(then) {
  if (myNick()) { then(); return; }
  nickThen = then;
  $('nickDlgInp').value = ''; $('nickDlgErr').textContent = '';
  $('nickDlg').classList.remove('hidden'); setTimeout(() => $('nickDlgInp').focus(), 30);
}
function nickOk() {
  const n = $('nickDlgInp').value.trim().slice(0, 12);
  if (!n) { $('nickDlgErr').textContent = '닉네임을 한 글자 이상 입력해 주세요.'; return; }
  nickEl.value = n; store.set('kk-nick', n); saveNick();
  $('nickDlg').classList.add('hidden');
  const t = nickThen; nickThen = null; t && t();
}
$('nickDlgOk').onclick = nickOk;
$('nickDlgInp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); nickOk(); } });
$('nickDlgCancel').onclick = () => { nickThen = null; $('nickDlg').classList.add('hidden'); };

function status(words, mode, timer) {
  if (words != null) $('sWords').textContent = `단어 ${words}개`;
  if (mode != null) $('sMode').textContent = mode;
  if (timer !== undefined) { $('sTimer').textContent = timer || ''; $('sTimer').className = timer && /^남은 시간 [0-5]초/.test(timer) ? 'warn' : ''; }
}

/* =========================================================
   컴퓨터 대결
   ========================================================= */
const S = { level: 'easy', used: new Set(), last: null, turn: 0, hints: 0, score: 0, busy: false, over: true, pending: null, tEnd: 0, raf: 0 };

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
function soloPlay(w, who) {
  S.used.add(w); S.last = endOf(w); S.turn++;
  if (who === 'me') S.score += LV[S.level].pt;
  $('chain').appendChild(chainItem(w, who === 'me' ? (myNick() || '나') : '컴퓨터', { me: who === 'me' }));
  $('entryNo').textContent = (S.turn + 1) + '.';
  nextInfo($('nextInfo'), S.last);
  status(S.turn, `${LV[S.level].name} 대결 · ${S.score}점`);
  $('inp').scrollIntoView({ block: 'nearest' });
}
function soloTimer() {
  cancelAnimationFrame(S.raf); const t = LV[S.level].time;
  if (!t) { status(null, null, '제한 시간 없음'); timeBar($('inp'), null); return; }
  S.tEnd = Date.now() + t * 1000;
  const tick = () => {
    const ms = S.tEnd - Date.now(), left = Math.ceil(ms / 1000);
    timeBar($('inp'), ms / (t * 1000), left <= 5);
    status(null, null, `남은 시간 ${Math.max(0, left)}초`);
    if (left <= 0) soloEnd(false, '제한 시간 안에 단어를 내지 못했어요.');
    else S.raf = requestAnimationFrame(tick);
  };
  tick();
}
function soloStart(lv) {
  if (!FULL) return;
  closeDlg(); show('home');
  Object.assign(S, { level: lv, used: new Set(), last: null, turn: 0, hints: LV[lv].hints, score: 0, busy: false, over: false, pending: null });
  startSession(lv);
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
  S.busy = true; setSoloInput(false); cancelAnimationFrame(S.raf); status(null, null, '컴퓨터 차례'); timeBar($('inp'), null);
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
  const r = check(w, S.last, S.used, S.level === 'hard'); // 비표준어는 고수에서만
  if (r) { noteBox($('note'), 'err', esc(r)); $('inp').select(); return; }
  soloCommit(w);
}
function soloCommit(w) {
  if (S.busy || S.over) return;
  noteBox($('note')); $('inp').value = '';
  soloPlay(w, 'me'); aiTurn();
}
function soloHint() {
  if (S.hints <= 0 || S.busy || S.over) return;
  const rem = remainingFn(S.used);
  let c = cands(CBY, S.last, S.used); if (!c.length) c = cands(BY, S.last, S.used);
  if (!c.length) return noteBox($('note'), 'err', '이어 갈 단어가 사전에 없어요. 포기할 수밖에 없겠네요.');
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
  const me = myRank('sum'), meB = myRank('best');
  setTimeout(() => dialog(win ? '승리했습니다' : '패배했습니다', why,
    `단어 ${S.turn}개 · 이번 판 ${S.score.toLocaleString()}점${best ? ' · 개인 최고 기록' : ''} · ${LV[S.level].name} 전적 ${x.w}승 ${x.l}패${me ? ` · 누적 ${me.pos}위 · 최고 ${meB ? meB.pos : '-'}위` : ''}`,
    '한 판 더', () => soloStart(S.level)), 500);
}
function soloQuit() { if (!S.over && !S.busy) soloEnd(false, `“${S.last}”에서 포기했어요.`); }

document.querySelectorAll('[data-new]').forEach(b => { b.disabled = true; b.onclick = () => needNick(() => soloStart(b.dataset.new)); });
$('inp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); soloSubmit(); } });
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
    // App Check: 이 사이트에서 온 요청만 받도록 (사이트 키가 있을 때만)
    if (appCheckSiteKey) {
      const ac = await import(base + 'firebase-app-check.js');
      ac.initializeAppCheck(a, { provider: new ac.ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    db = fs.getFirestore(a);
    const au = auth.getAuth(a);
    const cred = await auth.signInAnonymously(au);
    uid = cred.user.uid;
    $('sNet').textContent = '온라인';
    $('pvpLobby').classList.remove('hidden');
    startRanking();
    const m = location.hash.match(/^#([A-Z0-9]{5})$/);
    if (m) { show('pvp'); needNick(() => joinRoom(m[1])); }
    if (!S.over && !S.session) startSession(S.level); // 접속 전에 시작한 판도 기록되게
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
    renderBoard();
  }, () => { $('rankMeta').textContent = '랭킹을 불러오지 못했어요. Firestore 규칙을 확인해 주세요.'; });
}
const LVN = { easy: '하수', mid: '중수', hard: '고수' };
let rankMode = 'sum'; // 'sum' 누적 점수 | 'best' 최고 점수
function bestOf(r) { // 종합 최고 점수: 세 난이도 중 가장 높은 한 판
  let v = 0, lv = '';
  for (const x of ['easy', 'mid', 'hard']) { const b = +((r[x] || {}).best) || 0; if (b > v) { v = b; lv = x; } }
  return { v, lv };
}
function rankRows(k, rows, mode = rankMode) {
  const num = v => +v || 0;
  const lv = (r, x) => r[x] || {};
  const games = r => k === 'total' ? ['easy', 'mid', 'hard'].reduce((n, x) => n + num(lv(r, x).w) + num(lv(r, x).l), 0)
    : num(lv(r, k).w) + num(lv(r, k).l);
  const val = r => k === 'pvp' ? num(lv(r, 'pvp').w)
    : mode === 'best' ? (k === 'total' ? bestOf(r).v : num(lv(r, k).best))
    : (k === 'total' ? num(r.total) : num(lv(r, k).sum));
  const ms = t => (t && typeof t.toMillis === 'function') ? t.toMillis() : 0;
  return rows.filter(r => games(r) > 0)
    .sort((a, b) => val(b) - val(a) || games(b) - games(a) || ms(a.updatedAt) - ms(b.updatedAt))
    .map(r => ({ r, val: val(r), games: games(r) }));
}
function myRank(mode = 'sum') {
  if (!MINE) return null;
  const rows = ROWS.filter(r => r.id !== uid).concat([MINE]);
  const list = rankRows('total', rows, mode); const i = list.findIndex(x => x.r.id === uid);
  return i < 0 ? null : { pos: i + 1, of: list.length };
}
function renderBoard() {
  if (!online || !db) return;
  const k = rankKey, m = rankMode, num = v => +v || 0;
  $('modeSeg').classList.toggle('hidden', k === 'pvp');
  const list = rankRows(k, ROWS).slice(0, 100);
  const board = $('board');
  if (!list.length) { board.innerHTML = '<p class="muted">아직 기록이 없습니다. 한 판 하면 바로 올라가요.</p>'; return; }
  let head;
  if (k === 'pvp') head = ['순위', '이름', '승', '전적'];
  else if (m === 'sum') head = k === 'total' ? ['순위', '이름', '누적 점수', '판 수'] : ['순위', '이름', '누적 점수', '최고 점수', '전적'];
  else head = k === 'total' ? ['순위', '이름', '최고 점수', '난이도', '판 수'] : ['순위', '이름', '최고 점수', '누적 점수', '전적'];
  const t = document.createElement('table');
  t.innerHTML = `<thead><tr>${head.map((h, i) => `<th class="${i >= 2 ? 'n' : ''}"${i === 0 ? ' style="width:56px"' : ''}>${h}</th>`).join('')}</tr></thead>`;
  const tb = document.createElement('tbody');
  list.forEach(({ r, val, games }, i) => {
    const tr = document.createElement('tr'); if (r.id === uid) tr.className = 'mine';
    const x = r[k] || {};
    let cells;
    if (k === 'pvp') cells = [i + 1, '', val.toLocaleString(), `${num(x.w)}승 ${num(x.l)}패`];
    else if (m === 'sum') cells = k === 'total' ? [i + 1, '', val.toLocaleString(), `${games}판`]
      : [i + 1, '', val.toLocaleString(), num(x.best).toLocaleString(), `${num(x.w)}승 ${num(x.l)}패`];
    else cells = k === 'total' ? [i + 1, '', val.toLocaleString(), LVN[bestOf(r).lv] || '-', `${games}판`]
      : [i + 1, '', val.toLocaleString(), num(x.sum).toLocaleString(), `${num(x.w)}승 ${num(x.l)}패`];
    cells[1] = String(r.nick || '').slice(0, 12) || '이름 없음';
    cells.forEach((c, j) => { const td = document.createElement('td'); td.textContent = String(c); if (j >= 2) td.className = 'n'; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  t.appendChild(tb); board.replaceChildren(t);
  const a = myRank('sum'), b2 = myRank('best');
  $('rankMeta').textContent = '게임할 때마다 실시간으로 갱신됩니다.' + (a ? ` 내 종합 순위: 누적 ${a.pos}위 · 최고 ${b2 ? b2.pos : '-'}위 (${a.of}명 중)` : '');
}
document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => {
  rankMode = b.dataset.m; document.querySelectorAll('#modeSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderBoard();
});
document.querySelectorAll('#rankSeg button').forEach(b => b.onclick = () => {
  rankKey = b.dataset.k; document.querySelectorAll('#rankSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderBoard();
});

/* 기록 저장 — firestore.rules가 검사하는 형식 그대로 보냄 */
const CAP = { easy: 1500, mid: 3000, hard: 4500 };
let writeChain = Promise.resolve(), lastWriteAt = 0, nickTimer = 0;
const scoreRef = () => F.doc(db, 'scores', uid);
const sessionRef = () => F.doc(db, 'sessions', uid);
function myBody() {
  const src = MINE || {};
  const b = { nick: myNick() || src.nick || '' };
  // 규칙이 검사하는 모양 그대로 항상 전부 채워서 보냄
  for (const k of ['easy', 'mid', 'hard']) { const x = src[k] || {}; b[k] = { best: +x.best || 0, sum: +x.sum || 0, w: +x.w || 0, l: +x.l || 0 }; }
  const p = src.pvp || {}; b.pvp = { w: +p.w || 0, l: +p.l || 0 };
  return b;
}
function finish(b) {
  b.total = ['easy', 'mid', 'hard'].reduce((n, k) => n + ((b[k] || {}).sum || 0), 0); // 누적 점수
  b.updatedAt = F.serverTimestamp(); lastWriteAt = Date.now();
  MINE = Object.assign({ id: uid }, b, { updatedAt: null });
  return b;
}
function queue(fn) {
  $('savedState').textContent = '· 저장 중…';
  writeChain = writeChain.then(fn)
    .then(() => { $('savedState').textContent = '· 저장됨'; })
    .catch(e => {
      console.error(e);
      const denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
      $('savedState').textContent = denied ? '· 랭킹 저장 거부됨' : '· 저장 실패';
      $('savedState').title = denied ? 'Firestore 규칙이 최신인지 확인해 주세요.' : String(e && e.message || e);
    });
}
// 컴퓨터 대결 시작 기록(세션). 끝날 때 이 세션을 지우면서 점수를 올려야 규칙을 통과함
function startSession(level) {
  if (!db || !uid) { S.session = null; return; }
  S.session = F.setDoc(sessionRef(), { level, startedAt: F.serverTimestamp() }).then(() => true, e => { console.error(e); return false; });
}
function recordSolo(win) {
  if (!db || !uid || !S.session) return false;
  const b = myBody(); const x = Object.assign({ best: 0, sum: 0, w: 0, l: 0 }, b[S.level] || {});
  const sc = Math.min(S.score, CAP[S.level]);
  const best = sc > x.best; if (best) x.best = sc; x.sum += sc; win ? x.w++ : x.l++; b[S.level] = x;
  finish(b);
  const sess = S.session; S.session = null;
  queue(async () => {
    if (!(await sess)) throw new Error('세션이 없어 기록하지 못함');
    const batch = F.writeBatch(db);
    batch.set(scoreRef(), b); batch.delete(sessionRef());
    await batch.commit();
  });
  return best;
}
function recordPvp(win, code, round) {
  if (!db || !uid) return;
  const b = myBody(); const x = Object.assign({ w: 0, l: 0 }, b.pvp || {}); win ? x.w++ : x.l++; b.pvp = x;
  finish(b);
  queue(async () => {
    if (!win) return F.setDoc(scoreRef(), b);
    const id = `${code}_${round}_${uid}`;
    b.lastClaim = id;
    const batch = F.writeBatch(db);
    batch.set(F.doc(db, 'claims', id), { code, round, uid });
    batch.set(scoreRef(), b);
    await batch.commit();
  });
}
// 닉네임은 5초에 한 번만 저장 가능 → 몰아서 한 번에
function saveNick() {
  if (!db || !uid) return;
  clearTimeout(nickTimer);
  const wait = Math.max(0, lastWriteAt + 6000 - Date.now());
  nickTimer = setTimeout(() => {
    if (MINE && MINE.nick === myNick()) return;
    const b = finish(myBody());
    queue(() => F.setDoc(scoreRef(), b));
  }, wait);
}

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
        t.set(ref, { code, host: uid, hostNick: myNick() || '방장', guest: null, guestNick: '', status: 'waiting', round: 1, words: [], turn: null, turnStart: 0, pending: null, winner: null, reason: '', acc: {}, createdAt: F.serverTimestamp() });
        t.set(F.doc(db, 'limits', uid), { lastRoomAt: F.serverTimestamp() }); // 방 만들기는 30초에 한 번
        return true;
      });
      if (ok) { openRoom(code); return; }
    }
    noteBox($('lobbyNote'), 'err', '방을 만들지 못했어요. 다시 시도해 주세요.');
  } catch (e) { console.error(e); noteBox($('lobbyNote'), 'err', '방을 만들지 못했어요. 방은 30초에 하나씩 만들 수 있어요. 잠시 후 다시 시도해 주세요.'); }
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
      t.update(ref, { guest: uid, guestNick: myNick() || '참가자', status: 'playing', words: [{ w: startWord(), by: 'sys' }], turn: r.host, turnStart: Date.now(), pending: null, acc: {} });
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
    else ol.appendChild(chainItem(x.w, nameOf(r, x.by), { me: x.by === uid }));
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

  if (!prev || prev.words.length !== r.words.length || prev.status !== r.status) noteBox($('pNote'));

  status(r.words.length, `1:1 · ${nameOf(r, uid)}`);
  if (r.status === 'done') {
    const key = r.code + ':' + r.round;
    const win = r.winner === uid;
    if (!recorded[key]) { recorded[key] = 1; store.set('kk-pvp-rec', recorded); recordPvp(win, r.code, r.round || 1); }
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
  const ms = r.turnStart + PVP_LIMIT * 1000 - Date.now(), left = Math.ceil(ms / 1000);
  timeBar($('pInp'), ms / (PVP_LIMIT * 1000), left <= 5);
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
      t.update(roomRef, { status: 'playing', round: (x.round || 1) + 1, words: [{ w: startWord(), by: 'sys' }], turn: loser, turnStart: Date.now(), pending: null, winner: null, reason: '', acc: {} });
    });
  } catch (e) { console.error(e); }
}

$('mkRoom').onclick = () => needNick(makeRoom);
$('joinBtn').onclick = () => needNick(() => joinRoom($('joinCode').value));
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') needNick(() => joinRoom($('joinCode').value)); });
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
/* =========================================================
   새 버전 자동 적용: 서버의 version.json이 바뀌면 새로고침
   (게임 중이면 끝날 때까지 기다렸다가 안내)
   ========================================================= */
let newVersion = null;
async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = (await r.json()).v;
    if (!v || v === APP_VERSION) return;
    newVersion = v;
    const busy = !S.over || (room && room.status === 'playing');
    if (!busy) reloadNew();
    else $('savedState').textContent = '· 새 버전 있음 (판이 끝나면 적용)';
  } catch (e) { }
}
function reloadNew() {
  const u = location.pathname + '?v=' + encodeURIComponent(newVersion) + location.hash;
  location.replace(u);
}
setInterval(checkVersion, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
setTimeout(checkVersion, 3000);
// 판이 끝난 뒤 새 버전이 있으면 결과 창을 닫을 때 적용
$('dlgClose').addEventListener('click', () => { if (newVersion && S.over && !(room && room.status === 'playing')) reloadNew(); });

showRec();
loadDict();
initFirebase();
