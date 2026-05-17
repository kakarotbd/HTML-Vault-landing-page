/**
 * HTML Vault — Inquiry Worker
 * ════════════════════════════════════════════════
 * Cloudflare Dashboard → Worker → Settings → Variables:
 *
 *   FIREBASE_DB_URL   → https://your-project.firebaseio.com
 *   FIREBASE_SECRET   → your Firebase database secret
 *   ADMIN_PASS        → your admin password (to view inquiries)
 *   ALLOWED_ORIGIN    → https://html-vault-landing-page.vercel.app
 *
 * KV Namespace:
 *   RATE_KV → bind a KV namespace for rate limiting
 *
 * Routes handled:
 *   POST /api/inquiry          → save inquiry to Firebase
 *   GET  /api/inquiries        → list all inquiries (admin only)
 *   GET  /api/inquiry/:id      → get single inquiry (admin only)
 *   DELETE /api/inquiry/:id    → delete inquiry (admin only)
 */

// ── CORS ──────────────────────────────────────────────────────────────────────
function corsHeaders(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '*';
  const allowOrigin = (allowed === '*' || origin === allowed) ? origin || '*' : allowed;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pass',
    'Access-Control-Max-Age': '86400',
  };
}

function ok(data, env, req, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, req) },
  });
}

function err(msg, env, req, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, req) },
  });
}

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
// IP-based: max 5 submissions per hour per IP
async function checkRateLimit(ip, env) {
  if (!env.RATE_KV) return { allowed: true }; // no KV = skip
  const key = `rl:inquiry:${ip}`;
  const raw = await env.RATE_KV.get(key);
  const now = Date.now();
  const window = 3600000; // 1 hour

  let record = raw ? JSON.parse(raw) : { count: 0, resetAt: now + window };

  if (now > record.resetAt) {
    record = { count: 0, resetAt: now + window };
  }

  if (record.count >= 5) {
    const wait = Math.ceil((record.resetAt - now) / 60000);
    return { allowed: false, wait };
  }

  record.count++;
  const ttl = Math.ceil((record.resetAt - now) / 1000);
  await env.RATE_KV.put(key, JSON.stringify(record), { expirationTtl: ttl });
  return { allowed: true };
}

// DDoS: block if > 30 requests/minute from same IP
async function checkDDoS(ip, env) {
  if (!env.RATE_KV) return { allowed: true };
  const key = `ddos:${ip}`;
  const raw = await env.RATE_KV.get(key);
  const now = Date.now();
  const window = 60000; // 1 min

  let record = raw ? JSON.parse(raw) : { count: 0, resetAt: now + window };

  if (now > record.resetAt) {
    record = { count: 0, resetAt: now + window };
  }

  if (record.count >= 30) {
    return { allowed: false };
  }

  record.count++;
  await env.RATE_KV.put(key, JSON.stringify(record), { expirationTtl: 60 });
  return { allowed: true };
}

// ── FIREBASE HELPERS ──────────────────────────────────────────────────────────
function fbUrl(env, path) {
  const base = (env.FIREBASE_DB_URL || '').replace(/\/$/, '');
  const secret = env.FIREBASE_SECRET || '';
  return `${base}${path}.json?auth=${secret}`;
}

async function fbSet(env, path, data) {
  const res = await fetch(fbUrl(env, path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Firebase write failed: ' + res.status);
  return await res.json();
}

async function fbGet(env, path) {
  const res = await fetch(fbUrl(env, path), { method: 'GET' });
  if (!res.ok) throw new Error('Firebase read failed: ' + res.status);
  return await res.json();
}

async function fbDelete(env, path) {
  const res = await fetch(fbUrl(env, path), { method: 'DELETE' });
  if (!res.ok) throw new Error('Firebase delete failed: ' + res.status);
  return true;
}

// ── ID GENERATOR ──────────────────────────────────────────────────────────────
function genId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

// ── ADMIN AUTH ────────────────────────────────────────────────────────────────
function isAdmin(req, env) {
  const pass = req.headers.get('X-Admin-Pass') || '';
  const expected = env.ADMIN_PASS || '';
  return expected.length >= 8 && pass === expected;
}

// ── VALIDATE INQUIRY ──────────────────────────────────────────────────────────
function validateInquiry(body) {
  const errors = [];
  const isContact = body.plan === 'contact-inquiry';
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.push('Name is required (min 2 chars)');
  }
  if (!isContact && (!body.email || !body.email.includes('@'))) {
    errors.push('Valid email is required');
  }
  if (!body.phone || body.phone.trim().length < 5) {
    errors.push('Phone number is required');
  }
  if (!isContact && !body.bestTime) {
    errors.push('Best time to contact is required');
  }
  if (!body.plan) {
    errors.push('Plan is required');
  }
  // Spam: message too long
  if (body.message && body.message.length > 2000) {
    errors.push('Message too long');
  }
  return errors;
}

// ── SANITIZE ──────────────────────────────────────────────────────────────────
function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen).replace(/[<>]/g, '');
}

async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET) return { success: true };
  if (!token) return { success: false, error: 'Cloudflare verification is required' };

  const formData = new FormData();
  formData.append('secret', env.TURNSTILE_SECRET);
  formData.append('response', token);
  if (ip && ip !== 'unknown') formData.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) return { success: false, error: 'Cloudflare verification failed' };

  const data = await res.json();
  return data.success
    ? { success: true }
    : { success: false, error: 'Cloudflare verification failed' };
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // ── OPTIONS (preflight) ──
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    }

    // ── DDoS Check — all routes ──
    const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'unknown';
    const ddos = await checkDDoS(ip, env);
    if (!ddos.allowed) {
      return err('Too many requests. Please slow down.', env, req, 429);
    }

    // ── POST /api/inquiry ── Save new inquiry
    if (method === 'POST' && path === '/api/inquiry') {
      // Rate limit: 5 per hour
      const rl = await checkRateLimit(ip, env);
      if (!rl.allowed) {
        return err(`Too many submissions. Try again in ${rl.wait} minutes.`, env, req, 429);
      }

      let body;
      try {
        body = await req.json();
      } catch {
        return err('Invalid JSON body', env, req, 400);
      }

      if (body.plan !== 'contact-inquiry') {
        const captcha = await verifyTurnstile(body.turnstileToken, ip, env);
        if (!captcha.success) {
          return err(captcha.error, env, req, 403);
        }
      }

      // Validate
      const errors = validateInquiry(body);
      if (errors.length) {
        return err(errors.join('. '), env, req, 422);
      }

      // Sanitize & build record
      const id = genId();
      const record = {
        id,
        plan: sanitize(body.plan, 50),
        name: sanitize(body.name, 100),
        company: sanitize(body.company || '', 150),
        email: sanitize(body.email, 150),
        phone: sanitize(body.phone, 30),
        whatsapp: sanitize(body.whatsapp || '', 30),
        bestTime: sanitize(body.bestTime, 50),
        message: sanitize(body.message || '', 2000),
        ip,
        source: sanitize(body.source || 'landing-page', 50),
        submittedAt: new Date().toISOString(),
        status: 'new', // new | contacted | closed
      };

      try {
        await fbSet(env, `/vault-inquiries/${id}`, record);
      } catch (e) {
        return err('Failed to save inquiry. Please try again.', env, req, 500);
      }

      return ok({ success: true, id, message: 'Inquiry received! We will contact you within 24 hours.' }, env, req, 201);
    }

    // ── GET /api/inquiries ── List all (admin only)
    if (method === 'GET' && path === '/api/inquiries') {
      if (!isAdmin(req, env)) return err('Unauthorized', env, req, 401);

      try {
        const data = await fbGet(env, '/vault-inquiries');
        if (!data) return ok({ inquiries: [], total: 0 }, env, req);

        const list = Object.values(data)
          .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

        return ok({ inquiries: list, total: list.length }, env, req);
      } catch (e) {
        return err('Failed to fetch inquiries', env, req, 500);
      }
    }

    // ── GET /api/inquiry/:id ── Single inquiry (admin only)
    if (method === 'GET' && path.startsWith('/api/inquiry/')) {
      if (!isAdmin(req, env)) return err('Unauthorized', env, req, 401);
      const id = path.split('/').pop();
      if (!id) return err('Missing ID', env, req, 400);

      try {
        const data = await fbGet(env, `/vault-inquiries/${id}`);
        if (!data) return err('Not found', env, req, 404);
        return ok(data, env, req);
      } catch (e) {
        return err('Failed to fetch inquiry', env, req, 500);
      }
    }

    // ── DELETE /api/inquiry/:id ── Delete (admin only)
    if (method === 'DELETE' && path.startsWith('/api/inquiry/')) {
      if (!isAdmin(req, env)) return err('Unauthorized', env, req, 401);
      const id = path.split('/').pop();
      if (!id) return err('Missing ID', env, req, 400);

      try {
        await fbDelete(env, `/vault-inquiries/${id}`);
        return ok({ success: true, deleted: id }, env, req);
      } catch (e) {
        return err('Failed to delete', env, req, 500);
      }
    }

    // ── PATCH /api/inquiry/:id/status ── Update status (admin only)
    if (method === 'PATCH' && path.includes('/status')) {
      if (!isAdmin(req, env)) return err('Unauthorized', env, req, 401);
      const id = path.split('/')[3];
      if (!id) return err('Missing ID', env, req, 400);

      let body;
      try { body = await req.json(); } catch { return err('Invalid JSON', env, req, 400); }

      const allowed = ['new', 'contacted', 'closed'];
      if (!allowed.includes(body.status)) return err('Invalid status', env, req, 400);

      try {
        const existing = await fbGet(env, `/vault-inquiries/${id}`);
        if (!existing) return err('Not found', env, req, 404);
        existing.status = body.status;
        existing.updatedAt = new Date().toISOString();
        await fbSet(env, `/vault-inquiries/${id}`, existing);
        return ok({ success: true, status: body.status }, env, req);
      } catch (e) {
        return err('Failed to update', env, req, 500);
      }
    }

    // ── 404 ──
    return err('Not found', env, req, 404);
  }
};
