#!/usr/bin/env node
// Atalho antigo: o mesmo que node scripts/publicar-mentorados.mjs followup <arquivo.json>
process.argv.splice(2, 0, 'followup');
await import('./publicar-mentorados.mjs');
