/**
 * Blason — controle des chemins « rien a montrer ».
 *
 * Ce sont les ecrans que voit UN NOUVEL ARRIVANT, et precisement ceux qu'on
 * ne teste jamais : on developpe toujours avec un compte deja rempli. Un mur
 * d'erreur ici, et la premiere impression est perdue.
 *
 *   1. Le Royaume sans session      -> invitation a se connecter, pas une exception
 *   2. Le Royaume est atteignable depuis la barre laterale de l'application
 *   3. Le Royaume avec session mais sans parcours -> on explique quoi faire
 *
 * Prerequis : chromedriver sur 9515.
 */
const DRIVER = 'http://127.0.0.1:9515'
const SITE = 'http://localhost:8088'
const crypto = require('node:crypto')

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
let sid = null
const S = (p) => '/session/' + sid + p

async function wd(m, c, b) {
  const r = await fetch(DRIVER + c, {
    method: m, headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 200))
  return j.value
}
const evaluer = (script) => wd('POST', S('/execute/sync'), { script, args: [] })
const bloc = (t) => console.log('\n── ' + t)
const ligne = (k, v) => console.log('   ' + String(k).padEnd(16), v)

async function main() {
  sid = (await wd('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: ['--headless=new', '--no-sandbox', '--disable-gpu',
            '--disable-dev-shm-usage', '--window-size=1200,800'],
        },
      },
    },
  })).sessionId

  let echecs = 0
  try {
    // ---------------------------------------------- 1. Royaume sans session
    await wd('POST', S('/url'), { url: SITE + '/royaume/' })
    await evaluer('localStorage.clear(); return true;')
    await wd('POST', S('/url'), { url: SITE + '/royaume/' })
    await attendre(1400)
    const sansSession = await evaluer(`
      var m = document.getElementById('mur');
      return {
        murVisible: !m.classList.contains('off'),
        titre: m.querySelector('h1').textContent,
        texte: document.getElementById('murTxt').textContent.slice(0, 120),
        boutons: Array.prototype.map.call(
          document.querySelectorAll('#murActions button'), function (b) { return b.textContent }),
      };`)
    bloc('1. Le Royaume sans session')
    for (const [k, v] of Object.entries(sansSession)) ligne(k, v)
    if (!sansSession.murVisible || !sansSession.boutons.length) {
      console.log('   ✘ pas d invitation exploitable'); echecs++
    } else console.log('   ✔ invitation claire, avec une sortie')

    // ------------------------------ 2. Un compte neuf : session, aucun parcours
    const email = 'neuf' + Date.now() + '@blason.local'
    const cx = await fetch(SITE + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // Mot de passe tire au hasard : ce compte nait sur un serveur public,
      // un mot de passe fixe ecrit dans le depot y ouvrirait la porte.
      body: JSON.stringify({ email, password: crypto.randomBytes(18).toString('base64url') }),
    }).then((r) => r.json())
    if (!cx.access_token) throw new Error('inscription impossible')
    await evaluer('localStorage.setItem("questforge-token", ' + JSON.stringify(cx.access_token) + '); return true;')

    // Le lien vers le Royaume vit dans la barre laterale de l'application.
    // Une page qu'aucun lien ne designe n'existe pas pour l'utilisateur.
    await wd('POST', S('/url'), { url: SITE + '/app' })
    await attendre(2200)
    const lien = await evaluer(`
      var a = document.querySelector('a[href="/royaume/"]');
      return { present: !!a, texte: a ? a.textContent.trim() : null };`)
    bloc('2. Le Royaume est-il atteignable depuis l application ?')
    for (const [k, v] of Object.entries(lien)) ligne(k, v)
    if (!lien.present) { console.log('   ✘ aucun lien : la page serait invisible'); echecs++ }
    else console.log('   ✔ present dans la barre laterale')

    // --------------------------- 3. Le Royaume avec session, mais sans parcours
    await wd('POST', S('/url'), { url: SITE + '/royaume/' })
    await attendre(1800)
    const sansParcours = await evaluer(`
      var m = document.getElementById('mur');
      return {
        murVisible: !m.classList.contains('off'),
        titre: m.querySelector('h1').textContent,
        texte: document.getElementById('murTxt').textContent.slice(0, 170),
        boutons: Array.prototype.map.call(
          document.querySelectorAll('#murActions button'), function (b) { return b.textContent }),
      };`)
    bloc('3. Le Royaume avec session, mais aucun parcours')
    for (const [k, v] of Object.entries(sansParcours)) ligne(k, v)
    if (!sansParcours.murVisible) {
      console.log('   ✘ aucun message : le joueur arrive sur une carte vide'); echecs++
    } else if (!/offre/i.test(sansParcours.texte)) {
      console.log("   ✘ le message n explique pas qu il faut d abord coller une offre"); echecs++
    } else console.log('   ✔ le message dit quoi faire, pas seulement que ça a echoue')

    // ------------------------------------------------------------ console
    let sev = []
    const types = await wd('GET', S('/se/log/types')).catch(() => null)
    if (types && types.includes('browser')) {
      const l = await wd('POST', S('/se/log'), { type: 'browser' }).catch(() => [])
      sev = (l || []).filter((x) => x.level === 'SEVERE')
        // Les 404 d'icones ou de polices externes ne sont pas notre sujet.
        .filter((x) => !/favicon|fonts\.g/.test(x.message))
        .map((x) => x.message.slice(0, 200))
    }
    bloc('Console')
    if (!sev.length) console.log('   aucune erreur SEVERE')
    else { sev.forEach((e) => console.log('   ✘ ' + e)); echecs++ }

    console.log(echecs ? '\n✘ ' + echecs + ' chemin(s) en defaut.' : '\n✔ Les chemins vides sont tous accueillants.')
    process.exitCode = echecs ? 1 : 0
  } finally {
    await wd('DELETE', S('')).catch(() => {})
  }
}
main().catch((e) => { console.error('\n✘ ECHEC : ' + e.message); process.exit(1) })
