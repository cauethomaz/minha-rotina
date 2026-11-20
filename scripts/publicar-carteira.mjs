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

export function calcular({ carteira, base, entradas, saidas_cp, semanas = [], hist = [] }, M = MODELO) {
  const peso = (l) => M.mentor[l] ?? 1.5;
  const por = {};
  for (const r of carteira) {
    const n = Number(r.mentorados);
    const e = por[r.estrategista] ??= { estrategista: r.estrategista, total: 0, carga: 0, aud2: 0, exp: 0, copy: 0, pm: 0, pc: 0, mix: {} };
    e.total += n;
    if (r.funcao !== 'Só copy') { e.carga += n * peso(r.linha); e.pm += n * peso(r.linha); }
    if (r.funcao !== 'Só mentor') { e.carga += n * M.copy; e.pc += n * M.copy; e.copy += n; }
    e.mix[r.linha] = (e.mix[r.linha] || 0) + n;
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
      pts_mentor: um(e.pm), pts_copy: um(e.pc), mix: e.mix,
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

  // Fluxo de mentorados: quantos entram (ritmo das últimas semanas e dos últimos meses) e quantos saem (CP), mês a mês.
  const completas = semanas.filter((w) => w.completa);
  const mediaSem = (n) => { const u = completas.slice(-n); return u.length ? u.reduce((t, w) => t + w.entradas, 0) / u.length : 0; };
  const porSemanaMes = 52 / 12;
  const ritmos = [
    { id: 'semanas', nome: 'Ritmo das últimas 4 semanas', por_mes: um(mediaSem(4) * porSemanaMes) },
    { id: 'meses', nome: 'Ritmo dos últimos 3 meses', por_mes: um(ritmo) },
  ];
  // Tendência real: quanto os ativos mudaram de fato nos últimos ~30 dias (histórico diário do painel de produção).
  // Inclui o que o CP não prevê como finalização: pausas, churn e renovações.
  let real = null;
  const hs = hist.filter((h) => h && h.data && Number.isFinite(h.ativos)).sort((a, b) => a.data.localeCompare(b.data));
  if (hs.length > 1) {
    const ult = hs[hs.length - 1], alvo = new Date(new Date(ult.data).getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const ini = hs.find((h) => h.data >= alvo) || hs[0], dias = (new Date(ult.data) - new Date(ini.data)) / 864e5;
    if (dias >= 14) real = { de: ini.data, ate: ult.data, ativos_de: ini.ativos, ativos_ate: ult.ativos, saldo_mes: um((ult.ativos - ini.ativos) / dias * 30.4) };
  }
  const saidasMes = (k) => Number((meses[k - 1] || meses[meses.length - 1] || { saidas: 0 }).saidas);
  const media6 = meses.length ? [1, 2, 3, 4, 5, 6].reduce((t, k) => t + saidasMes(k), 0) / 6 : 0;
  // Saídas reais observadas = entradas no ritmo recente − crescimento real dos ativos
  if (real) { real.saidas_mes = um(Math.max(0, ritmos[0].por_mes - real.saldo_mes)); ritmos.push({ id: 'real', nome: 'Saídas reais dos últimos 30 dias', por_mes: ritmos[0].por_mes, real: true }); }
  const cenarios = ritmos.map((rt) => {
    const linhas = [];
    let at = ativos, cg = carga0;
    if (meses.length) {
      const [ya, ym] = meses[0].mes.split('-').map(Number);
      for (let k = 1; k <= 12; k++) {
        // No cenário real, as saídas são as observadas (finalizações, pausas e churn), não as previstas pelo CP
        const sai = rt.real ? real.saidas_mes : saidasMes(k), entra = rt.por_mes;
        at += entra - sai; cg = Math.max(0, cg + entra * pesoMeio - sai * porSaida);
        const d = new Date(Date.UTC(ya, ym - 2 + k, 1));
        linhas.push({ mes: `${nomes[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, entram: Math.round(entra), saem: Math.round(sai),
          ativos: Math.round(at), carga: um(cg), pct: pct(cg, cap), faltam: Math.max(0, Math.ceil(cg / M.limite) - pessoas.length), estimado: k > meses.length });
      }
    }
    const passa = linhas.find((l) => l.carga > cap), volta = linhas.find((l) => l.carga <= cap);
    const status = !linhas.length ? null : carga0 > cap
      ? (!volta ? 'acima' : linhas.slice(linhas.indexOf(volta)).some((l) => l.carga > cap) ? 'oscila' : 'alivia')
      : (passa ? 'estoura' : 'tranquilo');
    const quando = status === 'estoura' ? passa.mes : status === 'alivia' || status === 'oscila' ? volta.mes : null;
    return { ...rt, status, quando, saldo_mes: rt.real ? real.saldo_mes : um(rt.por_mes - media6), linhas };
  });
  const fluxo = {
    ativos_hoje: ativos, real,
    semanas: semanas.slice(-12).map((w) => ({ semana: w.semana, entradas: w.entradas, audience2: w.audience2, completa: !!w.completa })),
    meses: ms.slice(-7).map((m, i, a) => ({ mes: m, entradas: porMes[m], parcial: i === a.length - 1 })),
    saidas_media_6m: um(media6),
    // Quantos novos por mês mantêm a carga do time parada (saídas × pontos por saída ÷ peso médio de um novo)
    equilibrio_mes: pesoMeio ? Math.round(media6 * porSaida / pesoMeio) : null,
    cenarios,
  };
  return { modelo: M, pessoas, projecao, fluxo };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = process.argv[2] || path.join(os.homedir(), '.claude', 'producao', 'carteira');
  const ler = (n) => JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
  try {
    const j = { carteira: ler('carteira'), base: ler('base'), entradas: ler('entradas'), saidas_cp: ler('saidas_cp') };
    let sem = []; try { sem = ler('semanas').rows || []; } catch { /* semanas.json ainda não existe */ }
    const metaVal = (k) => ((j.carteira.meta || []).find((m) => m.label === k) || {}).value || null;
    const montar = (hist) => ({ geradoEm: new Date().toISOString(), origem: metaVal('Entrada'), redistribuicao: metaVal('Redistribuição aplicada'),
      ...calcular({ carteira: j.carteira.rows, base: j.base.rows, entradas: j.entradas.rows, saidas_cp: j.saidas_cp.rows, semanas: sem, hist }) });
    if (process.env.CARTEIRA_SECO) {
      const hist = process.env.CARTEIRA_HIST ? JSON.parse(fs.readFileSync(process.env.CARTEIRA_HIST, 'utf8')) : [];
      const d = montar(hist); console.log(JSON.stringify({ ...d, projecao: { ...d.projecao, curva: undefined }, pessoas: undefined }, null, 1)); process.exit(0);
    }

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
    const h = await api(`tasks?select=data&id=eq.painel:producao-hist&user_id=eq.${uid}`);
    const dados = montar((h && h[0] && h[0].data && h[0].data.dias) || []);
    const out = dados;
    if (process.env.CARTEIRA_SO_LER) { console.log(JSON.stringify(out.fluxo, null, 1)); process.exit(0); }
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
