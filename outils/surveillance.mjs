// SynApps — surveillance de la production
// Lancé par GitHub Actions (.github/workflows/surveillance.yml) après chaque mise en ligne et chaque lundi matin.
// 1. Ouvre chaque page en production sur iPhone (moteur WebKit, celui de Safari), Android (Chromium) et
//    ordinateur (Chromium), et vérifie qu'elle fonctionne.
// 2. Lit les erreurs JavaScript remontées par les visiteurs (table « erreurs » de Synapps_public).
// Écrit le compte rendu dans rapport.md et le nombre de problèmes dans problemes.txt.
//
// Variables : BASE (adresse du site, par défaut la production), SUPABASE_SECRET_KEY (facultative,
// secret GitHub : sans elle, les erreurs des visiteurs ne sont pas lues), JOURS (période lue, 7 par défaut),
// MISE_EN_LIGNE=1 (après une fusion : seules les pages comptent ; les erreurs des visiteurs, qui peuvent
// dater d'avant la correction, sont pour le rapport du lundi),
// CONTROLE_PR=1 (contrôle d'une pull request sur une copie locale : pas d'erreurs de visiteurs, badge test attendu).

import { chromium, webkit, devices } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = (process.env.BASE || 'https://app.synapsium.com').replace(/\/$/, '');
const SB_URL = 'https://qxwypwcxdhhtgmzaskzs.supabase.co';   // Synapps_public
const KEY = process.env.SUPABASE_SECRET_KEY || '';
const JOURS = +process.env.JOURS || 7;
const PROD = /^https:\/\/app\.synapsium\.com$/.test(BASE);
const MISE_EN_LIGNE = process.env.MISE_EN_LIGNE === '1';
const CONTROLE_PR = process.env.CONTROLE_PR === '1';

const PAGES = [
  ['Accueil', '/'],
  ['Mon cahier du CP', '/cahier-du-cp/'],
  ['Synapse', '/synapse/'],
  ['Lego Builder', '/lego-builder/'],
  ['Pixel arts', '/pixel-arts/'],
  ['Rétro Console', '/retro-console/'],
  ['Mes recettes', '/recettes/'],
  ['Mon jardin', '/mon-jardin/'],
];
const APPAREILS = [
  ['iPhone', 'webkit', devices['iPhone 13']],
  ['Android', 'chromium', devices['Pixel 7']],
  ['ordinateur', 'chromium', { viewport: { width: 1280, height: 800 } }],
];
const MOBILES = ['iPhone', 'Android'];
// Bruits normaux : polices, réseau, Supabase sans compte connecté
const BRUIT = /Failed to load resource|net::ERR_|fonts\.(googleapis|gstatic)\.com|ERR_BLOCKED/i;

let problemes = 0;
const out = [];
const date = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' });

// ---------- 1. Les pages ----------
const lignes = [];
const navigateurs = { chromium: await chromium.launch() };
let noteWebkit = '';
try { navigateurs.webkit = await webkit.launch(); }
catch (e) { navigateurs.webkit = navigateurs.chromium; noteWebkit = '_Moteur WebKit indisponible : l’iPhone a été simulé avec Chromium._'; }
for (const [nom, chemin] of PAGES) {
  const soucis = [];
  for (const [appareil, moteur, options] of APPAREILS) {
    const ctx = await navigateurs[moteur].newContext(options);
    await ctx.route('**/rest/v1/erreurs', r => r.fulfill({ status: 201, body: '', headers: { 'Access-Control-Allow-Origin': '*' } }));   // le robot ne se signale pas lui-même
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !BRUIT.test(m.text())) erreurs.push(m.text()); });
    try {
      const rep = await page.goto(BASE + chemin, { waitUntil: 'load', timeout: 45000 });
      if (!rep || rep.status() >= 400) soucis.push(`${appareil} : réponse HTTP ${rep ? rep.status() : '?'}`);
      await page.waitForTimeout(5000);   // laisse passer la détection de nouvelle version (2,5 s)
      const etat = await page.evaluate(() => ({
        maj: !!document.getElementById('synappsMaj'),
        test: !!document.getElementById('synappsTest'),
        deborde: document.documentElement.scrollWidth > innerWidth + 1,
        vide: document.body.innerText.trim().length < 20,
      }));
      if (etat.maj) soucis.push(`${appareil} : le bandeau « Une nouvelle version est disponible » s’affiche alors que rien n’a changé`);
      if (etat.test && PROD) soucis.push(`${appareil} : le badge « Version test » s’affiche en production`);
      if (!etat.test && CONTROLE_PR) soucis.push(`${appareil} : le badge « Version test » manque (script du badge absent ou cassé)`);
      if (etat.deborde && MOBILES.includes(appareil)) soucis.push(`${appareil} : la page déborde en largeur (défilement horizontal)`);
      if (etat.vide) soucis.push(`${appareil} : la page s’affiche vide`);
      for (const e of [...new Set(erreurs)].slice(0, 4)) soucis.push(`${appareil} : erreur JavaScript — \`${e.replace(/`/g, "'").slice(0, 200)}\``);
    } catch (e) {
      soucis.push(`${appareil} : la page ne se charge pas (${String(e.message).split('\n')[0].slice(0, 150)})`);
    }
    await ctx.close();
  }
  problemes += soucis.length;
  lignes.push(soucis.length
    ? `| ⚠️ | **${nom}** | ${soucis.join('<br>')} |`
    : `| ✅ | ${nom} | iPhone, Android et ordinateur OK |`);
}
for (const n of new Set(Object.values(navigateurs))) await n.close();

// ---------- 2. Les erreurs des visiteurs ----------
const err = [];
if (CONTROLE_PR) {
  // pas concerné : la copie locale d'une branche n'a pas de visiteurs
} else if (MISE_EN_LIGNE) {
  err.push('_Lues dans le rapport du lundi (après une mise en ligne, seules les pages sont vérifiées)._');
} else if (!KEY) {
  err.push('_Non lues : le secret GitHub `SUPABASE_SECRET_KEY` n’est pas encore configuré._');
} else {
  const depuis = new Date(Date.now() - JOURS * 864e5).toISOString();
  try {
    const r = await fetch(`${SB_URL}/rest/v1/erreurs?select=app,message,page,navigateur,created_at&created_at=gte.${depuis}&order=created_at.desc&limit=1000`,
      { headers: { apikey: KEY } });
    if (!r.ok) {
      err.push(`_Lecture impossible (HTTP ${r.status}) : la table \`erreurs\` existe-t-elle dans Synapps_public ? (script \`supabase-erreurs.sql\`)_`);
      problemes++;
    } else {
      const rows = await r.json();
      if (!rows.length) err.push(`Aucune erreur remontée par les visiteurs ces ${JOURS} derniers jours. ✅`);
      else {
        const appareil = ua => /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'autre';
        const g = new Map();
        for (const x of rows) {
          const k = x.app + '\u0000' + x.message;
          const v = g.get(k) || { app: x.app, message: x.message, n: 0, der: x.created_at, app2: new Set() };
          v.n++; v.app2.add(appareil(x.navigateur || '')); g.set(k, v);
        }
        const liste = [...g.values()].sort((a, b) => b.n - a.n);
        problemes += liste.length;
        err.push(`**${rows.length} erreur(s)** remontée(s) ces ${JOURS} derniers jours, ${liste.length} différente(s) :`, '',
          '| App | Erreur | Fois | Appareils | Dernière |', '|---|---|---|---|---|',
          ...liste.slice(0, 25).map(v => `| ${v.app} | \`${String(v.message).replace(/[`|]/g, "'").slice(0, 160)}\` | ${v.n} | ${[...v.app2].join(', ')} | ${new Date(v.der).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })} |`));
        if (liste.length > 25) err.push('', `_… et ${liste.length - 25} autre(s), à voir dans Supabase (table \`erreurs\`)._`);
        if (rows.length >= 1000) err.push('', '_Liste coupée à 1000 erreurs : il y en a peut-être davantage (table `erreurs` dans Supabase)._');
      }
      // ménage : les erreurs de plus de 90 jours sont effacées
      const vieux = new Date(Date.now() - 90 * 864e5).toISOString();
      const menage = await fetch(`${SB_URL}/rest/v1/erreurs?created_at=lt.${vieux}`, { method: 'DELETE', headers: { apikey: KEY, Prefer: 'return=minimal' } }).catch(e => ({ ok: false, status: e.message }));
      if (!menage.ok) { err.push('', `_Ménage des erreurs de plus de 90 jours impossible (${menage.status})._`); problemes++; }
    }
  } catch (e) {
    err.push(`_Lecture impossible : ${String(e.message).slice(0, 150)}_`);
    problemes++;
  }
}

// ---------- Compte rendu ----------
out.push(`## ${problemes ? `⚠️ ${problemes} point(s) à regarder` : '✅ Tout va bien'}`, '',
  `_${date} · ${process.env.RAISON || 'vérification manuelle'} · ${BASE}_`, '',
  '### Les pages', '', '| | Page | Résultat |', '|---|---|---|', ...lignes, '', ...(noteWebkit ? [noteWebkit, ''] : []),
  ...(CONTROLE_PR ? [] : ['### Les erreurs des visiteurs', '', ...err, '']));
if (problemes) out.push('> Pour corriger : ouvre une session Claude sur le dépôt et colle ce compte rendu.');

writeFileSync('rapport.md', out.join('\n'));
writeFileSync('problemes.txt', String(problemes));
console.log(out.join('\n'));
process.exit(problemes ? 1 : 0);
