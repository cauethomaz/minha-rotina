# Formato do `ia.json` da rotina "Mentorados CORE"

A rotina escreve este JSON e roda `node scripts/mentorados.mjs montar <ia.json>` (8h, leitura completa) ou `... montar <ia.json> --incremental` (17h). O script junta com os números do Instagram (calculados dos snapshots por código) e publica a linha `mentorados:carteira`, que a aba **Mentorados → Carteira** do Minha Rotina mostra.

**A IA só escreve o que exige leitura e interpretação.** Não mande números do Instagram (seguidores, mediana, melhor vídeo, meta, % da meta): o script calcula. Situação (Crítico, Atenção, Em dia), casos críticos, próxima ação e tempo de espera em horas úteis são calculados pelo app a partir dos campos abaixo. Textos aceitam só `**negrito**` e `[rótulo](https://link)`. Nunca escreva telefone ou e-mail.

```json
{
  "leitura": {
    "ritual": "quarta",
    "fontes": {
      "whatsapp": { "ok": 10, "total": 11, "falhas": ["Luiza Guerreiro: sem histórico na Kaption"] },
      "planilha": { "ok": true }
    },
    "rodape": ["O que não deu certo nesta leitura, em uma frase."]
  },
  "tempo_resposta": { "media_min": 279, "mediana_min": 94, "n": 73, "periodo": "15 a 22/10", "unidade": "horas corridas", "pior": { "nome": "Jhonatan Pache", "media_min": 374 } },
  "carteira": {
    "pct": 43, "base": 7, "destravados": 3, "nomes_destravados": ["Kenia", "Micael", "Paulo"], "marcas": [40, 50, 65],
    "virais_mes": [{ "nome": "Kenia Cheib", "views": 674000, "data": "2026-09-23", "url": "https://www.instagram.com/reel/...", "prova": "core-kit/provas/arquivo.jpg" }],
    "meta_txt": "Para chegar a **50%** falta 1 destravamento até dia 30.",
    "apostar": [{ "nome": "Vilton Soares", "texto": "Motivos com números.", "acao": "Ação concreta da semana." }],
    "nao_apostar": [{ "nome": "Josi Falco", "texto": "Por que não agora." }],
    "projecao": "Se esses 2 destravarem, a carteira vai de **43%** para **71%**.",
    "nota": "Quem está na Foto de Abertura e provas."
  },
  "fora": [{ "nome": "Vilton Soares", "motivo": "mentoria encerrada em 16/10 · grupo aberto até 15/11", "pendencia": "relatório do gravado não chegou" }],
  "mentorados": [{
    "nome": "Kenia Cheib", "ig": "keniacheib", "grupo": "KÊNIA CHEIB - CORE EXPERIENCE", "estrela": false,
    "produto": "Experience 90", "etapa": "Leva 5 (última)", "etapa_vencida": false,
    "categoria": "QUASE CASE",
    "insta_excluir": ["shortcode de vídeo que não conta: IA, collab, carrossel"],
    "wpp": {
      "atualizado": "2026-10-22T08:10:00-03:00", "ok": true,
      "ultima_cliente": "2026-10-21T18:45:00-03:00", "ultima_minha": "2026-10-21T09:12:00-03:00", "ultima_time": "2026-10-16T17:18:00-03:00",
      "esperando_desde": null, "esperando_txt": null,
      "ultimo_fato": "Avisou que o vídeo de ontem passou de 15 mil.",
      "fatos": [{ "em": "2026-10-21T18:45:00-03:00", "quem": "cliente", "txt": "Fato em uma frase (áudio: pela transcrição)." }]
    },
    "combinados": [
      { "quem": "mentorado", "texto": "5 vídeos no tema sagrado x comum", "prazo": "2026-10-24", "estado": "aberto" },
      { "quem": "core", "texto": "Leva final", "prazo": "2026-10-28", "estado": "aberto" }
    ],
    "mensagem": { "tipo": "Cobrança de quarta", "texto": "Texto pronto, no tom do Cauê." },
    "semana": { "periodo": "12 a 16/10", "itens": [["Vídeos na semana", "6"], ["Seguidores", "+1,6 mil"]], "melhoria": "Ponto de melhoria." },
    "missao": { "texto": "5 vídeos, 1 por dia, no tema sagrado x comum" },
    "headlines": ["5 headlines escaladas do melhor vídeo (sexta)"],
    "headline_base": "Primeira frase falada do melhor vídeo",
    "elias": { "Público": "...", "Estrutura": "...", "Gatilho": "...", "Termos virais": "..." },
    "viral": { "url": "https://www.instagram.com/reel/...", "views": 674000, "data": "2026-09-23", "prova": "core-kit/provas/arquivo.jpg", "status": "validado" },
    "proximo_passo": "Ação concreta do Cauê nesta semana (opcional)."
  }]
}
```

## Regras dos campos que o app usa para calcular

- `wpp.esperando_desde`: data e hora da **primeira** mensagem relevante do mentorado (pergunta, pedido, áudio, reclamação, entrega) que ninguém do time respondeu depois. `null` se não há nada esperando. Agradecimento, figurinha, "ok" e reação não contam. O app conta as horas úteis (seg a sex) e marca: até 24h no prazo, 24 a 48h atenção, acima de 48h crítico.
- `wpp.esperando_txt`: o que ele pediu, em uma frase.
- `wpp.ultima_minha`: última mensagem enviada pela conta do Cauê (fromMe). Mais de 7 dias corridos vira "sem contato recente".
- `wpp.ok`: `false` quando o grupo não pôde ser lido. Ausência de leitura não é ausência de mensagem.
- `combinados[].quem`: `core` (o Cauê ou o time prometeu) ou `mentorado` (ele ficou de entregar). Com `prazo` vencido e `estado` `aberto`: promessa do time vira **Promessa vencida** (crítico); entrega do mentorado vira **Cobrar entrega** (atenção). Marque `feito` só com evidência no grupo (a entrega aconteceu, não só uma mensagem copiada).
- `mensagem`: **uma só** por mentorado. Prioridade: `Resposta pendente` > `Cumprir promessa` > ritual do dia (`Plano de segunda`, `Cobrança de quarta`, `Fechamento de sexta`) > `Reconhecimento de resultado` > `Retomar contato`. Mensagem de ritual só pede ação no dia do ritual; as outras valem sempre. Se o ritual coincidir com uma resposta pendente, junte numa mensagem só.
- `categoria`: `QUENTE`, `QUASE CASE`, `PERTO DE DESTRAVAR`, `EM RITMO`, `PARADO`, `ESFRIOU` (critérios na rotina).
- Na leitura **incremental**, mande só os mentorados com mensagem nova; os outros continuam como estavam.
