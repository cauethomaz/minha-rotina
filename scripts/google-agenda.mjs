#!/usr/bin/env node
// Traz as reuniões da agenda Google da Core para o Minha Rotina (só leitura, só nesse sentido).
// Lê o "endereço secreto no formato iCal" da agenda (GCAL_ICS_URL no .env), expande as repetições
// e grava a linha gcal:agenda com os eventos de ontem até 6 semanas à frente. Nada é escrito no Google.
// Fica dentro do serviço do assistente (a cada 5 min); também roda sozinho para teste:
//   node scripts/google-agenda.mjs   → sincroniza uma vez e mostra quantos eventos achou
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TZ = 'America/Sao_Paulo';
const pad = n => String(n).padStart(2, '0');

// ---------- leitura do .ics ----------
function linhas(txt) {
  const out = [];
  for (const l of txt.replace(/\r\n/g, '\n').split('\n')) {
    if ((l[0] === ' ' || l[0] === '\t') && out.length) out[out.length - 1] += l.slice(1); else if (l) out.push(l);
  }
  return out;
}
function prop(l) {
  const i = l.indexOf(':'); const head = l.slice(0, i), valor = l.slice(i + 1);
  const [nome, ...ps] = head.split(';');
  return { nome: nome.toUpperCase(), params: Object.fromEntries(ps.map(p => { const j = p.indexOf('='); return [p.slice(0, j).toUpperCase(), p.slice(j + 1).replace(/^"|"$/g, '')]; })), valor };
}
const texto = v => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function eventos(txt) {
  const evs = []; let ev = null;
  for (const l of linhas(txt)) {
    if (l === 'BEGIN:VEVENT') { ev = { exdate: [], attendees: [] }; continue; }
    if (l === 'END:VEVENT') { if (ev) evs.push(ev); ev = null; continue; }
    if (!ev) continue;
    const p = prop(l);
    if (p.nome === 'EXDATE') p.valor.split(',').forEach(v => ev.exdate.push({ valor: v, params: p.params }));
    else if (p.nome === 'ATTENDEE') ev.attendees.push(p);
    else ev[p.nome] = p;
  }
  return evs;
}

// ---------- datas: horário de parede de um fuso ↔ instante ----------
const fmt = new Map();
function partes(ms, tz) {
  if (!fmt.has(tz)) fmt.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  const o = Object.fromEntries(fmt.get(tz).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
}
function paraInstante(y, mo, d, h, mi, tz) {
  const chute = Date.UTC(y, mo - 1, d, h, mi);
  const p = partes(chute, tz), desvio = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - chute;
  return chute - desvio;
}
function lerData(valor, params) {
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { diaTodo: true, y: +y, mo: +mo, d: +d, h: 0, mi: 0, tz: TZ, ms: paraInstante(+y, +mo, +d, 0, 0, TZ) };
  let tz = z ? 'UTC' : (params.TZID || TZ);
  try { partes(0, tz); } catch { tz = TZ; }
  return { y: +y, mo: +mo, d: +d, h: +h, mi: +mi, tz, ms: paraInstante(+y, +mo, +d, +h, +mi, tz) };
}
function duracao(v) {
  const m = v.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  return m ? (((+m[1] || 0) * 7 + (+m[2] || 0)) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 60000 : 3600000;
}

// ---------- repetições (RRULE) ----------
const DIAS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const diaN = (y, mo, d) => Math.floor(Date.UTC(y, mo - 1, d) / 864e5); // nº do dia, sem fuso
function ocorrencias(ini, rrule, ate) {
  const r = Object.fromEntries(rrule.split(';').map(x => x.split('=')));
  const freq = r.FREQ, intv = +r.INTERVAL || 1, count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? lerData(r.UNTIL, {}) : null, fim = Math.min(ate, until ? until.ms + (until.diaTodo ? 864e5 - 1 : 0) : Infinity);
  const byday = r.BYDAY ? r.BYDAY.split(',').map(x => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/); return { n: m[1] ? +m[1] : 0, wd: DIAS[m[2]] }; }) : null;
  const bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
  const bymo = r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null;
  const d0 = diaN(ini.y, ini.mo, ini.d), wd0 = new Date(d0 * 864e5).getUTCDay();
  const semana0 = Math.floor((d0 - ((wd0 + 6) % 7)) / 7); // semanas começando na segunda (WKST=MO)
  const out = []; let n = 0;
  for (let dn = d0; n < count && dn < d0 + 40000; dn++) {
    const dt = new Date(dn * 864e5), y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate(), wd = dt.getUTCDay();
    const ms = paraInstante(y, mo, d, ini.h, ini.mi, ini.tz);
    if (ms > fim) break;
    const ultimo = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const nth = b => b.n > 0 ? Math.ceil(d / 7) === b.n : b.n < 0 ? Math.ceil((ultimo - d + 1) / 7) === -b.n : true;
    let ok;
    if (freq === 'DAILY') ok = (dn - d0) % intv === 0 && (!byday || byday.some(b => b.wd === wd));
    else if (freq === 'WEEKLY') ok = (Math.floor((dn - ((wd + 6) % 7)) / 7) - semana0) % intv === 0 && (byday ? byday.some(b => b.wd === wd) : wd === wd0);
    else if (freq === 'MONTHLY') ok = ((y - ini.y) * 12 + mo - ini.mo) % intv === 0
      && (bymd ? bymd.some(x => (x > 0 ? x : ultimo + x + 1) === d) : byday ? byday.some(b => b.wd === wd && nth(b)) : d === ini.d);
    else if (freq === 'YEARLY') ok = (y - ini.y) % intv === 0 && (bymo ? bymo.includes(mo) : mo === ini.mo)
      && (byday ? byday.some(b => b.wd === wd && nth(b)) : d === ini.d);
    else ok = dn === d0;
    if (!ok) continue;
    n++; out.push(ms);
  }
  return out;
}

// ---------- monta a lista que o app usa ----------
export function montar(ics, { email = '', desde, ate, pular = new Set() }) {
  const evs = eventos(ics), em = email.toLowerCase();
  const recusado = ev => ev.attendees.some(a => a.valor.toLowerCase().replace(/^mailto:/, '') === em && a.params.PARTSTAT === 'DECLINED');
  const valido = ev => ev.DTSTART && (ev.STATUS || {}).valor !== 'CANCELLED' && (ev.TRANSP || {}).valor !== 'TRANSPARENT' && !recusado(ev);
  // Exceções de uma série (RECURRENCE-ID): substituem ou cancelam a ocorrência original
  const trocas = new Map();
  for (const ev of evs) if (ev['RECURRENCE-ID'] && ev.UID) {
    const r = lerData(ev['RECURRENCE-ID'].valor, ev['RECURRENCE-ID'].params);
    if (r) trocas.set(ev.UID.valor + '|' + r.ms, ev);
  }
  const out = [];
  const item = (ev, ms) => {
    const ini = lerData(ev.DTSTART.valor, ev.DTSTART.params);
    if (!ini || ini.diaTodo) return; // evento de dia inteiro não ocupa horário
    const fimD = ev.DTEND && lerData(ev.DTEND.valor, ev.DTEND.params);
    const durMs = fimD ? fimD.ms - ini.ms : ev.DURATION ? duracao(ev.DURATION.valor) : 3600000;
    const s = ms ?? ini.ms;
    if (s + durMs < desde || s > ate) return;
    const p = partes(s, TZ), e = partes(s + durMs, TZ);
    const data = `${p.y}-${pad(p.mo)}-${pad(p.d)}`, minIni = p.h * 60 + p.mi;
    if (ev.UID && pular.has(ev.UID.valor.replace(/@google\.com$/, '').split('_')[0] + '|' + data)) return; // já aparece como demanda
    const minFim = `${e.y}-${pad(e.mo)}-${pad(e.d)}` === data ? e.h * 60 + e.mi : 24 * 60;
    out.push({ id: `${ev.UID ? ev.UID.valor : 'x'}|${s}`.slice(-90), titulo: ev.SUMMARY ? texto(ev.SUMMARY.valor) : '(sem título)',
      data, ini: `${pad(p.h)}:${pad(p.mi)}`, dur: Math.max(15, minFim - minIni) });
  };
  for (const ev of evs) {
    if (ev['RECURRENCE-ID']) { if (valido(ev)) item(ev); continue; }
    if (!ev.DTSTART) continue;
    const ini = lerData(ev.DTSTART.valor, ev.DTSTART.params);
    if (!ini) continue;
    if (!ev.RRULE) { if (valido(ev)) item(ev); continue; }
    const fora = new Set(ev.exdate.map(x => (lerData(x.valor, x.params) || {}).ms));
    for (const ms of ocorrencias(ini, ev.RRULE.valor, ate)) {
      if (fora.has(ms) || trocas.has((ev.UID || {}).valor + '|' + ms)) continue;
      if (valido(ev)) item(ev, ms);
    }
  }
  return out.sort((a, b) => (a.data + a.ini).localeCompare(b.data + b.ini));
}

let ultimo = { json: '', em: 0 };
export async function sincronizar({ url, email, upsert, log = () => {}, pular }) {
  if (!url) return null;
  const r = await fetch(url, { headers: { 'User-Agent': 'minha-rotina' } });
  if (!r.ok) throw new Error(`a agenda do Google respondeu ${r.status}`);
  const ics = await r.text();
  if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('o endereço não devolveu uma agenda (.ics)');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const lista = montar(ics, { email, pular, desde: hoje.getTime() - 864e5, ate: hoje.getTime() + 43 * 864e5 });
  const json = JSON.stringify(lista);
  // Só regrava quando muda (ou a cada 30 min, para o app saber que está atualizado)
  if (json !== ultimo.json || Date.now() - ultimo.em > 30 * 60000) {
    await upsert('gcal:agenda', { fonte: 'Google Agenda (Core)', atualizado: new Date().toISOString(), eventos: lista });
    if (json !== ultimo.json) log('agenda do Google:', lista.length, 'eventos');
    ultimo = { json, em: Date.now() };
  }
  return lista;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
    .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]));
  if (!env.GCAL_ICS_URL) { console.log('Falta GCAL_ICS_URL no .env'); process.exit(1); }
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };
  const api = async (p, opt = {}) => { const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); const t = await r.text(); return t ? JSON.parse(t) : null; };
  const user = (await api('settings?select=user_id&limit=1'))[0].user_id;
  const upsert = (id, data) => api('tasks?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, user_id: user, data, updated_at: new Date().toISOString() }) });
  const lista = await sincronizar({ url: env.GCAL_ICS_URL, email: env.GCAL_EMAIL || 'caue.thomaz@coreeducacao.com', upsert });
  const porDia = {}; lista.forEach(e => { porDia[e.data] = (porDia[e.data] || 0) + 1; });
  console.log(`OK: ${lista.length} eventos com horário`, porDia);
}
