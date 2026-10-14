#!/usr/bin/env node
// Esteira de Conteúdo no Supabase do Minha Rotina (tela "Conteúdos").
// Roteiros ficam na tabela tasks com id "roteiro:<id>"; ajustes e guia de estilo em "esteira:config".
//
//   node scripts/esteira.mjs contexto              → JSON com config, guia, ajustes pedidos (texto completo) e roteiros existentes (resumo)
//   node scripts/esteira.mjs decisoes              → tudo que o Cauê decidiu (aprovou, ajustou, descartou, com motivos), para a rotina aprender
//   node scripts/esteira.mjs fila-edicao           → roteiros que podem receber vídeo (aprovado/gravado, com texto completo) e pedidos de ajuste na edição
//   node scripts/esteira.mjs listar [status]       → resumo dos roteiros (opcional: só um status)
//   node scripts/esteira.mjs mostrar <id>          → um roteiro completo
//   node scripts/esteira.mjs gravar <arquivo.json> → cria/atualiza: {"roteiros":[{id,...campos}], "config":{geral?,estilo?,apresentacao?}}
//      Em roteiros existentes os campos são mesclados; campo com valor null é apagado (ex.: "nota": null).
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
async function api(p, opt = {}) {
  const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const txt = await r.text(); // upsert de registro existente responde 200 sem corpo
  return txt ? JSON.parse(txt) : null;
}
let uidCache;
async function uid() {
  if (uidCache) return uidCache;
  const st = await api('settings?select=user_id&limit=1');
  uidCache = ENV.USER_ID || (st[0] && st[0].user_id);
  if (!uidCache) throw new Error('não encontrei o usuário (tabela settings vazia)');
  return uidCache;
}
const RID = id => 'roteiro:' + id;
async function todos() {
  const rows = await api(`tasks?select=id,data&id=like.roteiro:*&user_id=eq.${await uid()}`);
  return rows.map(r => ({ ...r.data, id: r.id.slice(8) }));
}
async function config() {
  const r = await api(`tasks?select=data&id=eq.esteira:config&user_id=eq.${await uid()}`);
  return (r[0] && r[0].data) || {};
}
async function upsert(id, data) {
  await api('tasks?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, user_id: await uid(), data, updated_at: new Date().toISOString() }),
  });
}
const merge = (base, patch) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) { if (k === 'id') continue; if (v === null) delete out[k]; else out[k] = v; }
  return out;
};
const resumo = r => ({ id: r.id, status: r.status, headline: r.headline || r.titulo, linha: r.linha, semana: r.semana,
  referencia: r.referencia && r.referencia.url, palavras: String(r.roteiro || '').split(/\s+/).filter(Boolean).length });

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'contexto') {
    const [cfg, rs] = await Promise.all([config(), todos()]);
    console.log(JSON.stringify({
      config: cfg.geral || {}, apresentacao: cfg.apresentacao || '', guia: (cfg.estilo && cfg.estilo.guia) || '',
      aprendizado: cfg.aprendizado || {},
      ajustes: rs.filter(r => r.status === 'ajuste'),
      edicao_pedida: rs.filter(r => r.status === 'editando' && r.nota).map(resumo),
      existentes: rs.map(resumo),
    }, null, 2));
  } else if (cmd === 'decisoes') {
    const [cfg, rs] = await Promise.all([config(), todos()]);
    const APROV = ['aprovado', 'gravado', 'editando', 'revisao', 'pronto', 'agendado', 'postado'];
    const decididos = rs.filter(r => r.status !== 'ideia' || r.feedback || (r.historico || []).length);
    const item = r => ({
      id: r.id, status: r.status, headline: r.headline || r.titulo, linha: r.linha, semana: r.semana,
      abertura: String(r.roteiro || '').split('\n').filter(Boolean).slice(0, 2).join(' ').slice(0, 320),
      fechamento: (String(r.roteiro || '').split('\n').filter(Boolean).filter(l => !/me segue e comenta|Eu sou Cauê/i.test(l)).slice(-1)[0] || '').slice(0, 200),
      palavras: String(r.roteiro || '').split(/\s+/).filter(Boolean).length,
      referencia: r.referencia ? { perfil: r.referencia.perfil, views: r.referencia.views, modelado: r.referencia.modelado } : null,
      feedback: r.feedback || null, ajustes_pedidos: (r.historico || []).filter(h => /ajuste/.test(h.acao)).map(h => h.nota),
      reescrito: !!r.reescritoEm,
    });
    console.log(JSON.stringify({
      aprendizado_atual: cfg.aprendizado || {},
      totais: { aprovados: rs.filter(r => APROV.includes(r.status)).length, descartados: rs.filter(r => r.status === 'descartado').length,
        com_ajuste: rs.filter(r => (r.historico || []).some(h => /ajuste/.test(h.acao))).length, sem_decisao: rs.filter(r => r.status === 'ideia' && !r.historico).length },
      aprovados: decididos.filter(r => APROV.includes(r.status)).map(item),
      descartados: decididos.filter(r => r.status === 'descartado').map(item),
      ajustados: decididos.filter(r => (r.historico || []).some(h => /ajuste/.test(h.acao))).map(item),
    }, null, 2));
  } else if (cmd === 'fila-edicao') {
    const rs = await todos();
    const pick = r => ({ id: r.id, status: r.status, headline: r.headline || r.titulo, roteiro: r.roteiro, brolls: r.brolls || [],
      videoArquivo: r.videoArquivo || null, versaoEdicao: r.versaoEdicao || 0, nota: r.nota || null });
    console.log(JSON.stringify({
      aguardando_video: rs.filter(r => ['aprovado', 'gravado'].includes(r.status)).map(pick),
      ajustes_de_edicao: rs.filter(r => r.status === 'editando' && r.nota).map(pick),
    }, null, 2));
  } else if (cmd === 'listar') {
    const rs = (await todos()).filter(r => !arg || r.status === arg);
    console.log(JSON.stringify(rs.map(resumo), null, 2));
  } else if (cmd === 'mostrar' && arg) {
    const r = (await todos()).find(x => x.id === arg);
    console.log(r ? JSON.stringify(r, null, 2) : `NAO_ENCONTRADO: ${arg}`);
  } else if (cmd === 'gravar' && arg) {
    const raw = fs.readFileSync(arg, 'utf8');
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const atuais = Object.fromEntries((await todos()).map(r => [r.id, r]));
    let novos = 0, alterados = 0;
    for (const r of j.roteiros || []) {
      if (!r || !/^[\w-]+$/.test(r.id || '')) throw new Error(`roteiro sem id válido: ${JSON.stringify(r).slice(0, 80)}`);
      const base = atuais[r.id];
      const data = merge(base || {}, { ...r, atualizadoEm: new Date().toISOString() });
      if (!base) { data.criadoEm = data.criadoEm || new Date().toISOString(); data.status = data.status || 'ideia'; novos++; } else alterados++;
      delete data.id;
      await upsert(RID(r.id), data);
    }
    if (j.config) await upsert('esteira:config', merge(await config(), j.config));
    console.log(`GRAVADO: ${novos} novos · ${alterados} atualizados${j.config ? ' · config atualizada' : ''}`);
  } else {
    console.log('Uso: node scripts/esteira.mjs contexto | listar [status] | mostrar <id> | gravar <arquivo.json>');
  }
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
}
