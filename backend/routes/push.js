const express = require("express");
const webpush = require("web-push");
const db = require("../db");
const { uuid, nowIso } = require("../util");
const { requireAuth, requireMembership } = require("../middleware/auth");

const router = express.Router();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:suporte@example.com", VAPID_PUBLIC, VAPID_PRIVATE);
}

router.get("/vapid-public-key", (req, res) => {
  if (!VAPID_PUBLIC) return res.status(500).json({ error: "VAPID não configurado no servidor (ver .env.example)." });
  res.json({ publicKey: VAPID_PUBLIC });
});

router.post("/subscribe", requireAuth, requireMembership(), (req, res) => {
  const id = uuid();
  db.prepare("INSERT INTO push_subscriptions (id, userId, turmaId, subscription, criadoEm) VALUES (?,?,?,?,?)")
    .run(id, req.userId, req.membership.turmaId, JSON.stringify(req.body.subscription), nowIso());
  res.json({ ok: true });
});

router.post("/broadcast", requireAuth, requireMembership(["manager"]), async (req, res) => {
  if (!VAPID_PUBLIC) return res.status(500).json({ error: "VAPID não configurado no servidor." });
  const atletaMembers = db.prepare("SELECT userId FROM memberships WHERE turmaId=? AND role='atleta' AND estado='ativo'").all(req.membership.turmaId);
  const userIds = atletaMembers.map((m) => m.userId);
  if (!userIds.length) return res.json({ ok: true, enviados: 0 });
  const placeholders = userIds.map(() => "?").join(",");
  const subs = db.prepare("SELECT * FROM push_subscriptions WHERE turmaId = ? AND userId IN (" + placeholders + ")").all(req.membership.turmaId, ...userIds);

  const payload = JSON.stringify({ title: req.body.title || "AnimaKids", body: req.body.body || "" });
  let enviados = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.subscription), payload);
      enviados++;
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
      }
    }
  }
  res.json({ ok: true, enviados, total: subs.length });
});

module.exports = router;
