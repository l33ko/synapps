// SynApps — contrôle des règles du dépôt (sans navigateur)
// Lancé sur chaque pull request par .github/workflows/controles.yml, et utilisable en local :
//   node outils/controles.mjs
// Vérifie les règles du CLAUDE.md qui se vérifient en lisant les fichiers. Écrit regles.md et
// sort en erreur (code 1) si une règle n'est pas respectée.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const racine = process.cwd();
const ignores = new Set(['.git', 'node_modules', 'maquettes', 'outils', '.github', '.claude']);
const soucis = [];
const ok = [];

// ---------- Les pages : l'accueil et chaque dossier d'app ----------
const apps = readdirSync(racine).filter(d => !ignores.has(d) && !d.startsWith('.') &&
  statSync(join(racine, d)).isDirectory() && existsSync(join(racine, d, 'index.html')));
const pages = ['index.html', ...apps.map(a => `${a}/index.html`)];

for (const p of pages) {
  const html = readFileSync(join(racine, p), 'utf8');
  const nom = p === 'index.html' ? 'Accueil' : p.split('/')[0];
  const avant = soucis.length;
  const charset = html.indexOf('<meta charset="utf-8">');
  const signal = html.indexOf('SynApps — signalement des erreurs');
  const maj = html.indexOf('SynApps — nouvelle version disponible ?');
  const badge = html.indexOf('SynApps — badge « Version test »');

  if (signal < 0) soucis.push(`${nom} : script « signalement des erreurs » absent`);
  else if (charset < 0 || signal < charset || html.slice(charset, signal).includes('</script>'))
    soucis.push(`${nom} : le script « signalement des erreurs » doit être le premier script, juste après \`<meta charset="utf-8">\``);
  if (maj < 0) soucis.push(`${nom} : script « nouvelle version disponible ? » absent`);
  if (badge < 0) soucis.push(`${nom} : script du badge « Version test » absent`);
  else if (!/<script data-runtime>\s*\/\* SynApps — badge/.test(html))
    soucis.push(`${nom} : le script du badge doit porter \`data-runtime\` (sinon le bandeau « nouvelle version » s’affiche à tort)`);
  if (maj >= 0) {
    // tout script placé après la détection de nouvelle version doit porter data-runtime
    const apres = html.slice(html.indexOf('</script>', maj));
    for (const m of apres.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g))
      if (!/data-runtime/.test(m[1])) { soucis.push(`${nom} : un script placé après la détection de nouvelle version n’a pas \`data-runtime\``); break; }
  }
  // Supabase : la constante SB doit choisir entre production et test
  if (/qxwypwcxdhhtgmzaskzs\.supabase\.co/.test(html.replace(/\/\* SynApps — signalement[\s\S]*?<\/script>/, ''))
      && !/zlfgcfexvawijldgiqbu\.supabase\.co[\s\S]*SB|SB[\s\S]*zlfgcfexvawijldgiqbu\.supabase\.co/.test(html.replace(/\/\* SynApps — signalement[\s\S]*?<\/script>/, '')))
    soucis.push(`${nom} : la constante \`SB\` vise Synapps_public sans choisir Synapps_test hors production`);
  if (soucis.length === avant) ok.push(nom);
}

// ---------- Chaque app est surveillée ----------
const surv = readFileSync(join(racine, 'outils/surveillance.mjs'), 'utf8');
for (const a of apps) if (!surv.includes(`'/${a}/'`))
  soucis.push(`${a} : app absente de la liste \`PAGES\` de \`outils/surveillance.mjs\` (elle ne serait pas surveillée)`);

// ---------- Aucune clé secrète dans le dépôt ----------
const SECRETS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'clé secrète Supabase (sb_secret_…)'],
  [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'jeton JWT (clé service_role ?)'],
  [/xkeysib-[a-f0-9]{20,}|xsmtpsib-[a-f0-9]{20,}/, 'clé Brevo'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'],
];
function parcourir(dir) {
  for (const f of readdirSync(dir)) {
    if (f === '.git' || f === 'node_modules') continue;
    const chemin = join(dir, f), st = statSync(chemin);
    if (st.isDirectory()) parcourir(chemin);
    else if (st.size < 5e6 && /\.(html?|js|mjs|ts|json|sql|md|ya?ml|txt|css|toml|env)$/i.test(f)) {
      const t = readFileSync(chemin, 'utf8');
      for (const [re, quoi] of SECRETS) if (re.test(t)) soucis.push(`${chemin.slice(racine.length + 1)} : contient ce qui ressemble à une ${quoi}`);
    }
  }
}
parcourir(racine);

// ---------- Compte rendu ----------
const out = ['### Les règles du dépôt', ''];
if (soucis.length) out.push(...soucis.map(s => `- ❌ ${s}`), '');
out.push(`${soucis.length ? '' : '✅ '}${ok.length} page(s) conformes sur ${pages.length} : ${ok.join(', ') || '—'}. Aucune clé secrète trouvée${soucis.some(s => s.includes('ressemble')) ? ' … sauf ci-dessus' : ''}.`, '');
writeFileSync('regles.md', out.join('\n'));
console.log(out.join('\n'));
process.exit(soucis.length ? 1 : 0);
