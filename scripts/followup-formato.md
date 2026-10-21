# Formato do follow-up dos mentorados

A rotina "Follow-up CORE" (segunda e quarta) grava este JSON com `node scripts/publicar-mentorados.mjs followup <arquivo.json>`. A tela **Mentorados** do Minha Rotina mostra na visão **Follow-up** (botão no topo para alternar com o Dashboard).

Textos aceitam só `**negrito**` e `[rótulo](https://link)`. Campos opcionais podem ser omitidos.

```json
{
  "data": "2026-10-19",
  "titulo_data": "Segunda, 19 de outubro de 2026",
  "tipo": "Plano da semana",
  "aviso": "O que o Cauê precisa saber da rodada (atrasos, WhatsApp não lido, rascunhos não digitados).",
  "destaques": ["**Kenia passou de 100 mil:** o vídeo de 13/10 está com 102 mil views."],
  "pendencias": [{
    "prioridade": "URGENTE", "nome": "Odirley Rocha",
    "texto": "O que está pendente do lado do Cauê, com datas.",
    "desde": "reunião hoje 16h · reclamação desde 15/10",
    "acao": "Ação sugerida."
  }],
  "estrelas_nota": "Nenhum cliente CLUB ativo hoje.",
  "clientes": [{
    "nome": "Vilton Soares", "handle": "@viltonsoares", "categoria": "PERTO DE DESTRAVAR",
    "grupo": "Vilton Soares - Mentoria CORE", "estrela": false,
    "resumo": "Resumo do perfil em até 3 linhas, com números.",
    "proximo_passo": "Uma ação concreta da semana.",
    "mensagem": ["Bloco 1 (parabéns)", "Bloco 2 (análise)", "Bloco 3 (próximo passo)", "Bloco 4 (presença)"],
    "rascunho": "digitado"
  }],
  "tabela": {
    "colunas": ["Cliente", "Seguidores", "Δ desde 13/10", "Média views 45d", "Maior 14d", "Último reel", "Meta viral"],
    "linhas": [["Vilton Soares", "103 mil", "0", "6,1 mil", "14,1 mil (07/10)", "16/10", "150 mil"]]
  },
  "tabela_nota": "Como ler a tabela.",
  "rodape": ["Quando rodou e o que não deu certo."]
}
```

- `prioridade`: `URGENTE`, `ALTA` ou `NORMAL`. Mande ordenado por prioridade e tempo de espera.
- `categoria`: `QUENTE`, `QUASE CASE`, `PERTO DE DESTRAVAR`, `PARADO`, `ESFRIOU` ou `EM RITMO`. Mande os clientes já ordenados por prioridade, estrelas primeiro (`"estrela": true`).
- `mensagem`: os blocos da mensagem, um por item; a tela junta com quebra de linha e o botão Copiar copia o texto inteiro.
- `rascunho` (opcional): `digitado` quando ficou como rascunho no grupo, `pulado` quando não deu.

---

# Pendências (varredura das 17h)

A rotina "Varredura de pendências CORE" grava com `node scripts/publicar-mentorados.mjs pendencias <arquivo.json>`. A tela mostra na seção **Pendências do seu lado** da visão Follow-up (sempre a leitura mais recente entre a varredura e o follow-up).

```json
{
  "data": "2026-10-20", "titulo_data": "terça, 20/10", "hora": "17h05",
  "contagem": { "urgente": 0, "alta": 2, "normal": 1, "monitorar": 2 },
  "comparacao": "Total: 3 pendências, contra 4 ontem. O que foi resolvido e o que é novo.",
  "pendencias": [{
    "prioridade": "ALTA", "estrela": false, "nome": "Paulo Soares", "grupo": "PAULO JOSÉ - CORE EXPERIENCE",
    "espera": "~29h úteis", "desde": "desde seg 19/10, 12h00",
    "texto": "O que ele pediu em uma frase (diga \"em áudio\" quando for o caso).",
    "sugestao": "Resposta curta pronta para copiar."
  }],
  "monitorar": [{ "nome": "Josi Falco", "grupo": "...", "espera": "6 dias", "desde": "sua última mensagem: ter 14/10, 11h41", "texto": "...", "sugestao": "..." }],
  "em_dia": ["**Odirley Rocha:** como está o grupo, em uma frase."],
  "rodape": ["O que não deu certo na leitura."]
}
```

---

# Fechamento da semana (sexta)

A rotina "Fechamento da semana CORE" grava com `node scripts/publicar-mentorados.mjs sexta <arquivo.json>`. A tela mostra na visão **Fechamento**.

```json
{
  "data": "2026-10-16", "titulo_data": "semana de 12 a 16/10/2026",
  "nota": "Quantos mentorados, de quando são os números e quando o WhatsApp foi lido.",
  "resumo": { "cresceu": ["**Kenia** +1,6 mil seguidores"], "nao_postou": ["**Josi** desde 22/06"], "nao_respondeu": ["**Paulo**: acesso ao Core Uploader"], "esperando": ["**Nara**: link de perfil de referência"] },
  "atencao": "Alertas da semana.",
  "aviso": "O que falhou na rodada (rascunhos não digitados, transcritor, atraso).",
  "clientes": [{
    "nome": "Kenia Cheib", "ig": "keniacheib", "grupo": "KÊNIA CHEIB - CORE EXPERIENCE", "estrela": false,
    "status": "Mais cresceu", "tom": "ok",
    "nums": [["Vídeos na semana", "6"], ["Seguidores", "+1,6 mil (47,9 mil)"]],
    "best": ["DecyOzfPRfp", "83.700", "13/10"],
    "headline": "Primeira frase falada do melhor vídeo.",
    "elias": { "Público": "...", "Estrutura": "...", "Gatilho": "...", "Termos virais": "..." },
    "melhoria": "Ponto de melhoria com números.",
    "wpp": "O que aconteceu no grupo na semana.",
    "combinado": "O que foi combinado na segunda e se cumpriu.",
    "tarefa": "Missão da próxima semana em uma linha.",
    "msg": ["Linha 1 da mensagem", "Linha 2", "..."],
    "rascunho": "digitado"
  }],
  "rodape": ["..."]
}
```

- `tom`: `ok` (verde), `warn` (amarelo), `bad` (vermelho) ou `mute`. Estrelas primeiro.
