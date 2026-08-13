/**
 * Blason — le curriculum.
 *
 * POURQUOI CE FICHIER EXISTE (13/08/2026)
 *
 * Le générateur de quetes produisait, pour chaque techno trouvee dans une
 * annonce, la même étape : « lis la documentation, note 5 points clés ».
 * Personne n'a jamais ete embauche parce qu'il a lu une documentation.
 *
 * Ici vivent des EXERCICES NOTES. Cinq familles, choisies parce que ce sont
 * les cinq choses qu'un entretien d'architecte aux USA sonde réellement :
 *
 *   qcm        rappel rapide       — la seance courte, corrigee dans la seconde
 *   chiffre    ordre de grandeur   — le filtre qui élimine l'architecte de
 *                                    diaporama : il ne connaît aucun chiffre
 *   arbitrage  choix + raison      — « pourquoi X plutôt que Y »
 *   design     system design       — l'épreuve au tableau, notee sur grille
 *   star       comportemental      — « tell me about a time you… »
 *
 * Chaque exercice porte un « pourquoi » : sans lui, une réponse fausse
 * n'apprend rien. C'est la différence entre corriger et enseigner.
 */

// ---------------------------------------------------------------------------
// Les compétences reconnues, et comment les nommer.
// La clé est le nom canonique produit par extraireCompetences() dans index.cjs.
// ---------------------------------------------------------------------------

const BANQUE = {}

function skill(nom, meta, exercices) {
  BANQUE[nom] = {
    nom,
    famille: meta.famille || 'technique',
    resume: meta.resume || '',
    exercices: exercices.map((e, i) => ({ ...e, id: slug(nom) + '-' + (i + 1), skill: nom })),
  }
}

const slug = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ===========================================================================
// AWS — l'offre de test le demande en premier ("strong bias toward AWS")
// ===========================================================================
skill('AWS', { famille: 'cloud', resume: 'Le socle demande par la majorité des offres US d architecte IA.' }, [
  {
    type: 'chiffre',
    question: "Durée maximale d'exécution d'une fonction AWS Lambda, en minutes ?",
    reponse: 15, tolerance: 0, unite: 'minutes',
    pourquoi:
      "15 minutes. Ce chiffre décide d'une architecture entière : tout traitement plus long " +
      "sort de Lambda et part vers Step Functions, ECS/Fargate ou Batch. En entretien, " +
      "proposer « on met l'entraînement du modèle dans un Lambda » se disqualifie sur ce seul chiffre.",
  },
  {
    type: 'qcm',
    question:
      "Un agent doit répondre a une requête HTTP synchrone en renvoyant 12 Mo de JSON depuis Lambda. Que se passe-t-il ?",
    choix: [
      "Ca passe, Lambda n'a pas de limite de réponse",
      "Ca échoue : la réponse synchrone de Lambda est plafonnée a 6 Mo",
      "Ca passe mais la facture double",
      "Ca passe si on augmente la mémoire a 10 Go",
    ],
    bonne: 1,
    pourquoi:
      "La charge utile synchrone de Lambda est plafonnée a 6 Mo (256 Ko en asynchrone). " +
      "Le motif correct : Lambda écrit le résultat dans S3 et renvoie une URL présignée. " +
      "C'est exactement le cas d'un agent qui produit un gros rapport.",
  },
  {
    type: 'qcm',
    question: "Quel service AWS gère l'exécution, la mémoire et l'isolation d'agents en production ?",
    choix: ['Amazon SageMaker Ground Truth', 'Amazon Bedrock AgentCore', 'AWS Glue', 'Amazon Comprehend'],
    bonne: 1,
    pourquoi:
      "Bedrock AgentCore. L'offre Robots & Pencils le cite nommement : « Design and build with " +
      "Amazon Bedrock AgentCore ». Une annonce qui nomme un service précis attend qu'on sache " +
      "ce qu'il fait — c'est la première question filtre.",
  },
  {
    type: 'arbitrage',
    situation:
      "Plateforme multi-agents, charge en dents de scie : 0 requête la nuit, 400 requêtes/s a 14 h. " +
      "Le client veut minimiser le coût ET tenir les pics.",
    options: [
      "EKS avec un pool de noeuds fixe dimensionné pour le pic",
      "Lambda + Bedrock, mise a l'échelle a zéro, avec concurrence provisionnée sur le chemin chaud",
      "EC2 réservées sur 3 ans pour le prix",
      "Un seul gros EC2 avec des files d'attente",
    ],
    recommande: 1,
    pourquoi:
      "La forme de la charge décide. Une charge qui tombe a zéro la nuit paie un pool fixe pour " +
      "ne rien faire 12 h par jour. Lambda descend a zéro ; la concurrence provisionnée achète la " +
      "latence de démarrage à froid uniquement sur le chemin critique. Les réservations 3 ans sur " +
      "une charge en dents de scie, c'est acheter le pic 24 h/24.",
  },
  {
    type: 'qcm',
    question: "Une architecture évènementielle doit router des évènements vers 6 consommateurs différents selon leur contenu. Le bon service ?",
    choix: ['SQS', 'EventBridge', 'Kinesis Data Streams', 'SNS FIFO'],
    bonne: 1,
    pourquoi:
      "EventBridge : le routage par règles sur le CONTENU de l'évènement est sa raison d'être. " +
      "SQS est une file point a point, SNS diffuse sans filtrage fin, Kinesis est un flux ordonné " +
      "pour du volume. Cite dans l'offre : « Lambda, EventBridge ».",
  },
  {
    type: 'design',
    enonce:
      "Conçois sur AWS une plateforme multi-agents RAG pour 10 000 utilisateurs internes. " +
      "Donne : l'ingestion documentaire, le stockage vectoriel, l'orchestration des agents, " +
      "le service du modèle, l'observabilité, et le contrôle de coût.",
    grille: [
      "Ingestion : S3 -> déclencheur -> découpage -> embeddings -> base vectorielle (et le RE-traitement quand le document change)",
      "Choix de base vectorielle argumenté (OpenSearch/pgvector/Pinecone) avec le critère qui tranche",
      "Orchestration nommee (AgentCore, Step Functions ou LangGraph) et POURQUOI celle-la",
      "Isolation par locataire : les documents de l'équipe A ne doivent jamais sortir dans une réponse a l'équipe B",
      "Cache sémantique ou cache de prompt pour couper la facture de jetons",
      "Observabilité : traces par agent, coût par requête, taux d'échec d'outil",
      "Modes de panne : que se passe-t-il si le modèle renvoie 429 ou si un outil boucle",
      "Un chiffre de coût ou de latence, même approximatif, mais assume",
    ],
    seuil: 6,
    pourquoi:
      "C'est littéralement l'épreuve de l'offre : « lead the design and delivery of complex, " +
      "production-grade multi-agent systems ». Les 8 points de la grille sont ceux qu'un jury " +
      "coche. Les deux plus souvent oubliés : l'isolation par locataire et le mode de panne.",
  },
])

// ===========================================================================
// Agents / orchestration — le coeur de l'offre US de test
// ===========================================================================
skill('Agents IA', { famille: 'ia', resume: 'Systèmes multi-agents en production : orchestration, outils, mémoire.' }, [
  {
    type: 'qcm',
    question:
      "Un agent boucle : il rappelle le même outil 40 fois de suite avec les mêmes arguments. Quelle protection AURAIT dû exister dès la conception ?",
    choix: [
      "Un modèle plus gros",
      "Un plafond de tours + détection de répétition + budget de jetons par requête",
      "Une température plus basse",
      "Un prompt système plus long",
    ],
    bonne: 1,
    pourquoi:
      "Un agent en production a TOUJOURS trois plafonds : nombre de tours, budget de jetons, " +
      "durée. Sans eux, une seule requête peut coûter des centaines de dollars. Répondre " +
      "« un modèle plus gros » est le réflexe qui trahit l'absence d'expérience de production.",
  },
  {
    type: 'arbitrage',
    situation:
      "Il faut coordonner 5 agents spécialisés (recherche, rédaction, vérification, chiffrage, envoi). " +
      "L'équipe hesite entre un graphe explicite et un agent unique qui delegue librement.",
    options: [
      "Un agent unique autonome qui décide seul de tout appeler",
      "Un graphe explicite (LangGraph/Step Functions) avec des états et des transitions nommes",
      "Cinq agents en parallèle qui votent",
      "Une chaîne lineaire figee sans branchement",
    ],
    recommande: 1,
    pourquoi:
      "En production, ce qu'on ne peut pas tracer, on ne peut pas reparer. Un graphe explicite " +
      "donne : la reprise sur incident a l'état exact, l'observabilité par noeud, et un coût " +
      "borne. L'agent autonome intégral fait une belle demo et un cauchemar d'exploitation. " +
      "La chaîne figee, elle, ne gère aucun cas d'erreur.",
  },
  {
    type: 'qcm',
    question: "Que designe le « tool use » mal cadre comme première surface d'attaque d'un agent ?",
    choix: [
      "La lenteur des appels réseau",
      "L'injection de prompt indirecte : un document lu par l'agent contient des instructions qu'il exécute",
      "Le coût des embeddings",
      "La taille de la fenêtre de contexte",
    ],
    bonne: 1,
    pourquoi:
      "L'injection indirecte est LA faille des agents : le contenu récupère (page web, PDF, " +
      "ticket) est traite comme une instruction. L'offre l'exige explicitement : « prompt " +
      "injection defenses ». La parade : séparer données et instructions, mettre les outils " +
      "sensibles derriere une validation humaine, et ne jamais donner a l'agent plus de droits " +
      "que l'utilisateur au nom de qui il agit.",
  },
  {
    type: 'chiffre',
    question:
      "Un agent fait en moyenne 6 appels au modèle par requête. A 30 000 requêtes/jour, combien d'appels au modèle par jour ?",
    reponse: 180000, tolerance: 0, unite: 'appels/jour',
    pourquoi:
      "180 000. Le calcul est trivial ; le point ne l'est pas. Le facteur d'amplification des " +
      "agents (ici x6) est ce qui fait exploser les factures et taper les limites de debit. " +
      "Un architecte qui chiffre une plateforme agentique sans multiplier par le nombre de tours " +
      "se trompe d'un ordre de grandeur.",
  },
  {
    type: 'design',
    enonce:
      "Un agent doit pouvoir agir sur des systèmes réels (creer un ticket, envoyer un mail, " +
      "rembourser un client). Conçois les garde-fous.",
    grille: [
      "Classement des outils par réversibilité : lecture / ecriture réversible / irréversible",
      "Validation humaine obligatoire sur l'irréversible (remboursement, envoi externe)",
      "L'agent herite des droits de l'utilisateur, jamais d'un compte de service tout-puissant",
      "Plafond de montant / de volume par requête et par jour",
      "Journal d'audit : qui, quoi, quand, sur ordre de quel utilisateur, avec quel prompt",
      "Bac a sable ou exécution à blanc avant la première mise en production",
      "Un chemin d'annulation explicite pour tout ce qui est réversible",
    ],
    seuil: 5,
    pourquoi:
      "L'offre demande « AI safety, responsible AI principles, prompt injection defenses, and " +
      "PII handling ». Un candidat qui parle de garde-fous en termes de prompt (« je lui dis de " +
      "ne pas faire de betises ») échoue. Les garde-fous sont architecturaux, pas textuels.",
  },
  {
    type: 'star',
    question:
      "Raconte une fois ou un système que tu as conçu s'est comporte autrement que prévu en production. " +
      "Qu'as-tu fait, et qu'as-tu change ENSUITE dans ta façon de concevoir ?",
    grille: [
      "Situation : le contexte en 2 phrases, avec l'enjeu chiffre (utilisateurs, argent, délai)",
      "Tache : ce dont TU étais responsable, pas l'équipe",
      "Action : ce que tu as fait, au passe, a la première personne du singulier",
      "Résultat : un chiffre (temps de rétablissement, coût évite, taux d'erreur)",
      "L'apprentissage : ce que tu fais DIFFEREMMENT depuis — c'est la vraie question",
      "Aucune accusation d'un collegue ou d'un employeur précédent",
    ],
    seuil: 5,
    pourquoi:
      "Aux USA, la partie comportementale élimine autant que la technique. Le piège de cette " +
      "question est de raconter un succès deguise. Les jurys cherchent la capacité a nommer un " +
      "échec et a en tirer une règle. « Nous avons » au lieu de « j'ai » est le defaut numéro un.",
  },
])

// ===========================================================================
// RAG — cite en détail dans l'offre US
// ===========================================================================
skill('RAG', { famille: 'ia', resume: 'Récupération augmentee : découpage, embeddings, bases vectorielles, reclassement.' }, [
  {
    type: 'qcm',
    question:
      "Les réponses citent le bon document mais ratent la phrase utile, souvent situee a cheval entre deux morceaux. La correction la plus directe ?",
    choix: [
      "Augmenter le nombre de morceaux récupérés (top-k) a 50",
      "Ajouter un recouvrement entre morceaux et passer a un découpage qui respecte la structure",
      "Changer de modèle de langue",
      "Baisser la température",
    ],
    bonne: 1,
    pourquoi:
      "Le symptome « bon document, mauvaise phrase » designe le découpage, pas le modèle. " +
      "Recouvrement (10-20 %) + respect des frontières naturelles (titres, paragraphes). " +
      "Monter le top-k a 50 noie le contexte, coûte plus cher et dégrade souvent la réponse.",
  },
  {
    type: 'chiffre',
    question:
      "Dimension d'un vecteur produit par un modèle d'embedding de type « small » de la génération actuelle (ex. text-embedding-3-small) ?",
    reponse: 1536, tolerance: 0, unite: 'dimensions',
    pourquoi:
      "1536. Ce chiffre commande le dimensionnement : 1 million de documents x 1536 dimensions " +
      "x 4 octets = ~6 Go de vecteurs bruts, avant index. C'est ce calcul qui décide si l'index " +
      "tient en mémoire — et donc du coût de l'infrastructure.",
  },
  {
    type: 'arbitrage',
    situation:
      "10 millions de documents, exigence de rappel élevée, budget serre, l'équipe maîtrise déjà PostgreSQL.",
    options: [
      "pgvector avec index HNSW sur la base existante",
      "Une base vectorielle gérée spécialisée dès le premier jour",
      "Recherche exhaustive sans index",
      "Elasticsearch en lexical pur, sans vecteurs",
    ],
    recommande: 0,
    pourquoi:
      "A 10 millions de vecteurs, pgvector + HNSW tient, et l'équipe évite une base de plus a " +
      "exploiter, sauvegarder et securiser. « Nous connaissons déjà PostgreSQL » est un argument " +
      "d'architecture recevable : le coût d'exploitation est réel. La base spécialisée se " +
      "justifie plus haut en volume ou sur des besoins de filtrage/multi-locataires pousses. " +
      "La recherche exhaustive ne passe pas l'échelle ; le lexical pur rate les reformulations.",
  },
  {
    type: 'qcm',
    question: "A quoi sert un reclassement (reranker) après la recherche vectorielle ?",
    choix: [
      "A compresser les vecteurs pour économiser la mémoire",
      "A réordonner un top-k large avec un modèle plus fin, pour ne garder que les vrais pertinents",
      "A traduire les documents",
      "A chiffrer l'index",
    ],
    bonne: 1,
    pourquoi:
      "Le motif gagnant : récupérer large et grossier (top-50, rapide), puis reclasser fin " +
      "(top-5, coûteux mais sur 50 éléments seulement). On gagne en pertinence sans payer le " +
      "modèle fin sur toute la base. C'est la réponse attendue sur « advanced retrieval techniques ».",
  },
  {
    type: 'design',
    enonce:
      "Le RAG marche en demo, échoue en production : réponses périmées, fuites entre clients, " +
      "et personne ne sait s'il s'améliore. Conçois la reprise.",
    grille: [
      "Re-indexation sur changement de document (et suppression effective quand la source disparaît)",
      "Filtre de locataire APPLIQUE DANS la requête vectorielle, pas après coup",
      "Jeu d'évaluation fige : N questions avec la réponse attendue, rejoue a chaque changement",
      "Mesures séparées : rappel de la récupération vs qualité de la génération",
      "Citation des sources dans la réponse, vérifiable par l'utilisateur",
      "Journalisation des requêtes sans réponse satisfaisante, pour alimenter le jeu d'évaluation",
      "Politique sur les données personnelles : ce qui n'entre jamais dans l'index",
    ],
    seuil: 5,
    pourquoi:
      "« Extensive expérience building RAG pipelines » se vérifie ici : le candidat de demo parle " +
      "de chunking, le candidat de production parle de re-indexation, d'isolation et d'évaluation. " +
      "Le filtre applique APRES la recherche est le bug de sécurité le plus frequent en RAG " +
      "multi-clients : les documents de l'autre client occupent déjà le top-k.",
  },
])

// ===========================================================================
// Kubernetes
// ===========================================================================
skill('Kubernetes', { famille: 'cloud', resume: 'Orchestration de conteneurs : cycle de vie, réseau, elasticite.' }, [
  {
    type: 'qcm',
    question: "Différence entre une sonde de vivacite (liveness) et une sonde de disponibilité (readiness) ?",
    choix: [
      "Aucune, ce sont deux noms pour la même chose",
      "Liveness en échec => le conteneur est redémarre ; readiness en échec => le pod est retire du service, sans redémarrage",
      "Liveness sert au démarrage, readiness a l'arret",
      "Readiness redémarre le pod, liveness le supprime",
    ],
    bonne: 1,
    pourquoi:
      "Confondre les deux provoque la panne classique : on met la vérification de la base de " +
      "données dans la sonde de vivacite ; la base ralentit, et Kubernetes redémarre en boucle " +
      "toute la flotte — transformant un incident de latence en panne totale.",
  },
  {
    type: 'chiffre',
    question:
      "Un pod demande 500 m de CPU. Combien de pods peut-on placer sur un noeud offrant 4 CPU allouables (sans compter la reserve système) ?",
    reponse: 8, tolerance: 0, unite: 'pods',
    pourquoi:
      "8. 500 m = un demi-coeur. Le point d'architecture : c'est la DEMANDE (request) qui décide " +
      "du placement, pas la limite. Des demandes surévaluées vident la facture dans du vide ; " +
      "des demandes sous-evaluees provoquent l'évincement sous charge.",
  },
  {
    type: 'arbitrage',
    situation:
      "Service d'inférence dont la latence explose aux pics. L'équipe veut « ajouter de l'autoscaling ».",
    options: [
      "HPA sur l'usage CPU",
      "HPA sur une metrique métier (requêtes en attente par pod) + KEDA sur la profondeur de file",
      "Doubler le nombre de replicas en permanence",
      "Passer a des noeuds plus gros",
    ],
    recommande: 1,
    pourquoi:
      "L'inférence est bornee par le GPU ou l'attente réseau, pas par le CPU : la mise a l'échelle " +
      "sur CPU ne se déclenche jamais, ou trop tard. On met a l'échelle sur ce qui fait mal — " +
      "la file d'attente. Doubler en permanence paie le pic 24 h/24 ; des noeuds plus gros " +
      "ne reduisent pas la latence d'une file saturee.",
  },
  {
    type: 'qcm',
    question: "Un pod doit lire un secret. La pratique attendue en 2026 sur un cluster gère ?",
    choix: [
      "Le mettre en clair dans une variable d'environnement du Deployment",
      "Identité de charge de travail (IRSA / Workload Identity) pour retirer le secret du cluster",
      "Le committer dans le depot Git avec le manifeste",
      "Un ConfigMap",
    ],
    bonne: 1,
    pourquoi:
      "Les Secrets Kubernetes ne sont qu'encodes en base64, pas chiffres. Le motif attendu : le " +
      "pod obtient une identité (IRSA sur EKS, Workload Identity sur GKE) et récupère le secret " +
      "au coffre a l'exécution. Plus aucun secret durable ne dort dans le cluster ni dans Git.",
  },
])

// ===========================================================================
// Terraform / IaC
// ===========================================================================
skill('Terraform', { famille: 'cloud', resume: 'Infrastructure comme code : état, reprise, revue.' }, [
  {
    type: 'qcm',
    question: "Deux ingenieurs lancent `apply` en même temps sur le même état distant. Qu'est-ce qui évite la corruption ?",
    choix: [
      "Rien, Terraform fusionne",
      "Le verrouillage d'état (state locking), ex. DynamoDB avec un bucket S3",
      "Le fichier .terraform.lock.hcl",
      "Git",
    ],
    bonne: 1,
    pourquoi:
      "Le verrouillage d'état. Attention au piège : `.terraform.lock.hcl` verrouille les VERSIONS " +
      "DE FOURNISSEURS, pas l'état — c'est la confusion la plus frequente en entretien.",
  },
  {
    type: 'qcm',
    question: "Pourquoi préférer `for_each` a `count` pour creer une liste de ressources ?",
    choix: [
      "for_each est plus rapide",
      "Avec count, retirer un élément du milieu decale les index et detruit/recree les ressources suivantes",
      "count est déprécié",
      "for_each supporte plus de ressources",
    ],
    bonne: 1,
    pourquoi:
      "Avec `count`, l'adresse est `[0]`, `[1]`, `[2]`… Retirer le premier élément decale tout : " +
      "Terraform propose de détruire et recreer des ressources qui n'ont pas bouge. `for_each` " +
      "indexe par clé stable. C'est le genre de détail qui distingue quelqu'un qui a exploite " +
      "Terraform de quelqu'un qui l'a lu.",
  },
  {
    type: 'design',
    enonce:
      "Trois environnements (dev, recette, production), quatre équipes, et l'obligation de prouver " +
      "a un auditeur qui a change quoi en production. Conçois l'organisation Terraform.",
    grille: [
      "États séparés par environnement ET par domaine (le rayon d'explosion d'un apply est borne)",
      "Backend distant chiffre avec verrouillage",
      "Aucune application manuelle en production : elle passe par la CI, sur fusion",
      "Le plan est publié et relu dans la demande de fusion",
      "Droits distincts : la CI de production a un rôle dédié, personne n'a les clés en local",
      "Versions de fournisseurs epinglees et fichier de verrouillage committe",
      "La derive detectee periodiquement (plan planifie) et signalee",
    ],
    seuil: 5,
    pourquoi:
      "« Define infrastructure as code, CI/CD, and DevOps standards across engagements » : la " +
      "question n'est pas de savoir écrire du HCL, c'est de savoir organiser une équipe autour. " +
      "Le point le plus discriminant : la séparation des états pour borner le rayon d'explosion.",
  },
])

// ===========================================================================
// Coût / économie des jetons — l'offre le demande explicitement
// ===========================================================================
skill('Cout', { famille: 'architecture', resume: 'Économie des jetons, cache, routage de modèles, quantification.' }, [
  {
    type: 'arbitrage',
    situation:
      "Un assistant interne reçoit 200 000 requêtes/jour. 80 % sont des questions simples et " +
      "repetitives, 20 % exigent un vrai raisonnement. Tout passe aujourd'hui par le plus gros modèle.",
    options: [
      "Garder le gros modèle partout : la qualité avant tout",
      "Routage : petit modèle par defaut, escalade vers le gros sur signal (confiance, longueur, échec de vérification)",
      "Passer tout le monde sur le petit modèle",
      "Réduire la fenêtre de contexte de moitie",
    ],
    recommande: 1,
    pourquoi:
      "« Advanced cost optimization expertise: token economics, caching stratégies, model routing » " +
      "est littéralement dans l'offre. Le routage capte l'essentiel de l'économie sans sacrifier " +
      "les 20 % difficiles. Le point d'architecture : il faut un SIGNAL d'escalade mesurable, " +
      "sinon le routage dégrade la qualité en silence.",
  },
  {
    type: 'chiffre',
    question:
      "Une requête consomme 8 000 jetons d'entrée dont 6 000 de prompt système identique a chaque appel. " +
      "Quel pourcentage des jetons d'entrée le cache de prompt peut-il couvrir, au mieux ?",
    reponse: 75, tolerance: 2, unite: '%',
    pourquoi:
      "6000/8000 = 75 %. Le raisonnement compte plus que le résultat : la partie STABLE et " +
      "PREFIXE du prompt est ce qui se met en cache. D'ou une règle de conception : mettre " +
      "l'invariable en tête, le variable en queue. Un prompt bien ordonné coûte structurellement " +
      "moins cher qu'un prompt mal ordonné, a contenu identique.",
  },
  {
    type: 'qcm',
    question: "Un cache sémantique renvoie une réponse déjà produite pour une question « assez proche ». Le risque principal ?",
    choix: [
      "Il consomme trop de mémoire",
      "Deux questions proches en vecteur peuvent avoir des réponses différentes ; et le cache peut divulguer la réponse d'un autre utilisateur",
      "Il ralentit le système",
      "Il empeche la mise a l'échelle",
    ],
    bonne: 1,
    pourquoi:
      "Deux risques, et le second est un incident de sécurité : « quel est MON solde ? » et " +
      "« quel est MON solde ? » posees par deux clients sont identiques en vecteur. Un cache " +
      "sémantique se clefe TOUJOURS par locataire/utilisateur, et exclut les réponses " +
      "personnalisées. C'est une réponse qui impressionne parce qu'elle vient d'une vraie panne.",
  },
])

// ===========================================================================
// Sécurité & conformité
// ===========================================================================
skill('Securite', { famille: 'architecture', resume: 'IAM, données personnelles, conformité, defense contre l injection.' }, [
  {
    type: 'qcm',
    question: "Principe qui doit gouverner les droits d'un agent appelant des outils au nom d'un utilisateur ?",
    choix: [
      "L'agent utilise un compte de service avec les droits maximaux, c'est plus simple",
      "L'agent n'obtient jamais plus de droits que l'utilisateur au nom de qui il agit",
      "L'agent n'a aucun droit et demande tout a un humain",
      "L'agent utilise les droits du développeur qui l'a écrit",
    ],
    bonne: 1,
    pourquoi:
      "La délégation de droits. Un agent sur compte de service tout-puissant transforme chaque " +
      "injection de prompt réussie en compromission totale. L'agent doit porter l'identité de " +
      "l'appelant — c'est ce qui borne les degats d'une injection a ce que l'utilisateur pouvait " +
      "déjà faire lui-même.",
  },
  {
    type: 'qcm',
    question: "SOC 2, HIPAA, RGPD sont cites dans l'offre. Lequel impose un délai de notification de violation de 72 heures ?",
    choix: ['SOC 2', 'HIPAA', 'RGPD', 'Aucun'],
    bonne: 2,
    pourquoi:
      "Le RGPD : 72 heures pour notifier l'autorité de contrôle. SOC 2 est un référentiel " +
      "d'audit (pas une loi), HIPAA regit la sante aux USA avec ses propres délais. Un architecte " +
      "qui travaille pour des clients américains ET europeens doit savoir lequel est une loi et " +
      "lequel est un audit — la confusion est frequente et se voit.",
  },
  {
    type: 'design',
    enonce:
      "Un assistant interne indexe les documents RH — donc des données personnelles. Conçois le traitement.",
    grille: [
      "Classification des sources AVANT indexation : ce qui n'entre jamais dans l'index",
      "Détection/masquage des données personnelles a l'ingestion, pas a l'affichage",
      "Droits appliques a la récupération : l'index respecte les habilitations de la source",
      "Droit a l'effacement : supprimer une personne implique de purger index ET caches",
      "Rétention et purge des journaux de prompts (ils contiennent les questions des salaries)",
      "Pas d'entraînement/affinage sur ces données sans base legale explicite",
      "Journal d'accès consultable par le delegue a la protection des données",
    ],
    seuil: 5,
    pourquoi:
      "Le piège : masquer a l'AFFICHAGE. Si la donnee est dans l'index, elle est dans le contexte " +
      "du modèle, donc exfiltrable par une question bien tournee. Le droit a l'effacement sur un " +
      "index vectoriel + caches est la question a laquelle presque personne ne pense, et qui fait " +
      "la différence en entretien de conformité.",
  },
])

// ===========================================================================
// Données
// ===========================================================================
skill('Donnees', { famille: 'donnees', resume: 'Entrepots, flux, orchestration : Snowflake, Kafka, Spark, Airflow, dbt.' }, [
  {
    type: 'qcm',
    question: "Différence de fond entre traitement par lots et par flux, du point de vue de l'architecte ?",
    choix: [
      "Le flux est toujours plus rapide donc toujours meilleur",
      "Le flux échange une complexité d'exploitation (état, ordre, arrivées tardives) contre de la fraîcheur — on ne le prend que si la fraîcheur a une valeur métier",
      "Le lot est déprécié",
      "Le flux coûte moins cher",
    ],
    bonne: 1,
    pourquoi:
      "La bonne réponse d'architecte est un arbitrage, jamais une préférence. Les arrivées " +
      "tardives, la reprise et l'exactly-once coûtent cher en exploitation. Si le métier décide " +
      "une fois par jour, le flux ne sert à rien. Répondre « le flux, c'est moderne » se remarque.",
  },
  {
    type: 'qcm',
    question: "Le partitionnement d'un sujet Kafka détermine avant tout :",
    choix: [
      "La durée de rétention",
      "Le parallélisme maximal des consommateurs, et la garantie d'ordre (qui ne vaut qu'au sein d'une partition)",
      "La taille des messages",
      "Le facteur de replication",
    ],
    bonne: 1,
    pourquoi:
      "Deux conséquences liees. Un groupe ne peut pas avoir plus de consommateurs actifs que de " +
      "partitions : le partitionnement est un plafond de debit fixe à la conception. Et l'ordre " +
      "n'est garanti QUE dans une partition — d'ou le choix de la clé de partition, qui est une " +
      "décision d'architecture, pas un détail.",
  },
  {
    type: 'chiffre',
    question:
      "Un pipeline traite 50 millions de lignes par jour, en lots horaires réguliers. Combien de lignes par lot ?",
    reponse: 2083333, tolerance: 50000, unite: 'lignes/lot',
    pourquoi:
      "~2,08 millions. L'intérêt n'est pas la division : c'est de prendre le réflexe de ramener " +
      "un volume quotidien a la charge d'un lot. C'est ce chiffre qui dit si un lot tient dans " +
      "sa fenêtre horaire, et donc si le pipeline prend du retard irrattrapable.",
  },
])

// ===========================================================================
// MLOps
// ===========================================================================
skill('MLOps', { famille: 'ia', resume: 'Service de modèles, pipelines, derive, évaluation.' }, [
  {
    type: 'qcm',
    question: "Qu'est-ce que la derive (drift) qui doit déclencher une alerte en production ?",
    choix: [
      "L'augmentation de la latence",
      "Le changement de distribution des entrées ou de la relation entrée-sortie, qui dégrade le modèle sans qu'aucune erreur ne soit levee",
      "Une fuite de mémoire",
      "Un dépassement de quota",
    ],
    bonne: 1,
    pourquoi:
      "C'est la panne silencieuse propre au ML : aucune exception, aucun 500, et le modèle se " +
      "trompe de plus en plus. D'ou l'obligation de surveiller les DISTRIBUTIONS, pas seulement " +
      "la sante technique. « Define model retraining cadences, monitoring dashboards, drift " +
      "détection, and rollback procédures » : c'est exactement ce point.",
  },
  {
    type: 'qcm',
    question: "Pour une application a base de LLM, que doit contenir un jeu d'évaluation utile ?",
    choix: [
      "Uniquement des cas nominaux",
      "Des cas nominaux, des cas limites, des cas d'échec connus tires de la production, et des cas adverses (injection)",
      "Le plus grand nombre possible de cas générés automatiquement",
      "Rien : on juge a l'oeil",
    ],
    bonne: 1,
    pourquoi:
      "Un jeu d'évaluation ne sert qu'a une chose : détecter une régression avant l'utilisateur. " +
      "Il doit donc être alimente par les VRAIS échecs de production. Un jeu qui ne contient que " +
      "des cas nominaux passe toujours au vert et ne protège de rien. L'offre demande de construire " +
      "ces capacités « where they don't yet exist ».",
  },
  {
    type: 'arbitrage',
    situation: "Nouveau modèle candidat, meilleur sur le jeu d'évaluation hors-ligne. Comment le mettre en production ?",
    options: [
      "Bascule immédiate : les chiffres sont meilleurs",
      "Déploiement progressif (canari) avec metriques métier et retour arrière automatique sur seuil",
      "Le laisser en recette trois mois de plus",
      "Le proposer en option a l'utilisateur",
    ],
    recommande: 1,
    pourquoi:
      "Meilleur hors-ligne ne veut pas dire meilleur en ligne : le jeu d'évaluation ne capture " +
      "jamais toute la production. Le canari avec retour arrière AUTOMATIQUE est la réponse " +
      "attendue — le mot « automatique » compte, un retour arrière qui dépend d'un humain " +
      "réveillé a 3 h du matin n'est pas une procédure.",
  },
])

// ===========================================================================
// Azure — l'offre Indeed de depart (Deloitte)
// ===========================================================================
skill('Azure', { famille: 'cloud', resume: 'Le socle de l offre Cloud Engineer (Azure) chez Deloitte.' }, [
  {
    type: 'qcm',
    question: "Équivalent Azure d'un rôle IAM AWS attache a une ressource, pour éviter tout secret stocke ?",
    choix: ['Une chaîne de connexion dans App Settings', 'Une identité managee (Managed Identity)', 'Un principal de service avec secret', 'Une clé SAS'],
    bonne: 1,
    pourquoi:
      "L'identité managee : Azure gère le cycle de vie de l'identité, aucun secret n'est stocke " +
      "ni fait tourner à la main. Le principal de service avec secret est l'ancienne façon, et " +
      "chaque secret est une date d'expiration qu'on oubliera de renouveler un dimanche.",
  },
  {
    type: 'qcm',
    question: "Hiérarchie Azure, du plus large au plus fin ?",
    choix: [
      "Abonnement > Groupe d'administration > Groupe de ressources > Ressource",
      "Groupe d'administration > Abonnement > Groupe de ressources > Ressource",
      "Groupe de ressources > Abonnement > Ressource",
      "Locataire > Ressource > Abonnement",
    ],
    bonne: 1,
    pourquoi:
      "Groupe d'administration > Abonnement > Groupe de ressources > Ressource. Cette hiérarchie " +
      "porte les stratégies (Azure Policy) et la facturation : c'est elle qu'on dessine en premier " +
      "sur une migration d'entreprise, avant la moindre machine.",
  },
  {
    type: 'chiffre',
    question:
      "Un service doit tenir 99,9 % de disponibilité. Combien de minutes d'indisponibilite cela autorise-t-il par mois (30 jours) ?",
    reponse: 43, tolerance: 2, unite: 'minutes/mois',
    pourquoi:
      "~43 minutes. Chiffre a connaître par coeur : 99,9 % = 43 min/mois, 99,99 % = 4,3 min/mois. " +
      "C'est ce qui traduit un engagement de service en décisions concretes — 4 minutes par mois " +
      "interdit tout redémarrage manuel et impose le bascule automatique.",
  },
])

// ===========================================================================
// Communication / posture d'architecte
// ===========================================================================
skill('Communication', { famille: 'humain', resume: 'Traduire des arbitrages techniques pour des décideurs.' }, [
  {
    type: 'star',
    question:
      "Raconte une fois ou tu as du convaincre une direction non technique de renoncer a une solution " +
      "qu'elle voulait, ou d'en financer une plus chere.",
    grille: [
      "L'enjeu traduit en argent, en risque ou en délai — jamais en vocabulaire technique",
      "Deux options présentées avec leur coût, pas une seule recommandation a prendre ou a laisser",
      "La reconnaissance explicite de ce que l'option écartée avait de bon",
      "La décision finale attribuee au décideur, pas a toi",
      "Un résultat mesurable",
      "Le fait que tu aurais applique la décision même si elle avait ete contraire",
    ],
    seuil: 4,
    pourquoi:
      "« Translate complex AI tradeoffs, risks, and opportunities into clear narratives that drive " +
      "décision-making » : le jury teste si tu es un architecte ou un ingenieur qui a raison tout " +
      "seul. Le dernier critère est le plus révélateur : un architecte qui ne sait pas exécuter " +
      "une décision contraire n'est pas embauchable a ce niveau.",
  },
  {
    type: 'star',
    question: "Parle-moi d'un desaccord technique avec un ingenieur plus expérimenté que toi. Comment cela s'est-il termine ?",
    grille: [
      "Le desaccord porte sur une décision précise, pas sur une personne",
      "Ce que tu as fait pour COMPRENDRE son point avant de defendre le tien",
      "Un critère objectif introduit pour trancher (mesure, essai, coût)",
      "Le denouement, y compris si tu avais tort",
      "Ce que la relation de travail est devenue ENSUITE",
    ],
    seuil: 4,
    pourquoi:
      "« Mentor and grow engineers at all levels » : on cherche quelqu'un qui fait monter les " +
      "autres. Un recit ou tu as toujours raison est un signal négatif. Le meilleur recit est " +
      "celui ou tu avais tort et ou tu l'as dit.",
  },
])

// ===========================================================================
// Prêt-pour-les-USA — le manque le plus coûteux, et invisible depuis la France
// ===========================================================================
skill('Marche US', { famille: 'usa', resume: 'Droit au travail, CV ATS, ancrage salarial, fuseau horaire.' }, [
  {
    type: 'qcm',
    question:
      "Une annonce indique « US Remote ». Tu vis en France. Que signifie cette mention en pratique ?",
    choix: [
      "Télétravail depuis n'importe ou dans le monde",
      "Télétravail mais depuis le sol américain, avec droit de travailler aux USA — la localisation est une condition, pas une préférence",
      "Il faut déménager près du siège",
      "C'est négociable dans tous les cas",
    ],
    bonne: 1,
    pourquoi:
      "« US Remote » = a l'intérieur des États-Unis. C'est une condition d'emploi (paie, impôts, " +
      "assurance, conformité), pas un confort. Postuler en l'ignorant fait perdre du temps des " +
      "deux côtés. Les vraies pistes depuis l'etranger : les postes explicitement « international » / " +
      "« EMEA », les entreprises disposant d'une entite en France, ou le portage via un employeur de record.",
  },
  {
    type: 'qcm',
    question: "Ton CV pour une candidature aux USA doit-il porter photo, date de naissance et nationalite ?",
    choix: [
      "Oui, comme en France, cela personnalise",
      "Non : aucun des trois. Ils exposent l'employeur a un risque de discrimination et font écarter le CV",
      "Photo oui, le reste non",
      "Cela dépend de l'entreprise",
    ],
    bonne: 1,
    pourquoi:
      "Ni photo, ni age, ni nationalite, ni situation de famille. Un CV francais standard est " +
      "écarté pour cette seule raison, souvent sans être lu. Format attendu : 1 page (2 au-dela " +
      "de 10 ans d'expérience), verbes d'action, résultats chiffres, mots-clés de l'annonce " +
      "repris tels quels pour passer l'ATS.",
  },
  {
    type: 'chiffre',
    question:
      "L'offre affiche $180 375 – $230 625. Une position credible et defendable pour un profil qui coche la plupart des critères se situe a quel pourcentage de la fourchette ? (0 = bas, 100 = haut)",
    reponse: 60, tolerance: 20, unite: '% de la fourchette',
    pourquoi:
      "Autour de 50-75 %. Deux erreurs coûtent cher : demander le bas de la fourchette « pour " +
      "maximiser ses chances » (on obtient ce qu'on demande, et le signal envoye est mauvais), " +
      "ou exiger le plafond sans cocher tous les critères. Le haut se reserve a qui dépasse " +
      "l'annonce. Loi californienne et de l'État de New York obligent a publier la fourchette : " +
      "elle est une information, sers-t'en.",
  },
  {
    type: 'chiffre',
    question:
      "Poste « US Remote » aligne sur le fuseau Pacifique (PT). Depuis la France, a quelle heure locale commence une journée de travail qui debute a 9 h PT ? (heure francaise, format 24 h, ete)",
    reponse: 18, tolerance: 1, unite: 'h (heure francaise)',
    pourquoi:
      "18 h. PT est a UTC-7 l'ete, la France a UTC+2 : neuf heures d'écart. Une journée 9 h-17 h PT " +
      "se vit 18 h-2 h en France. Ce n'est pas un détail a regler plus tard : c'est une décision " +
      "de vie a prendre AVANT de postuler, et une question que le recruteur posera. Avoir la " +
      "réponse prete (« je tiens un recouvrement de 4 h, 17 h-21 h PT ») rassure ; l'improviser inquiete.",
  },
  {
    type: 'design',
    enonce:
      "Tu candidates depuis la France a un poste d'architecte IA aux USA. Conçois la candidature qui " +
      "franchit les trois filtres : la machine (ATS), le recruteur (6 secondes), l'ingenieur.",
    grille: [
      "Le statut de droit au travail est traite d'emblee, en une ligne factuelle, sans s'excuser",
      "CV 1 page, sans photo/age/nationalite, verbes d'action, résultats chiffres",
      "Les mots-clés exacts de l'annonce repris tels quels (Bedrock AgentCore, LangGraph, Terraform…)",
      "Un lien vers une réalisation qu'on peut ouvrir en 30 secondes, sans installer quoi que ce soit",
      "Un schéma d'architecture lisible par un non-specialiste",
      "La disponibilité horaire annoncee, pas dissimulee",
      "Un recit STAR pret pour chaque grande responsabilité de l'annonce",
      "Aucun mot francais residuel, aucune date au format europeen",
    ],
    seuil: 6,
    pourquoi:
      "Les trois filtres éliminent pour des raisons DIFFERENTES : la machine sur les mots-clés, " +
      "le recruteur sur la forme en six secondes, l'ingenieur sur la profondeur. Optimiser pour " +
      "un seul des trois fait echouer aux deux autres. Le lien ouvrable en 30 secondes est ce qui " +
      "manque le plus souvent — un depot Git sans demo se lit rarement.",
  },
])

// ===========================================================================
// Repli : une compétence non couverte produit quand même du travail réel
// ===========================================================================
function exercicesGeneriques(nom) {
  return [
    {
      id: slug(nom) + '-g1', skill: nom, type: 'design',
      // L'énoncé disait « écris la fiche que tu présenterais en entretien »
      // sans avoir jamais dit ce qu'était « la fiche » (13/08/2026). Un mot
      // qu'on n'a pas défini n'est pas une consigne : c'est une devinette.
      // On décrit maintenant la situation réelle, et ce qu'on attend.
      enonce:
        "L'annonce demande « " + nom + " ». En entretien, on te posera la question la plus " +
        "banale et la plus redoutable qui soit : « parlez-moi de " + nom + " ». Il faut y " +
        "répondre en deux minutes, sans réciter la documentation.\n\n" +
        "Prépare cette réponse maintenant, à voix haute, en quatre temps :\n" +
        "1. à quoi ça sert — le problème que ça résout ;\n" +
        "2. quand on ne s'en sert PAS — et pourquoi ;\n" +
        "3. ce que ça coûte — argent, exploitation, compétences à recruter ;\n" +
        "4. une panne concrète qu'on rencontre avec, et comment on la voit venir.",
      grille: [
        "Le problème que ça résout, en une phrase, sans jargon",
        "Un cas où on ne l'utilise PAS, et pourquoi",
        "Le coût : licence, exploitation, compétence à recruter",
        "Une alternative crédible, et ce qui fait pencher d'un côté",
        "Un mode de panne concret et la façon de le détecter",
      ],
      seuil: 3,
      pourquoi:
        "Ces quatre temps — rôle, limites, coût, panne — sont le format qui tient en entretien " +
        "pour n'importe quelle technologie, et ils te distinguent immédiatement. Presque tout " +
        "le monde sait répondre au point 1 ; le point 2 (quand on l'évite) et le point 4 (la " +
        "panne réelle) sont ceux qui montrent qu'on a exploité la chose, pas seulement lu sa " +
        "page d'accueil.\n\n" +
        "Note : « " + nom + " » n'a pas encore de banque d'exercices dédiée dans Blason. Cet " +
        "exercice est donc générique — du travail réel, mais moins fin que sur les compétences " +
        "couvertes.",
    },
    {
      id: slug(nom) + '-g2', skill: nom, type: 'star',
      question:
        "Raconte une chose que tu as réellement faite avec « " + nom + " ». Si tu ne l'as jamais " +
        "pratiqué, prends l'expérience la plus proche que tu aies, et dis clairement en quoi " +
        "elle diffère de ce que l'annonce demande.",
      grille: [
        "Un fait vérifiable, pas une intention ni un projet",
        "Un chiffre : durée, volume, nombre d'utilisateurs, économie réalisée",
        "L'écart avec ce que demande l'annonce, nommé sans le maquiller",
        "Ce que tu fais concrètement pour combler cet écart, avec une échéance",
      ],
      seuil: 3,
      pourquoi:
        "Nommer un écart et le plan pour le combler est mieux reçu que de le masquer : les jurys " +
        "d'architectes sondent en profondeur et la surestimation se voit en deux questions. " +
        "L'honnetete calibree est une compétence d'architecte.",
    },
  ]
}

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------
function exercicesPour(nomCompetence) {
  const s = BANQUE[nomCompetence]
  if (s) return s.exercices
  return exercicesGeneriques(nomCompetence)
}

function aUneBanque(nom) {
  return Boolean(BANQUE[nom])
}

function competencesConnues() {
  return Object.keys(BANQUE)
}

// Certaines compétences extraites d'une annonce pointent vers la même banque.
// Ex. « Bedrock », « SageMaker », « Lambda » relevent tous d'AWS.
const SYNONYMES = {
  'Amazon Web Services': 'AWS', 'Bedrock': 'AWS', 'AgentCore': 'AWS',
  'SageMaker': 'AWS', 'Lambda': 'AWS', 'EventBridge': 'AWS',
  'LangChain': 'Agents IA', 'LangGraph': 'Agents IA', 'CrewAI': 'Agents IA',
  'AutoGen': 'Agents IA', 'Agents': 'Agents IA', 'LLM': 'Agents IA',
  'IA': 'Agents IA', 'Machine Learning': 'MLOps', 'MLflow': 'MLOps',
  'PyTorch': 'MLOps', 'TensorFlow': 'MLOps', 'Kubeflow': 'MLOps',
  'Vector': 'RAG', 'Pinecone': 'RAG', 'pgvector': 'RAG', 'Embeddings': 'RAG',
  'Docker': 'Kubernetes', 'K8s': 'Kubernetes',
  'CloudFormation': 'Terraform', 'Pulumi': 'Terraform', 'IaC': 'Terraform',
  'DevOps': 'Terraform', 'CI/CD': 'Terraform', 'Ansible': 'Terraform',
  'Jenkins': 'Terraform', 'Git': 'Terraform',
  'SQL': 'Donnees', 'PostgreSQL': 'Donnees', 'MySQL': 'Donnees',
  'MongoDB': 'Donnees', 'Redis': 'Donnees',
  'Kafka': 'Donnees', 'Spark': 'Donnees', 'Snowflake': 'Donnees',
  'Airflow': 'Donnees', 'ETL': 'Donnees', 'Data warehouse': 'Donnees',
  'BigQuery': 'Donnees', 'dbt': 'Donnees',
  'ISO 27001': 'Securite', 'RGPD': 'Securite', 'SOC2': 'Securite',
  'HIPAA': 'Securite', 'IAM': 'Securite',
  'Microsoft Azure': 'Azure', 'GCP': 'AWS', 'Google Cloud': 'AWS',
  'Architecture': 'Communication', 'Conseil': 'Communication',
  'TOGAF': 'Communication',
}

// FRONTIERES DE MOT, ICI AUSSI (corrige le 13/08/2026).
//
// La correspondance souple se faisait par SOUS-CHAINE. Consequence mesuree :
// « Negociation commerciale » devenait « Agents IA », parce que le synonyme
// « IA » se trouve a l interieur de « negoc-IA-tion ». La competence d un
// commercial etait rebaptisee competence d architecte, et Blason lui servait
// des exercices sur les agents.
//
// C est exactement la faute corrigee le matin meme dans extraireCompetences
// (« eam » dans « team ») — elle vivait aussi ici, et personne ne l avait vue
// parce que jusque-la on ne normalisait que des mots d informatique. Une
// correction faite a un endroit doit etre cherchee partout ou le meme motif
// se repete.
const RE_MOT = new Map()
function contientMot(texte, mot) {
  let re = RE_MOT.get(mot)
  if (!re) {
    const echappe = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]/g, '[-\\s]')
    const debutAlnum = /^[a-z0-9]/i.test(mot)
    const finAlnum = /[a-z0-9]$/i.test(mot)
    re = new RegExp(
      (debutAlnum ? '(?<![a-z0-9])' : '') + echappe + (finAlnum ? '(?![a-z0-9])' : ''),
      'i',
    )
    RE_MOT.set(mot, re)
  }
  return re.test(texte)
}

function normaliser(nom) {
  if (BANQUE[nom]) return nom
  if (SYNONYMES[nom]) return SYNONYMES[nom]
  // Correspondance souple : « Kubernetes — Réseau » -> « Kubernetes ».
  // Sur des MOTS ENTIERS, jamais sur des fragments.
  const bas = String(nom).toLowerCase()
  for (const cle of Object.keys(BANQUE)) {
    if (contientMot(bas, cle.toLowerCase())) return cle
  }
  for (const [syn, cible] of Object.entries(SYNONYMES)) {
    if (contientMot(bas, syn.toLowerCase())) return cible
  }
  return nom
}

module.exports = {
  BANQUE, exercicesPour, aUneBanque, competencesConnues, normaliser, slug,
  SYNONYMES,
}
