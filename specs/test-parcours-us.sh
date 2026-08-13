#!/usr/bin/env bash
# Blason — test de bout en bout : offre US reelle -> parcours -> seance -> XP.
# Se lance sur le serveur local. Cree un compte de test dedie.
set -u
B=http://localhost:8088
J() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(eval('j'+process.argv[1]))}catch(e){console.log('ERR:'+s.slice(0,200))}})" "$1"; }

echo "════════ 1. Compte de test"
EMAIL="test-us-$(date +%s)@blason.local"
# Mot de passe tire au hasard : ces comptes naissent sur un serveur public,
# un mot de passe fixe ecrit dans le depot y ouvrirait la porte.
MDP="$(openssl rand -base64 24)"
TOK=$(curl -s -m 10 -X POST $B/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$MDP\",\"username\":\"testus$(date +%s)\"}" | J ".access_token")
if [ -z "$TOK" ] || [ "$TOK" = "undefined" ]; then echo "ECHEC inscription"; exit 1; fi
echo "  compte cree, jeton obtenu (${#TOK} car.)"
A=(-H "Authorization: Bearer $TOK" -H 'Content-Type: application/json')

echo
echo "════════ 2. Injection de l'offre US reelle (Robots & Pencils, US Remote)"
node -e '
const fs=require("fs");
const t=fs.readFileSync("/tmp/offre-rp-principal-ai-arch.txt","utf8");
process.stdout.write(JSON.stringify({
  titre:"Principal AI Engineering Architect",
  entreprise:"Robots & Pencils",
  url:"https://job-boards.greenhouse.io/robotsandpencils/jobs/5373864008",
  domaine:"ia-agents", statut:"nouvelle", notes:t
}));' > /tmp/offre-us.json
OID=$(curl -s -m 10 -X POST $B/api/from/offres "${A[@]}" -d @/tmp/offre-us.json | J ".id||j[0]&&j[0].id")
echo "  offre inseree : $OID"

echo
echo "════════ 3. Generation du parcours"
curl -s -m 20 -X POST $B/api/parcours/generer "${A[@]}" -d "{\"offre_id\":\"$OID\"}" > /tmp/parcours.json
node -e '
const p=require("/tmp/parcours.json");
console.log("  titre      :",p.titre);
console.log("  pays       :",p.pays,"| salaire lu :",p.salaire||"(aucun)");
console.log("  sponsoring :",p.contexte.sponsor,"| distanciel :",p.contexte.distanciel,"| fuseau :",p.contexte.fuseau||"(non lu)");
console.log("  competences:",p.competences.map(c=>c.nom+(c.couvert?"":"*")).join(", "));
console.log("  entretien  :",p.entretien.length,"questions ("+[...new Set(p.entretien.map(e=>e.genre))].join(", ")+")");
console.log("  fiche US   :",p.us_check.length,"points");
p.us_check.forEach(u=>console.log("     ["+u.etat.padEnd(11)+"]",u.titre));
(p.avertissements||[]).forEach(a=>console.log("  ! ",a));
require("fs").writeFileSync("/tmp/pid.txt",p.id);
'
PID=$(cat /tmp/pid.txt)

echo
echo "════════ 4. Seance : 7 exercices, on repond a tout"
curl -s -m 10 "$B/api/seance?parcours_id=$PID&taille=7" "${A[@]}" > /tmp/seance.json
node -e 'const s=require("/tmp/seance.json");
console.log("  coeurs:",s.coeurs,"| objectif:",s.objectif_xp,"XP");
s.exercices.forEach((e,i)=>console.log("   "+(i+1)+".",e.type.padEnd(9),e.skill.padEnd(14),(e.question||e.enonce||e.situation||"").slice(0,58).replace(/\n/g," ")+"…"));
'

node -e '
const s=require("/tmp/seance.json");
// On repond volontairement de facon mixte : quelques justes, quelques faux,
// pour verifier que la correction, les coeurs et le SRS reagissent vraiment.
const rep=s.exercices.map((e,i)=>{
  if(e.type==="qcm"||e.type==="arbitrage") return {exercice_id:e.id, reponse: i%3===2 ? 0 : 1};
  if(e.type==="chiffre") return {exercice_id:e.id, reponse: 15};
  return {exercice_id:e.id, reponse: Array.from({length:e.nb_criteres},(_,k)=>k < e.nb_criteres-1)};
});
require("fs").writeFileSync("/tmp/reps.json",JSON.stringify(rep));
'
node -e '
const reps=require("/tmp/reps.json");
const tok=process.argv[1];
(async()=>{
  let xp=0, justes=0;
  for(const r of reps){
    const res=await fetch("http://localhost:8088/api/seance/reponse",{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok},
      body:JSON.stringify(r)});
    const j=await res.json();
    if(res.status!==200){console.log("   ! HTTP",res.status,j.message);continue}
    xp+=j.xp; if(j.correct) justes++;
    console.log("   "+(j.correct?"✔":"✘"),String(j.skill).padEnd(14),
      "note",String(j.note).padStart(3)+"%","| +"+String(j.xp).padStart(2)+" XP",
      "| coeurs",j.coeurs,"| niv",j.niveau,"| revoir le",j.a_revoir_le,
      (j.quartier_gagne?" | QUARTIER "+j.quartier_gagne:""));
  }
  console.log("   ────────── total seance : "+justes+"/"+reps.length+" justes, +"+xp+" XP");
})();' "$TOK"

echo
echo "════════ 5. Etat du joueur (le registre)"
curl -s -m 10 $B/api/moi/etat "${A[@]}" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const e=JSON.parse(s);
console.log("  XP total :",e.xp,"| niveau",e.niveau,"| serie",e.serie,"| coeurs",e.coeurs+"/"+e.coeurs_max);
console.log("  objectif :",e.xp_du_jour+"/"+e.objectif_xp,"XP",e.objectif_atteint?"(atteint)":"(en cours)");
console.log("  a revoir :",e.a_revoir,"competence(s)");
console.log("  blason   :",e.blason.quartiers.length,"quartier(s)",e.blason.quartiers.map(q=>q.skill+"/"+q.meuble).join(", "));
e.competences.forEach(c=>console.log("     niv",c.niveau,c.skill.padEnd(14),c.reussites+"✔",c.echecs+"✘","revoir le",c.a_revoir_le));
});'

echo
echo "════════ 6. Carte du Royaume (couche 2D)"
curl -s -m 10 "$B/api/royaume/carte?parcours_id=$PID" "${A[@]}" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);
console.log("  parcours :",c.parcours.titre,"|",c.parcours.pays,"|",c.parcours.salaire);
console.log("  batiments:",c.batiments.length);
c.batiments.forEach(b=>console.log("     ("+String(b.x).padStart(2)+","+String(b.y).padStart(2)+")",
  b.skill.padEnd(14),"niveau",b.niveau,["Ruine","Bivouac","Cabane","Tour","Forteresse","Citadelle"][b.niveau].padEnd(11),
  b.du?"[a revoir]":"", b.couvert?"":"[generique]"));
});'

echo
echo "════════ 7. Verification du registre en base (jamais un point sans ligne)"
node -e '
const {DatabaseSync}=require("node:sqlite");
const db=new DatabaseSync("/home/ubuntu/blason/server/blason.db");
const u=db.prepare("select id from users where email=?").get(process.argv[1]);
if(!u){console.log("  ! compte introuvable");process.exit(0)}
const xpe=db.prepare("select count(*) n, coalesce(sum(amount),0) s from xp_events where user_id=?").get(u.id);
const rep=db.prepare("select count(*) n, coalesce(sum(xp),0) s from reponses where user_id=?").get(u.id);
const pro=db.prepare("select xp from profiles where id=?").get(u.id);
console.log("  reponses enregistrees :",rep.n,"(somme xp",rep.s+")");
console.log("  lignes xp_events      :",xpe.n,"(somme",xpe.s+")");
console.log("  profiles.xp affiche   :",pro.xp);
const ok = pro.xp===xpe.s && xpe.s===rep.s;
console.log(ok ? "  ✔ COHERENT : le total affiche est exactement la somme du registre,"
               + "\n    et chaque point du registre a une reponse horodatee derriere lui."
               : "  ✘ INCOHERENT : "+pro.xp+" affiche / "+xpe.s+" en xp_events / "+rep.s+" en reponses.");
' "$EMAIL"

echo
echo "════════ 8. Charge serveur apres le test"
curl -s -m 5 $B/api/charge | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);
console.log("  etat:",c.etat,"| requetes:",c.requetes.total,"| p95:",c.latence_ms.p95+"ms | p99:",c.latence_ms.p99+"ms");
console.log("  boucle d evenements:",c.boucle_evenements_ms.courant+"ms (max "+c.boucle_evenements_ms.max+"ms)");
console.log("  refus: debit",c.refus.debit,"| simultaneite",c.refus.simultaneite,"| cache",c.cache.taux);
});'
echo
echo "Jeton du compte de test (pour le navigateur) :"
echo "$TOK"
