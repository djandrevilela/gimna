/* =========================================================
   Gimna — Personalização: catálogos configuráveis pelo Manager
   (habilidades, estados de presença, critérios de avaliação,
   campos personalizados do atleta, marca própria da turma)
   ========================================================= */
(function (global) {
  "use strict";
  const { esc } = U;

  async function personalizacao() {
    const turmaId = Auth.activeMembership.turmaId;
    const [turma, habilidades, estados, criterios, campos] = await Promise.all([
      DB.get("turmas", turmaId),
      U.byTurma(await DB.getAll("habilidadesTipos")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
      U.byTurma(await DB.getAll("estadosPresenca")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
      U.byTurma(await DB.getAll("criteriosAvaliacao")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
      U.byTurma(await DB.getAll("camposPersonalizados")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
    ]);
    const canEdit = Auth.isAdmin();

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

      ${catalogoSection("habilidades-tipos", "Habilidades técnicas", "habilidades", habilidades, canEdit, "newHabilidade", "editHabilidade", "deleteHabilidade", (h) => h.nome)}
      ${catalogoSection("estados-presenca", "Estados de presença", "estados", estados, canEdit, "newEstadoPresenca", "editEstadoPresenca", "deleteEstadoPresenca", (e) => `<span class="chip chip-${e.cor || "c1"}">${esc(e.nome)}</span> ${e.contaComoPresenca ? "<span class=\"secondary-text\">(conta como presença)</span>" : ""}`)}
      ${catalogoSection("criterios-avaliacao", "Critérios de avaliação (além das habilidades)", "criterios", criterios, canEdit, "newCriterio", "editCriterio", "deleteCriterio", (c) => c.nome)}
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
      habilidade: "Habilidade técnica", estadoPresenca: "Estado de presença",
      criterio: "Critério de avaliação", campoPersonalizado: "Campo personalizado",
    };
    const actions = {
      habilidade: "saveHabilidade", estadoPresenca: "saveEstadoPresenca",
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

  function afterPersonalizacao() {
    ["habilidades-tipos", "estados-presenca", "criterios-avaliacao", "campos-personalizados"].forEach((idPrefix) => {
      const container = document.getElementById("sortable-" + idPrefix);
      if (!container || !Auth.isAdmin()) return;
      U.makeSortable(container, (novaOrdemIds) => Actions.reordenarCatalogo(idPrefix, novaOrdemIds));
    });
  }

  global.Views = global.Views || {};
  Object.assign(global.Views, { personalizacao });
  global.Views._helpers = global.Views._helpers || {};
  global.Views._helpers.catalogoFormHtml = catalogoFormHtml;
  global.afterRenderHooks = global.afterRenderHooks || [];
  global.afterRenderHooks.push(afterPersonalizacao);
})(window);
