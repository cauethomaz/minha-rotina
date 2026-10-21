#!/usr/bin/env node
// Grava no Supabase os painéis da tela Mentorados do Minha Rotina (JSON):
//   followup   → visão Follow-up (rotina de segunda e quarta)
//   pendencias → seção Pendências do Follow-up (varredura das 17h)
//   sexta      → visão Fechamento (rotina de sexta)
// Uso: node scripts/publicar-mentorados.mjs <followup|pendencias|sexta> <arquivo.json>
// Formato: scripts/followup-formato.md
// Formato do JSON: veja scripts/followup-formato.md
import fs from 'node:fs';
import path from 'node:path';
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

const REQ = { followup: ['data', 'tipo', 'pendencias', 'clientes'], pendencias: ['data', 'pendencias'], sexta: ['data', 'clientes'] };
const [kind, file] = process.argv.slice(2);
if (!REQ[kind] || !file) { console.log('Uso: node scripts/publicar-mentorados.mjs <followup|pendencias|sexta> <arquivo.json>'); process.exit(1); }
const raw = fs.readFileSync(file, 'utf8');
const painel = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
for (const k of REQ[kind]) {
  if (!(k in painel)) { console.error(`ERRO: o JSON não tem o campo "${k}"`); process.exit(1); }
}

try {
  const st = await (await fetch(`${BASE}/rest/v1/settings?select=user_id&limit=1`, { headers })).json();
  const uid = ENV.USER_ID || (st[0] && st[0].user_id);
  if (!uid) throw new Error('não encontrei o usuário (tabela settings vazia)');
  const r = await fetch(`${BASE}/rest/v1/tasks?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'mentorados:' + kind, user_id: uid, data: { ...painel, publicadoEm: new Date().toISOString() }, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  console.log(`${kind.toUpperCase()}_PUBLICADO: ${painel.data}${painel.pendencias ? ` · ${painel.pendencias.length} pendências` : ''}${painel.clientes ? ` · ${painel.clientes.length} mentorados` : ''}`);
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
}
