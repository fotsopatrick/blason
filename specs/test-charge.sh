#!/usr/bin/env bash
# Blason — epreuve de charge.
#
# On verifie que les quatre protections de server/charge.cjs font vraiment
# ce qu'elles annoncent, sous une charge qui ressemble a la vraie menace :
# une couche 2D qui interroge l'API en boucle depuis plusieurs onglets.
set -u
B=http://localhost:8088

echo "════════ Compte de test"
# Voir test-parcours-us.sh : mot de passe tire au hasard, jamais en dur.
MDP="$(openssl rand -base64 24)"
TOK=$(curl -s -X POST $B/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"charge$(date +%s%N)@b.local\",\"password\":\"$MDP\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
echo "  jeton obtenu"

echo
echo "════════ Etat AVANT"
curl -s $B/api/charge | node -pe '
const c=JSON.parse(require("fs").readFileSync(0));
"  etat "+c.etat+" | requetes "+c.requetes.total+" | refus debit "+c.refus.debit
+" | refus simultaneite "+c.refus.simultaneite+" | boucle "+c.boucle_evenements_ms.courant+"ms"'

echo
echo "════════ 1. Rafale de 300 lectures en parallele (le seau doit couper)"
node -e '
const tok=process.argv[1];
(async()=>{
  const t0=Date.now();
  const r=await Promise.all(Array.from({length:300},()=>
    fetch("http://localhost:8088/api/moi/etat",{headers:{Authorization:"Bearer "+tok}})
      .then(x=>x.status).catch(()=>0)));
  const c={};r.forEach(s=>c[s]=(c[s]||0)+1);
  console.log("  duree:",(Date.now()-t0)+"ms | reponses:",JSON.stringify(c));
  console.log("  200 =",c[200]||0," 429 (trop de requetes) =",c[429]||0," 503 (sature) =",c[503]||0);
  if((c[429]||0)+(c[503]||0)===0) console.log("  ✘ AUCUN refus : la protection ne sert a rien.");
  else console.log("  ✔ Le serveur a refuse",(c[429]||0)+(c[503]||0),"requetes au lieu de les empiler.");
})();' "$TOK"

echo
echo "════════ 2. Le cache tient-il la lecture chaude ?"
sleep 9   # on laisse le seau se recharger
node -e '
const tok=process.argv[1];
(async()=>{
  let touche=0, manque=0;
  for(let i=0;i<6;i++){
    const r=await fetch("http://localhost:8088/api/royaume/carte",{headers:{Authorization:"Bearer "+tok}});
    if(r.headers.get("x-blason-cache")==="touche") touche++; else manque++;
    await new Promise(s=>setTimeout(s,120));
  }
  console.log("  6 appels rapproches ->",touche,"servis par le cache,",manque,"calcules");
  console.log(touche>=4 ? "  ✔ Le cache absorbe la lecture repetee."
                        : "  ✘ Le cache ne prend pas : chaque image recalculerait tout.");
})();' "$TOK"

echo
echo "════════ 3. L'ecriture est-elle plus severement limitee que la lecture ?"
node -e '
const tok=process.argv[1];
(async()=>{
  const r=await Promise.all(Array.from({length:40},()=>
    fetch("http://localhost:8088/api/moi/objectif",{method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+tok},
      body:JSON.stringify({objectif_xp:50})}).then(x=>x.status).catch(()=>0)));
  const c={};r.forEach(s=>c[s]=(c[s]||0)+1);
  console.log("  40 ecritures ->",JSON.stringify(c));
  console.log((c[429]||0)>0 ? "  ✔ Le seau d ecriture coupe avant le seau de lecture (comme voulu : une"
                            + "\n    ecriture coute bien plus cher qu une lecture sur SQLite synchrone)."
                            : "  ✘ Aucune limite sur l ecriture.");
})();' "$TOK"

echo
echo "════════ 4. La sonde reste-t-elle joignable sous charge ?"
node -e '
(async()=>{
  const charge=Array.from({length:120},()=>fetch("http://localhost:8088/api/moi/etat").catch(()=>0));
  const s=await fetch("http://localhost:8088/api/charge");
  await Promise.all(charge);
  console.log("  /api/charge pendant la rafale ->",s.status,
    s.status===200?"✔ la sonde repond meme quand le reste refuse":"✘ la sonde tombe avec le service");
})();'

echo
echo "════════ Etat APRES"
curl -s $B/api/charge | node -pe '
const c=JSON.parse(require("fs").readFileSync(0));
"  etat        : "+c.etat+"\n"+
"  requetes    : "+c.requetes.total+" (max en vol "+c.requetes.en_vol_max+", lentes "+c.requetes.lentes+")\n"+
"  latence     : p50 "+c.latence_ms.p50+"ms | p95 "+c.latence_ms.p95+"ms | p99 "+c.latence_ms.p99+"ms\n"+
"  boucle evts : "+c.boucle_evenements_ms.courant+"ms (max "+c.boucle_evenements_ms.max+"ms)  <- la mesure qui compte avec SQLite synchrone\n"+
"  refus       : debit "+c.refus.debit+" | simultaneite "+c.refus.simultaneite+"\n"+
"  cache       : "+c.cache.taux+" ("+c.cache.touche+" touches / "+c.cache.manque+" manques)\n"+
"  memoire     : tas "+c.memoire_mo.tas+" Mo | rss "+c.memoire_mo.rss+" Mo | seaux actifs "+c.seaux_actifs'
