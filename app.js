import {
  addTask,
  deleteTask,
  formatTime,
  initialTheme,
  parseTasks,
  phaseDuration,
  pauseTimer,
  recordPomodoro,
  remainingRatio,
  resetTimer,
  restoreTimer,
  serializeTasks,
  setActiveTask,
  setPhase,
  startTimer,
  syncActiveTask,
  tick,
  toggleTask,
  toggleTheme,
} from './logic.js';

const STORAGE_KEYS = {
  tasks: 'hearth.tasks',
  theme: 'hearth.theme',
  timer: 'hearth.timer',
};

const els = {
  themeToggle: document.querySelector('#theme-toggle'),
  themeLabel: document.querySelector('.theme-label'),
  panel: document.querySelector('.timer-panel'),
  status: document.querySelector('#timer-status'),
  phaseLabel: document.querySelector('#phase-label'),
  display: document.querySelector('#timer-display'),
  progress: document.querySelector('#progress'),
  progressFill: document.querySelector('#progress-fill'),
  start: document.querySelector('#start'),
  pause: document.querySelector('#pause'),
  reset: document.querySelector('#reset'),
  phaseFocus: document.querySelector('#phase-focus'),
  phaseBreak: document.querySelector('#phase-break'),
  note: document.querySelector('#session-note'),
  form: document.querySelector('#task-form'),
  title: document.querySelector('#task-title'),
  error: document.querySelector('#task-error'),
  list: document.querySelector('#task-list'),
  empty: document.querySelector('#empty-tasks'),
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or a full quota should not stop the timer.
  }
}

function readTimerRaw() {
  const raw = readStorage(STORAGE_KEYS.timer);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pomodoroLabel(count) {
  return count === 1 ? '1 pomodoro' : `${count} pomodoros`;
}

const timerRaw = readTimerRaw();
const resumedFromRunning = timerRaw?.status === 'running';
let tasks = parseTasks(readStorage(STORAGE_KEYS.tasks));
let timer = syncActiveTask(restoreTimer(timerRaw), tasks);
let theme = initialTheme(
  readStorage(STORAGE_KEYS.theme),
  window.matchMedia('(prefers-color-scheme: dark)').matches,
);
let note = resumedFromRunning ? 'Timer paused after the page reloaded.' : '';
let lastTickAt = null;
let ticker = null;

function persist() {
  writeStorage(STORAGE_KEYS.tasks, serializeTasks(tasks));
  writeStorage(STORAGE_KEYS.theme, theme);
  writeStorage(STORAGE_KEYS.timer, JSON.stringify(timer));
}

function applyTicks(now) {
  if (timer.status !== 'running') return;
  if (lastTickAt == null) lastTickAt = now;

  const elapsed = Math.floor((now - lastTickAt) / 1000);
  if (elapsed <= 0) return;

  const activeTaskId = timer.activeTaskId;
  let applied = 0;
  let tasksChanged = false;

  while (applied < elapsed && timer.status === 'running') {
    const result = tick(timer);
    timer = result.timer;
    applied += 1;

    if (result.completedPhase === 'focus') {
      tasks = recordPomodoro(tasks, activeTaskId);
      const task = tasks.find((item) => item.id === activeTaskId);
      note = task
        ? `Focus session finished. ${task.title} now has ${pomodoroLabel(task.pomodoros)}.`
        : 'Focus session finished. Break is ready.';
      tasksChanged = true;
    } else if (result.completedPhase === 'break') {
      note = 'Break finished. Ready for another focus session.';
    }

    if (result.completedPhase) break;
  }

  lastTickAt += applied * 1000;
  if (timer.status !== 'running') stopTicker();
  persist();
  if (tasksChanged) renderTasks();
}

function startTicker() {
  if (ticker != null) return;
  lastTickAt = Date.now();
  ticker = window.setInterval(() => {
    applyTicks(Date.now());
    renderTimer();
  }, 250);
}

function stopTicker() {
  if (ticker == null) return;
  window.clearInterval(ticker);
  ticker = null;
  lastTickAt = null;
}

function renderTheme() {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f6f3ee');
  els.themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  els.themeToggle.setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
  els.themeLabel.textContent = theme === 'dark' ? 'Light' : 'Dark';
}

function renderTimer() {
  const phaseName = timer.phase === 'break' ? 'Break' : 'Focus';
  const statusLabel =
    timer.status === 'running' ? 'Running' : timer.status === 'paused' ? 'Paused' : 'Ready';

  els.panel.dataset.phase = timer.phase;
  els.status.textContent = statusLabel;
  els.phaseLabel.textContent = phaseName;
  els.display.textContent = formatTime(timer.remainingSeconds);

  const total = phaseDuration(timer.phase);
  const ratio = remainingRatio(timer);
  els.progress.setAttribute('aria-valuemax', String(total));
  els.progress.setAttribute('aria-valuenow', String(timer.remainingSeconds));
  els.progress.setAttribute(
    'aria-valuetext',
    `${formatTime(timer.remainingSeconds)} remaining`,
  );
  els.progressFill.style.transform = `scaleX(${ratio})`;

  els.start.disabled = timer.status === 'running';
  els.start.textContent = timer.status === 'paused' ? 'Resume' : 'Start';
  els.pause.disabled = timer.status !== 'running';
  els.phaseFocus.setAttribute('aria-pressed', String(timer.phase === 'focus'));
  els.phaseBreak.setAttribute('aria-pressed', String(timer.phase === 'break'));
  els.note.textContent = note;
  document.title = `${formatTime(timer.remainingSeconds)} · ${phaseName} · Hearth`;
}

function icon(markup) {
  const holder = document.createElement('span');
  holder.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${markup}</svg>`;
  return holder.firstElementChild;
}

function renderTasks() {
  els.empty.hidden = tasks.length > 0;
  els.list.replaceChildren();

  for (const task of tasks) {
    const item = document.createElement('li');
    item.className = 'task';
    if (task.id === timer.activeTaskId) item.classList.add('is-selected');
    if (task.completed) item.classList.add('is-complete');

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'task-select';
    select.dataset.action = 'select';
    select.dataset.id = task.id;
    select.setAttribute('aria-pressed', String(task.id === timer.activeTaskId));

    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;

    const meta = document.createElement('span');
    meta.className = 'task-meta';
    const count = pomodoroLabel(task.pomodoros);
    meta.textContent = task.id === timer.activeTaskId ? `${count} · Selected` : count;

    select.append(title, meta);

    const complete = document.createElement('button');
    complete.type = 'button';
    complete.className = 'icon-button';
    complete.dataset.action = 'toggle';
    complete.dataset.id = task.id;
    complete.setAttribute('aria-pressed', String(task.completed));
    complete.setAttribute(
      'aria-label',
      task.completed ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`,
    );
    complete.append(
      task.completed
        ? icon('<path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path>')
        : icon('<circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" stroke-width="1.75"></circle>'),
    );

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.dataset.action = 'delete';
    remove.dataset.id = task.id;
    remove.setAttribute('aria-label', `Delete ${task.title}`);
    remove.append(
      icon('<path d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"></path>'),
    );

    item.append(select, complete, remove);
    els.list.append(item);
  }
}

function render() {
  renderTheme();
  renderTimer();
  renderTasks();
}

function switchPhase(phase) {
  const alreadyFresh =
    timer.phase === phase &&
    timer.status === 'idle' &&
    timer.remainingSeconds === phaseDuration(phase);
  if (alreadyFresh) return;

  timer = setPhase(timer, phase);
  stopTicker();
  note = '';
  persist();
  renderTimer();
}

els.themeToggle.addEventListener('click', () => {
  theme = toggleTheme(theme);
  persist();
  renderTheme();
});

els.start.addEventListener('click', () => {
  timer = startTimer(timer);
  note = '';
  persist();
  renderTimer();
  if (timer.status === 'running') startTicker();
});

els.pause.addEventListener('click', () => {
  applyTicks(Date.now());
  timer = pauseTimer(timer);
  stopTicker();
  persist();
  renderTimer();
});

els.reset.addEventListener('click', () => {
  timer = resetTimer(timer);
  stopTicker();
  note = '';
  persist();
  renderTimer();
});

els.phaseFocus.addEventListener('click', () => switchPhase('focus'));
els.phaseBreak.addEventListener('click', () => switchPhase('break'));

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    tasks = addTask(tasks, els.title.value, newId());
    els.title.value = '';
    els.error.textContent = '';
    persist();
    renderTasks();
    els.title.focus();
  } catch (error) {
    els.error.textContent = error instanceof Error ? error.message : 'Task title is required';
  }
});

els.list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === 'select') {
    timer = setActiveTask(timer, timer.activeTaskId === id ? null : id);
  } else if (action === 'toggle') {
    tasks = toggleTask(tasks, id);
  } else if (action === 'delete') {
    tasks = deleteTask(tasks, id);
    timer = syncActiveTask(timer, tasks);
  }

  persist();
  renderTimer();
  renderTasks();
});

window.addEventListener('pagehide', () => {
  if (timer.status === 'running') applyTicks(Date.now());
  persist();
});

render();
persist();
if (timer.status === 'running') startTicker();
