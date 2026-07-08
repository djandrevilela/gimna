const express = require("express");
const db = require("../db");
const { uuid, nowIso } = require("../util");
const { requireAuth, requireMembership } = require("../middleware/auth");
const Season = require("../season");

const router = express.Router();
router.use(requireAuth);

function parseJsonCols(row, cols) {
  if (!row) return row;
  const out = Object.assign({}, row);
  cols.forEach((c) => { try { out[c] = row[c] ? JSON.parse(row[c]) : (Array.isArray(row[c]) ? [] : {}); } catch (e) { /* mantém como veio */ } });
  return out;
}

router.get("/me", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  const memberships = db.prepare("SELECT * FROM memberships WHERE userId = ? AND estado='ativo'").all(req.userId);
  res.json({ user, memberships });
});

router.get("/preferencias/me", (req, res) => {
  const row = db.prepare("SELECT * FROM preferencias WHERE userId = ?").get(req.userId);
  res.json(row ? parseJsonCols(row, ["widgetsDashboard"]) : null);
});
router.put("/preferencias/me", (req, res) => {
  const widgets = JSON.stringify(req.body.widgets || []);
  db.prepare("INSERT INTO preferencias (userId, widgetsDashboard, updatedAt) VALUES (?,?,?) ON CONFLICT(userId) DO UPDATE SET widgetsDashboard=excluded.widgetsDashboard, updatedAt=excluded.updatedAt")
    .run(req.userId, widgets, nowIso());
  res.json({ ok: true });
});

router.post("/turmas/first", (req, res) => {
  const tenantId = uuid(), turmaId = uuid();
  db.prepare("INSERT INTO tenants (id, nome, plano, limiteAtletas, criadoEm) VALUES (?,?,?,?,?)")
    .run(tenantId, req.body.tenantNome || "O meu ginásio", "Trial", 30, nowIso());
  db.prepare("INSERT INTO turmas (id, tenantId, nome, descricao, diasSemana, feriados, updatedAt) VALUES (?,?,?,?,?,?,?)")
    .run(turmaId, tenantId, req.body.turmaNome || "A minha turma", "", "[]", "[]", nowIso());
  db.prepare("INSERT INTO memberships (id,userId,turmaId,tenantId,role,estado,updatedAt) VALUES (?,?,?,?,?,'ativo',?)")
    .run(uuid(), req.userId, turmaId, tenantId, "manager", nowIso());
  res.json({ ok: true, tenantId, turmaId });
});

router.get("/turmas/:id", requireMembership(), (req, res) => {
  const row = db.prepare("SELECT * FROM turmas WHERE id = ?").get(req.params.id);
  res.json(parseJsonCols(row, ["diasSemana", "feriados", "padraoMicrociclo"]));
});

router.put("/turmas/:id", requireMembership(["manager"]), (req, res) => {
  const b = req.body;
  db.prepare("UPDATE turmas SET nome=?, descricao=?, horario=?, epocaInicio=?, epocaFim=?, diasSemana=?, feriados=?, padraoMicrociclo=?, updatedAt=? WHERE id=?")
    .run(b.nome, b.descricao || "", b.horario || "", b.epocaInicio || null, b.epocaFim || null,
      JSON.stringify(b.diasSemana || []), JSON.stringify(b.feriados || []),
      b.padraoMicrociclo ? JSON.stringify(b.padraoMicrociclo) : null, nowIso(), req.params.id);
  res.json({ ok: true });
});

router.post("/turmas/:id/gerar-sessoes", requireMembership(["manager"]), (req, res) => {
  const turma = parseJsonCols(db.prepare("SELECT * FROM turmas WHERE id = ?").get(req.params.id), ["diasSemana", "feriados", "padraoMicrociclo"]);
  const mesociclos = db.prepare("SELECT * FROM mesociclos WHERE turmaId = ?").all(req.params.id);
  const realizadas = new Set(db.prepare("SELECT data FROM sessoes WHERE turmaId=? AND estado='realizada'").all(req.params.id).map((r) => r.data));

  db.prepare("DELETE FROM sessoes WHERE turmaId = ? AND estado != 'realizada'").run(req.params.id);

  const geradas = Season.generateSessions(turma, mesociclos).filter((s) => !realizadas.has(s.data));
  const ins = db.prepare("INSERT INTO sessoes (id,tenantId,turmaId,mesocicloId,data,diaSemana,semanaCiclo,tipo,feriado,planoConteudo,planosGrupo,planosAtleta,estado,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const tx = db.transaction((rows) => { rows.forEach((s) => ins.run(uuid(), s.tenantId, s.turmaId, s.mesocicloId, s.data, s.diaSemana, s.semanaCiclo, s.tipo, s.feriado, s.planoConteudo, "{}", "{}", s.estado, nowIso())); });
  tx(geradas);
  res.json({ ok: true, count: geradas.length });
});

function simpleResource(opts) {
  const path = opts.path, table = opts.table, jsonCols = opts.jsonCols || [], writeRoles = opts.writeRoles || ["manager"], buildInsert = opts.buildInsert;

  router.get("/" + path, requireMembership(), (req, res) => {
    const rows = db.prepare("SELECT * FROM " + table + " WHERE turmaId = ?").all(req.membership.turmaId);
    res.json(rows.map((r) => parseJsonCols(r, jsonCols)));
  });

  router.post("/" + path, requireMembership(writeRoles), (req, res) => {
    const id = uuid();
    buildInsert(req, id);
    res.json({ ok: true, id });
  });

  router.put("/" + path + "/:id", requireMembership(writeRoles), (req, res) => {
    buildInsert(req, req.params.id, true);
    res.json({ ok: true });
  });

  router.delete("/" + path + "/:id", requireMembership(writeRoles), (req, res) => {
    db.prepare("DELETE FROM " + table + " WHERE id = ? AND turmaId = ?").run(req.params.id, req.membership.turmaId);
    res.json({ ok: true });
  });
}

simpleResource({
  path: "grupos", table: "grupos", writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      db.prepare("UPDATE grupos SET nome=?, ordem=?, descricao=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.ordem || 1, b.descricao || "", nowIso(), id, req.membership.turmaId);
    } else {
      db.prepare("INSERT INTO grupos (id,tenantId,turmaId,nome,ordem,descricao,updatedAt) VALUES (?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.ordem || 1, b.descricao || "", nowIso());
    }
  },
});

simpleResource({
  path: "atletas", table: "atletas", jsonCols: ["habilidades"], writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    const habilidades = JSON.stringify(b.habilidades || {});
    if (isUpdate) {
      db.prepare("UPDATE atletas SET nome=?, dataNascimento=?, grupoId=?, encarregado=?, contacto=?, notasMedicas=?, foto=?, ativo=?, habilidades=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.dataNascimento || null, b.grupoId || null, b.encarregado || "", b.contacto || "", b.notasMedicas || "",
          b.foto || null, b.ativo === false ? 0 : 1, habilidades, nowIso(), id, req.membership.turmaId);
    } else {
      db.prepare("INSERT INTO atletas (id,tenantId,turmaId,grupoId,nome,dataNascimento,encarregado,contacto,notasMedicas,foto,ativo,habilidades,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.grupoId || null, b.nome, b.dataNascimento || null,
          b.encarregado || "", b.contacto || "", b.notasMedicas || "", b.foto || null, b.ativo === false ? 0 : 1, habilidades, nowIso());
    }
  },
});

simpleResource({
  path: "mesociclos", table: "mesociclos", writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      db.prepare("UPDATE mesociclos SET nome=?, dataInicio=?, dataFim=?, objetivo=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.dataInicio, b.dataFim, b.objetivo || "", nowIso(), id, req.membership.turmaId);
    } else {
      db.prepare("INSERT INTO mesociclos (id,tenantId,turmaId,nome,dataInicio,dataFim,objetivo,updatedAt) VALUES (?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.dataInicio, b.dataFim, b.objetivo || "", nowIso());
    }
  },
});

simpleResource({
  path: "sessoes", table: "sessoes", jsonCols: ["planosGrupo", "planosAtleta"], writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      db.prepare("UPDATE sessoes SET mesocicloId=?, tipo=?, planoConteudo=?, planosGrupo=?, planosAtleta=?, estado=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.mesocicloId || null, b.tipo || null, b.planoConteudo || "", JSON.stringify(b.planosGrupo || {}),
          JSON.stringify(b.planosAtleta || {}), b.estado || "planeada", nowIso(), id, req.membership.turmaId);
    } else {
      db.prepare("INSERT INTO sessoes (id,tenantId,turmaId,mesocicloId,data,diaSemana,semanaCiclo,tipo,feriado,planoConteudo,planosGrupo,planosAtleta,estado,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.mesocicloId || null, b.data, b.diaSemana || "", b.semanaCiclo || null,
          b.tipo || null, b.feriado || null, b.planoConteudo || "", "{}", "{}", b.estado || "planeada", nowIso());
    }
  },
});

router.get("/presencas", requireMembership(), (req, res) => {
  const sessaoId = req.query.sessaoId;
  const rows = sessaoId
    ? db.prepare("SELECT * FROM presencas WHERE sessaoId = ?").all(sessaoId)
    : db.prepare("SELECT p.* FROM presencas p JOIN sessoes s ON s.id=p.sessaoId WHERE s.turmaId=?").all(req.membership.turmaId);
  res.json(rows);
});
router.put("/presencas", requireMembership(["manager", "ajudante"]), (req, res) => {
  const b = req.body;
  const existing = db.prepare("SELECT id FROM presencas WHERE sessaoId=? AND atletaId=?").get(b.sessaoId, b.atletaId);
  if (existing) {
    db.prepare("UPDATE presencas SET estado=?, marcadoPor=?, updatedAt=? WHERE id=?").run(b.estado, req.userId, nowIso(), existing.id);
  } else {
    db.prepare("INSERT INTO presencas (id,tenantId,sessaoId,atletaId,estado,marcadoPor,updatedAt) VALUES (?,?,?,?,?,?,?)")
      .run(uuid(), req.membership.tenantId, b.sessaoId, b.atletaId, b.estado, req.userId, nowIso());
  }
  res.json({ ok: true });
});

router.get("/comentarios", requireMembership(["manager", "ajudante"]), (req, res) => {
  res.json(db.prepare("SELECT * FROM comentarios WHERE tenantId = ?").all(req.membership.tenantId));
});
router.post("/comentarios", requireMembership(["manager", "ajudante"]), (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare("INSERT INTO comentarios (id,tenantId,targetType,targetId,autorId,autorNome,texto,criadoEm) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, req.membership.tenantId, b.targetType, b.targetId, req.userId, b.autorNome || "", b.texto, nowIso());
  res.json({ ok: true, id });
});

router.get("/mensagens", requireMembership(), (req, res) => {
  if (req.membership.role === "ajudante") return res.status(403).json({ error: "Ajudantes não têm acesso a mensagens." });
  res.json(db.prepare("SELECT * FROM mensagens WHERE turmaId = ?").all(req.membership.turmaId));
});
router.post("/mensagens", requireMembership(), (req, res) => {
  const role = req.membership.role;
  if (role === "ajudante") return res.status(403).json({ error: "Ajudantes não têm acesso a mensagens." });
  const b = req.body;
  if (b.tipo === "broadcast" && role !== "manager") return res.status(403).json({ error: "Só o gestor pode enviar avisos gerais." });
  const id = uuid();
  db.prepare("INSERT INTO mensagens (id,tenantId,turmaId,tipo,atletaId,remetenteUserId,remetenteNome,remetenteRole,texto,criadoEm) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, req.membership.tenantId, req.membership.turmaId, b.tipo, b.atletaId || (role === "atleta" ? req.membership.atletaId : null),
      req.userId, b.remetenteNome || "", role, b.texto, nowIso());
  res.json({ ok: true, id });
});

router.get("/convites", requireMembership(["manager"]), (req, res) => {
  res.json(db.prepare("SELECT * FROM convites WHERE turmaId = ? AND estado='pendente'").all(req.membership.turmaId));
});
router.post("/convites", requireMembership(["manager"]), (req, res) => {
  const b = req.body;
  const email = String(b.email || "").trim().toLowerCase();
  const id = uuid();
  db.prepare("INSERT INTO convites (id,email,turmaId,tenantId,role,atletaId,estado,convidadoPor,criadoEm) VALUES (?,?,?,?,?,?,'pendente',?,?)")
    .run(id, email, req.membership.turmaId, req.membership.tenantId, b.role || "ajudante", b.atletaId || null, req.userId, nowIso());

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  let ativadoJa = false;
  if (user) {
    db.prepare("INSERT INTO memberships (id,userId,turmaId,tenantId,role,atletaId,estado,updatedAt) VALUES (?,?,?,?,?,?,'ativo',?)")
      .run(uuid(), user.id, req.membership.turmaId, req.membership.tenantId, b.role || "ajudante", b.atletaId || null, nowIso());
    db.prepare("UPDATE convites SET estado='aceite' WHERE id=?").run(id);
    ativadoJa = true;
  }
  res.json({ ok: true, id, ativadoJa });
});

router.get("/memberships", requireMembership(["manager"]), (req, res) => {
  const rows = db.prepare("SELECT m.*, u.nome as userNome, u.email as userEmail FROM memberships m JOIN users u ON u.id = m.userId WHERE m.turmaId = ? AND m.estado='ativo'").all(req.membership.turmaId);
  res.json(rows);
});
router.delete("/memberships/:id", requireMembership(["manager"]), (req, res) => {
  db.prepare("DELETE FROM memberships WHERE id = ? AND turmaId = ?").run(req.params.id, req.membership.turmaId);
  res.json({ ok: true });
});

module.exports = router;
