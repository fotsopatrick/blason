/**
 * Blason — capture de la cinematique existante (QuestCinematic).
 *
 * Ouvre la page de detail d'une quete et photographie la scene a plusieurs
 * instants, pour voir les phases : titre, entree du heros, dialogue du
 * gardien. Sert a DECIDER quoi faire de ce composant, pas a le valider.
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
  if (j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 200))
  return j.value
}
const evaluer = (script) => wd('POST', S('/execute/sync'), { script, args: [] })

async function main() {
  const jeton = fs.readFileSync('/tmp/jeton-patrick.txt', 'utf8').trim()
  const queteId = fs.readFileSync('/tmp/quete-us.txt', 'utf8').trim()

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
    await wd('POST', S('/url'), { url: SITE + '/' })
    await evaluer('localStorage.setItem("questforge-token", ' + JSON.stringify(jeton) + '); return true;')
    await wd('POST', S('/url'), { url: SITE + '/app/quests/' + queteId })
    await attendre(3000)

    const etat = await evaluer(`
      var c = document.querySelector('canvas');
      function nonVide(cv){try{var x=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
        var n=0;for(var i=3;i<x.length;i+=4000) if(x[i]>0) n++;return n;}catch(e){return -1}}
      return {
        titrePage: (document.querySelector('h1')||{}).textContent,
        canvasPresent: !!c,
        canvasTaille: c ? c.width+'x'+c.height : null,
        canvasDessine: c ? nonVide(c) : null,
        boutons: Array.prototype.map.call(document.querySelectorAll('button'), function(b){return b.textContent.trim()}).filter(Boolean).slice(0,10)
      };`)
    console.log('\n── La page de quête')
    for (const [k, v] of Object.entries(etat)) console.log('   ' + String(k).padEnd(15), v)

    // On photographie la scene a plusieurs instants : les phases s'enchainent
    // (titre ~4,4 s, puis entree du heros, puis dialogue).
    const moments = [0, 2500, 3000, 4000, 5000, 6000]
    let t = 0
    for (let i = 0; i < moments.length; i++) {
      if (moments[i]) { await attendre(moments[i]); t += moments[i] }
      const b64 = await wd('GET', S('/screenshot'))
      const f = '/tmp/cinema-' + (i + 1) + '-t' + Math.round(t / 1000) + 's.png'
      fs.writeFileSync(f, Buffer.from(b64, 'base64'))
      console.log('   capture ' + f)
    }

    let sev = []
    const types = await wd('GET', S('/se/log/types')).catch(() => null)
    if (types && types.includes('browser')) {
      const l = await wd('POST', S('/se/log'), { type: 'browser' }).catch(() => [])
      sev = (l || []).filter((x) => x.level === 'SEVERE')
        .filter((x) => !/favicon|fonts\.g/.test(x.message)).map((x) => x.message.slice(0, 200))
    }
    console.log('\n── Console')
    console.log(sev.length ? sev.map((e) => '   ✘ ' + e).join('\n') : '   aucune erreur SEVERE')
  } finally {
    await wd('DELETE', S('')).catch(() => {})
  }
}
main().catch((e) => { console.error('✘ ' + e.message); process.exit(1) })
