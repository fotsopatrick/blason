# Blason

Plateforme (React + Vite + TypeScript) qui transforme des offres d'emploi en **quêtes** : les étudiants forment des **guildes**, complètent des quêtes, gagnent de l'**XP**, montent en niveau et construisent un **portfolio** de réalisations. Un volet carrière regroupe les offres par domaine, les entretiens et les projets qui montrent ce qu'on sait faire.

## Backend

100 % local — Express + SQLite natif Node (`node:sqlite`). **Aucun service payant, aucune IA externe, aucune donnée qui sort de ta machine.** La génération des quêtes se fait sur place, par analyse de l'annonce. Les données vivent dans un fichier `server/blason.db`, créé automatiquement au premier démarrage du serveur. Les uploads (avatars, livrables) sont stockés dans `server/storage/`.

## Démarrage

Prérequis : Node 22+ (avec support de `node:sqlite`).

**Production / usage simple — 3 étapes :**

```bash
npm install
npm run build      # construit le front dans dist/
npm start          # serveur sur http://localhost:8088 — sert le front + l'API
```

**En développement — deux terminaux :**

```bash
# Terminal 1 : l'API (port 8088)
npm start

# Terminal 2 : le front Vite (port 5173, rechargement à chaud)
npm run dev
```

## Configuration — les clés

Copie `.env.example` en `.env` à la racine, puis remplis-le :

```bash
cp .env.example .env
```

`.env` est ignoré par git : **tes secrets ne partent jamais sur GitHub.**

| Variable | Obligatoire | À quoi ça sert |
|---|---|---|
| `JWT_SECRET` | **oui** | signe les sessions. Génère-le : `openssl rand -base64 48` |
| `PORT` | non | port du serveur, 8088 par défaut |
| `HOST` | non | `127.0.0.1` en local, `0.0.0.0` derrière un reverse proxy |
| `GOOGLE_CLIENT_ID` | non | connexion Google. Sans, seul le compte + mot de passe marche |
| `GOOGLE_CLIENT_SECRET` | non | idem |
| `GOOGLE_REDIRECT_URI` | non | doit être **exactement** l'URI déclarée chez Google |
| `VITE_API_URL` | dev seulement | en production, laisse-la vide : le serveur sert le front et l'API |

### Obtenir les identifiants Google, en cinq minutes

1. `console.cloud.google.com` → crée un projet
2. **API et services** → **Écran de consentement OAuth** → renseigne-le
3. **Identifiants** → **Créer des identifiants** → **ID client OAuth** → *Application Web*
4. Dans **URI de redirection autorisés**, colle exactement la même valeur que
   `GOOGLE_REDIRECT_URI`. Une différence d'un caractère et Google refuse
   sans dire pourquoi.

En local : `http://localhost:8088/api/auth/google/callback`

Sur un shell Unix, `npm run dev:all` lance les deux d'un coup. Sur Windows, préfère deux terminaux.

## Comptes

À la première utilisation, il faut s'inscrire avec une adresse email et un mot de passe (au moins 8 caractères). Aucun compte n'est pré-rempli.

## Structure des dossiers

```
server/        Serveur Express + schéma SQLite (index.cjs, schema.sql)
src/           Front React (pages, composants, lib)
dist/          Build statique du front (généré par npm run build)
```

## Déploiement

Deux options selon le besoin :

- **GitHub Pages** — déploie uniquement le build statique (`npm run build`, publier `dist/`). Le site est consultable, mais **sans persistance** : les comptes et les données ne survivent pas (pas de serveur).
- **Petit VPS / serveur Node** — `npm install && npm run build && npm start`. Le serveur sert le front **et** l'API, et les données sont persistées dans `server/blason.db`. C'est l'option recommandée dès qu'on veut garder les comptes et les données.

En français, un vocabulaire produit simple : une quête menée à bien est une **réalisation**, un **projet**, un **atout** à présenter.
