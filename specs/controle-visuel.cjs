/**
 * Blason — controle visuel du Royaume.
 *
 * Pilote un vrai Chromium par le protocole WebDriver (simple HTTP, aucune
 * dependance a installer) : ouverture de la page, session partagee avec le
 * React, deplacement jusqu'a un batiment qui a du travail en attente,
 * ouverture d'une seance, reponse, verification de la correction.
 *
 * AVERTISSEMENT ASSUME : c'est du headless. Ça attrape les erreurs grossieres
 * (exception JS, page blanche, element detruit, texte manquant) mais ça ne
 * remplace pas l'ouverture dans un vrai navigateur, a l'oeil.
 *
 * Prerequis : chromedriver ecoutant sur 9515.
 *   /snap/bin/chromium.chromedriver --port=9515 &
 */
const DRIVER = 'http://127.0.0.1:9515'
const SITE = 'http://localhost:8088'
const fs = require('node:fs')

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const HAUT = '', BAS = '', GAUCHE = '', DROITE = '', ENTREE = ''

// Le helper injecte dans chaque script evalue : lire un texte sans exploser
// si l'element a disparu. Un controle qui plante sur son propre outillage
// ne dit rien sur le produit.
const AIDE = `
  function T(i,n){var e=document.getElementById(i);var t=e?(e.textContent||''):'';return n?t.slice(0,n):t;}
`

async function wd(methode, chemin, corps) {
  const r = await fetch(DRIVER + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 240))
  return j.value
}

let sid = null
const S = (p) => '/session/' + sid + p
const evaluer = (script, args) => wd('POST', S('/execute/sync'), { script: AIDE + script, args: args || [] })
const captures = []

async function toucher(touche, n) {
  for (let i = 0; i < (n || 1); i++) {
    await wd('POST', S('/actions'), {
      actions: [{
        type: 'key', id: 'clavier', actions: [
          { type: 'keyDown', value: touche }, { type: 'pause', duration: 120 },
          { type: 'keyUp', value: touche }, { type: 'pause', duration: 110 },
        ],
      }],
    })
  }
}

async function shot(nom) {
  const b64 = await wd('GET', S('/screenshot'))
  const f = '/tmp/royaume-' + nom + '.png'
  fs.writeFileSync(f, Buffer.from(b64, 'base64'))
  captures.push(f)
}

const bloc = (titre) => console.log('\n── ' + titre)
const ligne = (k, v) => console.log('   ' + String(k).padEnd(18), v)

async function main() {
  // Les identifiants viennent de l'environnement, JAMAIS du code (13/08/2026).
  // Ce compte existe sur un site public : ecrire son mot de passe dans un
  // depot ouvert reviendrait a le donner.
  //   BLASON_TEST_EMAIL=... BLASON_TEST_MDP=... node specs/controle-visuel.cjs
  const email = process.env.BLASON_TEST_EMAIL
  const mdp = process.env.BLASON_TEST_MDP
  if (!email || !mdp) {
    throw new Error(
      'Renseigne BLASON_TEST_EMAIL et BLASON_TEST_MDP dans l environnement — '
      + 'les identifiants ne sont pas ecrits dans le depot.',
    )
  }
  const cx = await fetch(SITE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: mdp }),
  }).then((r) => r.json())
  if (!cx.access_token) throw new Error('connexion impossible : ' + JSON.stringify(cx).slice(0, 200))

  const session = await wd('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: ['--headless=new', '--no-sandbox', '--disable-gpu',
            '--disable-dev-shm-usage', '--window-size=1280,860', '--force-device-scale-factor=1'],
        },
      },
    },
  })
  sid = session.sessionId

  try {
    await wd('POST', S('/url'), { url: SITE + '/royaume/' })
    await evaluer('localStorage.setItem("questforge-token", arguments[0]); return true;', [cx.access_token])
    await wd('POST', S('/url'), { url: SITE + '/royaume/' })
    await attendre(2300)

    // -------------------------------------------------------------- 1. monde
    const etat = await evaluer(`
      var cv=document.getElementById('jeu'), ec=document.getElementById('ecu');
      function nonVide(c){try{var x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        var n=0;for(var i=3;i<x.length;i+=4000) if(x[i]>0) n++;return n;}catch(e){return -1}}
      var mur=document.getElementById('mur');
      return {
        murVisible: mur?!mur.classList.contains('off'):null,
        canvas: cv?cv.width+'x'+cv.height+' — '+nonVide(cv)+' echantillons non vides':null,
        ecu: ec?nonVide(ec)+' echantillons non vides':null,
        serie:T('jSerie'), coeurs:T('jCoeurs'), barre:T('barreTxt'),
        revoir:T('jRevoir'), parcours:T('titreParcours')
      };`)
    bloc('Le monde')
    for (const [k, v] of Object.entries(etat)) ligne(k, v)
    if (etat.murVisible) throw new Error("un mur d'erreur couvre la page : " + await evaluer('return T("murTxt",200);'))
    await shot('1-monde')

    // ------------------------------------- 2. viser un batiment qui a du travail
    const carte = await evaluer(`
      return fetch('/api/royaume/carte',{headers:{Authorization:'Bearer '+localStorage.getItem('questforge-token')}})
        .then(function(r){return r.json()}).then(function(c){
          return {centre:c.centre, bats:c.batiments.map(function(b){
            return {s:b.skill,x:b.x,y:b.y+1,n:b.niveau,du:b.du};})};});`)
    // Celui dont le niveau est le plus bas : c'est la qu'il reste des exercices.
    const cible = carte.bats.slice().sort((a, b) => a.n - b.n)[0]
    bloc('Cible')
    ligne('batiment', cible.s + ' — niveau ' + cible.n + ' — porte en (' + cible.x + ',' + cible.y + ')')
    ligne('depart', '(' + carte.centre.x + ',' + (carte.centre.y + 2) + ')')

    // Trajet simple : on aligne x, puis y — en verifiant l'infobulle a chaque pas.
    const lireProx = () => evaluer(`var b=document.getElementById('infobulle');
      return {visible:b.classList.contains('on'), texte:b.textContent.slice(0,150)};`)
    const px = carte.centre.x, py = carte.centre.y + 2
    let prox = await lireProx()
    const pasVers = async (touche, n) => {
      for (let i = 0; i < n && !prox.visible; i++) {
        await toucher(touche, 1); await attendre(300); prox = await lireProx()
      }
    }
    // ON VISE LA TUILE SOUS LA PORTE, ET ON Y VA VERTICALEMENT D'ABORD.
    //
    // Le premier trajet alignait x puis y, et traversait le batiment : un
    // batiment occupe les deux rangees AU-DESSUS de sa porte, donc descendre
    // sur la colonne de la porte cogne le mur. La rangee sous la porte, elle,
    // est toujours degagee.
    const viseY = cible.y + 1
    await pasVers(viseY < py ? HAUT : BAS, Math.abs(viseY - py))
    await pasVers(cible.x < px ? GAUCHE : DROITE, Math.abs(cible.x - px) + 1)
    if (!prox.visible) await pasVers(HAUT, 1)

    bloc('Proximite')
    ligne('infobulle', prox.visible ? 'visible' : '✘ INVISIBLE')
    ligne('contenu', prox.texte)
    await shot('2-proche')
    if (!prox.visible) throw new Error("le joueur n'a pas atteint la porte")

    // ---------------------------------------------------------- 3. la seance
    await toucher(ENTREE, 1)
    await attendre(2000)
    const s = await evaluer(`
      var se=document.getElementById('seance'), msg=document.getElementById('sMessage');
      return {
        ouverte: se.classList.contains('on'),
        message: msg.hidden ? '(masque, normal)' : msg.textContent.slice(0,110),
        etiquette: T('sEtiq'),
        question: T('sQuestion',130),
        nbChoix: document.querySelectorAll('#sZone .choix').length,
        nbCriteres: document.querySelectorAll('#sZone .critere').length,
        boutonGrille: !!document.querySelector('#sZone .btn'),
        // Le controle qui compte : les elements de l'exercice existent-ils encore ?
        elementsIntacts: ['sEtiq','sQuestion','sZone','pourquoi','grilleRep']
          .every(function(i){return !!document.getElementById(i)})
      };`)
    bloc('Seance')
    for (const [k, v] of Object.entries(s)) ligne(k, v)
    await shot('3-seance')
    if (!s.elementsIntacts) throw new Error('des elements de la seance ont ete detruits')

    // ------------------------------------------------------- 4. la correction
    if (s.nbChoix > 0) {
      await evaluer('document.querySelectorAll("#sZone .choix")[0].click(); return true;')
      await attendre(250)
      await evaluer('document.getElementById("sValider").click(); return true;')
      await attendre(2000)
      const corr = await evaluer(`
        return {
          verdict: T('verdict',120),
          pourquoiAffiche: !document.getElementById('pourquoi').hidden,
          pourquoi: T('pourquoiTxt',150),
          bonneSurlignee: document.querySelectorAll('#sZone .choix.ok').length,
          mauvaiseSurlignee: document.querySelectorAll('#sZone .choix.ko').length,
          boutonSuite: T('sValider'),
          hudXP: T('barreTxt'), hudCoeurs: T('jCoeurs')
        };`)
      bloc('Correction')
      for (const [k, v] of Object.entries(corr)) ligne(k, v)
      await shot('4-correction')
      if (!corr.pourquoiAffiche) throw new Error("le « pourquoi » ne s'affiche pas : la correction n'enseigne rien")

      // 5. Enchainer : c'est le pas qui plantait avant la correction du innerHTML.
      await evaluer('document.getElementById("sValider").click(); return true;')
      await attendre(1400)
      const suite = await evaluer(`
        return { etiquette:T('sEtiq'), question:T('sQuestion',110),
                 zoneRemplie: document.getElementById('sZone').children.length > 0 };`)
      bloc('Exercice suivant')
      for (const [k, v] of Object.entries(suite)) ligne(k, v)
      await shot('5-suivant')
      if (!suite.zoneRemplie) throw new Error("l'exercice suivant ne s'affiche pas")
    } else if (s.nbCriteres === 0 && s.boutonGrille) {
      bloc('Exercice sur grille')
      await evaluer('document.querySelector("#sZone .btn").click(); return true;')
      await attendre(700)
      const g = await evaluer(`return {criteres: document.querySelectorAll('#sZone .critere').length};`)
      ligne('criteres affiches', g.criteres)
      await shot('4-grille')
    }

    // ------------------------------------------------------------ 6. console
    let erreurs = []
    const types = await wd('GET', S('/se/log/types')).catch(() => null)
    if (types && types.includes('browser')) {
      const lignes = await wd('POST', S('/se/log'), { type: 'browser' }).catch(() => [])
      erreurs = (lignes || []).filter((l) => l.level === 'SEVERE').map((l) => l.message.slice(0, 220))
    }
    bloc('Console du navigateur')
    if (!erreurs.length) console.log('   aucune erreur SEVERE')
    else erreurs.forEach((e) => console.log('   ✘ ' + e))

    bloc('Captures')
    captures.forEach((c) => console.log('   ' + c))
    console.log('\n✔ Controle visuel termine sans blocage.')
  } finally {
    await wd('DELETE', S('')).catch(() => {})
  }
}

main().catch((e) => { console.error('\n✘ ECHEC : ' + e.message); process.exit(1) })
