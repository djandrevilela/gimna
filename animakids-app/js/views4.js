/* =========================================================
   AnimaKids — Check-in por QR Code
   ========================================================= */
(function (global) {
  "use strict";
  const { esc, tipoClass, todayStr, avatarHtml } = U;

  const QR_PREFIX = "ANIMAKIDS:ATLETA:";

  function qrSvgFor(atletaId, cellSize) {
    try {
      const qr = qrcode(0, "M");
      qr.addData(QR_PREFIX + atletaId);
      qr.make();
      return qr.createSvgTag(cellSize || 5, 8);
    } catch (e) { return "<p>Não foi possível gerar o código.</p>"; }
  }

  async function checkin() {
    const today = todayStr();
    const sessoes = U.byTurma(await DB.getAll("sessoes"));
    const sessaoHoje = sessoes.find((s) => s.data === today && s.tipo);
    const atletas = U.byTurma(await DB.getAll("atletas")).filter((a) => a.ativo).sort((x, y) => x.nome.localeCompare(y.nome));

    if (!sessaoHoje) {
      return `
        <div class="section-title"><h2>Check-in</h2></div>
        <div class="mat-line"></div>
        <div class="empty-state"><div class="ico">📭</div><p>Não há nenhuma sessão de treino agendada para hoje (${U.fmtDateShort(today)}) nesta turma.</p></div>
      `;
    }

    const presencas = (await DB.getAll("presencas")).filter((p) => p.sessaoId === sessaoHoje.id);
    const presByAthlete = Object.fromEntries(presencas.map((p) => [p.atletaId, p]));

    return `
      <div class="section-title">
        <h2>Check-in</h2>
        <span class="chip ${tipoClass(sessaoHoje.tipo)}">${esc(sessaoHoje.tipo)} · ${U.fmtDateShort(sessaoHoje.data)}</span>
      </div>
      <div class="mat-line"></div>

      <div class="grid cols-2" style="align-items:start;">
        <div class="card">
          <div class="eyebrow">Câmara — apontar ao código do atleta</div>
          <div id="scanner-area" style="margin-top:10px;">
            <video id="scanner-video" style="width:100%; border-radius:12px; background:#000; display:none;" playsinline muted></video>
            <div id="scanner-status" style="padding:20px; text-align:center; color:var(--ink-soft); background:var(--paper-2); border-radius:12px;">A preparar câmara…</div>
          </div>
          <div class="perm-note">Precisa de um navegador com suporte a leitura de códigos (Chrome no Android/Desktop). Se não houver câmara disponível, usa a lista ao lado para check-in manual.</div>
        </div>

        <div class="card">
          <div class="eyebrow">Check-in manual / lista da turma</div>
          <div class="field" style="margin-top:8px;"><input type="search" id="checkin-search" placeholder="Procurar atleta…"></div>
          <div id="checkin-list" style="max-height:50vh; overflow-y:auto; margin-top:8px;">
            ${atletas.map((a) => {
              const done = presByAthlete[a.id] && presByAthlete[a.id].estado === "presente";
              return `
                <div class="list-row checkin-row" data-nome="${esc(a.nome.toLowerCase())}">
                  ${avatarHtml(a.nome, a.foto)}
                  <div style="flex:1;">${esc(a.nome)}</div>
                  <button class="btn ${done ? "btn-primary" : "btn-ghost"} btn-sm" data-action="checkinManual" data-athlete="${a.id}" data-session="${sessaoHoje.id}">
                    ${done ? "✓ Feito" : "Check-in"}
                  </button>
                </div>`;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function afterCheckin() {
    const search = document.getElementById("checkin-search");
    if (search) {
      search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        document.querySelectorAll(".checkin-row").forEach((row) => {
          row.style.display = row.dataset.nome.includes(q) ? "" : "none";
        });
      });
    }

    const video = document.getElementById("scanner-video");
    const status = document.getElementById("scanner-status");
    if (!video) return;

    if (!("BarcodeDetector" in window)) {
      status.textContent = "Este navegador não suporta leitura de códigos QR pela câmara — usa o check-in manual ao lado.";
      return;
    }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      status.textContent = "Câmara não disponível neste dispositivo — usa o check-in manual ao lado.";
      return;
    }

    let stream = null;
    let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const lastScan = {};

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        video.style.display = "";
        status.style.display = "none";
        video.play();
        scanLoop();
      })
      .catch(() => {
        status.textContent = "Não foi possível aceder à câmara (permissão negada ou indisponível) — usa o check-in manual ao lado.";
      });

    async function scanLoop() {
      if (stopped) return;
      try {
        const codes = await detector.detect(video);
        for (const c of codes) {
          if (c.rawValue && c.rawValue.startsWith(QR_PREFIX)) {
            const atletaId = c.rawValue.slice(QR_PREFIX.length);
            const now = Date.now();
            if (!lastScan[atletaId] || now - lastScan[atletaId] > 4000) {
              lastScan[atletaId] = now;
              Actions.checkinScanned({ athlete: atletaId });
            }
          }
        }
      } catch (e) { /* frame sem deteção, ignorar */ }
      requestAnimationFrame(scanLoop);
    }

    global.__stopScanner = () => { stopped = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }

  global.Views = global.Views || {};
  Object.assign(global.Views, { checkin, qrSvgFor });
  global.afterRenderHooks = global.afterRenderHooks || [];
  global.afterRenderHooks.push(() => {
    if (global.__stopScanner) { global.__stopScanner(); global.__stopScanner = null; }
    afterCheckin();
  });
})(window);
