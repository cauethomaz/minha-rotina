#!/usr/bin/env node
// Publica no Supabase (linha "painel:carteira") o resumo da carteira dos estrategistas para a tela Produção do Minha Rotina:
// quem recebe o próximo mentorado, capacidade por pessoa e projeção do time.
// Lê o que scripts/carteira-estrategistas.mjs e scripts/saidas-cp.mjs deixam em ~/.claude/producao/carteira/
// (carteira.json, base.json, entradas.json, saidas_cp.json). Só contagens, sem nome de cliente.
//   node scripts/publicar-carteira.mjs [pasta]
// O modelo (pesos, limite, quem incluir e quem evitar) é o mesmo do dashboard "Carteira dos Estrategistas"
// (https://claude.ai/artifact/Bwaa4Te9mwxoib9ZspCnJr, window.cePesos/ceLimite/ceIncluir/ceEvitar): mudou lá, mude aqui.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const MODELO = {
  mentor: { 'Audience 2.0': 1, 'Boost 2.0': 0.5, 'Audience 1.0': 1.5, 'Mentoria Ouro': 1.5, 'Outros': 1.5, 'Experience 3.0': 2.5, 'Experience 2.0/1.0': 2.5 },
  copy: 3,
  limite: 65,
  minimo: 20,
  incluir: ['Henrique Sanchez', 'Domênica de Jesus'],
  evitar: ['Rayane Santos', 'Rogério Carvalho', 'Victor Montalvão', 'João Vitor Amorim'],
};

const um = (v) => Math.round(v * 10) / 10;
const pct = (n, t) => (t ? um((n / t) * 100) : 0);

export function calcular({ carteira, base, entradas, saidas_cp }, M = MODELO) {
  const peso = (l) => M.mentor[l] ?? 1.5;
  const por = {};
  for (const r of carteira) {
    const n = Number(r.mentorados);
    const e = por[r.estrategista] ??= { estrategista: r.estrategista, total: 0, carga: 0, aud2: 0, exp: 0, copy: 0 };
    e.total += n;
    if (r.funcao !== 'Só copy') e.carga += n * peso(r.linha);
    if (r.funcao !== 'Só mentor') { e.carga += n * M.copy; e.copy += n; }
    if (r.linha === 'Audience 2.0') e.aud2 += n;
    if (r.linha.startsWith('Experience')) e.exp += n;
  }
  const fin = {};
  for (const r of saidas_cp) if (r.tipo === 'pessoa') fin[r.estrategista] = Number(r.finalizar);
  const pessoas = Object.values(por).filter((e) => e.total >= M.minimo || M.incluir.includes(e.estrategista)).map((e) => {
    const carga = um(e.carga), livre = Math.max(0, um(M.limite - carga));
    return { estrategista: e.estrategista, total: e.total, carga, pct_uso: pct(carga, M.limite), livre,
      vagas_aud2: Math.floor(livre / M.mentor['Audience 2.0'] + 1e-9), vagas_rot: Math.floor(livre / M.mentor['Audience 1.0'] + 1e-9),
      pct_aud2: pct(e.aud2, e.total), pct_exp: pct(e.exp, e.total), pct_copy: pct(e.copy, e.total),
      finalizar_cp: fin[e.estrategista] ?? null, evitar: M.evitar.includes(e.estrategista) };
  }).sort((a, b) => a.evitar - b.evitar || a.carga - b.carga || a.pct_copy - b.pct_copy || a.estrategista.localeCompare(b.estrategista));

  // Projeção: carga de hoje − saídas previstas pelo CP × pontos médios por saída + entradas médias × peso do cenário
  let cargaTodos = 0, ativos = 0;
  for (const r of carteira) {
    const n = Number(r.mentorados);
    if (r.funcao !== 'Só copy') cargaTodos += n * peso(r.linha);
    if (r.funcao !== 'Só mentor') cargaTodos += n * M.copy;
  }
  for (const r of base) ativos += Number(r.ativos);
  const porSaida = ativos ? cargaTodos / ativos : 0;
  const porMes = {};
  for (const r of entradas) porMes[r.mes] = (porMes[r.mes] || 0) + Number(r.entradas);
  const ms = Object.keys(porMes).sort(), fechados = ms.slice(0, -1).slice(-3);
  const ritmo = fechados.length ? fechados.reduce((s, m) => s + porMes[m], 0) / fechados.length : 0;
  const meses = saidas_cp.filter((r) => r.tipo === 'mes').sort((a, b) => a.mes.localeCompare(b.mes));
  const res = saidas_cp.find((r) => r.tipo === 'resumo') || {};
  const carga0 = pessoas.reduce((s, r) => s + r.carga, 0), cap = M.limite * pessoas.length;
  const pesoMeio = (M.mentor['Audience 2.0'] + M.mentor['Audience 1.0']) / 2;
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const curva = [];
  if (meses.length) {
    const [ya, ym] = meses[0].mes.split('-').map(Number);
    let saiu = 0;
    for (let k = 0; k <= 12; k++) {
      if (k > 0) saiu += Number((meses[k - 1] || meses[meses.length - 1]).saidas);
      const d = new Date(Date.UTC(ya, ym - 2 + k, 1));
      curva.push({ passo: k, mes: `${nomes[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, saidas: saiu,
        carga: um(Math.max(0, carga0 - saiu * porSaida + k * ritmo * pesoMeio)) });
    }
  }
  const dentro = curva.find((c) => c.carga <= cap);
  const estoura = dentro ? curva.find((c) => c.passo > dentro.passo && c.carga > cap) : null;
  const frase = !curva.length ? null : !dentro ? 'o time não volta para dentro do limite nos próximos 12 meses'
    : dentro.passo === 0 && !estoura ? 'o time fica dentro do limite pelos próximos 12 meses'
    : !estoura ? `o time volta para dentro do limite em ${dentro.mes} e fica dentro pelos 12 meses`
    : `o time fica dentro do limite em ${dentro.mes} e passa de novo em ${estoura.mes}`;
  const ult = curva.length > 1 ? curva[curva.length - 1].carga - curva[curva.length - 2].carga : 0;
  const projecao = { carga_time: um(carga0), cap_time: cap, pct_uso: pct(carga0, cap), acima: pessoas.filter((p) => p.pct_uso >= 100).length,
    saidas_30d: res.saidas_30d ?? null, saidas_60d: res.saidas_60d ?? null, saidas_lido_em: res.lido_em ?? null,
    ritmo_entradas: Math.round(ritmo), pontos_por_saida: um(porSaida), frase_meio: frase,
    faltam_hoje: Math.max(0, Math.ceil(carga0 / M.limite) - pessoas.length), contratar_mes: Math.max(0, um(ult / M.limite)), curva };
  return { modelo: M, pessoas, projecao };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = process.argv[2] || path.join(os.homedir(), '.claude', 'producao', 'carteira');
  const ler = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  try {
    const j = { carteira: ler('carteira'), base: ler('base'), entradas: ler('entradas'), saidas_cp: ler('saidas_cp') };
    const out = calcular({ carteira: j.carteira.rows, base: j.base.rows, entradas: j.entradas.rows, saidas_cp: j.saidas_cp.rows });
    const metaVal = (k) => ((j.carteira.meta || []).find((m) => m.label === k) || {}).value || null;
    const dados = { geradoEm: new Date().toISOString(), origem: metaVal('Entrada'), redistribuicao: metaVal('Redistribuição aplicada'), ...out };
    if (process.env.CARTEIRA_SECO) { console.log(JSON.stringify({ ...dados, projecao: { ...dados.projecao, curva: undefined } }, null, 1)); process.exit(0); }

    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const envFile = path.join(root, '.env');
    const fileEnv = fs.existsSync(envFile)
      ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n')
          .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
      : {};
    const ENV = { ...fileEnv, ...process.env };
    const BASE = ENV.SUPABASE_URL, KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
    if (!BASE || !KEY || KEY.startsWith('sb_publishable_')) {
      console.log('CONFIGURACAO_PENDENTE: preencha SUPABASE_URL e a chave secreta (sb_secret_...) no arquivo .env');
      process.exit(0);
    }
    const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };
    const api = async (p, opt = {}) => {
      const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const t = await r.text();
      return t ? JSON.parse(t) : null;
    };
    const s = await api('settings?select=user_id&limit=1');
    const uid = ENV.USER_ID || (s && s[0] && s[0].user_id);
    if (!uid) throw new Error('não encontrei o usuário (tabela settings vazia)');
    await api('tasks?on_conflict=id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'painel:carteira', user_id: uid, data: dados, updated_at: new Date().toISOString() }),
    });
    const p = out.projecao, sug = out.pessoas.filter((x) => !x.evitar).slice(0, 3).map((x) => x.estrategista).join(', ');
    console.log(`CARTEIRA_PUBLICADA: ${out.pessoas.length} pessoas · uso ${p.pct_uso}% · sugestão ${sug}`);
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exit(1);
  }
}
