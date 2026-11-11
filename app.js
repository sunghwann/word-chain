import { firebaseConfig, appCheckSiteKey } from './firebase-config.js?v=202611110112';

// 배포할 때마다 바꾸는 버전. version.json과 같아야 함
const APP_VERSION = '202611110112';

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

let FULL = null, VERBS = new Set(), EXTRA = new Set(), XBY = {}, CNT = {}, BY = {}, CBY = {}, COMMON = [];
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
    if (d.x) EXTRA = new Set(d.x.split('\n')); // 방언·옛말·북한어: 사람은 언제나, 컴퓨터는 고수에서만
    for (const w of EXTRA) (XBY[w[0]] || (XBY[w[0]] = [])).push(w);
    // 사람이 받아칠 수 있는 단어 수(첫 글자별): 명사 + 동사·형용사 + 방언 등
    for (const set of [FULL, VERBS, EXTRA]) for (const w of set) CNT[w[0]] = (CNT[w[0]] || 0) + 1;
    $('dictState').textContent = `사전 준비 완료 · 명사 ${f.length.toLocaleString()}개 · 동사·형용사 ${VERBS.size.toLocaleString()}개 · 방언·옛말·북한어 ${EXTRA.size.toLocaleString()}개`;
    document.querySelectorAll('[data-new]').forEach(b => b.disabled = false);
  } catch (e) {
    $('dictState').textContent = '사전을 불러오지 못했어요. 최신 브라우저에서, 웹 주소(https)로 열어 주세요.';
  }
}
// 대상 단어 집합(used)을 기준으로 남은 단어 수
function remainingFn(used) {
  const usedBy = {};
  for (const w of used) usedBy[w[0]] = (usedBy[w[0]] || 0) + 1;
  return ch => starts(ch).reduce((n, s) => n + ((CNT[s] || 0) - (usedBy[s] || 0)), 0);
}
const RUDE = /좆|좃|씹|씨발|시발|보지|자지|니미|개새|병신|븅신|엿먹|똥구멍|불알|음경|음부|성기/;
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

/* ---------- 뜻풀이 팝업 (새 창을 열지 않음 → 반칙으로 안 잡힘). 모바일은 아예 안 띄움 ---------- */
const IS_MOBILE = matchMedia('(hover: none) and (pointer: coarse)').matches || /iPhone|iPad|Android/.test(navigator.userAgent);
const shards = new Map();
function defOf(w) {
  const key = w.charCodeAt(0).toString(16);
  if (!shards.has(key)) shards.set(key, fetch(`dict/${key}.json?v=${APP_VERSION}`).then(r => r.ok ? r.json() : {}).catch(() => ({})));
  return shards.get(key).then(m => m[w] || null);
}
let pop = null;
function closePop() { if (pop) { pop.remove(); pop = null; } }
async function showMeaning(w, anchor) {
  closePop();
  pop = document.createElement('div'); pop.className = 'defpop'; pop.setAttribute('role', 'dialog');
  pop.innerHTML = `<div class="defpop-h"><b>${esc(w)}</b><button class="defpop-x" aria-label="닫기">×</button></div><div class="defpop-b muted">뜻 불러오는 중…</div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect(), pw = Math.min(360, innerWidth - 24);
  pop.style.width = pw + 'px';
  pop.style.left = Math.max(12, Math.min(r.left, innerWidth - pw - 12)) + 'px';
  pop.style.top = (r.bottom + 6 + scrollY) + 'px';
  pop.querySelector('.defpop-x').onclick = closePop;
  const me = pop, d = await defOf(w);
  if (pop !== me) return;
  const tags = [EXTRA.has(w) ? '방언·옛말·북한어' : '', VERBS.has(w) ? '동사·형용사' : ''].filter(Boolean).join(' · ');
  const body = !d ? (VERBS.has(w) ? '동사·형용사는 뜻풀이가 아직 준비되지 않았어요.' : '이 단어는 뜻풀이가 준비되지 않았어요.') : typeof d === 'string' ? esc(d) : d.map((x, i) => `${'①②③④'[i] || '·'} ${esc(x)}`).join('<br>');
  me.querySelector('.defpop-b').className = 'defpop-b';
  me.querySelector('.defpop-b').innerHTML = (tags ? `<span class="tag" style="margin:0 0 6px;display:inline-block">${tags}</span><br>` : '') + body;
}
document.addEventListener('click', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.w')) closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
document.querySelector('.canvas').addEventListener('scroll', closePop, { passive: true });
function wordEl(w, html) {
  const el = document.createElement(IS_MOBILE ? 'span' : 'button');
  el.className = 'w'; el.innerHTML = html;
  if (!IS_MOBILE) { el.type = 'button'; el.title = '뜻 보기'; el.onclick = e => { e.preventDefault(); showMeaning(w, el); }; }
  return el;
}
function chainItem(w, who, opts = {}) {
  const li = document.createElement('li'); if (opts.me) li.className = 'me';
  li.appendChild(wordEl(w, esc(w.slice(0, -1)) + '<b>' + esc(endOf(w)) + '</b>'));
  if (opts.killer) { const t = document.createElement('span'); t.className = 'tag kill'; t.textContent = '한방'; t.title = '이어 갈 단어가 사전에 없는 단어'; li.appendChild(t); }
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
// 졌을 때 '이런 단어를 낼 수 있었어요' (흔한 말 → 사전 명사 → 동사 → 방언 순으로 최대 5개)
function couldPlay(last, used) {
  if (!last || !FULL) return null;
  const out = [], seen = new Set(), add = w => { if (out.length < 5 && !used.has(w) && !seen.has(w)) { seen.add(w); out.push(w); } };
  const ss = starts(last);
  for (const map of [CBY, BY, XBY]) for (const s0 of ss) for (const w of (map[s0] || []).slice().sort(() => Math.random() - .5)) add(w);
  if (out.length < 5) for (const w of VERBS) if (ss.includes(w[0])) add(w);
  return out;
}
function tipHtml(last, used, lastWord) {
  const ws = couldPlay(last, used);
  if (!ws) return '';
  const n = remainingFn(used)(last);
  const lw = lastWord ? `“${esc(lastWord)}”은(는) ` : '';
  if (!ws.length || n === 0) return `💥 ${lw}<b>한방 단어</b>였어요. “${esc(starts(last).join('·'))}”(으)로 이어 갈 단어가 사전에 하나도 없어요.`;
  const head = n <= 5 ? `⚠️ ${lw}<b>준한방 단어</b>였어요. 이어 갈 단어가 ${n}개뿐이에요: ` : '이런 단어를 낼 수 있었어요: ';
  return head + ws.map(w => `<span class="tipw" data-w="${esc(w)}"><b>${esc(w)}</b></span>`).join(', ');
}
// 결과 창 팁의 단어도 PC에선 팝업으로 뜻 보기
$('dlgTip').addEventListener('click', e => {
  const t = e.target.closest('.tipw'); if (!t || IS_MOBILE) return;
  e.stopPropagation(); showMeaning(t.dataset.w, t);
});
function dialog(title, desc, stat, againLabel, onAgain, tip) {
  $('dlgTitle').textContent = title; $('dlgDesc').textContent = desc; $('dlgStat').textContent = stat || '';
  $('dlgTip').innerHTML = tip || ''; $('dlgTip').classList.toggle('hidden', !tip);
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
  $('inp').disabled = !on; $('cGiveup').disabled = !on; $('dGiveup').disabled = !on; $('sendBtn').disabled = !on;
  $('cHint').disabled = $('dHint').disabled = !on || S.hints <= 0;
  $('cHint').lastChild.textContent = $('dHint').textContent = LV[S.level].hints ? `힌트 (${S.hints})` : '힌트 없음';
  if (on) $('inp').focus({ preventScroll: true });
}
function soloPlay(w, who) {
  S.used.add(w); S.last = endOf(w); S.turn++;
  if (who === 'me') S.score += LV[S.level].pt;
  const killer = remainingFn(S.used)(endOf(w)) === 0;
  $('chain').appendChild(chainItem(w, who === 'me' ? (myNick() || '나') : '컴퓨터', { me: who === 'me', killer }));
  $('entryNo').textContent = (S.turn + 1) + '.';
  nextInfo($('nextInfo'), S.last);
  status(S.turn, `${LV[S.level].name} 대결 · ${S.score}점`);
  scrollEnd();
}
// 단어 목록 맨 아래(최신 단어)로 스크롤. 입력 도크는 화면 아래에 고정돼 있음
function scrollEnd() { const c = document.querySelector('.canvas'); requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; }); }
function soloTimer() {
  cancelAnimationFrame(S.raf); const t = LV[S.level].time;
  if (!t) { status(null, null, '제한 시간 없음'); timeBar($('inp'), null); $('soloTime').textContent = '제한 시간 없음'; $('soloTime').classList.remove('low'); return; }
  S.tEnd = Date.now() + t * 1000;
  const tick = () => {
    const ms = S.tEnd - Date.now(), left = Math.ceil(ms / 1000);
    timeBar($('inp'), ms / (t * 1000), left <= 5);
    status(null, null, `남은 시간 ${Math.max(0, left)}초`);
    $('soloTime').textContent = `남은 시간 ${Math.max(0, left)}초`; $('soloTime').classList.toggle('low', left <= 5);
    if (left <= 0) soloEnd(false, '제한 시간 안에 단어를 내지 못했어요.');
    else S.raf = requestAnimationFrame(tick);
  };
  tick();
}
function soloStart(lv) {
  document.body.classList.add('playing');
  if (!FULL) return;
  closeDlg(); show('home');
  Object.assign(S, { level: lv, used: new Set(), last: null, turn: 0, hints: LV[lv].hints, score: 0, busy: false, over: false, pending: null, away: 0 });
  startSession(lv);
  $('soloIdle').classList.add('hidden'); $('soloGame').classList.remove('hidden');
  $('gTitle').textContent = `${LV[lv].name}와(과) 대결`;
  $('chain').innerHTML = ''; noteBox($('note')); $('inp').value = '';
  soloPlay(startWord(), 'ai');
  setSoloInput(true); soloTimer();
}
function aiChoose() {
  const rem = remainingFn(S.used);
  // 고수만 방언·옛말·북한어까지 씀. 컴퓨터는 비속어는 쓰지 않음(회사에서도 쓰는 게임이라)
  const clean = w => !RUDE.test(w);
  const full = (S.level === 'hard' ? cands(BY, S.last, S.used).concat(cands(XBY, S.last, S.used)) : cands(BY, S.last, S.used)).filter(clean);
  const com = cands(CBY, S.last, S.used).filter(clean);
  if (S.level === 'easy') {
    if (S.turn >= 6 && Math.random() < .12) return null;
    let pool = com.filter(w => rem(endOf(w)) >= 5); if (!pool.length) pool = com;
    return pool.length ? pick(pool) : null;
  }
  if (S.level === 'mid') {
    // 중수: 13% 확률로만 한방·준한방 단어(받을 말이 20개 미만인 끝 글자, 꾼 등)를 냄. 평소엔 '받기 좀 까다로운' 정도
    if (Math.random() < .13) {
      const tough = full.filter(w => rem(endOf(w)) < 20);
      if (tough.length) return pick(tough);
    }
    let pool = com.length ? com : full.filter(w => w.length <= 4);
    if (!pool.length) return null;
    pool = pool.map(w => [w, rem(endOf(w))]);
    const fair = pool.filter(x => x[1] >= 20);
    if (fair.length) pool = fair;
    pool.sort((a, b) => a[1] - b[1]);
    return pick(pool.slice(0, Math.max(1, Math.ceil(pool.length * .5))))[0];
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
// 사람이 한글을 치면 'ㅎ → 하 → 한'처럼 중간 단계가 반드시 생김
// (조합 이벤트, 낱자 ㅎ·ㅏ가 잠깐 보임, 같은 자리 글자가 바뀜 중 하나)
// AI·자동 입력은 완성된 글자를 바로 꽂아 넣어서 중간 단계가 없음
const fresh = () => ({ human: false, prev: '', n: 0, types: new Set(), comp: 0, keys: 0 });
const typed = { inp: fresh(), pInp: fresh() };
for (const id of ['inp', 'pInp']) {
  const el = $(id);
  const mark = () => { typed[id].human = true; typed[id].comp++; };
  el.addEventListener('keydown', () => { typed[id].keys++; });
  el.addEventListener('compositionstart', mark);
  el.addEventListener('compositionupdate', mark);
  el.addEventListener('input', e => {
    const t = typed[id], v = el.value;
    if (!v) { typed[id] = fresh(); return; }
    t.n++; if (e.inputType) t.types.add(e.inputType);
    if (e.inputType === 'insertCompositionText') t.human = true;
    if (/[\u3131-\u318E\u1100-\u11FF]/.test(v)) t.human = true;          // 낱자(ㅎ, ㅏ …)가 보임
    if (v.length === t.prev.length && v !== t.prev) t.human = true;        // 같은 자리 글자가 바뀜(하→한)
    if (v.length < t.prev.length) t.human = true;                         // 지웠다 다시 씀
    t.prev = v;
  });
}
function humanTyped(id) { return typed[id].human; }
function resetTyped(id) { typed[id] = fresh(); }
function autoMsg(id) {
  const t = typed[id], ua = navigator.userAgent;
  const dev = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '기타';
  const br = /Edg/.test(ua) ? 'Edge' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '기타';
  return `자동 입력이 감지됐어요. 한글 자판으로 직접 입력해 주세요.<br><span class="muted small">진단: ${dev} ${br} · 입력 ${t.n} · 키 ${t.keys} · 조합 ${t.comp} · ${[...t.types].join(',') || '-'}</span>`;
}

function soloSubmit() {
  if (S.busy || S.over) return;
  const w = $('inp').value.trim().replace(/\s/g, '');
  if (w && !humanTyped('inp')) { noteBox($('note'), 'err', autoMsg('inp')); $('inp').value = ''; resetTyped('inp'); return; }
  const r = check(w, S.last, S.used);
  if (r) { noteBox($('note'), 'err', esc(r)); $('inp').select(); return; }
  soloCommit(w);
}
function soloCommit(w) {
  if (S.busy || S.over) return;
  noteBox($('note')); $('inp').value = ''; resetTyped('inp');
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
  document.body.classList.remove('playing');
  S.over = true; cancelAnimationFrame(S.raf); setSoloInput(false); S.pending = null;
  if (win) S.score += LV[S.level].bonus;
  const r = store.get('kk-rec', {}); const x = r[S.level] || { w: 0, l: 0 }; win ? x.w++ : x.l++; r[S.level] = x; store.set('kk-rec', r); showRec();
  const best = recordSolo(win);
  status(S.turn, `${LV[S.level].name} 대결 종료 · ${S.score}점`, '');
  const me = myRank('sum'), meB = myRank('best');
  setTimeout(() => dialog(win ? '승리했습니다' : '패배했습니다', why,
    `단어 ${S.turn}개 · 이번 판 ${S.score.toLocaleString()}점${best ? ' · 개인 최고 기록' : ''} · ${LV[S.level].name} 전적 ${x.w}승 ${x.l}패${me ? ` · 누적 ${me.pos}위 · 최고 ${meB ? meB.pos : '-'}위` : ''}`,
    '한 판 더', () => soloStart(S.level), win ? '' : tipHtml(S.last, S.used, [...S.used].pop())), 500);
}
function soloQuit() { if (!S.over && !S.busy) soloEnd(false, `“${S.last}”에서 포기했어요.`); }

document.querySelectorAll('[data-new]').forEach(b => { b.disabled = true; b.onclick = () => needNick(() => soloStart(b.dataset.new)); });
$('inp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); soloSubmit(); } });
$('cHint').onclick = $('dHint').onclick = () => { if (view === 'home') soloHint(); };
$('cGiveup').onclick = $('dGiveup').onclick = () => { if (view === 'home') soloQuit(); };
// '내기' 버튼: 누를 때 입력 칸 포커스를 빼앗지 않아 모바일 키보드가 내려가지 않음
for (const id of ['sendBtn', 'pSend']) $(id).addEventListener('pointerdown', e => e.preventDefault());
$('sendBtn').onclick = () => soloSubmit();
$('pSend').onclick = () => pvpSubmit();

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
let BANS = new Set(), RAW = [];
const applyBans = () => { ROWS = RAW.filter(r => !BANS.has(r.id)); };
function startRanking() {
  F.onSnapshot(F.collection(db, 'bans'), snap => { BANS = new Set(snap.docs.map(d => d.id)); applyBans(); renderBoard(); }, () => { });
  $('rankMeta').textContent = '친구들의 기록이 실시간으로 모입니다. 오른쪽 위 작성자 칸에 이름을 적으면 그 이름으로 올라가요.';
  F.onSnapshot(F.query(F.collection(db, 'scores'), F.limit(500)), snap => {
    RAW = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); applyBans();
    MINE = RAW.find(r => r.id === uid) || null;
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
// 차례 시작 시각은 서버 시각(Timestamp)으로 저장 → 밀리초로
const tsMs = t => t && typeof t.toMillis === 'function' ? t.toMillis() : (typeof t === 'number' ? t : 0);
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
      t.update(ref, { guest: uid, guestNick: myNick() || '참가자', status: 'playing', words: [{ w: startWord(), by: 'sys' }], turn: r.host, turnStart: F.serverTimestamp(), pending: null, acc: {} });
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
  unsubRoom = F.onSnapshot(roomRef, s => { if (s.exists()) renderRoom(s.data({ serverTimestamps: 'estimate' })); });
  clearInterval(pTick); pTick = setInterval(pvpClock, 250);
}
function leaveRoom() {
  document.body.classList.remove('playing');
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
  document.body.classList.toggle('playing', r.status === 'playing');
  $('roomWait').classList.toggle('hidden', !waiting); $('roomPlay').classList.toggle('hidden', waiting);
  if (waiting) { $('roomTitle').textContent = '상대를 기다리는 중'; status(0, '1:1 대기', ''); return; }

  const opp = other(r);
  $('roomTitle').textContent = `${nameOf(r, r.host)} 대 ${nameOf(r, r.guest)}`;
  const ol = $('pChain'); ol.innerHTML = '';
  r.words.forEach(x => {
    if (x.by === 'sys') { const li = chainItem(x.w, '시작 단어'); ol.appendChild(li); }
    else {
      const usedSoFar = new Set(r.words.slice(0, r.words.indexOf(x) + 1).map(y => y.w));
      ol.appendChild(chainItem(x.w, nameOf(r, x.by), { me: x.by === uid, killer: remainingFn(usedSoFar)(endOf(x.w)) === 0 }));
    }
  });
  const last = endOf(r.words[r.words.length - 1].w);
  const myTurn = r.status === 'playing' && r.turn === uid;
  $('pEntryNo').textContent = (r.words.length + 1) + '.';
  $('pInp').disabled = $('pSend').disabled = !myTurn || !!r.pending;
  $('pInp').placeholder = myTurn ? '내 차례예요. 단어 입력 후 Enter' : r.status === 'playing' ? `${nameOf(r, opp)}의 차례` : '';
  if (myTurn && (!prev || prev.turn !== uid)) { $('pInp').value = ''; setTimeout(() => $('pInp').focus({ preventScroll: true }), 30); }
  if (!prev || prev.words.length !== r.words.length) scrollEnd();
  nextInfo($('pNext'), r.status === 'playing' ? last : null);
  $('pGiveup').classList.toggle('hidden', r.status !== 'playing');
  $('pRematch').classList.toggle('hidden', r.status !== 'done');

  if (!prev || prev.words.length !== r.words.length || prev.status !== r.status) noteBox($('pNote'));

  status(r.words.length, `1:1 · ${nameOf(r, uid)}`);
  if (r.status === 'done') {
    const key = r.code + ':' + r.round;
    const win = r.winner === uid;
    const counted = r.words.length >= 6; // 서버 규칙: 단어가 6개 이상 오간 판만 전적에 반영
    if (!recorded[key]) { recorded[key] = 1; store.set('kk-pvp-rec', recorded); if (counted) recordPvp(win, r.code, r.round || 1); }
    if (shownRound !== key) {
      shownRound = key;
      const loserName = nameOf(r, r.winner === r.host ? r.guest : r.host);
      const why = r.reason === 'timeout' ? `${loserName}의 시간 초과` : r.reason === 'away' ? `${loserName}이(가) 차례 중에 다른 창으로 나가 반칙패` : `${loserName}의 포기`;
      status(null, null, '');
      const lastW = r.words[r.words.length - 1].w;
      dialog(win ? '승리했습니다' : '패배했습니다', why, `단어 ${r.words.length}개 이어짐` + (counted ? '' : ' · 단어 6개 미만으로 끝난 판은 랭킹에 반영되지 않아요'), '다시 하기', rematch,
        win ? '' : tipHtml(endOf(lastW), new Set(r.words.map(y => y.w)), lastW));
    }
  }
}
function pvpClock() {
  const r = room; if (!r || r.status !== 'playing') return;
  const ts = tsMs(r.turnStart); if (!ts) return;
  const ms = ts + PVP_LIMIT * 1000 - Date.now(), left = Math.ceil(ms / 1000);
  timeBar($('pInp'), ms / (PVP_LIMIT * 1000), left <= 5);
  $('pTime').textContent = `${r.turn === uid ? '내 차례' : nameOf(r, r.turn) + ' 차례'} · ${Math.max(0, left)}초`; $('pTime').classList.toggle('low', left <= 5);
  status(null, null, `${r.turn === uid ? '내 차례' : nameOf(r, r.turn) + ' 차례'} · 남은 시간 ${Math.max(0, left)}초`);
  if (left <= -2 && timeoutSent !== ts) { timeoutSent = ts; finishTimeout(ts); }
}
async function finishTimeout(ts) {
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const r = s.data();
      if (r.status !== 'playing' || Math.abs(tsMs(r.turnStart) - ts) > 2000) return;
      t.update(roomRef, { status: 'done', winner: r.turn === r.host ? r.guest : r.host, reason: 'timeout', pending: null });
    });
  } catch (e) { console.error(e); }
}
async function pvpSubmit() {
  const r = room; if (!r || r.status !== 'playing' || r.turn !== uid || r.pending) return;
  const w = $('pInp').value.trim().replace(/\s/g, '');
  if (w && !humanTyped('pInp')) { noteBox($('pNote'), 'err', autoMsg('pInp')); $('pInp').value = ''; resetTyped('pInp'); return; }
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
      t.update(roomRef, { words: [...x.words, { w, by: uid }], turn: other(x), turnStart: F.serverTimestamp(), pending: null });
    });
    $('pInp').value = ''; resetTyped('pInp'); noteBox($('pNote'));
  } catch (e) { noteBox($('pNote'), 'err', esc(e.message || '보내지 못했어요.')); $('pInp').disabled = false; }
}
async function pvpGiveup(reason = 'giveup') {
  if (!room || room.status !== 'playing') return;
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const x = s.data(); if (x.status !== 'playing') return;
      t.update(roomRef, { status: 'done', winner: other(x), reason: typeof reason === 'string' ? reason : 'giveup', pending: null });
    });
  } catch (e) { console.error(e); }
}
async function rematch() {
  if (!room || !roomRef) return;
  try {
    await F.runTransaction(db, async t => {
      const s = await t.get(roomRef); const x = s.data(); if (x.status !== 'done') return;
      const loser = x.winner === x.host ? x.guest : x.host;
      t.update(roomRef, { status: 'playing', round: (x.round || 1) + 1, words: [{ w: startWord(), by: 'sys' }], turn: loser, turnStart: F.serverTimestamp(), pending: null, winner: null, reason: '', acc: {} });
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
   AI·자동화 접속 차단 + 붙여넣기 금지
   ========================================================= */
const BOT_UA = /ChatGPT|GPTBot|OAI-SearchBot|OpenAI|ClaudeBot|Claude-User|anthropic|PerplexityBot|Perplexity-User|Google-Extended|Bytespider|HeadlessChrome/i;
const isBot = BOT_UA.test(navigator.userAgent) || navigator.webdriver === true;
if (isBot) {
  document.querySelector('.page').innerHTML = '<h1>접속할 수 없습니다</h1><p class="meta">자동화 도구나 AI 에이전트로는 이 게임을 할 수 없어요. 일반 브라우저에서 직접 접속해 주세요.</p>';
  document.querySelectorAll('.rcmds button, .rtabs button').forEach(b => b.disabled = true);
  throw new Error('blocked: automated client');
}
// 단어 칸에는 직접 타이핑만 (복사·붙여넣기·끌어다 놓기 금지)
for (const id of ['inp', 'pInp']) {
  const el = $(id);
  const deny = e => { e.preventDefault(); const n = id === 'inp' ? $('note') : $('pNote'); noteBox(n, 'err', '붙여넣기는 할 수 없어요. 직접 입력해 주세요.'); };
  el.addEventListener('paste', deny);
  el.addEventListener('drop', deny);
  el.addEventListener('beforeinput', e => { if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop' || e.inputType === 'insertFromPasteAsQuotation') deny(e); });
}

/* =========================================================
   내 차례에 다른 창·앱으로 나가면 반칙 (1번 경고, 2번째 패배)
   다른 곳에서 AI·검색으로 단어를 찾아오는 걸 막기 위함
   ========================================================= */
let awayAt = 0, pvpAway = { key: '', n: 0 };
function onAway() {
  if (Date.now() - awayAt < 1500) return; // blur와 화면 숨김이 같이 와도 한 번만
  awayAt = Date.now();
  // 컴퓨터 대결: 내 차례(입력 가능)일 때
  if (!S.over && !S.busy && S.last) {
    S.away = (S.away || 0) + 1;
    if (S.away >= 2) { soloEnd(false, '차례 중에 다른 창으로 나가서 반칙패예요.'); return; }
    noteBox($('note'), 'err', '⚠️ 차례 중에 다른 창이나 앱으로 나갔어요. 한 번 더 나가면 반칙패예요.');
    return;
  }
  // 1:1: 내 차례일 때
  if (room && room.status === 'playing' && room.turn === uid) {
    const key = room.code + ':' + (room.round || 1);
    if (pvpAway.key !== key) pvpAway = { key, n: 0 };
    pvpAway.n++;
    if (pvpAway.n >= 2) { pvpGiveup('away'); return; }
    noteBox($('pNote'), 'err', '⚠️ 차례 중에 다른 창이나 앱으로 나갔어요. 한 번 더 나가면 반칙패예요.');
  }
}
window.addEventListener('blur', onAway);
document.addEventListener('visibilitychange', () => { if (document.hidden) onAway(); });

/* =========================================================
   모바일 키보드 대응: 실제로 보이는 영역(visualViewport) 높이에 화면을 맞춤
   ========================================================= */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const h = Math.round(vv.height) + 'px';
    document.documentElement.style.height = h; document.body.style.height = h;
    if (vv.offsetTop > 0) window.scrollTo(0, 0);
    if (document.body.classList.contains('playing')) scrollEnd();
  };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
}
for (const id of ['inp', 'pInp']) $(id).addEventListener('focus', () => setTimeout(scrollEnd, 300));
// 안내문이 생기거나 사라져 도크 높이가 바뀌면 다시 맨 아래로 (최신 단어가 가려지지 않게)
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => { if (document.body.classList.contains('playing')) scrollEnd(); });
  document.querySelectorAll('.dock').forEach(d => ro.observe(d));
}

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
