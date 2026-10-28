#!/usr/bin/env node
// Assistente do Minha Rotina: responde o chat da aba "Assistente" usando o Claude Code do Mac (plano do Cauê, sem API paga).
// Fica rodando em segundo plano (launchd): a cada poucos segundos procura mensagens novas no Supabase (linhas chat:<id>),
// chama `claude -p` com as demandas, o Contexto e as regras de agenda, e grava a resposta com as mudanças PROPOSTAS.
// Nada é alterado aqui: quem aplica é o app, depois que o Cauê confirma.
//   node scripts/assistente.mjs          → fica rodando
//   node scripts/assistente.mjs uma-vez  → processa a fila uma vez e sai (teste)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sincronizar as sincronizarGoogle } from './google-agenda.mjs';
import { sincronizarReunioes } from './google-escrever.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
  .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const BASE = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };
const CLAUDE = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local', 'bin', 'claude');
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

async function api(p, opt = {}) {
  const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
let USER = null;
async function userId() { if (!USER) USER = ((await api('settings?select=user_id&limit=1'))[0] || {}).user_id; return USER; }
async function upsert(id, data) {
  await api('tasks?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, user_id: await userId(), data, updated_at: new Date().toISOString() }) });
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ACOMP = /(^|[^a-zà-ú])(cobrar|ver se)([^a-zà-ú]|$)/i;

async function contexto() {
  const [st] = await api('settings?select=data&limit=1');
  const C = st.data || {};
  const rows = await api('tasks?select=id,data');
  const gcal = ((rows.find(r => r.id === 'gcal:agenda') || {}).data || {}).eventos || [];
  const hoje = isoLocal(new Date()), ontem = isoLocal(new Date(Date.now() - 2 * 864e5));
  const tarefas = rows.filter(r => !r.id.includes(':')).map(r => ({ ...r.data, id: r.id }))
    .filter(t => t.status !== 'concluida' || (t.completed_at && t.completed_at.slice(0, 10) >= ontem));
  const linha = t => [t.id, t.status === 'concluida' ? '✓' : '·', t.title, t.type || '-', t.priority ? 'P' + t.priority : '-',
    t.planned_date ? `${WD[new Date(t.planned_date + 'T12:00').getDay()]} ${t.planned_date} ${t.planned_time || 'sem hora'}` : 'sem data',
    `${t.estimated_duration || 30}min`, t.deadline ? 'prazo ' + t.deadline : '', t.responsible && t.responsible !== 'Cauê' ? 'resp ' + t.responsible : '',
    (t.acomp !== false && ((t.responsible && t.responsible !== 'Cauê') || ACOMP.test(t.title || ''))) ? 'ACOMPANHAMENTO' : '',
    t.focus_week ? 'semana:' + t.focus_week : '', t.focus_day ? 'dia:' + t.focus_day : '', t.repeat ? 'repete ' + t.repeat : '',
    (t.subtasks || []).length ? `checklist ${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}` : ''].filter(Boolean).join(' | ');
  const ord = (a, b) => ((a.planned_date || '9') + (a.planned_time || '99')).localeCompare((b.planned_date || '9') + (b.planned_time || '99'));
  const horas = Object.entries(C.hours || {}).map(([d, h]) => `${WD[d]}: ${h.on ? `${h.start}–${h.end}` : 'não trabalha'}`).join(' · ');
  const FIX = C.fixed || []; // só o que não fica no Google; o resto vem da agenda Google
  const fixos = FIX.filter(f => f.title).map(f => `${WD[f.wd]} ${f.time} (${f.dur || 60}min) ${f.title}`).join('\n');
  const agora = new Date();
  // Agenda já montada por código, dia a dia (o modelo erra menos lendo assim)
  const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
  const hm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const minhas = tarefas.filter(t => t.status !== 'concluida' && t.planned_time && !(t.acomp !== false && ((t.responsible && t.responsible !== 'Cauê') || ACOMP.test(t.title || ''))));
  const dias = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i), k = isoLocal(d), h = (C.hours || {})[d.getDay()];
    const blocos = FIX.filter(f => f.title && +f.wd === d.getDay()).map(f => [toMin(f.time), toMin(f.time) + (+f.dur || 60), `${f.title} (fixo)`])
      .concat(gcal.filter(e => e.data === k).map(e => [toMin(e.ini), toMin(e.ini) + e.dur, `${e.titulo} (reunião do Google Agenda, não mexer)`]))
      .concat(minhas.filter(t => t.planned_date === k).map(t => [toMin(t.planned_time), toMin(t.planned_time) + (t.estimated_duration || 30), `${t.title} [${t.id}]`]))
      .sort((a, b) => a[0] - b[0]);
    dias.push(`${i === 0 ? 'HOJE' : i === 1 ? 'AMANHÃ' : WD[d.getDay()].toUpperCase()} ${WD[d.getDay()]} ${k} · ${h && h.on ? `expediente ${h.start}–${h.end}` : 'não trabalha'}\n${blocos.map(b => `  ${hm(b[0])}–${hm(b[1])} ${b[2]}`).join('\n') || '  (livre)'}`);
  }
  return `AGENDA DOS PRÓXIMOS DIAS (ocupado; o que não aparece está livre):\n${dias.join('\n')}\n\nAGORA: ${WD[agora.getDay()]} ${hoje} ${pad(agora.getHours())}:${pad(agora.getMinutes())} (horário de Brasília). A "semana" das prioridades começa na segunda; no domingo, vale a semana seguinte.
EXPEDIENTE: ${horas}
COMPROMISSOS FIXOS FORA DO GOOGLE (toda semana):
${fixos || '(nenhum)'}
PESSOAS: ${(C.people || []).filter(p => p.name).map(p => `${p.name} (${p.role || ''})`).join('; ')}
REGRA DE P1: ${C.p1 || ''}
OBSERVAÇÕES DO CAUÊ: ${C.notes || ''}
PROJETOS: ${(C.projects || []).join(', ')}

DEMANDAS (id | estado | título | tipo | prioridade | planejado | duração | prazo | ...), ordenadas por data:
${tarefas.sort(ord).map(linha).join('\n')}`;
}

const SISTEMA = `Você é o assistente de agenda do Cauê Thomaz dentro do app Minha Rotina. Ele escreve no chat do app para criar demandas, registrar reuniões, mudar horários, concluir coisas e reorganizar o dia ou a semana. Responda sempre em português do Brasil, curto e direto, sem jargão.

Você NÃO aplica nada: você PROPÕE ações, e o Cauê confirma no app. Use apenas os ids que aparecem em DEMANDAS. Nunca invente ids. Nunca proponha apagar demandas.

REGRAS DE AGENDA (obrigatórias):
- Planejar só dentro do expediente (seg–sex 11h–20h). O que ele faz de manhã é adiantamento: não planeje antes das 11h.
- Almoço às 13h por 1h: nada nesse horário. Respeite os compromissos fixos e as demandas que já têm hora; não sobreponha (exceto se ele pedir).
- Demanda que envolve outras pessoas (reunião, conversa, alinhamento, cobrança, falar com alguém, treinar alguém) termina até as 17h. Demanda solo (analisar gravação, planejar, estudar, escrever) pode ir até as 20h.
- Demanda que é o compromisso acontecendo (reunião, alinhamento, treinamento; não a preparação deles) vai sozinha para a agenda Google da Core quando tem data e hora: crie como demanda normal, com data e hora.
- Reuniões marcadas "(reunião do Google Agenda, não mexer)" vêm da agenda do Google da Core: são horário ocupado. Não proponha mudar, concluir nem recriar como demanda; se ele pedir para mover uma delas, diga que precisa mudar no Google Agenda. Se ele contar de uma reunião que já está lá, não crie outra.
- Conversas (tipo C) curtas vão numa janela às 11h, 15 min cada.
- Sexta é de treinamentos e alinhamentos: não planeje trabalho estratégico na sexta.
- Prioridades: o que tem "dia:<hoje>" é prioridade do dia; "semana:<semana atual>" é prioridade da semana. Ao reorganizar, prioridades do dia primeiro, depois as da semana, o mais cedo possível na semana; P1 antes de P2.
- Demandas de ACOMPANHAMENTO (delegadas, "cobrar", "ver se") não ocupam a agenda do Cauê: não dê horário a elas.
- Demanda nova sem tipo: E estratégico, O operacional, A analítico, C conversa. Duração padrão: C 15, O 30, A 60, E 90 (reunião: 60).
- Se faltar informação essencial (ex.: duração de uma reunião), assuma o padrão e diga na resposta o que assumiu. Se o pedido for só uma pergunta, responda sem ações.
- Se não couber tudo, diga o que ficou de fora e para quando sugere.

FORMATO DAS AÇÕES:
- "criar": campos titulo (obrigatório), tipo, prioridade (1–3), data (AAAA-MM-DD), hora (HH:MM), duracao (min), prazo (AAAA-MM-DD), pessoas, responsavel, descricao, checklist (lista de itens), semana (true = prioridade da semana), dia (true = prioridade do dia).
- "editar": id + os campos que mudam (os mesmos nomes acima; hora null tira o horário).
- "concluir": id.
- Cada ação tem "resumo": uma linha que o Cauê lê para aprovar, ex.: "Reunião com o Juan: qua 28/10 às 11h30 (60 min)".
"resposta": o que você entendeu e fez, em até 4 linhas; liste o que assumiu e o que não coube.`;

const SCHEMA = JSON.stringify({ type: 'object', required: ['resposta', 'acoes'], properties: {
  resposta: { type: 'string' },
  acoes: { type: 'array', items: { type: 'object', required: ['op', 'resumo'], properties: {
    op: { type: 'string', enum: ['criar', 'editar', 'concluir'] }, resumo: { type: 'string' }, id: { type: 'string' },
    titulo: { type: 'string' }, tipo: { type: 'string', enum: ['E', 'O', 'A', 'C'] }, prioridade: { type: 'integer' },
    data: { type: 'string' }, hora: { type: ['string', 'null'] }, duracao: { type: 'integer' }, prazo: { type: 'string' },
    pessoas: { type: 'array', items: { type: 'string' } }, responsavel: { type: 'string' }, descricao: { type: 'string' },
    checklist: { type: 'array', items: { type: 'string' } }, semana: { type: 'boolean' }, dia: { type: 'boolean' } } } } } });

function perguntarClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--model', 'sonnet',
      '--output-format', 'json', '--system-prompt', SISTEMA, '--json-schema', SCHEMA];
    const ch = spawn(CLAUDE, args, { cwd: os.tmpdir(), env: { ...process.env, PATH: `${path.dirname(CLAUDE)}:${process.env.PATH || '/usr/bin:/bin'}` } });
    let out = '', err = '';
    const timer = setTimeout(() => { ch.kill('SIGTERM'); reject(new Error('o Claude demorou mais de 3 minutos')); }, 180000);
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
    ch.on('close', () => { clearTimeout(timer);
      try { const j = JSON.parse(out); if (j.is_error) return reject(new Error(String(j.result || 'erro do Claude')));
        resolve(j.structured_output || JSON.parse(j.result)); } catch (e) { reject(new Error((err || out || e.message).slice(0, 300))); } });
    ch.stdin.end(prompt);
  });
}

async function processar() {
  const fila = await api('tasks?select=id,data&id=like.chat:*&data->>role=eq.user&data->>status=eq.pendente');
  if (!fila.length) return;
  const todas = await api('tasks?select=id,data&id=like.chat:*');
  const hist = todas.map(r => r.data).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  for (const msg of fila.sort((a, b) => String(a.data.criadoEm).localeCompare(String(b.data.criadoEm)))) {
    await upsert(msg.id, { ...msg.data, status: 'processando' });
    log('mensagem', msg.id);
    try {
      const anteriores = hist.filter(m => m.criadoEm < msg.data.criadoEm).slice(-8)
        .map(m => `${m.role === 'user' ? 'CAUÊ' : 'ASSISTENTE'}: ${m.texto}${m.acoes && m.acoes.length ? ` [${m.aplicada ? 'aplicou' : m.descartada ? 'descartou' : 'sem resposta'}: ${m.acoes.map(a => a.resumo).join('; ')}]` : ''}`).join('\n');
      const prompt = `${await contexto()}\n\nCONVERSA ANTERIOR (mais recente por último):\n${anteriores || '(nenhuma)'}\n\nNOVA MENSAGEM DO CAUÊ:\n${msg.data.texto}`;
      const r = await perguntarClaude(prompt);
      const acoes = (r.acoes || []).filter(a => a && a.op && (a.op === 'criar' ? a.titulo : a.id));
      await upsert(`chat:${Date.now().toString(36)}-a`, { role: 'assistant', texto: r.resposta || 'Pronto.', acoes, respondeA: msg.id, criadoEm: new Date().toISOString() });
      await upsert(msg.id, { ...msg.data, status: 'respondida' });
      log('respondida com', acoes.length, 'ações');
    } catch (e) {
      log('erro', e.message);
      await upsert(`chat:${Date.now().toString(36)}-a`, { role: 'assistant', erro: true, texto: `Não consegui responder agora (${e.message.slice(0, 160)}). Tente de novo em instantes.`, acoes: [], respondeA: msg.id, criadoEm: new Date().toISOString() });
      await upsert(msg.id, { ...msg.data, status: 'erro' });
    }
  }
}

async function batimento() { try { await upsert('assistente:status', { online: true, visto: new Date().toISOString() }); } catch (e) { log('batimento falhou', e.message); } }

if (process.argv[2] === 'uma-vez') { await batimento(); await processar(); process.exit(0); }
log('assistente no ar');
let ocupado = false, ultimoBat = 0, ultimoGoogle = 0, escrevendo = false;
// Demandas de reunião/alinhamento/treinamento → agenda Google (a cada 2 min, em paralelo ao chat)
setInterval(async () => {
  if (escrevendo) return; escrevendo = true;
  try { await sincronizarReunioes({ api, upsert, log, CLAUDE }); } catch (e) { log('Google: falha', e.message); }
  finally { escrevendo = false; }
}, 120000);
setInterval(async () => {
  if (ocupado) return; ocupado = true;
  try { if (Date.now() - ultimoBat > 60000) { ultimoBat = Date.now(); await batimento(); } await processar();
    if (env.GCAL_ICS_URL && Date.now() - ultimoGoogle > 5 * 60000) { ultimoGoogle = Date.now();
      const mapa = (((await api('tasks?select=data&id=eq.gcal:criados'))[0] || {}).data || {}).mapa || {};
      const pular = new Set(Object.values(mapa).map(m => m.id.split('_')[0] + '|' + m.data));
      await sincronizarGoogle({ url: env.GCAL_ICS_URL, email: env.GCAL_EMAIL || 'caue.thomaz@coreeducacao.com', upsert, log, pular }).catch(e => log('agenda do Google falhou', e.message)); } }
  catch (e) { log('falha', e.message); }
  finally { ocupado = false; }
}, 5000);
