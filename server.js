const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CATEGORIES = ['Personal', 'Work', 'Study', 'Shopping', 'Health', 'Travel', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

/* ---------- database ---------- */
const db = new Database(path.join(__dirname, 'tasks.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    category    TEXT    NOT NULL DEFAULT 'Personal',
    priority    TEXT    NOT NULL DEFAULT 'Medium',
    date        TEXT    NOT NULL DEFAULT '',
    time        TEXT    NOT NULL DEFAULT '',
    completed   INTEGER NOT NULL DEFAULT 0,
    created     INTEGER NOT NULL
  )
`);

const q = {
  all:    db.prepare('SELECT * FROM tasks ORDER BY created DESC'),
  one:    db.prepare('SELECT * FROM tasks WHERE id = ?'),
  insert: db.prepare(`INSERT INTO tasks (title, description, category, priority, date, time, completed, created)
                      VALUES (@title, @description, @category, @priority, @date, @time, 0, @created)`),
  update: db.prepare(`UPDATE tasks SET title=@title, description=@description, category=@category,
                      priority=@priority, date=@date, time=@time WHERE id=@id`),
  toggle: db.prepare('UPDATE tasks SET completed = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM tasks WHERE id = ?')
};
const toTask = r => ({ ...r, completed: !!r.completed });

/* ---------- validation ---------- */
function clean(b = {}) {
  const title = String(b.title ?? '').trim().slice(0, 80);
  if (!title) return { error: 'Title is required.' };
  const category = CATEGORIES.includes(b.category) ? b.category : 'Personal';
  const priority = PRIORITIES.includes(b.priority) ? b.priority : 'Medium';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '';
  const time = /^\d{2}:\d{2}$/.test(b.time) ? b.time : '';
  return { value: { title, description: String(b.description ?? '').trim().slice(0, 200), category, priority, date, time } };
}

/* ---------- app + REST API ---------- */
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// READ all
app.get('/api/tasks', (req, res) => res.json(q.all.all().map(toTask)));

// CREATE
app.post('/api/tasks', (req, res) => {
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const info = q.insert.run({ ...value, created: Date.now() });
  res.status(201).json(toTask(q.one.get(info.lastInsertRowid)));
});

// UPDATE (edit fields)
app.put('/api/tasks/:id', (req, res) => {
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const info = q.update.run({ ...value, id: req.params.id });
  if (!info.changes) return res.status(404).json({ error: 'Task not found.' });
  res.json(toTask(q.one.get(req.params.id)));
});

// UPDATE (complete / incomplete)
app.patch('/api/tasks/:id/complete', (req, res) => {
  const info = q.toggle.run(req.body.completed ? 1 : 0, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Task not found.' });
  res.json(toTask(q.one.get(req.params.id)));
});

// DELETE
app.delete('/api/tasks/:id', (req, res) => {
  const info = q.remove.run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Task not found.' });
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error.' }); });

app.listen(PORT, () => console.log(`TaskFlow running at http://localhost:${PORT}`));