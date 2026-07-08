-- QuestForge — seed de données réalistes pour le dev local.
-- Comptes (mot de passe en clair, local uniquement) :
--   admin   : admin@questforge.dev    / AdminForge2026!
--   company : contact@technova.dev    / CompanyForge2026!
--   student : aria@student.dev        / StudentForge2026!
--   autres étudiants : kai@, luna@, milo@, zoe@student.dev / StudentForge2026!

-- ---------------------------------------------------------------------------
-- Utilisateurs auth (le trigger handle_new_user crée les profils)
-- ---------------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-4111-a111-111111111111'::uuid, 'admin@questforge.dev',  'AdminForge2026!',   'forgemaster', 'Forge Master',  'admin'),
      ('22222222-2222-4222-a222-222222222222'::uuid, 'contact@technova.dev', 'CompanyForge2026!', 'technova',    'TechNova Labs', 'company'),
      ('33333333-3333-4333-a333-333333333331'::uuid, 'aria@student.dev',     'StudentForge2026!', 'aria_dev',    'Aria Moreau',   'student'),
      ('33333333-3333-4333-a333-333333333332'::uuid, 'kai@student.dev',      'StudentForge2026!', 'kai_codes',   'Kaï Nguyen',    'student'),
      ('33333333-3333-4333-a333-333333333333'::uuid, 'luna@student.dev',     'StudentForge2026!', 'luna_js',     'Luna Diallo',   'student'),
      ('33333333-3333-4333-a333-333333333334'::uuid, 'milo@student.dev',     'StudentForge2026!', 'milo_ops',    'Milo Fontaine', 'student'),
      ('33333333-3333-4333-a333-333333333335'::uuid, 'zoe@student.dev',      'StudentForge2026!', 'zoe_data',    'Zoé Lambert',   'student')
    ) as t(id, email, password, username, display_name, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt(u.password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username', u.username, 'display_name', u.display_name, 'role', u.role),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', u.id::text, now(), now(), now()
    );
  end loop;
end;
$$;

-- Profils enrichis
update public.profiles set
  bio = 'Gardien de la Forge. Je veille sur les quêtes et les guildes.',
  skills = array['React', 'TypeScript', 'Supabase'],
  career_goal = 'Faire de QuestForge la meilleure guilde d''apprentissage'
where id = '11111111-1111-4111-a111-111111111111';

update public.profiles set
  bio = 'Studio produit. Nous forgeons des quêtes à partir de nos vraies offres d''emploi.',
  skills = array['Recrutement', 'Produit'],
  career_goal = 'Recruter les meilleurs apprentis'
where id = '22222222-2222-4222-a222-222222222222';

update public.profiles set
  bio = 'Étudiante en 3e année, fan de front-end et de design systems.',
  skills = array['React', 'TypeScript', 'Tailwind', 'Figma'],
  career_goal = 'Développeuse front-end en studio produit'
where id = '33333333-3333-4333-a333-333333333331';

update public.profiles set
  bio = 'Back-end enjoyer. Postgres est mon donjon préféré.',
  skills = array['Node.js', 'PostgreSQL', 'Docker', 'API REST'],
  career_goal = 'Ingénieur back-end'
where id = '33333333-3333-4333-a333-333333333332';

update public.profiles set
  bio = 'Full-stack en devenir, je code des side-projects tous les week-ends.',
  skills = array['JavaScript', 'React', 'Node.js'],
  career_goal = 'Développeuse full-stack en startup'
where id = '33333333-3333-4333-a333-333333333333';

update public.profiles set
  bio = 'DevOps curious. J''automatise tout ce qui bouge.',
  skills = array['Docker', 'CI/CD', 'Linux', 'Terraform'],
  career_goal = 'Ingénieur plateforme / SRE'
where id = '33333333-3333-4333-a333-333333333334';

update public.profiles set
  bio = 'Data & IA. J''aime transformer des CSV en décisions.',
  skills = array['Python', 'SQL', 'Pandas', 'Machine Learning'],
  career_goal = 'Data engineer'
where id = '33333333-3333-4333-a333-333333333335';

-- ---------------------------------------------------------------------------
-- Guildes
-- ---------------------------------------------------------------------------
insert into public.guilds (id, name, emblem, motto, description, max_members, created_by) values
  ('44444444-4444-4444-a444-444444444441', 'Les Forgerons du Code', '⚒️',
   'Le code est notre enclume', 'Guilde front & back : on forge des apps propres, testées et livrées.',
   6, '33333333-3333-4333-a333-333333333331'),
  ('44444444-4444-4444-a444-444444444442', 'Ordre du Pixel', '🐉',
   'Ship early, ship often', 'DevOps, data et automatisation. Rien ne résiste à un bon pipeline.',
   4, '33333333-3333-4333-a333-333333333334');

insert into public.guild_members (guild_id, user_id, role) values
  ('44444444-4444-4444-a444-444444444441', '33333333-3333-4333-a333-333333333331', 'leader'),
  ('44444444-4444-4444-a444-444444444441', '33333333-3333-4333-a333-333333333332', 'member'),
  ('44444444-4444-4444-a444-444444444441', '33333333-3333-4333-a333-333333333333', 'member'),
  ('44444444-4444-4444-a444-444444444442', '33333333-3333-4333-a333-333333333334', 'leader'),
  ('44444444-4444-4444-a444-444444444442', '33333333-3333-4333-a333-333333333335', 'member');

insert into public.guild_messages (guild_id, user_id, content, created_at) values
  ('44444444-4444-4444-a444-444444444441', '33333333-3333-4333-a333-333333333331', 'Bienvenue dans la forge ! On attaque la quête du dashboard cette semaine ?', now() - interval '2 days'),
  ('44444444-4444-4444-a444-444444444441', '33333333-3333-4333-a333-333333333332', 'Yes, je prends la partie API. Luna tu veux le front ?', now() - interval '2 days' + interval '10 minutes'),
  ('44444444-4444-4444-a444-444444444441', '33333333-3333-4333-a333-333333333333', 'Ça marche ! Je pousse une première maquette ce soir 🔥', now() - interval '2 days' + interval '25 minutes'),
  ('44444444-4444-4444-a444-444444444441', '33333333-3333-4333-a333-333333333331', 'La soumission a été validée, +350 XP chacun 🎉', now() - interval '5 hours'),
  ('44444444-4444-4444-a444-444444444442', '33333333-3333-4333-a333-333333333334', 'J''ai accepté la quête CI/CD pour la guilde, on se répartit les étapes ?', now() - interval '1 day'),
  ('44444444-4444-4444-a444-444444444442', '33333333-3333-4333-a333-333333333335', 'Je prends le monitoring. Tu gères le pipeline GitLab ?', now() - interval '1 day' + interval '15 minutes');

-- ---------------------------------------------------------------------------
-- Quêtes (créées par TechNova, la company)
-- ---------------------------------------------------------------------------
insert into public.quests (id, title, story, description, steps, skills, resources, difficulty, xp_reward, estimated_hours, status, source, job_posting, created_by) values
(
  '55555555-5555-4555-a555-555555555501',
  'Le Tableau de Bord du Seigneur des Ventes',
  'Le seigneur marchand de TechNova croule sous les parchemins de ventes. Forgez-lui un tableau de bord digne de ce nom.',
  'Construisez un dashboard de ventes en React : graphiques de CA mensuel, top produits et filtres par période. Les données sont fournies en JSON statique. L''objectif est de prouver votre maîtrise de la data-viz côté front, de l''état serveur et d''un design soigné.',
  '[{"title":"Mise en place & data layer","description":"Créer l''app React + TypeScript, charger le JSON de ventes via React Query et typer les données."},
    {"title":"Visualisations","description":"Implémenter 3 graphiques (CA mensuel, top produits, répartition par région) avec une lib de charts."},
    {"title":"Filtres & polish","description":"Ajouter des filtres par période, states de chargement/vide, et un design responsive propre."}]',
  array['React', 'TypeScript', 'Data-viz'],
  '[{"label":"Recharts docs","url":"https://recharts.org"},{"label":"React Query docs","url":"https://tanstack.com/query"}]',
  'intermediate', 350, 16, 'published', 'manual', null,
  '22222222-2222-4222-a222-222222222222'
),
(
  '55555555-5555-4555-a555-555555555502',
  'La Porte des Sceaux : API d''authentification',
  'Les portes du royaume s''ouvrent à quiconque murmure le bon sceau. Inacceptable. Forgez une vraie porte.',
  'Développez une API REST Node.js avec authentification JWT complète : inscription, connexion, refresh tokens, rôles user/admin et rate limiting. Livrez-la documentée et testée — c''est exactement ce qu''on attend d''un back-end junior en premier mois.',
  '[{"title":"Socle API","description":"Node.js + Express (ou Fastify), structure en couches, validation des entrées avec zod."},
    {"title":"Auth JWT","description":"Inscription, login, refresh token rotation, hash bcrypt, middleware de rôles."},
    {"title":"Qualité","description":"Tests d''intégration (Vitest/Supertest), rate limiting, README avec collection d''exemples."}]',
  array['Node.js', 'API REST', 'Sécurité'],
  '[{"label":"JWT best practices","url":"https://datatracker.ietf.org/doc/html/rfc8725"},{"label":"OWASP Auth Cheatsheet","url":"https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html"}]',
  'advanced', 500, 24, 'published', 'manual', null,
  '22222222-2222-4222-a222-222222222222'
),
(
  '55555555-5555-4555-a555-555555555503',
  'Le Pipeline Enchanté',
  'Chaque nuit, un gobelin déploie l''app à la main. Chaque nuit, il se trompe. Libérez le gobelin.',
  'Mettez en place un pipeline CI/CD complet pour une app web fournie : lint, tests, build Docker, déploiement automatique sur un environnement de staging. Bonus : preview deployments par pull request.',
  '[{"title":"Conteneurisation","description":"Dockerfile multi-stage optimisé + docker-compose pour le dev local."},
    {"title":"Pipeline CI","description":"GitHub Actions : lint, tests, build et push de l''image sur un registre."},
    {"title":"Déploiement continu","description":"Déploiement auto sur staging + healthcheck + rollback documenté."}]',
  array['Docker', 'CI/CD', 'DevOps'],
  '[{"label":"GitHub Actions docs","url":"https://docs.github.com/actions"},{"label":"Docker multi-stage","url":"https://docs.docker.com/build/building/multi-stage/"}]',
  'advanced', 450, 20, 'published', 'manual', null,
  '22222222-2222-4222-a222-222222222222'
),
(
  '55555555-5555-4555-a555-555555555504',
  'L''Oracle des Données Perdues',
  'Les archives du royaume sont un marécage de CSV. L''Oracle exige de la clarté.',
  'Nettoyez et analysez un dataset e-commerce (fourni) : pipeline Python de nettoyage, exploration statistique, et un notebook final qui raconte une histoire claire avec 5 insights actionnables et leurs visualisations.',
  '[{"title":"Nettoyage","description":"Pipeline pandas reproductible : valeurs manquantes, doublons, typage, journal des décisions."},
    {"title":"Exploration","description":"Statistiques descriptives, corrélations, segmentation clients simple (RFM)."},
    {"title":"Restitution","description":"Notebook narratif avec 5 insights, visualisations propres et recommandations business."}]',
  array['Python', 'Pandas', 'SQL'],
  '[{"label":"Pandas docs","url":"https://pandas.pydata.org/docs/"},{"label":"RFM segmentation","url":"https://en.wikipedia.org/wiki/RFM_(market_research)"}]',
  'intermediate', 300, 14, 'published', 'manual', null,
  '22222222-2222-4222-a222-222222222222'
),
(
  '55555555-5555-4555-a555-555555555505',
  'Premier Pas dans la Forge : Portfolio Éclair',
  'Tout aventurier doit d''abord forger son propre blason. Le vôtre sera en ligne ce soir.',
  'Créez et déployez votre portfolio personnel : une page responsive avec vos projets, compétences et contact. Stack libre, mais le site doit être en ligne (Vercel/Netlify/GitHub Pages), rapide et accessible. Parfait pour une première quête.',
  '[{"title":"Structure & contenu","description":"HTML sémantique ou framework au choix : hero, projets, compétences, contact."},
    {"title":"Style & responsive","description":"Design propre mobile-first, dark mode bienvenu, score Lighthouse > 90."},
    {"title":"Mise en ligne","description":"Déploiement sur Vercel/Netlify/GitHub Pages avec domaine par défaut et README."}]',
  array['HTML/CSS', 'JavaScript'],
  '[{"label":"web.dev Learn","url":"https://web.dev/learn"},{"label":"Vercel deploy","url":"https://vercel.com/docs"}]',
  'beginner', 150, 6, 'published', 'manual', null,
  '22222222-2222-4222-a222-222222222222'
),
(
  '55555555-5555-4555-a555-555555555506',
  'Le Familier Conversationnel',
  'Un familier qui répond aux voyageurs perdus : voilà ce que réclame la guilde marchande.',
  'Intégrez un chatbot IA dans une app web : interface de chat streaming, historique de conversation persisté, et prompt système configurable. L''appel au modèle doit passer par un backend qui protège la clé API.',
  '[{"title":"Backend proxy","description":"Route API qui appelle le provider IA (clé côté serveur), avec streaming de la réponse."},
    {"title":"UI de chat","description":"Interface de chat réactive : messages, streaming token par token, états d''erreur."},
    {"title":"Persistance","description":"Historique de conversations sauvegardé (Supabase/SQLite) et prompt système éditable."}]',
  array['React', 'Node.js', 'IA'],
  '[{"label":"Claude API docs","url":"https://docs.claude.com"},{"label":"Server-sent events","url":"https://developer.mozilla.org/docs/Web/API/Server-sent_events"}]',
  'intermediate', 400, 18, 'published', 'ai',
  'Développeur(se) Full-Stack IA — Startup EdTech. Vous intégrerez des fonctionnalités conversationnelles (LLM) dans notre plateforme React/Node : chat temps réel, RAG sur nos contenus pédagogiques, suivi des conversations. Requis : React, Node.js, expérience API LLM, sensibilité produit.',
  '22222222-2222-4222-a222-222222222222'
),
(
  '55555555-5555-4555-a555-555555555507',
  'Quête scellée : Refonte du Grimoire (brouillon)',
  'Un grimoire legacy attend sa refonte. Cette quête n''est pas encore ouverte aux aventuriers.',
  'Refonte d''une app legacy jQuery vers React. Brouillon en cours de rédaction par TechNova — sera publiée prochainement.',
  '[{"title":"Audit","description":"Cartographier l''existant."},{"title":"Migration","description":"Migrer écran par écran."},{"title":"Parité","description":"Vérifier la parité fonctionnelle."}]',
  array['React', 'Refactoring'],
  '[]',
  'expert', 800, 60, 'draft', 'manual', null,
  '22222222-2222-4222-a222-222222222222'
);

-- ---------------------------------------------------------------------------
-- Assignments + soumissions + XP
-- ---------------------------------------------------------------------------
-- 1) Les Forgerons du Code ont complété la quête Dashboard (validée) → +350 XP chacun.
insert into public.quest_assignments (id, quest_id, guild_id, status, accepted_by, accepted_at, completed_at) values
  ('66666666-6666-4666-a666-666666666601', '55555555-5555-4555-a555-555555555501',
   '44444444-4444-4444-a444-444444444441', 'completed',
   '33333333-3333-4333-a333-333333333331', now() - interval '12 days', now() - interval '5 hours');

insert into public.submissions (id, assignment_id, submitted_by, github_url, notes, status, feedback, reviewed_by, reviewed_at, created_at) values
  ('77777777-7777-4777-a777-777777777701', '66666666-6666-4666-a666-666666666601',
   '33333333-3333-4333-a333-333333333331',
   'https://github.com/forgerons-du-code/sales-dashboard',
   'Dashboard complet : Recharts, filtres par période, responsive. Démo déployée sur Vercel (lien dans le README).',
   'approved', 'Excellent travail d''équipe, data-viz claire et code bien structuré. Validé !',
   '22222222-2222-4222-a222-222222222222', now() - interval '5 hours', now() - interval '1 day');

insert into public.xp_events (user_id, guild_id, quest_id, amount, reason, created_at) values
  ('33333333-3333-4333-a333-333333333331', '44444444-4444-4444-a444-444444444441', '55555555-5555-4555-a555-555555555501', 350, 'Quête complétée : Le Tableau de Bord du Seigneur des Ventes', now() - interval '5 hours'),
  ('33333333-3333-4333-a333-333333333332', '44444444-4444-4444-a444-444444444441', '55555555-5555-4555-a555-555555555501', 350, 'Quête complétée : Le Tableau de Bord du Seigneur des Ventes', now() - interval '5 hours'),
  ('33333333-3333-4333-a333-333333333333', '44444444-4444-4444-a444-444444444441', '55555555-5555-4555-a555-555555555501', 350, 'Quête complétée : Le Tableau de Bord du Seigneur des Ventes', now() - interval '5 hours');

update public.profiles set xp = xp + 350 where id in
  ('33333333-3333-4333-a333-333333333331', '33333333-3333-4333-a333-333333333332', '33333333-3333-4333-a333-333333333333');
update public.guilds set xp = xp + 350 where id = '44444444-4444-4444-a444-444444444441';

-- 2) Milo a complété le portfolio en solo il y a 3 semaines → +150 XP.
insert into public.quest_assignments (id, quest_id, user_id, status, accepted_by, accepted_at, completed_at) values
  ('66666666-6666-4666-a666-666666666602', '55555555-5555-4555-a555-555555555505',
   '33333333-3333-4333-a333-333333333334', 'completed',
   '33333333-3333-4333-a333-333333333334', now() - interval '25 days', now() - interval '21 days');

insert into public.submissions (id, assignment_id, submitted_by, github_url, notes, status, feedback, reviewed_by, reviewed_at, created_at) values
  ('77777777-7777-4777-a777-777777777702', '66666666-6666-4666-a666-666666666602',
   '33333333-3333-4333-a333-333333333334',
   'https://github.com/milo-ops/portfolio',
   'Portfolio Astro déployé sur Netlify, Lighthouse 98/100/100/100.',
   'approved', 'Propre et rapide. Bien vu le dark mode.',
   '22222222-2222-4222-a222-222222222222', now() - interval '21 days', now() - interval '22 days');

insert into public.xp_events (user_id, quest_id, amount, reason, created_at) values
  ('33333333-3333-4333-a333-333333333334', '55555555-5555-4555-a555-555555555505', 150, 'Quête complétée : Premier Pas dans la Forge : Portfolio Éclair', now() - interval '21 days');
update public.profiles set xp = xp + 150 where id = '33333333-3333-4333-a333-333333333334';

-- 3) L'Ordre du Pixel a soumis la quête CI/CD → en attente de validation (démo review).
insert into public.quest_assignments (id, quest_id, guild_id, status, accepted_by, accepted_at) values
  ('66666666-6666-4666-a666-666666666603', '55555555-5555-4555-a555-555555555503',
   '44444444-4444-4444-a444-444444444442', 'submitted',
   '33333333-3333-4333-a333-333333333334', now() - interval '8 days');

insert into public.submissions (id, assignment_id, submitted_by, github_url, notes, status, created_at) values
  ('77777777-7777-4777-a777-777777777703', '66666666-6666-4666-a666-666666666603',
   '33333333-3333-4333-a333-333333333334',
   'https://github.com/ordre-du-pixel/enchanted-pipeline',
   'Pipeline GitHub Actions complet : lint + tests + build Docker + déploiement staging sur Fly.io. Monitoring Grafana Cloud en bonus.',
   'pending', now() - interval '6 hours');

-- 4) Aria a une quête solo en cours (workspace de soumission à montrer).
insert into public.quest_assignments (id, quest_id, user_id, status, accepted_by, accepted_at) values
  ('66666666-6666-4666-a666-666666666604', '55555555-5555-4555-a555-555555555506',
   '33333333-3333-4333-a333-333333333331', 'in_progress',
   '33333333-3333-4333-a333-333333333331', now() - interval '2 days');

-- 5) Zoé a une quête data en cours.
insert into public.quest_assignments (id, quest_id, user_id, status, accepted_by, accepted_at) values
  ('66666666-6666-4666-a666-666666666605', '55555555-5555-4555-a555-555555555504',
   '33333333-3333-4333-a333-333333333335', 'in_progress',
   '33333333-3333-4333-a333-333333333335', now() - interval '4 days');
