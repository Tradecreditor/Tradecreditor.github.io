// dashboard.js — Dashboard view: stats, habit charts, SVG goal radials, recent activity

function getWeekStart() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

function renderDashboard(m) {
  const t = todayStr();
  const weekStart = getWeekStart();

  // ─── Summary stats ────────────────────────────────────────
  const overdueCt          = tasks.filter(x => !x.completed && isOverdue(x.dueDate)).length;
  const dueTodayCt         = tasks.filter(x => !x.completed && x.dueDate === t).length;
  const completedThisWeek  = tasks.filter(x => x.completed && (x.completedAt||'') >= weekStart).length;
  const bestStreak         = habits.reduce((mx, h) => Math.max(mx, computeStreak(h)), 0);
  const habitsOnTrack      = habits.filter(h => (h.checkIns||[]).includes(t)).length;

  const statCards = [
    { label:'Overdue',          value: overdueCt,         color:'#f97316', bg:'rgba(249,115,22,.1)', onclick:"nav('today')" },
    { label:'Due Today',        value: dueTodayCt,         color:'#db4035', bg:'rgba(219,64,53,.1)',  onclick:"nav('today')" },
    { label:'Done This Week',   value: completedThisWeek,  color:'#22c55e', bg:'rgba(34,197,94,.1)',  onclick:"nav('completed')" },
    { label:'Best Streak 🔥',   value: bestStreak + 'd',   color:'#ff6b35', bg:'rgba(255,107,53,.1)', onclick:"nav('habits')" },
  ];

  const statsHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px;">
      ${statCards.map(c => `
        <div onclick="${c.onclick}"
             style="background:${c.bg};border:1px solid ${c.color}33;border-radius:12px;padding:16px 14px;cursor:pointer;transition:border-color .15s;"
             onmouseenter="this.style.borderColor='${c.color}66'" onmouseleave="this.style.borderColor='${c.color}33'">
          <div style="font-size:26px;font-weight:700;color:${c.color};margin-bottom:4px;">${c.value}</div>
          <div style="font-size:12px;color:#666;">${c.label}</div>
        </div>`).join('')}
    </div>`;

  // ─── Habit streak chart ───────────────────────────────────
  let habitHTML = '';
  if (habits.length) {
    const DAY_LABELS = ['S','M','T','W','T','F','S'];
    const days7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days7.push(d.toISOString().slice(0, 10));
    }

    habitHTML = `
      <div style="margin-bottom:28px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <span style="font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.07em;">Habit Streaks</span>
          <span style="font-size:12px;color:#555;">${habitsOnTrack}/${habits.length} done today</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${habits.map(h => {
            const info    = CATINFO[h.category] || CATINFO.other;
            const streak  = computeStreak(h);
            const doneToday = (h.checkIns || []).includes(t);
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#1a1a1a;border:1px solid #252525;border-radius:10px;">
              <span style="font-size:16px;width:22px;text-align:center;flex-shrink:0;">${info.emoji}</span>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                  <span style="font-size:13px;color:#e0e0e0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(h.name)}</span>
                  <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:8px;">
                    ${streak > 0 ? `<span class="streak-badge">🔥 ${streak}</span>` : ''}
                    ${doneToday ? `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(34,197,94,.15);color:#22c55e;font-weight:500;">✓</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:3px;">
                  ${days7.map(ds => {
                    const done = (h.checkIns || []).includes(ds);
                    const isT  = ds === t;
                    const lbl  = DAY_LABELS[new Date(ds + 'T00:00:00').getDay()];
                    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
                      <span style="font-size:8px;color:#444;">${lbl}</span>
                      <div style="width:100%;height:14px;border-radius:2px;background:${done ? info.color : '#252525'};opacity:${done?0.85:1};${isT?'box-shadow:0 0 0 1.5px #555;':''}"></div>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  } else {
    habitHTML = `
      <div style="margin-bottom:28px;padding:20px;background:#1a1a1a;border:1px solid #252525;border-radius:12px;text-align:center;">
        <p style="font-size:13px;color:#555;margin:0 0 10px;">No habits tracked yet</p>
        <button onclick="nav('habits')" style="font-size:12px;color:#db4035;background:none;border:none;cursor:pointer;">Add your first habit →</button>
      </div>`;
  }

  // ─── Goal radials (pure SVG) ──────────────────────────────
  let goalsHTML = '';
  if (goals.length) {
    const r = 22, circ = +(2 * Math.PI * r).toFixed(2);
    goalsHTML = `
      <div style="margin-bottom:28px;">
        <div style="font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Goal Progress</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;">
          ${goals.map(g => {
            const h        = habits.find(x => x.id === g.habitId);
            const progress = h ? checkinsInPeriod(h, g.period) : 0;
            const pct      = Math.min(100, Math.round(progress / g.target * 100));
            const color    = pct >= 100 ? '#22c55e' : pct >= 50 ? '#f97316' : '#ef4444';
            const offset   = +(circ * (1 - pct / 100)).toFixed(2);
            return `
            <div style="background:#1a1a1a;border:1px solid #252525;border-radius:12px;padding:14px 10px;text-align:center;">
              <svg width="56" height="56" viewBox="0 0 60 60" style="transform:rotate(-90deg);display:block;margin:0 auto 6px;">
                <circle cx="30" cy="30" r="${r}" fill="none" stroke="#2a2a2a" stroke-width="4"/>
                <circle cx="30" cy="30" r="${r}" fill="none" stroke="${color}" stroke-width="4"
                        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                        stroke-linecap="round"
                        style="transition:stroke-dashoffset .6s cubic-bezier(.22,1,.36,1);"/>
              </svg>
              <div style="font-size:17px;font-weight:700;color:${color};margin-bottom:3px;">${pct}%</div>
              <div style="font-size:11px;color:#e0e0e0;font-weight:500;line-height:1.3;margin-bottom:3px;">${esc(g.name)}</div>
              <div style="font-size:10px;color:#555;">${progress}/${g.target} ${g.period}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  } else {
    goalsHTML = `
      <div style="margin-bottom:28px;padding:20px;background:#1a1a1a;border:1px solid #252525;border-radius:12px;text-align:center;">
        <p style="font-size:13px;color:#555;margin:0 0 10px;">No goals set yet</p>
        <button onclick="nav('goals')" style="font-size:12px;color:#3b82f6;background:none;border:none;cursor:pointer;">Set your first goal →</button>
      </div>`;
  }

  // ─── Recent activity ──────────────────────────────────────
  const recent = tasks
    .filter(x => x.completed)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    .slice(0, 5);

  const recentHTML = recent.length ? `
    <div>
      <div style="font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;">Recently Completed</div>
      ${recent.map(tk => {
        const u = currentUser;
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #1e1e1e;">
          <div class="task-cb done" style="flex-shrink:0;">
            <svg style="width:8px;height:8px;" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
          </div>
          <span style="flex:1;font-size:13px;color:#555;text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tk.title)}</span>
          <span style="font-size:10px;color:#444;flex-shrink:0;">${formatDue(tk.completedAt)}</span>
          <div style="width:18px;height:18px;border-radius:50%;background:${u?.avatarColor||'#555'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;flex-shrink:0;">${esc(u?.initials||'?')}</div>
        </div>`;
      }).join('')}
    </div>` : '';

  m.innerHTML = `
    <div style="max-width:680px;margin:0 auto;padding:36px 40px;">
      <h1 style="font-size:28px;font-weight:700;margin:0 0 4px;">Dashboard</h1>
      <p style="font-size:13px;color:#555;margin:0 0 28px;">Welcome back, ${esc(currentUser?.displayName || 'there')}</p>
      ${statsHTML}
      ${habitHTML}
      ${goalsHTML}
      ${recentHTML}
    </div>`;
}
