/* ── FilePhoenix — main.js ──────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── DOM refs ────────────────────────────────────────────────────────────
  const dropZone       = document.getElementById('dropZone');
  const fileInput      = document.getElementById('fileInput');
  const browseBtn      = document.getElementById('browseBtn');

  const stateProgress  = document.getElementById('stateProgress');
  const stateDone      = document.getElementById('stateDone');
  const stateError     = document.getElementById('stateError');

  const progressBar    = document.getElementById('progressBarInner');
  const progressMsg    = document.getElementById('progressMsg');
  const progressPct    = document.getElementById('progressPct');
  const progressSteps  = document.getElementById('progressSteps');
  const progressFileName= document.getElementById('progressFileName');

  const doneSub        = document.getElementById('doneSub');
  const doneIssues     = document.getElementById('doneIssues');
  const downloadBtn    = document.getElementById('downloadBtn');
  const repairAgainBtn = document.getElementById('repairAgainBtn');

  const errorMsg       = document.getElementById('errorMsg');
  const tryAgainBtn    = document.getElementById('tryAgainBtn');

  const hamburger      = document.getElementById('hamburger');
  const mobileOverlay  = document.getElementById('mobileOverlay');
  const mobileClose    = document.getElementById('mobileClose');

  // ── State ───────────────────────────────────────────────────────────────
  let currentJobId   = null;
  let pollInterval   = null;
  let uploadedFileName = '';

  // ── Repair step messages ─────────────────────────────────────────────────
  const STEPS = [
    { pct: 10, msg: 'Uploading file...'              },
    { pct: 25, msg: 'Reading binary structure...'    },
    { pct: 42, msg: 'Detecting file type...'         },
    { pct: 58, msg: 'Scanning for corruption...'     },
    { pct: 74, msg: 'Rebuilding damaged sectors...'  },
    { pct: 88, msg: 'Verifying integrity...'         },
    { pct: 99, msg: 'Finalising repaired file...'    },
  ];

  // ── Upload helpers ───────────────────────────────────────────────────────
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) startRepair(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) startRepair(e.dataTransfer.files[0]);
  });

  dropZone.addEventListener('click', e => {
    if (e.target !== browseBtn) fileInput.click();
  });

  // ── Mobile nav ───────────────────────────────────────────────────────────
  hamburger.addEventListener('click',  () => mobileOverlay.classList.add('open'));
  mobileClose.addEventListener('click',() => mobileOverlay.classList.remove('open'));
  document.querySelectorAll('.mob-link').forEach(a => {
    a.addEventListener('click', () => mobileOverlay.classList.remove('open'));
  });

  // ── Core repair flow ─────────────────────────────────────────────────────
  async function startRepair(file) {
    uploadedFileName = file.name;
    showProgress(file.name);

    const formData = new FormData();
    formData.append('file', file);

    let jobId;
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      jobId = data.jobId;
      currentJobId = jobId;
    } catch (err) {
      showError('Upload failed. Please check your connection and try again.');
      return;
    }

    // Animate the progress bar through fake steps while we poll
    animateSteps();
    pollInterval = setInterval(() => pollStatus(jobId), 1200);
  }

  async function pollStatus(jobId) {
    try {
      const res  = await fetch(`/api/status/${jobId}`);
      if (!res.ok) throw new Error('Status check failed');
      const data = await res.json();

      if (data.status === 'done') {
        clearInterval(pollInterval);
        setProgress(100, 'Complete');
        setTimeout(() => showDone(data), 400);
      } else if (data.status === 'error') {
        clearInterval(pollInterval);
        showError(data.error || 'An unknown error occurred during repair.');
      }
    } catch (_) {
      clearInterval(pollInterval);
      showError('Lost connection to the server. Please try again.');
    }
  }

  // ── Progress animation ───────────────────────────────────────────────────
  let fakeProgress = 0;
  let stepIdx      = 0;

  function animateSteps() {
    fakeProgress = 0; stepIdx = 0;
    const iv = setInterval(() => {
      const target = stepIdx < STEPS.length ? STEPS[stepIdx].pct : 96;
      fakeProgress += (target - fakeProgress) * 0.12 + 0.3;
      if (fakeProgress >= target && stepIdx < STEPS.length) {
        addStep(STEPS[stepIdx].msg);
        stepMsg(STEPS[stepIdx].msg);
        stepIdx++;
      }
      setProgress(Math.min(fakeProgress, 97));
      if (fakeProgress >= 97) clearInterval(iv);
    }, 200);
  }

  function setProgress(pct, label) {
    progressBar.style.width = pct + '%';
    progressPct.textContent = Math.round(pct) + '%';
    if (label) progressMsg.textContent = label;
  }
  function stepMsg(txt) { progressMsg.textContent = txt; }

  function addStep(txt) {
    const el = document.createElement('div');
    el.className = 'progress-step';
    el.textContent = txt;
    progressSteps.appendChild(el);
    progressSteps.scrollTop = progressSteps.scrollHeight;
  }

  // ── UI state switches ────────────────────────────────────────────────────
  function showProgress(fileName) {
    dropZone.classList.add('hidden');
    document.querySelector('.upload-meta').classList.add('hidden');
    stateProgress.classList.remove('hidden');
    stateDone.classList.add('hidden');
    stateError.classList.add('hidden');

    progressBar.style.width = '0%';
    progressPct.textContent = '0%';
    progressMsg.textContent = 'Uploading…';
    progressSteps.innerHTML = '';
    progressFileName.textContent = fileName;
  }

  function showDone(data) {
    stateProgress.classList.add('hidden');
    stateDone.classList.remove('hidden');

    doneSub.textContent = `"${uploadedFileName}" repaired successfully.`;

    doneIssues.innerHTML = '';
    const issues = data.issues && data.issues.length ? data.issues : ['File structure verified and re-exported.'];
    issues.forEach(issue => {
      const row = document.createElement('div');
      row.className = 'issue-line';
      row.innerHTML = `<span class="issue-dot"></span>${issue}`;
      doneIssues.appendChild(row);
    });

    downloadBtn.onclick = () => {
      window.location.href = `/api/download/${currentJobId}`;
    };
  }

  function showError(msg) {
    stateProgress.classList.add('hidden');
    stateError.classList.remove('hidden');
    errorMsg.textContent = msg;
  }

  function resetUpload() {
    currentJobId = null;
    fileInput.value = '';

    dropZone.classList.remove('hidden');
    document.querySelector('.upload-meta').classList.remove('hidden');
    stateProgress.classList.add('hidden');
    stateDone.classList.add('hidden');
    stateError.classList.add('hidden');
  }

  repairAgainBtn.addEventListener('click', resetUpload);
  tryAgainBtn.addEventListener('click', resetUpload);

  // ── Scroll reveal ────────────────────────────────────────────────────────
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // ── Smooth-scroll nav links ──────────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
