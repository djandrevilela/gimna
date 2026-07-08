# AnimaKids — Backend real (Express + SQLite + JWT + Web Push)

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

## Ligar isto ao frontend

O frontend (pasta principal) ainda funciona 100% em modo offline-local (IndexedDB) — é intencional, para poderes usar já sem backend nenhum. Para ligar os dois:

1. Substituir as chamadas em `js/db.js` e `js/auth.js` por chamadas `fetch()` a este backend (mantendo a mesma fila `syncQueue` para continuar a funcionar offline).
2. Guardar o `token` devolvido pelo login e enviá-lo em `Authorization: Bearer ...` em cada pedido.
3. Guardar a `turmaId` ativa e enviá-la em `X-Turma-Id` em cada pedido.

Isto é o próximo passo de integração — ver `docs/ARQUITETURA.md` para mais contexto de arquitetura e alternativas (ex.: usar Supabase em vez deste backend, se preferires não gerir servidor nenhum).

## Notificações push — para funcionarem a sério

1. No frontend, pede permissão de notificações e subscreve com a chave pública: `GET /push/vapid-public-key`.
2. Envia essa subscrição para `POST /push/subscribe`.
3. O gestor chama `POST /push/broadcast { turmaId, title, body }` (ou isto é acionado automaticamente quando envia um aviso geral) e todos os atletas subscritos recebem a notificação, mesmo com a app fechada — porque isto já usa Web Push a sério, não é simulado.

## Email real (OTP)

Por omissão, o código OTP não é enviado — aparece na resposta em modo `development` para poderes testar sem configurar nada. Para enviar a sério (gratuito para o volume de um ginásio), ver a nota no topo de `routes/auth.js` — a forma mais rápida é o [Resend](https://resend.com).

## Publicar isto de graça

Este backend corre em qualquer serviço que aceite Node.js: [Render](https://render.com), [Railway](https://railway.app) ou [Fly.io](https://fly.io) têm níveis gratuitos suficientes para começar. O SQLite funciona bem para um número pequeno/médio de ginásios; se cresceres muito, troca `better-sqlite3` por um Postgres gerido (ex.: o da Render, ou Supabase) — a estrutura das queries muda pouco.
