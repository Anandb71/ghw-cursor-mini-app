import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BREAK_SECONDS,
  WORK_SECONDS,
  addTask,
  createTimer,
  deleteTask,
  formatTime,
  initialTheme,
  parseTasks,
  recordPomodoro,
  remainingRatio,
  resetTimer,
  restoreTimer,
  pauseTimer,
  serializeTasks,
  setActiveTask,
  setPhase,
  startTimer,
  syncActiveTask,
  tick,
  toggleTask,
  toggleTheme,
} from '../logic.js';

test('createTimer starts a 25 minute focus session that is idle', () => {
  assert.deepEqual(createTimer(), {
    phase: 'focus',
    status: 'idle',
    remainingSeconds: WORK_SECONDS,
    activeTaskId: null,
  });
  assert.equal(WORK_SECONDS, 25 * 60);
  assert.equal(BREAK_SECONDS, 5 * 60);
});

test('startTimer runs an idle or paused timer and leaves a running timer unchanged', () => {
  const idle = createTimer();
  const running = startTimer(idle);
  assert.equal(running.status, 'running');
  assert.equal(running.remainingSeconds, WORK_SECONDS);
  assert.equal(idle.status, 'idle');
  assert.equal(startTimer(running), running);

  const paused = pauseTimer(running);
  assert.equal(startTimer(paused).status, 'running');
});

test('pauseTimer pauses a running timer and ignores idle or paused timers', () => {
  const running = startTimer(createTimer());
  const paused = pauseTimer(running);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.remainingSeconds, running.remainingSeconds);
  assert.equal(running.status, 'running');
  assert.equal(pauseTimer(paused), paused);
  const idle = createTimer();
  assert.equal(pauseTimer(idle), idle);
});

test('resetTimer restores the full length of the current phase and stops the timer', () => {
  const started = startTimer(createTimer());
  const midFocus = { ...tick(started).timer, remainingSeconds: 40 };
  const resetFocus = resetTimer(midFocus);
  assert.equal(resetFocus.status, 'idle');
  assert.equal(resetFocus.remainingSeconds, WORK_SECONDS);
  assert.equal(resetFocus.phase, 'focus');

  const midBreak = startTimer(setPhase(createTimer(), 'break'));
  const resetBreak = resetTimer({ ...midBreak, remainingSeconds: 12 });
  assert.equal(resetBreak.phase, 'break');
  assert.equal(resetBreak.status, 'idle');
  assert.equal(resetBreak.remainingSeconds, BREAK_SECONDS);
});

test('setPhase switches length and stops the timer', () => {
  const running = startTimer(setActiveTask(createTimer(), 'task-1'));
  const onBreak = setPhase(running, 'break');
  assert.deepEqual(onBreak, {
    phase: 'break',
    status: 'idle',
    remainingSeconds: BREAK_SECONDS,
    activeTaskId: 'task-1',
  });
  assert.equal(setPhase(onBreak, 'focus').remainingSeconds, WORK_SECONDS);
  assert.equal(setPhase(onBreak, 'nap'), onBreak);
});

test('tick counts down one second while running and ignores other states', () => {
  const running = startTimer(createTimer());
  const next = tick(running);
  assert.equal(next.completedPhase, null);
  assert.equal(next.timer.remainingSeconds, WORK_SECONDS - 1);
  assert.equal(next.timer.status, 'running');
  assert.equal(running.remainingSeconds, WORK_SECONDS);

  assert.deepEqual(tick(createTimer()), { timer: createTimer(), completedPhase: null });
  assert.equal(tick(pauseTimer(running)).completedPhase, null);
});

test('tick completes a focus session exactly at zero and opens a 5 minute break', () => {
  const almostDone = startTimer({ ...createTimer(), remainingSeconds: 1 });
  const done = tick(almostDone);
  assert.equal(done.completedPhase, 'focus');
  assert.equal(done.timer.phase, 'break');
  assert.equal(done.timer.status, 'idle');
  assert.equal(done.timer.remainingSeconds, BREAK_SECONDS);
});

test('tick completes a break and returns to a fresh focus session', () => {
  const almostDone = startTimer({
    ...setPhase(createTimer(), 'break'),
    remainingSeconds: 1,
  });
  const done = tick(almostDone);
  assert.equal(done.completedPhase, 'break');
  assert.deepEqual(done.timer, {
    phase: 'focus',
    status: 'idle',
    remainingSeconds: WORK_SECONDS,
    activeTaskId: null,
  });
});

test('formatTime renders minutes and seconds', () => {
  assert.equal(formatTime(WORK_SECONDS), '25:00');
  assert.equal(formatTime(BREAK_SECONDS), '05:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(-4), '00:00');
});

test('remainingRatio is the fraction of the current phase still left', () => {
  assert.equal(remainingRatio(createTimer()), 1);
  assert.equal(remainingRatio({ ...createTimer(), remainingSeconds: WORK_SECONDS / 2 }), 0.5);
  assert.equal(remainingRatio(setPhase(createTimer(), 'break')), 1);
  assert.equal(remainingRatio({ ...setPhase(createTimer(), 'break'), remainingSeconds: 0 }), 0);
});

test('addTask appends a trimmed task and rejects a blank title', () => {
  const existing = [];
  const tasks = addTask(existing, '  Write tests  ', 'a');
  assert.deepEqual(tasks, [
    { id: 'a', title: 'Write tests', completed: false, pomodoros: 0 },
  ]);
  assert.deepEqual(existing, []);
  assert.throws(() => addTask(tasks, '   ', 'b'), /title/i);
});

test('toggleTask flips completion for one task', () => {
  const tasks = addTask(addTask([], 'One', 'a'), 'Two', 'b');
  const toggled = toggleTask(tasks, 'b');
  assert.equal(toggled[0].completed, false);
  assert.equal(toggled[1].completed, true);
  assert.equal(toggleTask(toggled, 'b')[1].completed, false);
  assert.equal(tasks[1].completed, false);
  assert.deepEqual(toggleTask(tasks, 'missing'), tasks);
});

test('deleteTask removes one task and leaves the others', () => {
  const tasks = addTask(addTask([], 'One', 'a'), 'Two', 'b');
  assert.deepEqual(deleteTask(tasks, 'a'), [tasks[1]]);
  assert.equal(tasks.length, 2);
  assert.deepEqual(deleteTask(tasks, 'missing'), tasks);
});

test('recordPomodoro increments only the selected task', () => {
  const tasks = addTask(addTask([], 'One', 'a'), 'Two', 'b');
  const updated = recordPomodoro(tasks, 'a');
  assert.equal(updated[0].pomodoros, 1);
  assert.equal(updated[1].pomodoros, 0);
  assert.equal(tasks[0].pomodoros, 0);
  assert.equal(recordPomodoro(tasks, null), tasks);
  assert.deepEqual(recordPomodoro(tasks, 'missing'), tasks);
});

test('setActiveTask and syncActiveTask keep the selection attached to a real task', () => {
  const timer = setActiveTask(createTimer(), 'a');
  assert.equal(timer.activeTaskId, 'a');
  const tasks = addTask([], 'One', 'a');
  assert.equal(syncActiveTask(timer, tasks), timer);
  assert.equal(syncActiveTask(timer, []).activeTaskId, null);
  assert.equal(timer.activeTaskId, 'a');
});

test('tasks survive a serialize and parse round trip', () => {
  const tasks = recordPomodoro(toggleTask(addTask([], 'Ship it', 'a'), 'a'), 'a');
  assert.deepEqual(parseTasks(serializeTasks(tasks)), tasks);
});

test('parseTasks drops malformed storage', () => {
  assert.deepEqual(parseTasks(null), []);
  assert.deepEqual(parseTasks(''), []);
  assert.deepEqual(parseTasks('{'), []);
  assert.deepEqual(parseTasks('{"title":"nope"}'), []);
  assert.deepEqual(parseTasks('[{"id":"a","title":"  Ok  ","completed":1,"pomodoros":2.9}]'), [
    { id: 'a', title: 'Ok', completed: true, pomodoros: 2 },
  ]);
});

test('theme helpers honor a saved choice and otherwise follow the system', () => {
  assert.equal(toggleTheme('light'), 'dark');
  assert.equal(toggleTheme('dark'), 'light');
  assert.equal(initialTheme('dark', false), 'dark');
  assert.equal(initialTheme('light', true), 'light');
  assert.equal(initialTheme(null, true), 'dark');
  assert.equal(initialTheme('sepia', false), 'light');
});

test('restoreTimer keeps a saved session but pauses one that was running', () => {
  const saved = {
    phase: 'break',
    status: 'running',
    remainingSeconds: 90,
    activeTaskId: 'task-9',
  };
  assert.deepEqual(restoreTimer(saved), {
    phase: 'break',
    status: 'paused',
    remainingSeconds: 90,
    activeTaskId: 'task-9',
  });
  assert.deepEqual(restoreTimer({ phase: 'nope' }), createTimer());
  assert.deepEqual(restoreTimer(null), createTimer());
});
