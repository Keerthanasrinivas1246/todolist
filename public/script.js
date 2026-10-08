(() => {
  'use strict';
  const THEME = 'taskflow-theme';
  const PRIORITY = { Low: 1, Medium: 2, High: 3, Urgent: 4 };
  const $ = id => document.getElementById(id);
  const el = {
    list: $('taskList'), empty: $('empty'), search: $('search'), fCat: $('fCategory'), fPri: $('fPriority'),
    sort: $('sort'), addForm: $('addForm'), editForm: $('editForm'), modal: $('modal'), toasts: $('toasts')
  };
  let tasks = [];
  let status = 'all', editingId = null;

  /* ---------- storage ---------- */
  async function api(path = '', method = 'GET', body) {
    let res;
    try {
      res = await fetch('/api/tasks' + path, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch {
      toast('Cannot reach the server. Is it running?', 'error'); throw new Error('network');
    }
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error || 'Something went wrong.';
      toast(msg, 'error'); throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  /* ---------- helpers ---------- */
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dueStamp = t => t.date ? new Date(`${t.date}T${t.time || '23:59'}`).getTime() : Infinity;
  function fmtDue(t) {
    if (!t.date) return '';
    const d = new Date(`${t.date}T00:00`);
    let s = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (t.time) { const [h, m] = t.time.split(':'); s += ' · ' + new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
    return s;
  }
  function toast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg; el.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); t.addEventListener('animationend', () => t.remove()); }, 2600);
  }

  /* ---------- stats ---------- */
  function animateNumber(node, to) {
    const from = +node.dataset.v || 0; node.dataset.v = to;
    if (from === to) { node.textContent = to; return; }
    const start = performance.now(), dur = 500;
    (function step(now) {
      const p = Math.min((now - start) / dur, 1);
      node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }
  function updateStats() {
    const done = tasks.filter(t => t.completed).length, today = todayStr();
    animateNumber($('statTotal'), tasks.length);
    animateNumber($('statDone'), done);
    animateNumber($('statPending'), tasks.length - done);
    animateNumber($('statToday'), tasks.filter(t => !t.completed && t.date === today).length);
  }

  /* ---------- render ---------- */
  function visibleTasks() {
    const q = el.search.value.trim().toLowerCase();
    let out = tasks.filter(t =>
      (status === 'all' || (status === 'completed') === t.completed) &&
      (el.fCat.value === 'all' || t.category === el.fCat.value) &&
      (el.fPri.value === 'all' || t.priority === el.fPri.value) &&
      (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)));
    const s = el.sort.value;
    out.sort((a, b) =>
      s === 'oldest' ? a.created - b.created :
      s === 'priority' ? PRIORITY[b.priority] - PRIORITY[a.priority] || b.created - a.created :
      s === 'due' ? dueStamp(a) - dueStamp(b) || b.created - a.created :
      b.created - a.created);
    return out;
  }
  function taskHTML(t) {
    const overdue = !t.completed && t.date && dueStamp(t) < Date.now();
    const due = fmtDue(t);
    return `<li class="task p-${t.priority}${t.completed ? ' done' : ''}" data-id="${t.id}">
      <input type="checkbox" class="check" ${t.completed ? 'checked' : ''} aria-label="Mark “${esc(t.title)}” as ${t.completed ? 'incomplete' : 'complete'}">
      <div>
        <div class="t-title">${esc(t.title)}</div>
        ${t.description ? `<p class="t-desc">${esc(t.description)}</p>` : ''}
        <div class="meta">
          <span class="chip"><i class="fa-solid fa-tag"></i>${t.category}</span>
          <span class="chip pri">${t.priority}</span>
          ${due ? `<span class="chip${overdue ? ' overdue' : ''}"><i class="fa-regular fa-clock"></i>${due}${overdue ? ' · Overdue' : ''}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <button class="act edit" aria-label="Edit task"><i class="fa-solid fa-pen"></i></button>
        <button class="act del" aria-label="Delete task"><i class="fa-solid fa-trash"></i></button>
      </div></li>`;
  }
  function render() {
    const list = visibleTasks();
    el.list.innerHTML = list.map(taskHTML).join('');
    el.empty.hidden = list.length > 0;
    el.list.hidden = list.length === 0;
    if (!list.length) {
      const filtered = tasks.length > 0;
      $('emptyTitle').textContent = filtered ? 'No matching tasks' : 'No tasks yet!';
      $('emptyText').textContent = filtered ? 'Try a different search or clear your filters.' : 'Add your first task and start being productive.';
      $('emptyAdd').innerHTML = filtered ? '<i class="fa-solid fa-rotate-left"></i> Clear filters' : '<i class="fa-solid fa-plus"></i> Add Task';
      $('emptyAdd').dataset.mode = filtered ? 'clear' : 'add';
    }
    updateStats();
  }

  /* ---------- actions ---------- */
  // field id helpers (add form: title/desc/category/priority/date/time; edit form: eTitle/eDesc/...)
  const fields = pre => ({
    title: $(pre ? 'eTitle' : 'title'), description: $(pre ? 'eDesc' : 'desc'),
    category: $(pre ? 'eCategory' : 'category'), priority: $(pre ? 'ePriority' : 'priority'),
    date: $(pre ? 'eDate' : 'date'), time: $(pre ? 'eTime' : 'time')
  });
  function read(pre) {
    const f = fields(pre), v = {};
    for (const k in f) v[k] = f[k].value.trim();
    if (!v.title) { f.title.classList.add('invalid'); f.title.focus(); toast('Please enter a task title.', 'error'); return null; }
    return v;
  }
  document.addEventListener('input', e => e.target.classList.remove('invalid'));

  el.addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const v = read(false); if (!v) return;
    try {
      tasks.unshift(await api('', 'POST', v));
      el.addForm.reset(); $('priority').value = 'Medium';
      render(); toast('✓ Task added successfully!');
    } catch {}
  });

  el.editForm.addEventListener('submit', async e => {
    e.preventDefault();
    const v = read(true); if (!v) return;
    try {
      const updated = await api('/' + editingId, 'PUT', v);
      tasks = tasks.map(x => x.id === updated.id ? updated : x);
      closeModal(); render(); toast('✓ Task updated!');
    } catch {}
  });

  el.list.addEventListener('click', e => {
    const li = e.target.closest('.task'); if (!li) return;
    const t = tasks.find(x => String(x.id) === li.dataset.id); if (!t) return;
    if (e.target.closest('.del')) {
      api('/' + t.id, 'DELETE').then(() => {
        li.classList.add('removing');
        setTimeout(() => { tasks = tasks.filter(x => x.id !== t.id); render(); toast('🗑 Task deleted.'); }, 280);
      }).catch(() => {});
    } else if (e.target.closest('.edit')) openModal(t);
  });
  el.list.addEventListener('change', async e => {
    if (!e.target.classList.contains('check')) return;
    const li = e.target.closest('.task');
    const t = tasks.find(x => String(x.id) === li.dataset.id); if (!t) return;
    try {
      const updated = await api(`/${t.id}/complete`, 'PATCH', { completed: e.target.checked });
      t.completed = updated.completed;
      li.classList.toggle('done', t.completed);
      updateStats();
      toast(t.completed ? '🎉 Task completed!' : '↩ Task marked as active.');
      setTimeout(render, 350);
    } catch { e.target.checked = t.completed; }
  });

  /* ---------- modal ---------- */
  let lastFocus = null;
  function openModal(t) {
    editingId = t.id; lastFocus = document.activeElement;
    const f = fields(true);
    for (const k in f) f[k].value = t[k] || '';
    el.modal.hidden = false; f.title.focus();
  }
  function closeModal() { el.modal.hidden = true; editingId = null; lastFocus && lastFocus.focus && lastFocus.focus(); }
  $('modalClose').addEventListener('click', closeModal);
  $('modalCancel').addEventListener('click', closeModal);
  el.modal.addEventListener('mousedown', e => { if (e.target === el.modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.modal.hidden) closeModal(); });

  /* ---------- filters ---------- */
  [el.search, el.fCat, el.fPri, el.sort].forEach(n => n.addEventListener('input', render));
  $('statusFilter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    status = b.dataset.status;
    document.querySelectorAll('#statusFilter button').forEach(x => x.classList.toggle('active', x === b));
    render();
  });
  $('emptyAdd').addEventListener('click', e => {
    if (e.currentTarget.dataset.mode === 'clear') {
      el.search.value = ''; el.fCat.value = el.fPri.value = 'all'; status = 'all';
      document.querySelectorAll('#statusFilter button').forEach(x => x.classList.toggle('active', x.dataset.status === 'all'));
      render();
    } else { $('addForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => $('title').focus(), 400); }
  });

  /* ---------- theme + menu ---------- */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('themeToggle').innerHTML = `<i class="fa-solid fa-${t === 'dark' ? 'sun' : 'moon'}"></i>`;
  }
  applyTheme(document.documentElement.dataset.theme || 'light');
  $('themeToggle').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(t); try { localStorage.setItem(THEME, t); } catch {}
  });
  const menu = $('menu'), burger = $('burger');
  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    burger.innerHTML = `<i class="fa-solid fa-${open ? 'xmark' : 'bars'}"></i>`;
  });
  menu.addEventListener('click', e => {
    if (e.target.tagName === 'A') { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); burger.innerHTML = '<i class="fa-solid fa-bars"></i>'; }
  });

  render();
  api().then(data => { tasks = data; render(); }).catch(() => {});
})();