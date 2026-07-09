// =========================================================
// Mesma lógica de ../js/season.js, em CommonJS, para o backend
// poder gerar sessões sem depender do browser.
// =========================================================
const DIA_NOME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const CORES = ["c1", "c2", "c3", "c4", "c5", "c6"];

function fmt(d) { return d.toISOString().slice(0, 10); }

function defaultCatalogo() {
  return [
    { nome: "Trampolim", cor: "c1", planoGenerico: "Aquecimento geral + preparação física específica.\nEstação por grupo — progressões de mortal à frente/atrás e barani." },
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

function mesocicloFor(dateStr, mesociclos) {
  for (const m of mesociclos) if (dateStr >= m.dataInicio && dateStr <= m.dataFim) return m;
  return null;
}

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
      tipo: holidayNome ? null : tipo, categoria: "treino",
      feriado: holidayNome || null,
      planoConteudo: holidayNome ? "" : resolverPlano(tipo, meso, catalogo),
      planosGrupo: {}, planosAtleta: {},
      estado: holidayNome ? "feriado" : "planeada",
    });
  }
  return sessions;
}

module.exports = { generateSessions, defaultPattern, defaultCatalogo, DIA_NOME };
