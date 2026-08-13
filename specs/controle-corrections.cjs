/**
 * Blason — controle des trois corrections du 13/08/2026 :
 *
 *   1. /login et /register renvoient l'utilisateur deja connecte vers /app
 *   2. le titre de la cinematique tient dans le cadre (plus de debordement)
 *   3. les pastilles de contexte ne doublent plus le carton-titre
 *
 * Prerequis : chromedriver sur 9515.
 */
const DRIVER = 'http://127.0.0.1:9515'
const SITE = 'http://localhost:8088'
const fs = require('node:fs')

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
let sid = null
const S = (p) => '/session/' + sid + p

async function wd(m, c, b) {
  const r = await fetch(DRIVER + c, {
    method: m, headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 220))
  return j.value
}
const evaluer = (script) => wd('POST', S('/execute/sync'), { script, args: [] })
const bloc = (t) => console.log('\n── ' + t)
const ligne = (k, v) => console.log('   ' + String(k).padEnd(22), v)

async function main() {
  const jeton = fs.readFileSync('/tmp/jeton-patrick.txt', 'utf8').trim()
  const queteId = fs.readFileSync('/tmp/quete-us.txt', 'utf8').trim()
  let echecs = 0

  sid = (await wd('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: ['--headless=new', '--no-sandbox', '--disable-gpu',
            '--disable-dev-shm-usage', '--window-size=1280,900'],
        },
      },
    },
  })).sessionId

  try {
    // ---------------------------------------- 1. le garde /login et /register
    await wd('POST', S('/url'), { url: SITE + '/' })
    await evaluer('localStorage.clear(); return true;')
    await wd('POST', S('/url'), { url: SITE + '/login' })
    await attendre(1500)
    const sansSession = await evaluer("return {url: location.pathname, formulaire: !!document.querySelector('input[type=password]')};")
    bloc('1a. /login SANS session — le formulaire doit rester')
    for (const [k, v] of Object.entries(sansSession)) ligne(k, v)
    if (sansSession.url !== '/login' || !sansSession.formulaire) {
      console.log('   ✘ le formulaire de connexion a disparu pour un visiteur'); echecs++
    } else console.log('   ✔ accessible, comme il se doit')

    await evaluer('localStorage.setItem("questforge-token", ' + JSON.stringify(jeton) + '); return true;')
    for (const chemin of ['/login', '/register']) {
      await wd('POST', S('/url'), { url: SITE + chemin })
      await attendre(1800)
      const r = await evaluer("return {url: location.pathname, formulaire: !!document.querySelector('input[type=password]')};")
      bloc('1b. ' + chemin + ' AVEC session — doit renvoyer vers /app')
      for (const [k, v] of Object.entries(r)) ligne(k, v)
      if (r.url === chemin || r.formulaire) { console.log('   ✘ l utilisateur connecte voit encore le formulaire'); echecs++ }
      else console.log('   ✔ redirige vers ' + r.url)
    }

    // ------------------------------------------- 2 et 3. la cinematique
    await wd('POST', S('/url'), { url: SITE + '/app/quests/' + queteId })
    await attendre(2200)

    // Pendant le carton-titre : les pastilles doivent etre effacees.
    const pendantIntro = await evaluer(`
      var d = document.querySelector('canvas').parentElement
                .querySelector('div.pointer-events-none');
      var st = d ? getComputedStyle(d) : null;
      return { pastillesOpacite: st ? st.opacity : null };`)
    bloc('3. Pastilles PENDANT le carton-titre')
    ligne('opacité', pendantIntro.pastillesOpacite)
    if (Number(pendantIntro.pastillesOpacite) > 0.1) {
      console.log('   ✘ elles doublent encore le titre'); echecs++
    } else console.log('   ✔ effacées : le titre ne se lit qu une fois')
    const b1 = await wd('GET', S('/screenshot'))
    fs.writeFileSync('/tmp/fix-1-titre.png', Buffer.from(b1, 'base64'))

    // Le titre doit tenir : on mesure les pixels ecrits sur les colonnes de bord.
    const debord = await evaluer(`
      var cv = document.querySelector('canvas');
      var ctx = cv.getContext('2d');
      var W = cv.width, H = cv.height;
      // Bandes de 5 % a gauche et a droite, sur la hauteur du bloc titre.
      function ecrits(x0, larg){
        var d = ctx.getImageData(x0, Math.round(H*0.22), larg, Math.round(H*0.22)).data;
        var n = 0;
        for (var i = 0; i < d.length; i += 4) {
          // On ne compte que le texte clair, pas le decor sombre.
          if (d[i] > 170 && d[i+1] > 165 && d[i+2] > 140) n++;
        }
        return n;
      }
      var marge = Math.round(W * 0.05);
      return { gauche: ecrits(0, marge), droite: ecrits(W - marge, marge),
               largeurCanvas: W };`)
    bloc('2. Débordement du titre (pixels de texte dans les marges)')
    for (const [k, v] of Object.entries(debord)) ligne(k, v)
    if (debord.gauche > 40 || debord.droite > 40) {
      console.log('   ✘ le titre mord encore sur les bords'); echecs++
    } else console.log('   ✔ le titre tient dans le cadre')

    // Apres l'intro : les pastilles reviennent, sans deborder.
    //
    // ATTENTE ACTIVE, pas un delai fixe. En headless l'animation n'avance pas
    // a la vitesse du temps reel : la transition mesuree tombe vers 9 s, la ou
    // un vrai navigateur la joue a 4,4 s. Un `attendre(3400)` faisait echouer
    // ce controle alors que le code etait juste — le test mentait, pas le
    // produit.
    const lireOpacite = () => evaluer(`
      var d = document.querySelector('canvas').parentElement
                .querySelector('div.pointer-events-none');
      return d ? getComputedStyle(d).opacity : null;`)
    let op = '0'
    for (let i = 0; i < 40 && Number(op) < 0.9; i++) {
      await attendre(500)
      op = await lireOpacite()
    }
    const apresIntro = await evaluer(`
      var d = document.querySelector('canvas').parentElement
                .querySelector('div.pointer-events-none');
      var st = getComputedStyle(d);
      var pastilles = Array.prototype.map.call(d.querySelectorAll('span'), function(s){
        return { texte: s.textContent.trim().slice(0,46),
                 deborde: s.scrollWidth > s.clientWidth + 1 };
      });
      return { opacite: st.opacity, pastilles: pastilles };`)
    bloc('3b. Pastilles APRÈS le carton-titre')
    ligne('opacité', apresIntro.opacite)
    apresIntro.pastilles.forEach((p) => ligne(p.deborde ? '✘ déborde' : '✔ tient', p.texte))
    if (Number(apresIntro.opacite) < 0.9) { console.log('   ✘ elles ne reviennent pas'); echecs++ }
    if (apresIntro.pastilles.some((p) => p.deborde)) { console.log('   ✘ une pastille déborde'); echecs++ }
    const b2 = await wd('GET', S('/screenshot'))
    fs.writeFileSync('/tmp/fix-2-pastilles.png', Buffer.from(b2, 'base64'))

    let sev = []
    const types = await wd('GET', S('/se/log/types')).catch(() => null)
    if (types && types.includes('browser')) {
      const l = await wd('POST', S('/se/log'), { type: 'browser' }).catch(() => [])
      sev = (l || []).filter((x) => x.level === 'SEVERE')
        .filter((x) => !/favicon|fonts\.g/.test(x.message)).map((x) => x.message.slice(0, 200))
    }
    bloc('Console')
    if (!sev.length) console.log('   aucune erreur SEVERE')
    else { sev.forEach((e) => console.log('   ✘ ' + e)); echecs++ }

    console.log('\n' + (echecs ? '✘ ' + echecs + ' contrôle(s) en échec.' : '✔ Les trois corrections tiennent.'))
    console.log('   captures : /tmp/fix-1-titre.png  /tmp/fix-2-pastilles.png')
    process.exitCode = echecs ? 1 : 0
  } finally {
    await wd('DELETE', S('')).catch(() => {})
  }
}
main().catch((e) => { console.error('✘ ' + e.message); process.exit(1) })
