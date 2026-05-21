'use strict';

// ── Quotes ──────────────────────────────────────────────────────────────────
const FOCUS_QUOTES = [
  '需要的不多，想要的太多。',
  '尽心尽力第一，不争你我多少。',
  '慈悲没有敌人，智慧不起烦恼。',
  '心量要大，自我要小。',
  '要能放下，才能提起。提放自如，是自在人。',
  '平常心就是最自在、最愉快的心。',
  '踏实地走一步路，胜过说一百句空洞的漂亮语。',
  '面对它、接受它、处理它、放下它。',
  '过去已成虚幻，未来尚是梦想，把握现在最重要。',
  '智慧，不是知识，不是经验，不是思辩，而是超越自我中心的态度。',
  '无论忙碌与否，内心保持安定、祥和、清明，就是修禅。',
  '自在的人生，并不是没有挫折，而是在挫折中仍能保持身心平稳。',
  '只要心安，就有平安。',
  '病不一定苦，穷不一定苦，心苦才是真正的苦。',
  '把不如意的事当成有意思的体验，就会有不同的收获。',
];
const REST_QUOTES = [
  '布施的人有福，行善的人快乐。',
  '身心常放松，逢人面带笑。',
  '感谢给我们机会，顺境逆境皆是恩人。',
  '忙人时间最多，勤劳健康最好。',
  '奉献既是修行，安心既是成就。',
  '好人不寂寞，善人最快乐。',
  '内和外和，因和缘和，平平安安真自在。',
];

// ── Config ───────────────────────────────────────────────────────────────────
const cfg = {
  focusMins:   25,
  shortMins:   5,
  longMins:    15,
  calEnable:   true,
  calName:     '日历',
  soundEnable: true,
};

// ── State ────────────────────────────────────────────────────────────────────
let mode = 'focus';
let totalSecs, remaining;
let running = false;
let timerId = null;
let session = 1;
let completedSessions = 0;
let usedFocus = [], usedRest = [];
let sessionStart = null;

const CIRC_PROGRESS = 2 * Math.PI * 86;   // r=86 for progress ring

// ── AudioContext (persistent, resume on any interaction) ─────────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
// 每次点击都尝试 resume，防止长时间静默后 ctx 被挂起
document.addEventListener('click', () => {
  try { const ctx = getAudioCtx(); if (ctx.state !== 'running') ctx.resume(); } catch (_) {}
});

async function ensureAudio() {
  const ctx = getAudioCtx();
  try { await ctx.resume(); } catch (_) {}
  return ctx;
}

// ── 音频缓冲：懒加载，首次使用时解码并缓存 ─────────────────────────────────────
const _audioBufs = {};
async function loadBuf(name, path) {
  if (_audioBufs[name]) return _audioBufs[name];
  try {
    const ctx = getAudioCtx();
    const res = await fetch(path);
    const ab  = await res.arrayBuffer();
    _audioBufs[name] = await ctx.decodeAudioData(ab);
    return _audioBufs[name];
  } catch (e) {
    console.warn('音频加载失败:', path, e);
    return null;
  }
}
function playBuf(buf, when = 0, gain = 1.0) {
  if (!buf) return;
  const ctx = getAudioCtx();
  const src = ctx.createBufferSource();
  const g   = ctx.createGain();
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(g);
  g.connect(ctx.destination);
  src.start(ctx.currentTime + when);
}

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const ring          = $('progress-ring');
const timeEl        = $('time-display');
const sessionEl     = $('session-label');
const quoteEl       = $('quote');
const appEl         = $('app');
const playBtn       = $('btn-play');
const compactBtn    = $('btn-compact');
const durInput      = $('dur-input');
const durRow        = $('duration-row');
const settingsPanel = $('settings-panel');
const toastEl       = $('toast');
const saveBtnEl     = $('btn-save-now');

// Settings
const sFocus    = $('s-focus');
const sShort    = $('s-short');
const sLong     = $('s-long');
const sCalEn    = $('s-cal-enable');
const sCalName  = $('s-cal-name');
const sSoundEn  = $('s-sound-enable');
const calDot   = $('cal-dot');
const calText  = $('cal-status-text');

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

function pickQuote(pool, used) {
  if (used.length >= pool.length) used.length = 0;
  let idx;
  do { idx = Math.floor(Math.random() * pool.length); } while (used.includes(idx));
  used.push(idx);
  return pool[idx];
}

function showQuote(text) {
  quoteEl.classList.remove('visible');
  setTimeout(() => { quoteEl.textContent = text; quoteEl.classList.add('visible'); }, 380);
}

function modeDuration(m) {
  return { focus: cfg.focusMins, short: cfg.shortMins, long: cfg.longMins }[m] * 60;
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3400);
}

// ── Save-mid-session button visibility ───────────────────────────────────────
function updateSaveBtn() {
  const show = !running && sessionStart !== null && remaining < totalSecs;
  saveBtnEl.style.display = show ? 'flex' : 'none';
}

// ── Display ──────────────────────────────────────────────────────────────────
function updateRing() {
  ring.style.strokeDashoffset = CIRC_PROGRESS * (1 - remaining / totalSecs);
}

function updateDots() {
  const n = completedSessions % 4;
  for (let i = 0; i < 4; i++) {
    const d = $('d' + i);
    d.className = 'dot';
    if      (i < n)  d.classList.add('done');
    else if (i === n) d.classList.add('current');
  }
}

function updateDisplay() {
  timeEl.textContent = fmt(remaining);
  updateRing();
  const labels = {
    focus: (n) => `第 ${n} 轮`,
    short: ()  => '小憩中',
    long:  ()  => '深度休息',
  };
  sessionEl.textContent = labels[mode](session);
  updateDots();
}

// ── Play icon ────────────────────────────────────────────────────────────────
function setPlayIcon(playing) {
  playBtn.querySelector('svg').innerHTML = playing
    ? `<g><rect x="5" y="3" width="4.5" height="18" rx="1.2"/><rect x="14.5" y="3" width="4.5" height="18" rx="1.2"/></g>`
    : `<polygon points="6,3 20,12 6,21"/>`;
}

// ── Tray ─────────────────────────────────────────────────────────────────────
function notifyTray() {
  window.electronAPI?.timerTick({ remaining, running });
}

function setCompactMode(compact) {
  appEl.classList.toggle('compact', compact);
  compactBtn.classList.toggle('active', compact);
  compactBtn.title = compact ? '展开窗口' : '极简模式';
}

// ── 预加载音频（启动后静默加载，确保响铃时即时可用）────────────────────────────
async function preloadSounds() {
  try {
    await ensureAudio();
    await loadBuf('mokugyo', './sounds/mokugyo.wav');
    await loadBuf('rin',     './sounds/rin.mp3');
  } catch (_) {}
}
setTimeout(preloadSounds, 1000);  // 页面加载完 1 秒后静默预加载

// ── 木鱼：开始计时连敲三声，间隔 1 秒 ───────────────────────────────────────────
async function playWoodenFish() {
  if (!cfg.soundEnable) return;
  try {
    const ctx = await ensureAudio();
    const buf = await loadBuf('mokugyo', './sounds/mokugyo.wav');
    [0, 1, 2].forEach(i => playBuf(buf, i * 1.0, 0.9));
  } catch (_) {}
}

// ── 暂停短铃：轻敲一声木鱼（音量稍低）──────────────────────────────────────────
async function playPauseTone() {
  if (!cfg.soundEnable) return;
  try {
    const ctx = await ensureAudio();
    const buf = await loadBuf('mokugyo', './sounds/mokugyo.wav');
    if (!buf) return;
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    src.buffer = buf;
    g.gain.value = 0.45;
    src.connect(g); g.connect(ctx.destination);
    src.start(ctx.currentTime);
  } catch (_) {}
}

// ── 引磬：结束时一记，3 秒后淡出收尾 ────────────────────────────────────────────
async function playRinBell() {
  if (!cfg.soundEnable) return;
  try {
    const ctx = await ensureAudio();
    const buf = await loadBuf('rin', './sounds/rin.mp3');
    if (!buf) return;
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    src.buffer = buf;
    src.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(1.0, t);
    g.gain.setValueAtTime(1.0, t + 2.5);
    g.gain.linearRampToValueAtTime(0, t + 3.0);
    src.start(t);
    src.stop(t + 3.0);
  } catch (_) {}
}

// ── Calendar sync ─────────────────────────────────────────────────────────────
async function syncCalendar(startISO, endISO, task, isManual = false) {
  if (!cfg.calEnable || !window.electronAPI) {
    if (isManual) showToast('请先在设置中开启日历同步', 'red');
    return;
  }
  const title = mode === 'focus' ? `专注：${task}` : '休息';
  showToast('正在打开日历…');
  const r = await window.electronAPI.addToCalendar({
    title, startISO, endISO,
  });
  r.ok
    ? showToast('请在弹窗中点击「加入」确认', 'green')
    : showToast(r.error ? `日历写入失败：${r.error.slice(0, 24)}` : '日历写入失败，请检查权限', 'red');
}

// ── Tick ─────────────────────────────────────────────────────────────────────
function tick() {
  remaining--;
  updateDisplay();
  notifyTray();
  if (remaining <= 0) {
    clearInterval(timerId); timerId = null;
    running = false;
    appEl.classList.remove('running');
    setPlayIcon(false);
    updateSaveBtn();
    playRinBell();
    onComplete();
  }
}

async function onComplete() {
  // Auto-sync on natural completion
  if (sessionStart) {
    await syncCalendar(
      sessionStart.toISOString(), new Date().toISOString(),
      ($('task-input').value.trim() || '专注工作'),
    );
    sessionStart = null;
  }
  if (mode === 'focus') {
    completedSessions++;
    if (completedSessions % 4 === 0) {
      session = 1;           // reset counter for next cycle
      setMode('long');
    } else {
      session++;
      setMode('short');
    }
  } else {
    setMode('focus');
  }
}

// ── Mode ─────────────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === m)
  );
  clearInterval(timerId); timerId = null;
  running = false; sessionStart = null;
  appEl.classList.remove('running');
  setPlayIcon(false);

  const isFocus = m === 'focus';
  durRow.style.opacity       = isFocus ? '1'    : '0.28';
  durRow.style.pointerEvents = isFocus ? 'auto' : 'none';

  totalSecs = remaining = modeDuration(m);
  if (isFocus) durInput.value = cfg.focusMins;

  updateDisplay();
  updateSaveBtn();
  showQuote(isFocus
    ? pickQuote(FOCUS_QUOTES, usedFocus)
    : pickQuote(REST_QUOTES,  usedRest));
  notifyTray();
}

// ── Play / Pause ─────────────────────────────────────────────────────────────
function togglePlay() {
  running = !running;
  if (running) {
    if (!sessionStart) sessionStart = new Date();
    appEl.classList.add('running');
    setPlayIcon(true);
    playWoodenFish();                      // 开始三声木鱼
    timerId = setInterval(tick, 1000);
  } else {
    appEl.classList.remove('running');
    setPlayIcon(false);
    clearInterval(timerId); timerId = null;
    playPauseTone();                           // 暂停一声轻鸣
  }
  updateSaveBtn();
  notifyTray();
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetTimer() {
  clearInterval(timerId); timerId = null;
  running = false; sessionStart = null;
  appEl.classList.remove('running');
  setPlayIcon(false);
  totalSecs = remaining = modeDuration(mode);
  if (mode === 'focus') durInput.value = cfg.focusMins;
  updateDisplay();
  updateSaveBtn();
  notifyTray();
}

// ── Skip ─────────────────────────────────────────────────────────────────────
function skipNext() {
  clearInterval(timerId); timerId = null;
  running = false; sessionStart = null;
  appEl.classList.remove('running');
  setPlayIcon(false);
  updateSaveBtn();
  onComplete();
}

// ── Settings ──────────────────────────────────────────────────────────────────
function openSettings() {
  sFocus.value    = cfg.focusMins;
  sShort.value    = cfg.shortMins;
  sLong.value     = cfg.longMins;
  sCalEn.value    = cfg.calEnable  ? '1' : '0';
  sCalName.value  = cfg.calName;
  sSoundEn.value  = cfg.soundEnable ? '1' : '0';
  settingsPanel.classList.add('open');
  $('btn-settings').classList.add('active');
}

function closeSettings() {
  const parse = (el, fb) => Math.max(1, parseInt(el.value, 10) || fb);
  cfg.focusMins = parse(sFocus, 25);
  cfg.shortMins = parse(sShort, 5);
  cfg.longMins  = parse(sLong,  15);
  cfg.calEnable   = sCalEn.value === '1';
  cfg.calName     = sCalName.value.trim() || '日历';
  cfg.soundEnable = sSoundEn.value === '1';
  if (!running) {
    totalSecs = remaining = modeDuration(mode);
    if (mode === 'focus') durInput.value = cfg.focusMins;
    updateDisplay();
  }
  settingsPanel.classList.remove('open');
  $('btn-settings').classList.remove('active');
}

// ── Test calendar ─────────────────────────────────────────────────────────────
async function testCalendar() {
  if (!window.electronAPI) {
    calDot.className = 'cal-indicator err';
    calText.textContent = '仅桌面端可用'; return;
  }
  calDot.className = 'cal-indicator';
  calText.textContent = '正在连接…';
  const now = new Date(), end = new Date(now.getTime() + 60000);
  const r = await window.electronAPI.addToCalendar({
    title: '云水番茄钟 · 连接测试',
    startISO: now.toISOString(), endISO: end.toISOString(),
    calName: sCalName.value.trim() || '日历',
  });
  calDot.className = 'cal-indicator ' + (r.ok ? 'ok' : 'err');
  calText.textContent = r.ok
    ? '连接成功，测试事件已写入'
    : (r.error?.replace(/\s+/g, ' ').slice(0, 56) || '连接失败，请检查日历权限');
}

// ── Bindings ──────────────────────────────────────────────────────────────────
playBtn.addEventListener('click',                  togglePlay);
$('btn-reset').addEventListener('click',           resetTimer);
$('btn-skip').addEventListener('click',            skipNext);
$('btn-settings').addEventListener('click',        openSettings);
$('btn-settings-close').addEventListener('click',  closeSettings);
$('btn-test-cal').addEventListener('click',        testCalendar);
$('btn-compact').addEventListener('click',         () => window.electronAPI?.toggleCompact());
$('btn-close').addEventListener('click', () => window.electronAPI?.closeWindow());
$('btn-min').addEventListener('click',   () => window.electronAPI?.minimizeWindow());
window.electronAPI?.onCompactChanged?.(setCompactMode);

document.querySelectorAll('.mode-btn').forEach(b =>
  b.addEventListener('click', () => { if (!running) setMode(b.dataset.mode); })
);

durInput.addEventListener('change', () => {
  cfg.focusMins = Math.max(1, parseInt(durInput.value, 10) || 25);
  if (!running) resetTimer();
});

// Manual save button
saveBtnEl.addEventListener('click', async () => {
  if (!sessionStart) return;
  const end = new Date();
  const task = $('task-input').value.trim() || '专注工作';
  await syncCalendar(sessionStart.toISOString(), end.toISOString(), task, true);
  sessionStart = null;
  updateSaveBtn();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
setMode('focus');
