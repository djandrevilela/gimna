const express = require("express");
const db = require("../db");
const { uuid, nowIso } = require("../util");
const { signToken } = require("../middleware/auth");

const router = express.Router();
const isProd = process.env.NODE_ENV === "production";

function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
function norm(email) { return String(email || "").trim().toLowerCase(); }

// -----------------------------------------------------------------
// POST /auth/request-otp  { email }
// -----------------------------------------------------------------
router.post("/request-otp", (req, res) => {
  const email = norm(req.body.email);
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Email inválido." });

  const codigo = genOtp();
  const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO otp_codes (id, email, codigo, tipo, expiraEm, usado) VALUES (?,?,?,?,?,0)")
    .run(uuid(), email, codigo, "login", expiraEm);

  // TODO produção: substituir este console.log por um envio real (ver nota no fim do ficheiro).
  console.log("[OTP] " + email + " -> " + codigo + " (expira " + expiraEm + ")");

  const body = { ok: true, message: "Código gerado." };
  if (!isProd) body.devCode = codigo; // só em desenvolvimento, para testares sem servidor de email
  res.json(body);
});

// -----------------------------------------------------------------
// POST /auth/verify-otp  { email, codigo, nome? }
// -----------------------------------------------------------------
router.post("/verify-otp", (req, res) => {
  const email = norm(req.body.email);
  const codigo = String(req.body.codigo || "").trim();
  if (!email || !codigo) return res.status(400).json({ error: "Faltam dados." });

  const match = db.prepare(
    "SELECT * FROM otp_codes WHERE email = ? AND usado = 0 ORDER BY expiraEm DESC LIMIT 1"
  ).get(email);
  if (!match || match.codigo !== codigo) return res.status(400).json({ error: "Código inválido." });
  if (new Date(match.expiraEm) < new Date()) return res.status(400).json({ error: "Código expirado — pede um novo." });

  db.prepare("UPDATE otp_codes SET usado = 1 WHERE id = ?").run(match.id);

  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    const id = uuid();
    db.prepare("INSERT INTO users (id, nome, email, emailVerificado, criadoEm, updatedAt) VALUES (?,?,?,1,?,?)")
      .run(id, req.body.nome || email.split("@")[0], email, nowIso(), nowIso());
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  } else if (!user.emailVerificado) {
    db.prepare("UPDATE users SET emailVerificado = 1 WHERE id = ?").run(user.id);
  }

  const pendentes = db.prepare("SELECT * FROM convites WHERE email = ? AND estado = 'pendente'").all(email);
  for (const c of pendentes) {
    const exists = db.prepare("SELECT id FROM memberships WHERE userId=? AND turmaId=? AND role=?").get(user.id, c.turmaId, c.role);
    if (!exists) {
      db.prepare("INSERT INTO memberships (id,userId,turmaId,tenantId,role,atletaId,estado,updatedAt) VALUES (?,?,?,?,?,?,'ativo',?)")
        .run(uuid(), user.id, c.turmaId, c.tenantId, c.role, c.atletaId || null, nowIso());
    }
    db.prepare("UPDATE convites SET estado='aceite' WHERE id=?").run(c.id);
  }

  const memberships = db.prepare("SELECT * FROM memberships WHERE userId = ? AND estado = 'ativo'").all(user.id);
  const token = signToken(user.id);
  res.json({ ok: true, token, user, memberships });
});

module.exports = router;

// =====================================================================
// COMO TORNAR O ENVIO DE EMAIL REAL (grátis para o volume de um ginásio):
//   npm install resend
//   const { Resend } = require('resend');
//   const resend = new Resend(process.env.RESEND_API_KEY);
//   await resend.emails.send({ from: 'AnimaKids <login@oteudominio.com>', to: email,
//     subject: 'O teu código AnimaKids', text: 'O teu código é ' + codigo });
// O Resend tem um nível gratuito generoso; alternativas equivalentes:
// Postmark, Amazon SES. Depois de ligares isto, remove o devCode da resposta.
// =====================================================================
