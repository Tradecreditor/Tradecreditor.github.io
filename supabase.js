// supabase.js — Supabase client, auth wrappers, and data sync layer

const SUPABASE_URL     = 'https://vnbixzzleuqaaymzmsyq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6QQ8Pqhpa4W3GXEQl_A8Ow_wp3jS650';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth ──────────────────────────────────────────────────

async function sbSignUp(email, pw, meta) {
  const { data, error } = await _sb.auth.signUp({
    email, password: pw,
    options: { data: meta }
  });
  if (error) return { error: error.message };
  return { user: data.user };
}

async function sbSignIn(email, pw) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password: pw });
  if (error) return { error: error.message };
  return { user: data.user };
}

async function sbSignOut() {
  await _sb.auth.signOut();
}

// Returns the Supabase auth user (with .id) or null
async function sbGetSession() {
  const { data } = await _sb.auth.getSession();
  return data?.session?.user || null;
}

// ─── Profiles ──────────────────────────────────────────────

async function sbGetAllProfiles() {
  const { data } = await _sb.from('profiles').select('*');
  return data || [];
}

async function sbUpsertProfile(profile) {
  await _sb.from('profiles').upsert(profile);
}

// ─── User count (enforces max-2 family limit) ──────────────

async function sbGetUserCount() {
  const { count } = await _sb.from('profiles').select('*', { count: 'exact', head: true });
  return count || 0;
}

// ─── Invite codes (stored in app_settings) ─────────────────

async function sbGenerateInviteCode() {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  await _sb.from('app_settings').upsert({
    key: 'invite_code',
    value: JSON.stringify({ code, createdAt: new Date().toISOString() }),
    updated_at: new Date().toISOString()
  });
  return code;
}

async function sbGetInviteCode() {
  const { data } = await _sb.from('app_settings').select('value').eq('key', 'invite_code').maybeSingle();
  if (!data) return null;
  try { return JSON.parse(data.value); } catch(e) { return null; }
}

async function sbConsumeInviteCode() {
  await _sb.from('app_settings').delete().eq('key', 'invite_code');
}

// ─── Pull all data ─────────────────────────────────────────

async function sbPullAll(userId) {
  const [
    { data: rawTasks },
    { data: rawHabits },
    { data: rawGoals },
    { data: rawProjects },
    { data: rawLists }
  ] = await Promise.all([
    _sb.from('tasks').select('*, subtasks(*)').eq('owner_id', userId),
    _sb.from('habits').select('*, habit_checkins(*)').or(`owner_id.eq.${userId},shared.eq.true`),
    _sb.from('goals').select('*').eq('owner_id', userId),
    _sb.from('projects').select('*').eq('owner_id', userId),
    _sb.from('shared_lists').select('*, shared_list_items(*)')
  ]);

  // Transform tasks: snake_case → app shape
  const tasks = (rawTasks || []).map(t => ({
    id:          t.id,
    title:       t.title,
    dueDate:     t.due_date || '',
    priority:    t.priority,
    description: t.description || '',
    project:     t.project_id || '',
    subtasks:    (t.subtasks || []).map(s => ({
      id: s.id, title: s.title, completed: s.completed
    })),
    completed:   t.completed,
    completedAt: t.completed_at || null,
    createdAt:   t.created_at,
    owner:       t.owner_id,
    lastUpdatedAt: t.last_updated_at || null
  }));

  // Transform habits: reconstruct checkIns[] and checkInsByUser
  const habits = (rawHabits || []).map(h => {
    const checkins = h.habit_checkins || [];
    const checkIns = checkins.map(c => c.date);
    const checkInsByUser = checkins.reduce((acc, c) => {
      (acc[c.user_id] = acc[c.user_id] || []).push(c.date);
      return acc;
    }, {});
    return {
      id:             h.id,
      name:           h.name,
      frequency:      h.frequency,
      category:       h.category,
      shared:         h.shared,
      createdBy:      h.created_by,
      owner:          h.owner_id,
      createdAt:      h.created_at,
      checkIns,
      checkInsByUser
    };
  });

  // Transform goals
  const goals = (rawGoals || []).map(g => ({
    id:      g.id,
    name:    g.name,
    habitId: g.habit_id || '',
    period:  g.period,
    target:  g.target,
    owner:   g.owner_id
  }));

  // Transform projects
  const projects = (rawProjects || []).map(p => ({
    id:        p.id,
    name:      p.name,
    color:     p.color,
    owner:     p.owner_id,
    createdAt: p.created_at
  }));

  // Transform shared lists: rename shared_list_items → items, camelCase
  const sharedLists = (rawLists || []).map(l => ({
    id:        l.id,
    name:      l.name,
    createdBy: l.created_by,
    createdAt: l.created_at,
    items:     (l.shared_list_items || []).map(i => ({
      id:            i.id,
      text:          i.text,
      completed:     i.completed,
      completedBy:   i.completed_by || null,
      createdBy:     i.created_by,
      createdAt:     i.created_at,
      lastUpdatedAt: i.last_updated_at || null,
      lastUpdatedBy: i.last_updated_by || null
    }))
  }));

  return { tasks, habits, goals, projects, sharedLists };
}

// ─── Push all data ─────────────────────────────────────────

async function sbPushAll(userId) {
  // Upsert tasks (omit nested subtasks array — pushed separately)
  if (tasks.length) {
    const taskRows = tasks.map(t => ({
      id:             t.id,
      title:          t.title,
      due_date:       t.dueDate || null,
      priority:       t.priority,
      description:    t.description || '',
      project_id:     t.project || null,
      completed:      t.completed,
      completed_at:   t.completedAt || null,
      created_at:     t.createdAt,
      owner_id:       userId,
      last_updated_at: t.lastUpdatedAt || null
    }));
    await _sb.from('tasks').upsert(taskRows);

    // Upsert all subtasks for all tasks
    const subRows = tasks.flatMap(t =>
      (t.subtasks || []).map((s, i) => ({
        id: s.id, task_id: t.id, title: s.title, completed: s.completed, sort_order: i
      }))
    );
    if (subRows.length) await _sb.from('subtasks').upsert(subRows);
  }

  // Upsert habits (omit checkIn arrays — pushed as rows)
  if (habits.length) {
    const habitRows = habits.map(h => ({
      id:         h.id,
      name:       h.name,
      frequency:  h.frequency,
      category:   h.category,
      shared:     h.shared || false,
      created_by: h.createdBy || userId,
      owner_id:   userId,
      created_at: h.createdAt
    }));
    await _sb.from('habits').upsert(habitRows);

    // Upsert only current user's check-ins
    const userCheckins = habits.flatMap(h =>
      ((h.checkInsByUser || {})[userId] || h.checkIns || []).map(date => ({
        id:       h.id + '_' + userId + '_' + date,
        habit_id: h.id,
        user_id:  userId,
        date
      }))
    );
    if (userCheckins.length) {
      await _sb.from('habit_checkins').upsert(userCheckins, { onConflict: 'habit_id,user_id,date' });
    }
  }

  // Upsert goals
  if (goals.length) {
    const goalRows = goals.map(g => ({
      id:       g.id,
      name:     g.name,
      habit_id: g.habitId || null,
      period:   g.period,
      target:   g.target,
      owner_id: userId
    }));
    await _sb.from('goals').upsert(goalRows);
  }

  // Upsert projects
  if (projects.length) {
    const projRows = projects.map(p => ({
      id:         p.id,
      name:       p.name,
      color:      p.color,
      owner_id:   p.owner || userId,
      created_at: p.createdAt || new Date().toISOString()
    }));
    await _sb.from('projects').upsert(projRows);
  }

  // Upsert shared lists + items
  if (sharedLists.length) {
    const listRows = sharedLists.map(l => ({
      id:         l.id,
      name:       l.name,
      created_by: l.createdBy || userId,
      created_at: l.createdAt || new Date().toISOString()
    }));
    await _sb.from('shared_lists').upsert(listRows);

    const itemRows = sharedLists.flatMap(l =>
      (l.items || []).map(i => ({
        id:              i.id,
        list_id:         l.id,
        text:            i.text,
        completed:       i.completed,
        completed_by:    i.completedBy || null,
        created_by:      i.createdBy || userId,
        created_at:      i.createdAt || new Date().toISOString(),
        last_updated_at: i.lastUpdatedAt || null,
        last_updated_by: i.lastUpdatedBy || null
      }))
    );
    if (itemRows.length) await _sb.from('shared_list_items').upsert(itemRows);
  }
}

// ─── Explicit deletes ──────────────────────────────────────
// Called by each delete function so upsert-based push doesn't leave orphans in Supabase.

async function sbDeleteTask(id) {
  await _sb.from('tasks').delete().eq('id', id);
}

async function sbDeleteHabit(id) {
  await _sb.from('habits').delete().eq('id', id);
}

async function sbDeleteGoal(id) {
  await _sb.from('goals').delete().eq('id', id);
}

async function sbDeleteProject(id) {
  await _sb.from('projects').delete().eq('id', id);
}

async function sbDeleteSharedList(id) {
  await _sb.from('shared_lists').delete().eq('id', id);
}

async function sbDeleteSharedItem(id) {
  await _sb.from('shared_list_items').delete().eq('id', id);
}
