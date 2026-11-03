// @ts-nocheck
// =============================================================
//  SynApps · Recettes — Edge Function « recherche-recettes »
//  Supabase > Edge Functions > Deploy a new function > Via Editor
//  Nom : recherche-recettes · coller tout ce fichier · Deploy.
//  (Laisser « Verify JWT » activé : seules les personnes connectées peuvent l'utiliser.)
//  Secret à ajouter (Edge Functions > Secrets) : BRAVE_API_KEY = la clé de l'API Brave Search
//  (https://api-dashboard.search.brave.com, offre « Search »).
//
//  Reçoit { q, page? }, cherche sur quelques sites de recettes avec l'API Brave Search,
//  lit la fiche schema.org « Recipe » de chaque page trouvée (même extraction que
//  « import-recette ») et renvoie { recettes: [...], suite }, sans rien enregistrer :
//  c'est l'app qui ajoute la fiche choisie dans la famille.
//  En cas de souci : { error, code } avec code = 'cle' | 'quota' | 'service' | 'requete'.
// =============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

// Sites interrogés, nom affiché et forme de l'adresse d'une fiche recette (les autres pages sont ignorées)
const SITES = [
  ['marmiton.org', 'Marmiton', /\/recettes\/recette_[^/]+\.aspx$/i],
  ['750g.com', '750g', /\/[^/]+-r\d+\.htm$/i],
  ['cuisineaz.com', 'Cuisine AZ', /\/recettes\/[^/]+-\d+\.aspx$/i],
  ['journaldesfemmes.fr', 'Journal des Femmes Cuisine', /\/recette\/\d+-[^/]+$/i],
  ['ricardocuisine.com', 'Ricardo', /\/recettes\/\d+-[^/]+\/?$/i],
  ['cuisine-libre.org', 'Cuisine libre', /^\/[a-z0-9][a-z0-9-]+\/?$/i],
];
const FILTRE = SITES.map(([d]) => 'site:' + d).join(' OR ');
const PAS_FICHE = /\/(recherche|search|tag|tags|categorie|category|auteur|author|rubrique|selection|dossier|page)s?\b|[?&]/i;
const MAX_PAGES = 10;

function siteDe(u: string) {
  try {
    const url = new URL(u), h = url.hostname.replace(/^www\./, '');
    const s = SITES.find(([d]) => h === d || h.endsWith('.' + d));
    if (!s || !(s[2] as RegExp).test(url.pathname) || PAS_FICHE.test(url.pathname + url.search)) return null;
    return s[1] as string;
  } catch { return null; }
}

async function lirePage(url: string) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
      },
    });
    if (!r.ok) return null;
    // On lit la page jusqu'à la fiche « Recipe » (elle est le plus souvent dans l'en-tête), 4 Mo au plus
    return (await r.text()).slice(0, 4_000_000);
  } catch { return null; }
}

// Note et avis (aggregateRating) : absents de l'import, utiles pour trier
function noteDe(html: string) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    const txt = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try { data = JSON.parse(txt); } catch { try { data = JSON.parse(txt.replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const r = findRecipe(data);
    if (!r) continue;
    const a = arr(r.aggregateRating)[0] || {};
    let note = parseFloat(String(a.ratingValue ?? '').replace(',', '.'));
    const best = parseFloat(String(a.bestRating ?? '5').replace(',', '.')) || 5;
    if (!(note > 0)) note = NaN; else if (best !== 5) note = note * 5 / best;
    const nb = parseInt(String(a.ratingCount ?? a.reviewCount ?? '').replace(/\D/g, ''), 10);
    const rev = arr(r.review).find(x => x && (x.reviewBody || x.description));
    const avis = rev ? clean(rev.reviewBody || rev.description) : '';
    return {
      note: Number.isFinite(note) ? Math.round(Math.min(5, note) * 10) / 10 : null,
      nb_avis: Number.isFinite(note) && nb > 0 ? nb : (Number.isFinite(note) ? null : 0),
      avis: avis.length > 4 ? (avis.length > 160 ? avis.slice(0, 157).trimEnd() + '…' : avis) : '',
    };
  }
  return { note: null, nb_avis: 0, avis: '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Méthode non permise', code: 'requete' });

  let q = '', page = 0;
  try {
    const b = await req.json();
    q = String(b.q || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    page = Math.max(0, Math.min(9, parseInt(b.page, 10) || 0));
  } catch {}
  if (q.length < 2) return reply({ error: 'Tape au moins 3 lettres pour chercher sur le web.', code: 'requete' });

  const KEY = Deno.env.get('BRAVE_API_KEY');
  if (!KEY) return reply({ error: 'La recherche sur le web n’est pas encore configurée (clé BRAVE_API_KEY à ajouter dans Supabase).', code: 'cle' });

  // 1. Recherche Brave, limitée aux sites de recettes
  let brave;
  try {
    const u = new URL('https://api.search.brave.com/res/v1/web/search');
    u.search = new URLSearchParams({ q: `${q} ${FILTRE}`, country: 'fr', search_lang: 'fr', count: '20',
      offset: String(page), safesearch: 'strict', result_filter: 'web' }).toString();
    const r = await fetch(u.href, { signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': KEY } });
    if (r.status === 429) {
      // X-RateLimit-Remaining : « par seconde, par mois » (ex. « 0, 1500 ») : on distingue les deux cas
      const reste = (r.headers.get('x-ratelimit-remaining') || '').split(',').map(s => parseInt(s, 10));
      return reply(reste.length > 1 && reste[reste.length - 1] === 0
        ? { error: 'Le quota de recherches sur le web est épuisé pour ce mois-ci. Le carnet, lui, marche toujours.', code: 'quota' }
        : { error: 'Trop de recherches d’un coup : réessaie dans quelques secondes.', code: 'quota' });
    }
    if (r.status === 401 || r.status === 403 || r.status === 422 && /token|subscription/i.test(await r.clone().text()))
      return reply({ error: 'La clé de recherche sur le web est refusée (BRAVE_API_KEY à vérifier dans Supabase).', code: 'cle' });
    if (!r.ok) return reply({ error: 'Le service de recherche ne répond pas. Réessaie plus tard.', code: 'service' });
    brave = await r.json();
  } catch {
    return reply({ error: 'Le service de recherche ne répond pas. Réessaie plus tard.', code: 'service' });
  }

  // 2. On garde les fiches recettes (sans doublon), au plus 10
  const vus = new Set(), cand = [];
  for (const w of brave?.web?.results || []) {
    const url = String(w?.url || '').split('#')[0];
    const site = siteDe(url);
    if (!site) continue;
    const cle = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    cand.push({ url, site, vignette: w?.thumbnail?.src || w?.thumbnail?.original || null });
    if (cand.length >= MAX_PAGES) break;
  }

  // 3. Lecture des fiches en parallèle (6 s chacune au plus)
  const lues = await Promise.all(cand.map(async c => {
    const html = await lirePage(c.url);
    if (!html) return null;
    const { recette } = extractRecipe(html, c.url) as any;
    if (!recette || (!recette.ingredients && !recette.etapes)) return null;
    const n = noteDe(html);
    const temps = (recette.temps_prep || 0) + (recette.temps_cuisson || 0) || null;
    return {
      titre: recette.titre, site: c.site, url: c.url,
      photo: recette.photo || (/^https:\/\//.test(c.vignette || '') ? c.vignette : null),
      note: n.note, nb_avis: n.nb_avis, avis: n.avis, temps,
      temps_prep: recette.temps_prep, temps_cuisson: recette.temps_cuisson, portions: recette.portions,
      ingredients: recette.ingredients, etapes: recette.etapes, categorie: recette.categorie, tags: recette.tags,
    };
  }));
  const recettes = lues.filter(Boolean);
  const suite = !!brave?.query?.more_results_available && page < 9;
  return reply({ recettes, suite, page });
});

// ---------- Extraction (copie de import-recette.ts : garder les deux identiques) ----------
// Extraction d'une recette depuis le HTML d'une page.
// La plupart des sites de cuisine publient la recette au format schema.org « Recipe »
// dans une balise <script type="application/ld+json"> (c'est ce que lit Google).

const CATS = [
  ['Dessert', ['dessert', 'gateau', 'patisserie', 'cake', 'biscuit', 'cookie', 'confiserie', 'entremets']],
  ['Apéro', ['apero', 'aperitif', 'amuse', 'tapas', 'cocktail dinatoire']],
  ['Petit-déj', ['petit-dej', 'petit dej', 'petit-dejeuner', 'petit dejeuner', 'breakfast', 'brunch', 'gouter']],
  ['Boisson', ['boisson', 'drink', 'smoothie', 'jus ', 'cocktail']],
  ['Sauce', ['sauce', 'condiment', 'vinaigrette', 'marinade']],
  ['Pain & pâte', ['pain', 'brioche', 'pate a', 'bread', 'viennoiserie']],
  ['Entrée', ['entree', 'starter', 'appetizer', 'salade']],
  ['Accompagnement', ['accompagnement', 'side dish', 'garniture']],
  ['Plat', ['plat', 'main', 'dinner', 'lunch', 'diner', 'dejeuner']],
];

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“',
  rdquo: '”', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', deg: '°', times: '×', middot: '·',
  euro: '€', frac12: '½', frac14: '¼', frac34: '¾', oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ', szlig: 'ß' };
const MARKS = { grave: '̀', acute: '́', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧', ring: '̊' };

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z])(grave|acute|circ|tilde|uml|cedil|ring);/g, (_, l, m) => (l + MARKS[m]).normalize('NFC'))
    .replace(/&([a-zA-Z]+[0-9]*);/g, (m, e) => NAMED[e] ?? m);
}
const clean = s => decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// "PT1H30M" → 90 ; "P0DT0H20M" → 20
function isoMinutes(d) {
  if (!d) return null;
  if (typeof d === 'number') return Math.round(d);
  const m = String(d).match(/P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?/i);
  if (!m || !m[0] || m[0] === 'P') return /^\d+$/.test(d) ? +d : null;
  const t = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return t > 0 ? Math.round(t) : null;
}

const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
const isRecipe = o => o && typeof o === 'object' && arr(o['@type']).some(t => /recipe$/i.test(String(t)));

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (isRecipe(node)) return node;
  for (const v of Array.isArray(node) ? node : [node['@graph'], node.mainEntity, node.mainEntityOfPage, node.itemListElement]) {
    for (const x of arr(v)) { const r = findRecipe(x, depth + 1); if (r) return r; }
  }
  return null;
}

function steps(ins) {
  const out = [];
  const walk = x => {
    if (!x) return;
    if (typeof x === 'string') {
      // Certains sites mettent toutes les étapes dans un seul texte
      x.split(/\n+|<br\s*\/?>|<\/p>|<\/li>/i).map(clean).filter(Boolean).forEach(s => out.push(s));
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (x.itemListElement) {
      if (x.name && arr(x.itemListElement).length) out.push(`— ${clean(x.name)} —`);
      walk(x.itemListElement);
    } else walk(x.text || x.name || x.description);
  };
  walk(ins);
  return out.map(s => s.replace(/^(étape|etape|step)\s*\d+\s*[:.)-]?\s*/i, '').replace(/^\d+[.)]\s+/, '')).filter(Boolean);
}

function image(img) {
  for (const x of arr(img)) {
    const u = typeof x === 'string' ? x : x?.url || x?.contentUrl || x?.['@id'];
    if (u && /^https?:\/\//.test(u)) return u;
  }
  return null;
}

function portions(y) {
  for (const x of arr(y)) { const m = String(x).match(/\d+/); if (m && +m[0] > 0 && +m[0] < 100) return +m[0]; }
  return null;
}

// On regarde d'abord la catégorie donnée par le site, puis le nom de la recette.
function guessCategory(...hints) {
  for (const hint of hints) {
    const h = norm(arr(hint).filter(Boolean).join(' | '));
    if (!h) continue;
    for (const [cat, words] of CATS) if (words.some(w => h.includes(norm(w)))) return cat;
  }
  return 'Autre';
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] || '') : '';
}

// Renvoie { recette } ou { partiel } si aucune recette structurée n'est trouvée.
function extractRecipe(html, url) {
  let r = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let txt = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    let data;
    try { data = JSON.parse(txt); }
    catch { try { data = JSON.parse(txt.replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    r = findRecipe(data);
    if (r) break;
  }

  const ogTitle = meta(html, 'og:title') || clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const ogImage = meta(html, 'og:image');
  if (!r) return { partiel: { titre: ogTitle || '', source: url, photo: /^https?:/.test(ogImage) ? ogImage : null } };

  const prep = isoMinutes(r.prepTime);
  let cook = isoMinutes(r.cookTime);
  const total = isoMinutes(r.totalTime);
  if (!prep && !cook && total) cook = total;

  const keywords = arr(r.keywords).flatMap(k => String(k).split(','))
    .map(clean).filter(k => k && k.length <= 25).slice(0, 6);

  return {
    recette: {
      titre: clean(r.name) || ogTitle || 'Recette sans nom',
      categorie: guessCategory(arr(r.recipeCategory).map(String), r.name),
      portions: portions(r.recipeYield) || 4,
      temps_prep: prep,
      temps_cuisson: cook,
      ingredients: arr(r.recipeIngredient || r.ingredients).map(clean).filter(Boolean).join('\n'),
      etapes: steps(r.recipeInstructions).join('\n'),
      notes: '',
      tags: keywords,
      source: url,
      photo: image(r.image) || (/^https?:/.test(ogImage) ? ogImage : null),
      favori: false,
    },
  };
}
