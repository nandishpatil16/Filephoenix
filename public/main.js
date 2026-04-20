(function () {
  'use strict';

  // ── DOM ──────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // Nav
  const navAuth    = $('navAuth'),    navUser     = $('navUser');
  const navName    = $('navName'),    navAvatar   = $('navAvatar');
  const navLoginBtn= $('navLoginBtn'),navSignupBtn= $('navSignupBtn');
  const navLogoutBtn=$('navLogoutBtn');
  const hamburger  = $('hamburger'),  mobNav      = $('mobNav');
  const mobClose   = $('mobClose');
  const mobAuthLinks=$('mobAuthLinks'),mobUserLinks=$('mobUserLinks');
  const mobLoginBtn= $('mobLoginBtn'),mobSignupBtn= $('mobSignupBtn');
  const mobLogoutBtn=$('mobLogoutBtn'),mobWelcome =$('mobWelcome');

  // Auth modal
  const authModal  = $('authModal'),  modalClose  = $('modalClose');
  const tabLogin   = $('tabLogin'),   tabSignup   = $('tabSignup');
  const loginForm  = $('loginForm'),  signupForm  = $('signupForm');
  const loginEmail = $('loginEmail'), loginPassword=$('loginPassword');
  const loginError = $('loginError');
  const signupName = $('signupName'), signupEmail  = $('signupEmail');
  const signupPassword=$('signupPassword'), signupError=$('signupError');

  // Regular upload
  const dropZone   = $('dropZone'),   fileInput   = $('fileInput');
  const browseBtn  = $('browseBtn');
  const stateDefault=$('stateDefault'),stateProgress=$('stateProgress');
  const stateDone  = $('stateDone'),  stateError  = $('stateError');
  const progBar    = $('progBar'),    progMsg     = $('progMsg');
  const progPct    = $('progPct'),    progSteps   = $('progSteps');
  const progressName=$('progressName');
  const doneSub    = $('doneSub'),    doneIssues  = $('doneIssues');
  const downloadBtn= $('downloadBtn'),againBtn    = $('againBtn');
  const errMsg     = $('errMsg'),     retryBtn    = $('retryBtn');

  // Video upload
  const videoGate  = $('videoGate'),  videoUpload = $('videoUpload');
  const videoProgress=$('videoProgress'),videoDone=$('videoDone');
  const videoError = $('videoError');
  const videoDropZone=$('videoDropZone'),videoInput=$('videoInput');
  const videoBrowseBtn=$('videoBrowseBtn');
  const videoProgBar=$('videoProgBar'),videoProgMsg=$('videoProgMsg');
  const videoProgPct=$('videoProgPct'),videoProgSteps=$('videoProgSteps');
  const videoProgName=$('videoProgName');
  const videoDoneIssues=$('videoDoneIssues');
  const videoDownloadBtn=$('videoDownloadBtn'),videoAgainBtn=$('videoAgainBtn');
  const videoErrMsg=$('videoErrMsg'),videoRetryBtn=$('videoRetryBtn');
  const videoSignupBtn=$('videoSignupBtn'),videoLoginBtn=$('videoLoginBtn');

  // Stats
  const statRepairs=$('statRepairs'),statUsers=$('statUsers');
  const statToday =$('statToday'), statRate =$('statRate');

  // ── State ────────────────────────────────────────────────────────────────
  let currentUser = null;
  let regularJobId = null;
  let videoJobId   = null;

  // ── Auth helpers ─────────────────────────────────────────────────────────
  function getToken() { return localStorage.getItem('fp_token'); }
  function setToken(t) { localStorage.setItem('fp_token', t); }
  function clearToken() { localStorage.removeItem('fp_token'); }

  function setUser(user) {
    currentUser = user;
    // Nav
    navAuth.classList.add('hidden');
    navUser.classList.remove('hidden');
    navName.textContent   = user.name || user.email;
    navAvatar.textContent = (user.name || user.email)[0].toUpperCase();
    // Mobile nav
    mobAuthLinks.classList.add('hidden');
    mobUserLinks.classList.remove('hidden');
    mobWelcome.textContent = 'Hello, ' + (user.name || user.email) + '!';
    // Show video upload
    videoGate.classList.add('hidden');
    videoUpload.classList.remove('hidden');
  }

  function clearUser() {
    currentUser = null;
    clearToken();
    navAuth.classList.remove('hidden');
    navUser.classList.add('hidden');
    mobAuthLinks.classList.remove('hidden');
    mobUserLinks.classList.add('hidden');
    videoUpload.classList.add('hidden');
    videoGate.classList.remove('hidden');
  }

  async function checkSession() {
    const token = getToken();
    if (!token) return;
    try {
      const res  = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) setUser(await res.json());
      else        clearUser();
    } catch (_) {}
  }

  // ── Auth modal ────────────────────────────────────────────────────────────
  function openModal(tab) {
    authModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    switchTab(tab || 'login');
  }
  function closeModal() {
    authModal.classList.add('hidden');
    document.body.style.overflow = '';
    loginError.classList.add('hidden');
    signupError.classList.add('hidden');
  }

  function switchTab(which) {
    if (which === 'login') {
      tabLogin.classList.add('active'); tabSignup.classList.remove('active');
      loginForm.classList.remove('hidden'); signupForm.classList.add('hidden');
    } else {
      tabSignup.classList.add('active'); tabLogin.classList.remove('active');
      signupForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    }
  }

  modalClose.onclick  = closeModal;
  authModal.onclick   = e => { if (e.target === authModal) closeModal(); };
  tabLogin.onclick    = () => switchTab('login');
  tabSignup.onclick   = () => switchTab('signup');
  navLoginBtn.onclick = navLoginBtn.onclick = e => { e.preventDefault(); openModal('login'); };
  navSignupBtn.onclick = e => { e.preventDefault(); openModal('signup'); };
  mobLoginBtn.onclick  = e => { e.preventDefault(); mobNav.classList.remove('open'); openModal('login'); };
  mobSignupBtn.onclick = e => { e.preventDefault(); mobNav.classList.remove('open'); openModal('signup'); };
  videoSignupBtn.onclick = e => { e.preventDefault(); openModal('signup'); };
  videoLoginBtn.onclick  = e => { e.preventDefault(); openModal('login'); };
  navLogoutBtn.onclick   = () => { clearUser(); };
  mobLogoutBtn.onclick   = e => { e.preventDefault(); clearUser(); mobNav.classList.remove('open'); };

  // Login submit
  loginForm.onsubmit = async e => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const btn = loginForm.querySelector('button[type=submit]');
    btn.textContent = 'Logging in...'; btn.disabled = true;
    try {
      const res  = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }) });
      const data = await res.json();
      if (!res.ok) { loginError.textContent = data.error; loginError.classList.remove('hidden'); }
      else { setToken(data.token); setUser(data.user); closeModal(); }
    } catch (_) { loginError.textContent = 'Connection error. Try again.'; loginError.classList.remove('hidden'); }
    btn.textContent = 'Log in'; btn.disabled = false;
  };

  // Signup submit
  signupForm.onsubmit = async e => {
    e.preventDefault();
    signupError.classList.add('hidden');
    const btn = signupForm.querySelector('button[type=submit]');
    btn.textContent = 'Creating account...'; btn.disabled = true;
    try {
      const res  = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: signupName.value, email: signupEmail.value, password: signupPassword.value }) });
      const data = await res.json();
      if (!res.ok) { signupError.textContent = data.error; signupError.classList.remove('hidden'); }
      else { setToken(data.token); setUser(data.user); closeModal(); }
    } catch (_) { signupError.textContent = 'Connection error. Try again.'; signupError.classList.remove('hidden'); }
    btn.textContent = 'Create free account'; btn.disabled = false;
  };

  // ── Mobile nav ────────────────────────────────────────────────────────────
  hamburger.onclick = () => mobNav.classList.add('open');
  mobClose.onclick  = () => mobNav.classList.remove('open');
  document.querySelectorAll('.mob-link[href^="#"]').forEach(a => {
    a.addEventListener('click', () => mobNav.classList.remove('open'));
  });

  // ── Repair steps messages ─────────────────────────────────────────────────
  const STEPS = [
    { at: 15, msg: 'Uploading file...'             },
    { at: 30, msg: 'Reading binary structure...'   },
    { at: 45, msg: 'Detecting corruption...'       },
    { at: 62, msg: 'Rebuilding file structure...'  },
    { at: 80, msg: 'Verifying integrity...'        },
    { at: 95, msg: 'Finalising repaired file...'   },
  ];

  const VIDEO_STEPS = [
    { at: 15, msg: 'Uploading video...'            },
    { at: 30, msg: 'Analysing container format...' },
    { at: 50, msg: 'Scanning streams...'           },
    { at: 68, msg: 'Rebuilding container...'       },
    { at: 85, msg: 'Re-encoding if needed...'      },
    { at: 96, msg: 'Optimising for playback...'    },
  ];

  // ── Generic progress animator ─────────────────────────────────────────────
  function makeAnimator(barEl, msgEl, pctEl, stepsEl, stepDefs) {
    let iv, pct = 0, idx = 0;
    function start() {
      pct = 0; idx = 0; stepsEl.innerHTML = '';
      iv = setInterval(() => {
        const target = idx < stepDefs.length ? stepDefs[idx].at : 97;
        pct += (target - pct) * 0.1 + 0.3;
        if (pct >= target && idx < stepDefs.length) {
          addStep(stepsEl, stepDefs[idx].msg);
          msgEl.textContent = stepDefs[idx].msg;
          idx++;
        }
        const v = Math.min(pct, 97);
        barEl.style.width = v + '%';
        pctEl.textContent = Math.round(v) + '%';
        if (pct >= 97) clearInterval(iv);
      }, 200);
    }
    function finish() {
      clearInterval(iv);
      barEl.style.width = '100%';
      pctEl.textContent = '100%';
      msgEl.textContent = 'Complete';
    }
    function stop() { clearInterval(iv); }
    return { start, finish, stop };
  }

  function addStep(container, text) {
    const el = document.createElement('div');
    el.className = 'prog-step';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function setIssues(container, issues) {
    container.innerHTML = '';
    (issues && issues.length ? issues : ['File structure verified and re-exported']).forEach(iss => {
      const row = document.createElement('div');
      row.className = 'issue-row';
      row.innerHTML = `<span class="issue-dot"></span>${iss}`;
      container.appendChild(row);
    });
  }

  // ── Regular upload ────────────────────────────────────────────────────────
  const regAnim = makeAnimator(progBar, progMsg, progPct, progSteps, STEPS);

  function showReg(which) {
    [stateDefault, stateProgress, stateDone, stateError].forEach(el => {
      if (el) el.classList.add('hidden');
    });
    if (which) $(which).classList.remove('hidden');
  }

  browseBtn.onclick = () => fileInput.click();
  fileInput.onchange = e => { if (e.target.files[0]) startRegular(e.target.files[0]); };
  dropZone.ondragover  = e => { e.preventDefault(); dropZone.classList.add('over'); };
  dropZone.ondragleave = ()  => dropZone.classList.remove('over');
  dropZone.ondrop = e => { e.preventDefault(); dropZone.classList.remove('over'); if (e.dataTransfer.files[0]) startRegular(e.dataTransfer.files[0]); };
  dropZone.onclick = e => { if (e.target !== browseBtn) fileInput.click(); };

  async function startRegular(file) {
    progressName.textContent = file.name;
    showReg('stateProgress');
    regAnim.start();

    const fd = new FormData();
    fd.append('file', file);

    let jobId;
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        regAnim.stop();
        if (data.error === 'VIDEO_AUTH_REQUIRED') {
          showReg('stateDefault');
          document.getElementById('video-repair').scrollIntoView({ behavior: 'smooth' });
          return;
        }
        showReg('stateError');
        errMsg.textContent = data.error || 'Upload failed.';
        return;
      }
      jobId = data.jobId;
      regularJobId = jobId;
    } catch (_) {
      regAnim.stop(); showReg('stateError');
      errMsg.textContent = 'Upload failed. Check your connection.';
      return;
    }

    const poll = setInterval(async () => {
      try {
        const s = await (await fetch('/api/status/' + jobId)).json();
        if (s.status === 'done') {
          clearInterval(poll); regAnim.finish();
          setTimeout(() => {
            showReg('stateDone');
            doneSub.textContent = `"${file.name}" repaired successfully.`;
            setIssues(doneIssues, s.issues);
            downloadBtn.onclick = () => { window.location.href = '/api/download/' + jobId; };
          }, 400);
        } else if (s.status === 'error') {
          clearInterval(poll); regAnim.stop();
          showReg('stateError');
          errMsg.textContent = s.error || 'Repair failed.';
        }
      } catch (_) { clearInterval(poll); }
    }, 1200);
  }

  againBtn.onclick = () => { fileInput.value = ''; showReg('stateDefault'); };
  retryBtn.onclick = () => { fileInput.value = ''; showReg('stateDefault'); };

  // ── Video upload ──────────────────────────────────────────────────────────
  const vidAnim = makeAnimator(videoProgBar, videoProgMsg, videoProgPct, videoProgSteps, VIDEO_STEPS);

  function showVid(which) {
    [videoGate, videoUpload, videoProgress, videoDone, videoError].forEach(el => {
      if (el) el.classList.add('hidden');
    });
    if (which) $(which).classList.remove('hidden');
  }

  function resetVideoUI() {
    if (currentUser) showVid('videoUpload');
    else             showVid('videoGate');
  }

  videoBrowseBtn.onclick = () => videoInput.click();
  videoInput.onchange = e => { if (e.target.files[0]) startVideo(e.target.files[0]); };
  videoDropZone.ondragover  = e => { e.preventDefault(); videoDropZone.classList.add('over'); };
  videoDropZone.ondragleave = ()  => videoDropZone.classList.remove('over');
  videoDropZone.ondrop = e => { e.preventDefault(); videoDropZone.classList.remove('over'); if (e.dataTransfer.files[0]) startVideo(e.dataTransfer.files[0]); };
  videoDropZone.onclick = e => { if (e.target !== videoBrowseBtn) videoInput.click(); };

  async function startVideo(file) {
    if (!currentUser) { openModal('signup'); return; }
    videoProgName.textContent = file.name;
    showVid('videoProgress');
    vidAnim.start();

    const fd = new FormData();
    fd.append('file', file);

    let jobId;
    try {
      const res  = await fetch('/api/upload/video', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd });
      const data = await res.json();
      if (!res.ok) {
        vidAnim.stop();
        if (res.status === 401) { resetVideoUI(); openModal('login'); return; }
        showVid('videoError');
        videoErrMsg.textContent = data.error || 'Upload failed.';
        return;
      }
      jobId = data.jobId;
      videoJobId = jobId;
    } catch (_) {
      vidAnim.stop(); showVid('videoError');
      videoErrMsg.textContent = 'Upload failed. Check your connection.';
      return;
    }

    const poll = setInterval(async () => {
      try {
        const s = await (await fetch('/api/status/' + jobId)).json();
        if (s.status === 'done') {
          clearInterval(poll); vidAnim.finish();
          setTimeout(() => {
            showVid('videoDone');
            setIssues(videoDoneIssues, s.issues);
            videoDownloadBtn.onclick = () => { window.location.href = '/api/download/' + jobId; };
          }, 400);
        } else if (s.status === 'error') {
          clearInterval(poll); vidAnim.stop();
          showVid('videoError');
          videoErrMsg.textContent = s.error || 'Video repair failed.';
        }
      } catch (_) { clearInterval(poll); }
    }, 1500);
  }

  videoAgainBtn.onclick  = () => { videoInput.value = ''; showVid('videoUpload'); };
  videoRetryBtn.onclick  = () => { videoInput.value = ''; resetVideoUI(); };

  // ── Stats ─────────────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const data = await (await fetch('/api/stats')).json();
      if (statRepairs) statRepairs.textContent = data.totalRepairs.toLocaleString();
      if (statUsers)   statUsers.textContent   = data.totalUsers.toLocaleString();
      if (statToday)   statToday.textContent   = data.todayRepairs.toLocaleString();
      if (statRate)    statRate.textContent     = data.successRate + '%';
    } catch (_) {}
  }

  // ── Scroll reveal ─────────────────────────────────────────────────────────
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

  // ── Smooth scroll for anchor links ────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  checkSession();
  loadStats();

})();
