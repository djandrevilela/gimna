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

  // cada parte fica marcada com a categoria de notificação a que pertence,
  // para depois se poder filtrar por preferência de cada pessoa
  const partes = [];
  if (aniversariantes.length) partes.push({ categoria: "aniversarios", texto: aniversariantes.length + " aniversário(s) hoje: " + aniversariantes.map((a) => a.nome).join(", ") });
  if (sessoesAmanha.length) partes.push({ categoria: "treinos", texto: sessoesAmanha.length + " treino(s)/evento(s) amanhã" });
  if (mesociclosPendentes.length) partes.push({ categoria: "avaliacoes", texto: mesociclosPendentes.length + " mesociclo(s) com avaliações em falta" });

  if (!partes.length) return res.json({ ok: true, enviados: 0, motivo: "sem novidades hoje" });

  const enviados = await enviarPushPersonalizado(turmaId, ["manager", "ajudante"], partes, "Gimna — lembretes de hoje");
  res.json({ ok: true, enviados, resumo: partes.map((p) => p.texto) });
});

// Resumo periódico (semanal/mensal) — para encarregados de educação E
// equipa técnica. A periodicidade fica configurada por turma
// (turmas.resumoPeriodicidade: 'off'|'semanal'|'mensal') e este endpoint
// só faz o envio se for chamado no dia certo E a turma tiver essa opção
// ativa — pensado para ser chamado diariamente pelo mesmo cron externo
// que trata dos lembretes diários (ver docs/ARQUITETURA.md).
router.post("/turmas/:id/resumo-periodico", requireAuth, requireMembership(["manager"]), async (req, res) => {
  const turmaId = req.params.id;
  const turma = db.prepare("SELECT * FROM turmas WHERE id = ?").get(turmaId);
  const periodicidade = turma.resumoPeriodicidade || "off";
  if (periodicidade === "off") return res.json({ ok: true, enviados: 0, motivo: "resumo periódico desligado nesta turma" });

  const hojeDate = new Date();
  const ehDiaDeEnviar = periodicidade === "semanal" ? hojeDate.getDay() === 1 /* segunda-feira */ : hojeDate.getDate() === 1 /* dia 1 do mês */;
  if (!req.body.forcar && !ehDiaDeEnviar) return res.json({ ok: true, enviados: 0, motivo: "não é o dia de envio (" + periodicidade + ")" });

  const desde = new Date(hojeDate.getTime() - (periodicidade === "semanal" ? 7 : 30) * 86400000).toISOString().slice(0, 10);
  const hoje = hojeDate.toISOString().slice(0, 10);

  const presencas = db.prepare("SELECT p.* FROM presencas p JOIN sessoes s ON s.id=p.sessaoId WHERE s.turmaId=? AND s.data BETWEEN ? AND ?").all(turmaId, desde, hoje);
  const total = presencas.length;
  const presentes = presencas.filter((p) => p.estado === "presente").length;
  const pct = total ? Math.round((presentes / total) * 100) : null;
  const proximasSessoes = db.prepare("SELECT * FROM sessoes WHERE turmaId=? AND data > ? AND (tipo IS NOT NULL OR categoria != 'treino') ORDER BY data LIMIT 5").all(turmaId, hoje);
  const avaliacoesRecentes = db.prepare("SELECT * FROM avaliacoes WHERE turmaId=? AND data BETWEEN ? AND ?").all(turmaId, desde, hoje);

  const partes = [{
    categoria: "resumo",
    texto: (pct !== null ? "Presença média: " + pct + "%. " : "") + proximasSessoes.length + " sessão(ões) agendada(s) a seguir. " + avaliacoesRecentes.length + " avaliação(ões) feita(s) neste período.",
  }];

  const enviados = await enviarPushPersonalizado(turmaId, ["manager", "ajudante", "atleta"], partes, "Gimna — resumo " + (periodicidade === "semanal" ? "semanal" : "mensal"));
  res.json({ ok: true, enviados, resumo: partes.map((p) => p.texto) });
});

// Envia push a cada subscritor da turma (filtrado por papel), respeitando
// as preferências de notificação de cada pessoa (preferencias.notifPrefs).
// Se a pessoa não tiver preferências guardadas, recebe tudo por omissão.
async function enviarPushPersonalizado(turmaId, roles, partes, tituloOmissao) {
  if (!VAPID_PUBLIC) return 0;
  const placeholdersRoles = roles.map(() => "?").join(",");
  const membros = db.prepare(`SELECT userId, role FROM memberships WHERE turmaId=? AND role IN (${placeholdersRoles}) AND estado='ativo'`).all(turmaId, ...roles);
  let enviados = 0;
  for (const m of membros) {
    const subs = db.prepare("SELECT * FROM push_subscriptions WHERE turmaId = ? AND userId = ?").all(turmaId, m.userId);
    if (!subs.length) continue;
    const prefRow = db.prepare("SELECT notifPrefs FROM preferencias WHERE userId = ?").get(m.userId);
    let prefs = {};
    try { prefs = prefRow && prefRow.notifPrefs ? JSON.parse(prefRow.notifPrefs) : {}; } catch (e) { prefs = {}; }
    const partesPermitidas = partes.filter((p) => prefs[p.categoria] !== false); // por omissão, tudo ligado
    if (!partesPermitidas.length) continue;
    const payload = JSON.stringify({ title: tituloOmissao, body: partesPermitidas.map((p) => p.texto).join(" · ") });
    for (const s of subs) {
      try { await webpush.sendNotification(JSON.parse(s.subscription), payload); enviados++; }
      catch (e) { if (e.statusCode === 410 || e.statusCode === 404) db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(s.id); }
    }
  }
  return enviados;
}

module.exports = router;
