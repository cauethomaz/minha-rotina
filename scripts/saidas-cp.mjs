#!/usr/bin/env node
// Confere o saidas_cp.json que a rotina producao-diaria escreve a partir da tela
// Carteira Geral → Calculadora de Projeção do Controle de Produção (cp.corestudio.ai), antes de subir para o
// dashboard "Carteira dos Estrategistas".
//   node scripts/saidas-cp.mjs [arquivo]   (padrão: ~/.claude/producao/carteira/saidas_cp.json)
// Formato esperado: {"rows": [...], "meta": [...]}, com linhas de três tipos:
//   {"tipo": "resumo", "lido_em": "AAAA-MM-DD", "saidas_30d": 31, "saidas_60d": 37}   (exatamente uma)
//   {"tipo": "mes", "mes": "AAAA-MM", "saidas": 19}                                  (os meses da tabela da calculadora)
//   {"tipo": "pessoa", "estrategista": "Nome", "finalizar": 5}                        (o número FINALIZAR de cada card)
// Saída: SAIDAS_CP_OK <resumo> ou ERRO: <motivo> (código 1).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arq = process.argv[2] || path.join(os.homedir(), '.claude', 'producao', 'carteira', 'saidas_cp.json');
const erro = (m) => { console.log('ERRO: ' + m); process.exit(1); };
let j;
try { j = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { erro('não consegui ler ' + arq + ': ' + e.message); }
if (!j || !Array.isArray(j.rows)) erro('falta a lista "rows"');
const inteiro = (v) => Number.isInteger(v) && v >= 0;
const resumo = j.rows.filter((r) => r.tipo === 'resumo');
if (resumo.length !== 1) erro('precisa de exatamente uma linha "resumo"');
const r0 = resumo[0];
if (!/^\d{4}-\d{2}-\d{2}$/.test(r0.lido_em || '')) erro('resumo.lido_em deve ser AAAA-MM-DD');
if (!inteiro(r0.saidas_30d) || !inteiro(r0.saidas_60d)) erro('resumo.saidas_30d e saidas_60d devem ser inteiros');
const meses = j.rows.filter((r) => r.tipo === 'mes');
if (meses.length < 3) erro('menos de 3 meses na tabela da calculadora');
for (const m of meses) {
  if (!/^\d{4}-\d{2}$/.test(m.mes || '')) erro('mês fora do formato AAAA-MM: ' + JSON.stringify(m));
  if (!inteiro(m.saidas)) erro('saídas do mês não é inteiro: ' + JSON.stringify(m));
}
const pessoas = j.rows.filter((r) => r.tipo === 'pessoa');
if (!pessoas.length) erro('nenhuma linha "pessoa"');
for (const p of pessoas) {
  if (!p.estrategista || typeof p.estrategista !== 'string') erro('pessoa sem nome: ' + JSON.stringify(p));
  if (!inteiro(p.finalizar)) erro('finalizar não é inteiro: ' + JSON.stringify(p));
}
const outros = j.rows.filter((r) => !['resumo', 'mes', 'pessoa'].includes(r.tipo));
if (outros.length) erro('linha de tipo desconhecido: ' + JSON.stringify(outros[0]));
console.log(`SAIDAS_CP_OK lido em ${r0.lido_em} · ${r0.saidas_30d} em 30d, ${r0.saidas_60d} em 60d · ${meses.length} meses · ${pessoas.length} pessoas`);
