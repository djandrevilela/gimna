/* =========================================================
   AnimaKids — ações (handlers de botões e formulários)
   ========================================================= */
(function (global) {
  "use strict";
  const { toast, openModal, closeModal, triggerInstall, renderRoute } = U;

  function requireAdmin() {
    if (!Auth.isAdmin()) { toast("Só o gestor pode fazer isto."); return false; }
    return true;
  }
  function ctxTenant() { return Auth.activeMembership ? Auth.activeMembership.tenantId : null; }
  function ctxTurma() { return Auth.activeMembership ? Auth.activeMembership.turmaId : null; }

  const Actions = {
    installApp: () => triggerInstall(),
    closeModal: () => closeModal(),

    // ---------------- Atletas ----------------
    openAthlete: (ds) => { location.hash = "#/atletas/" + ds.id; },
    newAthlete: async () => {
      if (!requireAdmin()) return;
      const [turmas, grupos] = await Promise.all([DB.getAll("turmas"), DB.getAll("grupos")]);
      openModal(Views._helpers.athleteFormHtml(null, U.byTenant(turmas), U.byTurma(grupos)));
    },
    editAthlete: async (ds) => {
      if (!requireAdmin()) return;
      const [atleta, turmas, grupos] = await Promise.all([DB.get("atletas", ds.id), DB.getAll("turmas"), DB.getAll("grupos")]);
      openModal(Views._helpers.athleteFormHtml(atleta, U.byTenant(turmas), U.byTurma(grupos)));
    },
    saveAthlete: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const id = fd.get("id") || undefined;
      const existing = id ? await DB.get("atletas", id) : null;
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(),
        nome: fd.get("nome"), dataNascimento: fd.get("dataNascimento"),
        turmaId: fd.get("turmaId"), grupoId: fd.get("grupoId") || null,
        encarregado: fd.get("encarregado"), contacto: fd.get("contacto"),
        notasMedicas: fd.get("notasMedicas"), ativo: fd.get("ativo") === "on",
        habilidades: (existing && existing.habilidades) || Seed.HABILIDADES.reduce((acc, h) => { acc[h] = 1; return acc; }, {}),
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
      if (!requireAdmin()) return;
      openModal(Views._helpers.groupFormHtml(null, U.byTenant(await DB.getAll("turmas"))));
    },
    editGroup: async (ds) => {
      if (!requireAdmin()) return;
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
      if (!requireAdmin()) return;
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
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(), nome: fd.get("nome"), descricao: fd.get("descricao"),
        dias: fd.get("dias"), horario: fd.get("horario"),
      });
      const saved = await DB.put("turmas", record);
      if (isNew) {
        await DB.put("memberships", { userId: Auth.current.id, turmaId: saved.id, tenantId: ctxTenant(), role: "manager", estado: "ativo" });
        await Auth._loadSession(Auth.current);
        const nova = Auth.memberships.find((m) => m.turmaId === saved.id);
        if (nova) await Auth.setActiveMembership(nova.id);
      }
      closeModal(); toast("Turma guardada."); await U.renderShell();
    },

    // ---------------- Mesociclos / microciclo ----------------
    newMeso: async () => { if (!requireAdmin()) return; openModal(Views._helpers.mesoFormHtml(null)); },
    editMeso: async (ds) => { if (!requireAdmin()) return; openModal(Views._helpers.mesoFormHtml(await DB.get("mesociclos", ds.id))); },
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
      const record = Object.assign({}, existing, {
        id, tenantId: ctxTenant(), turmaId: (existing && existing.turmaId) || turmaId,
        nome: fd.get("nome"), dataInicio: fd.get("dataInicio"), dataFim: fd.get("dataFim"), objetivo: fd.get("objetivo"),
      });
      await DB.put("mesociclos", record);
      closeModal(); toast("Mesociclo guardado."); await renderRoute();
    },
    saveMicrociclo: async (form) => {
      if (!requireAdmin()) return;
      const fd = new FormData(form);
      const turma = await DB.get("turmas", ctxTurma());
      const pattern = {};
      [1, 2, 3, 0].forEach((w) => { pattern[w] = { 3: fd.get("w" + w + "_3"), 5: fd.get("w" + w + "_5") }; });
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
      if (!requireAdmin()) return;
      const s = await DB.get("sessoes", ds.id);
      s.mesocicloId = document.getElementById("sess-meso-select").value;
      s.tipo = document.getElementById("sess-tipo-select").value;
      s.planoConteudo = document.getElementById("sess-plano-text").value;
      s.estado = document.getElementById("sess-realizada").checked ? "realizada" : "planeada";
      await DB.put("sessoes", s);
      toast("Sessão atualizada."); await renderRoute();
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

    // ---------------- Definições ----------------
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
      indexedDB.deleteDatabase("animakids-db");
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
          <div class="field"><label>Nome da turma</label><input name="turmaNome" required placeholder="Ex.: AnimaKids"></div>
          <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Criar</button></div>
        </form>`);
    },
    createFirstTurma: async (form) => {
      const fd = new FormData(form);
      const tenantId = DB.uuid();
      await DB.put("tenants", { id: tenantId, nome: fd.get("tenantNome"), plano: "Trial", criadoEm: new Date().toISOString(), limiteAtletas: 30 });
      const turmaId = DB.uuid();
      await DB.put("turmas", { id: turmaId, tenantId, nome: fd.get("turmaNome"), descricao: "", dias: "", horario: "" });
      await DB.put("memberships", { userId: Auth.current.id, turmaId, tenantId, role: "manager", estado: "ativo" });
      await Auth._loadSession(Auth.current);
      const nova = Auth.memberships.find((m) => m.turmaId === turmaId);
      if (nova) await Auth.setActiveMembership(nova.id);
      closeModal(); toast("Turma criada!"); await U.renderShell();
    },
  };

  global.Actions = Actions;
})(window);
