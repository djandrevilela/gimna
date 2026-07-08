# AnimaKids — App de Gestão de Treino

PWA (instalável a partir do Chrome) para gerir atletas, grupos de treino, o calendário/plano de treino da época, presenças, mensagens e progressão técnica — com contas de Gestor, Ajudante e Atleta/Encarregado de Educação, cada pessoa podendo pertencer a várias turmas (mesmo em ginásios diferentes). Funciona **offline** e sincroniza assim que há ligação.

## Como experimentar agora (30 segundos)

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Abre no Chrome. Na primeira vez, a app cria automaticamente um cenário de demonstração completo.

**Contas de demonstração** (aparecem também no ecrã de login — entra por email, sem palavra-passe):

| Utilizador | Email | Papel |
|---|---|---|
| André Ferreira | andre@animakids.pt | Gestor da AnimaKids **e** da ActiveKids |
| Rita Almeida | rita@animakids.pt | Ajudante da AnimaKids |
| Leonor Cardoso | leonor@animakids.pt | Ajudante da AnimaKids **e** da GimnoKids |
| Enc. Educação — Maria Santos | maria.enc@example.com | Atleta/Enc. Educação (Maria Santos) |
| Enc. Educação — Afonso Martins | afonso.enc@example.com | Atleta/Enc. Educação (Afonso Martins) |

O login real é por **email + código de 6 dígitos**. Como esta demo não tem servidor de email, o código aparece no próprio ecrã (identificado como modo demonstração) — ver `docs/ARQUITETURA.md` para o ligar a um envio real.

## Instalar como app (Chrome)

Ícone de instalação na barra de endereço, ou menu ⋮ → "Instalar aplicação". No iPhone/iPad (Safari): Partilhar → "Adicionar ao ecrã principal".

## O que já funciona

**Gestão (Gestor):**
- Atletas, grupos, turmas, mesociclos/microciclo, calendário da época completo (feriados de Portugal/Sintra já excluídos).
- Presenças rápidas (Presente / Falta / Falta Justificada / Doença).
- Convites por email para Ajudantes, outros Gestores (co-gestão) e Atletas/Encarregados de educação.
- Criar novas turmas — o próprio ginásio pode ter várias classes.
- Mensagens: responder às conversas dos atletas e enviar avisos gerais.
- Estatísticas completas e dashboard personalizável por widgets.

**Ajudante:** vê tudo, marca presenças e comenta — não edita nem acede a mensagens.

**Atleta / Encarregado de Educação:**
- A Minha Evolução (fases das 6 habilidades-alvo, % de presença).
- Objetivos da Época (resumo do plano geral + objetivo de cada mesociclo).
- Os Meus Treinos (calendário, só leitura).
- Mensagens — pode escrever à equipa técnica; só o Gestor responde.

**Todos os papéis:** uma pessoa pode pertencer a várias turmas — mesmo em ginásios diferentes — e troca entre elas num seletor no topo do menu.

**Multi-tenant / SaaS:** cada ginásio (Tenant) tem o seu plano e limite de atletas; os Gestores pagam a subscrição, os Ajudantes/Atletas entram de graça através de convite.

**Offline-first:** tudo funciona sem internet; um indicador mostra alterações por sincronizar.

## Estrutura de ficheiros

```
index.html
manifest.webmanifest / service-worker.js
css/style.css
js/db.js          camada de dados (IndexedDB) com cache em memória
js/seed.js        dados de demonstração (3 turmas, 5 contas, mensagens)
js/stats.js       cálculos de estatísticas
js/auth.js        autenticação por email + OTP e memberships multi-turma
js/app.js         router, shell, navegação por papel
js/views.js / views2.js / views3.js   todas as páginas
js/actions.js     ações dos botões/formulários
docs/ARQUITETURA.md            stack recomendada, custos, OTP real, multi-turma
docs/TESTES_E_LANCAMENTO.md    checklist de testes + como publicar em produção
docs/schema.sql                schema SQL Server para uma futura API
```

## Próximos passos para produção

Os dados ficam por dispositivo até ligares um backend partilhado. Lê `docs/ARQUITETURA.md` para a comparação de stacks (incluindo como tornar o OTP real e gratuito via Supabase) e `docs/TESTES_E_LANCAMENTO.md` para o checklist de testes e os passos de publicação, do zero até teres subscritores a pagar.
