# Formato do follow-up dos mentorados

A rotina "Follow-up CORE" (segunda e quarta) grava este JSON com `node scripts/publicar-followup.mjs <arquivo.json>`. A tela **Mentorados** do Minha Rotina mostra na visão **Follow-up** (botão no topo para alternar com o Dashboard).

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
