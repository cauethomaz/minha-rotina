#!/usr/bin/env node
// Revisão pelo Claude, usando o seu plano (sem chave de API).
// Uma tarefa agendada do app do Claude roda:
//   node scripts/revisar.mjs pendentes          → imprime as instruções e as demandas a revisar
//   node scripts/revisar.mjs aplicar <arquivo>  → grava no Supabase o JSON que o Claude escreveu
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
if (!BASE || !KEY) {
  console.log('CONFIGURACAO_PENDENTE: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env');
  process.exit(0);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function api(p, opt = {}) {
  const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

const WDL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DURS = [15, 30, 45, 60, 90, 120, 180, 240];
const RHYTHM = ['diario', 'semanal', 'mensal', 'trimestral'];
const LOCKABLE = ['type', 'priority', 'planned_date', 'planned_time', 'estimated_duration', 'deadline', 'rhythm', 'project'];
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function locked(t) {
  const sug = (t.ai && t.ai.fields) || [];
  const out = {};
  for (const k of LOCKABLE) if (t[k] != null && t[k] !== '' && !sug.includes(k)) out[k] = t[k];
  if (t.responsible && t.responsible !== 'Cauê' && !sug.includes('responsible')) out.responsible = t.responsible;
  return out;
}

async function loadAll() {
  const st = (await api('settings?select=user_id,data&limit=1'))[0];
  const uid = ENV.USER_ID || (st && st.user_id);
  const rows = await api(`tasks?select=id,data${uid ? `&user_id=eq.${uid}` : ''}`);
  return { ctx: (st && st.data) || {}, tasks: rows.map(r => ({ ...r.data, id: r.id })) };
}

function agenda(ctx, tasks) {
  const out = [], now = new Date();
  const open = tasks.filter(t => t.status !== 'concluida' && t.planned_date && t.planned_time);
  for (let i = 0; i < 14; i++) {
    const d = addDays(now, i), k = iso(d), wd = d.getDay(), h = (ctx.hours || {})[wd];
    const busy = (ctx.fixed || []).filter(f => +f.wd === wd && f.title)
      .map(f => `${f.time}-${fromMin(toMin(f.time) + (+f.dur || 60))} ${f.title} (fixo)`)
      .concat(open.filter(t => t.planned_date === k)
        .map(t => `${t.planned_time}-${fromMin(toMin(t.planned_time) + (t.estimated_duration || 30))} ${String(t.title).slice(0, 40)}`))
      .sort();
    const exp = h && h.on ? `expediente ${h.start}–${h.end}${h.prod ? '' : ' (sem tempo de produção)'}` : 'não trabalha';
    out.push(`- ${WDL[wd]} ${k}: ${exp}${busy.length ? '. Ocupado: ' + busy.join('; ') : ''}`);
  }
  return out.join('\n');
}

async function pendentes() {
  const { ctx, tasks } = await loadAll();
  const pend = tasks.filter(t => t.ai_review === 'pendente' && t.status !== 'concluida').slice(0, 20);
  if (!pend.length) { console.log('NADA_PENDENTE'); return; }
  const now = new Date();
  const items = pend.map(t => {
    const sug = {};
    for (const k of (t.ai && t.ai.fields) || []) sug[k] = t[k];
    return { id: t.id, texto: [t.title, t.description].filter(Boolean).join('\n'), definido_pelo_caue: locked(t), sugestao_automatica: sug };
  });
  console.log(`Você revisa as demandas de Cauê Thomaz, líder do setor Growth Ops da Core Studio (lidera os estrategistas). O app já preencheu os campos por regras simples (sugestao_automatica). Revise e melhore.

Agora: ${WDL[now.getDay()]}, ${iso(now)}, ${pad(now.getHours())}:${pad(now.getMinutes())}.

TIPO
- E (estratégico): direção do setor, processos, pessoas, decisões estruturais, apostas, projetos importantes, mudanças de sistema.
- O (operacional): destravar o time, decisões rápidas, follow-ups, dia a dia, problemas pontuais, correções, cobranças, acompanhamentos, tarefas administrativas e pessoais.
- A (analítico): métricas, indicadores, leitura de resultados, diagnósticos, análises para decisão.

PRIORIDADE (impacto no setor × urgência real): 1 = fazer agora; 2 = nesta semana; 3 = pode esperar.
É P1 quando: ${ctx.p1 || 'há risco alto ou urgência real.'}

PRAZO REAL (deadline): se o texto citar prazo ou data de entrega, use-o. Senão: ${ctx.deadlineRule || '1 dia útil a partir de hoje; P1 é hoje.'}

DATA PLANEJADA (planned_date e planned_time): escolha horário livre na agenda abaixo, dentro do expediente, nunca depois do deadline. Estratégico pede bloco de 90 min ou mais em dia com tempo de produção. Operacional vai em janela curta, perto de outros operacionais. P1 vai para hoje no próximo horário livre. Se o texto citar dia ou horário, respeite.

PROJETOS (use exatamente um destes nomes, ou ""): ${(ctx.projects || []).map(p => JSON.stringify(p)).join(', ') || 'nenhum'}
PESSOAS CONHECIDAS:
${(ctx.people || []).filter(p => p.name).map(p => `- ${p.name}: ${p.role || ''}`).join('\n') || '- nenhuma'}
${ctx.notes ? `OBSERVAÇÕES DO CAUÊ:\n${ctx.notes}\n` : ''}
AGENDA DOS PRÓXIMOS 14 DIAS
${agenda(ctx, tasks)}

DEMANDAS (nunca altere o que está em definido_pelo_caue)
${items.map(it => JSON.stringify(it)).join('\n')}

Escreva SOMENTE JSON neste formato, um item por demanda, com o mesmo "id":
{"items":[{"id":"","title":"","description":"","type":"E","priority":2,"planned_date":"AAAA-MM-DD","planned_time":"HH:MM","estimated_duration":30,"deadline":"AAAA-MM-DD","rhythm":"","project":"","responsible":"Cauê","people":[],"tags":[],"subtasks":[]}]}
Regras: title curto (até 8 palavras), claro, mantendo nomes próprios. description reescreve os detalhes úteis em 1 a 3 frases, ou "" se o texto já é curto. subtasks só se o texto descrever etapas. tags: 0 a 3 palavras minúsculas. people: nomes de pessoas citadas. estimated_duration: um de 15, 30, 45, 60, 90, 120, 180, 240. rhythm: "diario", "semanal", "mensal", "trimestral" ou "".`);
}

function review(t, r) {
  const lock = locked(t), patch = {}, prev = {};
  const set = (k, v) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length) || k in lock) return;
    if (JSON.stringify(t[k]) === JSON.stringify(v)) return;
    prev[k] = t[k]; patch[k] = v;
  };
  const strs = (a, n) => Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, n) : [];
  if (typeof r.title === 'string' && r.title.trim()) set('title', r.title.trim().slice(0, 140));
  if (!t.description) set('description', (typeof r.description === 'string' && r.description.trim()) || (String(t.title).length > 70 ? t.title : ''));
  if (['E', 'O', 'A'].includes(r.type)) set('type', r.type);
  if ([1, 2, 3].includes(+r.priority)) set('priority', +r.priority);
  if (isDate(r.planned_date)) set('planned_date', r.planned_date);
  if (typeof r.planned_time === 'string' && /^\d{2}:\d{2}$/.test(r.planned_time)) set('planned_time', r.planned_time);
  if (+r.estimated_duration > 0) set('estimated_duration', DURS.reduce((a, b) => Math.abs(b - r.estimated_duration) < Math.abs(a - r.estimated_duration) ? b : a));
  if (isDate(r.deadline)) set('deadline', r.deadline);
  if (RHYTHM.includes(r.rhythm)) set('rhythm', r.rhythm);
  if (typeof r.project === 'string' && r.project) set('project', r.project);
  if (typeof r.responsible === 'string' && r.responsible.trim() && r.responsible.trim() !== 'Cauê') set('responsible', r.responsible.trim());
  const people = [...new Set((t.people || []).concat(strs(r.people, 6)))];
  if (people.length !== (t.people || []).length) set('people', people);
  const tags = [...new Set((t.tags || []).concat(strs(r.tags, 3).map(x => x.toLowerCase().replace(/^#/, ''))))];
  if (tags.length !== (t.tags || []).length) set('tags', tags);
  if (!(t.subtasks || []).length) set('subtasks', strs(r.subtasks, 8).map(x => ({ t: x, done: false })));
  const dl = patch.deadline || t.deadline, pd = patch.planned_date || t.planned_date;
  if (dl && pd && pd > dl && 'planned_date' in patch) patch.planned_date = dl;
  const old = t.ai || { fields: [], prev: {} };
  return {
    ...t, ...patch, ai_review: 'feito',
    ai: { by: 'claude', fields: [...new Set((old.fields || []).concat(Object.keys(patch)))], prev: { ...prev, ...(old.prev || {}) } },
  };
}

async function aplicar(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  let n = 0;
  for (const r of j.items || []) {
    if (!r || !r.id) continue;
    const row = (await api(`tasks?select=id,data&id=eq.${encodeURIComponent(r.id)}`))[0];
    if (!row || row.data.ai_review !== 'pendente') continue; // apagada ou já mexida pelo Cauê
    const next = review({ ...row.data, id: row.id }, r);
    await api(`tasks?id=eq.${encodeURIComponent(r.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: next, updated_at: new Date().toISOString() }),
    });
    n++;
  }
  console.log(`REVISADAS: ${n}`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'pendentes') await pendentes();
  else if (cmd === 'aplicar' && arg) await aplicar(arg);
  else console.log('Uso: node scripts/revisar.mjs pendentes | aplicar <arquivo.json>');
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
}
