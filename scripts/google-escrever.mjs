#!/usr/bin/env node
// Leva para a agenda Google da Core as demandas que SÃO o compromisso acontecendo: reunião, alinhamento, treinamento
// ("Reunião com a Iessa", "Treinamento com o time"), com data e hora. Não leva a preparação ("Planejar o treinamento",
// "Preparar a pauta da reunião", "Marcar reunião com X") nem delegadas. O evento entra como privado (a rede da Core vê só "ocupado").
// Quem escreve no Google é o Claude do Mac com o conector Google Calendar (plano do Cauê, sem API paga).
// O que foi criado fica na linha gcal:criados ({idDaDemanda: {id, hash, criado, data, ini}}): mudou a demanda → atualiza o evento;
// apagou a demanda, tirou o horário ou deixou de ser reunião → apaga o evento (só os que o app criou; os que já existiam no Google ficam).
//   node scripts/google-escrever.mjs           → sincroniza uma vez
//   node scripts/google-escrever.mjs --simular → só lista o que faria
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AGENDA = 'caue.thomaz@coreeducacao.com';
const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const hm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const norm = s => ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim() + ' ';
const ACOMP = /(^|[^a-zà-ú])(cobrar|ver se)([^a-zà-ú]|$)/i;

// É o compromisso acontecendo (e não a preparação dele)?
const COMPROMISSO = / (reuniao|reunioes|alinhamento|treinamento|one a one|1:1) /;
const PREPARO = /^ (planejar|preparar|pensar|estruturar|montar|criar|organizar|definir|desenhar|elaborar|revisar|estudar|analisar|roteirizar|escrever|gravar|editar|avisar|marcar|agendar|remarcar|confirmar|enviar|mandar|pedir|cobrar|ver se|fazer a pauta|pauta|material|slides|apresentacao)\b/;
const PREPARO_MEIO = /(planejar|preparar|pensar|estruturar|montar|criar|organizar|desenhar|elaborar|pauta|material|slides|roteiro) (d[oa]s? |o |a |os |as |para o |para a |pro |pra )?(reuniao|alinhamento|treinamento)/;
export function ehCompromisso(t) {
  if (t.google === false) return false;   // o Cauê tirou da agenda Google
  if (t.google === true) return true;     // o Cauê mandou para a agenda Google
  const x = norm(t.title);
  return COMPROMISSO.test(x) && !PREPARO.test(x) && !PREPARO_MEIO.test(x);
}
const delegada = t => t.acomp !== false && ((t.responsible && t.responsible !== 'Cauê') || ACOMP.test(t.title || ''));
const hashDe = t => [t.title, t.planned_date, t.planned_time, t.estimated_duration || 30].join('|');

function claude(CLAUDE, prompt, tools) {
  const SCHEMA = JSON.stringify({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, eventId: { type: 'string' }, criado: { type: 'boolean' }, obs: { type: 'string' } } });
  const args = ['-p', '--tools', '', '--allowedTools', tools.map(x => 'mcp__claude_ai_Google_Calendar__' + x).join(','), '--no-session-persistence',
    '--model', 'haiku', '--output-format', 'json', '--json-schema', SCHEMA];
  return new Promise((resolve, reject) => {
    const ch = spawn(CLAUDE, args, { cwd: os.tmpdir(), env: { ...process.env, PATH: `${path.dirname(CLAUDE)}:${process.env.PATH || '/usr/bin:/bin'}` } });
    let out = '', err = '';
    const timer = setTimeout(() => { ch.kill('SIGTERM'); reject(new Error('demorou mais de 2 minutos')); }, 120000);
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
    ch.on('close', () => { clearTimeout(timer);
      try { const j = JSON.parse(out); if (j.is_error) return reject(new Error(String(j.result || 'erro do Claude')));
        resolve(j.structured_output || JSON.parse(j.result)); } catch (e) { reject(new Error((err || out || e.message).slice(0, 300))); } });
    ch.stdin.end(prompt);
  });
}

const quando = t => { const ini = toMin(t.planned_time), fim = ini + (t.estimated_duration || 30);
  return { start: `${t.planned_date}T${hm(ini)}:00`, end: `${t.planned_date}T${hm(Math.min(fim, 23 * 60 + 59))}:00` }; };

async function criar(CLAUDE, t) {
  const q = quando(t);
  return claude(CLAUDE, `Agenda Google: ${AGENDA}. Horário de Brasília.
Compromisso: "${t.title}" em ${t.planned_date}, das ${q.start.slice(11, 16)} às ${q.end.slice(11, 16)}.
1. Use list_events na agenda ${AGENDA} de ${t.planned_date}T00:00:00 a ${t.planned_date}T23:59:00.
2. Se já existir um evento que claramente é este mesmo compromisso (começa até 30 min antes ou depois E trata do mesmo assunto ou da mesma pessoa), NÃO crie: responda ok=true, criado=false, eventId com o id desse evento.
3. Senão, use create_event com calendarId "${AGENDA}", summary "${t.title.replace(/"/g, "'")}", startTime "${q.start}", endTime "${q.end}", visibility "private", description "Criado pelo app Minha Rotina", notificationLevel "NONE", sem convidados e sem Meet. Responda ok=true, criado=true, eventId com o id do evento criado.
Se algo falhar, ok=false e obs com o motivo.`, ['list_events', 'create_event']);
}
async function atualizar(CLAUDE, t, eventId) {
  const q = quando(t);
  return claude(CLAUDE, `Use update_event com calendarId "${AGENDA}", eventId "${eventId}", summary "${t.title.replace(/"/g, "'")}", startTime "${q.start}", endTime "${q.end}", notificationLevel "NONE". Mude só isso. Responda ok=true e eventId "${eventId}", ou ok=false com obs se falhar.`, ['update_event']);
}
async function apagar(CLAUDE, eventId) {
  return claude(CLAUDE, `Use delete_event com calendarId "${AGENDA}" e eventId "${eventId}", notificationLevel "NONE" se existir esse parâmetro. Se o evento já não existir, conte como sucesso. Responda ok=true, ou ok=false com obs.`, ['delete_event']);
}

// Uma rodada: no máximo `limite` mudanças no Google (cada uma é uma chamada curta ao Claude)
export async function sincronizarReunioes({ api, upsert, log = () => {}, CLAUDE, limite = 4, simular = false }) {
  const rows = await api('tasks?select=id,data');
  const mapa = { ...(((rows.find(r => r.id === 'gcal:criados') || {}).data || {}).mapa || {}) };
  const tarefas = new Map(rows.filter(r => !r.id.includes(':')).map(r => [r.id, { ...r.data, id: r.id }]));
  const hoje = isoLocal(new Date());
  const fila = [];
  for (const t of tarefas.values()) {
    if (t.status === 'concluida' || !t.planned_date || !t.planned_time || t.planned_date < hoje || delegada(t) || !ehCompromisso(t)) continue;
    const m = mapa[t.id];
    if (!m) fila.push({ op: 'criar', t });
    else if (m.hash !== hashDe(t)) fila.push(m.criado ? { op: 'atualizar', t, m } : { op: 'criar', t }); // o que já existia no Google não é mexido: procura de novo
  }
  for (const [id, m] of Object.entries(mapa)) {
    const t = tarefas.get(id);
    if (t && t.status === 'concluida') continue; // aconteceu: o evento fica
    const vale = t && t.planned_date && t.planned_time && !delegada(t) && ehCompromisso(t);
    if (!vale && m.data >= hoje) fila.push({ op: m.criado ? 'apagar' : 'soltar', id, m });
  }
  if (simular) return fila.map(f => `${f.op}: ${f.t ? `${f.t.title} (${f.t.planned_date} ${f.t.planned_time})` : f.id}`);
  let mudou = false, feitas = 0;
  for (const f of fila) {
    if (f.op === 'soltar') { delete mapa[f.id]; mudou = true; continue; }
    if (feitas >= limite) break;
    feitas++;
    try {
      if (f.op === 'criar') {
        const r = await criar(CLAUDE, f.t);
        if (!r.ok || !r.eventId) throw new Error(r.obs || 'sem id do evento');
        mapa[f.t.id] = { id: r.eventId, criado: !!r.criado, hash: hashDe(f.t), data: f.t.planned_date, ini: f.t.planned_time };
        log(r.criado ? 'Google: criado' : 'Google: já existia', f.t.planned_date, f.t.planned_time);
      } else if (f.op === 'atualizar') {
        const r = await atualizar(CLAUDE, f.t, f.m.id);
        if (!r.ok) throw new Error(r.obs || 'falhou');
        mapa[f.t.id] = { ...f.m, hash: hashDe(f.t), data: f.t.planned_date, ini: f.t.planned_time };
        log('Google: atualizado', f.t.planned_date, f.t.planned_time);
      } else if (f.op === 'apagar') {
        const r = await apagar(CLAUDE, f.m.id);
        if (!r.ok) throw new Error(r.obs || 'falhou');
        delete mapa[f.id];
        log('Google: apagado', f.m.data, f.m.ini);
      }
      mudou = true;
    } catch (e) { log('Google: falhou', f.op, e.message.slice(0, 160)); }
  }
  if (mudou) await upsert('gcal:criados', { atualizado: new Date().toISOString(), mapa });
  return feitas;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
    .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };
  const api = async (p, opt = {}) => { const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); const t = await r.text(); return t ? JSON.parse(t) : null; };
  const user = (await api('settings?select=user_id&limit=1'))[0].user_id;
  const upsert = (id, data) => api('tasks?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, user_id: user, data, updated_at: new Date().toISOString() }) });
  const CLAUDE = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local', 'bin', 'claude');
  const r = await sincronizarReunioes({ api, upsert, CLAUDE, log: (...a) => console.log(...a), simular: process.argv.includes('--simular'), limite: 20 });
  console.log(r);
}
