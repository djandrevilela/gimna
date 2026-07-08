-- =========================================================
-- AnimaKids — Schema SQL Server (Opção A da arquitetura)
-- Multi-tenant "row-level": as tabelas de dados de turma têm TenantId.
-- Este schema espelha as stores do IndexedDB (js/db.js) para
-- facilitar a futura ligação do frontend a uma API real.
--
-- NOTA SOBRE AUTENTICAÇÃO (email + OTP):
-- Se seguires a Opção B (Supabase — ver ARQUITETURA.md), a tabela
-- Users abaixo não é necessária: o Supabase Auth já gere utilizadores,
-- emails e códigos OTP em "auth.users", e só precisas de um "Profiles"
-- com o mesmo Id para guardar o nome. Se seguires a Opção A (SQL
-- Server + ASP.NET Identity), usa a tabela Users abaixo e liga o envio
-- de código OTP a um serviço de email transacional (ver ARQUITETURA.md).
-- =========================================================

CREATE TABLE Tenants (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Nome            NVARCHAR(200)   NOT NULL,
    Plano           NVARCHAR(50)    NOT NULL DEFAULT 'Trial',
    LimiteAtletas   INT             NOT NULL DEFAULT 30,
    StripeCustomerId NVARCHAR(100)  NULL,
    CriadoEm        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    AtivoAte        DATETIME2       NULL
);

-- Identidade única e global da pessoa (não pertence a nenhum tenant
-- específico — o mesmo André pode gerir turmas em ginásios diferentes).
CREATE TABLE Users (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Nome            NVARCHAR(200)   NOT NULL,
    Email           NVARCHAR(256)   NOT NULL UNIQUE,
    EmailVerificado BIT             NOT NULL DEFAULT 0,
    CriadoEm        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Códigos OTP de login/registo (só necessário na Opção A — o Supabase
-- Auth trata disto internamente na Opção B).
CREATE TABLE OtpCodes (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Email           NVARCHAR(256)   NOT NULL,
    Codigo          CHAR(6)         NOT NULL,
    Tipo            NVARCHAR(20)    NOT NULL DEFAULT 'login',
    ExpiraEm        DATETIME2       NOT NULL,
    Usado           BIT             NOT NULL DEFAULT 0,
    CriadoEm        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_OtpCodes_Email ON OtpCodes(Email);

CREATE TABLE Turmas (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    Nome            NVARCHAR(200)   NOT NULL,
    Descricao       NVARCHAR(MAX)   NULL,
    Dias            NVARCHAR(100)   NULL,
    Horario         NVARCHAR(50)    NULL,
    PadraoMicrociclo NVARCHAR(MAX)  NULL,
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Turmas_Tenant ON Turmas(TenantId);

-- Acesso de uma pessoa a uma turma. Uma mesma pessoa (Users.Id) pode ter
-- várias linhas aqui — uma por turma, mesmo em tenants diferentes — o que
-- permite o cenário "André gestor da AnimaKids e da ActiveKids" e
-- "Leonor ajudante na AnimaKids e na GimnoKids" do pedido original.
CREATE TABLE Memberships (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId          UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
    TurmaId         UNIQUEIDENTIFIER NOT NULL REFERENCES Turmas(Id) ON DELETE CASCADE,
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    Role            NVARCHAR(20)    NOT NULL,  -- 'manager' | 'ajudante' | 'atleta'
    AtletaId        UNIQUEIDENTIFIER NULL,     -- preenchido quando Role = 'atleta'
    Estado          NVARCHAR(20)    NOT NULL DEFAULT 'ativo',
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Membership UNIQUE (UserId, TurmaId, Role)
);
CREATE INDEX IX_Memberships_Turma ON Memberships(TurmaId);
CREATE INDEX IX_Memberships_User ON Memberships(UserId);

-- Convite pendente por email — vira Membership assim que a pessoa
-- confirma esse email pela primeira vez (ver Auth.completeLoginOrSignup).
CREATE TABLE Convites (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Email           NVARCHAR(256)   NOT NULL,
    TurmaId         UNIQUEIDENTIFIER NOT NULL REFERENCES Turmas(Id),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    Role            NVARCHAR(20)    NOT NULL,
    AtletaId        UNIQUEIDENTIFIER NULL,
    Estado          NVARCHAR(20)    NOT NULL DEFAULT 'pendente', -- pendente | aceite
    ConvidadoPor    NVARCHAR(200)   NULL,
    CriadoEm        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Convites_Email ON Convites(Email);

CREATE TABLE Grupos (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    TurmaId         UNIQUEIDENTIFIER NOT NULL REFERENCES Turmas(Id),
    Nome            NVARCHAR(200)   NOT NULL,
    Ordem           INT             NOT NULL DEFAULT 1,
    Descricao       NVARCHAR(MAX)   NULL,
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Grupos_Turma ON Grupos(TurmaId);

CREATE TABLE Atletas (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    TurmaId         UNIQUEIDENTIFIER NOT NULL REFERENCES Turmas(Id),
    GrupoId         UNIQUEIDENTIFIER NULL REFERENCES Grupos(Id),
    Nome            NVARCHAR(200)   NOT NULL,
    DataNascimento  DATE            NULL,
    Encarregado     NVARCHAR(200)   NULL,
    Contacto        NVARCHAR(50)    NULL,
    NotasMedicas    NVARCHAR(MAX)   NULL,
    Ativo           BIT             NOT NULL DEFAULT 1,
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Atletas_Tenant ON Atletas(TenantId);
CREATE INDEX IX_Atletas_Turma ON Atletas(TurmaId);
CREATE INDEX IX_Atletas_Grupo ON Atletas(GrupoId);

-- Progressão de habilidades normalizada (em vez do JSON usado no protótipo)
CREATE TABLE AtletaHabilidades (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AtletaId        UNIQUEIDENTIFIER NOT NULL REFERENCES Atletas(Id) ON DELETE CASCADE,
    Habilidade      NVARCHAR(100)   NOT NULL,
    Fase            TINYINT         NOT NULL DEFAULT 1 CHECK (Fase BETWEEN 1 AND 5),
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_AtletaHabilidade UNIQUE (AtletaId, Habilidade)
);

CREATE TABLE Mesociclos (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    TurmaId         UNIQUEIDENTIFIER NOT NULL REFERENCES Turmas(Id),
    Nome            NVARCHAR(200)   NOT NULL,
    DataInicio      DATE            NOT NULL,
    DataFim         DATE            NOT NULL,
    Objetivo        NVARCHAR(MAX)   NULL,
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Mesociclos_Turma ON Mesociclos(TurmaId);

CREATE TABLE Sessoes (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    TurmaId         UNIQUEIDENTIFIER NOT NULL REFERENCES Turmas(Id),
    MesocicloId     UNIQUEIDENTIFIER NULL REFERENCES Mesociclos(Id),
    Data            DATE            NOT NULL,
    DiaSemana       NVARCHAR(20)    NOT NULL,
    NumeroSessao    INT             NULL,
    SemanaCiclo     TINYINT         NULL,
    Tipo            NVARCHAR(30)    NULL,
    Feriado         NVARCHAR(100)   NULL,
    PlanoConteudo   NVARCHAR(MAX)   NULL,
    Estado          NVARCHAR(20)    NOT NULL DEFAULT 'planeada',
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Sessao_Turma_Data UNIQUE (TurmaId, Data)
);
CREATE INDEX IX_Sessoes_Tenant_Data ON Sessoes(TenantId, Data);
CREATE INDEX IX_Sessoes_Mesociclo ON Sessoes(MesocicloId);

CREATE TABLE Presencas (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    SessaoId        UNIQUEIDENTIFIER NOT NULL REFERENCES Sessoes(Id) ON DELETE CASCADE,
    AtletaId        UNIQUEIDENTIFIER NOT NULL REFERENCES Atletas(Id) ON DELETE CASCADE,
    Estado          NVARCHAR(20)    NOT NULL,
    MarcadoPor      NVARCHAR(200)   NULL,
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Presenca_Sessao_Atleta UNIQUE (SessaoId, AtletaId)
);
CREATE INDEX IX_Presencas_Atleta ON Presencas(AtletaId);

CREATE TABLE Comentarios (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    TargetType      NVARCHAR(20)    NOT NULL,
    TargetId        UNIQUEIDENTIFIER NOT NULL,
    AutorId         UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id),
    AutorNome       NVARCHAR(200)   NOT NULL,
    Texto           NVARCHAR(MAX)   NOT NULL,
    CriadoEm        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Comentarios_Target ON Comentarios(TargetType, TargetId);

-- Mensagens: 'privada' (thread atleta <-> gestores, só gestor responde)
-- ou 'broadcast' (aviso do gestor para todos os atletas da turma).
CREATE TABLE Mensagens (
    Id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    TenantId        UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    TurmaId         UNIQUEIDENTIFIER NOT NULL REFERENCES Turmas(Id),
    Tipo            NVARCHAR(20)    NOT NULL,  -- 'privada' | 'broadcast'
    AtletaId        UNIQUEIDENTIFIER NULL REFERENCES Atletas(Id), -- dono da thread, só em 'privada'
    RemetenteUserId UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id),
    RemetenteNome   NVARCHAR(200)   NOT NULL,
    RemetenteRole   NVARCHAR(20)    NOT NULL,
    Texto           NVARCHAR(MAX)   NOT NULL,
    CriadoEm        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Mensagens_Turma ON Mensagens(TurmaId, Tipo);
CREATE INDEX IX_Mensagens_Atleta ON Mensagens(AtletaId);

CREATE TABLE PreferenciasUtilizador (
    UserId          UNIQUEIDENTIFIER PRIMARY KEY REFERENCES Users(Id) ON DELETE CASCADE,
    WidgetsDashboard NVARCHAR(MAX)  NULL,
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- =========================================================
-- Row-Level Security (multi-tenant) — exemplo para a tabela Atletas.
-- Repetir o mesmo padrão para as restantes tabelas com TenantId.
-- IMPORTANTE: como o acesso agora é multi-turma via Memberships (e não
-- um TenantId fixo por utilizador), o SESSION_CONTEXT deve ser definido
-- com a TurmaId/TenantId da Membership ATIVA escolhida no seletor de
-- turma (ver js/auth.js, Auth.activeMembership) — não com o utilizador
-- em si, já que a mesma pessoa pode ter várias.
-- =========================================================
CREATE FUNCTION dbo.fn_TenantPredicate(@TenantId UNIQUEIDENTIFIER)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS fn_result
WHERE @TenantId = CAST(SESSION_CONTEXT(N'TenantId') AS UNIQUEIDENTIFIER);
GO

CREATE SECURITY POLICY TenantFilter_Atletas
ADD FILTER PREDICATE dbo.fn_TenantPredicate(TenantId) ON dbo.Atletas,
ADD BLOCK PREDICATE dbo.fn_TenantPredicate(TenantId) ON dbo.Atletas AFTER INSERT
WITH (STATE = ON);
GO
