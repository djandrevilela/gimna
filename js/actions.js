/* =========================================================
   Gimna — ações (handlers de botões e formulários)
   ========================================================= */
(function (global) {
  "use strict";
  const { toast, openModal, closeModal, triggerInstall, renderRoute } = U;

  function requireAdmin() {
    if (!Auth.isAdmin()) { toast("Só o gestor pode fazer isto."); return false; }
    return true;
  }
  function requirePermission(perm) {
    if (!Auth.can(perm)) { toast("Sem permissão para fazer isto."); return false; }
    return true;
  }
  function ctxTenant() { return Auth.activeMembership ? Auth.activeMembership.tenantId : null; }
  function ctxTurma() { return Auth.activeMembership ? Auth.activeMembership.turmaId : null; }

  const Actions = {
    installApp: () => triggerInstall(),
    closeModal: () => closeModal(),
    toggleDetalhe: (ds) => {
      const el = document.getElementById(ds.target);
      if (el) el.style.display = el.style.display === "none" ? "" : "none";
    },

    // ---------------- Atletas ----------------
    openAthlete: (ds) => { location.hash = "#/atletas/" + ds.id; },
    newAthlete: async () => {
      if (!requirePermission("editarAtletas")) return;
      const [turmas, grupos, campos] = await Promise.all([DB.getAll("turmas"), DB.getAll("grupos"), U.getCamposPersonalizados()]);
      openModal(Views._helpers.athleteFormHtml(null, U.byTenant(turmas), U.byTurma(grupos), campos));
      Views._helpers.afterAthleteForm();
    },
    editAthlete: async (ds) => {
      if (!requirePermission("editarAtletas")) return;
      const [atleta, turmas, grupos, campos] = await Promise.all([DB.get("atletas", ds.id), DB.getAll("turmas"), DB.getAll("grupos"), U.getCamposPersonalizados()]);
      openModal(Views._helpers.athleteFormHtml(atleta, U.byTenant(turmas), U.byTurma(grupos), campos));
      Views._helpers.afterAthleteForm();
    },
    saveAthlete: async (form) => {
      if (!requirePermission("editarAtletas")) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const existing = id ? await DB.get("atletas", id) : null;
      const fotoInput = form.querySelector("#foto-input");
      const foto = (fotoInput && fotoInput.dataset.resized) || fd.get("fotoAtual") || (existing && existing.foto) || null;
      const [habilidadesNomes, campos] = await Promise.all([U.getHabilidadesNomes(), U.getCamposPersonalizados()]);
      const camposCustom = {};
      campos.forEach((c) => {
        if (c.tipo === "checkbox") camposCustom[c.id] = fd.get("campo_" + c.id) === "on";
        else camposCustom[c.id] = fd.get("campo_" + c.id) || "";
      });
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(),
        nome: fd.get("nome"), dataNascimento: fd.get("dataNascimento"), foto,
        turmaId: fd.get("turmaId"), grupoId: fd.get("grupoId") || null,
        encarregado: fd.get("encarregado"), contacto: fd.get("contacto"),
        notasMedicas: fd.get("notasMedicas"), ativo: fd.get("ativo") === "on",
        objetivosCoach: fd.get("objetivosCoach") || "", autorizacaoImagem: fd.get("autorizacaoImagem") === "on",
        camposCustom,
        habilidades: (existing && existing.habilidades) || habilidadesNomes.reduce((acc, h) => { acc[h] = 1; return acc; }, {}),
      });
      await DB.put("atletas", record);
      closeModal(); toast("Atleta guardado."); await renderRoute();
    },
    deleteAthlete: async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover este atleta? Esta ação não pode ser desfeita.")) return;
      await DB.remove("atletas", ds.id);
      closeModal(); toast("Atleta removido."); location.hash = "#/atletas"; await renderRoute();
    },
    skillPhase: async (ds) => {
      if (!requireAdmin()) return;
      const atleta = await DB.get("atletas", ds.id);
      const delta = parseInt(ds.delta, 10);
      const cur = (atleta.habilidades && atleta.habilidades[ds.skill]) || 1;
      const next = Math.min(5, Math.max(1, cur + delta));
      atleta.habilidades = atleta.habilidades || {};
      atleta.habilidades[ds.skill] = next;
      await DB.put("atletas", atleta);
      await renderRoute();
    },
    inviteAthleteAccount: async (ds) => {
      if (!requireAdmin()) return;
      const atleta = await DB.get("atletas", ds.id);
      openModal(Views._helpers.inviteFormHtml({ tipo: "atleta", atletaNome: atleta.nome, atletaId: atleta.id }));
    },

    // ---------------- Grupos ----------------
    newGroup: async () => {
      if (!requirePermission("editarAtletas")) return;
      openModal(Views._helpers.groupFormHtml(null, U.byTenant(await DB.getAll("turmas"))));
    },
    editGroup: async (ds) => {
      if (!requirePermission("editarAtletas")) return;
      const [g, turmas] = await Promise.all([DB.get("grupos", ds.id), DB.getAll("turmas")]);
      openModal(Views._helpers.groupFormHtml(g, U.byTenant(turmas)));
    },
    deleteGroup: async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover este grupo? Os atletas ficam sem grupo atribuído.")) return;
      const atletas = await DB.getAll("atletas");
      await Promise.all(atletas.filter((a) => a.grupoId === ds.id).map((a) => { a.grupoId = null; return DB.put("atletas", a); }));
      await DB.remove("grupos", ds.id);
      toast("Grupo removido."); await renderRoute();
    },
    saveGroup: async (form) => {
      if (!requirePermission("editarAtletas")) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const existing = id ? await DB.get("grupos", id) : null;
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(), turmaId: fd.get("turmaId"),
        nome: fd.get("nome"), ordem: parseInt(fd.get("ordem"), 10) || 1, descricao: fd.get("descricao"),
      });
      await DB.put("grupos", record);
      closeModal(); toast("Grupo guardado."); await renderRoute();
    },

    // ---------------- Turmas ----------------
    newTurma: async () => { if (!requireAdmin()) return; openModal(Views._helpers.turmaFormHtml(null)); },
    editTurma: async (ds) => { if (!requireAdmin()) return; openModal(Views._helpers.turmaFormHtml(await DB.get("turmas", ds.id))); },
    saveTurma: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const isNew = !id;
      const existing = id ? await DB.get("turmas", id) : null;
      const localId = id || DB.uuid();
      const record = Object.assign({}, existing, {
        id: localId, tenantId: ctxTenant(), nome: fd.get("nome"), descricao: fd.get("descricao"),
        dias: fd.get("dias"), horario: fd.get("horario"),
      });

      if (isNew && Auth.onlineMode && global.Api && Api.isConfigured() && Api.token) {
        try {
          const res = await Api.createTurma({ id: localId, nome: record.nome, descricao: record.descricao, horario: record.horario });
          record.id = res.turmaId;
        } catch (e) { toast("Não foi possível criar no servidor (" + e.message + ") — a guardar só localmente."); }
      }

      const saved = await DB.put("turmas", record, { silent: isNew }); // se for nova e já ficou criada no servidor, não repete via fila
      if (isNew) {
        await DB.put("memberships", { id: DB.uuid(), userId: Auth.current.id, turmaId: saved.id, tenantId: ctxTenant(), role: "manager", estado: "ativo" }, { silent: true });
        await Auth._loadSession(Auth.current);
        const nova = Auth.memberships.find((m) => m.turmaId === saved.id);
        if (nova) await Auth.setActiveMembership(nova.id);
      }
      closeModal(); toast("Turma guardada."); await U.renderShell();
    },

    // ---------------- Mesociclos / microciclo ----------------
    newMeso: async () => { if (!requireAdmin()) return; openModal(Views._helpers.mesoFormHtml(null, U.byTurma(await DB.getAll("microciclosTipos")))); },
    editMeso: async (ds) => {
      if (!requireAdmin()) return;
      const [meso, catalogo] = await Promise.all([DB.get("mesociclos", ds.id), DB.getAll("microciclosTipos")]);
      openModal(Views._helpers.mesoFormHtml(meso, U.byTurma(catalogo)));
    },
    deleteMeso: async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover este mesociclo?")) return;
      await DB.remove("mesociclos", ds.id);
      closeModal(); toast("Mesociclo removido."); await renderRoute();
    },
    saveMeso: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const turmaId = ctxTurma();
      const existing = id ? await DB.get("mesociclos", id) : null;
      const catalogo = U.byTurma(await DB.getAll("microciclosTipos"));
      const planosPorMicrociclo = {};
      catalogo.forEach((c) => {
        const val = fd.get("plano_" + c.id);
        if (val) planosPorMicrociclo[c.nome] = val;
      });
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(), turmaId: (existing && existing.turmaId) || turmaId,
        nome: fd.get("nome"), dataInicio: fd.get("dataInicio"), dataFim: fd.get("dataFim"), objetivo: fd.get("objetivo"),
        planosPorMicrociclo,
      });
      await DB.put("mesociclos", record);
      closeModal(); toast("Mesociclo guardado."); await renderRoute();
    },

    // ---------------- Catálogo de microciclos (tipos de treino) ----------------
    newMicrociclo: () => { if (!requireAdmin()) return; openModal(Views._helpers.microcicloFormHtml(null)); },
    editMicrociclo: async (ds) => { if (!requireAdmin()) return; openModal(Views._helpers.microcicloFormHtml(await DB.get("microciclosTipos", ds.id))); },
    deleteMicrociclo: async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover este microciclo? As sessões já geradas com este tipo mantêm o nome, mas deixam de ter plano genérico associado.")) return;
      await DB.remove("microciclosTipos", ds.id);
      closeModal(); toast("Microciclo removido."); await renderRoute();
    },
    saveMicrocicloTipo: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const existing = id ? await DB.get("microciclosTipos", id) : null;
      const catalogoAtual = U.byTurma(await DB.getAll("microciclosTipos"));
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(), turmaId: ctxTurma(),
        nome: fd.get("nome"), planoGenerico: fd.get("planoGenerico"),
        cor: (existing && existing.cor) || Season.corParaNome(fd.get("nome"), catalogoAtual),
        ordem: (existing && existing.ordem) || catalogoAtual.length + 1,
      });
      await DB.put("microciclosTipos", record);
      closeModal(); toast("Microciclo guardado."); await renderRoute();
    },
    saveMicrociclo: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const turma = await DB.get("turmas", ctxTurma());
      const diasSemana = turma.diasSemana || [];
      const pattern = { 1: {}, 2: {}, 3: {}, 0: {} };
      [1, 2, 3, 0].forEach((w) => { diasSemana.forEach((d) => { pattern[w][d] = fd.get("w" + w + "_" + d); }); });
      turma.padraoMicrociclo = pattern;
      await DB.put("turmas", turma);
      toast("Padrão do microciclo guardado."); await renderRoute();
    },
    applyMicrociclo: async () => {
      if (!requireAdmin()) return;
      if (!confirm("Recalcular o tipo de treino de todas as sessões futuras (planeadas, a partir de hoje) com o novo padrão?")) return;
      const turma = await DB.get("turmas", ctxTurma());
      const pattern = turma.padraoMicrociclo;
      if (!pattern) { toast("Define primeiro o padrão do microciclo."); return; }
      const sessoes = U.byTurma(await DB.getAll("sessoes"));
      const today = U.todayStr();
      let n = 0;
      for (const s of sessoes) {
        if (s.data >= today && s.tipo && s.estado === "planeada") {
          const dow = new Date(s.data + "T00:00:00").getDay();
          const wk = pattern[s.semanaCiclo % 4];
          if (wk && wk[dow]) { s.tipo = wk[dow]; await DB.put("sessoes", s); n++; }
        }
      }
      toast(n + " sessão(ões) atualizada(s)."); await renderRoute();
    },

    saveResumoObjetivos: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const turma = await DB.get("turmas", ctxTurma());
      turma.resumoObjetivos = fd.get("resumoObjetivos") || "";
      await DB.put("turmas", turma);
      toast("Objetivos gerais guardados."); await renderRoute();
    },

    // ---------------- Configuração da época (definida pelo Manager) ----------------
    saveEpocaConfig: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const turma = await DB.get("turmas", ctxTurma());
      turma.epocaInicio = fd.get("epocaInicio") || null;
      turma.epocaFim = fd.get("epocaFim") || null;
      turma.diasSemana = fd.getAll("diasSemana").map((v) => parseInt(v, 10)).sort();
      turma.horario = fd.get("horario") || "";
      await DB.put("turmas", turma);
      toast("Configuração da época guardada."); await renderRoute();
    },
    addFeriado: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const turma = await DB.get("turmas", ctxTurma());
      turma.feriados = turma.feriados || [];
      const data = fd.get("data");
      if (turma.feriados.some((f) => f.data === data)) { toast("Já existe um feriado nessa data."); return; }
      turma.feriados.push({ data, nome: fd.get("nome") });
      await DB.put("turmas", turma);
      toast("Feriado adicionado."); await renderRoute();
    },
    removeFeriado: async (ds) => {
      if (!requireAdmin()) return;
      const turma = await DB.get("turmas", ctxTurma());
      turma.feriados = (turma.feriados || []).filter((f) => f.data !== ds.data);
      await DB.put("turmas", turma);
      toast("Feriado removido."); await renderRoute();
    },
    gerarSessoesEpoca: async () => {
      if (!requireAdmin()) return;
      const turma = await DB.get("turmas", ctxTurma());
      if (!turma.epocaInicio || !turma.epocaFim || !turma.diasSemana || !turma.diasSemana.length) {
        toast("Define primeiro o início, o fim e os dias de treino da época."); return;
      }
      if (!confirm("Gerar as sessões da época? As sessões planeadas (ainda não realizadas) serão substituídas pelas novas datas/tipos. Sessões já realizadas mantêm-se.")) return;

      if (Auth.onlineMode && global.Api && Api.isConfigured() && Api.token) {
        try {
          const res = await Api.gerarSessoesEpoca(ctxTurma());
          await Api.pullTurma(ctxTurma());
          toast(res.count + " sessões geradas no servidor."); await renderRoute();
          return;
        } catch (e) { toast("Falha a gerar no servidor (" + e.message + ") — a gerar só localmente."); }
      }

      const mesociclos = U.byTurma(await DB.getAll("mesociclos"));
      const existentes = U.byTurma(await DB.getAll("sessoes"));
      const realizadasPorData = new Set(existentes.filter((s) => s.estado === "realizada").map((s) => s.data));
      for (const s of existentes) { if (s.estado !== "realizada" && (s.categoria || "treino") === "treino") await DB.remove("sessoes", s.id); }
      const catalogo = U.byTurma(await DB.getAll("microciclosTipos"));
      const geradas = Season.generateSessions(turma, mesociclos, catalogo);
      const novas = geradas.filter((s) => !realizadasPorData.has(s.data));
      await DB.bulkPutSilent("sessoes", novas.map((s) => Object.assign({ id: DB.uuid() }, s)));
      toast(novas.length + " sessões geradas (localmente)."); await renderRoute();
    },

    // ---------------- Calendário / sessão ----------------
    openSession: (ds) => { location.hash = "#/sessao/" + ds.id; },
    openThread: (ds) => { location.hash = "#/mensagens/" + ds.id; },
    editSession: () => {
      const panel = document.querySelector('[data-tab-panel="plano"]');
      if (panel) panel.scrollIntoView({ behavior: "smooth" });
      const ta = document.getElementById("sess-plano-text");
      if (ta) ta.focus();
    },
    saveSessionPlan: async (ds) => {
      if (!requirePermission("editarPlanos")) return;
      const s = await DB.get("sessoes", ds.id);
      s.mesocicloId = document.getElementById("sess-meso-select").value;
      s.tipo = document.getElementById("sess-tipo-select").value;
      s.planoConteudo = document.getElementById("sess-plano-text").value;
      s.estado = document.getElementById("sess-realizada").checked ? "realizada" : "planeada";
      await DB.put("sessoes", s);
      toast("Sessão atualizada."); await renderRoute();
    },
    saveGroupPlans: async (ds) => {
      if (!requirePermission("editarPlanos")) return;
      const s = await DB.get("sessoes", ds.id);
      s.planosGrupo = s.planosGrupo || {};
      document.querySelectorAll("[data-plano-grupo]").forEach((ta) => { s.planosGrupo[ta.dataset.planoGrupo] = ta.value; });
      await DB.put("sessoes", s);
      toast("Planos por grupo guardados."); await renderRoute();
    },
    addAthletePlan: async (form) => {
      if (!requirePermission("editarPlanos")) return;
      const fd = new FormData(form);
      const s = await DB.get("sessoes", fd.get("sessaoId"));
      s.planosAtleta = s.planosAtleta || {};
      s.planosAtleta[fd.get("atletaId")] = fd.get("texto");
      await DB.put("sessoes", s);
      toast("Nota adicionada."); await renderRoute();
    },
    removeAthletePlan: async (ds) => {
      if (!requirePermission("editarPlanos")) return;
      const s = await DB.get("sessoes", ds.id);
      if (s.planosAtleta) delete s.planosAtleta[ds.athlete];
      await DB.put("sessoes", s);
      toast("Nota removida."); await renderRoute();
    },
    markAttendance: async (ds) => {
      if (!Auth.can("markAttendance")) { toast("Sem permissão para marcar presenças."); return; }
      const presencas = await DB.getAll("presencas");
      const existing = presencas.find((p) => p.sessaoId === ds.session && p.atletaId === ds.athlete);
      if (existing && existing.estado === ds.state) {
        await DB.remove("presencas", existing.id);
      } else {
        await DB.put("presencas", Object.assign({}, existing, {
          id: existing ? existing.id : undefined, tenantId: ctxTenant(),
          sessaoId: ds.session, atletaId: ds.athlete, estado: ds.state,
          marcadoPor: Auth.current.nome,
        }));
      }
      await renderRoute();
    },
    checkinManual: async (ds) => {
      if (!Auth.can("markAttendance")) { toast("Sem permissão."); return; }
      const presencas = await DB.getAll("presencas");
      const existing = presencas.find((p) => p.sessaoId === ds.session && p.atletaId === ds.athlete);
      await DB.put("presencas", Object.assign({}, existing, {
        id: existing ? existing.id : undefined, tenantId: ctxTenant(),
        sessaoId: ds.session, atletaId: ds.athlete, estado: "presente", marcadoPor: Auth.current.nome + " (check-in)",
      }));
      const btn = document.querySelector('[data-action="checkinManual"][data-athlete="' + ds.athlete + '"]');
      if (btn) { btn.textContent = "✓ Feito"; btn.classList.remove("btn-ghost"); btn.classList.add("btn-primary"); }
    },
    checkinScanned: async (ds) => {
      if (!Auth.can("markAttendance")) return;
      const today = U.todayStr();
      const sessoes = U.byTurma(await DB.getAll("sessoes"));
      const sessaoHoje = sessoes.find((s) => s.data === today && s.tipo);
      if (!sessaoHoje) return;
      const atleta = await DB.get("atletas", ds.athlete);
      if (!atleta || atleta.turmaId !== ctxTurma()) { toast("Código não reconhecido nesta turma."); return; }
      const presencas = await DB.getAll("presencas");
      const existing = presencas.find((p) => p.sessaoId === sessaoHoje.id && p.atletaId === ds.athlete);
      if (existing && existing.estado === "presente") { return; }
      await DB.put("presencas", Object.assign({}, existing, {
        id: existing ? existing.id : undefined, tenantId: ctxTenant(),
        sessaoId: sessaoHoje.id, atletaId: ds.athlete, estado: "presente", marcadoPor: Auth.current.nome + " (QR)",
      }));
      toast("✓ " + atleta.nome + " — check-in feito.");
      // atualiza só o botão correspondente, sem recarregar a página (evita reiniciar a câmara)
      const btn = document.querySelector('[data-action="checkinManual"][data-athlete="' + ds.athlete + '"]');
      if (btn) { btn.textContent = "✓ Feito"; btn.classList.remove("btn-ghost"); btn.classList.add("btn-primary"); }
    },

    // ---------------- Comentários (internos, staff) ----------------
    addComment: async (form) => {
      if (Auth.isAtleta()) { toast("Sem permissão."); return; }
      const fd = new FormData(form);
      const texto = (fd.get("texto") || "").trim();
      if (!texto) return;
      await DB.put("comentarios", {
        tenantId: ctxTenant(), targetType: fd.get("targetType"), targetId: fd.get("targetId"),
        autorId: Auth.current.id, autorNome: Auth.current.nome, texto, criadoEm: new Date().toISOString(),
      });
      toast("Comentário adicionado."); await renderRoute();
    },

    // ---------------- Mensagens ----------------
    sendMessage: async (form) => {
      const fd = new FormData(form);
      const texto = (fd.get("texto") || "").trim();
      if (!texto) return;
      const atletaId = fd.get("atletaId") || (Auth.activeMembership && Auth.activeMembership.atletaId);
      await DB.put("mensagens", {
        tenantId: ctxTenant(), turmaId: ctxTurma(), tipo: "privada", atletaId,
        remetenteUserId: Auth.current.id, remetenteNome: Auth.current.nome, remetenteRole: Auth.role(),
        texto, criadoEm: new Date().toISOString(),
      });
      form.reset();
      toast("Mensagem enviada."); await renderRoute();
    },
    sendBroadcast: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const texto = (fd.get("texto") || "").trim();
      if (!texto) return;
      await DB.put("mensagens", {
        tenantId: ctxTenant(), turmaId: ctxTurma(), tipo: "broadcast",
        remetenteUserId: Auth.current.id, remetenteNome: Auth.current.nome, remetenteRole: "manager",
        texto, criadoEm: new Date().toISOString(),
      });
      closeModal(); toast("Aviso enviado a todos os atletas."); await renderRoute();
    },
    openBroadcastModal: () => { if (!requireAdmin()) return; openModal(Views._helpers.broadcastFormHtml()); },

    // ---------------- Dashboard personalizável ----------------
    openDashboardSettings: async () => {
      const widgets = await Views._helpers.getDashboardPrefs();
      openModal(Views._helpers.dashboardSettingsHtml(widgets));
    },
    saveDashboardPrefs: async (form) => {
      const fd = new FormData(form);
      const widgets = Object.keys(Views._helpers.WIDGET_DEFS).filter((k) => fd.get("w_" + k) === "on");
      await Views._helpers.saveDashboardPrefs(widgets);
      closeModal(); toast("Início personalizado."); await renderRoute();
    },

    // ---------------- Convites / membros ----------------
    inviteMember: () => { if (!requireAdmin()) return; openModal(Views._helpers.inviteFormHtml({ tipo: "staff" })); },
    sendInvite: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const email = (fd.get("email") || "").trim().toLowerCase();
      if (!email) return;
      const convite = {
        id: DB.uuid(), email, turmaId: ctxTurma(), tenantId: ctxTenant(),
        role: fd.get("role") || "ajudante", atletaId: fd.get("atletaId") || null,
        estado: "pendente", convidadoPor: Auth.current.nome, criadoEm: new Date().toISOString(),
      };
      await DB.put("convites", convite, { silent: true });
      await DB.queueSync("convites", convite.id, "upsert", convite);
      const existingUser = await Auth.findUserByEmail(email);
      let jaAtivado = false;
      if (existingUser) {
        await DB.put("memberships", { userId: existingUser.id, turmaId: convite.turmaId, tenantId: convite.tenantId, role: convite.role, atletaId: convite.atletaId, estado: "ativo" });
        convite.estado = "aceite";
        await DB.put("convites", convite, { silent: true });
        jaAtivado = true;
      }
      closeModal();
      toast(jaAtivado ? (email + " já tinha conta — acesso ativado de imediato.") : ("Convite registado para " + email + ". Assim que essa pessoa entrar com este email, o acesso fica ativo automaticamente."));
      await renderRoute();
    },
    removeMembership: async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover o acesso desta pessoa a esta turma?")) return;
      await DB.remove("memberships", ds.id);
      toast("Acesso removido."); await renderRoute();
    },

    // ---------------- Eventos extra / provas / exibições ----------------
    newEvento: () => { if (!requirePermission("editarCalendario")) return; openModal(Views._helpers.eventoFormHtml()); },
    saveEvento: async (form) => {
      if (!requirePermission("editarCalendario")) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const existing = id ? await DB.get("sessoes", id) : null;
      const data = fd.get("data");
      const dow = new Date(data + "T00:00:00").getDay();
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(), turmaId: ctxTurma(),
        data, diaSemana: Season.DIA_NOME[dow],
        categoria: fd.get("categoria"), nomeEvento: fd.get("nomeEvento"), hora: fd.get("hora") || "",
        planoConteudo: fd.get("planoConteudo") || "", tipo: existing ? existing.tipo : null,
        estado: (existing && existing.estado) || "planeada",
      });
      await DB.put("sessoes", record);
      closeModal(); toast("Evento guardado."); location.hash = "#/calendario"; await renderRoute();
    },
    deleteEvento: async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover este evento?")) return;
      await DB.remove("sessoes", ds.id);
      toast("Evento removido."); location.hash = "#/calendario"; await renderRoute();
    },

    saveObjetivoProprio: async (form) => {
      if (!Auth.isAtleta() || !Auth.activeMembership.atletaId) { toast("Sem permissão."); return; }
      const fd = new FormData(form);
      const atleta = await DB.get("atletas", Auth.activeMembership.atletaId);
      atleta.objetivosProprios = fd.get("objetivosProprios") || "";
      await DB.put("atletas", atleta);
      if (Auth.onlineMode && global.Api && Api.isConfigured() && Api.token) {
        Api.updateMeuObjetivo(atleta.objetivosProprios).catch(() => {});
      }
      toast("Objetivo guardado."); await renderRoute();
    },

    saveMeuPerfil: async (form) => {
      const fd = new FormData(form);
      const user = await DB.get("users", Auth.current.id);
      user.nome = fd.get("nome") || user.nome;
      user.dataNascimento = fd.get("dataNascimento") || null;
      await DB.put("users", user);
      Auth.current = user;
      if (Auth.onlineMode && global.Api && Api.isConfigured() && Api.token) {
        Api.updateMe({ nome: user.nome, dataNascimento: user.dataNascimento }).catch(() => {});
      }
      toast("Perfil atualizado."); await U.renderShell();
    },

    // ---------------- Avaliações ----------------
    newAvaliacao: async (ds) => {
      if (!Auth.can("comment")) { toast("Sem permissão."); return; }
      const [atleta, mesociclos, habilidadesNomes, criterios] = await Promise.all([
        DB.get("atletas", ds.atleta), DB.getAll("mesociclos"), U.getHabilidadesNomes(), U.getCriteriosAvaliacao(),
      ]);
      openModal(Views._helpers.avaliacaoFormHtml(atleta, U.byTurma(mesociclos), ds.meso || null, habilidadesNomes, criterios));
      Views._helpers.afterAvaliacaoForm();
    },
    saveAvaliacao: async (form) => {
      if (!Auth.can("comment")) { toast("Sem permissão."); return; }
      const fd = new FormData(form);
      const atleta = await DB.get("atletas", fd.get("atletaId"));
      const [habilidadesNomes, criterios] = await Promise.all([U.getHabilidadesNomes(), U.getCriteriosAvaliacao()]);
      const snapshotHabilidades = {};
      habilidadesNomes.forEach((h, i) => { snapshotHabilidades[h] = parseInt(fd.get("fase_" + i), 10) || 1; });
      const snapshotCriterios = {};
      criterios.forEach((c) => { snapshotCriterios[c.nome] = parseInt(fd.get("criterio_" + c.id), 10) || 1; });
      const tipo = fd.get("tipo");
      await DB.put("avaliacoes", {
        tenantId: ctxTenant(), turmaId: ctxTurma(), atletaId: atleta.id,
        tipo, mesocicloId: tipo === "mesociclo" ? fd.get("mesocicloId") : null,
        data: fd.get("data"), observacoesGerais: fd.get("observacoesGerais") || "",
        snapshotHabilidades, snapshotCriterios, autorId: Auth.current.id, autorNome: Auth.current.nome,
        criadoEm: new Date().toISOString(),
      });
      closeModal(); toast("Avaliação guardada."); await renderRoute();
    },
    deleteAvaliacao: async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover esta avaliação?")) return;
      await DB.remove("avaliacoes", ds.id);
      toast("Avaliação removida."); await renderRoute();
    },

    downloadMesoMicroTemplate: () => {
      const wb = XLSX.utils.book_new();
      const wsMicro = XLSX.utils.aoa_to_sheet([
        ["Nome", "Plano Genérico"],
        ["Trampolim", "Aquecimento, saltos base, progressões de mortal."],
      ]);
      wsMicro["!cols"] = [{ wch: 24 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsMicro, "Microciclos");

      const wsMeso = XLSX.utils.aoa_to_sheet([
        ["Nome", "Data Início (AAAA-MM-DD)", "Data Fim (AAAA-MM-DD)", "Objetivo"],
        ["M1 - Fundação", "2026-09-01", "2026-10-31", "Diagnóstico e formação de grupos."],
      ]);
      wsMeso["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsMeso, "Mesociclos");

      const wsPlanos = XLSX.utils.aoa_to_sheet([
        ["Mesociclo", "Microciclo", "Plano (substitui o genérico só neste mesociclo)"],
        ["M1 - Fundação", "Trampolim", "Aquecimento, Trampolim, Alongamentos"],
      ]);
      wsPlanos["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsPlanos, "Planos por Mesociclo");

      XLSX.writeFile(wb, "modelo-mesociclos-microciclos.xlsx");
    },
    importMesoMicroFile: async (file) => {
      if (!requireAdmin()) return;
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        let nMicro = 0, nMeso = 0, nPlanos = 0;

        if (wb.Sheets["Microciclos"]) {
          const catalogoAtual = U.byTurma(await DB.getAll("microciclosTipos"));
          const rows = XLSX.utils.sheet_to_json(wb.Sheets["Microciclos"], { defval: "" });
          for (const row of rows) {
            const nome = (row["Nome"] || "").toString().trim();
            if (!nome) continue;
            const existente = catalogoAtual.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
            await DB.put("microciclosTipos", {
              id: existente ? existente.id : undefined, tenantId: ctxTenant(), turmaId: ctxTurma(),
              nome, planoGenerico: (row["Plano Genérico"] || "").toString(),
              cor: (existente && existente.cor) || Season.corParaNome(nome, catalogoAtual),
              ordem: (existente && existente.ordem) || catalogoAtual.length + nMicro + 1,
            });
            nMicro++;
          }
        }

        const mesociclosAtuais = U.byTurma(await DB.getAll("mesociclos"));
        if (wb.Sheets["Mesociclos"]) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets["Mesociclos"], { defval: "" });
          for (const row of rows) {
            const nome = (row["Nome"] || "").toString().trim();
            const dataInicio = (row["Data Início (AAAA-MM-DD)"] || row["Data Início"] || "").toString().trim();
            const dataFim = (row["Data Fim (AAAA-MM-DD)"] || row["Data Fim"] || "").toString().trim();
            if (!nome || !dataInicio || !dataFim) continue;
            const existente = mesociclosAtuais.find((m) => m.nome.toLowerCase() === nome.toLowerCase());
            await DB.put("mesociclos", {
              id: existente ? existente.id : undefined, tenantId: ctxTenant(), turmaId: ctxTurma(),
              nome, dataInicio, dataFim, objetivo: (row["Objetivo"] || "").toString(),
              planosPorMicrociclo: (existente && existente.planosPorMicrociclo) || {},
            });
            nMeso++;
          }
        }

        if (wb.Sheets["Planos por Mesociclo"]) {
          const mesosAtualizados = U.byTurma(await DB.getAll("mesociclos"));
          const rows = XLSX.utils.sheet_to_json(wb.Sheets["Planos por Mesociclo"], { defval: "" });
          for (const row of rows) {
            const mesoNome = (row["Mesociclo"] || "").toString().trim();
            const microNome = (row["Microciclo"] || "").toString().trim();
            const plano = (row["Plano (substitui o genérico só neste mesociclo)"] || row["Plano"] || "").toString();
            if (!mesoNome || !microNome || !plano) continue;
            const meso = mesosAtualizados.find((m) => m.nome.toLowerCase() === mesoNome.toLowerCase());
            if (!meso) continue;
            meso.planosPorMicrociclo = meso.planosPorMicrociclo || {};
            meso.planosPorMicrociclo[microNome] = plano;
            await DB.put("mesociclos", meso);
            nPlanos++;
          }
        }

        toast(`Importado: ${nMicro} microciclo(s), ${nMeso} mesociclo(s), ${nPlanos} plano(s) específico(s).`);
        await renderRoute();
      } catch (e) {
        toast("Não foi possível ler o ficheiro (" + e.message + ").");
      }
    },

    // ---------------- Importação/exportação Excel de atletas ----------------
    downloadAthleteTemplate: () => {
      const headers = ["Nome", "Data de Nascimento (AAAA-MM-DD)", "Grupo", "Encarregado de Educação", "Contacto", "Notas Médicas", "Autorizado Imagem (Sim/Não)"];
      const exemplo = ["Maria Exemplo", "2018-05-20", "Grupo 1 - Fundação", "Encarregado de Educação de Maria", "912345678", "", "Sim"];
      const ws = XLSX.utils.aoa_to_sheet([headers, exemplo]);
      ws["!cols"] = headers.map(() => ({ wch: 22 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Atletas");
      XLSX.writeFile(wb, "modelo-atletas.xlsx");
    },
    importAthletesFile: async (file) => {
      if (!requireAdmin()) return;
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const grupos = U.byTurma(await DB.getAll("grupos"));
        const grupoPorNome = Object.fromEntries(grupos.map((g) => [g.nome.trim().toLowerCase(), g.id]));
        const habilidadesNomes = await U.getHabilidadesNomes();
        let importados = 0, ignorados = 0;
        for (const row of rows) {
          const nome = (row["Nome"] || "").toString().trim();
          if (!nome) { ignorados++; continue; }
          const grupoNome = (row["Grupo"] || "").toString().trim().toLowerCase();
          const autorizado = /^s/i.test((row["Autorizado Imagem (Sim/Não)"] || row["Autorizado Imagem"] || "").toString());
          await DB.put("atletas", {
            tenantId: ctxTenant(), turmaId: ctxTurma(),
            nome, dataNascimento: (row["Data de Nascimento (AAAA-MM-DD)"] || row["Data de Nascimento"] || "").toString().trim() || null,
            grupoId: grupoPorNome[grupoNome] || null,
            encarregado: (row["Encarregado de Educação"] || "").toString(),
            contacto: (row["Contacto"] || "").toString(),
            notasMedicas: (row["Notas Médicas"] || "").toString(),
            autorizacaoImagem: autorizado, ativo: true, foto: null,
            habilidades: habilidadesNomes.reduce((acc, h) => { acc[h] = 1; return acc; }, {}),
          });
          importados++;
        }
        toast(importados + " atleta(s) importado(s)" + (ignorados ? ", " + ignorados + " ignorada(s) sem nome" : "") + ".");
        await renderRoute();
      } catch (e) {
        toast("Não foi possível ler o ficheiro (" + e.message + ").");
      }
    },

    editPermissoesAjudante: async (ds) => {
      if (!requireAdmin()) return;
      const memberships = await DB.getAll("memberships");
      const m = memberships.find((x) => x.id === ds.id);
      if (!m) return;
      openModal(Views._helpers.permissoesFormHtml(m, ds.nome));
    },
    savePermissoesAjudante: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const memberships = await DB.getAll("memberships");
      const m = memberships.find((x) => x.id === fd.get("id"));
      if (!m) return;
      const perms = ["editarAtletas", "editarPlanos", "editarCalendario"].filter((k) => fd.get("perm_" + k) === "on");
      m.permissoesExtra = perms;
      await DB.put("memberships", m);
      if (Auth.onlineMode && global.Api && Api.isConfigured() && Api.token) {
        Api.request("PUT", "/api/memberships/" + m.id + "/permissoes", { permissoesExtra: perms }).catch(() => {});
      }
      closeModal(); toast("Permissões guardadas."); await renderRoute();
    },

    saveNotifPrefs: async (form) => {
      const fd = new FormData(form);
      const notifPrefs = {
        treinos: fd.get("notif_treinos") === "on",
        aniversarios: fd.get("notif_aniversarios") === "on",
        avaliacoes: fd.get("notif_avaliacoes") === "on",
        resumo: fd.get("notif_resumo") === "on",
      };
      const existing = await DB.get("preferencias", Auth.current.id);
      await DB.put("preferencias", Object.assign({}, existing, { id: Auth.current.id, userId: Auth.current.id, notifPrefs }));
      if (Auth.onlineMode && global.Api && Api.isConfigured() && Api.token) {
        Api.request("PUT", "/api/preferencias/me", { notifPrefs }).catch(() => {});
      }
      toast("Preferências guardadas."); await renderRoute();
    },

    // ---------------- Definições ----------------
    enableNotifications: async () => {
      if (!("Notification" in window)) { toast("Este navegador não suporta notificações."); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Permissão não concedida."); await renderRoute(); return; }
      toast("Notificações ativadas neste dispositivo.");
      await renderRoute();
    },
    testNotification: async () => {
      if (!("Notification" in window) || Notification.permission !== "granted") { toast("Ativa as notificações primeiro."); return; }
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const opts = { body: "Notificação de teste — está a funcionar! 🎉", icon: "icons/icon-192.png" };
      if (reg) reg.showNotification("Gimna", opts);
      else new Notification("Gimna", opts);
    },
    forceSync: async () => {
      const res = await DB.trySync();
      if (!res.ok) toast("Sem ligação à internet.");
      else toast(res.count ? (res.count + " alteração(ões) sincronizada(s).") : "Já estava tudo sincronizado.");
      await renderRoute();
    },
    exportData: async () => {
      const stores = ["tenants", "users", "memberships", "convites", "turmas", "grupos", "atletas", "mesociclos", "sessoes", "presencas", "comentarios", "mensagens"];
      const dump = {};
      for (const s of stores) dump[s] = await DB.getAll(s);
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "animakids-backup-" + U.todayStr() + ".json";
      a.click();
      toast("Ficheiro de backup gerado.");
    },
    resetDemo: async () => {
      if (!confirm("Isto apaga TODOS os dados guardados neste dispositivo e recria os dados de demonstração. Continuar?")) return;
      indexedDB.deleteDatabase("gimna-db");
      localStorage.clear();
      location.hash = "#/dashboard";
      location.reload();
    },

    // ---------------- Primeira turma (novo gestor sem turma) ----------------
    newTurmaFirstRun: () => {
      openModal(`
        <div class="modal-head"><h3>Criar a tua primeira turma</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
        <form data-form="createFirstTurma">
          <div class="field"><label>Nome do ginásio/estúdio</label><input name="tenantNome" required placeholder="Ex.: Ginásio ABC"></div>
          <div class="field"><label>Nome da turma</label><input name="turmaNome" required placeholder="Ex.: Iniciação"></div>
          <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Criar</button></div>
        </form>`);
    },
    createFirstTurma: async (form) => {
      const fd = new FormData(form);
      const tenantNome = fd.get("tenantNome"), turmaNome = fd.get("turmaNome");
      let tenantId, turmaId;

      if (Auth.onlineMode && global.Api && Api.isConfigured() && Api.token) {
        try {
          const res = await Api.createTurmaPrimeira(tenantNome, turmaNome);
          tenantId = res.tenantId; turmaId = res.turmaId;
        } catch (e) {
          toast("Não foi possível criar no servidor (" + e.message + ") — a guardar só localmente."); 
        }
      }
      if (!turmaId) { tenantId = DB.uuid(); turmaId = DB.uuid(); }

      await DB.put("tenants", { id: tenantId, nome: tenantNome, plano: "Trial", criadoEm: new Date().toISOString(), limiteAtletas: 30 }, { silent: true });
      await DB.put("turmas", { id: turmaId, tenantId, nome: turmaNome, descricao: "", dias: "", horario: "" }, { silent: true });
      await DB.put("memberships", { id: DB.uuid(), userId: Auth.current.id, turmaId, tenantId, role: "manager", estado: "ativo" }, { silent: true });
      await Auth._loadSession(Auth.current);
      const nova = Auth.memberships.find((m) => m.turmaId === turmaId);
      if (nova) await Auth.setActiveMembership(nova.id);
      closeModal(); toast("Turma criada!"); await U.renderShell();
    },
  };

  function makeCatalogActions(store, tipoKey, prefix, extra) {
    extra = extra || {};
    const out = {};
    out["new" + prefix] = () => { if (!requireAdmin()) return; openModal(Views._helpers.catalogoFormHtml(tipoKey, null)); };
    out["edit" + prefix] = async (ds) => { if (!requireAdmin()) return; openModal(Views._helpers.catalogoFormHtml(tipoKey, await DB.get(store, ds.id))); };
    out["delete" + prefix] = async (ds) => {
      if (!requireAdmin()) return;
      if (!confirm("Remover este item?")) return;
      await DB.remove(store, ds.id);
      toast("Removido."); await renderRoute();
    };
    out["save" + prefix] = async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const existing = id ? await DB.get(store, id) : null;
      const base = { id, tenantId: ctxTenant(), turmaId: ctxTurma(), nome: fd.get("nome"), ordem: (existing && existing.ordem) || 99 };
      const record = Object.assign({}, existing, base, extra.buildExtra ? extra.buildExtra(fd) : {});
      await DB.put(store, record);
      closeModal(); toast("Guardado."); await renderRoute();
    };
    return out;
  }

  Object.assign(Actions,
    makeCatalogActions("habilidadesTipos", "habilidade", "Habilidade"),
    makeCatalogActions("estadosPresenca", "estadoPresenca", "EstadoPresenca", {
      buildExtra: (fd) => ({ valor: (fd.get("nome") || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_"), cor: fd.get("cor") || "c1", contaComoPresenca: fd.get("contaComoPresenca") === "on" }),
    }),
    makeCatalogActions("criteriosAvaliacao", "criterio", "Criterio"),
    makeCatalogActions("camposPersonalizados", "campoPersonalizado", "CampoPersonalizado", {
      buildExtra: (fd) => ({ tipo: fd.get("tipo") || "texto" }),
    })
  );

  Actions.reordenarCatalogo = async (idPrefix, novaOrdemIds) => {
    if (!requireAdmin()) return;
    const storeMap = {
      "habilidades-tipos": "habilidadesTipos", "estados-presenca": "estadosPresenca",
      "criterios-avaliacao": "criteriosAvaliacao", "campos-personalizados": "camposPersonalizados",
      "microciclos-catalogo": "microciclosTipos", "grupos": "grupos",
    };
    const store = storeMap[idPrefix];
    if (!store) return;
    for (let i = 0; i < novaOrdemIds.length; i++) {
      const item = await DB.get(store, novaOrdemIds[i]);
      if (item && item.ordem !== i + 1) { item.ordem = i + 1; await DB.put(store, item); }
    }
  };

  Actions.saveMarca = async (form) => {
    if (!requireAdmin()) return;
    const fd = new FormData(form);
    const turma = await DB.get("turmas", ctxTurma());
    turma.corPrimaria = fd.get("corPrimaria");
    turma.corAccent = fd.get("corAccent");
    await DB.put("turmas", turma);
    toast("Marca guardada."); await U.renderShell();
  };
  Actions.resetMarca = async () => {
    if (!requireAdmin()) return;
    const turma = await DB.get("turmas", ctxTurma());
    turma.corPrimaria = null; turma.corAccent = null;
    await DB.put("turmas", turma);
    toast("Cores repostas."); await U.renderShell();
  };
  Actions.saveResumoPeriodicidade = async (form) => {
    if (!requireAdmin()) return;
    const fd = new FormData(form);
    const turma = await DB.get("turmas", ctxTurma());
    turma.resumoPeriodicidade = fd.get("resumoPeriodicidade");
    await DB.put("turmas", turma);
    toast("Preferência guardada."); await renderRoute();
  };

  global.Actions = Actions;
})(window);
