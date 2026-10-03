# Minha Rotina

Sistema pessoal de organização de demandas. Simples na superfície, completo no fundo.

- **Notas:** capture uma linha e aperte Enter. Tipo, prioridade, prazo real, data planejada e horário são preenchidos na hora (marcados como ✦ sugerido, com botão de desfazer).
- **Calendário:** semana e mês, com os mesmos dados das notas. Os compromissos fixos e o expediente aparecem no calendário.
- **Alavancagem:** quanto do seu tempo foi para estratégico, operacional e analítico, comparado com a meta, e a evolução semana a semana.
- **Contexto:** pessoas, projetos, o que é P1, expediente e compromissos fixos.

Site estático (`index.html`) + Supabase (login e banco). A revisão pelo Claude roda no seu Mac, usando o seu plano, sem chave de API.

## Como funciona a organização automática

1. **Na hora (no navegador):** regras e palavras-chave decidem o tipo e a prioridade, o prazo segue a sua regra (1 dia útil, ou hoje se for P1) e o horário é o próximo espaço livre no seu expediente. O app aprende com as suas correções: quando você muda o tipo de uma demanda, as palavras dela passam a pesar para esse tipo.
2. **Depois (no seu Mac):** uma tarefa agendada no app do Claude roda `scripts/revisar.mjs`. O Claude revisa as demandas marcadas como pendentes e melhora título, descrição, subtarefas, tipo e prioridade. O que você definiu manualmente nunca é alterado.

## Configuração (uma vez)

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com). O plano gratuito basta.
2. Em **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key** para o [`config.js`](config.js).
4. Em **Authentication → URL Configuration**, coloque o endereço do site (ex.: `https://SEU-USUARIO.github.io/minha-rotina/`) em **Site URL** e em **Redirect URLs**.

### 2. GitHub Pages

1. Crie um repositório vazio no GitHub chamado `minha-rotina`.
2. Envie o código:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/minha-rotina.git
   git push -u origin main
   ```

3. No repositório: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**. Em um ou dois minutos o site fica em `https://SEU-USUARIO.github.io/minha-rotina/`.

### 3. Primeiro acesso e dados antigos

1. Abra o site e entre com o seu e-mail. Você recebe um link de acesso, sem senha.
2. Em **Contexto → Importar backup**, escolha `backup/backup-2026-10-03.json` para trazer as demandas e o contexto do app antigo.
3. Recomendado: em **Authentication → Sign In / Providers**, desative **Allow new users to sign up** depois do seu primeiro acesso, para mais ninguém criar conta no seu app.

### 4. Revisão pelo Claude (opcional)

1. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → service_role). O `.env` não vai para o GitHub.
2. Teste: `node scripts/revisar.mjs pendentes`.
3. Peça ao Claude para criar a tarefa agendada de revisão.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O app inteiro |
| `config.js` | URL e anon key do Supabase (públicas) |
| `supabase/schema.sql` | Tabelas e regras de acesso |
| `scripts/revisar.mjs` | Revisão pelo Claude, roda no seu Mac |
| `backup/` | Backup dos dados (não vai para o GitHub) |
