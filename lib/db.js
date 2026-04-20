const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'filephoenix.db');
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Tables ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS visitors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT,
    path       TEXT,
    visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS repairs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       TEXT UNIQUE,
    user_id      INTEGER,
    original_name TEXT,
    file_type    TEXT,
    file_size    INTEGER,
    repair_method TEXT,
    status       TEXT DEFAULT 'pending',
    issues       TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name         TEXT,
    repair_count INTEGER DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Visitors ──────────────────────────────────────────────────────────────────
function logVisitor(ip, urlPath) {
  try {
    db.prepare('INSERT INTO visitors (ip, path) VALUES (?, ?)').run(ip, urlPath);
  } catch (_) {}
}

// ── Repairs ───────────────────────────────────────────────────────────────────
function createRepairJob(jobId, userId, originalName, fileType, fileSize) {
  db.prepare(`
    INSERT INTO repairs (job_id, user_id, original_name, file_type, file_size)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobId, userId || null, originalName, fileType, fileSize);
}

function updateRepairJob(jobId, status, repairMethod, issues) {
  db.prepare(`
    UPDATE repairs SET status = ?, repair_method = ?, issues = ? WHERE job_id = ?
  `).run(status, repairMethod, JSON.stringify(issues), jobId);
}

// ── Users ─────────────────────────────────────────────────────────────────────
function createUser(email, passwordHash, name) {
  return db.prepare(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
  ).run(email, passwordHash, name);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserById(id) {
  return db.prepare(
    'SELECT id, email, name, repair_count, created_at FROM users WHERE id = ?'
  ).get(id);
}

function incrementUserRepairs(userId) {
  if (userId) db.prepare('UPDATE users SET repair_count = repair_count + 1 WHERE id = ?').run(userId);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function getStats() {
  const totalRepairs  = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE status='done'").get().c;
  const totalUsers    = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  const todayRepairs  = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE DATE(created_at)=DATE('now') AND status='done'").get().c;
  const totalVisitors = db.prepare("SELECT COUNT(DISTINCT ip) as c FROM visitors").get().c;
  const successRate   = (() => {
    const total = db.prepare("SELECT COUNT(*) as c FROM repairs").get().c;
    if (!total) return 0;
    return Math.round((totalRepairs / total) * 100);
  })();
  const byType  = db.prepare("SELECT file_type, COUNT(*) as count FROM repairs WHERE status='done' GROUP BY file_type ORDER BY count DESC LIMIT 10").all();
  const recent  = db.prepare("SELECT original_name, file_type, file_size, status, created_at FROM repairs ORDER BY created_at DESC LIMIT 20").all();
  const users   = db.prepare("SELECT id, name, email, repair_count, created_at FROM users ORDER BY created_at DESC LIMIT 50").all();
  return { totalRepairs, totalUsers, todayRepairs, totalVisitors, successRate, byType, recent, users };
}

module.exports = {
  logVisitor, createRepairJob, updateRepairJob,
  createUser, getUserByEmail, getUserById, incrementUserRepairs,
  getStats
};
