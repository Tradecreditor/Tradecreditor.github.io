// projects.js — Dynamic project management (replaces hardcoded PROJECTS constant)

const DEFAULT_PROJECTS = [
  { id:'gaming',  name:'Gaming Job Hunt',   color:'#f97316' },
  { id:'tobuy',   name:'To buy list',        color:'#a78bfa' },
  { id:'uk',      name:'Uk To Do',           color:'#38bdf8' },
  { id:'csw',     name:'CSW Packing',        color:'#f472b6' },
  { id:'renting', name:'Renting Drake Way',  color:'#4ade80' },
];

const PROJ_PALETTE = ['#f97316','#a78bfa','#38bdf8','#f472b6','#4ade80','#db4035','#22c55e','#eab308','#06b6d4','#8b5cf6'];

let projects = [];

function loadProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem('tf_projects'));
    if (stored && stored.length > 0) {
      projects = stored;
    } else {
      // Migrate from hardcoded defaults — preserves existing task project assignments
      projects = DEFAULT_PROJECTS.map(p => ({
        ...p, owner: currentUser?.id || '', createdAt: new Date().toISOString()
      }));
      saveProjects();
    }
  } catch(e) {
    projects = DEFAULT_PROJECTS.map(p => ({ ...p, owner: '', createdAt: new Date().toISOString() }));
  }
}

function saveProjects() {
  localStorage.setItem('tf_projects', JSON.stringify(projects));
}

function createProject(name, color) {
  const p = { id: uid(), name: name.trim(), color, owner: currentUser?.id || '', createdAt: new Date().toISOString() };
  projects.push(p);
  saveProjects();
  return p;
}

function deleteProjectById(id) {
  projects = projects.filter(p => p.id !== id);
  tasks.forEach(t => { if (t.project === id) t.project = ''; });
  persist();
  saveProjects();
  sbDeleteProject(id);
}

// ─── New project inline form ───────────────────────────────
let selectedProjColor = PROJ_PALETTE[0];

function toggleNewProjectForm() {
  const wrap = document.getElementById('new-project-form');
  if (!wrap) return;
  if (wrap.style.display !== 'none') { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

  selectedProjColor = PROJ_PALETTE[0];
  wrap.innerHTML = `
    <div style="padding:8px;background:#161616;border:1px solid #2a2a2a;border-radius:8px;margin-top:4px;">
      <input id="new-proj-name" type="text" class="form-field" placeholder="Project name…" maxlength="40"
             style="margin-bottom:8px;font-size:13px;"
             onkeydown="if(event.key==='Enter')saveNewProject();if(event.key==='Escape')closeNewProjectForm();" />
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
        ${PROJ_PALETTE.map(c => `<div onclick="pickProjColor('${c}')" id="pc-${c.slice(1)}"
          style="width:16px;height:16px;border-radius:50%;background:${c};cursor:pointer;
                 box-shadow:${c===selectedProjColor?'0 0 0 2px #fff':''};transition:box-shadow .1s;flex-shrink:0;"></div>`).join('')}
      </div>
      <div style="display:flex;gap:6px;">
        <button onclick="saveNewProject()"
                style="flex:1;padding:6px;background:#db4035;color:#fff;font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;font-family:inherit;">Add</button>
        <button onclick="closeNewProjectForm()"
                style="flex:1;padding:6px;background:none;border:1px solid #333;color:#888;font-size:12px;border-radius:6px;cursor:pointer;font-family:inherit;">Cancel</button>
      </div>
    </div>`;
  wrap.style.display = 'block';
  setTimeout(() => document.getElementById('new-proj-name')?.focus(), 40);
}

function pickProjColor(color) {
  selectedProjColor = color;
  PROJ_PALETTE.forEach(c => {
    const el = document.getElementById('pc-' + c.slice(1));
    if (el) el.style.boxShadow = c === color ? '0 0 0 2px #fff' : '';
  });
}

function saveNewProject() {
  const name = document.getElementById('new-proj-name')?.value.trim();
  if (!name) return;
  const p = createProject(name, selectedProjColor);
  closeNewProjectForm();
  render();
  toast(`"${p.name}" created`);
}

function closeNewProjectForm() {
  const wrap = document.getElementById('new-project-form');
  if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
}

function confirmDeleteProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const ct = tasks.filter(t => !t.completed && t.project === id).length;
  const msg = `Delete "${p.name}"?${ct ? ` ${ct} task${ct!==1?'s':''} will move to Inbox.` : ''}`;
  document.getElementById('confirm-msg').textContent = msg;
  confirmCb = () => { deleteProjectById(id); render(); toast(`"${p.name}" deleted`); };
  document.getElementById('confirm-modal').style.display = 'flex';
}
