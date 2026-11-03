// @ts-nocheck
// =============================================================
//  SynApps · Pixel arts — Edge Function « genere-pixel »
//  Supabase > Edge Functions > Deploy a new function > Via Editor
//  Nom : genere-pixel · coller tout ce fichier · Deploy.
//  ⚠️ Désactiver « Verify JWT » (Function > Settings) : Pixel arts s'utilise sans compte.
//
//  Secrets à créer (Edge Functions > Secrets) :
//    ANTHROPIC_API_KEY      clé API Claude (platform.claude.com > API keys). Obligatoire.
//    ANTHROPIC_MODEL        facultatif, modèle utilisé (par défaut claude-sonnet-5-5 ; claude-haiku-5-5 est environ 20 fois moins cher mais dessine moins bien).
//    NB_IDEES               facultatif, nombre de dessins par recherche, de 1 à 6 (par défaut 3). Le coût est proportionnel.
//    ANTHROPIC_EFFORT       facultatif, réflexion avant de dessiner : low, medium (par défaut) ou high.
//    LIMITE_JOUR_APPAREIL   facultatif, recherches par jour et par appareil (par défaut 20).
//    LIMITE_JOUR_TOTAL      facultatif, recherches par jour pour tout le monde (par défaut 100).
//  SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
//  Table nécessaire : pixel-arts/supabase.sql (compteur des recherches, pour les plafonds).
//
//  Reçoit { mot } et renvoie :
//    { idees: [{ titre, grille: ["..KK..", ...] }, ...] }   NB_IDEES idées au plus
//    { refus: "personnage" | "inadapte", message, suggestions: [..] }
//    { erreur: "quota" | "mot" | "service", message }
//  Seul le compteur des recherches est enregistré (empreinte de l'appareil et mot tapé),
//  effacé au bout de 2 jours. Chaque recherche est réservée AVANT d'appeler Claude
//  (fonction SQL pixel_reserver), pour que les plafonds tiennent même avec des requêtes simultanées.
//  Conseil : donner à la clé Claude une limite de dépense mensuelle (Console Claude > Limits).
// =============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const env = (k: string, d = '') => Deno.env.get(k) || d;
const MODELE = env('ANTHROPIC_MODEL', 'claude-sonnet-5-5');
const nombre = (k: string, d: number) => { const n = parseInt(env(k), 10); return Number.isFinite(n) && n > 0 ? n : d; };
const LIM_APPAREIL = nombre('LIMITE_JOUR_APPAREIL', 20);
const LIM_TOTAL = nombre('LIMITE_JOUR_TOTAL', 100);   // plafonné à 1000 côté SQL quoi qu'il arrive
const NB_IDEES = Math.min(6, nombre('NB_IDEES', 3));
const SB_URL = env('SUPABASE_URL');
const SB_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

// Couleurs de perles de l'app (mêmes lettres que la constante PAL de pixel-arts/index.html)
const PALETTE = {
  K: 'noir', W: 'blanc', S: 'gris', s: 'gris clair', R: 'rouge', O: 'orange', Y: 'jaune',
  G: 'vert', g: 'vert clair', B: 'bleu', b: 'bleu ciel', V: 'violet', P: 'rose', p: 'rose pâle',
  N: 'marron', n: 'beige',
};
const AUTORISES = new Set([...Object.keys(PALETTE), '.']);

// Angles différents, un par appel (les NB_IDEES premiers), pour que les idées ne se ressemblent pas
const ANGLES = [
  'sous l’angle qui le fait reconnaître au premier coup d’œil (souvent de profil, en entier) : son détail distinctif (corne, trompe, queue, roues…) doit être bien visible',
  'vue de face, version mignonne avec de grands yeux, sans perdre son détail distinctif',
  'très simple, peu de couleurs, idéal pour débuter (16 × 16 au plus)',
  'de profil, en mouvement',
  'version bébé ou miniature, très ronde',
  'avec un petit accessoire ou un élément de décor simple',
  'avec des couleurs inattendues et joyeuses',
];

const SYSTEME = `Tu dessines des modèles de pixel art pour des enfants de 5 à 12 ans, qui les recopient sur papier quadrillé ou en perles à repasser.

Règles de sécurité (prioritaires) :
- Si le mot désigne quelque chose d'inadapté à des enfants (arme, violence, sang, mort, drogue, alcool, tabac, sexe, nudité, insulte, haine, horreur choquante, personne réelle, marque ou logo), réponds {"refus":"inadapte"}.
- Si le mot désigne un personnage protégé (dessin animé, jeu vidéo, film, BD, mascotte : Pikachu, Mario, Elsa, Spider-Man…), ne le dessine pas, même approximativement, et réponds {"refus":"personnage","suggestions":["…","…","…"]} avec 3 idées de sujets génériques proches (ex. pour Pikachu : "souris jaune", "éclair", "hamster").
- Sinon, dessine une création originale.

Format du dessin :
- Une grille rectangulaire de 14 à 26 colonnes et 14 à 24 lignes, toutes les lignes de même longueur (un sujet de profil peut être plus large que haut).
- Chaque caractère est une case : "." = case vide, ou une lettre de couleur parmi : ${Object.entries(PALETTE).map(([k, v]) => `${k}=${v}`).join(', ')}.
- Contour noir (K) autour du sujet, formes lisibles et pleines, sujet centré, pas de fond (cases vides autour).
- Pas de texte ni de lettres dessinées.

Méthode : choisis d'abord la silhouette la plus reconnaissable du sujet (ce qui le distingue : oreilles pointues et queue touffue du renard, trompe de l'éléphant…), place-la sur la grille, ajoute 2 ou 3 détails expressifs (yeux, museau, ombre d'une teinte plus foncée), puis vérifie qu'un enfant reconnaîtrait le sujet sans lire son nom.

Exemples de modèles réussis, dans le style attendu (lignes séparées par des retours à la ligne) :

Licorne :\n..................KK....
.................KYYK...
................KYOK....
.........KKKK..KYYK.....
........KPPPPKKOYK......
.......KPPPPWWWKKK......
......KOOPPWWWWWWWK.....
......KOOOKWWWWWWWWK....
.....KYYYKWWWWWWWWWWK...
.....KYYYKWWWbKWWWWWWK..
.....KgggKWWWKKWWWWWWWK.
.....KgggKWWWKKWWWWWWWWK
.....KgggKbWWWWppWWWWKWK
....KBBBBKbWWWWWWWWWWWWK
....KBBBKKbbWWWWWWWWWWK.
....KVVVKKKbbbWWWWWWKK..
...KVVVKWWWWbbKKKKKK....
.KKKVVKWWWWWWWWWWK......
KPPKKKWWWWWWWWWWWWK.....
KOOOKWWWWWWWWWWWWWK.....
KYYKKbWWWWWWWWWWWbK.....
KggKKbbWWWWWWWWWbbK.....
.KBBKKbbbbbbbbbbbK......
..KVK.KWWK...KWWK.......
...K..KWbK...KWbK.......
......KppK...KppK.......
.......KK.....KK........

Chat :\n.KK..........KK.
.KOK........KOK.
.KOOK......KOOK.
.KOPOKKKKKKOPOK.
.KOOOOOOOOOOOOK.
KOOOOOOOOOOOOOOK
KOOOKKOOOOKKOOOK
KOOOKWOOOOKWOOOK
KOOOOOOOOOOOOOOK
KPPOOOOPPOOOOPPK
KOOOOWWWWWWOOOOK
.KOOOWKWWKWOOOK.
..KOOOWWWWOOOK..
...KKOOOOOOKK...
.....KKKKKK.....

Saint-Bernard :\n......KKKKKK......
....KKNNWWNNKK....
...KNNNNWWNNNNK...
..KNNNNNWWNNNNNK..
.KKKNNNNWWNNNNKKK.
KNNKNNNNWWNNNNKNNK
KNNKNWKNWWNWKNKNNK
KNNKNKKNWWNKKNKNNK
KNNKNNWWWWWWNNKNNK
KNNKWWWWWWWWWWKNNK
KNNKWWWKKKKWWWKNNK
KNNKWWWWKKWWWWKNNK
.KKKWWWWKKWWWWKKK.
...KWWKKWWKKWWK...
...KWWWKPPKWWWK...
....KWWKPPKWWK....
.....KKKKKKKK.....

Réponds uniquement avec un objet JSON, sans texte autour :
{"titre":"2 à 4 mots en français","grille":["....KKKK....", "..."]}`;

// Empreinte de l'appareil : hachage de l'adresse IP avec un sel secret (dérivé de la clé
// service_role, jamais publiée) qui change chaque jour : impossible de remonter à l'adresse.
async function hacher(t: string) {
  const jour = new Date().toISOString().slice(0, 10);
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SB_KEY}|${jour}|${t}`));
  return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Réserve une recherche (comptage + ajout dans la même transaction, verrouillée).
// Renvoie true si c'est autorisé, false si un plafond est atteint, null si le comptage a échoué.
async function reserver(appareil: string, mot: string) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/pixel_reserver`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_appareil: appareil, p_mot: mot.slice(0, 40), p_lim_appareil: LIM_APPAREIL, p_lim_total: LIM_TOTAL }),
    });
    if (!r.ok) return null;
    const v = await r.json();
    return v === true ? true : v === false ? false : null;
  } catch { return null; }
}

function lireJSON(t: string) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

// Vérifie et nettoie une grille renvoyée par le modèle
function nettoyer(g: unknown) {
  if (!Array.isArray(g)) return null;
  let rows = g.map(r => String(r ?? '').replace(/\s/g, '')).filter(r => r.length);
  if (rows.length < 8 || rows.length > 32) return null;
  const w = Math.max(...rows.map(r => r.length));
  if (w < 8 || w > 32) return null;
  rows = rows.map(r => [...r.padEnd(w, '.')].map(c => (AUTORISES.has(c) ? c : '.')).join(''));
  const pleines = rows.join('').replace(/\./g, '').length;
  if (pleines < 25) return null;
  return rows;
}

async function demander(mot: string, angle: string) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: {
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELE,
      // Les modèles 5.5 réfléchissent avant de répondre (réflexion adaptative), et cette réflexion
      // compte dans max_tokens : il faut donc de la marge, et un effort bas pour rester rapide.
      max_tokens: 16000,
      output_config: { effort: env('ANTHROPIC_EFFORT', 'medium') },
      system: SYSTEME,
      messages: [{ role: 'user', content: `Sujet demandé par l'enfant : « ${mot} ».\nStyle de cette version : ${angle}.` }],
    }),
  });
  if (!r.ok) { console.log('anthropic', r.status, (await r.text()).slice(0, 300)); throw new Error('anthropic ' + r.status); }
  const data = await r.json();
  const texte = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  const json = lireJSON(texte);
  if (!json) console.log('réponse illisible', data.stop_reason, texte.slice(0, 200));   // visible dans Logs de la fonction
  return json;
}

// Un dessin : demande + vérification de la grille ; une seconde chance s'il est raté et qu'il reste du temps
async function dessiner(mot: string, angle: string) {
  const t0 = Date.now();
  for (let essai = 0; essai < 2; essai++) {
    try {
      const r = await demander(mot, angle);
      if (r && r.refus) return r;
      const grille = r && nettoyer(r.grille);
      if (grille) return { titre: String(r.titre || mot).slice(0, 40), grille };
      console.log('dessin rejeté', angle.slice(0, 30), r ? JSON.stringify(r).slice(0, 200) : 'vide');
    } catch (e) { console.log('appel en échec', angle.slice(0, 30), String(e)); }
    if (Date.now() - t0 > 50000) break;                   // pas le temps d'une seconde chance
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ erreur: 'service', message: 'Méthode non permise' }, 405);
  if (!env('ANTHROPIC_API_KEY')) return reply({ erreur: 'service', message: 'La clé Claude n’est pas encore installée.' });

  let mot = '';
  try { mot = String((await req.json()).mot || '').trim().replace(/\s+/g, ' '); } catch { /* vide */ }
  if (!mot || mot.length > 40 || !/^[\p{L}\p{N}' -]+$/u.test(mot))
    return reply({ erreur: 'mot', message: 'Écris un mot simple, sans signes bizarres.' });

  // Plafonds : par appareil et pour tout le monde. Sans comptage possible, on n'appelle pas Claude.
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnu';
  if (!SB_URL || !SB_KEY) return reply({ erreur: 'service', message: 'Le service n’est pas prêt.' });
  const ok = await reserver(await hacher(ip), mot);
  if (ok === false) return reply({ erreur: 'quota', message: 'Assez de dessins inventés pour aujourd’hui ! Reviens demain.' });
  if (ok !== true) return reply({ erreur: 'service', message: 'Le service n’est pas prêt.' });

  // Un appel par idée, en parallèle : plus rapide et plus varié qu'un seul long appel
  const resultats = await Promise.allSettled(ANGLES.slice(0, NB_IDEES).map(a => dessiner(mot, a)));
  const reponses = resultats.filter(r => r.status === 'fulfilled' && r.value).map((r: any) => r.value);
  if (!reponses.length) return reply({ erreur: 'service', message: 'Le dessinateur ne répond pas. Réessaie dans un moment.' });

  // Un seul refus suffit (prudence : public d'enfants)
  const refus = reponses.find(r => r.refus);
  if (refus) {
    return reply({
      refus: refus.refus === 'personnage' ? 'personnage' : 'inadapte',
      suggestions: Array.isArray(refus.suggestions) ? refus.suggestions.slice(0, 3).map(String) : [],
    });
  }

  const idees = reponses.filter(r => r.grille);
  if (!idees.length) return reply({ erreur: 'service', message: 'Je n’ai pas réussi à dessiner ça. Essaie un autre mot.' });
  return reply({ idees });
});
