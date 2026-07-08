const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-troca-isto-em-producao";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sem sessão — falta o token." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

// Exige que o pedido indique a turma ativa (header X-Turma-Id) e que o
// utilizador tenha uma membership ativa nessa turma. Anexa req.membership.
function requireMembership(minRoles) {
  return (req, res, next) => {
    const turmaId = req.headers["x-turma-id"];
    if (!turmaId) return res.status(400).json({ error: "Falta o cabeçalho X-Turma-Id." });
    const m = db.prepare("SELECT * FROM memberships WHERE userId = ? AND turmaId = ? AND estado = 'ativo'").get(req.userId, turmaId);
    if (!m) return res.status(403).json({ error: "Sem acesso a esta turma." });
    if (minRoles && !minRoles.includes(m.role)) return res.status(403).json({ error: "Sem permissão para esta ação." });
    req.membership = m;
    next();
  };
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

module.exports = { requireAuth, requireMembership, signToken, JWT_SECRET };
