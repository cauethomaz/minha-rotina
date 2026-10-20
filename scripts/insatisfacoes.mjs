#!/usr/bin/env node
// Análise dos casos de insatisfação pelo Claude (rotina "Insatisfações").
//   node scripts/insatisfacoes.mjs ler            → imprime instruções + casos (sem telefone) ou NADA_NOVO
//   node scripts/insatisfacoes.mjs gravar <json>  → grava a análise na linha insat:analise (a tela Insatisfações lê)
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
if (!BASE || !KEY) { console.log('CONFIGURACAO_PENDENTE: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(0); }
const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) };
async function api(p, opt = {}) {
  const r = await fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...headers, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const CAT = { estrategia: 'Estratégia e roteiros', mentor: 'Mentor', producao: 'Produção, edição e prazos', resultado: 'Resultado (views, seguidores)', atendimento: 'Atendimento e tempo de resposta', venda: 'Expectativa da venda e contrato', outro: 'Outro' };
const RAIZ = { venda: 'Expectativa desalinhada na venda', onboarding: 'Onboarding ou entendimento do método', estrategia: 'Qualidade da estratégia ou do roteiro', mentor: 'Postura ou presença do mentor', producao: 'Processo ou prazo de produção', atendimento: 'Comunicação e tempo de resposta', execucao: 'Execução do mentorado (não grava, não posta)', outro: 'Outro' };
const PASSOS = ['recebido', 'entender', 'contato', 'plano', 'devolutiva', 'acompanhar', 'encerrar'];
const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

async function carregar() {
  const rows = await api('tasks?select=id,data,updated_at&or=(id.like.caso:*,id.eq.insat:analise,id.eq.painel:producao)');
  const casos = rows.filter(r => r.id.startsWith('caso:')).map(r => ({ ...r.data, id: r.id.slice(5), _upd: r.updated_at }));
  const analise = rows.find(r => r.id === 'insat:analise');
  const prod = rows.find(r => r.id === 'painel:producao');
  return { casos, analise: analise && analise.data, prod: prod && prod.data };
}

async function ler(force) {
  const { casos, analise, prod } = await carregar();
  const validos = casos.filter(c => c.nome || c.motivo);
  if (!validos.length) { console.log('NADA_NOVO: nenhum caso registrado'); return; }
  const ultima = analise && analise.atualizadoEm;
  if (!force && ultima && !validos.some(c => (c.atualizadoEm || c._upd) > ultima)) { console.log('NADA_NOVO: nenhum caso mudou desde a última análise'); return; }
  const clientes = (prod && prod.clientes) || [];
  const cli = nome => { const k = norm(nome); return clientes.find(c => norm(c.n) === k) || null; };
  const itens = validos.map(c => {
    const k = cli(c.nome);
    return {
      id: c.id, mentorado: c.nome || '', aberto_em: (c.abertoEm || '').slice(0, 10), status: c.status || 'aberto', fechado_em: (c.fechadoEm || '').slice(0, 10) || undefined,
      gravidade: c.gravidade, motivo_categoria: CAT[c.categoria] || '', motivo: c.motivo || '', mentor: c.mentor || '',
      encaminhado_por: [c.encaminhou, c.papel && c.papel.toUpperCase()].filter(Boolean).join(' · '),
      passos_feitos: PASSOS.filter(p => (c.passos || {})[p]), atualizacoes: (c.log || []).map(x => `${x.em.slice(0, 10)}: ${x.txt}`),
      causa_raiz: c.raiz ? RAIZ[c.raiz] : undefined, licao: c.licao || undefined,
      producao: k ? { produto: k.p, etapa: k.e, prazo: k.z, prazo_vencido: !!(k.z && prod.base && k.z < prod.base), cs: k.cs, mentor: k.m, status: k.s } : undefined,
    };
  });
  console.log(`Você ajuda Cauê Thomaz, líder do setor Growth Ops da Core Studio (mentoria de crescimento no Instagram com roteiros de reels), a resolver casos de mentorados insatisfeitos e a evitar que se repitam. Os casos chegam do CS, do SDR ou do closer.

Hoje: ${new Date().toISOString().slice(0, 10)}.

O QUE FAZER
1. Para cada caso ABERTO: diga a raiz provável (não o sintoma; ex.: "o closer vendeu viral em 30 dias" em vez de "está sem views"), o próximo passo concreto do Cauê nesta semana e, quando o próximo passo for falar com alguém, uma mensagem curta pronta no tom dele (direto, acolhedor, sem se defender, sem prometer o que não depende dele).
2. Olhe TODOS os casos juntos (abertos e fechados) e aponte padrões: mentor que se repete, motivo que se repete, quem encaminha, fase da jornada (etapa/produto da produção), tempo até agir, casos do mesmo mentorado. Use números ("3 de 5 casos").
3. Recomende de 1 a 4 mudanças de processo para que o mesmo tipo de insatisfação não volte (quem precisa mudar o quê: closer, SDR, CS, mentor, edição, onboarding). Só recomende o que os casos sustentam; se houver poucos casos, diga que o padrão ainda é fraco.
Se faltar dado para julgar, diga qual. Nada de telefone, e-mail ou dado sensível no texto.

CASOS
${itens.map(i => JSON.stringify(i)).join('\n')}

Escreva SOMENTE JSON neste formato:
{"padroes":["frase com **negrito** no que importa"],"recomendacoes":["mudança de processo: quem faz o quê"],"casos":{"<id>":{"raiz":"raiz provável em 1 frase","proximo_passo":"ação concreta do Cauê","mensagem":"texto pronto (opcional)"}}}
Textos aceitam só **negrito**. Inclua em "casos" só os abertos.`);
}

async function gravar(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const str = (a, n) => Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, n) : [];
  const casos = {};
  for (const [id, v] of Object.entries(j.casos || {})) {
    if (!v || typeof v !== 'object') continue;
    casos[id] = { raiz: String(v.raiz || '').slice(0, 400), proximo_passo: String(v.proximo_passo || '').slice(0, 400), mensagem: String(v.mensagem || '').slice(0, 800) || undefined };
  }
  const st = (await api('settings?select=user_id&limit=1'))[0];
  const data = { atualizadoEm: new Date().toISOString(), padroes: str(j.padroes, 6), recomendacoes: str(j.recomendacoes, 4), casos };
  await api('tasks', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'insat:analise', user_id: ENV.USER_ID || (st && st.user_id), data, updated_at: data.atualizadoEm }) });
  console.log(`ANALISE_GRAVADA: ${Object.keys(casos).length} casos, ${data.padroes.length} padrões, ${data.recomendacoes.length} recomendações`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'ler') await ler(arg === '--todos');
  else if (cmd === 'gravar' && arg) await gravar(arg);
  else console.log('Uso: node scripts/insatisfacoes.mjs ler [--todos] | gravar <arquivo.json>');
} catch (e) { console.error('ERRO:', e.message); process.exit(1); }
