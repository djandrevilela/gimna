/* =========================================================
   AnimaKids — autenticação por email + OTP, multi-turma
   ========================================================= */
(function (global) {
  "use strict";
  const SESSION_KEY = "animakids-session";

  function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
  function normEmail(e) { return (e || "").trim().toLowerCase(); }

  const Auth = {
    current: null,          // registo em "users"
    memberships: [],        // memberships ativas do utilizador (todas as turmas)
    activeMembership: null, // membership selecionada (turma/tenant "atual")

    // ---------------- OTP ----------------
    // NOTA: esta demo não tem servidor de email — o código é devolvido
    // aqui para ser mostrado no ecrã. Em produção, isto seria substituído
    // por Supabase Auth (signInWithOtp) ou um envio de email real
    // (ver docs/ARQUITETURA.md).
    async requestOtp(email, tipo) {
      email = normEmail(email);
      const codigo = genOtp();
      await DB.put("otpCodes", {
        id: DB.uuid(), email, codigo, tipo: tipo || "login",
        expiraEm: new Date(Date.now() + 10 * 60 * 1000).toISOString(), usado: false,
      }, { silent: true });
      return codigo;
    },
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
      const lastActiveId = localStorage.getItem("animakids-active-membership");
      Auth.activeMembership = Auth.memberships.find((m) => m.id === lastActiveId) || Auth.memberships[0] || null;
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
      if (Auth.activeMembership) localStorage.setItem("animakids-active-membership", Auth.activeMembership.id);
    },

    async setActiveMembership(membershipId) {
      const m = Auth.memberships.find((x) => x.id === membershipId);
      if (!m) return;
      Auth.activeMembership = m;
      localStorage.setItem("animakids-active-membership", m.id);
    },

    async restore() {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      try {
        const { userId } = JSON.parse(raw);
        const user = await DB.get("users", userId);
        if (!user) return null;
        await Auth._loadSession(user);
        return user;
      } catch (e) { return null; }
    },

    logout() {
      Auth.current = null;
      Auth.memberships = [];
      Auth.activeMembership = null;
      localStorage.removeItem(SESSION_KEY);
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
      if (role === "ajudante") return ["comment", "markAttendance", "view"].includes(action);
      if (role === "atleta") return ["view", "sendMessage"].includes(action);
      return false;
    },
  };

  global.Auth = Auth;
})(window);
