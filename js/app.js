/* =========================================================
   Gimna — aplicação (router + utilitários + shell)
   ========================================================= */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------
  // Utilitários
  // ---------------------------------------------------------------
  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function calcAge(dateStr) {
    if (!dateStr) return "?";
    const d = new Date(dateStr);
    const ref = new Date("2026-09-09"); // idade de referência: início da época
    let age = ref.getFullYear() - d.getFullYear();
    const m = ref.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
    return age;
  }
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MESES_EXT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  function fmtDateShort(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${d} ${MESES[m - 1]} ${y}`;
  }
  function fmtDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  }
  function todayStr() {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }
  function tipoClass(tipo) {
    const fixos = { Trampolim: "chip-c1", Tumbling: "chip-c2", Solo: "chip-c3", "Acrobática": "chip-c4" };
    if (fixos[tipo]) return fixos[tipo];
    const paleta = ["chip-c1", "chip-c2", "chip-c3", "chip-c4", "chip-c5", "chip-c6"];
    let hash = 0;
    for (let i = 0; i < (tipo || "").length; i++) hash = (hash * 31 + tipo.charCodeAt(i)) >>> 0;
    return paleta[hash % paleta.length];
  }
  function grupoClass(ordem) { return "chip-grupo" + (ordem || 1); }
  function initials(nome) {
    return (nome || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }
  function avatarHtml(nome, foto, style) {
    style = style || "";
    if (foto) return `<img src="${foto}" class="avatar" style="object-fit:cover;${style}" alt="">`;
    return `<div class="avatar" style="${style}">${initials(nome)}</div>`;
  }
  async function resizeImageFile(file, maxSize) {
    maxSize = maxSize || 200;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function toast(msg) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function openModal(innerHtml) {
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modal-overlay";
    overlay.innerHTML = `<div class="modal">${innerHtml}</div>`;
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  function closeModal() {
    const el = document.getElementById("modal-overlay");
    if (el) el.remove();
  }

  // ---------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------
  const NAV_MANAGER = [
    { route: "dashboard", label: "Início", ico: "🏠" },
    { route: "checkin", label: "Check-in", ico: "📷" },
    { route: "atletas", label: "Atletas", ico: "🤸" },
    { route: "grupos", label: "Grupos", ico: "🧩" },
    { route: "calendario", label: "Calendário", ico: "📅" },
    { route: "estatisticas", label: "Estatísticas", ico: "📊" },
    { route: "mesociclos", label: "Época e Mesociclos", ico: "📈" },
    { route: "turmas", label: "Turmas", ico: "🏫" },
    { route: "personalizacao", label: "Personalização", ico: "🎨" },
    { route: "mensagens", label: "Mensagens", ico: "💬" },
    { route: "definicoes", label: "Definições", ico: "⚙️" },
  ];
  const NAV_AJUDANTE = [
    { route: "dashboard", label: "Início", ico: "🏠" },
    { route: "checkin", label: "Check-in", ico: "📷" },
    { route: "atletas", label: "Atletas", ico: "🤸" },
    { route: "grupos", label: "Grupos", ico: "🧩" },
    { route: "calendario", label: "Calendário", ico: "📅" },
    { route: "estatisticas", label: "Estatísticas", ico: "📊" },
    { route: "definicoes", label: "Definições", ico: "⚙️" },
  ];
  const NAV_ATLETA = [
    { route: "dashboard", label: "Início", ico: "🏠" },
    { route: "meus-treinos", label: "Os Meus Treinos", ico: "📅" },
    { route: "minha-evolucao", label: "A Minha Evolução", ico: "📈" },
    { route: "objetivos", label: "Objetivos", ico: "🎯" },
    { route: "mensagens", label: "Mensagens", ico: "💬" },
    { route: "definicoes", label: "Definições", ico: "⚙️" },
  ];
  function navFor() {
    if (!Auth.activeMembership) return [{ route: "dashboard", label: "Início", ico: "🏠" }];
    if (Auth.isManager()) return NAV_MANAGER;
    if (Auth.isAjudante()) return NAV_AJUDANTE;
    return NAV_ATLETA;
  }
  function bottomNavFor() {
    if (!Auth.activeMembership) return ["dashboard"];
    if (Auth.isManager()) return ["dashboard", "checkin", "atletas", "calendario", "definicoes"];
    if (Auth.isAjudante()) return ["dashboard", "checkin", "atletas", "calendario", "definicoes"];
    return ["dashboard", "meus-treinos", "objetivos", "mensagens", "definicoes"];
  }

  function parseHash() {
    const raw = (location.hash || "#/dashboard").replace(/^#\//, "");
    const [route, id] = raw.split("/");
    return { route: route || "dashboard", id: id || null };
  }

  const ROTAS_STAFF = ["dashboard", "atletas", "grupos", "turmas", "mesociclos", "calendario", "estatisticas", "sessao", "definicoes", "mensagens", "checkin", "personalizacao"];
  const ROTAS_ATLETA = ["dashboard", "meus-treinos", "minha-evolucao", "objetivos", "mensagens", "definicoes"];

  async function renderRoute() {
    if (!Auth.current) return;
    closeModal();
    const { route, id } = parseHash();
    const content = document.getElementById("content");
    if (!content) return;

    if (!Auth.activeMembership) {
      highlightNav(route);
      content.innerHTML = Views.semTurma ? await Views.semTurma() : `<div class="empty-state">Sem turma associada.</div>`;
      (global.afterRenderHooks || []).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
      return;
    }

    const permitidas = Auth.isAtleta() ? ROTAS_ATLETA : ROTAS_STAFF;
    highlightNav(route);
    if (!permitidas.includes(route)) {
      content.innerHTML = `<div class="empty-state"><div class="ico">🔒</div><p>Não tens acesso a esta página.</p></div>`;
      return;
    }
    if (route === "mensagens" && Auth.isAjudante()) {
      content.innerHTML = `<div class="empty-state"><div class="ico">🔒</div><p>Os ajudantes não têm acesso às mensagens.</p></div>`;
      return;
    }

    content.innerHTML = `<div class="empty-state">A carregar…</div>`;
    try {
      let html = "";
      switch (route) {
        case "dashboard": html = Auth.isAtleta() ? await Views.dashboardAtleta() : await Views.dashboard(); break;
        case "atletas": html = id ? await Views.atletaDetail(id) : await Views.atletasList(); break;
        case "grupos": html = await Views.grupos(); break;
        case "turmas": html = await Views.turmas(); break;
        case "mesociclos": html = await Views.mesociclos(); break;
        case "calendario": html = await Views.calendario(); break;
        case "estatisticas": html = await Views.estatisticas(); break;
        case "sessao": html = await Views.sessaoDetail(id); break;
        case "definicoes": html = await Views.definicoes(); break;
        case "checkin": html = await Views.checkin(); break;
        case "personalizacao": html = Auth.isAdmin() ? await Views.personalizacao() : `<div class="empty-state"><div class="ico">🔒</div><p>Só o gestor acede à personalização.</p></div>`; break;
        case "mensagens": html = await Views.mensagens(id); break;
        case "meus-treinos": html = await Views.meusTreinos(); break;
        case "minha-evolucao": html = await Views.minhaEvolucao(); break;
        case "objetivos": html = await Views.objetivos(); break;
        default: html = `<div class="empty-state">Página não encontrada.</div>`;
      }
      content.innerHTML = html;
      (global.afterRenderHooks || []).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    } catch (err) {
      console.error(err);
      content.innerHTML = `<div class="empty-state"><div class="ico">⚠️</div><p>Ocorreu um erro a carregar esta página.</p></div>`;
    }
    window.scrollTo(0, 0);
    closeSidebarMobile();
  }

  function highlightNav(route) {
    document.querySelectorAll(".nav-link[data-route]").forEach((el) => el.classList.toggle("active", el.dataset.route === route));
    document.querySelectorAll(".bottom-nav a[data-route]").forEach((el) => el.classList.toggle("active", el.dataset.route === route));
    const titles = {
      dashboard: "Início", atletas: "Atletas", grupos: "Grupos de Treino", turmas: "Turmas", mesociclos: "Mesociclos",
      calendario: "Calendário da Época", estatisticas: "Estatísticas", sessao: "Sessão de Treino", definicoes: "Definições",
      mensagens: "Mensagens", "meus-treinos": "Os Meus Treinos", "minha-evolucao": "A Minha Evolução", objetivos: "Objetivos da Época", checkin: "Check-in", personalizacao: "Personalização",
    };
    const h1 = document.getElementById("topbar-title");
    if (h1) h1.textContent = titles[route] || "Gimna";
  }

  function closeSidebarMobile() {
    document.querySelector(".sidebar")?.classList.remove("open");
    document.querySelector(".backdrop")?.remove();
  }

  const ROLE_LABEL = { manager: "Gestor(a)", ajudante: "Ajudante", atleta: "Atleta / Enc. Educação" };

  // ---------------------------------------------------------------
  // Shell (layout depois do login)
  // ---------------------------------------------------------------
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  function tintOf(hex, amount) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const mix = (c) => Math.round(c + (255 - c) * amount);
    return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
  }
  function applyBranding(turma) {
    const root = document.documentElement.style;
    if (turma && turma.corPrimaria) {
      root.setProperty("--primary", turma.corPrimaria);
      root.setProperty("--primary-tint", tintOf(turma.corPrimaria, 0.88) || "");
    } else {
      root.removeProperty("--primary"); root.removeProperty("--primary-tint");
    }
    if (turma && turma.corAccent) {
      root.setProperty("--accent", turma.corAccent);
      root.setProperty("--accent-tint", tintOf(turma.corAccent, 0.88) || "");
    } else {
      root.removeProperty("--accent"); root.removeProperty("--accent-tint");
    }
  }

  async function renderShell() {
    const app = document.getElementById("app");
    const nav = navFor();
    const bottom = bottomNavFor();
    const tenant = Auth.activeMembership ? await DB.get("tenants", Auth.activeMembership.tenantId) : null;
    const turma = Auth.activeMembership ? await DB.get("turmas", Auth.activeMembership.turmaId) : null;
    applyBranding(turma);
    const turmasAll = await DB.getAll("turmas");
    const turmaNomeById = Object.fromEntries(turmasAll.map((t) => [t.id, t.nome]));

    app.innerHTML = `
      <div class="shell">
        <nav class="sidebar" id="sidebar">
          <div class="brand">
            <div class="mark">GM</div>
            <div class="name">Gimna</div>
          </div>
          ${Auth.memberships.length > 1 ? `
            <div class="field" style="padding:0 8px 14px;">
              <select id="turma-switcher" class="select-dark">
                ${Auth.memberships.map((m) => `<option value="${m.id}" ${m.id === Auth.activeMembership.id ? "selected" : ""}>${esc((turmaNomeById[m.turmaId] || "") + " · " + ROLE_LABEL[m.role])}</option>`).join("")}
              </select>
            </div>
          ` : `<div class="tenant">${esc(tenant ? tenant.nome : (turma ? turma.nome : ""))}</div>`}
          ${nav.map((n) => `
            <a href="#/${n.route}" class="nav-link" data-route="${n.route}"><span class="ico">${n.ico}</span>${n.label}</a>
          `).join("")}
          <div class="nav-spacer"></div>
          <div class="who">
            <div class="avatar">${initials(Auth.current.nome)}</div>
            <div class="meta">
              <div class="n">${esc(Auth.current.nome)}</div>
              <div class="r">${ROLE_LABEL[Auth.role()] || ""}</div>
            </div>
            <button class="logout-btn" id="btn-logout" title="Sair">⏻</button>
          </div>
        </nav>
        <div class="main">
          <div class="topbar">
            <button class="menu-btn" id="btn-menu">☰</button>
            <h1 id="topbar-title">Gimna</h1>
            <div class="spacer"></div>
            <button class="sync-pill" id="sync-pill" type="button"><span class="dot"></span><span id="sync-label">A verificar…</span></button>
          </div>
          <div class="content" id="content"></div>
        </div>
      </div>
      <div class="bottom-nav">
        ${bottom.map((r) => {
          const item = nav.find((n) => n.route === r) || NAV_MANAGER.find((n) => n.route === r);
          return `<a href="#/${r}" data-route="${r}"><span class="ico">${item.ico}</span>${item.label}</a>`;
        }).join("")}
      </div>
    `;
    document.getElementById("btn-logout").addEventListener("click", async () => { Auth.logout(); await renderLogin(); });
    document.getElementById("btn-menu").addEventListener("click", openSidebarMobile);
    document.getElementById("sync-pill").addEventListener("click", doSync);
    const switcher = document.getElementById("turma-switcher");
    if (switcher) switcher.addEventListener("change", async () => { await Auth.setActiveMembership(switcher.value); location.hash = "#/dashboard"; await renderShell(); });
    updateSyncPill();
    await renderRoute();
  }

  function openSidebarMobile() {
    document.getElementById("sidebar").classList.add("open");
    const bd = document.createElement("div");
    bd.className = "backdrop";
    bd.addEventListener("click", closeSidebarMobile);
    document.body.appendChild(bd);
  }

  async function updateSyncPill() {
    const pill = document.getElementById("sync-pill");
    if (!pill) return;
    const label = document.getElementById("sync-label");
    const pending = await DB.pendingSyncCount();
    if (!navigator.onLine) {
      pill.classList.add("offline"); label.textContent = "Offline" + (pending ? ` · ${pending} por sincronizar` : "");
    } else if (pending > 0) {
      pill.classList.add("offline"); label.textContent = `${pending} por sincronizar — tocar para sincronizar`;
    } else {
      pill.classList.remove("offline"); label.textContent = "Sincronizado";
    }
  }
  async function doSync() {
    const label = document.getElementById("sync-label");
    if (label) label.textContent = "A sincronizar…";
    const res = await DB.trySync();
    if (!res.ok) toast("Sem ligação — as alterações ficam guardadas no dispositivo.");
    else if (res.count) toast(`${res.count} alteração(ões) sincronizada(s).`);
    else toast("Já estava tudo sincronizado.");
    updateSyncPill();
  }
  global.addEventListener("ak:dirty", updateSyncPill);
  global.addEventListener("ak:synced", updateSyncPill);
  global.addEventListener("online", () => { updateSyncPill(); doSync(); });
  global.addEventListener("offline", updateSyncPill);

  // ---------------------------------------------------------------
  // Login — email + código OTP (ver nota em js/auth.js)
  // ---------------------------------------------------------------
  let pendingOtpEmail = null;

  async function renderLogin() {
    applyBranding(null);
    const users = await DB.getAll("users");
    const memberships = await DB.getAll("memberships");
    const turmas = await DB.getAll("turmas");
    const turmaNome = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
    const demoContas = users.filter((u) => memberships.some((m) => m.userId === u.id)).map((u) => {
      const mine = memberships.filter((m) => m.userId === u.id);
      return { user: u, papel: mine.map((m) => `${turmaNome[m.turmaId] || "?"} (${ROLE_LABEL[m.role]})`).join(" · ") };
    });

    const app = document.getElementById("app");
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="mark">GM</div>
          <h1>Entrar no Gimna</h1>
          <div class="sub">O acesso é feito só com o teu email — sem palavras-passe.</div>

          <form id="email-form">
            <div class="field"><label>O teu email</label><input type="email" name="email" required placeholder="tu@exemplo.com"></div>
            <button class="btn btn-primary" style="width:100%" type="submit">Enviar código</button>
          </form>

          <form id="otp-form" style="display:none;">
            <div class="perm-note" id="otp-demo-note" style="margin-bottom:12px;"></div>
            <div class="field"><label>Código de 6 dígitos</label><input type="text" name="codigo" inputmode="numeric" maxlength="6" required placeholder="000000"></div>
            <div class="field" id="nome-field" style="display:none;"><label>Como te chamas?</label><input type="text" name="nome" placeholder="O teu nome"></div>
            <button class="btn btn-primary" style="width:100%" type="submit">Confirmar e entrar</button>
            <button class="btn btn-ghost btn-sm" type="button" id="btn-change-email" style="width:100%; margin-top:8px;">Usar outro email</button>
          </form>

          <div id="login-error" style="color:var(--danger); font-size:.82rem; margin-top:8px;"></div>

          <div class="mat-line"></div>
          <div class="eyebrow">Acesso rápido de demonstração</div>
          <div class="demo-users">
            ${demoContas.map(({ user, papel }) => `
              <button class="demo-user-btn" data-action="demoLogin" data-email="${esc(user.email)}">
                <div class="avatar" style="width:28px;height:28px;font-size:.7rem;">${initials(user.nome)}</div>
                <div><div class="n">${esc(user.nome)}</div><div class="r">${esc(papel)}</div></div>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    document.getElementById("email-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = new FormData(e.target).get("email");
      pendingOtpEmail = email;
      const result = await Auth.requestOtp(email);
      document.getElementById("email-form").style.display = "none";
      document.getElementById("otp-form").style.display = "block";
      const existing = await Auth.findUserByEmail(email);
      document.getElementById("nome-field").style.display = existing ? "none" : "block";
      const noteEl = document.getElementById("otp-demo-note");
      if (result.online && !result.codigo) {
        noteEl.innerHTML = `Enviámos um código para <strong>${esc(email)}</strong>. Verifica a tua caixa de correio.`;
      } else if (result.online && result.codigo) {
        noteEl.innerHTML = `<strong>Backend ligado, modo de desenvolvimento:</strong> o servidor não tem email real configurado, por isso devolve o código diretamente. Código para <strong>${esc(email)}</strong>: <strong style="font-size:1.1em; letter-spacing:.1em;">${result.codigo}</strong>.`;
      } else {
        noteEl.innerHTML = `<strong>Modo local (sem ligação ao servidor):</strong> mostramos aqui o código que seria enviado para <strong>${esc(email)}</strong>: <strong style="font-size:1.1em; letter-spacing:.1em;">${result.codigo}</strong>. Em produção isto chegaria à caixa de correio (ver docs/ARQUITETURA.md).`;
      }
    });

    document.getElementById("btn-change-email").addEventListener("click", () => {
      document.getElementById("otp-form").style.display = "none";
      document.getElementById("email-form").style.display = "block";
      document.getElementById("login-error").textContent = "";
    });

    document.getElementById("otp-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const codigo = fd.get("codigo");
      const nome = fd.get("nome");
      if (Auth.onlineMode) {
        try {
          await Auth.verifyOtpOnline(pendingOtpEmail, codigo, nome);
        } catch (err) {
          document.getElementById("login-error").textContent = err.message || "Código inválido.";
          return;
        }
      } else {
        const res = await Auth.verifyOtp(pendingOtpEmail, codigo);
        if (!res.ok) { document.getElementById("login-error").textContent = res.error; return; }
        await Auth.completeLoginOrSignup(pendingOtpEmail, nome);
      }
      await renderShell();
    });

    app.querySelectorAll('[data-action="demoLogin"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        Auth.onlineMode = false; // as contas de demonstração são sempre locais
        await Auth.completeLoginOrSignup(btn.dataset.email);
        await renderShell();
      });
    });
  }

  // ---------------------------------------------------------------
  // PWA install prompt
  // ---------------------------------------------------------------
  let deferredInstallPrompt = null;
  global.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.querySelectorAll(".js-install-btn").forEach((b) => (b.style.display = ""));
  });
  async function triggerInstall() {
    if (!deferredInstallPrompt) { toast("Usa o menu do navegador (⋮) → \"Instalar aplicação\"."); return; }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  }

  // ---------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------
  window.addEventListener("hashchange", renderRoute);

  document.addEventListener("DOMContentLoaded", async () => {
    await Seed.seedIfNeeded();
    const user = await Auth.restore();
    if (user) await renderShell(); else await renderLogin();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  });

  // ---------------------------------------------------------------
  // Delegação de eventos (data-action)
  // ---------------------------------------------------------------
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "demoLogin") return; // já tratado acima
    if (Actions[action]) {
      e.preventDefault();
      await Actions[action](el.dataset, e);
    }
  });

  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    const action = form.dataset.form;
    if (Actions[action]) await Actions[action](form, e);
  });

  function byTurma(records) {
    const tid = Auth.activeMembership && Auth.activeMembership.turmaId;
    return records.filter((r) => r.turmaId === tid);
  }
  function byTenant(records) {
    const tid = Auth.activeMembership && Auth.activeMembership.tenantId;
    return records.filter((r) => r.tenantId === tid);
  }

  // Torna arrastável uma lista de elementos (cada um com um atributo
  // data-sortable-id). Quando a ordem muda, chama onReorder(novaOrdemIds).
  function makeSortable(container, onReorder) {
    if (!container) return;
    let draggedEl = null;
    const items = () => Array.from(container.querySelectorAll("[data-sortable-id]"));
    items().forEach((el) => {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", () => { draggedEl = el; el.classList.add("dragging"); });
      el.addEventListener("dragend", () => { el.classList.remove("dragging"); draggedEl = null; });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!draggedEl || draggedEl === el) return;
        const rect = el.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        el.parentNode.insertBefore(draggedEl, before ? el : el.nextSibling);
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        const novaOrdem = items().map((x) => x.dataset.sortableId);
        onReorder(novaOrdem);
      });
    });
  }

  const DEFAULT_CORES_PROGRESSO = ["#2B2B2B", "#8B5CF6", "#F0B429", "#E67E22", "#2E8B57"];
  function coresProgresso(turma) {
    return (turma && turma.coresFases && turma.coresFases.length === 5) ? turma.coresFases : DEFAULT_CORES_PROGRESSO.slice();
  }
  async function getCategoriasHabilidades() {
    return byTurma(await DB.getAll("categoriasHabilidades")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }

  async function getHabilidadesNomes() {
    const cat = byTurma(await DB.getAll("habilidadesTipos"));
    return cat.length ? cat.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((c) => c.nome) : Seed.HABILIDADES;
  }
  function faseBarHtml(fase, cores) {
    fase = Math.max(1, Math.min(5, fase || 1));
    const cor = cores[fase - 1];
    return `<div class="skill-phase-track">${[1, 2, 3, 4, 5].map((n) => `<div class="seg" style="${n <= fase ? `background:${cor};` : ""}"></div>`).join("")}</div>`;
  }

  async function getHabilidadesCatalogo() {
    return byTurma(await DB.getAll("habilidadesTipos")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }
  async function getEstadosPresenca() {
    const cat = byTurma(await DB.getAll("estadosPresenca"));
    if (cat.length) return cat.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    return [
      { valor: "presente", nome: "Presente", cor: "c5", contaComoPresenca: true },
      { valor: "falta", nome: "Falta", cor: "c4", contaComoPresenca: false },
      { valor: "falta_justificada", nome: "Falta Justificada", cor: "c3", contaComoPresenca: false },
      { valor: "doenca", nome: "Doença", cor: "c2", contaComoPresenca: false },
    ];
  }
  async function getCriteriosAvaliacao() {
    return byTurma(await DB.getAll("criteriosAvaliacao")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }
  async function getCamposPersonalizados() {
    return byTurma(await DB.getAll("camposPersonalizados")).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }

  // Expor utilitários para os outros ficheiros (views.js, actions.js)
  global.U = { esc, calcAge, fmtDateShort, fmtDateTime, todayStr, tipoClass, grupoClass, initials, avatarHtml, resizeImageFile, toast, openModal, closeModal, triggerInstall, renderRoute, renderShell, renderLogin, MESES, MESES_EXT, byTurma, byTenant, makeSortable, getHabilidadesNomes, getHabilidadesCatalogo, getEstadosPresenca, getCriteriosAvaliacao, getCamposPersonalizados, getCategoriasHabilidades, coresProgresso, DEFAULT_CORES_PROGRESSO, faseBarHtml };
})(window);
