# Hearth

Hearth is a small Pomodoro and task focus timer. It runs as a static site: open it in a browser, keep a short task list, and work in 25-minute focus sessions with 5-minute breaks.

This app was built with Cursor CLI using model grok-4.7-high for MLH Global Hack Week.

## Features

- Add, complete, and delete tasks. The list is saved in `localStorage`.
- Start, pause, and reset a 25-minute focus timer or a 5-minute break.
- Select a task. Each finished focus session increments that task's pomodoro count.
- Toggle dark mode. The choice is saved on this device.

## Run

The page uses ES modules, so open it through a local static server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Tests

Timer and task behavior lives in `logic.js`, separate from the page. Run the tests with:

```bash
node --test
```

`package.json` sets `"type": "module"` so Node loads `logic.js` as an ES module.
