# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TaskFlow** is a personal & family to-do + habit tracker web app. It is a **single-file app** (`index.html`) with no build step, no framework, and no backend — all state lives in `localStorage`. The target users are two people (a couple), so scope is deliberately constrained.

See `.claude/rules/` for design tokens, technical defaults, and screenshot-comparison workflow.

## Architecture

Everything lives in `index.html`, structured in three logical sections:

### 1. HTML Structure
- **Sidebar** (`<aside>`, 260px) — navigation, project list, user header
- **Main content** (`<main id="main">`) — entirely replaced by JS on every view change
- **Modals** — Add/Edit Task, Add Habit, Add Goal, Confirm Delete; always present in DOM, toggled via `display:none`
- **Toast** (`#toast`) — fixed-position notification, shown/hidden via `.show` class

### 2. Data Layer (in-memory + localStorage)
Three arrays hold all app state:
- `tasks[]` — `{ id, title, dueDate, priority, description, project, subtasks[], completed, completedAt, createdAt }`
- `habits[]` — `{ id, name, frequency, category, checkIns[], createdAt }`
- `goals[]` — `{ id, name, habitId, period, target }`

**`persist()`** serializes all three to `localStorage` keys `tf_tasks`, `tf_habits`, `tf_goals`. **`load()`** restores them on startup; if empty, **`seed()`** populates demo data.

Static config (never persisted):
- `PROJECTS` — hardcoded array of `{ id, name, color }`, max 5
- `PCOLORS` — priority → hex color map
- `CATINFO` — habit category → emoji + color

### 3. Render / View Layer
Navigation state is `S = { view, project }`. Calling `nav(view)` sets state and calls `render()`, which delegates to a view-specific function:

| View | Function |
|---|---|
| `today` | `renderToday(m)` |
| `inbox` | `renderInbox(m)` |
| `completed` | `renderCompleted(m)` |
| `habits` | `renderHabits(m)` |
| `goals` | `renderGoals(m)` |
| `project` | `renderProject(m, id)` |
| `search` | `renderSearch(m)` |

All views set `$('main').innerHTML` directly with template literal strings. **`taskRowHTML(task)`** is the shared row renderer used by all task views.

### Key Patterns
- `$` is aliased to `document.getElementById`
- `esc()` HTML-escapes all user-provided strings before inserting into innerHTML
- `uid()` generates IDs: `Math.random().toString(36) + Date.now().toString(36)`
- Inline `onmouseenter`/`onmouseleave` handle hover states where CSS can't reach dynamically-injected HTML
- All destructive actions go through `confirmCb` / `execConfirm()` — a generic confirm modal with a callback

## Design System

Defined in `.claude/rules/design-rules.md`. Key tokens:
- **Font**: DM Sans (Google Fonts CDN)
- **Primary accent**: `#db4035`
- **Background layers**: `#121212` → `#1e1e1e` → `#252525` → `#2a2a2a`
- **Priority colors**: Critical `#ef4444`, High `#f97316`, Medium `#3b82f6`, Low `#6b7280`

## Development

No build step. Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# or
python -m http.server
```

All changes are immediately visible on page refresh. There are no tests, no linting config, and no package.json — the project uses Tailwind CSS via CDN only.

## Important Constraints

- **Single file** — keep everything in `index.html` unless explicitly asked to split
- **No backend** — `localStorage` only; no auth, no sync in current implementation (PRD has these as future features)
- **PROJECTS is hardcoded** — adding/removing projects requires editing the `PROJECTS` constant directly
- **Max subtasks**: 5 per task (enforced in `addSubField()`)
- **Max task title**: 30 chars; description: 200 chars; habit/goal name: 60 chars
