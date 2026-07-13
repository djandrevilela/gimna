/* =========================================================
   Gimna — Personalização: catálogos configuráveis pelo Manager
   (habilidades + critérios de progresso, categorias de objetivos,
   estados de presença, critérios de avaliação, campos personalizados
   do atleta, marca própria e cores de progresso da turma)
   ========================================================= */
(function (global) {
  "use strict";
  const { esc } = U;

  async function personalizacao() {
    const turmaId = Auth.activeMembership.turmaId;
    const [turma, habilidades, categorias, estados, criterios, campos] = await Promise.all([
      DB.get("turmas", turmaId),
      U.getHabilidadesCatalogo(),
      U.getCategoriasHabilidades(),
      U.byTurma(await DB.getAll("estadosPresenca")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
      U.byTurma(await DB.getAll("criteriosAvaliacao")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
      U.byTurma(await DB.getAll("camposPersonalizados")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
    ]);
    const canEdit = Auth.isAdmin();
    const categoriaById = Object.fromEntries(categorias.map((c) => [c.id, c]));
    const cores = U.coresProgresso(turma);

    return `
      <div class="section-title"><h2>Personalização</h2></div>
      <div class="mat-line"></div>
      <p style="color:var(--ink-soft);">Ajusta a app ao vocabulário e às regras do teu ginásio. Tudo aqui é específico desta turma.</p>

      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Marca própria</div>
        <p style="font-size:.82rem; color:var(--ink-soft); margin-top:4px;">As cores aplicam-se à app sempre que estiveres nesta turma.</p>
        <form data-form="saveMarca" style="margin-top:8px;">
          <div class="field-row">
            <div class="field"><label>Cor principal</label><input type="color" name="corPrimaria" value="${turma.corPrimaria || "#1F4E5F"}" ${canEdit ? "" : "disabled"} style="height:42px; padding:4px;"></div>
            <div class="field"><label>Cor de destaque</label><input type="color" name="corAccent" value="${turma.corAccent || "#C0522D"}" ${canEdit ? "" : "disabled"} style="height:42px; padding:4px;"></div>
          </div>
          ${canEdit ? `<button type="submit" class="btn btn-primary btn-sm">Guardar marca</button> <button type="button" class="btn btn-ghost btn-sm" data-action="resetMarca">Repor cores por omissão</button>` : ""}
        </form>
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Cores de progresso</div>
        <p style="font-size:.82rem; color:var(--ink-soft); margin-top:4px;">Usadas nas barras de evolução que os encarregados de educação veem — cada nível tem sempre uma cor positiva, mesmo no início.</p>
        <form data-form="saveCoresProgresso" style="margin-top:8px;">
          <div style="display:flex; gap:14px; flex-wrap:wrap;">
            ${[1, 2, 3, 4, 5].map((n) => `
              <div class="field" style="width:auto;">
                <label>Nível ${n}</label>
                <input type="color" name="cor_${n}" value="${cores[n - 1]}" ${canEdit ? "" : "disabled"} style="height:42px; width:64px; padding:4px;">
              </div>
            `).join("")}
          </div>
          ${canEdit ? `<button type="submit" class="btn btn-primary btn-sm" style="margin-top:8px;">Guardar cores</button> <button type="button" class="btn btn-ghost btn-sm" data-action="resetCoresProgresso">Repor cores base</button>` : ""}
        </form>
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="eyebrow">Resumo periódico automático</div>
        <p style="font-size:.82rem; color:var(--ink-soft); margin-top:4px;">Envia um resumo de presença e atividade por notificação a treinadores, ajudantes e atletas.</p>
        <form data-form="saveResumoPeriodicidade" style="margin-top:8px;">
          <select name="resumoPeriodicidade" ${canEdit ? "" : "disabled"}>
            <option value="off" ${(!turma.resumoPeriodicidade || turma.resumoPeriodicidade === "off") ? "selected" : ""}>Desligado</option>
            <option value="semanal" ${turma.resumoPeriodicidade === "semanal" ? "selected" : ""}>Semanal (às segundas-feiras)</option>
            <option value="mensal" ${turma.resumoPeriodicidade === "mensal" ? "selected" : ""}>Mensal (dia 1)</option>
          </select>
          ${canEdit ? `<button type="submit" class="btn btn-primary btn-sm">Guardar</button>` : ""}
        </form>
        <div class="perm-note">Precisa do backend real ligado (ver Definições → Ligação ao servidor) e de um cron externo a chamar o envio — ver docs/ARQUITETURA.md.</div>
      </div>

      <div class="section-title" style="margin-top:20px;">
        <h3 style="font-size:1.05rem;">Categorias de objetivos</h3>
        ${canEdit ? `<div style="display:flex; gap:8px;"><button class="btn btn-ghost btn-sm" data-action="copiarCategoriasMicrociclos">Copiar dos microciclos</button><button class="btn btn-accent btn-sm" data-action="newCategoriaHabilidade">+ Nova categoria</button></div>` : ""}
      </div>
      <div class="mat-line"></div>
      <p style="color:var(--ink-soft); font-size:.85rem; margin-bottom:8px;">Agrupam os objetivos por área (ex.: "Solo", "Trampolim") — é assim que aparecem organizados aos encarregados de educação.</p>
      <div class="card" id="sortable-categorias-habilidades">
        ${categorias.length ? categorias.map((c) => `
          <div class="list-row" data-sortable-id="${c.id}">
            ${canEdit ? `<span class="drag-handle">⠿</span>` : ""}
            <div style="flex:1;"><span class="chip chip-${c.cor || "c1"}">${esc(c.nome)}</span></div>
            ${canEdit ? `
              <button class="icon-btn" data-action="editCategoriaHabilidade" data-id="${c.id}">✎</button>
              <button class="icon-btn" data-action="deleteCategoriaHabilidade" data-id="${c.id}">🗑</button>
            ` : ""}
          </div>
        `).join("") : `<div class="empty-state">Ainda sem categorias — usa "Copiar dos microciclos" ou "+ Nova categoria".</div>`}
      </div>

      <div class="section-title" style="margin-top:20px;"><h3 style="font-size:1.05rem;">Objetivos técnicos (habilidades)</h3>${canEdit ? `<button class="btn btn-accent btn-sm" data-action="newHabilidade">+ Novo objetivo</button>` : ""}</div>
      <div class="mat-line"></div>
      <p style="color:var(--ink-soft); font-size:.85rem; margin-bottom:8px;">Para cada objetivo, define o que marca a passagem a cada um dos 5 níveis de progresso.</p>
      <div class="card" id="sortable-habilidades-tipos">
        ${habilidades.length ? habilidades.map((h) => {
          const cat = categoriaById[h.categoriaId];
          const nCriterios = h.criterios ? Object.values(h.criterios).filter(Boolean).length : 0;
          return `
          <div class="list-row" data-sortable-id="${h.id}">
            ${canEdit ? `<span class="drag-handle">⠿</span>` : ""}
            <div style="flex:1;">
              <div>${esc(h.nome)}</div>
              <div class="secondary-text">${cat ? `<span class="chip chip-${cat.cor || "c1"}" style="font-size:.68rem;">${esc(cat.nome)}</span> · ` : ""}${nCriterios}/5 critérios de progresso definidos</div>
            </div>
            ${canEdit ? `
              <button class="icon-btn" data-action="editHabilidade" data-id="${h.id}">✎</button>
              <button class="icon-btn" data-action="deleteHabilidade" data-id="${h.id}">🗑</button>
            ` : ""}
          </div>`;
        }).join("") : `<div class="empty-state">Ainda sem objetivos — usa "+ Novo objetivo".</div>`}
      </div>

      ${catalogoSection("estados-presenca", "Estados de presença", "estados", estados, canEdit, "newEstadoPresenca", "editEstadoPresenca", "deleteEstadoPresenca", (e) => `<span class="chip chip-${e.cor || "c1"}">${esc(e.nome)}</span> ${e.contaComoPresenca ? "<span class=\"secondary-text\">(conta como presença)</span>" : ""}`)}
      ${catalogoSection("criterios-avaliacao", "Critérios de avaliação (além dos objetivos técnicos)", "criterios", criterios, canEdit, "newCriterio", "editCriterio", "deleteCriterio", (c) => c.nome)}
      ${catalogoSection("campos-personalizados", "Campos personalizados do atleta", "campos", campos, canEdit, "newCampoPersonalizado", "editCampoPersonalizado", "deleteCampoPersonalizado", (c) => `${esc(c.nome)} <span class="secondary-text">(${{ texto: "texto", data: "data", checkbox: "sim/não" }[c.tipo] || "texto"})</span>`)}
    `;
  }

  function catalogoSection(idPrefix, titulo, storeKey, items, canEdit, actionNew, actionEdit, actionDelete, renderLabel) {
    return `
      <div class="section-title" style="margin-top:20px;"><h3 style="font-size:1.05rem;">${esc(titulo)}</h3>${canEdit ? `<button class="btn btn-accent btn-sm" data-action="${actionNew}">+ Adicionar</button>` : ""}</div>
      <div class="mat-line"></div>
      <div class="card" id="sortable-${idPrefix}">
        ${items.length ? items.map((item) => `
          <div class="list-row" data-sortable-id="${item.id}" data-store="${storeKey}">
            ${canEdit ? `<span class="drag-handle">⠿</span>` : ""}
            <div style="flex:1;">${renderLabel(item)}</div>
            ${canEdit ? `
              <button class="icon-btn" data-action="${actionEdit}" data-id="${item.id}">✎</button>
              <button class="icon-btn" data-action="${actionDelete}" data-id="${item.id}">🗑</button>
            ` : ""}
          </div>
        `).join("") : `<div class="empty-state">Ainda sem itens — usa "+ Adicionar".</div>`}
      </div>
    `;
  }

  function catalogoFormHtml(tipo, item) {
    item = item || {};
    const titulos = {
      estadoPresenca: "Estado de presença",
      criterio: "Critério de avaliação", campoPersonalizado: "Campo personalizado",
    };
    const actions = {
      estadoPresenca: "saveEstadoPresenca",
      criterio: "saveCriterio", campoPersonalizado: "saveCampoPersonalizado",
    };
    let camposExtra = "";
    if (tipo === "estadoPresenca") {
      camposExtra = `
        <div class="field"><label>Cor</label>
          <select name="cor">${["c1", "c2", "c3", "c4", "c5", "c6"].map((c) => `<option value="${c}" ${item.cor === c ? "selected" : ""}>${c}</option>`).join("")}</select>
        </div>
        <div class="field"><label><input type="checkbox" name="contaComoPresenca" ${item.contaComoPresenca ? "checked" : ""} style="width:auto; margin-right:6px;">Conta como presença nas estatísticas</label></div>
      `;
    }
    if (tipo === "campoPersonalizado") {
      camposExtra = `
        <div class="field"><label>Tipo de campo</label>
          <select name="tipo">
            <option value="texto" ${item.tipo === "texto" || !item.tipo ? "selected" : ""}>Texto</option>
            <option value="data" ${item.tipo === "data" ? "selected" : ""}>Data</option>
            <option value="checkbox" ${item.tipo === "checkbox" ? "selected" : ""}>Sim/Não</option>
          </select>
        </div>
      `;
    }
    return `
      <div class="modal-head"><h3>${item.id ? "Editar" : "Novo"} — ${titulos[tipo]}</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="${actions[tipo]}">
        <input type="hidden" name="id" value="${item.id || ""}">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(item.nome || "")}"></div>
        ${camposExtra}
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;
  }

  function categoriaHabilidadeFormHtml(item) {
    item = item || {};
    return `
      <div class="modal-head"><h3>${item.id ? "Editar" : "Nova"} categoria de objetivos</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveCategoriaHabilidade">
        <input type="hidden" name="id" value="${item.id || ""}">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(item.nome || "")}" placeholder="Ex.: Solo, Trampolim"></div>
        <div class="field"><label>Cor</label>
          <select name="cor">${["c1", "c2", "c3", "c4", "c5", "c6"].map((c) => `<option value="${c}" ${item.cor === c ? "selected" : ""}>${c}</option>`).join("")}</select>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;
  }

  function habilidadeFormHtml(item, categorias) {
    item = item || {};
    categorias = categorias || [];
    const criterios = item.criterios || {};
    return `
      <div class="modal-head"><h3>${item.id ? "Editar" : "Novo"} objetivo técnico</h3><button class="icon-btn" data-action="closeModal">✕</button></div>
      <form data-form="saveHabilidade">
        <input type="hidden" name="id" value="${item.id || ""}">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(item.nome || "")}" placeholder="Ex.: Barani"></div>
        <div class="field"><label>Categoria</label>
          <select name="categoriaId">
            <option value="">— sem categoria —</option>
            ${categorias.map((c) => `<option value="${c.id}" ${item.categoriaId === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
          </select>
        </div>
        <div class="mat-line"></div>
        <div class="eyebrow">Critério de progresso em cada nível</div>
        <p style="font-size:.8rem; color:var(--ink-soft); margin:4px 0 10px;">O que marca a chegada a cada nível — é isto que aparece na ficha do atleta como próximo objetivo.</p>
        ${[1, 2, 3, 4, 5].map((n) => `
          <div class="field"><label>Nível ${n}</label><input name="criterio_${n}" value="${esc(criterios[n] || "")}" placeholder="${n === 1 ? "Ex.: Ainda a trabalhar a base" : "Ex.: O que o atleta já consegue fazer"}"></div>
        `).join("")}
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`;
  }

  function afterPersonalizacao() {
    ["estados-presenca", "criterios-avaliacao", "campos-personalizados", "categorias-habilidades", "habilidades-tipos"].forEach((idPrefix) => {
      const container = document.getElementById("sortable-" + idPrefix);
      if (!container || !Auth.isAdmin()) return;
      U.makeSortable(container, (novaOrdemIds) => Actions.reordenarCatalogo(idPrefix, novaOrdemIds));
    });
  }

  global.Views = global.Views || {};
  Object.assign(global.Views, { personalizacao });
  global.Views._helpers = global.Views._helpers || {};
  global.Views._helpers.catalogoFormHtml = catalogoFormHtml;
  global.Views._helpers.categoriaHabilidadeFormHtml = categoriaHabilidadeFormHtml;
  global.Views._helpers.habilidadeFormHtml = habilidadeFormHtml;
  global.afterRenderHooks = global.afterRenderHooks || [];
  global.afterRenderHooks.push(afterPersonalizacao);
})(window);
