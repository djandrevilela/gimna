# AnimaKids — Arquitetura e Caminho para Produção

Este documento explica o que está construído, o que falta para produção, e as opções de stack — incluindo uma alternativa mais rápida/barata do que ASP.NET MVC + SQL Server, tal como foi pedido.

## 1. O que está construído agora

O que está entregue é uma **PWA (Progressive Web App) 100% front-end**, instalável a partir do Chrome, que funciona totalmente offline:

- HTML/CSS/JS puro, sem build step (nenhum npm/webpack necessário) — abre-se e funciona.
- Todos os dados vivem no **IndexedDB** do próprio dispositivo (`js/db.js`).
- Um **Service Worker** (`service-worker.js`) guarda a app em cache para funcionar sem internet.
- Um `manifest.webmanifest` torna a app instalável ("Adicionar ao ecrã principal" / ícone de instalação no Chrome).
- Autenticação simples local (`js/auth.js`) só para demonstração — ver secção 4.
- Uma fila de sincronização (`syncQueue`) já regista cada alteração feita offline, pronta a ser enviada a um backend assim que exista um.

**Isto é uma base de trabalho real e utilizável** (podes começar a usar amanhã com uma turma), mas os dados ficam presos a cada telemóvel/computador individual — o treinador principal e os ajudantes não veem os dados uns dos outros até existir um backend partilhado. É esse o próximo passo.

## 2. Stack recomendada

Pediste para pensar no stack que já conheces (MVC + SQL Server), mas também para avisar se houver forma mais barata/rápida. Aqui ficam as duas opções, lado a lado:

| | **Opção A — o que já conheces** | **Opção B — mais rápida/barata** |
|---|---|---|
| Backend | ASP.NET Core Web API (C#) | Supabase (Postgres gerido + Auth + API automática) |
| Base de dados | SQL Server (Azure SQL) | PostgreSQL (incluído no Supabase) |
| Autenticação | ASP.NET Identity + JWT (escreves tu) | Supabase Auth (já vem feito: login, roles, recuperação de password) |
| Tempo estimado até produção | 3–5 semanas (a escrever API, auth, multi-tenant) | 3–6 dias (a ligar o frontend já feito ao Supabase) |
| Custo de arranque (poucos ginásios) | ~10-20€/mês (App Service Basic + Azure SQL Serverless) | 0€/mês (plano gratuito do Supabase cobre isto confortavelmente) |
| Custo a crescer (50+ ginásios) | ~40-80€/mês | ~25-60€/mês (plano Pro do Supabase) |
| Quando faz sentido | Se já tens/vais ter uma equipa .NET, ou preferes controlo total do backend | Se queres lançar depressa e barato, e mexer o mínimo possível em backend |

**A minha recomendação honesta:** para um projeto a solo ou pequena equipa, sem experiência prévia de DevOps, a Opção B (Supabase) poupa-te semanas de trabalho — a autenticação, multi-tenancy com Row-Level Security, e a API vêm praticamente feitas, e o frontend que construímos já está pronto a ligar-lhe (é só trocar o `js/db.js` por chamadas fetch/Supabase client, mantendo a mesma fila de sincronização). Guarda a Opção A para se um dia precisares de lógica de negócio muito específica em C#, ou já tiveres uma equipa .NET.

Qualquer uma das opções mantém o mesmo frontend PWA — a arquitetura foi pensada para isso (ver secção 5).

## 3. Modelo de dados / multi-tenant

Cada tabela tem uma coluna `TenantId` (um "tenant" = um ginásio/estúdio que paga a subscrição). Isto é multi-tenancy "row-level": todos os ginásios partilham as mesmas tabelas, mas cada query filtra sempre por `TenantId`.

- Em SQL Server (Opção A): usar **Row-Level Security** (`CREATE SECURITY POLICY`) ou filtros globais do Entity Framework Core (`HasQueryFilter`) para nunca esquecer o filtro por tenant.
- Em Postgres/Supabase (Opção B): usar **Row Level Security nativa** do Postgres — a forma idiomática do Supabase, com uma policy do tipo `tenant_id = auth.jwt() ->> 'tenant_id'`.

Consulta `docs/schema.sql` para o desenho completo das tabelas (equivalente SQL Server ao que está no IndexedDB).

### Planos e faturação (managers pagos, atletas/users à vontade)

- `Tenants.Plano` e `Tenants.LimiteAtletas` já existem no modelo — é aqui que se liga a faturação.
- Para cobrar por subscrição, a forma mais simples e barata é o **Stripe Billing** (Checkout + Customer Portal prontos a usar, sem construíres UI de pagamentos): o manager assina um plano (ex.: "até 40 atletas"), o Stripe trata dos pagamentos recorrentes e envia um webhook quando paga/cancela, que atualiza `Tenants.Plano`.
- Os "users" (ajudantes) dentro de cada tenant não pagam individualmente — o manager (admin) é que tem a subscrição e convida quem quiser (já implementado na página Definições).

## 4. Autenticação por email + OTP — o que muda de demo para produção

Nesta versão, a criação de conta e o login são só por email: a pessoa recebe um código de 6 dígitos e confirma. **Não existe palavra-passe em lado nenhum.**

O problema: uma PWA 100% estática não tem forma de enviar emails a sério — isso exige sempre um servidor. Por isso, no protótipo (`js/auth.js`), o código OTP é gerado e devolvido diretamente na interface (bem identificado como "modo demonstração"), em vez de ser enviado por email.

**Como isto fica real, sem custo, na Opção B (Supabase):**

```js
// pedir o código — o Supabase envia o email automaticamente (grátis até 4/hora no plano free;
// para volume de produção liga o teu próprio remetente SMTP nas definições do projeto, ex. Resend/Postmark)
await supabase.auth.signInWithOtp({ email });

// confirmar o código que a pessoa recebeu
const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' });
```

Isto substitui por completo `Auth.requestOtp` / `Auth.verifyOtp` — o Supabase Auth já trata da geração do código, do envio do email, da expiração e da criação da conta na primeira vez. O resto da lógica de `js/auth.js` (sessão, memberships, papel ativo) mantém-se igual, só troca a fonte da identidade.

**Na Opção A (ASP.NET):** tens de implementar isto tu mesmo — gerar o código (como já está feito), guardar em `OtpCodes` (ver `schema.sql`) e enviá-lo por email através de um serviço como o Resend, Postmark ou Amazon SES (todos têm níveis gratuitos ou muito baratos para o volume de um ginásio).

## 5. Contas em várias turmas / vários ginásios (Memberships)

Uma pessoa (`Users`) pode ter várias `Memberships`, cada uma ligando-a a **uma turma** com **um papel** (`manager`, `ajudante` ou `atleta`) — inclusivamente em ginásios (`Tenants`) diferentes. É assim que o André pode gerir a AnimaKids e a ActiveKids, e a Leonor pode ajudar na AnimaKids e na GimnoKids, com uma única conta cada.

- O seletor de turma no topo do menu troca a `Membership` ativa — todos os dados mostrados (atletas, calendário, mensagens, etc.) são sempre filtrados pela turma/tenant da membership ativa, nunca por todas ao mesmo tempo.
- Convites (`Convites`) ficam pendentes até a pessoa confirmar esse email pela primeira vez — nesse momento tornam-se `Memberships` automaticamente (ver `Auth.completeLoginOrSignup`).
- Um gestor pode convidar outro gestor para a mesma turma (co-gestão) ou um ajudante — a escolha de papel está no formulário de convite.
- Uma conta de atleta liga-se a **um** registo de atleta específico (`Memberships.AtletaId`) — é o que lhe dá acesso apenas à sua própria evolução, aos seus treinos e à sua conversa de mensagens.

## 6. Mensagens

Duas tabelas de uso lógico dentro de `Mensagens` (mesma tabela, campo `Tipo`):
- **`privada`**: uma conversa por atleta, entre essa conta de atleta/encarregado de educação e os gestores da turma. Só gestores respondem (os ajudantes não têm acesso a mensagens, por desenho). Isto é reforçado tanto na interface como sugerido para reforçar no backend (a API deve recusar a um `ajudante` publicar em `Mensagens`).
- **`broadcast`**: aviso do gestor para todos os atletas da turma de uma vez.

## 7. Sincronização offline → online

A app já está desenhada em volta disto — é por isso que funciona bem mesmo sem internet:

1. Toda a alteração (criar/editar/apagar) grava primeiro no IndexedDB local e entra na tabela `syncQueue` (ver `js/db.js`, função `queueSync`).
2. O indicador no topo da app mostra quantas alterações estão por sincronizar.
3. Quando a app deteta ligação (evento `online` do browser) ou o utilizador toca no indicador, `DB.trySync()` é chamado.
4. **O que falta ligar:** hoje, `trySync()` só simula a sincronização (marca tudo como sincronizado). Numa versão ligada a um backend real, este método deve:
   - Enviar cada item da fila para o endpoint correspondente (`POST /api/atletas`, `PUT /api/sessoes/:id`, etc.).
   - Em caso de conflito (dois dispositivos editaram o mesmo registo offline), usar **"last write wins" por `updatedAt`** como regra simples e previsível — cada registo já tem esse campo.
   - Trazer do servidor quaisquer alterações feitas por outros utilizadores desde a última sincronização (pull), e atualizar o IndexedDB local.
5. Para o utilizador, nada disto muda visualmente — continua a app a funcionar sempre, online ou offline.

## 8. Desempenho e custo — o que já foi otimizado

- **Cache em memória no IndexedDB** (`js/db.js`): cada `getAll()` só lê do disco uma vez por sessão; escritas invalidam só a tabela alterada. Como quase todas as páginas fazem vários `getAll` em paralelo (ex.: o dashboard lê 6 tabelas), isto elimina a maior parte das leituras repetidas ao IndexedDB sem mudar nada visualmente.
- **Zero pedidos de rede para funcionar**: como os dados vivem todos no dispositivo, a app não depende da velocidade de nenhum servidor — só os tipos de letra (Google Fonts) precisam de rede na primeira visita, e ficam em cache pelo Service Worker a partir daí.
- **Sem custo de servidor nesta fase**: tudo o que a app faz hoje corre no browser da pessoa; hospedar os ficheiros estáticos é gratuito (ver secção 9). O custo só aparece quando ligares um backend partilhado — e mesmo aí, a Opção B (Supabase) mantém-te no plano gratuito durante bastante tempo (ver tabela da secção 2).
- **Quando a fila de sincronização crescer muito** (uso intenso offline prolongado), o `DB.getAll("syncQueue")` deixa de vir do cache automaticamente após cada envio — nada a fazer da tua parte, mas é bom saber que o desenho já tem isto em conta.

## 9. Hospedagem — custos aproximados

| Componente | Opção barata |
|---|---|
| Frontend (esta PWA) | Gratuito — Azure Static Web Apps, Netlify, Vercel ou GitHub Pages (é só ficheiros estáticos) |
| Backend + Base de dados (Opção A) | Azure App Service B1 (~13€/mês) + Azure SQL Serverless com auto-pause (~5-10€/mês com pouco uso) |
| Backend + Base de dados (Opção B) | Supabase free tier (0€) até crescer; depois Pro a 25$/mês (inclui backups diários, mais capacidade) |
| Pagamentos | Stripe — sem mensalidade, só comissão por transação |

## 10. Roteiro sugerido

1. **Agora:** usar a PWA offline com uma ou várias turmas para validar o dia-a-dia (já funciona, incluindo múltiplos papéis e turmas).
2. **Fase 2:** escolher Opção A ou B e construir a API + base de dados partilhada; ligar `js/db.js` a pedidos de rede em vez de (ou além de) IndexedDB, mantendo a fila de sincronização.
3. **Fase 3:** autenticação real por email+OTP (Supabase Auth ou serviço de email) + faturação (Stripe) + onboarding de novos ginásios (o ecrã "Criar a minha primeira turma" já existe para isso).
4. **Fase 4 (opcional):** notificações push (treino amanhã, mensagem nova, falta registada), e empacotar como app nativa com Capacitor se quiseres presença na App Store / Play Store sem reescrever nada.
