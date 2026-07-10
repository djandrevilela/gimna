/* =========================================================
   Gimna — autenticação por email + OTP, multi-turma
   ========================================================= */
(function (global) {
  "use strict";
  const SESSION_KEY = "gimna-session";

  function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
  function normEmail(e) { return (e || "").trim().toLowerCase(); }

  const Auth = {
    current: null,          // registo em "users"
    memberships: [],        // memberships ativas do utilizador (todas as turmas)
    activeMembership: null, // membership selecionada (turma/tenant "atual")
    onlineMode: false,      // true quando o último pedido de OTP foi respondido pelo backend real

    // ---------------- OTP ----------------
    // Tenta sempre o backend real primeiro (js/config.js + js/api.js). Se não
    // houver backend configurado, ou o pedido falhar (sem rede), cai para a
    // simulação local — o código aparece no ecrã, claramente identificado
    // como modo demonstração (ver docs/ARQUITETURA.md).
    async requestOtp(email) {
      email = normEmail(email);
      if (global.Api && Api.isConfigured()) {
        try {
          const res = await Api.requestOtp(email);
          Auth.onlineMode = true;
          return { online: true, codigo: res.devCode || null };
        } catch (e) { Auth.onlineMode = false; }
      }
      const codigo = genOtp();
      await DB.put("otpCodes", {
        id: DB.uuid(), email, codigo, tipo: "login",
        expiraEm: new Date(Date.now() + 10 * 60 * 1000).toISOString(), usado: false,
      }, { silent: true });
      return { online: false, codigo };
    },

    // Verificação local apenas (usada no caminho offline).
    async verifyOtp(email, codigo) {
      email = normEmail(email);
      const codes = await DB.getAll("otpCodes");
      const match = codes.filter((c) => c.email === email && !c.usado)
        .sort((a, b) => b.expiraEm.localeCompare(a.expiraEm))[0];
      if (!match || match.codigo !== String(codigo).trim()) return { ok: false, error: "Código inválido." };
      if (new Date(match.expiraEm) < new Date()) return { ok: false, error: "Código expirado — pede um novo." };
      match.usado = true;
      await DB.put("otpCodes", match, { silent: true });
      return { ok: true };
    },

    // Verificação junto do backend real — valida o código E autentica tudo
    // de uma vez (o servidor devolve token + user + memberships).
    async verifyOtpOnline(email, codigo, nome) {
      const res = await Api.verifyOtp(normEmail(email), codigo, nome);
      Api.setToken(res.token);
      await DB.put("users", res.user, { silent: true });
      for (const m of res.memberships) await DB.put("memberships", m, { silent: true });
      await Auth._loadSessionFromServer(res.user, res.memberships);
      return { ok: true };
    },

    // ---------------- Sessão ----------------
    async findUserByEmail(email) {
      email = normEmail(email);
      const users = await DB.getAll("users");
      return users.find((u) => normEmail(u.email) === email) || null;
    },

    async completeLoginOrSignup(email, nome) {
      email = normEmail(email);
      let user = await Auth.findUserByEmail(email);
      let isNewUser = false;
      if (!user) {
        isNewUser = true;
        user = await DB.put("users", { id: DB.uuid(), nome: nome || email.split("@")[0], email, emailVerificado: true, criadoEm: new Date().toISOString() });
      } else if (!user.emailVerificado) {
        user.emailVerificado = true;
        await DB.put("users", user);
      }
      const convites = await DB.getAll("convites");
      const pendentes = convites.filter((c) => normEmail(c.email) === email && c.estado === "pendente");
      for (const c of pendentes) {
        await DB.put("memberships", {
          id: DB.uuid(), userId: user.id, turmaId: c.turmaId, tenantId: c.tenantId,
          role: c.role, atletaId: c.atletaId || null, estado: "ativo",
        });
        c.estado = "aceite";
        await DB.put("convites", c);
      }
      await Auth._loadSession(user);
      return { ok: true, user, isNewUser, hadInvites: pendentes.length > 0 };
    },

    async _loadSession(user) {
      Auth.current = user;
      const all = await DB.getAll("memberships");
      Auth.memberships = all.filter((m) => m.userId === user.id && m.estado === "ativo");
      const lastActiveId = localStorage.getItem("gimna-active-membership");
      Auth.activeMembership = Auth.memberships.find((m) => m.id === lastActiveId) || Auth.memberships[0] || null;
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
      if (Auth.activeMembership) localStorage.setItem("gimna-active-membership", Auth.activeMembership.id);
    },

    // Igual a _loadSession, mas a partir da resposta do servidor (memberships
    // já vêm prontas, não é preciso ir buscar ao IndexedDB local).
    async _loadSessionFromServer(user, memberships) {
      Auth.current = user;
      Auth.memberships = memberships;
      const lastActiveId = localStorage.getItem("gimna-active-membership");
      Auth.activeMembership = memberships.find((m) => m.id === lastActiveId) || memberships[0] || null;
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
      if (Auth.activeMembership) {
        localStorage.setItem("gimna-active-membership", Auth.activeMembership.id);
        Api.setTurma(Auth.activeMembership.turmaId);
        await Api.pullTurma(Auth.activeMembership.turmaId).catch(() => {});
      }
    },

    async setActiveMembership(membershipId) {
      const m = Auth.memberships.find((x) => x.id === membershipId);
      if (!m) return;
      Auth.activeMembership = m;
      localStorage.setItem("gimna-active-membership", m.id);
      if (global.Api && Api.isConfigured() && Api.token) {
        Api.setTurma(m.turmaId);
        await Api.pullTurma(m.turmaId).catch(() => {});
      }
    },

    async restore() {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      let userId;
      try { userId = JSON.parse(raw).userId; } catch (e) { return null; }

      if (global.Api && Api.isConfigured() && Api.token) {
        try {
          const res = await Api.me();
          await DB.put("users", res.user, { silent: true });
          for (const m of res.memberships) await DB.put("memberships", m, { silent: true });
          await Auth._loadSessionFromServer(res.user, res.memberships);
          Auth.onlineMode = true;
          return res.user;
        } catch (e) { /* sem rede agora — segue para os dados guardados localmente */ }
      }
      const user = await DB.get("users", userId);
      if (!user) return null;
      await Auth._loadSession(user);
      return user;
    },

    logout() {
      Auth.current = null;
      Auth.memberships = [];
      Auth.activeMembership = null;
      localStorage.removeItem(SESSION_KEY);
      if (global.Api) Api.setToken(null);
    },

    // ---------------- Papéis / permissões (por membership ativa) ----------------
    role() { return Auth.activeMembership ? Auth.activeMembership.role : null; },
    isManager() { return Auth.role() === "manager"; },
    isAjudante() { return Auth.role() === "ajudante"; },
    isAtleta() { return Auth.role() === "atleta"; },
    isAdmin() { return Auth.isManager(); }, // retrocompatibilidade com o código existente

    can(action) {
      const role = Auth.role();
      if (!role) return false;
      if (role === "manager") return true;
      if (role === "ajudante") {
        const base = ["comment", "markAttendance", "view"];
        if (base.includes(action)) return true;
        const extra = (Auth.activeMembership && Auth.activeMembership.permissoesExtra) || [];
        return extra.includes(action);
      }
      if (role === "atleta") return ["view", "sendMessage"].includes(action);
      return false;
    },
  };

  global.Auth = Auth;
})(window);
