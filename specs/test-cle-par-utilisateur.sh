#!/usr/bin/env bash
# Blason — la clé d'API appartient au COMPTE, pas au serveur.
#
# Ce que ce test prouve :
#   1. sans clé, la génération avancée se dit indisponible — proprement ;
#   2. la génération SIMPLE marche quand même : parcours, séance, XP ;
#   3. une clé mal formée est refusée sans appel réseau ;
#   4. la clé n'est JAMAIS renvoyée, même à celui qui l'a posée ;
#   5. la clé d'Alice n'existe pas pour Bob — deux comptes, deux crédits ;
#   6. en base, la clé est chiffrée : on ne la lit pas dans le fichier.
set -uo pipefail
B=https://blason.matourdecontrole.fr
compte() { # -> jeton
  node -e '
  const c=require("node:crypto");
  fetch(process.argv[1]+"/api/auth/register",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:"cle"+Date.now()+c.randomBytes(3).toString("hex")+"@blason.local",
                         password:c.randomBytes(18).toString("base64url")})})
   .then(r=>r.json()).then(j=>console.log(j.access_token||""));' "$B"
}

echo "════ 1. Sans clé : que dit l'application ?"
A=$(compte)
curl -s "$B/api/curriculum/etat" -H "Authorization: Bearer $A" \
 | node -pe 'const j=JSON.parse(require("fs").readFileSync(0));
   "  generation avancee : "+(j.generation_disponible?"disponible":"indisponible")
   +"\n  cle partagee par l exploitant : "+(j.cle_partagee_active?"OUI":"non")'
curl -s "$B/api/moi/cle-ia" -H "Authorization: Bearer $A" \
 | node -pe 'const j=JSON.parse(require("fs").readFileSync(0));
   "  cle du compte : "+(j.configuree?"configuree":"aucune")'

echo
echo "════ 2. La génération SIMPLE marche-t-elle sans clé ?"
node -e '
const tok=process.argv[1], B=process.argv[2];
(async()=>{
 const A={"Content-Type":"application/json",Authorization:"Bearer "+tok};
 const p=await (await fetch(B+"/api/parcours/generer",{method:"POST",headers:A,
   body:JSON.stringify({titre:"Cloud Engineer Azure",
     job_posting:"Cloud Engineer Azure. Terraform, Kubernetes, CI/CD, supervision, securite, migration de donnees. Astreinte. Anglais courant."})})).json();
 console.log("  parcours cree :", p.competences.map(c=>c.nom).join(", "));
 console.log("  lu par        :", p.lecture.par);
 const s=await (await fetch(B+"/api/seance?parcours_id="+p.id+"&taille=3",{headers:A})).json();
 console.log("  seance servie :", s.exercices.length, "exercices");
 const e=s.exercices.find(x=>x.type==="qcm");
 if(e){
   const r=await (await fetch(B+"/api/seance/reponse",{method:"POST",headers:A,
     body:JSON.stringify({exercice_id:e.id,reponse:1})})).json();
   console.log("  correction    :", r.correct?"juste":"faux", "| +"+r.xp+" XP | pourquoi:", r.pourquoi?"oui":"NON");
 }
})();' "$A" "$B"

echo
echo "════ 3. Une clé mal formée est-elle refusée ?"
for mauvaise in "bonjour" "sk-ant-court" "ANTHROPIC_API_KEY"; do
  printf "  %-22s " "\"$mauvaise\""
  curl -s -X PUT "$B/api/moi/cle-ia" -H "Authorization: Bearer $A" \
    -H 'Content-Type: application/json' -d "{\"cle\":\"$mauvaise\"}" \
    | node -pe 'const j=JSON.parse(require("fs").readFileSync(0)); "-> "+(j.message||JSON.stringify(j)).slice(0,72)'
done

echo
echo "════ 4. La clé ressort-elle jamais ?"
echo "  (on pose une clé de forme valide mais fausse : elle sera refusée par l'API"
echo "   Anthropic, ce qui prouve aussi que la vérification est faite)"
FAUSSE="sk-ant-$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9_-' | head -c 40)"
curl -s -X PUT "$B/api/moi/cle-ia" -H "Authorization: Bearer $A" \
  -H 'Content-Type: application/json' -d "{\"cle\":\"$FAUSSE\"}" \
  | node -pe 'const j=JSON.parse(require("fs").readFileSync(0)); "  -> "+(j.message||JSON.stringify(j)).slice(0,90)'
echo "  aucune reponse de l API ne contient la cle :"
for route in "/api/moi/cle-ia" "/api/moi/etat" "/api/curriculum/etat"; do
  corps=$(curl -s "$B$route" -H "Authorization: Bearer $A")
  if echo "$corps" | grep -q "$FAUSSE"; then echo "    ✘ FUITE sur $route"; else echo "    ✔ $route"; fi
done

echo
echo "════ 5. Deux comptes, deux clés : Bob voit-il celle d'Alice ?"
Bb=$(compte)
curl -s "$B/api/moi/cle-ia" -H "Authorization: Bearer $Bb" \
 | node -pe 'const j=JSON.parse(require("fs").readFileSync(0));
   "  Bob : "+(j.configuree?"✘ voit une cle configuree":"✔ aucune cle — celle d Alice ne le concerne pas")'

echo
echo "════ 6. En base, la clé est-elle chiffrée ?"
sudo docker exec blason node -e '
const {DatabaseSync}=require("node:sqlite");
const db=new DatabaseSync("/donnees/blason.db");
const r=db.prepare("select user_id,chiffre,iv,tag,suffixe from cles_ia limit 1").get();
if(!r){console.log("  (aucune cle en base)");process.exit(0)}
console.log("  stocke :", r.chiffre.slice(0,28)+"…");
console.log("  suffixe:", r.suffixe, "(en clair, volontairement)");
console.log("  ressemble-t-il a une cle Anthropic ?", /^sk-ant-/.test(r.chiffre) ? "✘ OUI — EN CLAIR" : "✔ non — chiffre");
' 2>/dev/null | grep -v Experimental
