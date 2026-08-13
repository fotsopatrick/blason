# Blason — l'écart entre « une appli de quêtes » et « ça m'a fait décrocher le poste »

Date : 13/08/2026. Écrit après lecture du code (`server/index.cjs`, `server/schema.sql`),
de la base (`server/blason.db`) et de trois offres réelles :

| Offre | Source | Taille | Rôle dans ce document |
|---|---|---|---|
| Cloud Engineer (Azure) — Deloitte | Indeed (`viewjob?jk=88336f4993f0481c`) | 4 431 car. | l'offre cloud de départ |
| IFS Cloud Solution Architect — Accenture | Indeed (`viewjob?jk=78800facad6ecaa4`) | 7 189 car. | déjà en base, sert de contrôle |
| **Principal AI Engineering Architect — Robots & Pencils, US Remote, $180 375–$230 625** | greenhouse | 7 644 car. | **l'offre de test US** |

## 1. Ce que Blason sait déjà faire (et qui tient)

- Offre collée → quête générée **sans clé API**, par comptage d'occurrences des
  technos (`extraireCompetences`). Le classement par fréquence est juste : sur
  l'offre Accenture, « IFS » l'emporte sur « azure » cité une fois.
- Un avertissement honnête quand l'annonce collée est trop courte.
- Auth par JWT signé, refus de démarrer si le secret est vide.
- Guildes, classements, dépôts, stockage, sessions qui survivent au redémarrage.

C'est une base saine. Le problème n'est pas la plomberie.

## 2. Les sept manques — mesurés, pas supposés

### Manque 1 — la quête ne fait pas monter en compétence

Une quête générée aujourd'hui produit, pour chaque techno trouvée, exactement
cette étape :

> « Maîtriser — Kubernetes. Ressource : le manuel officiel ou la documentation
> de Kubernetes. Lis-la, note les 5 points clés, applique-les dans un
> mini-exercice. »

Personne n'a jamais été embauché parce qu'il a lu une documentation. Il n'y a
**aucun exercice, aucune correction, aucune mesure**. L'appli ne peut pas
distinguer quelqu'un qui maîtrise Terraform de quelqu'un qui a coché une case.

### Manque 2 — l'XP est un décor

`xp_events` : **0 ligne**. `profiles.xp` : **0 pour les 4 comptes**. Trois
quêtes acceptées, aucune terminée. La table existe, le classement l'interroge,
et il n'y a rien dedans. Une jauge qui ne bouge jamais n'est pas une
gamification, c'est un élément de décor.

### Manque 3 — aucune boucle quotidienne

Duolingo tient par la **série** (streak), l'**objectif du jour**, et des
séances courtes à correction immédiate. Blason n'a ni série, ni objectif
quotidien, ni séance. On ouvre l'appli, on lit une quête, on ferme. Rien ne
ramène demain.

### Manque 4 — aucune répétition espacée

Une compétence révisée une fois est oubliée. Il n'existe aucune notion de
« quand faut-il revoir Bedrock AgentCore ? ». C'est précisément ce que
l'entretien technique va sonder trois semaines plus tard.

### Manque 5 — rien ne prépare l'entretien réel d'architecte

L'offre Robots & Pencils demande de « translate complex AI tradeoffs, risks,
and opportunities into clear narratives » et d'« own the most difficult
architectural challenges ». Un entretien d'architecte aux USA, c'est :

1. **System design** au tableau (« conçois une plateforme multi-agents RAG sur
   AWS pour 10 000 utilisateurs — coût, latence, modes de panne »),
2. des **ordres de grandeur** (coût par million de jetons, p99, taille d'un
   embedding) — c'est le filtre qui élimine les architectes de diaporama,
3. des **arbitrages justifiés** (« Bedrock AgentCore plutôt que LangGraph
   auto-hébergé sur EKS — pourquoi ? »),
4. du **comportemental STAR** (« tell me about a time you… »).

Blason ne produit rien de tout cela. La table `entretiens` existe, elle est
vide, et le champ `preparation` n'est rempli par aucun code.

### Manque 6 — aucune spécificité américaine

C'est le manque le plus coûteux, et il est invisible depuis la France. Postuler
aux USA depuis l'étranger échoue rarement sur la technique :

- **le droit au travail** : la quasi-totalité des annonces porte une mention de
  sponsorship. L'offre Robots & Pencils est « US Remote » — donc réservée à qui
  peut travailler depuis le sol américain. Une candidature qui l'ignore est
  écartée en 10 secondes, avant toute lecture technique ;
- **le CV** : format américain, 1 page, sans photo, sans date de naissance,
  sans nationalité, verbes d'action + chiffres, et lisible par un ATS. Un CV
  français est rejeté par la machine avant d'atteindre un humain ;
- **l'ancrage salarial** : $180 375–$230 625 est écrit dans l'annonce. Ne pas
  savoir se positionner dans une fourchette publiée coûte des dizaines de
  milliers de dollars ;
- **le fuseau horaire** : « US Remote » signifie en pratique un recouvrement
  avec ET ou PT. Depuis la France, c'est 15 h–minuit. Cela se décide avant de
  postuler, pas au troisième entretien.

Blason n'a pas un seul champ sur ces sujets. `offres` a `domaine`, `tags`,
`statut` — rien sur le sponsorship, rien sur le salaire, rien sur le fuseau.

### Manque 7 — le 2D existe mais n'est pas branché

Le dépôt de la tour contient un moteur 2D maison, sans dépendance
(`tour_jeu/static/src/royaume.js`, 366 lignes : canvas, tuiles, déplacement en
grille, sprites procéduraux, PNJ). Blason, lui, contient exactement deux
occurrences de « canvas » dans 490 Ko de JavaScript compilé — c'est-à-dire
rien. Le potentiel ludique est écrit, testé, et dort dans un autre projet.

## 3. Contrainte technique majeure — la source React a disparu

`/home/ubuntu/blason` ne contient **que le build** :

```
git ls-files → .gitignore, dist/assets/*.css, dist/assets/*.js,
               dist/index.html, package-lock.json, package.json,
               server/index.cjs, server/schema.sql
```

Aucun `.tsx`, aucun `vite.config.ts`, aucun dossier `src/` — ni dans le dépôt,
ni ailleurs sur la machine (recherche sur `/` entière). Le `package.json`
déclare `build: tsc -b && vite build` sur des sources qui n'existent plus.

**Conséquence assumée** : on ne touche pas au React. Tout ce qui suit est livré
comme (a) des tables et des routes ajoutées au serveur Express, et (b) une
**page autonome en canvas**, zéro dépendance, servie par le même serveur. Le
React existant continue de fonctionner à côté, sans régression.

## 4. Le chantier

| # | Livrable | Répond au manque |
|---|---|---|
| 1 | Banque d'exercices notés par compétence (QCM, ordre de grandeur, arbitrage, system design à grille, STAR) | 1, 5 |
| 2 | Répétition espacée (SM-2 allégé) par compétence | 4 |
| 3 | Boucle quotidienne : série, objectif du jour, cœurs, séance de 7 exercices | 3 |
| 4 | XP réellement écrit dans `xp_events` à chaque exercice réussi | 2 |
| 5 | Offre → **parcours** : curriculum réel par techno + questions d'entretien + arbitrages | 1, 5 |
| 6 | Fiche **prêt-pour-les-USA** par offre : sponsorship, CV ATS, fourchette, fuseau | 6 |
| 7 | **Le Royaume** : carte 2D où chaque bâtiment est une techno de l'offre ; entrer = séance | 7 |
| 8 | Contrôle de charge : limitation de débit, cache, plafonds, sonde | — |

## 5. Le principe qui gouverne le tout

**Jamais un point sans registre.** Chaque XP affiché correspond à une ligne dans
`xp_events` avec sa raison. Aucune jauge inventée, aucun pourcentage décoratif.
Si l'appli dit « tu maîtrises Terraform à 60 % », il doit exister 10 réponses
horodatées derrière ce chiffre.

---

# Ce qui a été livré, et ce que les tests ont trouvé (13/08/2026)

## Livré

| Fichier | Rôle |
|---|---|
| `server/curriculum.cjs` | 46 exercices notés sur 12 compétences + fiche générique de repli. Cinq familles : QCM, ordre de grandeur, arbitrage, system design (noté sur grille), STAR. Chacun porte un **« pourquoi »** : une correction sans explication sanctionne, elle n'enseigne pas. |
| `server/moteur.cjs` | Répétition espacée (SM-2 allégé), série, objectif du jour, cœurs, enchaînement, **blason** (un quartier d'écu par compétence de niveau ≥ 3), génération de parcours depuis une offre, fiche « prêt pour les USA », carte du Royaume. |
| `server/charge.cjs` | Plafond de simultanéité, seau à jetons (lecture/écriture séparés), cache court des lectures chaudes, sonde `/api/charge`. |
| `royaume/` | La couche 2D : canvas sans dépendance, carte où chaque compétence de l'offre est un bâtiment qui se reconstruit avec le niveau. |
| `specs/test-parcours-us.sh` | Test de bout en bout sur l'offre US réelle. |
| `specs/test-charge.sh` | Épreuve de charge des quatre protections. |
| `specs/controle-visuel.cjs` | Contrôle du Royaume dans un Chromium piloté par WebDriver. |

## Les quatre défauts que seuls les tests ont révélés

Ils valent d'être écrits : aucun n'était visible à la lecture du code.

### 1. L'extraction de compétences comptait des sous-chaînes

`extraireCompetences` comptait par `indexOf`. Sur l'offre US, le motif `eam`
sortait 7 fois — **dont 6 à l'intérieur du mot « team »**. Le parcours généré
contenait donc « EAM » (gestion d'actifs industriels), sans aucun rapport avec
le poste. Même classe de faux positifs vérifiée : `sage`⊂« mes**sage** »,
`git`⊂« di**git**al », `api`⊂« r**api**d », `java`⊂« **java**script ».

→ Frontières de mot, avec deux précautions : pas de frontière du côté
non-alphanumérique (sinon `.net` ne matcherait jamais dans « asp.net »), et
pluriel anglais accepté.

### 2. Le vocabulaire agentique manquait entièrement

Sur une offre d'**architecte IA**, aucun de ces mots n'était connu :
`agentic` (9 occurrences), `multi-agent` (5), `agentcore` (4), `bedrock` (4),
`mlops`, `sagemaker`, `rag`, `langgraph`, `langchain`, `vector`, `embedding`.

→ ~60 motifs ajoutés, **avec un poids**. Car le comptage seul ne suffisait pas
non plus : « cloud » (11 fois, mot-valise) écrasait « agentic » (9 fois,
mot qui fait le poste). Poids 3 = technologie nommée et rare, 1 = mot-valise.

**Avant** : `Communication, Cloud, EAM, Kubernetes, Azure`
**Après** : `Agents IA, AWS, MLOps, Sécurité, Données, RAG, Marché US`

Vérifié sans régression sur les trois autres offres : « IFS Cloud » reste en
tête sur l'annonce Accenture.

### 3. Une séance entière tombait sur une seule compétence

Tous les exercices jamais faits ont la même priorité, et l'ordre du tableau
les groupait par compétence : les 4 premiers exercices portaient sur
Communication et Cloud, AWS n'arrivait qu'en 5ᵉ. Une séance doit balayer le
poste, pas une case du poste. → **Tourniquet** entre compétences.

### 4. Un bâtiment s'effondrait de la Tour à la Cabane pour une erreur

`niveauDe` lisait `repetitions`, c'est-à-dire les réussites **consécutives** au
sens SM-2, qu'une seule erreur remet à zéro. Un compte à 9 réussites sur AWS
affichait niveau 2. C'est juste pour **planifier** une révision ; c'est faux
pour **afficher** une maîtrise — on n'oublie pas neuf réussites parce qu'on en
rate une.

→ `repetitions` reste pour la planification ; le niveau lit la **meilleure
série atteinte, moins un**. Une erreur coûte au plus un niveau. Le chiffre
reste entièrement dérivé du registre.

### Bonus — trouvé au contrôle en navigateur uniquement

`ouvrirSeance` écrasait `innerHTML` de `#sCorps`, ce qui **détruisait**
`#sEtiq`, `#sQuestion`, `#sZone`. Après un passage par une séance vide, entrer
dans un autre bâtiment ouvrait un écran mort. → Élément de message dédié ;
on masque, on ne détruit pas.

## Résultats mesurés

**Bout en bout** (offre Robots & Pencils, US Remote, $180 375 – $230 625) :
pays `US` détecté, salaire lu, fuseau `PT` déduit, 7 compétences, 10 questions
d'entretien, fiche US à 7 points. Registre **cohérent** : `profiles.xp` =
somme de `xp_events` = somme des `reponses`.

**Charge** : rafale de 300 lectures → 238 refusées en 429 (aucune file qui
gonfle) ; cache 5/6 sur lecture répétée ; seau d'écriture coupe à 20/40 ;
`/api/charge` répond pendant la rafale. Retard de boucle d'évènements max
157 ms, dû au `scryptSync` de l'inscription — attendu, c'est le coût
volontaire du hachage de mot de passe.

**Navigateur** (Chromium/WebDriver) : monde rendu, écu à 4 quartiers, approche
d'un bâtiment, séance, correction avec le « pourquoi », enchaînement.
Aucune erreur `SEVERE` en console.

## Ce qui reste ouvert

- **Le React n'a pas été touché** (source perdue). Le Royaume vit à côté, sur
  `/royaume`. Un jour, soit on reconstruit la source, soit le Royaume devient
  l'interface principale.
- **Compétences sans banque dédiée** : Python, IFS Cloud, C#/.NET, Agile, SQL…
  reçoivent la fiche générique (rôle, limites, coût, panne). C'est du travail
  réel, mais moins fin. L'API le **dit** dans `avertissements` plutôt que de le
  masquer.
- **Le contrôle visuel est headless.** Il attrape les erreurs grossières ; il
  ne remplace pas l'ouverture à l'œil dans un vrai navigateur.
