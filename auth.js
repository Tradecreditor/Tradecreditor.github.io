// auth.js — Supabase-backed auth (Phase 2)
// Supabase handles password hashing, sessions, and token refresh.

let currentUser = null;

// Build the app-shape currentUser from a Supabase session user + profile row
function buildCurrentUser(sbUser, profile) {
  return {
    id:          sbUser.id,
    email:       sbUser.email,
    displayName: profile?.display_name || sbUser.user_metadata?.display_name || 'User',
    initials:    profile?.initials     || sbUser.user_metadata?.initials     || 'U',
    avatarColor: profile?.avatar_color || sbUser.user_metadata?.avatar_color || '#22a45d',
    isAdmin:     profile?.is_admin     || sbUser.user_metadata?.is_admin     || false,
  };
}

// ─── Auth actions ─────────────────────────────────────────

async function login(email, pw) {
  const r = await sbSignIn(email.toLowerCase().trim(), pw);
  if (r.error) return { error: r.error };
  const profiles = await sbGetAllProfiles();
  const profile  = profiles.find(p => p.id === r.user.id);
  return { user: buildCurrentUser(r.user, profile) };
}

async function register(email, pw, displayName) {
  const count = await sbGetUserCount();
  if (count >= 2) return { error: 'This app supports a maximum of 2 accounts.' };

  const initials    = displayName.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('');
  const palette     = ['#22a45d','#3b82f6','#db4035','#f97316','#a78bfa','#38bdf8'];
  const avatarColor = palette[count % palette.length];
  const isAdmin     = count === 0;

  const meta = { display_name: displayName.trim(), initials, avatar_color: avatarColor, is_admin: isAdmin };
  const r = await sbSignUp(email.toLowerCase().trim(), pw, meta);
  if (r.error) return { error: r.error };

  // Profile row is auto-created by the DB trigger; build currentUser from metadata
  return { user: buildCurrentUser(r.user, { display_name: meta.display_name, initials, avatar_color: avatarColor, is_admin: isAdmin }) };
}

async function logout() {
  await sbSignOut();
  currentUser = null;
  showAuthModal();
}

// ─── Invite codes ─────────────────────────────────────────

async function generateInviteCode() {
  return await sbGenerateInviteCode();
}

async function redeemInviteCode(code, email, pw, displayName) {
  const stored = await sbGetInviteCode();
  if (!stored || stored.code !== code.toUpperCase()) return { error: 'Invalid invite code.' };
  const result = await register(email, pw, displayName);
  if (result.user) await sbConsumeInviteCode();
  return result;
}

// ─── Session ──────────────────────────────────────────────

async function initAuth() {
  const sbUser = await sbGetSession();
  if (!sbUser) { showAuthModal(); return false; }
  const profiles = await sbGetAllProfiles();
  const profile  = profiles.find(p => p.id === sbUser.id);
  currentUser = buildCurrentUser(sbUser, profile);
  renderSidebarUser();
  return true;
}

// ─── Data migration (localStorage → Supabase) ─────────────

function migrateDataToUser(userId) {
  let changed = false;
  tasks.forEach(t => { if (!t.owner) { t.owner = userId; changed = true; } });
  habits.forEach(h => {
    if (!h.owner)          { h.owner = userId; changed = true; }
    if (!h.createdBy)      { h.createdBy = userId; changed = true; }
    if (!h.checkInsByUser) { h.checkInsByUser = { [userId]: [...(h.checkIns || [])] }; changed = true; }
  });
  goals.forEach(g => { if (!g.owner) { g.owner = userId; changed = true; } });
  if (changed) persist();
}

// ─── Auth UI helpers ──────────────────────────────────────

function showAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('app-wrapper').style.display = 'none';
  sbGetUserCount().then(count => showAuthTab(count === 0 ? 'register' : 'login'));
}

function hideAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('app-wrapper').style.display = 'flex';
}

function showAuthTab(tab) {
  ['login','register','invite'].forEach(t => {
    document.getElementById('auth-' + t + '-panel').style.display = t === tab ? 'flex' : 'none';
  });
  document.querySelectorAll('.auth-tab-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.style.color             = active ? '#db4035' : '#666';
    b.style.borderBottomColor = active ? '#db4035' : 'transparent';
  });
}

function authErr(panelId, msg) {
  const el = document.getElementById(panelId);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

// ─── Auth form handlers ───────────────────────────────────

async function handleLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-password').value;
  authErr('auth-login-err', '');
  if (!email || !pw) { authErr('auth-login-err', 'Please fill in all fields.'); return; }
  const r = await login(email, pw);
  if (r.error) { authErr('auth-login-err', r.error); return; }
  currentUser = r.user;
  await onAuthSuccess(false);
}

async function handleRegister() {
  const displayName = document.getElementById('auth-name').value.trim();
  const email       = document.getElementById('auth-reg-email').value.trim();
  const pw          = document.getElementById('auth-reg-password').value;
  const pw2         = document.getElementById('auth-reg-confirm').value;
  authErr('auth-register-err', '');
  if (!displayName || !email || !pw) { authErr('auth-register-err', 'Please fill in all fields.'); return; }
  if (pw !== pw2)    { authErr('auth-register-err', 'Passwords do not match.'); return; }
  if (pw.length < 6) { authErr('auth-register-err', 'Password must be at least 6 characters.'); return; }
  const r = await register(email, pw, displayName);
  if (r.error) { authErr('auth-register-err', r.error); return; }
  currentUser = r.user;
  await onAuthSuccess(true);
}

async function handleInviteRedeem() {
  const code        = document.getElementById('auth-invite-code').value.trim();
  const displayName = document.getElementById('auth-invite-name').value.trim();
  const email       = document.getElementById('auth-invite-email').value.trim();
  const pw          = document.getElementById('auth-invite-password').value;
  authErr('auth-invite-err', '');
  if (!code || !displayName || !email || !pw) { authErr('auth-invite-err', 'Please fill in all fields.'); return; }
  const r = await redeemInviteCode(code, email, pw, displayName);
  if (r.error) { authErr('auth-invite-err', r.error); return; }
  currentUser = r.user;
  await onAuthSuccess(true);
}

async function onAuthSuccess(isNew) {
  if (isNew) {
    // Clear any stale localStorage cache from a previous user's session
    ['tf_tasks','tf_habits','tf_goals','tf_shared_lists','tf_projects'].forEach(k => localStorage.removeItem(k));
    projects = [];
    saveProjects();
  }
  await load();
  migrateDataToUser(currentUser.id);
  hideAuthModal();
  renderSidebarUser();
  if (isNew && !localStorage.getItem('tf_onboarded_' + currentUser.id)) {
    showOnboarding();
  } else {
    render();
  }
  updateSyncStatus('synced');
}

// ─── Sidebar user render ──────────────────────────────────

function renderSidebarUser() {
  if (!currentUser) return;
  const av = document.getElementById('sb-user-avatar');
  const nm = document.getElementById('sb-user-name');
  if (av) { av.style.background = currentUser.avatarColor; av.textContent = currentUser.initials; }
  if (nm) nm.textContent = currentUser.displayName;
}

// ─── Onboarding ───────────────────────────────────────────

let obStep = 1;

function showOnboarding() {
  obStep = 1; renderOnboardingStep();
  document.getElementById('onboarding-modal').style.display = 'flex';
}

function renderOnboardingStep() {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('ob-step-' + i);
    if (el) el.style.display = i === obStep ? 'flex' : 'none';
  }
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('ob-dot-' + i);
    if (dot) {
      dot.style.background = i === obStep ? '#db4035' : '#333';
      dot.style.width      = i === obStep ? '20px' : '7px';
    }
  }
  const back = document.getElementById('ob-back');
  if (back) back.style.visibility = obStep === 1 ? 'hidden' : 'visible';
}

function obNext() {
  if (obStep < 3) { obStep++; renderOnboardingStep(); }
  else finishOnboarding();
}

function obBack() {
  if (obStep > 1) { obStep--; renderOnboardingStep(); }
}

function finishOnboarding() {
  const firstTask = document.getElementById('ob-task-title')?.value.trim();
  if (firstTask) {
    tasks.unshift({ id: uid(), title: firstTask, dueDate: todayStr(), priority: 'medium',
                    description: '', project: '', subtasks: [], completed: false,
                    completedAt: null, createdAt: todayStr(), owner: currentUser.id });
    persist();
  }
  localStorage.setItem('tf_onboarded_' + currentUser.id, '1');
  document.getElementById('onboarding-modal').style.display = 'none';
  render();
}
