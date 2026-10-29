// Candexa website + backend (DigitalOcean droplet)
// Serves the static site from ./public and the API under /api.
import express from 'express';
import pg from 'pg';
import Stripe from 'stripe';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = Number(env.PORT || 3000);
const BASE_URL = (env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CALENDLY_URL = env.CALENDLY_URL || 'https://calendly.com/geo-candexa/30min';
const NOTIFY_EMAIL = env.NOTIFY_EMAIL || 'geojax90@gmail.com';
const FROM_EMAIL = env.FROM_EMAIL || 'Candexa <notifications@updates.candexa.ai>';

// Stripe prices (live mode). Annual = 10x monthly ("2 months free").
const PLANS = {
  starter: { name: 'Starter', monthly: 'price_1UQHm9DpwJmP1b4QsAarh1oU', annual: 'price_1UQHtfDpwJmP1b4QQNTqIygR' },
  team:    { name: 'Team',    monthly: 'price_1UQHnWDpwJmP1b4QCdQpKYK2', annual: 'price_1UQHrJDpwJmP1b4Q0EnzNXaa' },
  scale:   { name: 'Scale',   monthly: 'price_1UQHolDpwJmP1b4QeK769iGm', annual: 'price_1UQHpeDpwJmP1b4QnWhag3It' },
};
if (env.PLANS_JSON) Object.assign(PLANS, JSON.parse(env.PLANS_JSON)); // override (e.g. test-mode prices)

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

// ---------- Database ----------
const pool = env.DATABASE_URL
  ? new pg.Pool({
      connectionString: env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''),
      ssl: env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 5,
    })
  : null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS waitlist (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT, company TEXT, role TEXT, source TEXT, extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS demo_requests (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT, company TEXT, role TEXT, team_size TEXT, message TEXT, extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  email TEXT, name TEXT,
  plan TEXT, billing TEXT,
  subscription_id TEXT, subscription_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  stripe_event_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  email TEXT, plan TEXT, billing TEXT,
  amount_cents BIGINT, currency TEXT,
  promo_code TEXT, kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

async function q(text, params) {
  if (!pool) throw new Error('DATABASE_URL not configured');
  return pool.query(text, params);
}

// ---------- Email (Resend) ----------
async function sendEmail({ to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) { console.warn('[email] RESEND_API_KEY missing; skipped:', subject); return; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, reply_to: replyTo }),
  });
  if (!r.ok) console.error('[email] failed', r.status, await r.text());
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const table = (obj) => '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">' +
  Object.entries(obj).filter(([, v]) => v).map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('') + '</table>';

// ---------- Helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined) || null;

const hits = new Map(); // tiny in-memory rate limiter: 10 req / 10 min / IP / route
function rateLimit(req, res, next) {
  const key = (req.ip || '') + req.path;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 600_000);
  if (arr.length >= 10) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  arr.push(now); hits.set(key, arr); next();
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- Stripe webhook (raw body, must be before express.json) ----------
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (e) {
    console.error('[webhook]', event.type, e);
    res.status(500).send('handler error');
  }
});

async function handleStripeEvent(event) {
  const o = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const email = o.customer_details?.email || o.customer_email;
    const plan = o.metadata?.plan, billing = o.metadata?.billing;
    let promo = null;
    try {
      const full = await stripe.checkout.sessions.retrieve(o.id, { expand: ['discounts.promotion_code'] });
      promo = full.discounts?.map((d) => d.promotion_code?.code).filter(Boolean).join(',') || null;
    } catch {}
    await q(`INSERT INTO customers (stripe_customer_id,email,name,plan,billing,subscription_id,subscription_status)
             VALUES ($1,$2,$3,$4,$5,$6,'active')
             ON CONFLICT (stripe_customer_id) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, plan=EXCLUDED.plan,
               billing=EXCLUDED.billing, subscription_id=EXCLUDED.subscription_id, subscription_status='active', updated_at=now()`,
      [o.customer, email, o.customer_details?.name || null, plan, billing, o.subscription]);
    await q(`INSERT INTO payments (stripe_event_id,stripe_customer_id,email,plan,billing,amount_cents,currency,promo_code,kind)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'checkout') ON CONFLICT (stripe_event_id) DO NOTHING`,
      [event.id, o.customer, email, plan, billing, o.amount_total, o.currency, promo]);
    await sendEmail({
      to: NOTIFY_EMAIL, subject: `New Candexa customer: ${PLANS[plan]?.name || plan} (${billing})`,
      html: `<p>A new customer just subscribed.</p>${table({ Email: email, Name: o.customer_details?.name, Plan: plan, Billing: billing,
        Amount: o.amount_total != null ? `${(o.amount_total / 100).toFixed(2)} ${String(o.currency).toUpperCase()}` : '', 'Promo code': promo })}`,
    });
  } else if (event.type === 'invoice.paid' && o.billing_reason !== 'subscription_create') {
    await q(`INSERT INTO payments (stripe_event_id,stripe_customer_id,email,amount_cents,currency,kind)
             VALUES ($1,$2,$3,$4,$5,'renewal') ON CONFLICT (stripe_event_id) DO NOTHING`,
      [event.id, o.customer, o.customer_email, o.amount_paid, o.currency]);
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    await q(`UPDATE customers SET subscription_status=$1, updated_at=now() WHERE stripe_customer_id=$2`, [o.status, o.customer]);
  }
}

app.use(express.json({ limit: '50kb' }));

// ---------- Health ----------
app.get('/api/health', async (_req, res) => {
  const out = { ok: true, db: false, stripe: !!stripe, email: !!env.RESEND_API_KEY };
  try { await q('SELECT 1'); out.db = true; } catch {}
  res.json(out);
});

// ---------- Waitlist ----------
app.post('/api/waitlist', rateLimit, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const email = clean(b.email, 200)?.toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const row = { name: clean(b.name), company: clean(b.company), role: clean(b.role), source: clean(b.source) || 'website' };
  const known = new Set(['email', 'name', 'company', 'role', 'source', 'website']);
  const extra = Object.fromEntries(Object.entries(b).filter(([k, v]) => !known.has(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 300)]));
  try {
    const r = await q(`INSERT INTO waitlist (email,name,company,role,source,extra) VALUES ($1,$2,$3,$4,$5,$6)
                       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, row.name, row.company, row.role, row.source, extra]);
    const isNew = r.rowCount > 0;
    if (isNew) {
      const { rows: [{ count }] } = await q('SELECT count(*)::int AS count FROM waitlist');
      sendEmail({
        to: NOTIFY_EMAIL, replyTo: email, subject: `New waitlist signup: ${row.name || email}`,
        html: `<p>Someone just joined the Candexa waitlist (#${count}).</p>${table({ Email: email, Name: row.name, Company: row.company, Role: row.role, ...extra })}`,
      }).catch((e) => console.error(e));
    }
    res.json({ ok: true, alreadyJoined: !isNew });
  } catch (e) {
    console.error('[waitlist]', e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ---------- Book a demo ----------
app.post('/api/demo', rateLimit, async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true, redirect: CALENDLY_URL });
  const email = clean(b.email, 200)?.toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const row = { name: clean(b.name), company: clean(b.company), role: clean(b.role), team_size: clean(b.team_size || b.size), message: clean(b.message, 2000) };
  const known = new Set(['email', 'name', 'company', 'role', 'team_size', 'size', 'message', 'website']);
  const extra = Object.fromEntries(Object.entries(b).filter(([k, v]) => !known.has(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 300)]));
  try {
    await q(`INSERT INTO demo_requests (email,name,company,role,team_size,message,extra) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [email, row.name, row.company, row.role, row.team_size, row.message, extra]);
    sendEmail({
      to: NOTIFY_EMAIL, replyTo: email, subject: `New demo request: ${row.company || row.name || email}`,
      html: `<p>New demo request. They are being sent to Calendly to pick a time.</p>${table({ Email: email, Name: row.name, Company: row.company, Role: row.role, 'Team size': row.team_size, Message: row.message, ...extra })}`,
    }).catch((e) => console.error(e));
  } catch (e) {
    console.error('[demo]', e); // still send them to Calendly so the lead isn't lost
  }
  const u = new URL(CALENDLY_URL);
  if (row.name) u.searchParams.set('name', row.name);
  u.searchParams.set('email', email);
  res.json({ ok: true, redirect: u.toString() });
});

// ---------- Stripe Checkout ----------
app.post('/api/checkout', rateLimit, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured yet.' });
  const plan = String(req.body?.plan || '').toLowerCase();
  const billing = req.body?.billing === 'annual' ? 'annual' : 'monthly';
  const p = PLANS[plan];
  if (!p) return res.status(400).json({ error: 'Unknown plan.' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: p[billing], quantity: 1 }],
      allow_promotion_codes: true, // coupon / promo code box on the Stripe checkout page
      billing_address_collection: 'auto',
      customer_email: EMAIL_RE.test(req.body?.email || '') ? req.body.email : undefined,
      metadata: { plan, billing },
      subscription_data: { metadata: { plan, billing } },
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing?checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[checkout]', e.message);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});
app.get('/checkout/:plan', async (req, res) => { // plain-link fallback: /checkout/team?billing=annual
  if (!stripe) return res.redirect('/pricing');
  const p = PLANS[req.params.plan];
  if (!p) return res.redirect('/pricing');
  const billing = req.query.billing === 'annual' ? 'annual' : 'monthly';
  try {
    const s = await stripe.checkout.sessions.create({
      mode: 'subscription', line_items: [{ price: p[billing], quantity: 1 }], allow_promotion_codes: true,
      metadata: { plan: req.params.plan, billing }, subscription_data: { metadata: { plan: req.params.plan, billing } },
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${BASE_URL}/pricing?checkout=cancelled`,
    });
    res.redirect(303, s.url);
  } catch (e) { console.error(e.message); res.redirect('/pricing'); }
});

// ---------- Admin (counts + recent records) ----------
function adminAuth(req, res, next) {
  const pass = env.ADMIN_PASSWORD;
  const hdr = req.headers.authorization || '';
  const given = hdr.startsWith('Basic ') ? Buffer.from(hdr.slice(6), 'base64').toString().split(':').slice(1).join(':') : '';
  if (pass && given.length === pass.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pass))) return next();
  res.set('WWW-Authenticate', 'Basic realm="Candexa admin"').status(401).send('Authentication required');
}
app.get('/admin', adminAuth, async (_req, res) => {
  try {
    const [w, d, c, p] = await Promise.all([
      q('SELECT email,name,company,role,created_at FROM waitlist ORDER BY created_at DESC LIMIT 200'),
      q('SELECT email,name,company,role,team_size,created_at FROM demo_requests ORDER BY created_at DESC LIMIT 200'),
      q(`SELECT email,name,plan,billing,subscription_status,created_at FROM customers ORDER BY created_at DESC LIMIT 200`),
      q(`SELECT count(*) FILTER (WHERE subscription_status IN ('active','trialing'))::int AS active, count(*)::int AS total FROM customers`),
    ]);
    const tbl = (rows) => rows.length ? `<table><tr>${Object.keys(rows[0]).map((k) => `<th>${esc(k)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${Object.values(r).map((v) => `<td>${esc(v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : v)}</td>`).join('')}</tr>`).join('')}</table>` : '<p>None yet.</p>';
    res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Candexa admin</title>
<style>body{font:14px system-ui;margin:24px;color:#222}h1{margin:0 0 16px}.k{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}.k div{border:1px solid #ddd;border-radius:10px;padding:12px 18px}.k b{font-size:26px;display:block}table{border-collapse:collapse;width:100%;margin-bottom:28px}td,th{border-bottom:1px solid #eee;padding:6px 8px;text-align:left}th{color:#777;font-weight:500}</style>
<h1>Candexa admin</h1><div class="k"><div><b>${p.rows[0].active}</b>Active paying customers</div><div><b>${p.rows[0].total}</b>Customers (all time)</div><div><b>${w.rowCount}</b>Waitlist</div><div><b>${d.rowCount}</b>Demo requests</div></div>
<h2>Customers</h2>${tbl(c.rows)}<h2>Waitlist</h2>${tbl(w.rows)}<h2>Demo requests</h2>${tbl(d.rows)}`);
  } catch (e) { res.status(500).send('DB error: ' + esc(e.message)); }
});

// ---------- Static site ----------
const pub = path.join(__dirname, 'public');
app.use(express.static(pub, { extensions: ['html'], maxAge: '1h', setHeaders: (res, f) => { if (f.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use((req, res) => {
  const nf = path.join(pub, '404.html');
  res.status(404);
  return fs.existsSync(nf) ? res.sendFile(nf) : res.send('Not found');
});

async function start() {
  if (pool) {
    try { await q(SCHEMA); console.log('DB schema ready'); } catch (e) { console.error('DB init failed:', e.message); }
  }
  app.listen(PORT, '127.0.0.1', () => console.log(`Candexa listening on ${PORT} (${BASE_URL})`));
}
start();
export { app };
