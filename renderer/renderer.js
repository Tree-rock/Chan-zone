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

// ── 音频：直接用 HTMLAudioElement，无需管理 AudioContext 状态 ─────────────────
function playSound(filePath, volume = 1.0) {
  try {
    const a = new Audio(filePath);
    a.volume = volume;
    a.play().catch(e => console.warn('播放失败:', filePath, e));
    return a;
  } catch (e) {
    console.warn('音频错误:', e);
    return null;
  }
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

// ── 木鱼序列：存储 timeout + Audio，方便暂停时中断 ──────────────────────────────
let _mokugyo = { timers: [], audios: [] };

function stopWoodenFish() {
  _mokugyo.timers.forEach(t => clearTimeout(t));
  _mokugyo.audios.forEach(a => { try { a.pause(); } catch (_) {} });
  _mokugyo.timers = []; _mokugyo.audios = [];
}

function playWoodenFish() {
  if (!cfg.soundEnable) return;
  stopWoodenFish();   // 确保无残留
  [0, 1800, 3600].forEach(delay => {
    const t = setTimeout(() => {
      const a = playSound('./sounds/mokugyo.wav', 0.9);
      if (a) _mokugyo.audios.push(a);
    }, delay);
    _mokugyo.timers.push(t);
  });
}

// ── 暂停短铃：轻敲一声木鱼（音量稍低）──────────────────────────────────────────
function playPauseTone() {
  if (!cfg.soundEnable) return;
  playSound('./sounds/mokugyo.wav', 0.45);
}

// ── 引磬：跳过开头静音直接从铃声处播放，12 秒后淡出 ─────────────────────────────
function playRinBell() {
  if (!cfg.soundEnable) return;
  try {
    const a = new Audio('./sounds/rin.mp3');
    a.volume = 1.0;
    a.currentTime = 2;    // 跳过前 2 秒静音，直接到铃声
    a.play().catch(e => console.warn('引磬播放失败:', e));
    setTimeout(() => {
      const fade = setInterval(() => {
        a.volume = Math.max(0, a.volume - 0.02);
        if (a.volume <= 0) { clearInterval(fade); a.pause(); }
      }, 50);
    }, 12000);  // 12 秒后开始淡出
  } catch (e) { console.warn('引磬错误:', e); }
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
    stopWoodenFish();   // 取消未播的木鱼 + 停止正在响的
    playPauseTone();    // 暂停轻鸣
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

// ── 音效测试按钮 ───────────────────────────────────────────────────────────────
$('btn-test-mokugyo').addEventListener('click', () => {
  playSound('./sounds/mokugyo.wav', 0.9);
});
$('btn-test-rin').addEventListener('click', () => {
  playRinBell();   // 直接复用 playRinBell，保持一致
});

// ── Boot ──────────────────────────────────────────────────────────────────────
setMode('focus');
