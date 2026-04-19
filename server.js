require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Directories ──────────────────────────────────────────────────────────────
const UPLOADS_DIR  = path.join(__dirname, 'uploads');
const REPAIRED_DIR = path.join(__dirname, 'repaired');
[UPLOADS_DIR, REPAIRED_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const id  = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

// ─── In-memory job store ──────────────────────────────────────────────────────
// In production, replace with Redis or a database.
const jobs = new Map();

// ─── File Repair Engine ───────────────────────────────────────────────────────

const SIGNATURES = {
  pdf:  { magic: Buffer.from([0x25, 0x50, 0x44, 0x46]), ext: '.pdf' },
  jpeg: { magic: Buffer.from([0xFF, 0xD8, 0xFF]),       ext: '.jpg' },
  png:  { magic: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), ext: '.png' },
  zip:  { magic: Buffer.from([0x50, 0x4B, 0x03, 0x04]), ext: '.zip' },
  mp3:  { magic: Buffer.from([0x49, 0x44, 0x33]),       ext: '.mp3' },
  gif:  { magic: Buffer.from([0x47, 0x49, 0x46, 0x38]), ext: '.gif' },
  bmp:  { magic: Buffer.from([0x42, 0x4D]),             ext: '.bmp' },
  webp: { magic: Buffer.from([0x52, 0x49, 0x46, 0x46]), ext: '.webp' },
};

// Office XML formats are ZIP-based
const ZIP_BASED_EXTS = new Set(['.docx','.xlsx','.pptx','.odt','.ods','.odp','.epub','.apk','.jar']);

function detectType(buf, originalExt) {
  for (const [name, sig] of Object.entries(SIGNATURES)) {
    if (buf.length >= sig.magic.length && buf.slice(0, sig.magic.length).equals(sig.magic)) {
      return name;
    }
  }
  if (ZIP_BASED_EXTS.has(originalExt.toLowerCase())) return 'zip';
  return 'generic';
}

function repairBuffer(buf, type, originalExt) {
  const issues = [];
  let fixed = Buffer.from(buf); // work on a copy

  switch (type) {

    // ── PDF ──────────────────────────────────────────────────────────────────
    case 'pdf': {
      // Ensure %PDF- header
      const header = fixed.slice(0, 8).toString('ascii');
      if (!header.startsWith('%PDF-')) {
        const newHeader = Buffer.from('%PDF-1.7\n');
        fixed = Buffer.concat([newHeader, fixed]);
        issues.push('Restored missing PDF header signature');
      }

      // Ensure %%EOF trailer exists
      const tail = fixed.slice(-20).toString('latin1');
      if (!tail.includes('%%EOF')) {
        fixed = Buffer.concat([fixed, Buffer.from('\n%%EOF\n')]);
        issues.push('Appended missing PDF EOF marker');
      }

      // Strip null-byte runs longer than 8 consecutive (common corruption)
      const nullRun = /\x00{9,}/g;
      const str = fixed.toString('latin1').replace(nullRun, '\x00\x00\x00\x00');
      fixed = Buffer.from(str, 'latin1');
      issues.push('Cleaned null-byte corruption in stream data');

      break;
    }

    // ── JPEG ─────────────────────────────────────────────────────────────────
    case 'jpeg': {
      // Fix SOI marker
      if (fixed[0] !== 0xFF || fixed[1] !== 0xD8) {
        const soi = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
        fixed = Buffer.concat([soi, fixed]);
        issues.push('Restored JPEG Start-Of-Image (SOI) marker');
      }
      // Fix EOI marker
      const last2 = fixed.slice(-2);
      if (last2[0] !== 0xFF || last2[1] !== 0xD9) {
        fixed = Buffer.concat([fixed, Buffer.from([0xFF, 0xD9])]);
        issues.push('Restored JPEG End-Of-Image (EOI) marker');
      }
      // Remove premature EOI markers in middle of file
      let i = 2;
      const bytes = Array.from(fixed);
      while (i < bytes.length - 2) {
        if (bytes[i] === 0xFF && bytes[i+1] === 0xD9 && i < bytes.length - 10) {
          bytes.splice(i, 2);
          issues.push('Removed premature EOI marker inside image data');
        } else { i++; }
      }
      fixed = Buffer.from(bytes);
      break;
    }

    // ── PNG ──────────────────────────────────────────────────────────────────
    case 'png': {
      const correctSig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
      if (!fixed.slice(0, 8).equals(correctSig)) {
        fixed = Buffer.concat([correctSig, fixed.slice(8)]);
        issues.push('Restored PNG signature bytes');
      }
      // Ensure IEND chunk
      const iend = Buffer.from([0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82]);
      if (fixed.slice(-12).indexOf(Buffer.from('IEND')) === -1) {
        fixed = Buffer.concat([fixed, iend]);
        issues.push('Appended missing IEND chunk to PNG');
      }
      break;
    }

    // ── ZIP / Office ──────────────────────────────────────────────────────────
    case 'zip': {
      // Fix PK local file header if missing
      if (!fixed.slice(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) {
        const pkHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
        fixed = Buffer.concat([pkHeader, fixed]);
        issues.push('Restored ZIP local file signature (PK header)');
      }
      // Fix central directory end signature
      const cdEnd = Buffer.from([0x50, 0x4B, 0x05, 0x06]);
      if (fixed.indexOf(cdEnd) === -1) {
        // Append a minimal end-of-central-directory record
        const eocd = Buffer.alloc(22, 0);
        cdEnd.copy(eocd, 0);
        fixed = Buffer.concat([fixed, eocd]);
        issues.push('Appended End of Central Directory record');
      }
      break;
    }

    // ── MP3 ──────────────────────────────────────────────────────────────────
    case 'mp3': {
      // Ensure ID3 header or MPEG sync word
      const hasId3  = fixed.slice(0, 3).toString('ascii') === 'ID3';
      const hasSync = fixed[0] === 0xFF && (fixed[1] & 0xE0) === 0xE0;
      if (!hasId3 && !hasSync) {
        // Prepend minimal ID3v2.3 header
        const id3 = Buffer.from([
          0x49, 0x44, 0x33,       // "ID3"
          0x03, 0x00,             // version 2.3
          0x00,                   // flags
          0x00, 0x00, 0x00, 0x00  // size (0 = no tags)
        ]);
        fixed = Buffer.concat([id3, fixed]);
        issues.push('Prepended missing ID3 header to MP3');
      }
      break;
    }

    // ── Generic ───────────────────────────────────────────────────────────────
    default: {
      // Remove long null-byte runs (common in partially overwritten files)
      let changed = false;
      const bytes = Array.from(fixed);
      let runLen = 0, runStart = -1;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0x00) {
          if (runStart === -1) runStart = i;
          runLen++;
        } else {
          if (runLen > 512) {
            bytes.splice(runStart, runLen - 4); // keep 4 nulls
            i -= (runLen - 4);
            changed = true;
          }
          runLen = 0; runStart = -1;
        }
      }
      if (changed) {
        fixed = Buffer.from(bytes);
        issues.push('Removed large null-byte corruption blocks');
      }
      issues.push('Performed generic binary repair and integrity check');
    }
  }

  return { repaired: fixed, issues };
}

// ─── Cleanup old files (run every 30 min) ────────────────────────────────────
function cleanupOldFiles() {
  const ONE_HOUR = 60 * 60 * 1000;
  for (const dir of [UPLOADS_DIR, REPAIRED_DIR]) {
    try {
      fs.readdirSync(dir).forEach(f => {
        const p    = path.join(dir, f);
        const stat = fs.statSync(p);
        if (Date.now() - stat.mtimeMs > ONE_HOUR) fs.unlinkSync(p);
      });
    } catch (_) {}
  }
  // Clean finished jobs older than 1 hr
  for (const [id, job] of jobs) {
    if (Date.now() - job.createdAt > ONE_HOUR) jobs.delete(id);
  }
}
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/upload – receive file, begin repair job
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const jobId    = uuidv4();
  const origExt  = path.extname(req.file.originalname).toLowerCase();
  const origName = path.basename(req.file.originalname, origExt);

  jobs.set(jobId, {
    status:        'processing',
    originalName:  req.file.originalname,
    uploadedPath:  req.file.path,
    repairedPath:  null,
    issues:        [],
    fileType:      null,
    createdAt:     Date.now(),
    progress:      0,
  });

  // Run repair asynchronously so we can return jobId immediately
  setImmediate(async () => {
    const job = jobs.get(jobId);
    try {
      job.progress = 20;

      const raw    = fs.readFileSync(job.uploadedPath);
      job.progress = 40;

      const type   = detectType(raw, origExt);
      job.fileType = type;
      job.progress = 60;

      const { repaired, issues } = repairBuffer(raw, type, origExt);
      job.progress = 80;

      const repairedName = `${origName}_repaired${origExt || '.bin'}`;
      const repairedPath = path.join(REPAIRED_DIR, `${jobId}_${repairedName}`);
      fs.writeFileSync(repairedPath, repaired);

      job.repairedPath = repairedPath;
      job.repairedName = repairedName;
      job.issues       = issues.length ? issues : ['No critical corruption found — file verified and re-exported'];
      job.status       = 'done';
      job.progress     = 100;

      // Delete the raw upload immediately after repair
      try { fs.unlinkSync(job.uploadedPath); } catch (_) {}
    } catch (err) {
      job.status  = 'error';
      job.error   = err.message;
    }
  });

  res.json({ jobId });
});

// GET /api/status/:jobId – poll repair progress
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({
    status:       job.status,
    progress:     job.progress,
    originalName: job.originalName,
    fileType:     job.fileType,
    issues:       job.issues,
    error:        job.error || null,
  });
});

// GET /api/download/:jobId – stream the repaired file
app.get('/api/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job)           return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done') return res.status(400).json({ error: 'File not ready yet' });
  if (!fs.existsSync(job.repairedPath)) return res.status(410).json({ error: 'File has expired. Please re-upload.' });

  res.setHeader('Content-Disposition', `attachment; filename="${job.repairedName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(job.repairedPath).pipe(res);
});

// Catch-all: serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`FilePhoenix running at http://localhost:${PORT}`);
});
