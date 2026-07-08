/* =========================================================
   AnimaKids — geração da época a partir da configuração da turma
   (dias de treino, horário, período, feriados e padrão do microciclo
   são todos definidos pelo Manager na app — ver views "Época e Mesociclos")
   ========================================================= */
(function (global) {
  "use strict";
  const TIPOS = ["Trampolim", "Tumbling", "Solo", "Acrobática"];
  const DIA_NOME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  function fmt(d) { return d.toISOString().slice(0, 10); }

  function defaultPattern(diasSemana) {
    const pattern = { 1: {}, 2: {}, 3: {}, 0: {} };
    [1, 2, 3, 0].forEach((w, wi) => {
      diasSemana.forEach((dow) => { pattern[w][dow] = TIPOS[wi % TIPOS.length]; });
    });
    return pattern;
  }

  function defaultPlanoFor(tipo, mesoNome) {
    const bancos = {
      Trampolim: "Aquecimento geral + preparação física específica.\nEstação por grupo — progressões de mortal à frente/atrás e barani, de acordo com a fase de cada grupo.",
      Tumbling: "Aquecimento geral + preparação física específica.\nEstação por grupo — rondada, roda, flic-flac.",
      Solo: "Aquecimento geral + preparação física específica.\nEstação por grupo — pino, equilíbrios, pino-roda-sentado.",
      "Acrobática": "Aquecimento geral + jogos de confiança.\nTrabalho a pares/trios adequado ao grupo.",
    };
    return (mesoNome ? `[${mesoNome}] ` : "") + (bancos[tipo] || "");
  }

  function mesocicloFor(dateStr, mesociclos) {
    for (const m of mesociclos) if (dateStr >= m.dataInicio && dateStr <= m.dataFim) return m;
    return null;
  }

  function generateSessions(turma, mesociclos) {
    if (!turma.epocaInicio || !turma.epocaFim || !turma.diasSemana || !turma.diasSemana.length) return [];
    const diasSemana = turma.diasSemana.slice().sort();
    const pattern = turma.padraoMicrociclo || defaultPattern(diasSemana);
    const feriadosMap = Object.fromEntries((turma.feriados || []).map((f) => [f.data, f.nome]));
    const start = new Date(turma.epocaInicio + "T00:00:00");
    const end = new Date(turma.epocaFim + "T00:00:00");

    const sessions = [];
    let weekCounter = 0, lastMonday = null, nSess = 0;
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
        tipo = wk[dow] || TIPOS[0];
      }
      sessions.push({
        tenantId: turma.tenantId, turmaId: turma.id, data: dateStr,
        diaSemana: DIA_NOME[dow], semanaCiclo, mesocicloId: meso ? meso.id : null,
        tipo: holidayNome ? null : tipo,
        feriado: holidayNome || null,
        planoConteudo: holidayNome ? "" : defaultPlanoFor(tipo, meso ? meso.nome : null),
        planosGrupo: {}, planosAtleta: {},
        estado: holidayNome ? "feriado" : "planeada",
      });
    }
    return sessions;
  }

  global.Season = { generateSessions, defaultPattern, DIA_NOME, TIPOS };
})(window);
