/* =========================================================
   Gimna — geração da época a partir da configuração da turma
   Os "microciclos" (Trampolim, Tumbling, Solo, Acrobática, ou o que
   o treinador quiser chamar-lhes) formam um catálogo próprio da turma,
   totalmente editável — ver "Época e Mesociclos" na app. Cada mesociclo
   pode ainda substituir o plano genérico de um microciclo só para o
   seu próprio período.
   ========================================================= */
(function (global) {
  "use strict";
  const DIA_NOME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const CORES = ["c1", "c2", "c3", "c4", "c5", "c6"];

  function fmt(d) { return d.toISOString().slice(0, 10); }

  // Catálogo por omissão, usado só quando a turma ainda não tem nenhum
  // microciclo definido (primeira configuração).
  function defaultCatalogo() {
    return [
      { nome: "Trampolim", cor: "c1", planoGenerico: "Aquecimento geral + preparação física específica.\nEstação por grupo — progressões de mortal à frente/atrás e barani, de acordo com a fase de cada grupo." },
      { nome: "Tumbling", cor: "c2", planoGenerico: "Aquecimento geral + preparação física específica.\nEstação por grupo — rondada, roda, flic-flac." },
      { nome: "Solo", cor: "c3", planoGenerico: "Aquecimento geral + preparação física específica.\nEstação por grupo — pino, equilíbrios, pino-roda-sentado." },
      { nome: "Acrobática", cor: "c4", planoGenerico: "Aquecimento geral + jogos de confiança.\nTrabalho a pares/trios adequado ao grupo." },
    ];
  }

  function defaultPattern(diasSemana, catalogo) {
    const nomes = (catalogo && catalogo.length ? catalogo : defaultCatalogo()).map((c) => c.nome);
    const pattern = { 1: {}, 2: {}, 3: {}, 0: {} };
    [1, 2, 3, 0].forEach((w, wi) => {
      diasSemana.forEach((dow) => { pattern[w][dow] = nomes[wi % nomes.length]; });
    });
    return pattern;
  }

  function corParaNome(nome, catalogo) {
    const found = (catalogo || []).find((c) => c.nome === nome);
    if (found && found.cor) return found.cor;
    let hash = 0;
    for (let i = 0; i < (nome || "").length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
    return CORES[hash % CORES.length];
  }

  function mesocicloFor(dateStr, mesociclos) {
    for (const m of mesociclos) if (dateStr >= m.dataInicio && dateStr <= m.dataFim) return m;
    return null;
  }

  // Resolve o texto do plano para um dado tipo/microciclo: primeiro tenta
  // a substituição específica desse mesociclo; depois o genérico do
  // catálogo; por fim vazio.
  function resolverPlano(nomeMicrociclo, meso, catalogo) {
    if (meso && meso.planosPorMicrociclo && meso.planosPorMicrociclo[nomeMicrociclo]) {
      return (meso ? `[${meso.nome}] ` : "") + meso.planosPorMicrociclo[nomeMicrociclo];
    }
    const cat = (catalogo || []).find((c) => c.nome === nomeMicrociclo);
    const generico = cat ? cat.planoGenerico : "";
    return (meso ? `[${meso.nome}] ` : "") + (generico || "");
  }

  function generateSessions(turma, mesociclos, catalogo) {
    if (!turma.epocaInicio || !turma.epocaFim || !turma.diasSemana || !turma.diasSemana.length) return [];
    catalogo = catalogo && catalogo.length ? catalogo : defaultCatalogo();
    const diasSemana = turma.diasSemana.slice().sort();
    const pattern = turma.padraoMicrociclo || defaultPattern(diasSemana, catalogo);
    const feriadosMap = Object.fromEntries((turma.feriados || []).map((f) => [f.data, f.nome]));
    const start = new Date(turma.epocaInicio + "T00:00:00");
    const end = new Date(turma.epocaFim + "T00:00:00");

    const sessions = [];
    let weekCounter = 0, lastMonday = null;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (!diasSemana.includes(dow)) continue;
      const monday = new Date(d); monday.setDate(d.getDate() - ((dow + 6) % 7));
      const mondayStr = fmt(monday);
      if (mondayStr !== lastMonday) { weekCounter++; lastMonday = mondayStr; }
      const semanaCiclo = ((weekCounter - 1) % 4) + 1;
      const dateStr = fmt(d);
      const holidayNome = feriadosMap[dateStr];
      const meso = mesocicloFor(dateStr, mesociclos);
      let tipo = null;
      if (!holidayNome) {
        const wk = pattern[semanaCiclo % 4] || {};
        tipo = wk[dow] || catalogo[0].nome;
      }
      sessions.push({
        tenantId: turma.tenantId, turmaId: turma.id, data: dateStr,
        diaSemana: DIA_NOME[dow], semanaCiclo, mesocicloId: meso ? meso.id : null,
        tipo: holidayNome ? null : tipo,
        categoria: "treino",
        feriado: holidayNome || null,
        planoConteudo: holidayNome ? "" : resolverPlano(tipo, meso, catalogo),
        planosGrupo: {}, planosAtleta: {},
        estado: holidayNome ? "feriado" : "planeada",
      });
    }
    return sessions;
  }

  global.Season = { generateSessions, defaultPattern, defaultCatalogo, corParaNome, resolverPlano, DIA_NOME };
})(window);
