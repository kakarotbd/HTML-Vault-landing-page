/* ── LANGUAGE ── */
let lang = 'en';
function setLang(l) {
  lang = l;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.lang-btn[onclick="setLang('${l}')"]`).classList.add('active');
  document.querySelectorAll('[data-en]').forEach(el => {
    const val = el.getAttribute('data-' + l) || el.getAttribute('data-en');
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = val;
    else if (el.tagName === 'OPTION') el.textContent = val;
    else el.textContent = val;
  });
}

/* ── NAV SCROLL ── */
const nav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── NAV ACTIVE ── */
const secs = document.querySelectorAll('section[id]');
const nlinks = document.querySelectorAll('.nav-link');
window.addEventListener('scroll', () => {
  let cur = '';
  secs.forEach(s => { if (window.scrollY >= s.offsetTop - 140) cur = s.id; });
  nlinks.forEach(l => {
    const active = l.getAttribute('href') === `#${cur}`;
    l.style.color = active ? 'var(--tx)' : '';
    l.style.background = active ? 'var(--br2)' : '';
  });
}, { passive: true });

/* ── SCROLL REVEAL ── */
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('v'); io.unobserve(e.target); } });
}, { threshold: 0.07 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ── MOBILE NAV ── */
function toggleMob() {
  const ham = document.getElementById('ham');
  const mob = document.getElementById('mobNav');
  ham.classList.toggle('open');
  mob.classList.toggle('open');
}

/* ── SOFTWARE TYPE DROPDOWN ── */
let swOpen = false;
function toggleSwDropdown() {
  if (!document.getElementById('swOptions') || !document.getElementById('swDisplay')) return;
  swOpen = !swOpen;
  const opts = document.getElementById('swOptions');
  const disp = document.getElementById('swDisplay');
  opts.classList.toggle('open', swOpen);
  disp.classList.toggle('open-state', swOpen);
}
function selectSw(val, icon, name, sub) {
  if (!document.getElementById('f-swtype')) return;
  document.getElementById('f-swtype').value = val;
  document.getElementById('swDispIcon').textContent = icon;
  const dispText = document.getElementById('swDispText');
  dispText.textContent = name;
  dispText.classList.remove('placeholder');
  // mark selected
  document.querySelectorAll('.sw-opt').forEach(o => o.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  swOpen = false;
  document.getElementById('swOptions').classList.remove('open');
  document.getElementById('swDisplay').classList.remove('open-state');
}
document.addEventListener('click', e => {
  const swWrap = document.getElementById('swWrap');
  if (swWrap && !swWrap.contains(e.target) && swOpen) {
    swOpen = false;
    document.getElementById('swOptions').classList.remove('open');
    document.getElementById('swDisplay').classList.remove('open-state');
  }
});

const WORKER_API_BASE = 'https://crimson-fog-0b24.rafin-goku.workers.dev';
const ADMIN_SESSION_KEY = 'elecsy_admin_pass';

function formatSubmissionDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString || '-';
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchAdminInquiries(adminPass) {
  const res = await fetch(`${WORKER_API_BASE}/api/inquiries`, {
    headers: { 'X-Admin-Pass': adminPass },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Admin fetch failed.');
  return data;
}

async function deleteAdminInquiry(id, adminPass) {
  const res = await fetch(`${WORKER_API_BASE}/api/inquiry/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Pass': adminPass },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Delete failed.');
  return data;
}

function getAdminPass() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
}

function setAdminStatus(message, type = '') {
  const el = document.getElementById('adminStatus');
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('error', 'ok');
  if (type) el.classList.add(type);
}

async function renderAdminDashboard() {
  const list = document.getElementById('adminList');
  const count = document.getElementById('adminCount');
  const empty = document.getElementById('adminEmpty');
  if (!list || !count || !empty) return;

  const adminPass = getAdminPass();
  const login = document.getElementById('adminLogin');
  const dashboard = document.getElementById('adminDashboard');
  if (!adminPass) {
    if (login) login.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
    count.textContent = '0';
    return;
  }

  if (login) login.style.display = 'none';
  if (dashboard) dashboard.style.display = 'block';
  list.innerHTML = '';
  empty.style.display = 'none';
  setAdminStatus('Loading secure inbox...');

  let items = [];
  try {
    const data = await fetchAdminInquiries(adminPass);
    items = data.inquiries || [];
    setAdminStatus('');
  } catch (e) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (login) login.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
    setAdminStatus(e.message, 'error');
    return;
  }

  count.textContent = String(items.length);

  if (!items.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = items.map(item => {
    const fields = Object.entries({
      Name: item.name,
      Company: item.company,
      Email: item.email,
      Phone: item.phone,
      WhatsApp: item.whatsapp,
      Plan: item.plan,
      'Best Time': item.bestTime,
      Source: item.source,
      Status: item.status,
      Message: item.message,
    })
      .filter(([, value]) => value !== '' && value != null)
      .map(([key, value]) => `
        <div class="admin-field">
          <div class="admin-field-label">${escapeHtml(key)}</div>
          <div class="admin-field-value">${escapeHtml(value)}</div>
        </div>
      `)
      .join('');

    return `
      <article class="admin-card">
        <div class="admin-card-head">
          <div>
            <div class="admin-source">${escapeHtml(item.source || 'Unknown')}</div>
            <div class="admin-time">${escapeHtml(formatSubmissionDate(item.submittedAt))}</div>
          </div>
          <button class="admin-delete" type="button" onclick="deleteAdminSubmission('${escapeHtml(item.id)}')">Delete</button>
        </div>
        <div class="admin-fields">${fields || '<div class="admin-field-value">No fields saved.</div>'}</div>
      </article>
    `;
  }).join('');
}

async function adminLogin() {
  const input = document.getElementById('adminPass');
  const pass = input ? input.value.trim() : '';
  if (!pass) {
    setAdminStatus('Enter admin password.', 'error');
    return;
  }
  sessionStorage.setItem(ADMIN_SESSION_KEY, pass);
  await renderAdminDashboard();
}

function adminLogout() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  renderAdminDashboard();
}

async function deleteAdminSubmission(id) {
  const adminPass = getAdminPass();
  if (!id || !adminPass) return;
  setAdminStatus('Deleting...');
  try {
    await deleteAdminInquiry(id, adminPass);
    await renderAdminDashboard();
  } catch (e) {
    setAdminStatus(e.message, 'error');
  }
}

async function postInquiry(payload) {
  const res = await fetch(`${WORKER_API_BASE}/api/inquiry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Submit failed. Please try again.');
  return data;
}

function getTurnstileToken(scope = document) {
  const tokenInput = scope.querySelector('input[name="cf-turnstile-response"]');
  return tokenInput ? tokenInput.value : '';
}

function setStatus(id, message, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('error', 'ok');
  if (type) el.classList.add(type);
}

function playIntroOnce() {
  const audio = document.getElementById('introAudio');
  if (!audio || audio.dataset.played === 'true') return;
  audio.dataset.played = 'true';
  audio.currentTime = 0;
  audio.play().catch(() => {
    audio.dataset.played = 'false';
    const playAfterGesture = () => {
      if (audio.dataset.played === 'true') return;
      audio.dataset.played = 'true';
      audio.currentTime = 0;
      audio.play().catch(() => {});
      window.removeEventListener('pointerdown', playAfterGesture);
      window.removeEventListener('keydown', playAfterGesture);
    };
    window.addEventListener('pointerdown', playAfterGesture, { once: true });
    window.addEventListener('keydown', playAfterGesture, { once: true });
  });
}

if (document.getElementById('introAudio')) {
  window.addEventListener('load', playIntroOnce, { once: true });
}

/* ── FORM SUBMIT ── */
const protectIntro = document.getElementById('protectIntro');
if (protectIntro) {
  const syncProtectIntro = () => {
    document.body.classList.toggle('intro-revealed', window.scrollY > 90);
  };
  syncProtectIntro();
  window.addEventListener('scroll', syncProtectIntro, { passive: true });
}

async function submitForm() {
  const name = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const swtype = document.getElementById('f-swtype').value;
  if (!name) { shake('f-name'); return; }
  if (!phone) { shake('f-phone'); return; }
  if (!swtype) { shake('swDisplay'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-circle-notch spin"></i> <span>Sending...</span>`;

  try {
    await postInquiry({
      plan: 'contact-inquiry',
      name,
      company: document.getElementById('f-biz')?.value.trim() || '',
      email: '',
      phone,
      whatsapp: phone,
      bestTime: 'not-specified',
      message: [
        `Software Type: ${swtype}`,
        `Budget: ${document.getElementById('f-budget')?.value || 'not-specified'}`,
        document.getElementById('f-msg')?.value.trim() || '',
      ].filter(Boolean).join('\n'),
      source: 'contact',
    });
    document.getElementById('formContent').style.display = 'none';
    const succ = document.getElementById('formSuccess');
    succ.classList.add('show');
    succ.style.display = 'block';
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<span>Send My Inquiry -></span>';
    alert(e.message);
  }
}

function shake(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'none';
  el.style.borderColor = '#ef4444';
  el.style.boxShadow = '0 0 0 3px rgba(239,68,68,.2)';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }, 1800);
  el.focus?.();
}

/* PROTECT PAGE QUIZ */
function nextProtectQuiz() {
  const selected = document.querySelector('input[name="electronQuiz"]:checked');
  const msg = document.getElementById('quizMsg');
  if (!selected) {
    msg.textContent = 'Please select Yes or No first.';
    return;
  }
  if (selected.value === 'no') {
    msg.textContent = 'Sorry, this system only works for Electron software made with HTML, CSS, and JavaScript.';
    return;
  }
  msg.textContent = '';
  document.getElementById('quizStep').style.display = 'none';
  document.getElementById('requestStep').style.display = 'block';
}

async function submitProtectRequest() {
  const name = document.getElementById('protectName');
  const email = document.getElementById('protectEmail');
  const software = document.getElementById('protectSoftwareName');
  const company = document.getElementById('protectCompanyName');
  const phone = document.getElementById('protectPhone');
  const bestTime = document.getElementById('protectBestTime');
  const message = document.getElementById('protectMessage');
  if (!name.value.trim()) { shake('protectName'); return; }
  if (!email.value.trim() || !email.value.includes('@')) { shake('protectEmail'); return; }
  if (!software.value.trim()) { shake('protectSoftwareName'); return; }
  if (!phone.value.trim()) { shake('protectPhone'); return; }
  if (!bestTime.value) { shake('protectBestTime'); return; }

  const formScope = document.getElementById('requestStep');
  const turnstileToken = getTurnstileToken(formScope);
  if (!turnstileToken) {
    setStatus('protectFormStatus', 'Please complete the Cloudflare verification first.', 'error');
    return;
  }

  const btn = document.getElementById('protectSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch spin"></i><span>Submitting...</span>';
  setStatus('protectFormStatus', 'Sending securely to ELECSY Worker...');

  try {
    await postInquiry({
      plan: 'electron-drm',
      name: name.value.trim(),
      company: company.value.trim() || software.value.trim(),
      email: email.value.trim(),
      phone: phone.value.trim(),
      whatsapp: phone.value.trim(),
      bestTime: bestTime.value,
      message: `Software: ${software.value.trim()}\n${message.value.trim()}`,
      source: 'protect-app',
      turnstileToken,
    });
    document.getElementById('requestStep').style.display = 'none';
    const success = document.getElementById('protectSuccess');
    success.style.display = 'block';
    success.classList.add('show');
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<span>Submit Request</span>';
    setStatus('protectFormStatus', e.message, 'error');
    if (window.turnstile) window.turnstile.reset();
  }
}

/* ── SCROLL HELPER ── */
function scrollTo(hash) {
  const el = document.querySelector(hash);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ── COUNTER ANIMATION ── */
function animateCounter(el, target, suffix = '') {
  let start = 0;
  const dur = 1800;
  const step = target / (dur / 16);
  const timer = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = Math.floor(start) + suffix;
    if (start >= target) clearInterval(timer);
  }, 16);
}

// Observe stats bar
const statsBar = document.querySelector('.stats-bar');
if (statsBar) {
  const statsOb = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      statsOb.disconnect();
    }
  }, { threshold: 0.5 });
  statsOb.observe(statsBar);
}

if (document.getElementById('adminList')) {
  renderAdminDashboard();
}
