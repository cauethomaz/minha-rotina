#!/usr/bin/env node
// Grava o painel diário dos mentorados (JSON) no Supabase, para a tela Mentorados do Minha Rotina.
// Uso: node scripts/publicar-painel.mjs <arquivo.json>
// Formato do JSON: veja scripts/painel-formato.md
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

const file = process.argv[2];
if (!file) { console.log('Uso: node scripts/publicar-painel.mjs <arquivo.json>'); process.exit(1); }
const raw = fs.readFileSync(file, 'utf8');
const painel = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
for (const k of ['data', 'top3', 'atencao', 'oportunidades', 'ativos']) {
  if (!(k in painel)) { console.error(`ERRO: o JSON não tem o campo "${k}"`); process.exit(1); }
}

try {
  const st = await (await fetch(`${BASE}/rest/v1/settings?select=user_id&limit=1`, { headers })).json();
  const uid = ENV.USER_ID || (st[0] && st[0].user_id);
  if (!uid) throw new Error('não encontrei o usuário (tabela settings vazia)');
  const r = await fetch(`${BASE}/rest/v1/tasks?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'painel:core', user_id: uid, data: painel, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  console.log(`PAINEL_PUBLICADO: ${painel.data} · ${painel.atencao.length} em atenção · ${painel.oportunidades.length} oportunidades · ${painel.ativos.length} ativos`);
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
}
