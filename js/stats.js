/* =========================================================
   Gimna — estatísticas (cálculos partilhados)
   ========================================================= */
(function (global) {
  "use strict";

  function pct(n, d) { return d ? Math.round((n / d) * 100) : null; }

  async function loadAll() {
    const [atletas, grupos, turmas, sessoes, presencas, comentarios, mesociclos, avaliacoes] = await Promise.all([
      DB.getAll("atletas"), DB.getAll("grupos"), DB.getAll("turmas"), DB.getAll("sessoes"), DB.getAll("presencas"), DB.getAll("comentarios"),
      DB.getAll("mesociclos"), DB.getAll("avaliacoes"),
    ]);
    return {
      atletas: U.byTurma(atletas), grupos: U.byTurma(grupos), turmas: U.byTenant(turmas),
      sessoes: U.byTurma(sessoes), presencas: U.byTenant(presencas), comentarios: U.byTenant(comentarios),
      mesociclos: U.byTurma(mesociclos), avaliacoes: U.byTenant(avaliacoes),
    };
  }

  function attendanceBreakdown(presencas) {
    const total = presencas.length;
    const counts = { presente: 0, falta: 0, falta_justificada: 0, doenca: 0 };
    presencas.forEach((p) => { if (counts[p.estado] !== undefined) counts[p.estado]++; });
    return { total, counts, pctPresente: pct(counts.presente, total) };
  }

  function athletePct(atletaId, presencas) {
    const mine = presencas.filter((p) => p.atletaId === atletaId);
    const presentes = mine.filter((p) => p.estado === "presente").length;
    return { total: mine.length, presentes, pct: pct(presentes, mine.length) };
  }

  function rankAthletesByAttendance(atletas, presencas) {
    return atletas.filter((a) => a.ativo).map((a) => Object.assign({ atleta: a }, athletePct(a.id, presencas)))
      .filter((r) => r.total > 0)
      .sort((a, b) => (b.pct || 0) - (a.pct || 0));
  }

  function followUpList(atletas, sessoes, presencas, opts) {
    opts = opts || {};
    const lastN = opts.lastN || 5, minFaltas = opts.minFaltas || 2;
    const today = new Date().toISOString().slice(0, 10);
    const sessOrdered = sessoes.filter((s) => s.tipo && (s.estado === "realizada" || s.data < today)).sort((a, b) => b.data.localeCompare(a.data));
    return atletas.filter((a) => a.ativo).map((a) => {
      const mySess = sessOrdered.filter((s) => s.turmaId === a.turmaId).slice(0, lastN);
      const byId = Object.fromEntries(presencas.filter((p) => p.atletaId === a.id).map((p) => [p.sessaoId, p]));
      let faltas = 0;
      mySess.forEach((s) => { const r = byId[s.id]; if (r && r.estado === "falta") faltas++; });
      return { atleta: a, faltas, consideradas: mySess.length };
    }).filter((x) => x.faltas >= minFaltas).sort((a, b) => b.faltas - a.faltas);
  }

  function upcomingBirthdays(atletas, daysAhead) {
    daysAhead = daysAhead || 30;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return atletas.filter((a) => a.ativo && a.dataNascimento).map((a) => {
      const d = new Date(a.dataNascimento + "T00:00:00");
      let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const diffDays = Math.round((next - today) / 86400000);
      return { atleta: a, next, diffDays };
    }).filter((x) => x.diffDays <= daysAhead).sort((a, b) => a.diffDays - b.diffDays);
  }

  function groupSkillAverages(atletas, grupos, habilidades) {
    return grupos.sort((a, b) => a.ordem - b.ordem).map((g) => {
      const membros = atletas.filter((a) => a.grupoId === g.id && a.ativo);
      const avgPerSkill = habilidades.map((h) => {
        const vals = membros.map((m) => (m.habilidades && m.habilidades[h]) || 1);
        const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        return { habilidade: h, media: avg };
      });
      return { grupo: g, membros: membros.length, avgPerSkill };
    });
  }

  function sessionTypeDistribution(sessoes) {
    const done = sessoes.filter((s) => s.tipo && s.estado === "realizada");
    const counts = {};
    done.forEach((s) => { counts[s.tipo] = (counts[s.tipo] || 0) + 1; });
    return counts;
  }

  function monthlyAttendance(sessoes, presencas) {
    const sessById = Object.fromEntries(sessoes.map((s) => [s.id, s]));
    const byMonth = {};
    presencas.forEach((p) => {
      const s = sessById[p.sessaoId]; if (!s) return;
      const m = s.data.slice(0, 7);
      byMonth[m] = byMonth[m] || { total: 0, presente: 0 };
      byMonth[m].total++;
      if (p.estado === "presente") byMonth[m].presente++;
    });
    return Object.keys(byMonth).sort().map((m) => Object.assign({ mes: m }, byMonth[m], { pct: pct(byMonth[m].presente, byMonth[m].total) }));
  }

  global.Stats = {
    loadAll, attendanceBreakdown, athletePct, rankAthletesByAttendance,
    followUpList, upcomingBirthdays, groupSkillAverages, sessionTypeDistribution, monthlyAttendance, pct,
  };
})(window);
