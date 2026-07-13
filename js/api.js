/* =========================================================
   Gimna — cliente do backend real
   Usa fetch() para falar com o servidor configurado em js/config.js.
   Se não houver URL configurado, ou o pedido falhar (offline / servidor
   em baixo), quem chama isto deve continuar a funcionar com o
   IndexedDB local — ver js/auth.js e js/db.js.
   ========================================================= */
(function (global) {
  "use strict";

  const TOKEN_KEY = "gimna-api-token";

  const Api = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    turmaId: null,

    isConfigured() { return !!global.API_BASE_URL; },

    setToken(token) {
      Api.token = token;
      if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    },
    setTurma(turmaId) { Api.turmaId = turmaId; },

    async request(method, path, body) {
      if (!Api.isConfigured()) throw new Error("Backend não configurado (ver js/config.js).");
      const headers = { "Content-Type": "application/json" };
      if (Api.token) headers["Authorization"] = "Bearer " + Api.token;
      if (Api.turmaId) headers["X-Turma-Id"] = Api.turmaId;
      let res;
      try {
        res = await fetch(global.API_BASE_URL + path, {
          method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        throw new Error("offline");
      }
      let data = null;
      try { data = await res.json(); } catch (e) { /* resposta sem corpo */ }
      if (!res.ok) throw new Error((data && data.error) || ("Erro HTTP " + res.status));
      return data;
    },

    requestOtp: (email) => Api.request("POST", "/auth/request-otp", { email }),
    verifyOtp: (email, codigo, nome) => Api.request("POST", "/auth/verify-otp", { email, codigo, nome }),
    me: () => Api.request("GET", "/api/me"),

    list: (resource) => Api.request("GET", "/api/" + resource),
    create: (resource, data) => Api.request("POST", "/api/" + resource, data),
    update: (resource, id, data) => Api.request("PUT", "/api/" + resource + "/" + id, data),
    del: (resource, id) => Api.request("DELETE", "/api/" + resource + "/" + id),

    upsertPresenca: (data) => Api.request("PUT", "/api/presencas", data),

    createTurmaPrimeira: (tenantNome, turmaNome) => Api.request("POST", "/api/turmas/first", { tenantNome, turmaNome }),
    createTurma: (data) => Api.request("POST", "/api/turmas", data),
    updateTurma: (id, data) => Api.request("PUT", "/api/turmas/" + id, data),
    gerarSessoesEpoca: (turmaId) => Api.request("POST", "/api/turmas/" + turmaId + "/gerar-sessoes"),
  };

  const SYNC_MAP = {
    atletas: "atletas",
    grupos: "grupos",
    mesociclos: "mesociclos",
    microciclosTipos: "microciclos-tipos",
    sessoes: "sessoes",
    comentarios: "comentarios",
    mensagens: "mensagens",
    avaliacoes: "avaliacoes",
    habilidadesTipos: "habilidades-tipos",
    categoriasHabilidades: "categorias-habilidades",
    estadosPresenca: "estados-presenca",
    criteriosAvaliacao: "criterios-avaliacao",
    camposPersonalizados: "campos-personalizados",
  };

  Api.updateMe = (data) => Api.request("PUT", "/api/me", data);
  Api.updateMeuObjetivo = (objetivosProprios) => Api.request("PUT", "/api/atletas/me/objetivos", { objetivosProprios });

  async function pushQueue() {
    if (!Api.isConfigured() || !Api.token) return { ok: false, reason: "sem-sessao-online" };
    const queue = await DB.getAll("syncQueue");
    const pendentes = queue.filter((q) => !q.synced);
    let count = 0;
    for (const item of pendentes) {
      const resource = SYNC_MAP[item.entity];
      try {
        if (item.entity === "presencas") {
          if (item.op === "upsert") await Api.upsertPresenca(item.payload);
        } else if (item.entity === "turmas") {
          if (item.op === "upsert") await Api.updateTurma(item.entityId, item.payload);
        } else if (item.entity === "preferencias") {
          if (item.op === "upsert") await Api.request("PUT", "/api/preferencias/me", { widgets: item.payload.widgets });
        } else if (resource) {
          if (item.op === "upsert") {
            try { await Api.update(resource, item.entityId, item.payload); }
            catch (e) { await Api.create(resource, item.payload); }
          } else if (item.op === "delete") {
            await Api.del(resource, item.entityId);
          }
        } else {
          continue;
        }
        item.synced = true;
        await DB.put("syncQueue", item, { silent: true });
        count++;
      } catch (e) {
        console.warn("Falha a sincronizar", item.entity, item.id, e.message);
      }
    }
    return { ok: true, count };
  }

  async function pullTurma(turmaId) {
    if (!Api.isConfigured() || !Api.token || !turmaId) return { ok: false };
    Api.setTurma(turmaId);
    const entries = Object.entries(SYNC_MAP);
    for (const pair of entries) {
      const store = pair[0], resource = pair[1];
      try {
        const rows = await Api.list(resource);
        if (Array.isArray(rows) && rows.length) await DB.bulkPutSilent(store, rows);
      } catch (e) { console.warn("Falha a atualizar", store, e.message); }
    }
    try {
      const presencas = await Api.list("presencas");
      if (Array.isArray(presencas) && presencas.length) await DB.bulkPutSilent("presencas", presencas);
    } catch (e) { /* ignora */ }
    return { ok: true };
  }

  Api.pushQueue = pushQueue;
  Api.pullTurma = pullTurma;
  Api.SYNC_MAP = SYNC_MAP;

  global.Api = Api;
})(window);
