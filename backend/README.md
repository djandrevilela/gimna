# Gimna — Backend real (Express + SQLite + JWT + Web Push)

Backend genuíno e funcional (não é só uma maquete) que implementa: contas por email + código OTP, sessões via JWT, multi-turma/multi-tenant com controlo de acesso por papel (gestor/ajudante/atleta), CRUD de todas as entidades da app, geração automática das sessões da época, e notificações push reais (Web Push com VAPID).

## Correr localmente (2 minutos, sem custo)

```bash
cd backend
npm install
npm run dev
```

Fica em `http://localhost:3001`. Testa com:

```bash
curl http://localhost:3001/health
```

Já vem com um `.env` com chaves VAPID reais e um `JWT_SECRET` de desenvolvimento — funciona imediatamente, mas **gera as tuas próprias chaves antes de ires para produção** (ver `.env.example`).

## Testar o fluxo completo por curl

```bash
# 1. pedir código (em desenvolvimento, o código vem na resposta em "devCode")
curl -X POST http://localhost:3001/auth/request-otp -H "Content-Type: application/json" \
  -d '{"email":"tu@exemplo.com"}'

# 2. confirmar o código (substitui 123456 pelo devCode recebido)
curl -X POST http://localhost:3001/auth/verify-otp -H "Content-Type: application/json" \
  -d '{"email":"tu@exemplo.com","codigo":"123456","nome":"O Teu Nome"}'
# -> devolve { token, user, memberships }

# 3. usar o token nos pedidos seguintes
curl -X POST http://localhost:3001/api/turmas/first -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" -d '{"tenantNome":"O meu ginásio","turmaNome":"AnimaKids"}'
```

Todos os endpoints de dados (`/api/atletas`, `/api/grupos`, etc.) exigem também o cabeçalho `X-Turma-Id` com o id da turma ativa — é assim que o servidor sabe com que turma/tenant estás a trabalhar e valida a tua permissão nessa turma especificamente.

## Estrutura

```
server.js          arranque do Express
db.js              schema SQLite (criado automaticamente no primeiro arranque)
season.js          geração de sessões a partir da configuração da turma (mesma lógica do frontend)
middleware/auth.js JWT + verificação de membership por turma
routes/auth.js     pedido/confirmação de código OTP
routes/api.js      CRUD de turmas, grupos, atletas, mesociclos, sessões, presenças, comentários, mensagens, convites, memberships
routes/push.js     subscrição e envio de notificações push (Web Push/VAPID)
```

## Limitações conhecidas da sincronização (por agora)

- **Desmarcar uma presença** (voltar a "sem estado") só acontece localmente — o servidor guarda a última marcação enviada, não a remoção. Trocar de estado (Presente → Falta, etc.) sincroniza normalmente.
- **Criar uma turma estando offline** fica guardada só localmente até voltares a ficar online e a entrares de novo — não há ainda envio automático desse caso específico para o servidor.
- **Convites e gestão de acessos** (convidar por email, remover acesso) ainda só acontecem localmente quando testados sem ligação — usa-os com internet ligada.
- **Resolução de conflitos** é "o último a gravar ganha" (por `updatedAt`), sem fusão inteligente — suficiente para uma equipa pequena, mas vale a pena saber que existe.

Nenhuma destas limitações impede o uso normal do dia-a-dia (marcar presenças, gerir atletas, planos de treino) — só são casos de fronteira a ter em conta se dois dispositivos editarem exatamente a mesma coisa ao mesmo tempo sem internet.



**Isto já está feito** — o frontend (pasta principal) já sabe falar com este backend. Só precisas de um passo:

1. Abre `js/config.js` na pasta principal e muda o URL:
   ```js
   window.API_BASE_URL = "https://o-teu-servico.onrender.com"; // ou http://localhost:3001 para testares localmente
   ```
2. Volta a publicar o frontend (commit + push, se usares GitHub Pages/Render/Netlify a fazer deploy automático).

A partir daí:
- O login por email passa a ser real (o código já não aparece só no ecrã — vem deste servidor).
- Cada gravação (criar atleta, marcar presença, etc.) grava primeiro no dispositivo e é enviada ao servidor automaticamente, quase em tempo real, sempre que há sessão online.
- Ao entrar a partir de outro dispositivo com a mesma conta, os dados da turma são trazidos do servidor automaticamente.
- Se a internet cair a meio de um treino, a app continua a funcionar (grava tudo localmente) e sincroniza sozinha assim que a ligação voltar, ou quando tocares no indicador no topo da app.

Isto foi testado de ponta a ponta (não é só teoria): criei conta, criei turma, adicionei um atleta, confirmei que apareceu na base de dados do servidor, e confirmei que desligar o backend não parte a app (cai para o modo local automaticamente).

## Lembretes diários (aniversários, treinos/eventos, avaliações)

`POST /push/turmas/:id/lembretes-diarios` (autenticado, gestor) verifica, para essa turma: aniversários de atletas hoje, treinos/eventos de amanhã, e mesociclos terminados com avaliações em falta — e envia um push aos gestores/ajudantes com um resumo, se houver alguma novidade.

Isto **não corre automaticamente sozinho** — precisa de alguém (ou algo) a chamá-lo uma vez por dia. Como o plano gratuito do Render adormece o serviço por inatividade, a forma mais simples e gratuita de resolver os dois problemas de uma vez é usar um serviço de cron externo gratuito (ex.: [cron-job.org](https://cron-job.org), grátis) para chamar este endpoint uma vez por dia — isso também mantém o serviço "acordado" nesse momento.

## Backup antes de qualquer migração/redeploy

`GET /api/turmas/:id/exportar-tudo` (autenticado, gestor) devolve todos os dados dessa turma em JSON. Vale a pena guardar isto antes de qualquer alteração grande de infraestrutura — ver `docs/ARQUITETURA.md`, secção 6.5.

## Ligar isto ao frontend

**Isto já está feito** — o frontend (pasta principal) já sabe falar com este backend. Só precisas de um passo:

1. Abre `js/config.js` na pasta principal e muda o URL:
   ```js
   window.API_BASE_URL = "https://o-teu-servico.onrender.com"; // ou http://localhost:3001 para testares localmente
   ```
2. Volta a publicar o frontend (commit + push, se usares GitHub Pages/Render/Netlify a fazer deploy automático).

A partir daí:
- O login por email passa a ser real (o código já não aparece só no ecrã — vem deste servidor).
- Cada gravação (criar atleta, marcar presença, etc.) grava primeiro no dispositivo e é enviada ao servidor automaticamente, quase em tempo real, sempre que há sessão online.
- Ao entrar a partir de outro dispositivo com a mesma conta, os dados da turma são trazidos do servidor automaticamente.
- Se a internet cair a meio de um treino, a app continua a funcionar (grava tudo localmente) e sincroniza sozinha assim que a ligação voltar, ou quando tocares no indicador no topo da app.

Isto foi testado de ponta a ponta (não é só teoria): criei conta, criei turma, adicionei um atleta, confirmei que apareceu na base de dados do servidor, e confirmei que desligar o backend não parte a app (cai para o modo local automaticamente).

## Notificações push — para funcionarem a sério

1. No frontend, pede permissão de notificações e subscreve com a chave pública: `GET /push/vapid-public-key`.
2. Envia essa subscrição para `POST /push/subscribe`.
3. O gestor chama `POST /push/broadcast { turmaId, title, body }` (ou isto é acionado automaticamente quando envia um aviso geral) e todos os atletas subscritos recebem a notificação, mesmo com a app fechada — porque isto já usa Web Push a sério, não é simulado.

## Email real (OTP)

Por omissão, o código OTP não é enviado — aparece na resposta em modo `development` para poderes testar sem configurar nada. Para enviar a sério (gratuito para o volume de um ginásio), ver a nota no topo de `routes/auth.js` — a forma mais rápida é o [Resend](https://resend.com).

## Publicar isto de graça

Este backend corre em qualquer serviço que aceite Node.js. As condições de free tier mudam com frequência nestas plataformas — confirma sempre no site de cada uma antes de decidir. [Render](https://render.com) continua a ser a opção mais simples para começar já; se precisares de trocar mais tarde, ver `docs/ARQUITETURA.md`, secção 6.5, para a estratégia de separar os dados (base de dados) da computação (o teu Node.js) para não perder nada em futuras migrações. O SQLite funciona bem para um número pequeno/médio de ginásios; se cresceres muito, considera um Postgres gerido (ex.: Supabase).
