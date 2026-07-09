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

  const payload = JSON.stringify({ title: req.body.title || "Gimna", body: req.body.body || "" });
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

// -----------------------------------------------------------------
// Lembretes diários — aniversários de hoje, treinos/eventos de amanhã,
// e avaliações de fim de mesociclo em falta. Pensado para ser chamado
// uma vez por dia por um serviço de cron externo gratuito (ver
// docs/ARQUITETURA.md) — que também serve de "keep-alive" em hosts
// gratuitos que adormecem por inatividade.
// -----------------------------------------------------------------
router.post("/turmas/:id/lembretes-diarios", requireAuth, requireMembership(["manager"]), async (req, res) => {
  const turmaId = req.params.id;
  const hoje = new Date().toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const atletas = db.prepare("SELECT * FROM atletas WHERE turmaId = ? AND ativo = 1").all(turmaId);
  const aniversariantes = atletas.filter((a) => a.dataNascimento && a.dataNascimento.slice(5) === hoje.slice(5));

  const sessoesAmanha = db.prepare("SELECT * FROM sessoes WHERE turmaId = ? AND data = ? AND (tipo IS NOT NULL OR categoria != 'treino')").all(turmaId, amanha);

  const mesociclos = db.prepare("SELECT * FROM mesociclos WHERE turmaId = ? AND dataFim < ?").all(turmaId, hoje);
  const avaliacoes = db.prepare("SELECT * FROM avaliacoes WHERE turmaId = ? AND tipo = 'mesociclo'").all(turmaId);
  const avaliadosPorMeso = {};
  avaliacoes.forEach((av) => { (avaliadosPorMeso[av.mesocicloId] = avaliadosPorMeso[av.mesocicloId] || new Set()).add(av.atletaId); });
  const mesociclosPendentes = mesociclos.filter((m) => (avaliadosPorMeso[m.id] || new Set()).size < atletas.length);

  const partes = [];
  if (aniversariantes.length) partes.push(aniversariantes.length + " aniversário(s) hoje: " + aniversariantes.map((a) => a.nome).join(", "));
  if (sessoesAmanha.length) partes.push(sessoesAmanha.length + " treino(s)/evento(s) amanhã");
  if (mesociclosPendentes.length) partes.push(mesociclosPendentes.length + " mesociclo(s) com avaliações em falta");

  if (!partes.length) return res.json({ ok: true, enviados: 0, motivo: "sem novidades hoje" });

  const staffMembers = db.prepare("SELECT userId FROM memberships WHERE turmaId=? AND role IN ('manager','ajudante') AND estado='ativo'").all(turmaId);
  const userIds = staffMembers.map((m) => m.userId);
  let enviados = 0;
  if (VAPID_PUBLIC && userIds.length) {
    const placeholders = userIds.map(() => "?").join(",");
    const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE turmaId = ? AND userId IN (${placeholders})`).all(turmaId, ...userIds);
    const payload = JSON.stringify({ title: "Gimna — lembretes de hoje", body: partes.join(" · ") });
    for (const s of subs) {
      try { await webpush.sendNotification(JSON.parse(s.subscription), payload); enviados++; }
      catch (e) { if (e.statusCode === 410 || e.statusCode === 404) db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(s.id); }
    }
  }
  res.json({ ok: true, enviados, resumo: partes });
});

module.exports = router;
