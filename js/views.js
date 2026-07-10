/* =========================================================
   Gimna — vistas (parte 1: dashboard, atletas, grupos, turmas, mesociclos)
   ========================================================= */
(function (global) {
  "use strict";
  const { esc, calcAge, fmtDateShort, fmtDateTime, todayStr, tipoClass, grupoClass, initials } = U;

  async function currentTurmaId() {
    return Auth.activeMembership ? Auth.activeMembership.turmaId : null;
  }

  // ---------------------------------------------------------------
  // Dashboard — widgets personalizáveis por utilizador
  // ---------------------------------------------------------------
  const WIDGET_DEFS = {
    statCards: { label: "Estatísticas rápidas", wide: true, render: renderWidgetStatCards },
    proximaSessao: { label: "Próximo treino", render: renderWidgetProximaSessao },
    calendarioMini: { label: "Próximas sessões", render: renderWidgetCalendarioMini },
    presencaUltima: { label: "Última sessão — presenças", render: renderWidgetPresencaUltima },
    seguimento: { label: "Atletas a acompanhar", render: renderWidgetSeguimento },
    progressoGrupos: { label: "Progressão média por grupo", render: renderWidgetProgressoGrupos },
    aniversarios: { label: "Aniversários próximos", render: renderWidgetAniversarios },
    avaliacoesPendentes: { label: "Avaliações pendentes", render: renderWidgetAvaliacoesPendentes },
    comentarios: { label: "Comentários recentes", render: renderWidgetComentarios },
  };
  const DEFAULT_WIDGETS_ADMIN = ["statCards", "proximaSessao", "seguimento", "avaliacoesPendentes", "calendarioMini", "progressoGrupos", "aniversarios", "comentarios"];
  const DEFAULT_WIDGETS_USER = ["proximaSessao", "statCards", "presencaUltima", "comentarios"];

  async function getDashboardPrefs() {
    const pref = await DB.get("preferencias", Auth.current.id);
    if (pref && pref.widgets && pref.widgets.length) return pref.widgets;
    return (Auth.isAdmin() ? DEFAULT_WIDGETS_ADMIN : DEFAULT_WIDGETS_USER).slice();
  }
  async function saveDashboardPrefs(widgets) {
    await DB.put("preferencias", { id: Auth.current.id, userId: Auth.current.id, widgets });
  }

  function renderWidgetStatCards(data) {
    const ativos = data.atletas.filter((a) => a.ativo);
    const today = todayStr();
    const futuras = data.sessoes.filter((s) => s.data >= today && s.tipo);
    const realizadas = data.sessoes.filter((s) => s.estado === "realizada" || (s.data < today && s.tipo));
    const att = Stats.attendanceBreakdown(data.presencas, data.estadosPresenca);
    return `
      <div class="grid cols-4">
        <div class="card stat-card"><div class="v">${ativos.length}</div><div class="l">Atletas ativos</div></div>
        <div class="card stat-card"><div class="v">${realizadas.length}</div><div class="l">Sessões realizadas</div></div>
        <div class="card stat-card"><div class="v">${att.pctPresente !== null ? att.pctPresente + "%" : "—"}</div><div class="l">Taxa média de presença</div></div>
        <div class="card stat-card"><div class="v">${futuras.length}</div><div class="l">Sessões por realizar</div></div>
      </div>`;
  }
  function renderWidgetProximaSessao(data) {
    const today = todayStr();
    const futuras = data.sessoes.filter((s) => s.data >= today && s.tipo).sort((a, b) => a.data.localeCompare(b.data));
    const proxima = futuras[0];
    return `<div class="card">
      <div class="eyebrow">Próximo treino</div>
      ${proxima ? `
        <h3 style="margin:6px 0 10px;">${fmtDateShort(proxima.data)} · ${proxima.diaSemana}</h3>
        <span class="chip ${tipoClass(proxima.tipo)}">${esc(proxima.tipo)}</span>
        <p style="margin-top:12px;"><a class="btn btn-primary btn-sm" href="#/sessao/${proxima.id}">Abrir sessão →</a></p>
      ` : `<p>Sem sessões futuras agendadas.</p>`}
    </div>`;
  }
  function renderWidgetCalendarioMini(data) {
    const today = todayStr();
    const futuras = data.sessoes.filter((s) => s.data >= today && s.tipo).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5);
    return `<div class="card">
      <div class="eyebrow">Próximas sessões</div>
      ${futuras.length ? futuras.map((s) => `
        <div class="list-row" data-action="openSession" data-id="${s.id}">
          <div style="width:48px; flex-shrink:0;"><div style="font-weight:700;">${s.data.slice(8, 10)}</div><div style="font-size:.68rem;color:var(--ink-soft);">${U.MESES[parseInt(s.data.slice(5, 7), 10) - 1]}</div></div>
          <div style="flex:1;"><span class="chip ${tipoClass(s.tipo)}">${esc(s.tipo)}</span></div>
        </div>`).join("") : `<p style="color:var(--ink-soft)">Sem sessões agendadas.</p>`}
      <p style="margin-top:10px;"><a href="#/calendario" style="font-size:.82rem;">Ver calendário completo →</a></p>
    </div>`;
  }
  function renderWidgetPresencaUltima(data) {
    const today = todayStr();
    const passadas = data.sessoes.filter((s) => s.tipo && (s.estado === "realizada" || s.data < today)).sort((a, b) => b.data.localeCompare(a.data));
    const ultima = passadas[0];
    if (!ultima) return `<div class="card"><div class="eyebrow">Última sessão</div><p style="color:var(--ink-soft)">Ainda sem sessões realizadas.</p></div>`;
    const meus = data.presencas.filter((p) => p.sessaoId === ultima.id);
    const c = { presente: 0, falta: 0, falta_justificada: 0, doenca: 0 };
    meus.forEach((p) => { if (c[p.estado] !== undefined) c[p.estado]++; });
    return `<div class="card">
      <div class="eyebrow">Última sessão · ${fmtDateShort(ultima.data)}</div>
      <span class="chip ${tipoClass(ultima.tipo)}" style="margin:6px 0 10px; display:inline-block;">${esc(ultima.tipo)}</span>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:2px; font-size:.84rem;">
        <span style="color:var(--success); font-weight:700;">${c.presente} presentes</span>
        <span style="color:var(--danger); font-weight:700;">${c.falta} faltas</span>
        <span style="color:var(--warn); font-weight:700;">${c.falta_justificada} justif.</span>
        <span style="color:var(--info); font-weight:700;">${c.doenca} doença</span>
      </div>
      <p style="margin-top:10px;"><a class="btn btn-ghost btn-sm" href="#/sessao/${ultima.id}">Ver detalhe →</a></p>
    </div>`;
  }
  function renderWidgetSeguimento(data) {
    const list = Stats.followUpList(data.atletas, data.sessoes, data.presencas, { lastN: 5, minFaltas: 2 });
    return `<div class="card">
      <div class="eyebrow">Atletas a acompanhar</div>
      <p style="font-size:.78rem; color:var(--ink-soft); margin-top:4px;">2+ faltas (não justificadas) nas últimas 5 sessões.</p>
      ${list.length ? list.slice(0, 6).map((x) => `
        <div class="list-row" data-action="openAthlete" data-id="${x.atleta.id}">
          ${U.avatarHtml(x.atleta.nome, x.atleta.foto)}
          <div style="flex:1;"><div class="primary-text">${esc(x.atleta.nome)}</div></div>
          <span class="chip" style="background:var(--danger-tint); color:var(--danger);">${x.faltas} falta(s)</span>
        </div>`).join("") : `<p style="color:var(--ink-soft)">Sem alertas de momento 🎉</p>`}
    </div>`;
  }
  function renderWidgetProgressoGrupos(data) {
    const habs = data.habilidadesNomes;
    const rows = Stats.groupSkillAverages(data.atletas, data.grupos, habs);
    return `<div class="card">
      <div class="eyebrow">Progressão média por grupo</div>
      ${rows.map((r) => {
        const overall = r.avgPerSkill.reduce((s, x) => s + x.media, 0) / (r.avgPerSkill.length || 1);
        const pctBar = Math.round(((overall - 1) / 4) * 100);
        return `<div style="margin:12px 0;">
          <div style="display:flex; justify-content:space-between; font-size:.82rem;"><strong>${esc(r.grupo.nome)}</strong><span style="color:var(--ink-soft)">${overall.toFixed(1)}/5</span></div>
          <div class="progress-bar"><div style="width:${pctBar}%;"></div></div>
        </div>`;
      }).join("") || `<p style="color:var(--ink-soft)">Sem grupos.</p>`}
    </div>`;
  }
  function renderWidgetAniversarios(data) {
    const list = Stats.upcomingBirthdays(data.atletas, 30);
    return `<div class="card">
      <div class="eyebrow">Aniversários próximos (30 dias)</div>
      ${list.length ? list.map((x) => `
        <div class="list-row" data-action="openAthlete" data-id="${x.atleta.id}">
          ${U.avatarHtml(x.atleta.nome, x.atleta.foto)}
          <div style="flex:1;"><div class="primary-text">${esc(x.atleta.nome)}</div><div class="secondary-text">${x.diffDays === 0 ? "Hoje!" : "Daqui a " + x.diffDays + " dia(s)"}</div></div>
        </div>`).join("") : `<p style="color:var(--ink-soft)">Sem aniversários nos próximos 30 dias.</p>`}
    </div>`;
  }
  function renderWidgetAvaliacoesPendentes(data) {
    const today = U.todayStr();
    const mesosTerminados = data.mesociclos.filter((m) => m.dataFim < today);
    const avaliadosPorMeso = {};
    data.avaliacoes.filter((av) => av.tipo === "mesociclo").forEach((av) => {
      avaliadosPorMeso[av.mesocicloId] = avaliadosPorMeso[av.mesocicloId] || new Set();
      avaliadosPorMeso[av.mesocicloId].add(av.atletaId);
    });
    const linhas = [];
    mesosTerminados.forEach((m) => {
      const avaliados = avaliadosPorMeso[m.id] || new Set();
      const faltam = data.atletas.filter((a) => a.ativo && !avaliados.has(a.id));
      if (faltam.length) linhas.push({ meso: m, faltam });
    });
    return `<div class="card">
      <div class="eyebrow">Avaliações pendentes</div>
      ${linhas.length ? linhas.map((l) => `
        <div style="padding:6px 0; border-bottom:1px solid var(--line);">
          <div class="primary-text">${esc(l.meso.nome)}</div>
          <div class="secondary-text">${l.faltam.length} atleta(s) sem avaliação de fim de mesociclo</div>
        </div>`).join("") : `<p style="color:var(--ink-soft)">Tudo avaliado — sem pendências 🎉</p>`}
    </div>`;
  }
  function renderWidgetComentarios(data) {
    const recent = data.comentarios.slice().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 5);
    return `<div class="card">
      <div class="eyebrow">Comentários recentes</div>
      ${recent.length ? recent.map((c) => `
        <div style="padding:8px 0; border-bottom:1px solid var(--line);">
          <div style="font-size:.8rem;"><strong>${esc(c.autorNome)}</strong> <span style="color:var(--ink-soft)">· ${fmtDateTime(c.criadoEm)}</span></div>
          <div style="font-size:.86rem;">${esc(c.texto)}</div>
        </div>`).join("") : `<p style="color:var(--ink-soft)">Ainda sem comentários.</p>`}
    </div>`;
  }

  function dashboardSettingsHtml(current) {
    return `
      <div class="modal-head"><h3>Personalizar o meu início</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <p style="font-size:.84rem; color:var(--ink-soft); margin-bottom:10px;">Escolhe o que queres ver na tua página de início. Cada utilizador tem a sua própria configuração.</p>
      <form data-form="saveDashboardPrefs">
        ${Object.entries(WIDGET_DEFS).map(([key, def]) => `
          <label style="display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); font-size:.9rem;">
            <input type="checkbox" name="w_${key}" ${current.includes(key) ? "checked" : ""} style="width:auto;">
            ${esc(def.label)}
          </label>`).join("")}
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;
  }

  async function dashboard() {
    const widgets = await getDashboardPrefs();
    const data = await Stats.loadAll();

    const installBanner = `
      <div class="install-banner js-install-btn" style="display:none">
        <div style="font-size:1.4rem">📲</div>
        <div class="txt"><strong>Instala o Gimna no teu telemóvel</strong>Acesso rápido e funciona mesmo sem internet no ginásio.</div>
        <button class="btn btn-accent btn-sm" data-action="installApp">Instalar</button>
      </div>`;

    const widgetHtmls = widgets.map((key) => {
      const def = WIDGET_DEFS[key];
      if (!def) return "";
      let html = "";
      try { html = def.render(data); } catch (e) { console.error(e); html = ""; }
      return `<div class="${def.wide ? "dash-widget-wide" : ""}">${html}</div>`;
    }).join("");

    return `
      ${installBanner}
      <div class="section-title">
        <h2>Olá, ${esc(Auth.current.nome.split(" ")[0])} 👋</h2>
        <button class="btn btn-ghost btn-sm" data-action="openDashboardSettings">⚙ Personalizar</button>
      </div>
      <div class="mat-line"></div>
      <div class="dash-grid">${widgetHtmls}</div>
    `;
  }

  // ---------------------------------------------------------------
  // Atletas — lista
  // ---------------------------------------------------------------
  async function atletasList() {
    const [atletasRaw, gruposRaw, turmas] = await Promise.all([DB.getAll("atletas"), DB.getAll("grupos"), DB.getAll("turmas")]);
    const atletas = U.byTurma(atletasRaw);
    const grupoById = Object.fromEntries(U.byTurma(gruposRaw).map((g) => [g.id, g]));
    const turmaById = Object.fromEntries(turmas.map((t) => [t.id, t]));
    const canEdit = Auth.can("editarAtletas");

    const rows = atletas.sort((a, b) => a.nome.localeCompare(b.nome)).map((a) => {
      const g = grupoById[a.grupoId];
      return `
        <div class="list-row" data-action="openAthlete" data-id="${a.id}">
          ${U.avatarHtml(a.nome, a.foto)}
          <div style="flex:1; min-width:0;">
            <div class="primary-text">${esc(a.nome)} ${a.ativo ? "" : "<span style=\"color:var(--danger); font-size:.75rem;\">(inativo)</span>"}</div>
            <div class="secondary-text">${calcAge(a.dataNascimento)} anos · ${esc(turmaById[a.turmaId] ? turmaById[a.turmaId].nome : "—")}</div>
          </div>
          ${g ? `<span class="chip ${grupoClass(g.ordem)}">${esc(g.nome.split(" - ")[0])}</span>` : ""}
        </div>`;
    }).join("");

    return `
      <div class="section-title">
        <h2>Atletas <span style="color:var(--ink-soft); font-weight:400; font-size:1rem;">(${atletas.length})</span></h2>
        ${canEdit ? `
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-ghost" data-action="downloadAthleteTemplate">⬇ Modelo Excel</button>
            <label class="btn btn-ghost" style="margin:0;">⬆ Importar Excel<input type="file" id="import-atletas-input" accept=".xlsx,.xls" style="display:none;"></label>
            <button class="btn btn-accent" data-action="newAthlete">+ Novo atleta</button>
          </div>` : ""}
      </div>
      <div class="mat-line"></div>
      <div class="field" style="max-width:340px;"><input type="search" id="athlete-search" placeholder="Procurar por nome…"></div>
      <div class="card" id="athlete-list-card">${rows || `<div class="empty-state"><div class="ico">🤸</div><p>Ainda não há atletas registados.</p></div>`}</div>
    `;
  }

  function afterAtletasList() {
    const input = document.getElementById("athlete-search");
    if (input) {
      input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        document.querySelectorAll("#athlete-list-card .list-row").forEach((row) => {
          row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    }
    const fileInput = document.getElementById("import-atletas-input");
    if (fileInput) {
      fileInput.addEventListener("change", () => {
        if (fileInput.files[0]) Actions.importAthletesFile(fileInput.files[0]);
      });
    }
  }

  function athleteFormHtml(atleta, turmas, grupos, campos) {
    const a = atleta || {};
    campos = campos || [];
    const customVals = a.camposCustom || {};
    return `
      <div class="modal-head"><h3>${atleta ? "Editar atleta" : "Novo atleta"}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveAthlete">
        <input type="hidden" name="id" value="${a.id || ""}">
        <input type="hidden" name="fotoAtual" value="${esc(a.foto || "")}">
        <div class="field" style="display:flex; align-items:center; gap:14px;">
          <div id="foto-preview">${U.avatarHtml(a.nome || "Novo atleta", a.foto, "width:56px;height:56px;font-size:1.2rem;")}</div>
          <div>
            <label style="display:block;">Fotografia (opcional)</label>
            <input type="file" accept="image/*" id="foto-input" style="font-size:.8rem;">
          </div>
        </div>
        <div class="field"><label>Nome completo</label><input name="nome" required value="${esc(a.nome || "")}"></div>
        <div class="field-row">
          <div class="field"><label>Data de nascimento</label><input type="date" name="dataNascimento" value="${a.dataNascimento || ""}"></div>
          <div class="field"><label>Turma</label>
            <select name="turmaId">${turmas.map((t) => `<option value="${t.id}" ${a.turmaId === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field"><label>Grupo de treino</label>
          <select name="grupoId"><option value="">— sem grupo —</option>${grupos.map((g) => `<option value="${g.id}" ${a.grupoId === g.id ? "selected" : ""}>${esc(g.nome)}</option>`).join("")}</select>
        </div>
        <div class="field-row">
          <div class="field"><label>Encarregado de educação</label><input name="encarregado" value="${esc(a.encarregado || "")}"></div>
          <div class="field"><label>Contacto</label><input name="contacto" value="${esc(a.contacto || "")}"></div>
        </div>
        <div class="field"><label>Notas médicas / alergias</label><textarea name="notasMedicas">${esc(a.notasMedicas || "")}</textarea></div>
        <div class="field"><label>Objetivos definidos pelo treinador</label><textarea name="objetivosCoach" placeholder="Ex.: Conseguir o mortal à frente sozinho até ao Natal.">${esc(a.objetivosCoach || "")}</textarea></div>
        ${campos.length ? `<div class="mat-line"></div><div class="eyebrow">Campos personalizados</div>` + campos.map((c) => {
          if (c.tipo === "checkbox") return `<div class="field"><label><input type="checkbox" name="campo_${c.id}" ${customVals[c.id] ? "checked" : ""} style="width:auto; margin-right:6px;">${esc(c.nome)}</label></div>`;
          if (c.tipo === "data") return `<div class="field"><label>${esc(c.nome)}</label><input type="date" name="campo_${c.id}" value="${esc(customVals[c.id] || "")}"></div>`;
          return `<div class="field"><label>${esc(c.nome)}</label><input name="campo_${c.id}" value="${esc(customVals[c.id] || "")}"></div>`;
        }).join("") : ""}
        <div class="field"><label><input type="checkbox" name="ativo" ${a.ativo === false ? "" : "checked"} style="width:auto; margin-right:6px;">Atleta ativo</label></div>
        <div class="field"><label><input type="checkbox" name="autorizacaoImagem" ${a.autorizacaoImagem === true ? "checked" : ""} style="width:auto; margin-right:6px;">Autorizado a aparecer em fotos/vídeos para redes sociais</label></div>
        <div class="modal-actions">
          ${atleta ? `<button type="button" class="btn btn-danger" data-action="deleteAthlete" data-id="${a.id}">Remover</button>` : ""}
          <button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    `;
  }
  function afterAthleteForm() {
    const input = document.getElementById("foto-input");
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const dataUrl = await U.resizeImageFile(file, 240);
      document.getElementById("foto-preview").innerHTML = U.avatarHtml("", dataUrl, "width:56px;height:56px;");
      input.dataset.resized = dataUrl;
    });
  }

  // ---------------------------------------------------------------
  // Atleta — detalhe
  // ---------------------------------------------------------------
  async function atletaDetail(id) {
    const [atleta, grupos, turmas, sessoes, presencas, comentarios, mesociclos, avaliacoes] = await Promise.all([
      DB.get("atletas", id), DB.getAll("grupos"), DB.getAll("turmas"), DB.getAll("sessoes"), DB.getAll("presencas"), DB.getAll("comentarios"),
      DB.getAll("mesociclos"), DB.getAll("avaliacoes"),
    ]);
    const [habilidadesNomes, estadosPresenca, criterios, camposPersonalizados] = await Promise.all([
      U.getHabilidadesNomes(), U.getEstadosPresenca(), U.getCriteriosAvaliacao(), U.getCamposPersonalizados(),
    ]);
    if (!atleta) return `<div class="empty-state">Atleta não encontrado.</div>`;
    const grupo = grupos.find((g) => g.id === atleta.grupoId);
    const turma = turmas.find((t) => t.id === atleta.turmaId);
    const canEdit = Auth.can("editarAtletas");
    const myPresencas = presencas.filter((p) => p.atletaId === id);
    const sessoesById = Object.fromEntries(sessoes.map((s) => [s.id, s]));
    const total = myPresencas.length;
    const presentes = myPresencas.filter((p) => p.estado === "presente").length;
    const pct = total ? Math.round((presentes / total) * 100) : null;
    const myComments = comentarios.filter((c) => c.targetType === "atleta" && c.targetId === id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    const turmaMesociclos = U.byTurma(mesociclos).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
    const minhasAvaliacoes = avaliacoes.filter((av) => av.atletaId === id).sort((a, b) => b.data.localeCompare(a.data));
    const today = U.todayStr();
    const mesociclosAvaliadosIds = new Set(minhasAvaliacoes.filter((av) => av.tipo === "mesociclo").map((av) => av.mesocicloId));
    const pendentes = turmaMesociclos.filter((m) => m.dataFim < today && !mesociclosAvaliadosIds.has(m.id));

    const habilidades = habilidadesNomes;
    const fases = atleta.habilidades || {};
    const activeTab = (global.__tabState && global.__tabState.athlete) || "info";

    return `
      <a href="#/atletas" style="font-size:.85rem; color:var(--ink-soft); text-decoration:none;">← Todos os atletas</a>
      <div class="section-title" style="margin-top:10px;">
        <div style="display:flex; align-items:center; gap:14px;">
          ${U.avatarHtml(atleta.nome, atleta.foto, "width:52px;height:52px;font-size:1.1rem;")}
          <div>
            <h2>${esc(atleta.nome)}</h2>
            <div class="secondary-text">${calcAge(atleta.dataNascimento)} anos · ${esc(turma ? turma.nome : "—")} ${grupo ? `· <span class="chip ${grupoClass(grupo.ordem)}">${esc(grupo.nome)}</span>` : ""}</div>
          </div>
        </div>
        ${canEdit ? `<button class="btn btn-ghost" data-action="editAthlete" data-id="${atleta.id}">Editar</button>` : ""}
      </div>
      <div class="mat-line"></div>

      <div class="tabs" id="athlete-tabs" data-tabs-context="athlete">
        <button class="tab-btn ${activeTab === "info" ? "active" : ""}" data-tab="info">Informação</button>
        <button class="tab-btn ${activeTab === "skills" ? "active" : ""}" data-tab="skills">Progressão</button>
        <button class="tab-btn ${activeTab === "presencas" ? "active" : ""}" data-tab="presencas">Presenças</button>
        <button class="tab-btn ${activeTab === "avaliacoes" ? "active" : ""}" data-tab="avaliacoes">Avaliações</button>
        <button class="tab-btn ${activeTab === "comentarios" ? "active" : ""}" data-tab="comentarios">Comentários</button>
      </div>

      <div data-tab-panel="info" style="${activeTab === "info" ? "" : "display:none"}">
        <div class="grid cols-2">
          <div class="card">
            <div class="eyebrow">Encarregado de educação</div>
            <p style="margin-top:6px;">${esc(atleta.encarregado || "—")}</p>
            <div class="eyebrow" style="margin-top:12px;">Contacto</div>
            <p style="margin-top:6px;">${esc(atleta.contacto || "—")}</p>
          </div>
          <div class="card">
            <div class="eyebrow">Notas médicas / alergias</div>
            <p style="margin-top:6px;">${esc(atleta.notasMedicas || "Sem notas registadas.")}</p>
            <div class="eyebrow" style="margin-top:12px;">Autorização de imagem</div>
            <p style="margin-top:6px;">${atleta.autorizacaoImagem ? "✅ Autorizado a aparecer em fotos/vídeos para redes sociais" : "🚫 Sem autorização — não publicar fotos/vídeos deste atleta"}</p>
          </div>
        </div>
        ${camposPersonalizados.length ? `
          <div class="card" style="margin-top:14px;">
            <div class="eyebrow">Campos personalizados</div>
            <div class="grid cols-2" style="margin-top:6px;">
              ${camposPersonalizados.map((c) => {
                const val = (atleta.camposCustom || {})[c.id];
                const display = c.tipo === "checkbox" ? (val ? "Sim" : "Não") : c.tipo === "data" && val ? fmtDateShort(val) : (val || "—");
                return `<div><span class="secondary-text">${esc(c.nome)}</span><div>${esc(String(display))}</div></div>`;
              }).join("")}
            </div>
          </div>` : ""}
        ${atleta.objetivosCoach || atleta.objetivosProprios ? `
          <div class="grid cols-2" style="margin-top:14px;">
            ${atleta.objetivosCoach ? `<div class="card"><div class="eyebrow">Objetivos definidos pelo treinador</div><p style="margin-top:6px; white-space:pre-line;">${esc(atleta.objetivosCoach)}</p></div>` : ""}
            ${atleta.objetivosProprios ? `<div class="card"><div class="eyebrow">Objetivos do próprio atleta</div><p style="margin-top:6px; white-space:pre-line;">${esc(atleta.objetivosProprios)}</p></div>` : ""}
          </div>` : ""}
        ${canEdit ? `
          <div class="card" style="margin-top:14px;">
            <div class="eyebrow">Acesso do atleta / encarregado de educação</div>
            <p style="margin-top:6px; color:var(--ink-soft); font-size:.86rem;">Convida o encarregado de educação a acompanhar a evolução, os objetivos e a enviar mensagens.</p>
            <button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-action="inviteAthleteAccount" data-id="${atleta.id}">+ Convidar por email</button>
          </div>
          <div class="card" style="margin-top:14px;">
            <div class="eyebrow">Código de check-in (QR)</div>
            <p style="margin-top:6px; color:var(--ink-soft); font-size:.86rem;">Mostra ou imprime este código — a equipa técnica lê-o na página de Check-in para marcar presença automaticamente.</p>
            <div style="max-width:160px; margin-top:10px;">${Views.qrSvgFor(atleta.id, 4)}</div>
          </div>` : ""}
      </div>

      <div data-tab-panel="skills" style="${activeTab === "skills" ? "" : "display:none"}">
        <div class="card">
          <p style="color:var(--ink-soft); font-size:.85rem;">Fase 1 = pré-requisitos · Fase 5 = autónomo (ver Plano Anual, Secção 7).</p>
          ${habilidades.map((h) => {
            const fase = fases[h] || 1;
            return `
              <div style="margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; font-size:.86rem; margin-bottom:5px;">
                  <strong>${esc(h)}</strong><span style="color:var(--ink-soft)">Fase ${fase}/5</span>
                </div>
                <div class="skill-phase-track">
                  ${[1, 2, 3, 4, 5].map((n) => `<div class="seg ${n <= fase ? "on" : ""}"></div>`).join("")}
                </div>
                ${canEdit ? `
                  <div style="margin-top:6px; display:flex; gap:6px;">
                    <button class="btn btn-ghost btn-sm" data-action="skillPhase" data-id="${atleta.id}" data-skill="${esc(h)}" data-delta="-1">− fase</button>
                    <button class="btn btn-ghost btn-sm" data-action="skillPhase" data-id="${atleta.id}" data-skill="${esc(h)}" data-delta="1">+ fase</button>
                  </div>` : ""}
              </div>`;
          }).join("")}
        </div>
      </div>

      <div data-tab-panel="presencas" style="${activeTab === "presencas" ? "" : "display:none"}">
        <div class="card">
          <div class="stat-card" style="margin-bottom:14px;"><div class="v">${pct !== null ? pct + "%" : "—"}</div><div class="l">Presença (${presentes}/${total} sessões registadas)</div></div>
          <table class="simple">
            <thead><tr><th>Data</th><th>Tipo</th><th>Estado</th></tr></thead>
            <tbody>
              ${myPresencas.sort((a, b) => (sessoesById[b.sessaoId]?.data || "").localeCompare(sessoesById[a.sessaoId]?.data || "")).map((p) => {
                const s = sessoesById[p.sessaoId];
                return `<tr><td>${s ? fmtDateShort(s.data) : "—"}</td><td>${s ? `<span class="chip ${tipoClass(s.tipo)}">${esc(s.tipo)}</span>` : "—"}</td><td>${attLabel(p.estado, estadosPresenca)}</td></tr>`;
              }).join("") || `<tr><td colspan="3" style="color:var(--ink-soft)">Sem registos ainda.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div data-tab-panel="avaliacoes" style="${activeTab === "avaliacoes" ? "" : "display:none"}">
        ${avaliacoesBoxHtml(atleta, turmaMesociclos, minhasAvaliacoes, pendentes, Auth.isAdmin(), habilidadesNomes, criterios)}
      </div>

      <div data-tab-panel="comentarios" style="${activeTab === "comentarios" ? "" : "display:none"}">
        ${commentBoxHtml("atleta", atleta.id, myComments)}
      </div>
    `;
  }

  function avaliacoesBoxHtml(atleta, mesociclos, avaliacoes, pendentes, canDelete, habilidadesNomes, criterios) {
    const habilidades = habilidadesNomes || Seed.HABILIDADES;
    criterios = criterios || [];
    const canCreate = Auth.can("comment");
    return `
      <p style="color:var(--ink-soft); font-size:.85rem; margin-bottom:12px;">As avaliações não são testes — são só um registo do estado atual do atleta, feito ao fim de cada mesociclo (ou a qualquer momento).</p>

      ${pendentes.length ? `
        <div class="card" style="border-color:var(--warn); margin-bottom:14px;">
          <div class="eyebrow" style="color:var(--warn);">Avaliações de fim de mesociclo em falta</div>
          ${pendentes.map((m) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0;">
              <span>${esc(m.nome)} <span class="secondary-text">(terminou ${fmtDateShort(m.dataFim)})</span></span>
              ${canCreate ? `<button class="btn btn-ghost btn-sm" data-action="newAvaliacao" data-atleta="${atleta.id}" data-meso="${m.id}">+ Avaliar</button>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${canCreate ? `<button class="btn btn-accent btn-sm" style="margin-bottom:14px;" data-action="newAvaliacao" data-atleta="${atleta.id}">+ Nova avaliação extra</button>` : ""}

      ${avaliacoes.length ? avaliacoes.map((av) => {
        const meso = mesociclos.find((m) => m.id === av.mesocicloId);
        return `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <strong>${av.tipo === "mesociclo" ? "Fim de mesociclo — " + esc(meso ? meso.nome : "?") : "Avaliação extra"}</strong>
              <div class="secondary-text">${fmtDateShort(av.data)} · por ${esc(av.autorNome || "?")}</div>
            </div>
            ${canDelete ? `<button class="icon-btn" data-action="deleteAvaliacao" data-id="${av.id}">🗑</button>` : ""}
          </div>
          ${av.observacoesGerais ? `<p style="margin-top:8px; white-space:pre-line;">${esc(av.observacoesGerais)}</p>` : ""}
          ${av.snapshotHabilidades ? `
            <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">
              ${habilidades.map((h) => `<span class="chip" style="background:var(--paper-2); color:var(--ink-soft); font-size:.72rem;">${esc(h.split(" (")[0])}: ${av.snapshotHabilidades[h] || "—"}/5</span>`).join("")}
            </div>` : ""}
          ${av.snapshotCriterios && criterios.length ? `
            <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
              ${criterios.map((c) => av.snapshotCriterios[c.nome] ? `<span class="chip" style="background:var(--paper-2); color:var(--ink-soft); font-size:.72rem;">${esc(c.nome)}: ${av.snapshotCriterios[c.nome]}/5</span>` : "").join("")}
            </div>` : ""}
        </div>`;
      }).join("") : `<div class="empty-state">Ainda sem avaliações registadas.</div>`}
    `;
  }


  function attLabel(estado, estadosPresenca) {
    const fallback = { presente: ["Presente", "success"], falta: ["Falta", "danger"], falta_justificada: ["Falta justificada", "warn"], doenca: ["Doença", "info"] };
    if (estadosPresenca && estadosPresenca.length) {
      const cor = { c1: "primary", c2: "accent", c3: "info", c4: "warn", c5: "success", c6: "ink-soft" };
      const found = estadosPresenca.find((e) => e.valor === estado);
      if (found) return `<span style="color:var(--${cor[found.cor] || "ink-soft"}); font-weight:600;">${esc(found.nome)}</span>`;
    }
    const pair = fallback[estado] || ["—", "ink-soft"];
    return `<span style="color:var(--${pair[1]}); font-weight:600;">${pair[0]}</span>`;
  }

  function commentBoxHtml(targetType, targetId, comments) {
    return `
      <div class="card">
        <form data-form="addComment" style="margin-bottom:14px;">
          <input type="hidden" name="targetType" value="${targetType}">
          <input type="hidden" name="targetId" value="${targetId}">
          <div class="field"><textarea name="texto" placeholder="Escrever um comentário…" required></textarea></div>
          <button class="btn btn-primary btn-sm" type="submit">Adicionar comentário</button>
        </form>
        <div class="mat-line"></div>
        ${comments.length ? comments.map((c) => `
          <div style="padding:9px 0; border-bottom:1px solid var(--line);">
            <div style="font-size:.8rem; display:flex; justify-content:space-between;">
              <strong>${esc(c.autorNome)}</strong><span style="color:var(--ink-soft)">${fmtDateTime(c.criadoEm)}</span>
            </div>
            <div style="font-size:.9rem; margin-top:3px;">${esc(c.texto)}</div>
          </div>
        `).join("") : `<p style="color:var(--ink-soft)">Ainda sem comentários.</p>`}
      </div>
    `;
  }

  function bindTabs() {
    document.querySelectorAll("[data-tabs-context]").forEach((tabsEl) => {
      const ctx = tabsEl.dataset.tabsContext;
      tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          global.__tabState = global.__tabState || {};
          global.__tabState[ctx] = btn.dataset.tab;
          tabsEl.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          document.querySelectorAll("[data-tab-panel]").forEach((p) => (p.style.display = p.dataset.tabPanel === btn.dataset.tab ? "" : "none"));
        });
      });
    });
  }

  // ---------------------------------------------------------------
  // Grupos
  // ---------------------------------------------------------------
  async function grupos() {
    const [gruposRaw, atletasRaw, turmas] = await Promise.all([DB.getAll("grupos"), DB.getAll("atletas"), DB.getAll("turmas")]);
    const gruposList = U.byTurma(gruposRaw);
    const atletas = U.byTurma(atletasRaw);
    const turmaById = Object.fromEntries(turmas.map((t) => [t.id, t]));
    const canEdit = Auth.can("editarAtletas");
    const cards = gruposList.sort((a, b) => a.ordem - b.ordem).map((g) => {
      const membros = atletas.filter((a) => a.grupoId === g.id);
      return `
        <div class="card" data-sortable-id="${g.id}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              ${canEdit ? `<span class="drag-handle">⠿</span>` : ""}
              <span class="chip ${grupoClass(g.ordem)}">${esc(g.nome)}</span>
              <div class="secondary-text" style="margin-top:6px;">${esc(turmaById[g.turmaId] ? turmaById[g.turmaId].nome : "")}</div>
            </div>
            ${canEdit ? `
              <div style="display:flex; gap:6px;">
                <button class="icon-btn" data-action="editGroup" data-id="${g.id}" title="Editar">✎</button>
                <button class="icon-btn" data-action="deleteGroup" data-id="${g.id}" title="Remover">🗑</button>
              </div>` : ""}
          </div>
          <p style="margin-top:10px;">${esc(g.descricao || "")}</p>
          <div class="eyebrow">Atletas (${membros.length})</div>
          <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
            ${membros.map((m) => `<a href="#/atletas/${m.id}" class="chip" style="background:var(--paper-2); color:var(--ink);">${esc(m.nome)}</a>`).join("") || `<span style="color:var(--ink-soft); font-size:.82rem;">Sem atletas atribuídos.</span>`}
          </div>
        </div>`;
    }).join("");

    return `
      <div class="section-title"><h2>Grupos de Treino</h2>${canEdit ? `<button class="btn btn-accent" data-action="newGroup">+ Novo grupo</button>` : ""}</div>
      <div class="mat-line"></div>
      <p style="color:var(--ink-soft); margin-bottom:14px;">Os grupos permitem adaptar o mesmo treino a diferentes níveis (ver Plano Anual, Secção 3). Reavalia e reorganiza os grupos nos momentos-chave da época${canEdit ? " — arrasta para reordenar" : ""}.</p>
      <div id="sortable-grupos">${cards || `<div class="empty-state">Sem grupos criados.</div>`}</div>
    `;
  }

  function groupFormHtml(grupo, turmas) {
    const g = grupo || {};
    return `
      <div class="modal-head"><h3>${grupo ? "Editar grupo" : "Novo grupo"}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveGroup">
        <input type="hidden" name="id" value="${g.id || ""}">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(g.nome || "")}" placeholder="Ex.: Grupo 2 - Intermédio"></div>
        <div class="field"><label>Turma</label><select name="turmaId">${turmas.map((t) => `<option value="${t.id}" ${g.turmaId === t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></div>
        <div class="field"><label>Ordem (1 = mais base, 3 = mais avançado)</label><input type="number" name="ordem" min="1" max="6" value="${g.ordem || 1}"></div>
        <div class="field"><label>Descrição / perfil</label><textarea name="descricao">${esc(g.descricao || "")}</textarea></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`;
  }

  // ---------------------------------------------------------------
  // Turmas
  // ---------------------------------------------------------------
  async function turmas() {
    const list = U.byTenant(await DB.getAll("turmas"));
    const atletas = U.byTurma(await DB.getAll("atletas"));
    const canEdit = Auth.isAdmin();
    const cards = list.map((t) => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div><h3>${esc(t.nome)}</h3><div class="secondary-text">${esc(t.dias || "")} ${t.horario ? "· " + esc(t.horario) : ""}</div></div>
          ${canEdit ? `<div style="display:flex; gap:6px;"><button class="icon-btn" data-action="editTurma" data-id="${t.id}">✎</button></div>` : ""}
        </div>
        <p style="margin-top:10px;">${esc(t.descricao || "")}</p>
        <div class="secondary-text">${atletas.filter((a) => a.turmaId === t.id).length} atleta(s)</div>
      </div>
    `).join("");
    return `
      <div class="section-title"><h2>Turmas</h2>${canEdit ? `<button class="btn btn-accent" data-action="newTurma">+ Nova turma</button>` : ""}</div>
      <div class="mat-line"></div>
      <p style="color:var(--ink-soft); margin-bottom:14px;">Podes gerir mais do que uma classe/turma no mesmo ginásio (ex.: Formação, Representação, Iniciação).</p>
      ${cards || `<div class="empty-state">Sem turmas criadas.</div>`}
    `;
  }

  function turmaFormHtml(t) {
    t = t || {};
    return `
      <div class="modal-head"><h3>${t.id ? "Editar turma" : "Nova turma"}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveTurma">
        <input type="hidden" name="id" value="${t.id || ""}">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(t.nome || "")}"></div>
        <div class="field"><label>Descrição</label><textarea name="descricao">${esc(t.descricao || "")}</textarea></div>
        <div class="field-row">
          <div class="field"><label>Dias de treino</label><input name="dias" value="${esc(t.dias || "")}" placeholder="Ex.: Quarta e Sexta-feira"></div>
          <div class="field"><label>Horário</label><input name="horario" value="${esc(t.horario || "")}" placeholder="Ex.: 18:00-19:00"></div>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;
  }

  // ---------------------------------------------------------------
  // Época (configurada pelo Manager) + Mesociclos + padrão de microciclo
  // ---------------------------------------------------------------
  const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  async function mesociclos() {
    const turmaId = await currentTurmaId();
    const [listRaw, turma, sessoesRaw, catalogoRaw] = await Promise.all([
      DB.getAll("mesociclos"), DB.get("turmas", turmaId), DB.getAll("sessoes"), DB.getAll("microciclosTipos"),
    ]);
    const list = U.byTurma(listRaw);
    const catalogo = U.byTurma(catalogoRaw).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const nSessoes = U.byTurma(sessoesRaw).length;
    const canEdit = Auth.can("editarPlanos");
    const diasSemana = (turma && turma.diasSemana) || [];
    const feriados = (turma && turma.feriados) || [];

    const rows = list.sort((a, b) => a.dataInicio.localeCompare(b.dataInicio)).map((m) => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3>${esc(m.nome)}</h3>
            <div class="secondary-text">${fmtDateShort(m.dataInicio)} — ${fmtDateShort(m.dataFim)}</div>
          </div>
          ${canEdit ? `<button class="icon-btn" data-action="editMeso" data-id="${m.id}">✎</button>` : ""}
        </div>
        <p style="margin-top:8px;">${esc(m.objetivo || "")}</p>
      </div>
    `).join("");

    const nomesCatalogo = catalogo.length ? catalogo.map((c) => c.nome) : Season.defaultCatalogo().map((c) => c.nome);
    const pattern = (turma && turma.padraoMicrociclo) || (diasSemana.length ? Season.defaultPattern(diasSemana, catalogo) : {});
    const weekLabel = { 1: "Semana 1", 2: "Semana 2", 3: "Semana 3", 0: "Semana 4" };

    const microciclosCards = catalogo.map((c) => `
      <div class="card" data-sortable-id="${c.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <span>${canEdit ? `<span class="drag-handle">⠿</span>` : ""}<span class="chip ${U.tipoClass(c.nome)}">${esc(c.nome)}</span></span>
          ${canEdit ? `
            <div style="display:flex; gap:6px;">
              <button class="icon-btn" data-action="editMicrociclo" data-id="${c.id}">✎</button>
              <button class="icon-btn" data-action="deleteMicrociclo" data-id="${c.id}">🗑</button>
            </div>` : ""}
        </div>
        <p style="margin-top:8px; font-size:.86rem; white-space:pre-line;">${esc(c.planoGenerico || "Sem plano genérico definido.")}</p>
      </div>
    `).join("");

    return `
      <div class="section-title"><h2>Época e Mesociclos</h2></div>
      <div class="mat-line"></div>
      <p style="color:var(--ink-soft);">Define aqui os dias/horário de treino e o período da época — a app gera automaticamente todas as sessões entre essas datas, saltando os feriados que definires. O <strong>macrociclo</strong> é a época inteira; cada <strong>mesociclo</strong> é um período com um foco técnico; cada <strong>microciclo</strong> é um tipo de treino que criares (Trampolim, Tumbling, ou o que preferires) com o seu plano genérico; o padrão semanal decide em que dia se treina cada microciclo.</p>

      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Configuração da época</div>
        <form data-form="saveEpocaConfig" style="margin-top:10px;">
          <div class="field-row">
            <div class="field"><label>Início da época</label><input type="date" name="epocaInicio" value="${turma && turma.epocaInicio || ""}" ${canEdit ? "" : "disabled"}></div>
            <div class="field"><label>Fim da época</label><input type="date" name="epocaFim" value="${turma && turma.epocaFim || ""}" ${canEdit ? "" : "disabled"}></div>
          </div>
          <div class="field">
            <label>Dias de treino</label>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;">
              ${DIA_CURTO.map((d, i) => `
                <label style="display:flex; align-items:center; gap:5px; font-size:.85rem; background:var(--paper-2); padding:6px 10px; border-radius:8px;">
                  <input type="checkbox" name="diasSemana" value="${i}" ${diasSemana.includes(i) ? "checked" : ""} style="width:auto;" ${canEdit ? "" : "disabled"}> ${d}
                </label>`).join("")}
            </div>
          </div>
          <div class="field"><label>Horário</label><input name="horario" value="${esc(turma && turma.horario || "")}" placeholder="Ex.: 18:00-19:00" ${canEdit ? "" : "disabled"}></div>
          ${canEdit ? `<button type="submit" class="btn btn-primary btn-sm">Guardar configuração</button>` : ""}
        </form>

        <div class="mat-line"></div>
        <div class="eyebrow">Feriados / pausas (não há treino nestas datas)</div>
        <table class="simple" style="margin-top:8px;">
          <tbody>
            ${feriados.sort((a, b) => a.data.localeCompare(b.data)).map((f) => `
              <tr><td>${fmtDateShort(f.data)}</td><td>${esc(f.nome)}</td><td>${canEdit ? `<button class="icon-btn" data-action="removeFeriado" data-data="${f.data}">🗑</button>` : ""}</td></tr>
            `).join("") || `<tr><td colspan="3" style="color:var(--ink-soft)">Sem feriados definidos.</td></tr>`}
          </tbody>
        </table>
        ${canEdit ? `
          <form data-form="addFeriado" class="field-row" style="margin-top:10px; align-items:flex-end;">
            <div class="field" style="margin-bottom:0;"><label>Data</label><input type="date" name="data" required></div>
            <div class="field" style="margin-bottom:0; flex:2;"><label>Nome</label><input name="nome" required placeholder="Ex.: Natal"></div>
            <button type="submit" class="btn btn-ghost btn-sm">+ Adicionar</button>
          </form>` : ""}

        ${canEdit ? `
          <div class="mat-line"></div>
          <button class="btn btn-accent btn-sm" data-action="gerarSessoesEpoca">🔁 Gerar / regenerar sessões da época</button>
          <div class="perm-note">Atualmente esta turma tem ${nSessoes} sessões geradas. Gerar de novo substitui as sessões de treino ainda não realizadas pelas novas datas/tipos — sessões já realizadas e eventos extra (provas, exibições) não são apagados.</div>
        ` : ""}
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Objetivos gerais da época</div>
        <p style="font-size:.82rem; color:var(--ink-soft); margin-top:4px;">Este texto aparece aos atletas/encarregados de educação em "Objetivos da Época".</p>
        <form data-form="saveResumoObjetivos" style="margin-top:8px;">
          <textarea name="resumoObjetivos" ${canEdit ? "" : "disabled"} placeholder="Ex.: O objetivo desta época é preparar a turma para a classe de representação...">${esc((turma && turma.resumoObjetivos) || "")}</textarea>
          ${canEdit ? `<button type="submit" class="btn btn-primary btn-sm" style="margin-top:8px;">Guardar</button>` : ""}
        </form>
      </div>

      <div class="section-title" style="margin-top:20px;">
        <h3 style="font-size:1.05rem;">Microciclos (tipos de treino)</h3>
        ${canEdit ? `<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-ghost btn-sm" data-action="downloadMesoMicroTemplate">⬇ Modelo Excel</button><label class="btn btn-ghost btn-sm" style="margin:0;">⬆ Importar Excel<input type="file" id="import-meso-micro-input" accept=".xlsx,.xls" style="display:none;"></label><button class="btn btn-accent btn-sm" data-action="newMicrociclo">+ Novo microciclo</button></div>` : ""}
      </div>
      <div class="mat-line"></div>
      <div class="grid cols-3" id="sortable-microciclos-catalogo">${microciclosCards || `<div class="empty-state">Ainda sem microciclos — usa "+ Novo microciclo" (ex.: Trampolim, Tumbling, Solo).</div>`}</div>

      <div class="section-title" style="margin-top:20px;"><h3 style="font-size:1.05rem;">Mesociclos</h3>${canEdit ? `<button class="btn btn-accent btn-sm" data-action="newMeso">+ Novo mesociclo</button>` : ""}</div>
      <div class="grid cols-2" style="margin-top:10px; align-items:start;">
        <div>${rows || `<div class="empty-state">Sem mesociclos definidos.</div>`}</div>
        <div class="card">
          <div class="eyebrow">Padrão do microciclo (4 semanas)</div>
          ${diasSemana.length ? `
          <form data-form="saveMicrociclo" style="margin-top:10px;">
            <table class="simple">
              <thead><tr><th></th>${diasSemana.map((d) => `<th>${DIA_CURTO[d]}</th>`).join("")}</tr></thead>
              <tbody>
                ${[1, 2, 3, 0].map((w) => `
                  <tr>
                    <td>${weekLabel[w]}</td>
                    ${diasSemana.map((d) => `<td><select name="w${w}_${d}">${nomesCatalogo.map((t) => `<option ${(pattern[w] && pattern[w][d]) === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></td>`).join("")}
                  </tr>`).join("")}
              </tbody>
            </table>
            ${canEdit ? `
              <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
                <button type="submit" class="btn btn-primary btn-sm">Guardar padrão</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="applyMicrociclo">Aplicar a sessões futuras (a partir de hoje)</button>
              </div>
              <div class="perm-note">"Aplicar a sessões futuras" só recalcula sessões planeadas ainda não realizadas — não apaga presenças nem comentários já registados.</div>
            ` : `<div class="perm-note">Só o gestor pode alterar o padrão do microciclo.</div>`}
          </form>` : `<p style="color:var(--ink-soft)">Define primeiro os dias de treino, acima.</p>`}
        </div>
      </div>
    `;
  }

  function microcicloFormHtml(c) {
    c = c || {};
    return `
      <div class="modal-head"><h3>${c.id ? "Editar microciclo" : "Novo microciclo"}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveMicrocicloTipo">
        <input type="hidden" name="id" value="${c.id || ""}">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(c.nome || "")}" placeholder="Ex.: Trampolim"></div>
        <div class="field"><label>Plano genérico</label><textarea name="planoGenerico" placeholder="Conteúdo usado sempre que este microciclo aparecer no calendário, a não ser que um mesociclo o substitua.">${esc(c.planoGenerico || "")}</textarea></div>
        <div class="modal-actions">
          ${c.id ? `<button type="button" class="btn btn-danger" data-action="deleteMicrociclo" data-id="${c.id}">Remover</button>` : ""}
          <button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`;
  }

  function mesoFormHtml(m, catalogo) {
    m = m || {};
    catalogo = catalogo || [];
    const planos = m.planosPorMicrociclo || {};
    return `
      <div class="modal-head"><h3>${m.id ? "Editar mesociclo" : "Novo mesociclo"}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveMeso">
        <input type="hidden" name="id" value="${m.id || ""}">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(m.nome || "")}"></div>
        <div class="field-row">
          <div class="field"><label>Início</label><input type="date" name="dataInicio" required value="${m.dataInicio || ""}"></div>
          <div class="field"><label>Fim</label><input type="date" name="dataFim" required value="${m.dataFim || ""}"></div>
        </div>
        <div class="field"><label>Objetivo técnico</label><textarea name="objetivo">${esc(m.objetivo || "")}</textarea></div>
        ${catalogo.length ? `
          <div class="mat-line"></div>
          <div class="eyebrow">Planos por microciclo (opcional)</div>
          <p style="font-size:.8rem; color:var(--ink-soft); margin:4px 0 10px;">Substitui, só neste mesociclo, o plano genérico desse microciclo. Deixa em branco para usar o plano genérico normal.</p>
          ${catalogo.map((c) => `
            <div class="field">
              <label><span class="chip ${U.tipoClass(c.nome)}">${esc(c.nome)}</span></label>
              <textarea name="plano_${c.id}" placeholder="${esc(c.planoGenerico || "")}">${esc(planos[c.nome] || "")}</textarea>
            </div>`).join("")}
        ` : ""}
        <div class="modal-actions">
          ${m.id ? `<button type="button" class="btn btn-danger" data-action="deleteMeso" data-id="${m.id}">Remover</button>` : ""}
          <button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`;
  }

  function avaliacaoFormHtml(atleta, mesociclos, mesocicloIdPreset, habilidadesNomes, criterios) {
    const habilidades = habilidadesNomes || Seed.HABILIDADES;
    criterios = criterios || [];
    const fases = atleta.habilidades || {};
    return `
      <div class="modal-head"><h3>Nova avaliação — ${esc(atleta.nome)}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveAvaliacao">
        <input type="hidden" name="atletaId" value="${atleta.id}">
        <div class="field"><label>Tipo</label>
          <select name="tipo" id="avaliacao-tipo">
            <option value="mesociclo" ${mesocicloIdPreset ? "selected" : ""}>Fim de mesociclo</option>
            <option value="extra" ${!mesocicloIdPreset ? "selected" : ""}>Avaliação extra</option>
          </select>
        </div>
        <div class="field" id="avaliacao-meso-field">
          <label>Mesociclo</label>
          <select name="mesocicloId">${mesociclos.map((m) => `<option value="${m.id}" ${m.id === mesocicloIdPreset ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Data</label><input type="date" name="data" value="${U.todayStr()}" required></div>
        <div class="field"><label>Observações gerais</label><textarea name="observacoesGerais" placeholder="Estado atual, pontos fortes, o que trabalhar a seguir…"></textarea></div>
        <div class="mat-line"></div>
        <div class="eyebrow">Estado atual por habilidade (só um registo — não altera a progressão)</div>
        ${habilidades.map((h) => `
          <div class="field-row" style="align-items:center;">
            <span style="flex:2; font-size:.86rem;">${esc(h)}</span>
            <select name="fase_${habilidades.indexOf(h)}" style="flex:1;">
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === (fases[h] || 1) ? "selected" : ""}>Fase ${n}</option>`).join("")}
            </select>
          </div>
        `).join("")}
        ${criterios.length ? `
          <div class="mat-line"></div>
          <div class="eyebrow">Outros critérios</div>
          ${criterios.map((c) => `
            <div class="field-row" style="align-items:center;">
              <span style="flex:2; font-size:.86rem;">${esc(c.nome)}</span>
              <select name="criterio_${c.id}" style="flex:1;">
                ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
          `).join("")}
        ` : ""}
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar avaliação</button></div>
      </form>`;
  }
  function afterAvaliacaoForm() {
    const tipoSel = document.getElementById("avaliacao-tipo");
    const mesoField = document.getElementById("avaliacao-meso-field");
    if (!tipoSel) return;
    const toggle = () => { mesoField.style.display = tipoSel.value === "mesociclo" ? "" : "none"; };
    toggle();
    tipoSel.addEventListener("change", toggle);
  }

  global.Views = global.Views || {};
  Object.assign(global.Views, {
    dashboard, atletasList, atletaDetail, grupos, turmas, mesociclos,
    _helpers: {
      athleteFormHtml, groupFormHtml, turmaFormHtml, mesoFormHtml, currentTurmaId, attLabel, commentBoxHtml,
      WIDGET_DEFS, getDashboardPrefs, saveDashboardPrefs, dashboardSettingsHtml, afterAthleteForm, microcicloFormHtml,
      avaliacaoFormHtml, afterAvaliacaoForm,
    },
  });
  global.afterRenderHooks = global.afterRenderHooks || [];
  function afterMesociclosPage() {
    const fileInput = document.getElementById("import-meso-micro-input");
    if (fileInput) {
      fileInput.addEventListener("change", () => {
        if (fileInput.files[0]) Actions.importMesoMicroFile(fileInput.files[0]);
      });
    }
    const microCatalogo = document.getElementById("sortable-microciclos-catalogo");
    if (microCatalogo && Auth.isAdmin()) {
      U.makeSortable(microCatalogo, (novaOrdem) => Actions.reordenarCatalogo("microciclos-catalogo", novaOrdem));
    }
  }
  function afterGruposPage() {
    const container = document.getElementById("sortable-grupos");
    if (container && Auth.can("editarAtletas")) {
      U.makeSortable(container, (novaOrdem) => Actions.reordenarCatalogo("grupos", novaOrdem));
    }
  }

  global.afterRenderHooks.push(afterAtletasList, bindTabs, afterAvaliacaoForm, afterMesociclosPage, afterGruposPage);
})(window);
