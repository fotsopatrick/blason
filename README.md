# ⚔️ QuestForge

Plateforme d'apprentissage gamifiée qui transforme des offres d'emploi en **quêtes** / projets.
Les étudiants forment des **guildes**, complètent des quêtes, gagnent de l'**XP**, montent en
niveau et construisent un **portfolio** prouvant leurs compétences.

## Stack

- **Frontend** : React 18 + TypeScript + Vite + Tailwind v4 + DaisyUI 5, Framer Motion,
  TanStack React Query, React Router.
- **Backend / BaaS** : Supabase (Auth email + Google OAuth, Postgres + RLS, Realtime, Storage).
- **Génération IA** : Edge Function Supabase `generate-quest`, provider configurable
  (Claude ou DeepSeek) — la clé API reste **côté serveur**.

## Démarrage

### Prérequis
- Node 20+, Docker Desktop, Supabase CLI.

### 1. Lancer Supabase (local)
```bash
supabase start
```
Crée la base (migrations), applique le seed et les buckets Storage. Ports (préfixe `545xx`) :
API `54521`, DB `54522`, Studio `54523`, Mailpit `54524`.

### 2. Variables d'environnement frontend
Copier `.env.example` → `.env` (déjà pré-rempli avec les clés locales par défaut de Supabase) :
```
VITE_SUPABASE_URL=http://127.0.0.1:54521
VITE_SUPABASE_ANON_KEY=<clé anon locale>
```

### 3. Clé du provider IA (pour la génération de quêtes)
Copier `supabase/functions/.env.example` → `supabase/functions/.env` et renseigner :
```
AI_PROVIDER=claude          # ou deepseek
ANTHROPIC_API_KEY=sk-ant-…  # si claude
# DEEPSEEK_API_KEY=…        # si deepseek
```
Puis (re)démarrer les fonctions : `supabase functions serve` (ou relancer `supabase start`).
Sans clé, toute la plateforme fonctionne ; seule la génération IA renvoie une erreur explicite.

### 4. Lancer le front
```bash
npm install
npm run dev        # http://localhost:5173
```

## Comptes de test (seed)

| Rôle       | Email                  | Mot de passe        |
|------------|------------------------|---------------------|
| Admin      | admin@questforge.dev   | `AdminForge2026!`   |
| Entreprise | contact@technova.dev   | `CompanyForge2026!` |
| Étudiante  | aria@student.dev       | `StudentForge2026!` |

Autres étudiants (même mot de passe `StudentForge2026!`) : `kai@`, `luna@`, `milo@`, `zoe@student.dev`.

## Google OAuth (optionnel)

Désactivé par défaut. Pour l'activer en local : dans `supabase/config.toml`, passer
`[auth.external.google] enabled = true`, exporter `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
et `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, puis `supabase start`. Le bouton Google est déjà câblé
côté front (`/auth/callback`).

## Rôles & sécurité

Trois rôles en base (`profiles.role`) : `student`, `company`, `admin`. Tout est protégé par
**RLS** ; les opérations sensibles passent par des fonctions `security definer`
(`join_guild`, `create_guild`, `leave_guild`, `review_submission`, `admin_stats`, leaderboards).
Le rôle admin est vérifié via `is_admin()` côté base **et** par un guard côté front.
