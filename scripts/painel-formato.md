# Formato do painel dos mentorados

A rotina "Dashboard CORE" grava este JSON com `node scripts/publicar-painel.mjs <arquivo.json>`. A tela **Mentorados** do Minha Rotina lê e desenha.

Textos aceitam só `**negrito**` e `[rótulo](https://link)`. Níveis: `crit` (vermelho), `warn` (amarelo), `ok` (verde), `mute` (cinza). Campos opcionais podem ser omitidos.

```json
{
  "data": "2026-10-05",
  "titulo_data": "segunda-feira, 5 de outubro de 2026",
  "top3": [{ "nome": "Josi Falco", "texto": "Motivo em uma ou duas frases, com **o número que importa**." }],
  "resumo": { "criticos": 4, "atencao": 6, "oportunidades": 6, "ativos": 11 },
  "avisos": ["**WhatsApp não foi lido hoje.** O que falhou e como destravar."],
  "carteira": {
    "pct": 43,
    "texto": "3 de 7 mentorados da foto de abertura já têm o primeiro viral.",
    "marcas": [{ "nome": "Júnior · 40%", "status": "Batida" }, { "nome": "Pleno · 50%", "status": "Falta 1 destravamento" }],
    "candidatos": [{ "nome": "Vilton Soares", "texto": "Meta de 150 mil, reel em [28,8 mil](https://www.instagram.com/...)." }],
    "nota": "Quem está na foto de abertura e provas dos virais."
  },
  "atencao": [{
    "nivel": "crit", "selo": "Crítico", "nome": "Josi Falco",
    "texto": "Situação com números.", "acao": "→ O que fazer hoje.",
    "sugestao": "Texto pronto para copiar e mandar (opcional)."
  }],
  "oportunidades": [{ "selo": "Semana forte", "nome": "Vilton Soares", "texto": "...", "acao": "→ ...", "sugestao": "..." }],
  "estrelas": [{ "nome": "Cliente CLUB", "texto": "...", "acao": "→ ..." }],
  "ativos": [{
    "nome": "Ana Sueli Pinho", "sub": "@anasuelipinho · BOPE", "produto": "Experience 90",
    "etapa": "Leva 3 prevista 02/10", "etapa_selo": { "txt": "vencida", "nivel": "warn" },
    "seguidores": "5.572", "seguidores_sub": "igual a ontem", "var7": "—",
    "media30": "268", "media30_sub": "", "maior7": "529", "maior7_url": "https://www.instagram.com/...",
    "dias_sem_postar": "2", "dias_nivel": "", "whatsapp": "Áudio sem resposta", "whatsapp_nivel": "crit"
  }],
  "notas": ["Explicações da tabela e feedback proativo do dia."],
  "rodape": ["Horário da leitura, fontes lidas e o que falhou."]
}
```
