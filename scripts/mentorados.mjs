#!/usr/bin/env node
// Mentorados CORE: monta a carteira (linha mentorados:carteira do Supabase) que a aba Mentorados do Minha Rotina mostra.
// A rotina "Mentorados CORE" usa assim:
//   node scripts/mentorados.mjs contexto                 → estado atual por mentorado + cursor do WhatsApp (o que a IA precisa ler)
//   node scripts/mentorados.mjs montar <ia.json> [--incremental]
//        junta os números calculados dos snapshots do Instagram (código, sem IA) com a parte interpretada pela IA (ia.json)
//        e publica. Formato do ia.json: scripts/mentorados-formato.md
//   node scripts/mentorados.mjs semear                   → primeira carga, a partir dos painéis antigos (uso único)
// Regras de situação e de casos críticos ficam no app (calculadas na hora, porque o tempo de espera cresce).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KIT = path.join(os.homedir(), '.claude', 'core-kit');
const envFile = path.join(root, '.env');
const fileEnv = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n')
      .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
      .map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]))
  : {};
const ENV = { ...fileEnv, ...process.env };
const BASE = ENV.SUPABASE_URL, KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY || KEY.startsWith('sb_publishable_')) { console.log('CONFIGURACAO_PENDENTE: preencha SUPABASE_URL e a chave secreta no .env'); process.exit(0); }
const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };
async function api(p, opt = {}) {
  const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const getRow = async id => ((await api(`tasks?select=data,updated_at&id=eq.${encodeURIComponent(id)}`))[0] || {}).data || null;
async function putRow(id, data) {
  const st = (await api('settings?select=user_id&limit=1'))[0];
  await api('tasks?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, user_id: ENV.USER_ID || (st && st.user_id), data, updated_at: new Date().toISOString() }) });
}

const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@._]+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');
const isoD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addD = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return isoD(d); };
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- Instagram: números calculados dos snapshots (core-kit/snapshots/AAAA-MM-DD.json) ---------- */
function snapshots() {
  const dir = path.join(KIT, 'snapshots');
  return fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
}
// Meta de viral (regras-viral.md): seguidores da Foto de Abertura do mês (snapshot entre os dias 1 e 5, senão o mais antigo do mês)
function metaViral(seg) {
  if (seg == null) return null;
  if (seg <= 30000) return 100000;
  if (seg <= 70000) return 100000 + seg;
  if (seg <= 150000) return 150000;
  if (seg <= 1000000) return seg;
  return 1000000;
}
function insta(handle, snaps, hoje, excluir) {
  const h = String(handle || '').replace(/^@/, '').toLowerCase();
  const comPerfil = snaps.filter(s => s.perfis && s.perfis[h]);
  const atual = comPerfil.filter(s => s.data <= hoje).slice(-1)[0];
  if (!atual) return { ok: false };
  const p = atual.perfis[h], d = atual.data;
  const antes = comPerfil.filter(s => s.data <= addD(d, -7)).slice(-1)[0];
  const mes = d.slice(0, 7), doMes = comPerfil.filter(s => s.data.startsWith(mes));
  const abertura = doMes.find(s => +s.data.slice(8) <= 5) || doMes[0] || atual;
  // reels de todos os snapshots, com a contagem de views mais recente de cada um
  const reels = new Map();
  comPerfil.forEach(s => (s.perfis[h].reels || []).forEach(([code, data, views]) => {
    if (!code) return; const r = reels.get(code); if (!r || s.data >= r.visto) reels.set(code, { code, data, views: +views || 0, visto: s.data });
  }));
  // vídeos que não contam (IA, collab, carrossel...) ficam fora da meta e da mediana; a IA informa em insta_excluir
  const fora = new Set(excluir || []);
  const R = [...reels.values()].filter(r => r.data && r.data <= d && !fora.has(r.code));
  const url = c => `https://www.instagram.com/reel/${c}/`;
  const ultimos = (n) => R.filter(r => r.data > addD(d, -n));
  const best = arr => arr.slice().sort((a, b) => b.views - a.views)[0];
  const m30 = ultimos(30), b7 = best(ultimos(7)), b45 = best(ultimos(45));
  const meta = metaViral(abertura.perfis[h].seguidores ?? p.seguidores);
  // mediana: um vídeo fora da curva não distorce o número
  const media = arr => { if (!arr.length) return null; const v = arr.map(r => r.views).sort((a, b) => a - b), k = Math.floor(v.length / 2); return v.length % 2 ? v[k] : Math.round((v[k - 1] + v[k]) / 2); };
  const ult = R.map(r => r.data).sort().slice(-1)[0] || null;
  return {
    ok: true, atualizado: d, seguidores: p.seguidores ?? null,
    var7: antes && antes.perfis[h].seguidores != null && p.seguidores != null ? p.seguidores - antes.perfis[h].seguidores : null,
    var7_desde: antes ? antes.data : null,
    media30: media(m30), n30: m30.length, posts7: ultimos(7).length,
    melhor7: b7 ? { views: b7.views, url: url(b7.code), data: b7.data } : null,
    ultimo_post: ult,
    meta_viral: meta, meta_base: abertura.data,
    melhor45: b45 && meta ? { views: b45.views, url: url(b45.code), data: b45.data, prazo: addD(b45.data, 45), pct: Math.round(b45.views / meta * 100) } : null,
  };
}

/* ---------- Montar e publicar ---------- */
function contatos() { try { return JSON.parse(fs.readFileSync(path.join(KIT, 'contatos.json'), 'utf8')); } catch { return []; } }

async function montar(iaFile, incremental) {
  const raw = fs.readFileSync(iaFile, 'utf8');
  const ia = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  if (!Array.isArray(ia.mentorados)) throw new Error('o ia.json não tem a lista "mentorados"');
  const anterior = await getRow('mentorados:carteira');
  const prev = new Map(((anterior && anterior.mentorados) || []).map(m => [m.id, m]));
  const snaps = snapshots(), hoje = isoD(new Date()), C = contatos();
  const out = [];
  for (const m of ia.mentorados) {
    if (!m || !m.nome) continue;
    const id = m.id || slug(m.nome), p = prev.get(id) || {};
    const ct = C.find(c => norm(c.nome_planilha) === norm(m.nome) || norm(c.cliente) === norm(m.nome)) || {};
    const ig = String(m.ig || p.ig || ct.instagram || '').replace(/^@/, '');
    // Na leitura incremental (17h), o que a IA não mandou continua como estava às 8h
    const base = incremental ? { ...p } : {};
    out.push({ ...base, ...m, id, ig, grupo: m.grupo || p.grupo || (ct.grupo_whatsapp || '').trim() || null,
      insta: incremental && p.insta ? p.insta : insta(ig, snaps, hoje, m.insta_excluir || p.insta_excluir) });
  }
  // incremental: mentorados que a IA não citou ficam como estavam
  if (incremental) prev.forEach((m, id) => { if (!out.some(x => x.id === id)) out.push(m); });
  const leitura = { ...(anterior && anterior.leitura || {}), ...(ia.leitura || {}) };
  // Instagram: quantos perfis têm snapshot de hoje (calculado aqui, não pela IA)
  if (!incremental) { const ultimo = snaps.length ? snaps[snaps.length - 1].data : null, okI = out.filter(m => m.insta && m.insta.ok && m.insta.atualizado === ultimo);
    leitura.fontes = { ...(leitura.fontes || {}), instagram: { ok: okI.length, total: out.length, data: ultimo, falhas: out.filter(m => !okI.includes(m)).map(m => `${m.nome}: sem snapshot de ${ultimo}`) } }; }
  if (incremental) leitura.incremental = new Date().toISOString(); else { leitura.completa = new Date().toISOString(); leitura.incremental = null; }
  const data = {
    versao: 1, demo: false, gerado_em: new Date().toISOString(), leitura,
    tempo_resposta: ia.tempo_resposta !== undefined ? ia.tempo_resposta : (anterior && anterior.tempo_resposta) || null,
    carteira: ia.carteira || (anterior && anterior.carteira) || null,
    fora: ia.fora || (anterior && anterior.fora) || [],
    mentorados: out,
  };
  fs.writeFileSync('/private/tmp/mentorados-carteira.json', JSON.stringify(data, null, 1));
  await putRow('mentorados:carteira', data);
  const semInsta = out.filter(m => !m.insta || !m.insta.ok).map(m => m.nome);
  console.log(`CARTEIRA_PUBLICADA: ${out.length} mentorados · ${incremental ? 'leitura incremental' : 'leitura completa'}${semInsta.length ? ` · sem Instagram: ${semInsta.join(', ')}` : ''}`);
}

/* ---------- Contexto para a IA (leitura incremental e rituais) ---------- */
async function contexto() {
  const c = await getRow('mentorados:carteira');
  if (!c) { console.log('SEM_CARTEIRA: rode a leitura completa primeiro.'); return; }
  console.log(`Carteira de ${String(c.leitura && c.leitura.completa || '').slice(0, 16)} · incremental ${String(c.leitura && c.leitura.incremental || '—').slice(0, 16)}`);
  console.log('Para cada grupo, leia no WhatsApp só as mensagens DEPOIS de "ler_desde" (parâmetro after da Kaption).');
  for (const m of c.mentorados) {
    const w = m.wpp || {};
    const desde = [w.atualizado, w.ultima_cliente, w.ultima_minha, w.ultima_time].filter(Boolean).sort().slice(-1)[0] || null;
    console.log(JSON.stringify({ id: m.id, nome: m.nome, grupo: m.grupo, ler_desde: desde, esperando_desde: w.esperando_desde || null,
      ultimo_fato: w.ultimo_fato || null, combinados: (m.combinados || []).filter(x => x.estado !== 'feito'), mensagem_tipo: m.mensagem && m.mensagem.tipo || null }));
  }
}

/* ---------- Primeira carga (uso único): converte os painéis antigos ---------- */
const MES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
function quando(txt, refIso) {
  // "seg 19/10, 12h00" · "hoje, 10h16" · "ontem 17h45" → ISO local (horário de Brasília)
  if (!txt) return null; const t = norm(txt);
  let dia = null; const m = t.match(/(\d{1,2})\/(\d{1,2})/);
  if (m) dia = `${refIso.slice(0, 4)}-${pad(m[2])}-${pad(m[1])}`;
  else if (/\bhoje\b/.test(t)) dia = refIso.slice(0, 10);
  else if (/\bontem\b/.test(t)) dia = addD(refIso.slice(0, 10), -1);
  if (!dia) return null;
  const h = t.match(/(\d{1,2})h(\d{2})?/);
  return `${dia}T${pad(h ? h[1] : 12)}:${pad(h && h[2] ? h[2] : 0)}:00-03:00`;
}
const strip = s => String(s || '').replace(/\*\*/g, '').trim();
let ODIRLEY_IA = [];
async function semear() {
  // o vídeo de 635 mil do Odirley é de IA (não conta como viral): maior reel do perfil nos snapshots
  const sn = snapshots().filter(s => s.perfis && s.perfis['odirley.rocha']).slice(-1)[0];
  if (sn) { const big = (sn.perfis['odirley.rocha'].reels || []).filter(r => r[2] > 500000).map(r => r[0]); ODIRLEY_IA = big; }
  const [core, fu, pend, sexta] = await Promise.all(['painel:core', 'mentorados:followup', 'mentorados:pendencias', 'mentorados:sexta'].map(getRow));
  if (!core) throw new Error('painel:core não encontrado');
  const ref = new Date().toISOString().slice(0, 10);
  const byName = (arr, n) => (arr || []).find(x => norm(x.nome) === norm(n));
  const mensagens = [];
  const ms = (core.ativos || []).map(a => {
    const nome = a.nome, ig = String(a.sub || '').split('·')[0].trim().replace(/^@/, '');
    const fc = fu && byName(fu.clientes, nome), sx = sexta && byName(sexta.clientes, nome), ct = byName(core.contato, nome);
    const pp = pend && byName(pend.pendencias, nome), mon = pend && byName(pend.monitorar, nome);
    const fatos = (a.whatsapp_linha || []).map(x => ({ em: x.data, quem: x.quem === 'caue' ? 'voce' : x.quem, txt: strip(x.txt) }));
    const refPend = pend ? `${pend.data}T17:00:00-03:00` : ref;
    let esperando = null;
    if (pp) { esperando = quando(pp.desde, refPend) || null; }
    // headlines da sexta: linhas "1) ..." depois da linha que fala de headline
    let headlines = [];
    if (sx && Array.isArray(sx.msg)) { const i = sx.msg.findIndex(l => /headline/i.test(l)); if (i >= 0) headlines = sx.msg.slice(i + 1).filter(l => /^\d\)\s/.test(l)).map(l => l.replace(/^\d\)\s*/, '')); }
    let mensagem = null;
    if (pp && pp.sugestao) mensagem = { tipo: 'Resposta pendente', texto: pp.sugestao };
    else if (fc && fc.mensagem) mensagem = { tipo: fu.tipo === 'Plano da semana' ? 'Plano de segunda' : 'Cobrança de quarta', texto: [].concat(fc.mensagem).join('\n') };
    else if (ct && ct.sugestao) mensagem = { tipo: 'Retomar contato', texto: ct.sugestao };
    return {
      id: slug(nome), nome, ig, estrela: false, produto: a.produto || null, etapa: a.etapa || null,
      etapa_vencida: !!(a.etapa_selo && /venc/i.test(a.etapa_selo.txt || '')),
      categoria: fc ? fc.categoria : null, grupo: fc ? fc.grupo : (sx ? sx.grupo : null),
      wpp: {
        atualizado: pend ? `${pend.data}T17:00:00-03:00` : null, ok: !/sem hist/i.test(a.whatsapp || ''),
        ultima_cliente: ct && ct.ultima_cliente || null, ultima_minha: ct && ct.ultima_minha || null,
        esperando_desde: esperando, esperando_txt: pp ? strip(pp.texto).split('. ')[0] : null,
        status_txt: strip(a.whatsapp) || null,
        ultimo_fato: fatos.length ? fatos[fatos.length - 1].txt : null, fatos,
      },
      combinados: a.whatsapp_combinado && !/nada combinado/i.test(a.whatsapp_combinado) ? [{ quem: null, texto: strip(a.whatsapp_combinado), prazo: null, estado: 'aberto' }] : [],
      mensagem,
      monitorar: mon ? strip(mon.texto) : null,
      semana: sx ? { periodo: sexta.titulo_data, itens: sx.nums || [], melhor: sx.best && sx.best[0] ? { url: `https://www.instagram.com/reel/${sx.best[0]}/`, views: sx.best[1], data: sx.best[2] } : null, melhoria: sx.melhoria || null } : null,
      missao: sx && sx.tarefa ? { texto: sx.tarefa } : null, headlines, headline_base: sx ? sx.headline || null : null,
      elias: sx && sx.elias ? sx.elias : null,
      insta_excluir: /odirley/i.test(nome) ? ODIRLEY_IA : [],
      resumo: fc ? strip(fc.resumo) : null, proximo_passo: fc ? strip(fc.proximo_passo) : null,
    };
  });
  // tempo de resposta (texto do aviso do dashboard)
  let tr = null; const av = (core.avisos || []).find(x => /tempo de resposta/i.test(x));
  if (av) { const hm = s => { const m = String(s).match(/(\d+)h(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
    const md = av.match(/m[ée]dia de \*\*([^*]+)\*\*/i), mn = av.match(/mediana de \*\*([^*]+)\*\*/i), n = av.match(/\((\d+) respostas\)/), per = av.match(/\(([^)]*\d+\/\d+[^)]*)\)/);
    tr = { media_min: md ? hm(md[1]) : null, mediana_min: mn ? hm(mn[1]) : null, n: n ? +n[1] : null, periodo: per ? per[1] : 'últimos 7 dias', unidade: 'horas corridas' }; }
  const cart = core.carteira || {}, pl = core.plano || {};
  const nomesDest = (String(cart.texto || '').match(/\*\*([^*]+)\*\*/) || [])[1];
  const ia = {
    leitura: { ritual: null, origem: 'carga inicial a partir dos painéis antigos (dashboard de ' + core.data + ', follow-up de ' + (fu && fu.data) + ', varredura de ' + (pend && pend.data) + ', fechamento de ' + (sexta && sexta.data) + ')',
      fontes: { instagram: null, whatsapp: { ok: ms.filter(m => m.wpp.ok).length, total: ms.length, falhas: ms.filter(m => !m.wpp.ok).map(m => `${m.nome}: sem histórico na Kaption`) }, planilha: { ok: true } },
      rodape: (core.rodape || []).map(strip) },
    tempo_resposta: tr,
    carteira: { pct: cart.pct ?? null, base: (String(cart.texto || '').match(/de (\d+) mentorados/) || [])[1] ? +(String(cart.texto).match(/de (\d+) mentorados/)[1]) : null,
      destravados: (String(cart.texto || '').match(/^(\d+) de/) || [])[1] ? +(String(cart.texto).match(/^(\d+) de/)[1]) : null,
      nomes_destravados: nomesDest ? nomesDest.split(/,| e /).map(s => s.trim()).filter(Boolean) : [],
      marcas: [40, 50, 65], nota: strip(cart.nota), meta_txt: strip(pl.meta), projecao: strip(pl.fecho),
      apostar: (pl.apostar || []).map(x => ({ nome: x.nome, texto: strip(x.texto), acao: strip(x.acao).replace(/^→\s*/, '') })),
      nao_apostar: (pl.nao_apostar || []).map(x => ({ nome: x.nome, texto: strip(x.texto) })) },
    fora: [],
    mentorados: ms,
  };
  fs.writeFileSync('/private/tmp/mentorados-ia-semente.json', JSON.stringify(ia, null, 1));
  console.log(`SEMENTE: ${ms.length} mentorados em /private/tmp/mentorados-ia-semente.json`);
  await montar('/private/tmp/mentorados-ia-semente.json', false);
}

const [cmd, arg, flag] = process.argv.slice(2);
try {
  if (cmd === 'montar' && arg) await montar(arg, flag === '--incremental');
  else if (cmd === 'contexto') await contexto();
  else if (cmd === 'semear') await semear();
  else console.log('Uso: node scripts/mentorados.mjs contexto | montar <ia.json> [--incremental] | semear');
} catch (e) { console.error('ERRO:', e.message); process.exit(1); }
