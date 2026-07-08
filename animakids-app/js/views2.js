/* =========================================================
   AnimaKids — vistas (parte 2: calendário, sessão, definições)
   ========================================================= */
(function (global) {
  "use strict";
  const { esc, fmtDateShort, todayStr, tipoClass, initials } = U;

  // ---------------------------------------------------------------
  // Calendário
  // ---------------------------------------------------------------
  async function calendario() {
    const [sessoesRaw, mesociclosRaw] = await Promise.all([DB.getAll("sessoes"), DB.getAll("mesociclos")]);
    const sessoes = U.byTurma(sessoesRaw);
    const mesociclos = U.byTurma(mesociclosRaw);
    const mesoById = Object.fromEntries(mesociclos.map((m) => [m.id, m]));
    const today = todayStr();

    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const filtroMeso = params.get("meso") || "";
    const filtroMes = params.get("mes") || "";

    let list = sessoes.slice().sort((a, b) => a.data.localeCompare(b.data));
    if (filtroMeso) list = list.filter((s) => s.mesocicloId === filtroMeso);
    if (filtroMes) list = list.filter((s) => s.data.slice(0, 7) === filtroMes);

    const meses = [...new Set(sessoes.map((s) => s.data.slice(0, 7)))].sort();

    const rows = list.map((s) => {
      const meso = mesoById[s.mesocicloId];
      const isPast = s.data < today;
      const estadoBadge = s.feriado
        ? `<span class="chip" style="background:var(--paper-2); color:var(--ink-soft);">Feriado — ${esc(s.feriado)}</span>`
        : s.estado === "realizada" || isPast
          ? `<span class="chip" style="background:var(--success-tint); color:var(--success);">Realizada</span>`
          : `<span class="chip" style="background:var(--primary-tint); color:var(--primary);">Planeada</span>`;
      return `
        <div class="list-row" data-action="${s.tipo ? "openSession" : ""}" data-id="${s.id}" style="${s.tipo ? "" : "cursor:default;"}">
          <div style="width:64px; flex-shrink:0;">
            <div style="font-weight:700; font-size:.9rem;">${s.data.slice(8, 10)}</div>
            <div style="font-size:.72rem; color:var(--ink-soft);">${U.MESES[parseInt(s.data.slice(5, 7), 10) - 1]}</div>
          </div>
          <div style="flex:1; min-width:0;">
            <div class="primary-text">${s.diaSemana}${meso ? ` · ${esc(meso.nome)}` : ""}</div>
            ${s.tipo ? `<span class="chip ${tipoClass(s.tipo)}">${esc(s.tipo)}</span>` : ""}
          </div>
          ${estadoBadge}
        </div>`;
    }).join("");

    return `
      <div class="section-title"><h2>Calendário da Época</h2></div>
      <div class="mat-line"></div>
      <div class="field-row" style="max-width:520px; margin-bottom:8px;">
        <div class="field"><label>Mesociclo</label>
          <select id="filtro-meso"><option value="">Todos</option>${mesociclos.map((m) => `<option value="${m.id}" ${filtroMeso === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Mês</label>
          <select id="filtro-mes"><option value="">Todos</option>${meses.map((m) => `<option value="${m}" ${filtroMes === m ? "selected" : ""}>${esc(fmtMonthLabel(m))}</option>`).join("")}</select>
        </div>
      </div>
      <div class="card" style="max-height:70vh; overflow-y:auto;">${rows || `<div class="empty-state">Sem sessões para este filtro.</div>`}</div>
    `;
  }
  function fmtMonthLabel(m) { const parts = m.split("-"); return `${U.MESES_EXT[parseInt(parts[1], 10) - 1]} ${parts[0]}`; }
  function afterCalendario() {
    const fm = document.getElementById("filtro-meso");
    const fmes = document.getElementById("filtro-mes");
    if (!fm) return;
    const apply = () => {
      const qs = new URLSearchParams();
      if (fm.value) qs.set("meso", fm.value);
      if (fmes.value) qs.set("mes", fmes.value);
      location.hash = "#/calendario" + (qs.toString() ? "?" + qs.toString() : "");
      U.renderRoute();
    };
    fm.addEventListener("change", apply);
    fmes.addEventListener("change", apply);
  }

  // ---------------------------------------------------------------
  // Detalhe de sessão
  // ---------------------------------------------------------------
  async function sessaoDetail(id) {
    const s = await DB.get("sessoes", id);
    if (!s) return `<div class="empty-state">Sessão não encontrada.</div>`;
    if (Auth.activeMembership && s.turmaId !== Auth.activeMembership.turmaId) {
      return `<div class="empty-state"><div class="ico">🔒</div><p>Esta sessão não pertence à turma atual.</p></div>`;
    }
    const [meso, atletas, grupos, presencas, comentarios] = await Promise.all([
      DB.get("mesociclos", s.mesocicloId), DB.getAll("atletas"), DB.getAll("grupos"), DB.getAll("presencas"), DB.getAll("comentarios"),
    ]);
    const canEdit = Auth.isAdmin();
    const canMark = Auth.can("markAttendance");

    if (s.feriado) {
      return `
        <a href="#/calendario" style="font-size:.85rem; color:var(--ink-soft); text-decoration:none;">← Calendário</a>
        <div class="card" style="margin-top:12px; text-align:center; padding:40px;">
          <div style="font-size:2rem;">🎉</div>
          <h2>${fmtDateShort(s.data)} — ${esc(s.feriado)}</h2>
          <p style="color:var(--ink-soft)">Sem treino.</p>
        </div>`;
    }

    const grupoById = Object.fromEntries(grupos.map((g) => [g.id, g]));
    const turmaGrupos = grupos.filter((g) => g.turmaId === s.turmaId).sort((a, b) => a.ordem - b.ordem);
    const turmaAtletas = atletas.filter((a) => a.turmaId === s.turmaId && a.ativo).sort((x, y) => {
      const gx = (grupoById[x.grupoId] && grupoById[x.grupoId].ordem) || 9;
      const gy = (grupoById[y.grupoId] && grupoById[y.grupoId].ordem) || 9;
      return gx - gy || x.nome.localeCompare(y.nome);
    });
    const atletaById = Object.fromEntries(atletas.map((a) => [a.id, a]));
    const presByAthlete = Object.fromEntries(presencas.filter((p) => p.sessaoId === id).map((p) => [p.atletaId, p]));
    const mesosAll = await DB.getAll("mesociclos");
    const sessComments = comentarios.filter((c) => c.targetType === "sessao" && c.targetId === id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

    const states = ["presente", "falta", "falta_justificada", "doenca"];
    const stateLabels = { presente: "P", falta: "F", falta_justificada: "FJ", doenca: "D" };
    const activeTab = (global.__tabState && global.__tabState.session) || "plano";

    return `
      <a href="#/calendario" style="font-size:.85rem; color:var(--ink-soft); text-decoration:none;">← Calendário</a>
      <div class="section-title" style="margin-top:10px;">
        <div>
          <h2>${fmtDateShort(s.data)} <span style="font-weight:400; color:var(--ink-soft);">· ${s.diaSemana}</span></h2>
          <span class="chip ${tipoClass(s.tipo)}" style="margin-top:6px;">${esc(s.tipo)}</span>
          ${meso ? `<span class="secondary-text" style="margin-left:8px;">${esc(meso.nome)}</span>` : ""}
        </div>
        ${canEdit ? `<button class="btn btn-ghost" data-action="editSession" data-id="${s.id}">Editar sessão</button>` : ""}
      </div>
      <div class="mat-line"></div>

      <div class="tabs" id="session-tabs" data-tabs-context="session">
        <button class="tab-btn ${activeTab === "plano" ? "active" : ""}" data-tab="plano">Plano de treino</button>
        <button class="tab-btn ${activeTab === "presencas" ? "active" : ""}" data-tab="presencas">Presenças</button>
        <button class="tab-btn ${activeTab === "comentarios" ? "active" : ""}" data-tab="comentarios">Comentários</button>
      </div>

      <div data-tab-panel="plano" style="${activeTab === "plano" ? "" : "display:none"}">
        <div class="card">
          <div class="eyebrow">Mesociclo</div>
          ${canEdit ? `
            <select id="sess-meso-select" style="margin:8px 0 14px; max-width:340px;">
              ${mesosAll.map((m) => `<option value="${m.id}" ${m.id === s.mesocicloId ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}
            </select>` : `<p>${meso ? esc(meso.nome) : "—"}</p>`}
          <div class="eyebrow">Tipo de treino</div>
          ${canEdit ? `
            <select id="sess-tipo-select" style="margin:8px 0 14px; max-width:220px;">
              ${["Trampolim", "Tumbling", "Solo", "Acrobática"].map((t) => `<option ${t === s.tipo ? "selected" : ""}>${t}</option>`).join("")}
            </select>` : `<p><span class="chip ${tipoClass(s.tipo)}">${esc(s.tipo)}</span></p>`}
          <div class="eyebrow">Conteúdo do plano</div>
          ${canEdit ? `
            <textarea id="sess-plano-text" style="width:100%; min-height:140px; margin-top:8px; padding:10px; border:1.5px solid var(--line); border-radius:8px;">${esc(s.planoConteudo || "")}</textarea>
            <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
              <button class="btn btn-primary btn-sm" data-action="saveSessionPlan" data-id="${s.id}">Guardar alterações</button>
              <label style="font-size:.82rem; display:flex; align-items:center; gap:6px;"><input type="checkbox" id="sess-realizada" ${s.estado === "realizada" ? "checked" : ""}> Marcar como realizada</label>
            </div>
          ` : `<p style="white-space:pre-line;">${esc(s.planoConteudo || "Sem plano definido.")}</p>`}
        </div>

        <div class="card" style="margin-top:14px;">
          <div class="eyebrow">Planos específicos por grupo</div>
          <p style="font-size:.82rem; color:var(--ink-soft); margin-top:4px;">Adapta o conteúdo geral a cada nível — fica em branco se seguir só o plano geral.</p>
          ${turmaGrupos.length ? turmaGrupos.map((g) => `
            <div style="margin-top:12px;">
              <label style="font-size:.85rem; font-weight:600; display:block; margin-bottom:5px;"><span class="chip ${U.grupoClass(g.ordem)}">${esc(g.nome)}</span></label>
              ${canEdit ? `
                <textarea data-plano-grupo="${g.id}" style="width:100%; min-height:70px; padding:8px; border:1.5px solid var(--line); border-radius:8px;">${esc((s.planosGrupo && s.planosGrupo[g.id]) || "")}</textarea>
              ` : `<p style="font-size:.88rem;">${esc((s.planosGrupo && s.planosGrupo[g.id]) || "Sem plano específico — segue o plano geral.")}</p>`}
            </div>
          `).join("") : `<p style="color:var(--ink-soft)">Esta turma ainda não tem grupos criados.</p>`}
          ${canEdit && turmaGrupos.length ? `<button class="btn btn-primary btn-sm" style="margin-top:12px;" data-action="saveGroupPlans" data-id="${s.id}">Guardar planos por grupo</button>` : ""}
        </div>

        <div class="card" style="margin-top:14px;">
          <div class="eyebrow">Notas específicas por atleta</div>
          ${Object.keys(s.planosAtleta || {}).length ? Object.entries(s.planosAtleta).map(([aid, texto]) => {
            const at = atletaById[aid];
            if (!at || !texto) return "";
            return `
              <div style="padding:8px 0; border-bottom:1px solid var(--line); display:flex; gap:10px; align-items:flex-start;">
                ${U.avatarHtml(at.nome, at.foto, "width:30px;height:30px;font-size:.7rem;")}
                <div style="flex:1;"><strong style="font-size:.85rem;">${esc(at.nome)}</strong><div style="font-size:.86rem;">${esc(texto)}</div></div>
                ${canEdit ? `<button class="icon-btn" data-action="removeAthletePlan" data-id="${s.id}" data-athlete="${aid}">🗑</button>` : ""}
              </div>`;
          }).join("") : `<p style="color:var(--ink-soft)">Sem notas específicas por atleta nesta sessão.</p>`}
          ${canEdit ? `
            <form data-form="addAthletePlan" style="margin-top:12px;">
              <input type="hidden" name="sessaoId" value="${s.id}">
              <div class="field-row">
                <div class="field"><label>Atleta</label><select name="atletaId">${turmaAtletas.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join("")}</select></div>
              </div>
              <div class="field"><textarea name="texto" placeholder="Nota específica para este atleta nesta sessão…" required></textarea></div>
              <button type="submit" class="btn btn-ghost btn-sm">+ Adicionar nota</button>
            </form>` : ""}
        </div>
      </div>

      <div data-tab-panel="presencas" style="${activeTab === "presencas" ? "" : "display:none"}">
        <div class="card">
          ${!canMark ? `<div class="perm-note">Sem permissão para marcar presenças.</div>` : ""}
          <div style="display:flex; gap:14px; font-size:.76rem; color:var(--ink-soft); margin-bottom:10px; flex-wrap:wrap;">
            <span><span class="chip" style="background:var(--success); color:#fff;">P</span> Presente</span>
            <span><span class="chip" style="background:var(--danger); color:#fff;">F</span> Falta</span>
            <span><span class="chip" style="background:var(--warn); color:#fff;">FJ</span> Falta justificada</span>
            <span><span class="chip" style="background:var(--info); color:#fff;">D</span> Doença</span>
          </div>
          ${turmaAtletas.map((a) => {
            const g = grupoById[a.grupoId];
            const cur = presByAthlete[a.id];
            return `
              <div class="list-row" style="cursor:default;">
                ${U.avatarHtml(a.nome, a.foto)}
                <div style="flex:1;">
                  <div class="primary-text">${esc(a.nome)}</div>
                  ${g ? `<div class="secondary-text">${esc(g.nome)}</div>` : ""}
                </div>
                <div style="display:flex; gap:4px;">
                  ${states.map((st) => `
                    <button class="att-btn ${cur && cur.estado === st ? "state-" + st : ""}" ${canMark ? "" : "disabled"} data-action="markAttendance" data-session="${s.id}" data-athlete="${a.id}" data-state="${st}">${stateLabels[st]}</button>
                  `).join("")}
                </div>
              </div>`;
          }).join("") || `<div class="empty-state">Sem atletas nesta turma.</div>`}
        </div>
      </div>

      <div data-tab-panel="comentarios" style="${activeTab === "comentarios" ? "" : "display:none"}">
        ${Views._helpers.commentBoxHtml("sessao", s.id, sessComments)}
      </div>
    `;
  }

  function afterSessaoDetail() { /* leitura dos selects feita no momento de gravar, ver actions.js */ }

  // ---------------------------------------------------------------
  // Definições
  // ---------------------------------------------------------------
  async function definicoes() {
    const isManager = Auth.isAdmin();
    const tenant = Auth.activeMembership ? await DB.get("tenants", Auth.activeMembership.tenantId) : null;
    const turma = Auth.activeMembership ? await DB.get("turmas", Auth.activeMembership.turmaId) : null;
    const queue = await DB.getAll("syncQueue");
    const pending = queue.filter((q) => !q.synced).length;

    let membrosHtml = "";
    if (isManager) {
      const [memberships, users, convites] = await Promise.all([DB.getAll("memberships"), DB.getAll("users"), DB.getAll("convites")]);
      const userById = Object.fromEntries(users.map((u) => [u.id, u]));
      const minhaTurma = memberships.filter((m) => m.turmaId === Auth.activeMembership.turmaId && m.role !== "atleta");
      const convitesPendentes = convites.filter((c) => c.turmaId === Auth.activeMembership.turmaId && c.estado === "pendente" && c.role !== "atleta");
      membrosHtml = `
      <div class="card">
        <div class="section-title"><h3 style="font-size:1rem;">Gestores e ajudantes desta turma</h3><button class="btn btn-accent btn-sm" data-action="inviteMember">+ Convidar por email</button></div>
        <table class="simple" style="margin-top:10px;">
          <thead><tr><th>Nome</th><th>Email</th><th>Papel</th><th></th></tr></thead>
          <tbody>
            ${minhaTurma.map((m) => {
              const u = userById[m.userId];
              return `<tr>
                <td>${esc(u ? u.nome : "?")}</td><td>${esc(u ? u.email : "?")}</td>
                <td><span class="chip chip-role-${m.role === "manager" ? "admin" : "user"}">${m.role === "manager" ? "Gestor" : "Ajudante"}</span></td>
                <td>${u && u.id !== Auth.current.id ? `<button class="icon-btn" data-action="removeMembership" data-id="${m.id}">🗑</button>` : `<span class="secondary-text">tu</span>`}</td>
              </tr>`;
            }).join("")}
            ${convitesPendentes.map((c) => `
              <tr>
                <td colspan="2">${esc(c.email)}</td>
                <td><span class="chip" style="background:var(--paper-2); color:var(--ink-soft);">Convite pendente — ${c.role === "manager" ? "Gestor" : "Ajudante"}</span></td>
                <td></td>
              </tr>`).join("")}
          </tbody>
        </table>
        <div class="perm-note">Gestores têm acesso total à turma. Ajudantes podem ver tudo, marcar presenças e adicionar comentários, mas não editam atletas, turmas, grupos, mesociclos ou o calendário. Um convite fica pendente até a pessoa entrar na app com esse email.</div>
      </div>`;
    }

    return `
      <div class="section-title"><h2>Definições</h2></div>
      <div class="mat-line"></div>

      <div class="card">
        <div class="eyebrow">Turma atual</div>
        <h3 style="margin-top:6px;">${esc(turma ? turma.nome : "—")}</h3>
        <p style="color:var(--ink-soft);">${esc(tenant ? tenant.nome : "")} · Plano ${esc(tenant ? tenant.plano : "—")}${tenant ? " · limite de " + tenant.limiteAtletas + " atletas" : ""}</p>
        ${Auth.memberships.length > 1 ? `<p style="font-size:.82rem; color:var(--ink-soft);">Pertences a ${Auth.memberships.length} turmas — usa o seletor no topo do menu para trocar.</p>` : ""}
      </div>

      ${membrosHtml}

      <div class="card">
        <div class="eyebrow">A tua conta</div>
        <p style="margin-top:6px;"><strong>${esc(Auth.current.nome)}</strong><br>${esc(Auth.current.email)}</p>
        <div class="perm-note">O acesso à app é feito só por email + código — não há palavras-passe para memorizar nem para fugirem de um dispositivo partilhado.</div>
      </div>

      <div class="card">
        <div class="eyebrow">Notificações</div>
        <p style="margin-top:6px;">Estado neste dispositivo: <strong id="push-status">${("Notification" in window) ? (Notification.permission === "granted" ? "Ativadas ✅" : Notification.permission === "denied" ? "Bloqueadas pelo navegador" : "Ainda não ativadas") : "Não suportado neste navegador"}</strong></p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
          <button class="btn btn-ghost btn-sm" data-action="enableNotifications">Ativar notificações</button>
          <button class="btn btn-ghost btn-sm" data-action="testNotification">Enviar notificação de teste</button>
        </div>
        <div class="perm-note">Isto ativa notificações locais neste aparelho (funciona já — experimenta o botão de teste). Para receberes avisos com a app fechada, é preciso um servidor a enviar os pushes — o backend incluído no pacote já tem esse endpoint pronto (ver docs/ARQUITETURA.md).</div>
      </div>

      <div class="card">
        <div class="eyebrow">Sincronização</div>
        <p style="margin-top:6px;">${pending} alteração(ões) por sincronizar neste dispositivo.</p>
        <button class="btn btn-ghost btn-sm" data-action="forceSync">Sincronizar agora</button>
        <div class="perm-note">Esta demonstração guarda tudo no dispositivo (IndexedDB). Numa instalação ligada ao backend, este botão envia a fila de alterações para a API — ver docs/ARQUITETURA.md.</div>
      </div>

      <div class="card">
        <div class="eyebrow">Dados</div>
        <p style="margin-top:6px;">Cópia de segurança dos dados guardados neste dispositivo.</p>
        <button class="btn btn-ghost btn-sm" data-action="exportData">Exportar dados (JSON)</button>
      </div>

      <div class="card" style="border-color:var(--danger);">
        <div class="eyebrow" style="color:var(--danger);">Zona de risco</div>
        <p style="margin-top:6px;">Repõe os dados de demonstração — apaga tudo o que foi alterado neste dispositivo.</p>
        <button class="btn btn-danger btn-sm" data-action="resetDemo">Repor dados de demonstração</button>
      </div>
    `;
  }

  function inviteFormHtml(opts) {
    opts = opts || {};
    const isAtleta = opts.tipo === "atleta";
    return `
      <div class="modal-head"><h3>${isAtleta ? "Convidar acesso do atleta" : "Convidar por email"}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      ${isAtleta ? `<p style="font-size:.86rem; color:var(--ink-soft); margin-bottom:12px;">Vai dar acesso à ficha de <strong>${esc(opts.atletaNome)}</strong> (evolução, objetivos, treinos e mensagens).</p>` : ""}
      <form data-form="sendInvite">
        <input type="hidden" name="atletaId" value="${opts.atletaId || ""}">
        <div class="field"><label>Email</label><input type="email" name="email" required placeholder="pessoa@exemplo.com"></div>
        ${!isAtleta ? `
          <div class="field"><label>Papel</label>
            <select name="role">
              <option value="ajudante">Ajudante (comentários + presenças)</option>
              <option value="manager">Gestor (acesso total, pode convidar outras pessoas)</option>
            </select>
          </div>` : `<input type="hidden" name="role" value="atleta">`}
        <div class="perm-note">Não há palavra-passe a definir — a pessoa entra com este email e confirma com um código de 6 dígitos (ver docs/ARQUITETURA.md sobre o envio real do código).</div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Enviar convite</button></div>
      </form>`;
  }

  function broadcastFormHtml() {
    return `
      <div class="modal-head"><h3>Enviar aviso a todos os atletas</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <p style="font-size:.86rem; color:var(--ink-soft); margin-bottom:12px;">Este aviso aparece para todas as contas de atleta/encarregado de educação desta turma.</p>
      <form data-form="sendBroadcast">
        <div class="field"><textarea name="texto" placeholder="Escrever aviso…" required></textarea></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-accent">Enviar a todos</button></div>
      </form>`;
  }

  // ---------------------------------------------------------------
  // Estatísticas
  // ---------------------------------------------------------------
  async function estatisticas() {
    const data = await Stats.loadAll();
    const habs = Seed.HABILIDADES;
    const att = Stats.attendanceBreakdown(data.presencas);
    const ranking = Stats.rankAthletesByAttendance(data.atletas, data.presencas);
    const melhores = ranking.slice(0, 5);
    const piores = ranking.slice(-5).reverse();
    const seguimento = Stats.followUpList(data.atletas, data.sessoes, data.presencas, { lastN: 5, minFaltas: 2 });
    const aniversarios = Stats.upcomingBirthdays(data.atletas, 60);
    const grupoAvg = Stats.groupSkillAverages(data.atletas, data.grupos, habs);
    const tipoDist = Stats.sessionTypeDistribution(data.sessoes);
    const totalTipoDist = Object.values(tipoDist).reduce((a, b) => a + b, 0) || 1;
    const mensal = Stats.monthlyAttendance(data.sessoes, data.presencas);

    return `
      <div class="section-title"><h2>Estatísticas</h2></div>
      <div class="mat-line"></div>

      <div class="grid cols-4">
        <div class="card stat-card"><div class="v">${att.total}</div><div class="l">Registos de presença</div></div>
        <div class="card stat-card"><div class="v">${att.pctPresente !== null ? att.pctPresente + "%" : "—"}</div><div class="l">Taxa geral de presença</div></div>
        <div class="card stat-card"><div class="v">${att.counts.falta}</div><div class="l">Faltas não justificadas</div></div>
        <div class="card stat-card"><div class="v">${att.counts.doenca}</div><div class="l">Ausências por doença</div></div>
      </div>

      <div class="grid cols-2" style="margin-top:14px; align-items:start;">
        <div class="card">
          <div class="eyebrow">Assiduidade por mês</div>
          ${mensal.length ? mensal.map((m) => `
            <div class="bar-row">
              <div class="label">${esc(fmtMonthLabel(m.mes))}</div>
              <div class="track"><div style="width:${m.pct || 0}%;"></div></div>
              <div class="val">${m.pct !== null ? m.pct + "%" : "—"}</div>
            </div>`).join("") : `<p style="color:var(--ink-soft)">Ainda sem dados suficientes.</p>`}
        </div>
        <div class="card">
          <div class="eyebrow">Sessões realizadas por tipo</div>
          ${Object.keys(tipoDist).length ? ["Trampolim", "Tumbling", "Solo", "Acrobática"].filter((t) => tipoDist[t]).map((t) => `
            <div class="bar-row">
              <div class="label"><span class="chip ${tipoClass(t)}">${t}</span></div>
              <div class="track"><div style="width:${Math.round((tipoDist[t] / totalTipoDist) * 100)}%;"></div></div>
              <div class="val">${tipoDist[t]}</div>
            </div>`).join("") : `<p style="color:var(--ink-soft)">Ainda sem sessões marcadas como realizadas.</p>`}
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:14px; align-items:start;">
        <div class="card">
          <div class="eyebrow">Melhor assiduidade</div>
          ${melhores.length ? melhores.map((r) => rankRow(r)).join("") : emptyMsg()}
        </div>
        <div class="card">
          <div class="eyebrow">Assiduidade mais baixa</div>
          ${piores.length ? piores.map((r) => rankRow(r)).join("") : emptyMsg()}
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:14px; align-items:start;">
        <div class="card">
          <div class="eyebrow">Atletas a acompanhar</div>
          <p style="font-size:.78rem; color:var(--ink-soft); margin-top:4px;">2+ faltas (não justificadas) nas últimas 5 sessões da respetiva turma.</p>
          ${seguimento.length ? seguimento.map((x) => `
            <div class="list-row" data-action="openAthlete" data-id="${x.atleta.id}">
              ${U.avatarHtml(x.atleta.nome, x.atleta.foto)}
              <div style="flex:1;"><div class="primary-text">${esc(x.atleta.nome)}</div></div>
              <span class="chip" style="background:var(--danger-tint); color:var(--danger);">${x.faltas}/${x.consideradas} faltas</span>
            </div>`).join("") : `<p style="color:var(--ink-soft)">Sem alertas de momento 🎉</p>`}
        </div>
        <div class="card">
          <div class="eyebrow">Aniversários (60 dias)</div>
          ${aniversarios.length ? aniversarios.map((x) => `
            <div class="list-row" data-action="openAthlete" data-id="${x.atleta.id}">
              ${U.avatarHtml(x.atleta.nome, x.atleta.foto)}
              <div style="flex:1;"><div class="primary-text">${esc(x.atleta.nome)}</div></div>
              <span class="secondary-text">${x.diffDays === 0 ? "Hoje!" : "em " + x.diffDays + " dia(s)"}</span>
            </div>`).join("") : `<p style="color:var(--ink-soft)">Sem aniversários nos próximos 60 dias.</p>`}
        </div>
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Progressão média por grupo e habilidade</div>
        <div style="overflow-x:auto; margin-top:8px;">
          <table class="simple">
            <thead><tr><th>Grupo</th>${habs.map((h) => `<th>${esc(h.split(" (")[0])}</th>`).join("")}</tr></thead>
            <tbody>
              ${grupoAvg.map((r) => `
                <tr>
                  <td><span class="chip ${U.grupoClass(r.grupo.ordem)}">${esc(r.grupo.nome.split(" - ")[0])}</span></td>
                  ${r.avgPerSkill.map((s) => `<td>${s.media.toFixed(1)}</td>`).join("")}
                </tr>`).join("") || `<tr><td colspan="${habs.length + 1}" style="color:var(--ink-soft)">Sem grupos.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  function rankRow(r) {
    return `
      <div class="list-row" data-action="openAthlete" data-id="${r.atleta.id}">
        ${U.avatarHtml(r.atleta.nome, r.atleta.foto)}
        <div style="flex:1;"><div class="primary-text">${esc(r.atleta.nome)}</div><div class="secondary-text">${r.presentes}/${r.total} sessões</div></div>
        <span class="chip" style="background:var(--primary-tint); color:var(--primary);">${r.pct}%</span>
      </div>`;
  }
  function emptyMsg() { return `<p style="color:var(--ink-soft)">Ainda sem dados suficientes.</p>`; }

  global.Views = global.Views || {};
  Object.assign(global.Views, { calendario, sessaoDetail, definicoes, estatisticas });
  global.Views._helpers = global.Views._helpers || {};
  global.Views._helpers.inviteFormHtml = inviteFormHtml;
  global.Views._helpers.broadcastFormHtml = broadcastFormHtml;
  global.afterRenderHooks = global.afterRenderHooks || [];
  global.afterRenderHooks.push(afterCalendario, afterSessaoDetail);
})(window);
