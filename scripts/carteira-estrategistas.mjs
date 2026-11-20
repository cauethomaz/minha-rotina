// Monta a carteira dos estrategistas a partir da exportação de Clientes do Controle de Produção (CSV com ";").
// Só clientes com situação "ativo". Estrategista = quem aparece como Responsável Mentor ou Responsável Copy
// ("A definir" e vazio não contam). Quem é mentor e copy do mesmo cliente conta uma vez, como "Mentor e copy".
// Não leva nome, e-mail nem telefone de cliente: só contagens.
// Alimenta o dashboard "Carteira dos Estrategistas" (https://claude.ai/artifact/Bwaa4Te9mwxoib9ZspCnJr).
//   node scripts/carteira-estrategistas.mjs <clientes_AAAA-MM-DD.csv> [pasta de saída]
//   → grava base.json, carteira.json, entradas.json e semanas.json (padrão: ~/.claude/producao/carteira/)
// Redistribuições combinadas e ainda não lançadas no CP: cada ~/.claude/producao/redistribuicoes/*.json
// ({efetiva_em, trocas: [{mentorado, mentor_atual, copy_atual, novo_mentor, novo_copy}]}) troca o responsável
// só onde o CSV ainda mostra o responsável antigo. Depois que o CP for atualizado, o arquivo não muda mais nada.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const csvPath = process.argv[2];
const outDir = process.argv[3] || path.join(os.homedir(), '.claude', 'producao', 'carteira');
fs.mkdirSync(outDir, { recursive: true });
const txt = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const rows = []; let row = [], f = '', q = false;
for (let i = 0; i < txt.length; i++) { const ch = txt[i];
  if (q) { if (ch == '"' && txt[i + 1] == '"') { f += '"'; i++ } else if (ch == '"') q = false; else f += ch }
  else if (ch == '"') q = true; else if (ch == ';') { row.push(f); f = '' } else if (ch == '\n') { row.push(f); rows.push(row); row = []; f = '' } else if (ch != '\r') f += ch }
if (f || row.length) { row.push(f); rows.push(row) }
const H = rows[0].map(h => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
const col = n => H.findIndex(h => h.startsWith(n));
const C = { n: col('nome'), p: col('produto'), s: col('situacao'), cp: col('responsavel copy'), m: col('responsavel mentor'), d: col('data de entrada') };
const linhaDe = p => {
  // Core Scale (Audience 2.0 + Sales) conta como Audience 2.0 (escolha do Cauê, 21/11/2026)
  if (/audience 2\.0/i.test(p)) return 'Audience 2.0';
  if (/audience 1\.0/i.test(p)) return 'Audience 1.0';
  // Experience 3.0, 2.0 e 1.0 são um produto só nas visualizações (escolha do Cauê, 21/11/2026)
  if (/experience/i.test(p)) return 'Experience';
  if (/boost/i.test(p)) return 'Boost 2.0';
  if (/ouro/i.test(p)) return 'Mentoria Ouro';
  return 'Outros';
};
const pessoa = v => { v = (v || '').trim(); return v && v.toLowerCase() !== 'a definir' ? v : null; };
const norm = v => (v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const redDir = path.join(os.homedir(), '.claude', 'producao', 'redistribuicoes');
const trocas = new Map(); const redArqs = [];
for (const a of fs.existsSync(redDir) ? fs.readdirSync(redDir).filter(x => x.endsWith('.json')).sort() : []) {
  const j = JSON.parse(fs.readFileSync(path.join(redDir, a), 'utf8')); redArqs.push(a);
  for (const t of j.trocas || []) trocas.set(norm(t.mentorado), t);
}
let trocou = 0;
for (const r of rows.slice(1)) {
  const t = trocas.get(norm(r[C.n])); if (!t) continue;
  if (t.novo_mentor && norm(r[C.m]) === norm(t.mentor_atual) && norm(t.novo_mentor) !== norm(r[C.m])) { r[C.m] = t.novo_mentor; trocou++; }
  if (t.novo_copy && norm(r[C.cp]) === norm(t.copy_atual) && norm(t.novo_copy) !== norm(r[C.cp])) { r[C.cp] = t.novo_copy; trocou++; }
}
const ativos = rows.slice(1).filter(r => (r[C.s] || '').trim().toLowerCase() === 'ativo');
const base = {}, cart = {};
let copyAssumido = 0; const copyAssumidoLista = [];
for (const r of ativos) {
  const produto = (r[C.p] || '').trim() || 'Sem produto', linha = linhaDe(produto);
  // Audience 2.0 com roteiros: o CP marca com "Roteiros" no nome do mentorado (ex.: "Fulano - Roteiros"); pesa como Audience 1.0
  const linhaCart = linha === 'Audience 2.0' && /roteiro/i.test(r[C.n] || '') ? 'Audience 2.0 com roteiros' : linha;
  const m = pessoa(r[C.m]), c = pessoa(r[C.cp]);
  const b = base[produto] ??= { linha, produto, ativos: 0, sem_mentor: 0, sem_copy: 0 };
  b.ativos++; if (!m) b.sem_mentor++; if (!c) b.sem_copy++;
  const papeis = {};
  if (m) papeis[m] = 'Só mentor';
  if (c) papeis[c] = papeis[c] ? 'Mentor e copy' : 'Só copy';
  // Copy "A definir" ou vazio num produto com roteiro: quem faz os roteiros é o próprio mentor, então ele conta como mentor e copy
  // (o Cauê decidiu em 21/11/2026). No Audience 2.0 sem roteiros e no Boost não há roteiro, então nada muda.
  if (m && !c && !['Audience 2.0', 'Boost 2.0'].includes(linhaCart)) { papeis[m] = 'Mentor e copy'; copyAssumido++; copyAssumidoLista.push({ mentorado: (r[C.n] || '').trim(), produto, linha: linhaCart, mentor: m, copy_no_cp: (r[C.cp] || '').trim() || '(vazio)' }); }
  for (const [estrategista, funcao] of Object.entries(papeis)) {
    const k = [estrategista, funcao, linhaCart].join('|');
    (cart[k] ??= { estrategista, funcao, linha: linhaCart, mentorados: 0 }).mentorados++;
  }
}
// Entradas por mês (qualquer situação), pela data de entrada no produto: base da projeção de capacidade.
const mesDe = v => { v = (v || '').trim(); let m = v.match(/^(\d{4})-(\d{2})/); if (m) return `${m[1]}-${m[2]}`;
  m = v.match(/^\d{2}\/(\d{2})\/(\d{4})/); return m ? `${m[2]}-${m[1]}` : null; };
const ent = {};
for (const r of rows.slice(1).filter(r => r.length > 3)) {
  const mes = mesDe(r[C.d]); if (!mes) continue;
  const linha = linhaDe((r[C.p] || '').trim());
  const e = ent[mes + '|' + linha] ??= { mes, linha, entradas: 0, com_copy: 0 };
  e.entradas++; if (pessoa(r[C.cp])) e.com_copy++;
}
// Entradas por semana (segunda a domingo), últimas 26 semanas: mostra se o ritmo recente acelerou ou freou.
const diaDe = v => { v = (v || '').trim(); let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const segunda = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const baseCsv = (path.basename(csvPath).match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || new Date().toISOString().slice(0, 10);
const sem = {}, limiteSem = (() => { const d = new Date(segunda(baseCsv) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * 25); return d.toISOString().slice(0, 10); })();
for (const r of rows.slice(1).filter(r => r.length > 3)) {
  const dia = diaDe(r[C.d]); if (!dia || dia > baseCsv) continue;
  const s0 = segunda(dia); if (s0 < limiteSem) continue;
  const e = sem[s0] ??= { semana: s0, entradas: 0, audience2: 0, com_copy: 0, completa: s0 < segunda(baseCsv) };
  e.entradas++; if (linhaDe((r[C.p] || '').trim()) === 'Audience 2.0') e.audience2++; if (pessoa(r[C.cp])) e.com_copy++;
}
const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
const meta = [{ label: 'carteira.mjs', value: self, type: 'code', lang: 'javascript' },
  { label: 'Entrada', value: path.basename(csvPath) + ' (Controle de Produção → Clientes → Exportar CSV)' },
  { label: 'Copy assumido pelo mentor', value: String(copyAssumido) },
  ...(redArqs.length ? [{ label: 'Redistribuição aplicada', value: redArqs.join(', ') + ` · ${trocou} trocas de responsável ainda não lançadas no CP` }] : [])];
const ord = (a, b) => Object.values(a).join('|').localeCompare(Object.values(b).join('|'));
fs.writeFileSync(path.join(outDir, 'base.json'), JSON.stringify({ rows: Object.values(base).sort(ord), meta }));
fs.writeFileSync(path.join(outDir, 'carteira.json'), JSON.stringify({ rows: Object.values(cart).sort(ord), meta }));
fs.writeFileSync(path.join(outDir, 'entradas.json'), JSON.stringify({ rows: Object.values(ent).sort(ord), meta }));
// Lista com nome do mentorado: só para o app Minha Rotina (conferência), nunca sobe para o dashboard
fs.writeFileSync(path.join(outDir, 'copy_assumido.json'), JSON.stringify({ rows: copyAssumidoLista.sort((a, b) => a.mentor.localeCompare(b.mentor) || a.mentorado.localeCompare(b.mentorado)) }));
fs.writeFileSync(path.join(outDir, 'semanas.json'), JSON.stringify({ base: baseCsv, rows: Object.values(sem).sort((a, b) => a.semana.localeCompare(b.semana)) }));
console.log('ativos', ativos.length, 'produtos', Object.keys(base).length, 'linhas carteira', Object.keys(cart).length,
  'estrategistas', new Set(Object.values(cart).map(x => x.estrategista)).size, 'trocas', trocou, 'copy assumido pelo mentor', copyAssumido);
