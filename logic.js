export const WORK_SECONDS = 25 * 60;
export const BREAK_SECONDS = 5 * 60;

export function createTimer() {
  return {
    phase: 'focus',
    status: 'idle',
    remainingSeconds: WORK_SECONDS,
    activeTaskId: null,
  };
}

export function startTimer(timer) {
  if (timer.status === 'running') return timer;
  return { ...timer, status: 'running' };
}

export function pauseTimer(timer) {
  if (timer.status !== 'running') return timer;
  return { ...timer, status: 'paused' };
}

export function resetTimer(timer) {
  return {
    ...timer,
    status: 'idle',
    remainingSeconds: phaseDuration(timer.phase),
  };
}

export function setPhase(timer, phase) {
  if (phase !== 'focus' && phase !== 'break') return timer;
  return {
    ...timer,
    phase,
    status: 'idle',
    remainingSeconds: phaseDuration(phase),
  };
}

export function setActiveTask(timer, taskId) {
  return { ...timer, activeTaskId: taskId };
}

export function tick(timer) {
  if (timer.status !== 'running') {
    return { timer, completedPhase: null };
  }

  if (timer.remainingSeconds > 1) {
    return {
      timer: { ...timer, remainingSeconds: timer.remainingSeconds - 1 },
      completedPhase: null,
    };
  }

  const nextPhase = timer.phase === 'focus' ? 'break' : 'focus';
  return {
    timer: {
      phase: nextPhase,
      status: 'idle',
      remainingSeconds: phaseDuration(nextPhase),
      activeTaskId: timer.activeTaskId,
    },
    completedPhase: timer.phase,
  };
}

export function formatTime(totalSeconds) {
  const value = Number(totalSeconds);
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function phaseDuration(phase) {
  return phase === 'break' ? BREAK_SECONDS : WORK_SECONDS;
}

export function remainingRatio(timer) {
  const total = phaseDuration(timer.phase);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, timer.remainingSeconds / total));
}

export function addTask(tasks, title, id) {
  const trimmed = String(title ?? '').trim();
  if (!trimmed) {
    throw new Error('Task title is required');
  }
  return [...tasks, { id, title: trimmed, completed: false, pomodoros: 0 }];
}

export function toggleTask(tasks, id) {
  if (!tasks.some((task) => task.id === id)) return tasks;
  return tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task,
  );
}

export function deleteTask(tasks, id) {
  if (!tasks.some((task) => task.id === id)) return tasks;
  return tasks.filter((task) => task.id !== id);
}

export function recordPomodoro(tasks, id) {
  if (id == null || !tasks.some((task) => task.id === id)) return tasks;
  return tasks.map((task) =>
    task.id === id ? { ...task, pomodoros: task.pomodoros + 1 } : task,
  );
}

export function serializeTasks(tasks) {
  return JSON.stringify(tasks);
}

export function parseTasks(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const tasks = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' && typeof item.id !== 'number') continue;
    if (typeof item.title !== 'string') continue;
    const title = item.title.trim();
    if (!title) continue;

    let pomodoros = Number(item.pomodoros);
    if (!Number.isFinite(pomodoros) || pomodoros < 0) pomodoros = 0;
    else pomodoros = Math.floor(pomodoros);

    tasks.push({
      id: String(item.id),
      title,
      completed: Boolean(item.completed),
      pomodoros,
    });
  }
  return tasks;
}

export function syncActiveTask(timer, tasks) {
  if (timer.activeTaskId == null) return timer;
  if (tasks.some((task) => task.id === timer.activeTaskId)) return timer;
  return { ...timer, activeTaskId: null };
}

export function toggleTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}

export function initialTheme(saved, prefersDark) {
  if (saved === 'dark' || saved === 'light') return saved;
  return prefersDark ? 'dark' : 'light';
}

export function restoreTimer(raw) {
  if (!raw || typeof raw !== 'object') return createTimer();
  if (raw.phase !== 'focus' && raw.phase !== 'break') return createTimer();
  if (raw.status !== 'idle' && raw.status !== 'running' && raw.status !== 'paused') {
    return createTimer();
  }

  const max = phaseDuration(raw.phase);
  if (
    !Number.isInteger(raw.remainingSeconds) ||
    raw.remainingSeconds < 0 ||
    raw.remainingSeconds > max
  ) {
    return createTimer();
  }

  return {
    phase: raw.phase,
    status: raw.status === 'running' ? 'paused' : raw.status,
    remainingSeconds: raw.remainingSeconds,
    activeTaskId:
      typeof raw.activeTaskId === 'string' && raw.activeTaskId ? raw.activeTaskId : null,
  };
}
