/* =========================================================
   Gimna — vistas (parte 3: mensagens + área do atleta)
   ========================================================= */
(function (global) {
  "use strict";
  const { esc, fmtDateShort, fmtDateTime, todayStr, tipoClass, initials } = U;
  const FASE_LABEL = { 1: "Iniciado", 2: "Com ajuda", 3: "A progredir", 4: "Quase autónomo", 5: "Autónomo" };

  function messageBubble(m) {
    const isManager = m.remetenteRole === "manager";
    return `
      <div style="padding:10px 0; border-bottom:1px solid var(--line);">
        <div style="font-size:.8rem; display:flex; justify-content:space-between; gap:8px;">
          <strong style="color:${isManager ? "var(--primary)" : "var(--ink)"}">${esc(m.remetenteNome)}${isManager ? " · Gestor" : ""}</strong>
          <span style="color:var(--ink-soft); white-space:nowrap;">${fmtDateTime(m.criadoEm)}</span>
        </div>
        <div style="font-size:.9rem; margin-top:3px;">${esc(m.texto)}</div>
      </div>`;
  }

  // ---------------------------------------------------------------
  // Mensagens (manager: inbox de threads + avisos · atleta: a sua thread)
  // ---------------------------------------------------------------
  async function mensagens(threadAtletaId) {
    if (Auth.isAjudante()) return `<div class="empty-state"><div class="ico">🔒</div><p>Os ajudantes não têm acesso às mensagens — só gestores e atletas.</p></div>`;

    const allMsgs = U.byTurma(await DB.getAll("mensagens"));
    const atletas = U.byTurma(await DB.getAll("atletas"));
    const atletaById = Object.fromEntries(atletas.map((a) => [a.id, a]));
    const broadcasts = allMsgs.filter((m) => m.tipo === "broadcast").sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

    if (Auth.isAtleta()) {
      const myAtletaId = Auth.activeMembership.atletaId;
      const thread = allMsgs.filter((m) => m.tipo === "privada" && m.atletaId === myAtletaId).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
      return `
        <div class="section-title"><h2>Mensagens</h2></div>
        <div class="mat-line"></div>
        <div class="card">
          <div class="eyebrow">Avisos gerais</div>
          ${broadcasts.length ? broadcasts.slice(0, 5).map((m) => messageBubble(m)).join("") : `<p style="color:var(--ink-soft)">Sem avisos por agora.</p>`}
        </div>
        <div class="card" style="margin-top:14px;">
          <div class="eyebrow">A tua conversa com a equipa técnica</div>
          <p style="font-size:.78rem; color:var(--ink-soft); margin-top:4px;">Só os gestores respondem diretamente às mensagens.</p>
          <div style="margin:10px 0;">${thread.length ? thread.map((m) => messageBubble(m)).join("") : `<p style="color:var(--ink-soft)">Ainda não há mensagens — envia a primeira abaixo.</p>`}</div>
          <form data-form="sendMessage">
            <input type="hidden" name="atletaId" value="${myAtletaId || ""}">
            <div class="field"><textarea name="texto" placeholder="Escrever mensagem…" required></textarea></div>
            <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
          </form>
        </div>
      `;
    }

    if (!threadAtletaId) {
      const threadIds = [...new Set(allMsgs.filter((m) => m.tipo === "privada").map((m) => m.atletaId))];
      const rows = threadIds.map((aid) => {
        const a = atletaById[aid];
        const msgsThread = allMsgs.filter((m) => m.atletaId === aid && m.tipo === "privada").sort((x, y) => y.criadoEm.localeCompare(x.criadoEm));
        const last = msgsThread[0];
        return { a, last, count: msgsThread.length };
      }).filter((r) => r.a).sort((x, y) => y.last.criadoEm.localeCompare(x.last.criadoEm));

      return `
        <div class="section-title"><h2>Mensagens</h2><button class="btn btn-accent btn-sm" data-action="openBroadcastModal">📣 Enviar aviso a todos</button></div>
        <div class="mat-line"></div>
        <div class="card">
          <div class="eyebrow">Conversas com atletas / encarregados de educação</div>
          ${rows.length ? rows.map((r) => `
            <div class="list-row" data-action="openThread" data-id="${r.a.id}">
              ${U.avatarHtml(r.a.nome, r.a.foto)}
              <div style="flex:1; min-width:0;">
                <div class="primary-text">${esc(r.a.nome)}</div>
                <div class="secondary-text" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(r.last.texto)}</div>
              </div>
              <span class="secondary-text">${fmtDateShort(r.last.criadoEm.slice(0, 10))}</span>
            </div>`).join("") : `<div class="empty-state">Ainda sem mensagens de atletas.</div>`}
        </div>
        <div class="card" style="margin-top:14px;">
          <div class="eyebrow">Avisos enviados</div>
          ${broadcasts.length ? broadcasts.map((m) => messageBubble(m)).join("") : `<p style="color:var(--ink-soft)">Ainda não enviaste avisos.</p>`}
        </div>
      `;
    }

    const a = atletaById[threadAtletaId] || (await DB.get("atletas", threadAtletaId));
    const thread = allMsgs.filter((m) => m.tipo === "privada" && m.atletaId === threadAtletaId).sort((x, y) => x.criadoEm.localeCompare(y.criadoEm));
    return `
      <a href="#/mensagens" style="font-size:.85rem; color:var(--ink-soft); text-decoration:none;">← Todas as conversas</a>
      <div class="section-title" style="margin-top:10px;"><h2>${esc(a ? a.nome : "Atleta")}</h2></div>
      <div class="mat-line"></div>
      <div class="card">
        <div style="margin-bottom:10px;">${thread.length ? thread.map((m) => messageBubble(m)).join("") : `<p style="color:var(--ink-soft)">Sem mensagens ainda.</p>`}</div>
        <form data-form="sendMessage">
          <input type="hidden" name="atletaId" value="${threadAtletaId}">
          <div class="field"><textarea name="texto" placeholder="Responder…" required></textarea></div>
          <button class="btn btn-primary btn-sm" type="submit">Responder</button>
        </form>
      </div>
    `;
  }

  // ---------------------------------------------------------------
  // Área do atleta
  // ---------------------------------------------------------------
  async function dashboardAtleta() {
    const atletaId = Auth.activeMembership.atletaId;
    const atleta = atletaId ? await DB.get("atletas", atletaId) : null;
    const sessoes = U.byTurma(await DB.getAll("sessoes"));
    const today = todayStr();
    const proxima = sessoes.filter((s) => s.tipo && s.data >= today).sort((a, b) => a.data.localeCompare(b.data))[0];
    const msgs = U.byTurma(await DB.getAll("mensagens"));
    const avisos = msgs.filter((m) => m.tipo === "broadcast").sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 3);
    const presencas = atletaId ? (await DB.getAll("presencas")).filter((p) => p.atletaId === atletaId) : [];
    const total = presencas.length, presentes = presencas.filter((p) => p.estado === "presente").length;
    const pct = total ? Math.round((presentes / total) * 100) : null;

    return `
      <div class="section-title"><h2>Olá${atleta ? ", " + esc(atleta.nome.split(" ")[0]) : ""} 👋</h2></div>
      <div class="mat-line"></div>
      <div class="grid cols-2">
        <div class="card">
          <div class="eyebrow">Próximo treino</div>
          ${proxima ? `<h3 style="margin:6px 0 10px;">${fmtDateShort(proxima.data)} · ${proxima.diaSemana}</h3><span class="chip ${tipoClass(proxima.tipo)}">${esc(proxima.tipo)}</span>` : `<p>Sem treinos agendados.</p>`}
        </div>
        <div class="card stat-card"><div class="v">${pct !== null ? pct + "%" : "—"}</div><div class="l">A tua presença esta época</div></div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Avisos recentes</div>
        ${avisos.length ? avisos.map((m) => messageBubble(m)).join("") : `<p style="color:var(--ink-soft)">Sem avisos recentes.</p>`}
      </div>
      <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
        <a class="btn btn-ghost btn-sm" href="#/minha-evolucao">📈 A minha evolução</a>
        <a class="btn btn-ghost btn-sm" href="#/objetivos">🎯 Objetivos da época</a>
        <a class="btn btn-ghost btn-sm" href="#/mensagens">💬 Mensagens</a>
      </div>
    `;
  }

  function sessionRowReadOnly(s) {
    return `
      <div class="list-row" style="cursor:default;">
        <div style="width:56px; flex-shrink:0;">
          <div style="font-weight:700;">${s.data.slice(8, 10)}</div>
          <div style="font-size:.7rem; color:var(--ink-soft);">${U.MESES[parseInt(s.data.slice(5, 7), 10) - 1]}</div>
        </div>
        <div style="flex:1;"><div class="primary-text">${s.diaSemana}</div><span class="chip ${tipoClass(s.tipo)}">${esc(s.tipo)}</span></div>
      </div>`;
  }

  function sessionRowExpandable(s, atleta) {
    const planoGeral = s.planoConteudo || "Sem plano definido.";
    const planoGrupo = atleta && atleta.grupoId && s.planosGrupo && s.planosGrupo[atleta.grupoId] ? s.planosGrupo[atleta.grupoId] : null;
    const notaPropria = atleta && s.planosAtleta && s.planosAtleta[atleta.id] ? s.planosAtleta[atleta.id] : null;
    const detailId = "plano-" + s.id;
    return `
      <div class="list-row" data-action="toggleDetalhe" data-target="${detailId}" style="cursor:pointer;">
        <div style="width:56px; flex-shrink:0;">
          <div style="font-weight:700;">${s.data.slice(8, 10)}</div>
          <div style="font-size:.7rem; color:var(--ink-soft);">${U.MESES[parseInt(s.data.slice(5, 7), 10) - 1]}</div>
        </div>
        <div style="flex:1;"><div class="primary-text">${s.diaSemana}</div><span class="chip ${tipoClass(s.tipo)}">${esc(s.tipo)}</span></div>
        <span style="color:var(--ink-soft); font-size:.78rem;">Ver plano ▾</span>
      </div>
      <div id="${detailId}" style="display:none; padding:0 10px 14px 70px; font-size:.86rem; border-bottom:1px solid var(--line);">
        <div style="margin-bottom:8px;"><strong>Plano geral:</strong><br><span style="white-space:pre-line;">${esc(planoGeral)}</span></div>
        ${planoGrupo ? `<div style="margin-bottom:8px;"><strong>Plano do teu grupo:</strong><br><span style="white-space:pre-line;">${esc(planoGrupo)}</span></div>` : ""}
        ${notaPropria ? `<div><strong>Nota para ti:</strong><br><span style="white-space:pre-line;">${esc(notaPropria)}</span></div>` : ""}
      </div>`;
  }

  async function meusTreinos() {
    const atletaId = Auth.activeMembership.atletaId;
    const atleta = atletaId ? await DB.get("atletas", atletaId) : null;
    const sessoes = U.byTurma(await DB.getAll("sessoes"));
    const today = todayStr();
    const futuras = sessoes.filter((s) => s.tipo && s.data >= today).sort((a, b) => a.data.localeCompare(b.data));
    const passadas = sessoes.filter((s) => s.tipo && s.data < today).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
    return `
      <div class="section-title"><h2>Os Meus Treinos</h2></div>
      <div class="mat-line"></div>
      <p style="color:var(--ink-soft); font-size:.85rem; margin-bottom:10px;">Toca num treino para ver o plano — o plano geral, o do teu grupo (se houver) e notas só para ti.</p>
      <div class="card">
        <div class="eyebrow">Próximos treinos (${futuras.length})</div>
        <div style="max-height:55vh; overflow-y:auto;">${futuras.length ? futuras.map((s) => sessionRowExpandable(s, atleta)).join("") : `<p style="color:var(--ink-soft)">Sem treinos agendados.</p>`}</div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Últimos treinos</div>
        ${passadas.length ? passadas.map((s) => sessionRowExpandable(s, atleta)).join("") : `<p style="color:var(--ink-soft)">Ainda sem treinos realizados.</p>`}
      </div>
    `;
  }

  async function minhaEvolucao() {
    const atletaId = Auth.activeMembership.atletaId;
    const atleta = atletaId ? await DB.get("atletas", atletaId) : null;
    if (!atleta) return `<div class="empty-state">A tua conta ainda não está associada a uma ficha de atleta.</div>`;
    const grupo = atleta.grupoId ? await DB.get("grupos", atleta.grupoId) : null;
    const presencas = (await DB.getAll("presencas")).filter((p) => p.atletaId === atletaId);
    const total = presencas.length, presentes = presencas.filter((p) => p.estado === "presente").length;
    const pct = total ? Math.round((presentes / total) * 100) : null;
    const habilidades = Seed.HABILIDADES;
    const fases = atleta.habilidades || {};

    return `
      <div class="section-title"><h2>A Minha Evolução</h2></div>
      <div class="mat-line"></div>
      <div class="grid cols-2">
        <div class="card stat-card"><div class="v">${pct !== null ? pct + "%" : "—"}</div><div class="l">Presença (${presentes}/${total} sessões)</div></div>
        <div class="card"><div class="eyebrow">Grupo de treino</div><p style="margin-top:6px;">${grupo ? `<span class="chip ${U.grupoClass(grupo.ordem)}">${esc(grupo.nome)}</span>` : "Ainda sem grupo atribuído."}</p></div>
      </div>
      <div class="card" style="margin-top:14px;">
        <p style="color:var(--ink-soft); font-size:.85rem;">Cada habilidade evolui em 5 passos, do "Iniciado" ao "Autónomo".</p>
        ${habilidades.map((h) => {
          const fase = fases[h] || 1;
          return `
            <div style="margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; font-size:.86rem; margin-bottom:5px;">
                <strong>${esc(h)}</strong><span style="color:var(--ink-soft)">${esc(FASE_LABEL[fase])}</span>
              </div>
              <div class="skill-phase-track">${[1, 2, 3, 4, 5].map((n) => `<div class="seg ${n <= fase ? "on" : ""}"></div>`).join("")}</div>
            </div>`;
        }).join("")}
      </div>
    `;
  }

  async function objetivos() {
    const [list, turma] = await Promise.all([
      DB.getAll("mesociclos").then((r) => U.byTurma(r).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))),
      DB.get("turmas", Auth.activeMembership.turmaId),
    ]);
    const atletaId = Auth.activeMembership.atletaId;
    const atleta = atletaId ? await DB.get("atletas", atletaId) : null;
    const resumo = (turma && turma.resumoObjetivos) || "O treinador ainda não definiu o resumo do plano geral para esta época.";

    return `
      <div class="section-title"><h2>Objetivos da Época</h2></div>
      <div class="mat-line"></div>
      <div class="card">
        <div class="eyebrow">Resumo do plano geral</div>
        <p style="margin-top:6px; white-space:pre-line;">${esc(resumo)}</p>
      </div>

      ${atleta && atleta.objetivosCoach ? `
        <div class="card" style="margin-top:14px;">
          <div class="eyebrow">O que o treinador definiu para ti</div>
          <p style="margin-top:6px; white-space:pre-line;">${esc(atleta.objetivosCoach)}</p>
        </div>` : ""}

      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Os teus objetivos para o final do ano</div>
        <p style="font-size:.82rem; color:var(--ink-soft); margin-top:4px;">Escreve aqui o que queres conseguir até ao final da época — o treinador também vê isto.</p>
        <form data-form="saveObjetivoProprio" style="margin-top:10px;">
          <textarea name="objetivosProprios" placeholder="Ex.: Quero conseguir fazer o mortal à frente sozinho!">${esc((atleta && atleta.objetivosProprios) || "")}</textarea>
          <button type="submit" class="btn btn-primary btn-sm" style="margin-top:8px;">Guardar</button>
        </form>
      </div>

      <div class="section-title" style="margin-top:20px;"><h3 style="font-size:1.05rem;">Mesociclos</h3></div>
      ${list.map((m) => `
        <div class="card">
          <h3>${esc(m.nome)}</h3>
          <div class="secondary-text">${fmtDateShort(m.dataInicio)} — ${fmtDateShort(m.dataFim)}</div>
          <p style="margin-top:8px;">${esc(m.objetivo || "")}</p>
        </div>
      `).join("")}
    `;
  }

  async function semTurma() {
    return `
      <div class="empty-state">
        <div class="ico">🏫</div>
        <h3>Ainda não pertences a nenhuma turma</h3>
        <p style="color:var(--ink-soft); margin-top:8px; max-width:440px; margin-left:auto; margin-right:auto;">
          Se és treinador(a)/gestor(a), podes criar a tua primeira turma agora. Se estás à espera de um convite, pede à pessoa responsável para usar este email: <strong>${esc(Auth.current.email)}</strong> — o acesso ativa-se automaticamente assim que entrares.
        </p>
        <button class="btn btn-primary" style="margin-top:14px;" data-action="newTurmaFirstRun">Criar a minha primeira turma</button>
      </div>`;
  }

  global.Views = global.Views || {};
  Object.assign(global.Views, { mensagens, dashboardAtleta, meusTreinos, minhaEvolucao, objetivos, semTurma });
})(window);
