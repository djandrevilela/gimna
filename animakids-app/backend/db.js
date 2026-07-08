// =========================================================
// AnimaKids backend — SQLite (better-sqlite3)
// Mesmo modelo de dados do frontend (ver ../docs/schema.sql),
// adaptado para SQLite: JSON complexo guardado como TEXT.
// =========================================================
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "animakids.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, plano TEXT DEFAULT 'Trial',
  limiteAtletas INTEGER DEFAULT 30, stripeCustomerId TEXT,
  criadoEm TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  emailVerificado INTEGER DEFAULT 0, criadoEm TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, codigo TEXT NOT NULL, tipo TEXT DEFAULT 'login',
  expiraEm TEXT NOT NULL, usado INTEGER DEFAULT 0, criadoEm TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS turmas (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT,
  horario TEXT, epocaInicio TEXT, epocaFim TEXT,
  diasSemana TEXT DEFAULT '[]', feriados TEXT DEFAULT '[]', padraoMicrociclo TEXT,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, turmaId TEXT NOT NULL, tenantId TEXT NOT NULL,
  role TEXT NOT NULL, atletaId TEXT, estado TEXT DEFAULT 'ativo',
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS convites (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, turmaId TEXT NOT NULL, tenantId TEXT NOT NULL,
  role TEXT NOT NULL, atletaId TEXT, estado TEXT DEFAULT 'pendente',
  convidadoPor TEXT, criadoEm TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grupos (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, turmaId TEXT NOT NULL, nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 1, descricao TEXT, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS atletas (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, turmaId TEXT NOT NULL, grupoId TEXT,
  nome TEXT NOT NULL, dataNascimento TEXT, encarregado TEXT, contacto TEXT,
  notasMedicas TEXT, foto TEXT, ativo INTEGER DEFAULT 1, habilidades TEXT DEFAULT '{}',
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mesociclos (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, turmaId TEXT NOT NULL, nome TEXT NOT NULL,
  dataInicio TEXT NOT NULL, dataFim TEXT NOT NULL, objetivo TEXT,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, turmaId TEXT NOT NULL, mesocicloId TEXT,
  data TEXT NOT NULL, diaSemana TEXT, semanaCiclo INTEGER, tipo TEXT, feriado TEXT,
  planoConteudo TEXT, planosGrupo TEXT DEFAULT '{}', planosAtleta TEXT DEFAULT '{}',
  estado TEXT DEFAULT 'planeada', updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS presencas (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, sessaoId TEXT NOT NULL, atletaId TEXT NOT NULL,
  estado TEXT NOT NULL, marcadoPor TEXT, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sessaoId, atletaId)
);

CREATE TABLE IF NOT EXISTS comentarios (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, targetType TEXT NOT NULL, targetId TEXT NOT NULL,
  autorId TEXT NOT NULL, autorNome TEXT NOT NULL, texto TEXT NOT NULL,
  criadoEm TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mensagens (
  id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, turmaId TEXT NOT NULL, tipo TEXT NOT NULL,
  atletaId TEXT, remetenteUserId TEXT NOT NULL, remetenteNome TEXT NOT NULL, remetenteRole TEXT NOT NULL,
  texto TEXT NOT NULL, criadoEm TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS preferencias (
  userId TEXT PRIMARY KEY, widgetsDashboard TEXT, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY, userId TEXT NOT NULL, turmaId TEXT NOT NULL,
  subscription TEXT NOT NULL, criadoEm TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_memberships_turma ON memberships(turmaId);
CREATE INDEX IF NOT EXISTS ix_memberships_user ON memberships(userId);
CREATE INDEX IF NOT EXISTS ix_atletas_turma ON atletas(turmaId);
CREATE INDEX IF NOT EXISTS ix_sessoes_turma ON sessoes(turmaId);
CREATE INDEX IF NOT EXISTS ix_presencas_sessao ON presencas(sessaoId);
`);

module.exports = db;
