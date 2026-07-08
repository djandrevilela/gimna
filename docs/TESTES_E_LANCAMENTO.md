# AnimaKids — Guia de Testes, Instalação e Lançamento

## 1. Como testar agora (localmente, grátis)

Não precisas de servidor nenhum para testar — só de um servidor de ficheiros estáticos, que qualquer computador já tem forma de correr:

```bash
# opção 1 — Node (se tiveres Node instalado)
npx serve .

# opção 2 — Python (vem em qualquer Mac/Linux)
python3 -m http.server 8080

# opção 3 — extensão "Live Server" do VS Code
```

Abre `http://localhost:8080` (ou a porta que o comando indicar) no **Chrome**. Na primeira vez, a app semeia automaticamente dados de demonstração — não precisas de criar nada à mão.

### Checklist de testes manuais (por papel)

Usa os botões de "Acesso rápido de demonstração" no ecrã de login para testar cada papel sem teres de repetir o fluxo de OTP:

**Como Gestor (André Ferreira — pertence a 2 turmas):**
- [ ] O seletor de turma no topo do menu aparece e troca corretamente entre AnimaKids e ActiveKids (os dados mudam: atletas, calendário, estatísticas).
- [ ] Criar/editar/remover um atleta; atribuir grupo e turma.
- [ ] Criar/editar um grupo; mover atletas de grupo.
- [ ] Abrir uma sessão no calendário, mudar o tipo de treino e o plano, marcar como realizada.
- [ ] Marcar presenças numa sessão (Presente/Falta/Falta Justificada/Doença).
- [ ] Editar o padrão do microciclo em Mesociclos e aplicar a sessões futuras.
- [ ] Criar uma nova turma (Turmas → Nova turma) e confirmar que o acesso de gestor é automático a essa turma.
- [ ] Em Definições: convidar alguém por email (ajudante e gestor); remover o acesso de alguém.
- [ ] Na ficha de um atleta: convidar o encarregado de educação por email.
- [ ] Em Mensagens: responder à conversa da Maria; enviar um aviso geral (broadcast).
- [ ] Personalizar os widgets do dashboard e confirmar que ficam guardados ao voltar a entrar.
- [ ] Exportar dados (Definições → Dados) e confirmar que o ficheiro JSON é descarregado.

**Como Ajudante (Rita Almeida):**
- [ ] Não vê botões de criar/editar/remover em Atletas, Grupos, Turmas, Mesociclos.
- [ ] Consegue marcar presenças e adicionar comentários.
- [ ] O item "Mensagens" não aparece no menu, e aceder a `#/mensagens` diretamente mostra "sem acesso".
- [ ] Consegue ver Estatísticas (só leitura).

**Como Atleta/Encarregado de Educação (Enc. Educação — Maria Santos):**
- [ ] Só vê Início, Os Meus Treinos, A Minha Evolução, Objetivos, Mensagens, Definições.
- [ ] "A Minha Evolução" mostra só os dados da própria Maria (fases das 6 habilidades, % de presença).
- [ ] "Objetivos" mostra o resumo do plano geral e os mesociclos.
- [ ] Consegue enviar uma mensagem e ver a resposta do gestor.
- [ ] Tentar aceder a `#/atletas` ou `#/estatisticas` mostra "sem acesso".

**Fluxo de conta nova (email + OTP):**
- [ ] Introduzir um email novo → aparece o ecrã de código com o aviso de "modo demonstração" e o código visível.
- [ ] Confirmar o código → é pedido o nome (só para contas novas) → entra na app.
- [ ] Sem turma associada → aparece o ecrã "Criar a minha primeira turma", que funciona e dá acesso de gestor imediato.
- [ ] Convidar um email que já tem conta → o acesso fica ativo de imediato (sem precisar de OTP outra vez).

**Offline:**
- [ ] Com a app aberta, ativar o modo avião / desligar o wifi → continuar a navegar, marcar presenças, adicionar comentários — tudo deve continuar a funcionar.
- [ ] O indicador no topo muda para "Offline" e mostra quantas alterações estão por sincronizar.
- [ ] Ligar a internet novamente → o indicador sincroniza automaticamente.

## 2. Instalar como app (Chrome)

- **Android/Desktop Chrome**: ícone de instalação na barra de endereço, ou menu ⋮ → "Instalar aplicação". O banner no dashboard também oferece este atalho.
- **iPhone/iPad (Safari)**: botão Partilhar → "Adicionar ao ecrã principal" (o iOS não segue o mesmo mecanismo de instalação do Chrome, mas o resultado final é equivalente).

## 3. Lançar em produção — passo a passo, custo zero para começar

Isto assume a **Opção B (Supabase)** descrita em `ARQUITETURA.md`, por ser a forma mais rápida e barata de sair desta demo para uma versão com dados partilhados entre dispositivos.

### Passo 1 — Publicar o frontend (grátis)
1. Cria uma conta gratuita em Cloudflare Pages, Netlify ou Vercel.
2. Arrasta a pasta desta app (ou liga a um repositório Git) — qualquer um destes serviços publica ficheiros estáticos gratuitamente, com HTTPS incluído (obrigatório para PWAs).
3. Fica com um endereço tipo `animakids.pages.dev` — podes ligar um domínio próprio mais tarde, também sem custo extra na maioria destes serviços.

### Passo 2 — Criar o backend (grátis até crescer)
1. Cria uma conta em supabase.com (plano Free: até 500 MB de base de dados e 50 000 utilizadores ativos/mês — mais do que suficiente para começar).
2. Cria um novo projeto — o Supabase dá-te logo uma base de dados Postgres, autenticação e uma API.
3. No SQL Editor do Supabase, corre uma versão adaptada de `docs/schema.sql` (troca `UNIQUEIDENTIFIER` por `uuid`, `NVARCHAR` por `text`, `DATETIME2` por `timestamptz` — são as únicas diferenças de sintaxe relevantes).
4. Em Authentication → Providers, ativa o login por Email OTP (vem pronto a usar).
5. Ativa Row Level Security em cada tabela e cria as políticas com base na `Memberships` do utilizador autenticado (o painel do Supabase tem um editor visual para isto).

### Passo 3 — Ligar a app ao Supabase
1. Adiciona o SDK: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`.
2. Substitui as funções de `js/auth.js` pelas chamadas `supabase.auth.signInWithOtp` / `verifyOtp` (exemplos em `ARQUITETURA.md`, secção 4).
3. Substitui gradualmente `DB.getAll`/`DB.put` em `js/db.js` por chamadas ao Supabase, mantendo a mesma fila `syncQueue` para continuar a funcionar offline.

### Passo 4 — Cobrar subscrições (quando houver clientes)
1. Cria uma conta Stripe (grátis, só paga comissão por transação).
2. Usa o Stripe Checkout para o gestor escolher um plano; um webhook do Stripe atualiza `Tenants.Plano` no Supabase.
3. Usa o Stripe Customer Portal para os clientes gerirem a própria subscrição sem teres de construir essa interface.

### Quando passar para um servidor mais específico

Fica no Supabase Free/Pro enquanto:
- a base de dados tiver menos de alguns GB,
- não precisares de infraestrutura dedicada por questões de compliance/contrato.

Sinais de que vale a pena migrar para algo mais robusto (Supabase num plano superior, ou infraestrutura própria tipo Azure/AWS):
- Já tens dezenas de ginásios pagantes e precisas de SLA/suporte dedicado.
- Precisas de relatórios pesados ou integrações que beneficiem de mais controlo sobre a base de dados.
- Requisitos legais específicos (ex.: residência de dados num país específico) que o plano gratuito/standard não cobre.

Nessa altura, a migração é sobretudo uma mudança de infraestrutura (mover a mesma base de dados Postgres, ou portar para SQL Server se preferires a Opção A) — o frontend não muda.
