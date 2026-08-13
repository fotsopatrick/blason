# Blason — image de production.
#
# POURQUOI CE FICHIER EXISTE (13/08/2026)
#
# Blason tournait en service systemd NU sur l'hôte, sous l'utilisateur
# `ubuntu`. Or cet utilisateur a `sudo NOPASSWD: ALL` et appartient au groupe
# `docker`. Une exécution de code à distance dans Blason donnait donc, en une
# étape : root sur la machine, les identifiants GitHub de `~/.git-credentials`,
# les clés SSH, et les `.env` de tous les autres projets.
#
# Un site public exposé sur Internet ne doit pas s'exécuter là. Cette image
# l'enferme : pas de shell d'hôte, pas de socket Docker, pas de sudo, pas
# d'accès aux autres dossiers, un utilisateur sans privilèges, un système de
# fichiers en lecture seule.
#
# Base Alpine et Node 22 : le serveur utilise `node:sqlite`, intégré au
# runtime depuis Node 22 — aucune dépendance native à compiler.

FROM node:22-alpine AS base

# tini : sans lui, Node est PID 1 et n'a pas de gestionnaire de signaux par
# défaut — le conteneur ignore SIGTERM et met 10 secondes à mourir à chaque
# redéploiement, en coupant les requêtes en cours.
RUN apk add --no-cache tini

WORKDIR /app

# ---------------------------------------------------------------------------
# Dépendances — étape séparée pour que le cache de couches serve : tant que
# package*.json ne bouge pas, on ne réinstalle rien.
# ---------------------------------------------------------------------------
COPY package.json package-lock.json ./
# `npm ci` installe EXACTEMENT le fichier de verrouillage — pas de version
# surprise entre la machine de développement et la production.
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------------
# Le code. On ne copie QUE ce que le serveur sert.
# Voir .dockerignore : ni .env, ni base de données, ni node_modules de l'hôte,
# ni sources React (le serveur ne sert que le build).
# ---------------------------------------------------------------------------
COPY server/ ./server/
COPY royaume/ ./royaume/
COPY dist/ ./dist/

# ---------------------------------------------------------------------------
# L'utilisateur. `node` existe déjà dans l'image officielle, uid 1000, sans
# privilèges. On ne tourne JAMAIS en root : une faille dans Node donnerait
# root DANS le conteneur, et root dans le conteneur est la première marche
# d'une évasion.
#
# /donnees accueille la base et les fichiers envoyés : c'est le seul endroit
# inscriptible, monté en volume. Tout le reste sera en lecture seule.
# ---------------------------------------------------------------------------
RUN mkdir -p /donnees && chown -R node:node /app /donnees
USER node

ENV NODE_ENV=production \
    PORT=8088 \
    HOST=0.0.0.0 \
    BLASON_DONNEES=/donnees

EXPOSE 8088

# Le conteneur se déclare malade si /api/health ne répond pas : Docker le
# redémarre au lieu de laisser un service mort recevoir du trafic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8088/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.cjs"]
