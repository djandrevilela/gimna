/* =========================================================
   Gimna — dados iniciais (seed)
   A época (dias de treino, horário, período, feriados) já vem
   configurada na turma de demonstração, mas é 100% editável pelo
   Manager em "Época e Mesociclos" — ver js/season.js e js/actions.js.
   ========================================================= */
(function (global) {
  const MESOCICLOS_DEF = [
    { nome: "M1 - Fundação", inicio: "2026-09-09", fim: "2026-10-30", objetivo: "Diagnóstico e formação de grupos; rolamentos; roda com apoio; pino na parede; saltos base no mini-trampolim; passagem simples no plinto." },
    { nome: "M2 - Construção", inicio: "2026-11-04", fim: "2026-12-30", objetivo: "Rondada; roda autónoma; mortal à frente com assistência total; pino apoiado; acrobática a pares (equilíbrios simples)." },
    { nome: "M3 - Aprendizagem técnica", inicio: "2027-01-01", fim: "2027-02-26", objetivo: "Mortal à frente com assistência decrescente; mortal atrás — início; rondada-flic com ajuda (G3); pino-roda-sentado — fase inicial." },
    { nome: "M4 - Consolidação e autonomia", inicio: "2027-03-03", fim: "2027-04-30", objetivo: "Mortal à frente autónomo (G2/G3); mortal atrás com assistência reduzida; saltos com passagem por pino no plinto; início do barani (G3)." },
    { nome: "M5 - Refinamento", inicio: "2027-05-05", fim: "2027-06-30", objetivo: "Rondada-flic-flac autónomo (G3); barani com assistência decrescente; mortal atrás mais autónomo; pino-roda-sentado consolidado." },
    { nome: "M6 - Avaliação final", inicio: "2027-07-02", fim: "2027-07-30", objetivo: "Revisão geral, polimento de execução, preparação da demonstração final." },
  ];

  const HABILIDADES = [
    "Mortal à frente (mini-trampolim)",
    "Mortal atrás (mini-trampolim invertido)",
    "Barani",
    "Salto com passagem por pino (plinto)",
    "Rondada + flic-flac (solo)",
    "Pino-roda-sentado",
  ];

  function criarTenantSimples(nome, descricaoTurma) {
    const tenantId = DB.uuid();
    const turmaId = DB.uuid();
    return {
      tenant: { id: tenantId, nome: "Ginásio Demo — " + nome, plano: "Trial", criadoEm: new Date().toISOString(), limiteAtletas: 60 },
      turma: { id: turmaId, tenantId, nome, descricao: descricaoTurma, horario: "18:00-19:00", diasSemana: [], epocaInicio: null, epocaFim: null, feriados: [] },
      tenantId, turmaId,
    };
  }

  async function seedIfNeeded() {
    if (await DB.isSeeded()) return;

    const tenantId = DB.uuid();
    await DB.put("tenants", { id: tenantId, nome: "Ginásio Demo — AnimaKids", plano: "Trial", criadoEm: new Date().toISOString(), limiteAtletas: 60 }, { silent: true });
    const turmaId = DB.uuid();
    const turma = {
      id: turmaId, tenantId, nome: "AnimaKids", descricao: "Classe de formação avançada / pré-competição, 6-12 anos.",
      horario: "18:00-19:00",
      epocaInicio: "2026-09-09", epocaFim: "2027-07-30",
      diasSemana: [3, 5],
      feriados: [
        { data: "2026-12-25", nome: "Natal" },
        { data: "2027-01-01", nome: "Ano Novo" },
        { data: "2027-03-26", nome: "Sexta-feira Santa" },
      ],
      padraoMicrociclo: {
        1: { 3: "Trampolim", 5: "Solo" },
        2: { 3: "Tumbling", 5: "Trampolim" },
        3: { 3: "Solo", 5: "Tumbling" },
        0: { 3: "Acrobática", 5: "Trampolim" },
      },
      resumoObjetivos: "O objetivo desta época é preparar a turma para a classe de representação/competição, trabalhando de forma progressiva o mortal à frente e atrás no mini-trampolim, a rondada-flic-flac no solo, os saltos com passagem por pino no plinto e, para os atletas mais avançados, o barani. O trabalho está dividido em períodos (mesociclos), cada um com um foco técnico diferente.",
    };
    await DB.put("turmas", turma, { silent: true });

    const microciclosSeed = [
      { id: DB.uuid(), tenantId, turmaId, nome: "Trampolim", cor: "c1", ordem: 1, planoGenerico: "Aquecimento geral + preparação física específica.\nEstação por grupo — progressões de mortal à frente/atrás e barani, de acordo com a fase de cada grupo.", updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Tumbling", cor: "c2", ordem: 2, planoGenerico: "Aquecimento geral + preparação física específica.\nEstação por grupo — rondada, roda, flic-flac.", updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Solo", cor: "c3", ordem: 3, planoGenerico: "Aquecimento geral + preparação física específica.\nEstação por grupo — pino, equilíbrios, pino-roda-sentado.", updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Acrobática", cor: "c4", ordem: 4, planoGenerico: "Aquecimento geral + jogos de confiança.\nTrabalho a pares/trios adequado ao grupo.", updatedAt: new Date().toISOString() },
    ];
    await DB.bulkPutSilent("microciclosTipos", microciclosSeed);

    const habilidadesSeed = HABILIDADES.map((nome, i) => ({
      id: DB.uuid(), tenantId, turmaId, nome, ordem: i + 1, updatedAt: new Date().toISOString(),
    }));
    await DB.bulkPutSilent("habilidadesTipos", habilidadesSeed);

    const estadosPresencaSeed = [
      { id: DB.uuid(), tenantId, turmaId, nome: "Presente", valor: "presente", cor: "c5", contaComoPresenca: true, ordem: 1, updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Falta", valor: "falta", cor: "c4", contaComoPresenca: false, ordem: 2, updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Falta Justificada", valor: "falta_justificada", cor: "c3", contaComoPresenca: false, ordem: 3, updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Doença", valor: "doenca", cor: "c2", contaComoPresenca: false, ordem: 4, updatedAt: new Date().toISOString() },
    ];
    await DB.bulkPutSilent("estadosPresenca", estadosPresencaSeed);

    const criteriosSeed = [
      { id: DB.uuid(), tenantId, turmaId, nome: "Atitude", ordem: 1, updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Pontualidade", ordem: 2, updatedAt: new Date().toISOString() },
      { id: DB.uuid(), tenantId, turmaId, nome: "Trabalho de equipa", ordem: 3, updatedAt: new Date().toISOString() },
    ];
    await DB.bulkPutSilent("criteriosAvaliacao", criteriosSeed);

    await DB.put("camposPersonalizados", {
      id: DB.uuid(), tenantId, turmaId, nome: "Escola", tipo: "texto", ordem: 1, updatedAt: new Date().toISOString(),
    }, { silent: true });

    const activeKids = criarTenantSimples("ActiveKids", "Classe de multiatividades, 5-8 anos.");
    const gimnoKids = criarTenantSimples("GimnoKids", "Classe de iniciação à ginástica, 4-7 anos.");
    await DB.bulkPutSilent("tenants", [activeKids.tenant, gimnoKids.tenant]);
    await DB.bulkPutSilent("turmas", [activeKids.turma, gimnoKids.turma]);

    const uAndre = DB.uuid(), uRita = DB.uuid(), uLeonor = DB.uuid();
    await DB.bulkPutSilent("users", [
      { id: uAndre, nome: "André Ferreira", email: "andre@animakids.pt", dataNascimento: "1990-04-12", emailVerificado: true, criadoEm: new Date().toISOString() },
      { id: uRita, nome: "Rita Almeida", email: "rita@animakids.pt", dataNascimento: "1995-09-03", emailVerificado: true, criadoEm: new Date().toISOString() },
      { id: uLeonor, nome: "Leonor Cardoso", email: "leonor@animakids.pt", dataNascimento: "1998-11-20", emailVerificado: true, criadoEm: new Date().toISOString() },
    ]);

    const memberships = [
      { id: DB.uuid(), userId: uAndre, turmaId, tenantId, role: "manager", estado: "ativo" },
      { id: DB.uuid(), userId: uAndre, turmaId: activeKids.turmaId, tenantId: activeKids.tenantId, role: "manager", estado: "ativo" },
      { id: DB.uuid(), userId: uRita, turmaId, tenantId, role: "ajudante", estado: "ativo" },
      { id: DB.uuid(), userId: uLeonor, turmaId, tenantId, role: "ajudante", estado: "ativo" },
      { id: DB.uuid(), userId: uLeonor, turmaId: gimnoKids.turmaId, tenantId: gimnoKids.tenantId, role: "ajudante", estado: "ativo" },
    ];

    const g1 = DB.uuid(), g2 = DB.uuid(), g3 = DB.uuid();
    await DB.bulkPutSilent("grupos", [
      { id: g1, tenantId, turmaId, nome: "Grupo 1 - Fundação", descricao: "Ainda sem rolamento/roda consolidados.", ordem: 1, updatedAt: new Date().toISOString() },
      { id: g2, tenantId, turmaId, nome: "Grupo 2 - Intermédio", descricao: "Já domina rolamento e roda; salta o mini-tramp com controlo.", ordem: 2, updatedAt: new Date().toISOString() },
      { id: g3, tenantId, turmaId, nome: "Grupo 3 - Avançado", descricao: "Aprende rápido; boa base de força e coordenação.", ordem: 3, updatedAt: new Date().toISOString() },
    ]);

    const mesociclosRecords = MESOCICLOS_DEF.map((m) => ({
      id: DB.uuid(), tenantId, turmaId, nome: m.nome, dataInicio: m.inicio, dataFim: m.fim, objetivo: m.objetivo, updatedAt: new Date().toISOString(),
    }));
    await DB.bulkPutSilent("mesociclos", mesociclosRecords);

    const nomes = [
      "Maria Santos", "João Pereira", "Beatriz Costa", "Rodrigo Silva", "Leonor Oliveira",
      "Afonso Martins", "Matilde Sousa", "Gonçalo Ferreira", "Carolina Rodrigues", "Duarte Alves",
      "Inês Gomes", "Tomás Lopes", "Francisca Marques", "Diogo Ribeiro", "Lara Fernandes",
      "Vicente Carvalho", "Mariana Teixeira", "Salvador Pinto", "Alice Correia", "Rafael Mendes",
    ];
    const grupos = [g1, g1, g1, g1, g1, g1, g1, g2, g2, g2, g2, g2, g2, g2, g3, g3, g3, g3, g3, g3];
    const ordemPorGrupo = { [g1]: 1, [g2]: 2, [g3]: 3 };
    const hoje = new Date();
    const objetivosCoachExemplos = [
      "Conseguir o mortal à frente sozinho até ao Natal.",
      "Ganhar mais confiança no mini-trampolim invertido.",
      "Trabalhar a postura na roda antes de avançar para a rondada.",
    ];
    const athletes = nomes.map((nome, i) => {
      const idade = 6 + (i % 7);
      const anoNasc = 2027 - idade;
      const mesNasc = i < 3 ? hoje.getMonth() + 1 : (i % 9) + 1;
      const diaNasc = i < 3 ? Math.min(28, hoje.getDate() + 3 + i * 4) : 10 + (i % 15);
      const base = ordemPorGrupo[grupos[i]] || 1;
      return {
        id: DB.uuid(), tenantId, turmaId, grupoId: grupos[i], nome,
        dataNascimento: `${anoNasc}-${String(mesNasc).padStart(2, "0")}-${String(diaNasc).padStart(2, "0")}`,
        encarregado: "Encarregado de Educação de " + nome.split(" ")[0],
        contacto: "9" + (10000000 + i * 137).toString().slice(0, 8),
        notasMedicas: i % 6 === 0 ? "Asma ligeira — inalador na mochila." : "",
        ativo: true, foto: null,
        autorizacaoImagem: i % 4 !== 0,
        objetivosCoach: i < 3 ? objetivosCoachExemplos[i] : "",
        objetivosProprios: i === 0 ? "Quero conseguir fazer o mortal à frente sozinha e aprender a rondada!" : "",
        habilidades: HABILIDADES.reduce((acc, h, hi) => { acc[h] = Math.max(1, Math.min(5, base + (hi % 3 === 0 ? 0 : -1))); return acc; }, {}),
        updatedAt: new Date().toISOString(),
      };
    });
    await DB.bulkPutSilent("atletas", athletes);

    const uMaria = DB.uuid(), uAfonso = DB.uuid();
    await DB.bulkPutSilent("users", [
      { id: uMaria, nome: "Enc. Educação — Maria Santos", email: "maria.enc@example.com", emailVerificado: true, criadoEm: new Date().toISOString() },
      { id: uAfonso, nome: "Enc. Educação — Afonso Martins", email: "afonso.enc@example.com", emailVerificado: true, criadoEm: new Date().toISOString() },
    ]);
    memberships.push(
      { id: DB.uuid(), userId: uMaria, turmaId, tenantId, role: "atleta", atletaId: athletes[0].id, estado: "ativo" },
      { id: DB.uuid(), userId: uAfonso, turmaId, tenantId, role: "atleta", atletaId: athletes[5].id, estado: "ativo" }
    );
    await DB.bulkPutSilent("memberships", memberships);

    const sessions = Season.generateSessions(turma, mesociclosRecords).map((s) => Object.assign({ id: DB.uuid() }, s));
    const primeiras = sessions.filter((s) => s.tipo).slice(0, 8);
    primeiras.forEach((s) => { s.estado = "realizada"; });
    const presencasSeed = [];
    primeiras.forEach((s, si) => {
      athletes.forEach((a, ai) => {
        let estado = "presente";
        const r = (ai * 7 + si * 13) % 20;
        if ((ai === 3 || ai === 11) && si >= 3) {
          estado = si % 2 === 0 ? "falta" : "presente";
        } else if (r === 0) estado = "falta";
        else if (r === 1) estado = "falta_justificada";
        else if (r === 2) estado = "doenca";
        presencasSeed.push({
          id: DB.uuid(), tenantId, sessaoId: s.id, atletaId: a.id, estado,
          marcadoPor: "André Ferreira", updatedAt: new Date().toISOString(),
        });
      });
    });
    await DB.bulkPutSilent("sessoes", sessions);
    await DB.bulkPutSilent("presencas", presencasSeed);

    await DB.put("comentarios", {
      id: DB.uuid(), tenantId, targetType: "geral", targetId: turmaId,
      autorId: uAndre, autorNome: "André Ferreira",
      texto: "Bem-vindos à app da AnimaKids! Usem os comentários para registar observações rápidas sobre atletas ou sessões.",
      criadoEm: new Date().toISOString(),
    }, { silent: true });

    await DB.put("mensagens", {
      id: DB.uuid(), tenantId, turmaId, tipo: "broadcast",
      remetenteUserId: uAndre, remetenteNome: "André Ferreira", remetenteRole: "manager",
      texto: "Bem-vindos à nova época 2026/2027! Qualquer dúvida, usem as mensagens para nos contactar diretamente.",
      criadoEm: new Date().toISOString(),
    }, { silent: true });

    await DB.put("mensagens", {
      id: DB.uuid(), tenantId, turmaId, tipo: "privada", atletaId: athletes[0].id,
      remetenteUserId: uMaria, remetenteNome: "Enc. Educação — Maria Santos", remetenteRole: "atleta",
      texto: "Boa tarde! A Maria pode trazer joelheiras próprias para o treino de trampolim?",
      criadoEm: new Date().toISOString(),
    }, { silent: true });

    global.dispatchEvent(new CustomEvent("ak:seeded"));
  }

  global.Seed = { seedIfNeeded, HABILIDADES, MESOCICLOS_DEF };
})(window);
