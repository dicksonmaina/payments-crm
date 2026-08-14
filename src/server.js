import express from "express";
import Stripe from "stripe";
import { Resend } from "resend";
import Database from "better-sqlite3";
import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-06-30"
});
const resend = new Resend(process.env.RESEND_API_KEY);

const db = new Database("data/store.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    source TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    customer_id INTEGER,
    amount INTEGER,
    currency TEXT DEFAULT 'usd',
    status TEXT DEFAULT 'pending',
    stripe_session_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers (id)
  );
`);

const emailQueue = new Queue("emails", {
  connection: { host: "127.0.0.1", port: 6379 }
});

app.use(express.json());
app.use(express.static("public"));

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/customers", (req, res) => {
  const rows = db.prepare("SELECT * FROM customers ORDER BY created_at DESC").all();
  res.json(rows);
});

app.post("/customers", (req, res) => {
  const { name, email, phone, source, notes } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  const info = db
    .prepare("INSERT INTO customers (name, email, phone, source, notes) VALUES (?, ?, ?, ?, ?)")
    .run(name, email, phone, source, notes);
  res.status(201).json({ id: info.lastInsertRowid, email });
});

app.post("/invoices", async (req, res) => {
  const { customer_email, amount_cents, description } = req.body || {};
  if (!customer_email || !amount_cents) {
    return res.status(400).json({ error: "customer_email and amount_cents required" });
  }

  const customer = db.prepare("SELECT * FROM customers WHERE email = ?").get(customer_email);
  if (!customer) {
    return res.status(404).json({ error: "customer not found" });
  }

  const invoiceId = `inv_${Date.now()}_${uuidv4().split("-")[0]}`;
  db.prepare("INSERT INTO invoices (id, customer_id, amount) VALUES (?, ?, ?)").run(
    invoiceId,
    customer.id,
    amount_cents
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/cancel`,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: description || "Invoice" },
          unit_amount: Number(amount_cents)
        },
        quantity: 1
      }
    ]
  });

  db.prepare("UPDATE invoices SET stripe_session_id = ? WHERE id = ?").run(session.id, invoiceId);

  await emailQueue.add("invoice-created", {
    to: customer_email,
    subject: "Your invoice is ready",
    html: `<p>Pay your invoice here: <a href="${session.url}">${session.url}</a></p>`
  });

  res.status(201).json({ invoiceId, checkoutUrl: session.url });
});

app.get("/success", async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.redirect("/");
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const invoice = db.prepare("SELECT * FROM invoices WHERE stripe_session_id = ?").get(sessionId);
  if (invoice) {
    db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run("paid", invoice.id);
  }
  res.send("<h1>Payment successful</h1><p>Receipt sent by email.</p>");
});

app.get("/cancel", (req, res) => res.send("<h1>Payment cancelled</h1>"));

app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    emailQueue.add("payment-receipt", {
      to: session.customer_details?.email,
      subject: "Payment received",
      html: "<p>Thanks for your payment.</p>"
    });
  }

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`payments-crm running on http://localhost:${port}`);
});
