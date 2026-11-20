// Monta a carteira dos estrategistas a partir da exportação de Clientes do Controle de Produção (CSV com ";").
// Só clientes com situação "ativo". Estrategista = quem aparece como Responsável Mentor ou Responsável Copy
// ("A definir" e vazio não contam). Quem é mentor e copy do mesmo cliente conta uma vez, como "Mentor e copy".
// Não leva nome, e-mail nem telefone de cliente: só contagens.
// Alimenta o dashboard "Carteira dos Estrategistas" (https://claude.ai/artifact/Bwaa4Te9mwxoib9ZspCnJr).
//   node scripts/carteira-estrategistas.mjs <clientes_AAAA-MM-DD.csv> [pasta de saída]
//   → grava base.json, carteira.json e entradas.json (padrão: ~/.claude/producao/carteira/)
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
  if (/audience 2\.0/i.test(p) && !/scale/i.test(p)) return 'Audience 2.0';
  if (/audience 1\.0/i.test(p)) return 'Audience 1.0';
  if (/experience 3\.0/i.test(p)) return 'Experience 3.0';
  if (/experience 2\.0/i.test(p)) return 'Experience 2.0/1.0';
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
for (const r of ativos) {
  const produto = (r[C.p] || '').trim() || 'Sem produto', linha = linhaDe(produto);
  const m = pessoa(r[C.m]), c = pessoa(r[C.cp]);
  const b = base[produto] ??= { linha, produto, ativos: 0, sem_mentor: 0, sem_copy: 0 };
  b.ativos++; if (!m) b.sem_mentor++; if (!c) b.sem_copy++;
  const papeis = {};
  if (m) papeis[m] = 'Só mentor';
  if (c) papeis[c] = papeis[c] ? 'Mentor e copy' : 'Só copy';
  for (const [estrategista, funcao] of Object.entries(papeis)) {
    const k = [estrategista, funcao, linha].join('|');
    (cart[k] ??= { estrategista, funcao, linha, mentorados: 0 }).mentorados++;
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
const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
const meta = [{ label: 'carteira.mjs', value: self, type: 'code', lang: 'javascript' },
  { label: 'Entrada', value: path.basename(csvPath) + ' (Controle de Produção → Clientes → Exportar CSV)' },
  ...(redArqs.length ? [{ label: 'Redistribuição aplicada', value: redArqs.join(', ') + ` · ${trocou} trocas de responsável ainda não lançadas no CP` }] : [])];
const ord = (a, b) => Object.values(a).join('|').localeCompare(Object.values(b).join('|'));
fs.writeFileSync(path.join(outDir, 'base.json'), JSON.stringify({ rows: Object.values(base).sort(ord), meta }));
fs.writeFileSync(path.join(outDir, 'carteira.json'), JSON.stringify({ rows: Object.values(cart).sort(ord), meta }));
fs.writeFileSync(path.join(outDir, 'entradas.json'), JSON.stringify({ rows: Object.values(ent).sort(ord), meta }));
console.log('ativos', ativos.length, 'produtos', Object.keys(base).length, 'linhas carteira', Object.keys(cart).length,
  'estrategistas', new Set(Object.values(cart).map(x => x.estrategista)).size, 'trocas', trocou);
