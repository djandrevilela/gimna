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

router.put("/me", (req, res) => {
  const b = req.body;
  db.prepare("UPDATE users SET nome=?, dataNascimento=?, updatedAt=? WHERE id=?")
    .run(b.nome || "", b.dataNascimento || null, nowIso(), req.userId);
  res.json({ ok: true });
});

router.get("/preferencias/me", (req, res) => {
  const row = db.prepare("SELECT * FROM preferencias WHERE userId = ?").get(req.userId);
  res.json(row ? parseJsonCols(row, ["widgetsDashboard", "notifPrefs"]) : null);
});
router.put("/preferencias/me", (req, res) => {
  const existing = db.prepare("SELECT * FROM preferencias WHERE userId = ?").get(req.userId);
  const widgets = req.body.widgets !== undefined ? JSON.stringify(req.body.widgets) : (existing ? existing.widgetsDashboard : "[]");
  const notifPrefs = req.body.notifPrefs !== undefined ? JSON.stringify(req.body.notifPrefs) : (existing ? existing.notifPrefs : "{}");
  db.prepare("INSERT INTO preferencias (userId, widgetsDashboard, notifPrefs, updatedAt) VALUES (?,?,?,?) ON CONFLICT(userId) DO UPDATE SET widgetsDashboard=excluded.widgetsDashboard, notifPrefs=excluded.notifPrefs, updatedAt=excluded.updatedAt")
    .run(req.userId, widgets, notifPrefs, nowIso());
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

// Nova turma dentro do MESMO ginásio de uma turma onde já sou gestor
// (ex.: André já gere a turma AnimaKids e quer adicionar "AnimaKids Iniciação" — nomes de turmas ficam livres, Gimna é só a plataforma).
router.post("/turmas", requireMembership(["manager"]), (req, res) => {
  const turmaId = req.body.id || uuid();
  const b = req.body;
  db.prepare("INSERT INTO turmas (id, tenantId, nome, descricao, horario, diasSemana, feriados, updatedAt) VALUES (?,?,?,?,?,?,?,?)")
    .run(turmaId, req.membership.tenantId, b.nome, b.descricao || "", b.horario || "", "[]", "[]", nowIso());
  db.prepare("INSERT INTO memberships (id,userId,turmaId,tenantId,role,estado,updatedAt) VALUES (?,?,?,?,?,'ativo',?)")
    .run(uuid(), req.userId, turmaId, req.membership.tenantId, "manager", nowIso());
  res.json({ ok: true, turmaId });
});

router.get("/turmas/:id", requireMembership(), (req, res) => {
  const row = db.prepare("SELECT * FROM turmas WHERE id = ?").get(req.params.id);
  res.json(parseJsonCols(row, ["diasSemana", "feriados", "padraoMicrociclo", "coresFases"]));
});

router.put("/turmas/:id", requireMembership(["manager"]), (req, res) => {
  const b = req.body;
  db.prepare("UPDATE turmas SET nome=?, descricao=?, horario=?, epocaInicio=?, epocaFim=?, resumoObjetivos=?, diasSemana=?, feriados=?, padraoMicrociclo=?, corPrimaria=?, corAccent=?, logoUrl=?, resumoPeriodicidade=?, coresFases=?, updatedAt=? WHERE id=?")
    .run(b.nome, b.descricao || "", b.horario || "", b.epocaInicio || null, b.epocaFim || null, b.resumoObjetivos || "",
      JSON.stringify(b.diasSemana || []), JSON.stringify(b.feriados || []),
      b.padraoMicrociclo ? JSON.stringify(b.padraoMicrociclo) : null,
      b.corPrimaria || null, b.corAccent || null, b.logoUrl || null, b.resumoPeriodicidade || "off",
      b.coresFases ? JSON.stringify(b.coresFases) : null,
      nowIso(), req.params.id);
  res.json({ ok: true });
});

router.post("/turmas/:id/gerar-sessoes", requireMembership(["manager"]), (req, res) => {
  const turma = parseJsonCols(db.prepare("SELECT * FROM turmas WHERE id = ?").get(req.params.id), ["diasSemana", "feriados", "padraoMicrociclo"]);
  const mesociclos = db.prepare("SELECT * FROM mesociclos WHERE turmaId = ?").all(req.params.id).map((m) => parseJsonCols(m, ["planosPorMicrociclo"]));
  const catalogo = db.prepare("SELECT * FROM microciclos_tipos WHERE turmaId = ? ORDER BY ordem").all(req.params.id);
  const realizadas = new Set(db.prepare("SELECT data FROM sessoes WHERE turmaId=? AND estado='realizada'").all(req.params.id).map((r) => r.data));

  // preserva sessões já realizadas E eventos extra (provas/exibições/treinos extra)
  db.prepare("DELETE FROM sessoes WHERE turmaId = ? AND estado != 'realizada' AND categoria = 'treino'").run(req.params.id);

  const geradas = Season.generateSessions(turma, mesociclos, catalogo).filter((s) => !realizadas.has(s.data));
  const ins = db.prepare("INSERT INTO sessoes (id,tenantId,turmaId,mesocicloId,data,diaSemana,semanaCiclo,tipo,categoria,feriado,planoConteudo,planosGrupo,planosAtleta,estado,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const tx = db.transaction((rows) => { rows.forEach((s) => ins.run(uuid(), s.tenantId, s.turmaId, s.mesocicloId, s.data, s.diaSemana, s.semanaCiclo, s.tipo, s.categoria || "treino", s.feriado, s.planoConteudo, "{}", "{}", s.estado, nowIso())); });
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
    const id = req.body.id || uuid(); // aceita o id gerado no dispositivo, para a sincronização offline não duplicar registos
    buildInsert(req, id);
    res.json({ ok: true, id });
  });

  router.put("/" + path + "/:id", requireMembership(writeRoles), (req, res) => {
    const result = buildInsert(req, req.params.id, true);
    if (result && result.changes === 0) return res.status(404).json({ error: "Registo não encontrado nesta turma." });
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
      return db.prepare("UPDATE grupos SET nome=?, ordem=?, descricao=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.ordem || 1, b.descricao || "", nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO grupos (id,tenantId,turmaId,nome,ordem,descricao,updatedAt) VALUES (?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.ordem || 1, b.descricao || "", nowIso());
    }
  },
});

simpleResource({
  path: "atletas", table: "atletas", jsonCols: ["habilidades", "camposCustom"], writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    const habilidades = JSON.stringify(b.habilidades || {});
    const camposCustom = JSON.stringify(b.camposCustom || {});
    if (isUpdate) {
      return db.prepare("UPDATE atletas SET nome=?, dataNascimento=?, grupoId=?, encarregado=?, contacto=?, notasMedicas=?, foto=?, ativo=?, habilidades=?, autorizacaoImagem=?, objetivosCoach=?, camposCustom=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.dataNascimento || null, b.grupoId || null, b.encarregado || "", b.contacto || "", b.notasMedicas || "",
          b.foto || null, b.ativo === false ? 0 : 1, habilidades, b.autorizacaoImagem ? 1 : 0, b.objetivosCoach || "", camposCustom, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO atletas (id,tenantId,turmaId,grupoId,nome,dataNascimento,encarregado,contacto,notasMedicas,foto,ativo,habilidades,autorizacaoImagem,objetivosCoach,camposCustom,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.grupoId || null, b.nome, b.dataNascimento || null,
          b.encarregado || "", b.contacto || "", b.notasMedicas || "", b.foto || null, b.ativo === false ? 0 : 1, habilidades,
          b.autorizacaoImagem ? 1 : 0, b.objetivosCoach || "", camposCustom, nowIso());
    }
  },
});

// O próprio atleta/encarregado de educação pode escrever os SEUS objetivos
// (diferente do CRUD acima, que é manager-only) — nunca outros campos.
router.put("/atletas/me/objetivos", requireMembership(["atleta"]), (req, res) => {
  if (!req.membership.atletaId) return res.status(400).json({ error: "Esta conta não está associada a um atleta." });
  db.prepare("UPDATE atletas SET objetivosProprios=?, updatedAt=? WHERE id=?")
    .run(req.body.objetivosProprios || "", nowIso(), req.membership.atletaId);
  res.json({ ok: true });
});

simpleResource({
  path: "mesociclos", table: "mesociclos", jsonCols: ["planosPorMicrociclo"], writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    const planos = JSON.stringify(b.planosPorMicrociclo || {});
    if (isUpdate) {
      return db.prepare("UPDATE mesociclos SET nome=?, dataInicio=?, dataFim=?, objetivo=?, planosPorMicrociclo=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.dataInicio, b.dataFim, b.objetivo || "", planos, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO mesociclos (id,tenantId,turmaId,nome,dataInicio,dataFim,objetivo,planosPorMicrociclo,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.dataInicio, b.dataFim, b.objetivo || "", planos, nowIso());
    }
  },
});

simpleResource({
  path: "microciclos-tipos", table: "microciclos_tipos", writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      return db.prepare("UPDATE microciclos_tipos SET nome=?, planoGenerico=?, cor=?, ordem=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.planoGenerico || "", b.cor || "c1", b.ordem || 1, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO microciclos_tipos (id,tenantId,turmaId,nome,planoGenerico,cor,ordem,updatedAt) VALUES (?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.planoGenerico || "", b.cor || "c1", b.ordem || 1, nowIso());
    }
  },
});

simpleResource({
  path: "habilidades-tipos", table: "habilidades_tipos", jsonCols: ["criterios"], writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    const criterios = JSON.stringify(b.criterios || {});
    if (isUpdate) {
      return db.prepare("UPDATE habilidades_tipos SET nome=?, categoriaId=?, criterios=?, ordem=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.categoriaId || null, criterios, b.ordem || 1, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO habilidades_tipos (id,tenantId,turmaId,nome,categoriaId,criterios,ordem,updatedAt) VALUES (?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.categoriaId || null, criterios, b.ordem || 1, nowIso());
    }
  },
});

simpleResource({
  path: "categorias-habilidades", table: "categorias_habilidades", writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      return db.prepare("UPDATE categorias_habilidades SET nome=?, cor=?, ordem=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.cor || "c1", b.ordem || 1, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO categorias_habilidades (id,tenantId,turmaId,nome,cor,ordem,updatedAt) VALUES (?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.cor || "c1", b.ordem || 1, nowIso());
    }
  },
});

simpleResource({
  path: "estados-presenca", table: "estados_presenca", writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      return db.prepare("UPDATE estados_presenca SET nome=?, cor=?, contaComoPresenca=?, ordem=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.cor || "c1", b.contaComoPresenca ? 1 : 0, b.ordem || 1, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO estados_presenca (id,tenantId,turmaId,nome,cor,contaComoPresenca,ordem,updatedAt) VALUES (?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.cor || "c1", b.contaComoPresenca ? 1 : 0, b.ordem || 1, nowIso());
    }
  },
});

simpleResource({
  path: "criterios-avaliacao", table: "criterios_avaliacao", writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      return db.prepare("UPDATE criterios_avaliacao SET nome=?, ordem=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.ordem || 1, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO criterios_avaliacao (id,tenantId,turmaId,nome,ordem,updatedAt) VALUES (?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.ordem || 1, nowIso());
    }
  },
});

simpleResource({
  path: "campos-personalizados", table: "campos_personalizados", writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      return db.prepare("UPDATE campos_personalizados SET nome=?, tipo=?, ordem=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.nome, b.tipo || "texto", b.ordem || 1, nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO campos_personalizados (id,tenantId,turmaId,nome,tipo,ordem,updatedAt) VALUES (?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.nome, b.tipo || "texto", b.ordem || 1, nowIso());
    }
  },
});

simpleResource({
  path: "sessoes", table: "sessoes", jsonCols: ["planosGrupo", "planosAtleta"], writeRoles: ["manager"],
  buildInsert: (req, id, isUpdate) => {
    const b = req.body;
    if (isUpdate) {
      return db.prepare("UPDATE sessoes SET mesocicloId=?, tipo=?, categoria=?, nomeEvento=?, hora=?, planoConteudo=?, planosGrupo=?, planosAtleta=?, estado=?, updatedAt=? WHERE id=? AND turmaId=?")
        .run(b.mesocicloId || null, b.tipo || null, b.categoria || "treino", b.nomeEvento || null, b.hora || null, b.planoConteudo || "",
          JSON.stringify(b.planosGrupo || {}), JSON.stringify(b.planosAtleta || {}), b.estado || "planeada", nowIso(), id, req.membership.turmaId);
    } else {
      return db.prepare("INSERT INTO sessoes (id,tenantId,turmaId,mesocicloId,data,diaSemana,semanaCiclo,tipo,categoria,nomeEvento,hora,feriado,planoConteudo,planosGrupo,planosAtleta,estado,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, req.membership.tenantId, req.membership.turmaId, b.mesocicloId || null, b.data, b.diaSemana || "", b.semanaCiclo || null,
          b.tipo || null, b.categoria || "treino", b.nomeEvento || null, b.hora || null, b.feriado || null, b.planoConteudo || "", "{}", "{}", b.estado || "planeada", nowIso());
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

router.get("/avaliacoes", requireMembership(), (req, res) => {
  res.json(db.prepare("SELECT * FROM avaliacoes WHERE turmaId = ?").all(req.membership.turmaId).map((r) => parseJsonCols(r, ["snapshotHabilidades", "snapshotCriterios"])));
});
router.post("/avaliacoes", requireMembership(["manager", "ajudante"]), (req, res) => {
  const b = req.body;
  const id = b.id || uuid();
  db.prepare("INSERT INTO avaliacoes (id,tenantId,turmaId,atletaId,tipo,mesocicloId,data,observacoesGerais,snapshotHabilidades,snapshotCriterios,autorId,autorNome,criadoEm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, req.membership.tenantId, req.membership.turmaId, b.atletaId, b.tipo, b.mesocicloId || null, b.data,
      b.observacoesGerais || "", JSON.stringify(b.snapshotHabilidades || {}), JSON.stringify(b.snapshotCriterios || {}),
      b.autorId || req.userId, b.autorNome || "", b.criadoEm || nowIso());
  res.json({ ok: true, id });
});
router.delete("/avaliacoes/:id", requireMembership(["manager"]), (req, res) => {
  db.prepare("DELETE FROM avaliacoes WHERE id = ? AND turmaId = ?").run(req.params.id, req.membership.turmaId);
  res.json({ ok: true });
});

router.get("/memberships", requireMembership(["manager"]), (req, res) => {
  const rows = db.prepare("SELECT m.*, u.nome as userNome, u.email as userEmail FROM memberships m JOIN users u ON u.id = m.userId WHERE m.turmaId = ? AND m.estado='ativo'").all(req.membership.turmaId);
  res.json(rows.map((r) => parseJsonCols(r, ["permissoesExtra"])));
});
router.put("/memberships/:id/permissoes", requireMembership(["manager"]), (req, res) => {
  db.prepare("UPDATE memberships SET permissoesExtra=?, updatedAt=? WHERE id=? AND turmaId=?")
    .run(JSON.stringify(req.body.permissoesExtra || []), nowIso(), req.params.id, req.membership.turmaId);
  res.json({ ok: true });
});
router.delete("/memberships/:id", requireMembership(["manager"]), (req, res) => {
  db.prepare("DELETE FROM memberships WHERE id = ? AND turmaId = ?").run(req.params.id, req.membership.turmaId);
  res.json({ ok: true });
});

// -----------------------------------------------------------------
// Exportação completa dos dados de uma turma — usa isto antes de
// qualquer redeploy/migração de servidor como salvaguarda. Devolve
// tudo em JSON; para restaurar, seria preciso um pequeno script de
// importação (não incluído) ou reintroduzir manualmente via API.
// -----------------------------------------------------------------
router.get("/turmas/:id/exportar-tudo", requireMembership(["manager"]), (req, res) => {
  const turmaId = req.params.id;
  const dump = {
    exportadoEm: nowIso(),
    turma: parseJsonCols(db.prepare("SELECT * FROM turmas WHERE id=?").get(turmaId), ["diasSemana", "feriados", "padraoMicrociclo", "coresFases"]),
    grupos: db.prepare("SELECT * FROM grupos WHERE turmaId=?").all(turmaId),
    atletas: db.prepare("SELECT * FROM atletas WHERE turmaId=?").all(turmaId).map((r) => parseJsonCols(r, ["habilidades", "camposCustom"])),
    mesociclos: db.prepare("SELECT * FROM mesociclos WHERE turmaId=?").all(turmaId).map((r) => parseJsonCols(r, ["planosPorMicrociclo"])),
    microciclosTipos: db.prepare("SELECT * FROM microciclos_tipos WHERE turmaId=?").all(turmaId),
    habilidadesTipos: db.prepare("SELECT * FROM habilidades_tipos WHERE turmaId=?").all(turmaId).map((r) => parseJsonCols(r, ["criterios"])),
    categoriasHabilidades: db.prepare("SELECT * FROM categorias_habilidades WHERE turmaId=?").all(turmaId),
    estadosPresenca: db.prepare("SELECT * FROM estados_presenca WHERE turmaId=?").all(turmaId),
    criteriosAvaliacao: db.prepare("SELECT * FROM criterios_avaliacao WHERE turmaId=?").all(turmaId),
    camposPersonalizados: db.prepare("SELECT * FROM campos_personalizados WHERE turmaId=?").all(turmaId),
    sessoes: db.prepare("SELECT * FROM sessoes WHERE turmaId=?").all(turmaId).map((r) => parseJsonCols(r, ["planosGrupo", "planosAtleta"])),
    presencas: db.prepare("SELECT p.* FROM presencas p JOIN sessoes s ON s.id=p.sessaoId WHERE s.turmaId=?").all(turmaId),
    comentarios: db.prepare("SELECT * FROM comentarios WHERE tenantId=?").all(req.membership.tenantId),
    mensagens: db.prepare("SELECT * FROM mensagens WHERE turmaId=?").all(turmaId),
    avaliacoes: db.prepare("SELECT * FROM avaliacoes WHERE turmaId=?").all(turmaId).map((r) => parseJsonCols(r, ["snapshotHabilidades", "snapshotCriterios"])),
    memberships: db.prepare("SELECT * FROM memberships WHERE turmaId=?").all(turmaId),
  };
  res.json(dump);
});

module.exports = router;
