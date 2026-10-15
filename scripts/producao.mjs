#!/usr/bin/env node
// Grava no Supabase a exportação de clientes do Controle de Produção (cp.corestudio.ai → Clientes → Exportar → CSV).
// A tela "Produção" do Minha Rotina calcula o relatório de prazos e pontos de atenção a partir disso.
//   node scripts/producao.mjs [arquivo.csv]   (sem arquivo: o clientes_*.csv mais recente em ~/.claude/producao ou ~/Downloads)
// Grava só o que o relatório usa (sem e-mail e telefone) em "painel:producao" e o histórico diário em "painel:producao-hist".
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(root, '.env');
const fileEnv = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n')
      .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
      .map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]))
  : {};
const ENV = { ...fileEnv, ...process.env };
const BASE = ENV.SUPABASE_URL, KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY || KEY.startsWith('sb_publishable_')) {
  console.log('CONFIGURACAO_PENDENTE: preencha SUPABASE_URL e a chave secreta (sb_secret_...) no arquivo .env');
  process.exit(0);
}
const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };
async function api(p, opt = {}) {
  const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

function achaArquivo(arg) {
  if (arg) return arg;
  const dirs = [path.join(os.homedir(), '.claude/producao'), path.join(os.homedir(), 'Downloads')];
  const cands = dirs.flatMap(d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => /^clientes_.*\.csv$/i.test(f)).map(f => path.join(d, f)) : []);
  cands.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return cands[0];
}

// CSV separado por ";" (aceita campos entre aspas)
function parseCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"' && txt[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

const arq = achaArquivo(process.argv[2]);
if (!arq || !fs.existsSync(arq)) { console.error('ERRO: não achei a exportação clientes_*.csv'); process.exit(1); }
const linhas = parseCSV(fs.readFileSync(arq, 'utf8'));
const H = linhas[0].map(h => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
const col = nome => H.findIndex(h => h.startsWith(nome));
const C = { n: col('nome'), p: col('produto'), s: col('situacao'), l: col('leva'), e: col('etapa'), cs: col('responsavel cs'), cp: col('responsavel copy'), m: col('responsavel mentor'), z: col('prazo') };
const falta = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);
if (falta.length) { console.error('ERRO: colunas não encontradas na exportação: ' + falta.join(', ') + ' · cabeçalho: ' + linhas[0].join(' | ')); process.exit(1); }

const clientes = linhas.slice(1).map(r => {
  const o = {}; for (const [k, i] of Object.entries(C)) o[k] = (r[i] || '').trim();
  if (o.z && !/^\d{4}-\d{2}-\d{2}$/.test(o.z)) { const m = o.z.match(/^(\d{2})\/(\d{2})\/(\d{4})/); o.z = m ? `${m[3]}-${m[2]}-${m[1]}` : ''; }
  o.s = o.s.toLowerCase();
  return o;
}).filter(o => o.n);

const mBase = path.basename(arq).match(/(\d{4}-\d{2}-\d{2})/);
const d = new Date(); const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const base = mBase ? mBase[1] : hoje;

try {
  const st = await api('settings?select=user_id&limit=1');
  const uid = ENV.USER_ID || (st[0] && st[0].user_id);
  if (!uid) throw new Error('não encontrei o usuário (tabela settings vazia)');
  const upsert = (id, data) => api('tasks?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, user_id: uid, data, updated_at: new Date().toISOString() }),
  });
  await upsert('painel:producao', { base, geradoEm: new Date().toISOString(), origem: path.basename(arq), clientes });

  // Histórico diário (um ponto por data-base) para a evolução dos vencidos
  const ativos = clientes.filter(c => c.s === 'ativo');
  const ponto = { data: base, total: clientes.length, ativos: ativos.length,
    vencidos: ativos.filter(c => c.z && c.z < base).length, semPrazo: ativos.filter(c => !c.z).length,
    pausados: clientes.filter(c => c.s === 'pausado').length, churn: clientes.filter(c => c.s === 'churn').length };
  const h = await api(`tasks?select=data&id=eq.painel:producao-hist&user_id=eq.${uid}`);
  const dias = ((h[0] && h[0].data && h[0].data.dias) || []).filter(x => x.data !== base).concat([ponto]).sort((a, b) => a.data.localeCompare(b.data)).slice(-120);
  await upsert('painel:producao-hist', { dias });
  console.log(`PRODUCAO_PUBLICADA: base ${base} · ${clientes.length} contratos · ${ponto.ativos} ativos · ${ponto.vencidos} ativos vencidos · arquivo ${path.basename(arq)}`);
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
}
