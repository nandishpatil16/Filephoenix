require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const db     = require('./lib/db');
const repair = require('./lib/repair');

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET     = process.env.JWT_SECRET     || 'filephoenix_dev_secret_change_in_prod';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const UPLOADS_DIR  = path.join(__dirname, 'uploads');
const REPAIRED_DIR = path.join(__dirname, 'repaired');
[UPLOADS_DIR, REPAIRED_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    db.logVisitor(ip, req.path);
  }
  next();
});

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

function adminRequired(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Admin login required' });
  try {
    const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const jobs = new Map();

// ---- ADMIN ROUTES ----

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

app.get('/api/admin/verify', adminRequired, (req, res) => {
  res.json({ ok: true, username: req.admin.username });
});

app.get('/api/stats', adminRequired, (req, res) => {
  res.json(db.getStats());
});

// ---- USER AUTH ROUTES ----

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    if (db.getUserByEmail(email)) return res.status(400).json({ error: 'This email is already registered' });
    const hash   = await bcrypt.hash(password, 10);
    const result = db.createUser(email, hash, name || email.split('@')[0]);
    const user   = db.getUserById(result.lastInsertRowid);
    const token  = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: 'Signup failed: ' + e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const user = db.getUserByEmail(email);
    if (!user) return res.status(400).json({ error: 'No account found with this email' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Incorrect password' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, repair_count: user.repair_count } });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ---- REPAIR ROUTES ----

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext      = path.extname(req.file.originalname).toLowerCase();
  const fileType = repair.detectFileType(ext);
  if (fileType === 'video') {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'VIDEO_AUTH_REQUIRED' });
  }
  const jobId = uuidv4();
  db.createRepairJob(jobId, null, req.file.originalname, fileType, req.file.size);
  jobs.set(jobId, { status: 'processing', originalName: req.file.originalname, uploadedPath: req.file.path, repairedPath: null, repairedName: null, fileType, ext, issues: [], progress: 0, createdAt: Date.now() });
  setImmediate(() => runRepair(jobId, null));
  res.json({ jobId });
});

app.post('/api/upload/video', authRequired, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext      = path.extname(req.file.originalname).toLowerCase();
  const fileType = repair.detectFileType(ext);
  if (fileType !== 'video') {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'Please upload a video file' });
  }
  const jobId = uuidv4();
  db.createRepairJob(jobId, req.user.id, req.file.originalname, 'video', req.file.size);
  jobs.set(jobId, { status: 'processing', originalName: req.file.originalname, uploadedPath: req.file.path, repairedPath: null, repairedName: null, fileType: 'video', ext, issues: [], progress: 0, createdAt: Date.now() });
  setImmediate(() => runRepair(jobId, req.user.id));
  res.json({ jobId });
});

async function runRepair(jobId, userId) {
  const job = jobs.get(jobId);
  try {
    job.progress = 30;
    const ext          = job.ext;
    const baseName     = path.basename(job.originalName, ext);
    const repairedName = `${baseName}_repaired${ext}`;
    const repairedPath = path.join(REPAIRED_DIR, `${jobId}_${repairedName}`);
    job.progress = 60;
    const issues = await repair.repairFile(job.uploadedPath, repairedPath, job.fileType, ext);
    job.repairedPath = repairedPath;
    job.repairedName = repairedName;
    job.issues       = issues;
    job.status       = 'done';
    job.progress     = 100;
    db.updateRepairJob(jobId, 'done', job.fileType, issues);
    db.incrementUserRepairs(userId);
    try { fs.unlinkSync(job.uploadedPath); } catch (_) {}
  } catch (err) {
    job.status = 'error';
    job.error  = err.message;
    db.updateRepairJob(jobId, 'error', job.fileType, [err.message]);
    try { fs.unlinkSync(job.uploadedPath); } catch (_) {}
  }
}

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ status: job.status, progress: job.progress, originalName: job.originalName, fileType: job.fileType, issues: job.issues, error: job.error || null });
});

app.get('/api/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job)                             return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done')            return res.status(400).json({ error: 'File not ready' });
  if (!fs.existsSync(job.repairedPath)) return res.status(410).json({ error: 'File has expired. Please re-upload.' });
  res.setHeader('Content-Disposition', `attachment; filename="${job.repairedName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(job.repairedPath).pipe(res);
});

function cleanup() {
  const ONE_HOUR = 60 * 60 * 1000;
  [UPLOADS_DIR, REPAIRED_DIR].forEach(dir => {
    try { fs.readdirSync(dir).forEach(f => { const p = path.join(dir, f); if (Date.now() - fs.statSync(p).mtimeMs > ONE_HOUR) fs.unlinkSync(p); }); } catch (_) {}
  });
  for (const [id, job] of jobs) { if (Date.now() - job.createdAt > ONE_HOUR) jobs.delete(id); }
}
setInterval(cleanup, 30 * 60 * 1000);

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`FilePhoenix v2 running at http://localhost:${PORT}`));
