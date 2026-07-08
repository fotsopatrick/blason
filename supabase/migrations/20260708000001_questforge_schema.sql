-- QuestForge — schéma complet : profils, guildes, quêtes, soumissions, XP, RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('student', 'company', 'admin');
create type public.quest_difficulty as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type public.quest_status as enum ('draft', 'published', 'archived');
create type public.assignment_status as enum ('in_progress', 'submitted', 'completed', 'abandoned');
create type public.submission_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  skills text[] not null default '{}',
  career_goal text not null default '',
  role public.user_role not null default 'student',
  xp integer not null default 0,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 3 and 40),
  emblem text not null default '🛡️',
  motto text not null default '',
  description text not null default '',
  max_members integer not null default 6 check (max_members between 3 and 6),
  xp integer not null default 0,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.guild_members (
  guild_id uuid not null references public.guilds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (guild_id, user_id),
  -- MVP : un étudiant appartient à une seule guilde à la fois.
  unique (user_id)
);

create table public.guild_messages (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  story text not null default '',
  description text not null default '',
  steps jsonb not null default '[]',            -- [{title, description}]
  skills text[] not null default '{}',
  resources jsonb not null default '[]',        -- [{label, url}]
  difficulty public.quest_difficulty not null default 'beginner',
  xp_reward integer not null default 100 check (xp_reward between 10 and 5000),
  estimated_hours integer not null default 8 check (estimated_hours between 1 and 200),
  status public.quest_status not null default 'published',
  source text not null default 'manual' check (source in ('manual', 'ai')),
  job_posting text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.quest_assignments (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  guild_id uuid references public.guilds (id) on delete cascade,
  status public.assignment_status not null default 'in_progress',
  accepted_by uuid not null references public.profiles (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  check (num_nonnulls(user_id, guild_id) = 1),
  unique (quest_id, user_id),
  unique (quest_id, guild_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.quest_assignments (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  github_url text not null default '',
  notes text not null default '',
  deliverable_urls text[] not null default '{}',
  status public.submission_status not null default 'pending',
  feedback text not null default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  guild_id uuid references public.guilds (id) on delete set null,
  quest_id uuid references public.quests (id) on delete set null,
  amount integer not null check (amount > 0),
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index guild_messages_guild_created_idx on public.guild_messages (guild_id, created_at desc);
create index quests_status_idx on public.quests (status);
create index quest_assignments_quest_idx on public.quest_assignments (quest_id);
create index quest_assignments_guild_idx on public.quest_assignments (guild_id);
create index submissions_assignment_idx on public.submissions (assignment_id);
create index xp_events_user_created_idx on public.xp_events (user_id, created_at desc);
create index xp_events_guild_created_idx on public.xp_events (guild_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers (security definer pour éviter la récursion RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.my_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_guild_member(p_guild_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guild_members
    where guild_id = p_guild_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_guild_leader(p_guild_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guild_members
    where guild_id = p_guild_id and user_id = auth.uid() and role = 'leader'
  );
$$;

-- Niveau = progression quadratique douce : niveau n atteint à 100 * n * (n-1) / 2 XP.
create or replace function public.level_for_xp(p_xp integer)
returns integer
language sql immutable
as $$
  select greatest(1, floor((1 + sqrt(1 + p_xp / 12.5)) / 2)::integer);
$$;

-- ---------------------------------------------------------------------------
-- Trigger : profil auto à l'inscription
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_username text;
  v_display text;
begin
  v_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '_', 'g')
  );
  v_username := substr(v_username, 1, 20);
  if char_length(v_username) < 3 then
    v_username := v_username || 'hero';
  end if;
  -- Suffixe en cas de collision.
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := substr(v_username, 1, 16) || '_' || substr(md5(new.id::text), 1, 4);
  end if;
  v_display := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    initcap(replace(v_username, '_', ' '))
  );
  insert into public.profiles (id, username, display_name, avatar_url, role)
  values (
    new.id,
    v_username,
    v_display,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'student')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Empêche un non-admin de modifier role / xp / is_banned sur son profil.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.xp is distinct from old.xp
      or new.is_banned is distinct from old.is_banned)
     and not public.is_admin()
     and auth.uid() is not null then
    raise exception 'role, xp et is_banned ne sont modifiables que par un admin';
  end if;
  return new;
end;
$$;

create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- RPC : rejoindre / quitter une guilde (contrôle de capacité atomique)
-- ---------------------------------------------------------------------------
create or replace function public.join_guild(p_guild_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_count integer;
  v_max integer;
begin
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;
  if exists (select 1 from public.guild_members where user_id = auth.uid()) then
    raise exception 'vous appartenez déjà à une guilde';
  end if;
  select max_members into v_max from public.guilds where id = p_guild_id for update;
  if v_max is null then
    raise exception 'guilde introuvable';
  end if;
  select count(*) into v_count from public.guild_members where guild_id = p_guild_id;
  if v_count >= v_max then
    raise exception 'guilde complète';
  end if;
  insert into public.guild_members (guild_id, user_id, role)
  values (p_guild_id, auth.uid(), 'member');
end;
$$;

create or replace function public.create_guild(
  p_name text,
  p_emblem text,
  p_motto text,
  p_description text,
  p_max_members integer default 6
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;
  if exists (select 1 from public.guild_members where user_id = auth.uid()) then
    raise exception 'vous appartenez déjà à une guilde';
  end if;
  insert into public.guilds (name, emblem, motto, description, max_members, created_by)
  values (p_name, p_emblem, p_motto, p_description, p_max_members, auth.uid())
  returning id into v_id;
  insert into public.guild_members (guild_id, user_id, role)
  values (v_id, auth.uid(), 'leader');
  return v_id;
end;
$$;

create or replace function public.leave_guild()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_guild uuid;
  v_role text;
  v_next uuid;
begin
  select guild_id, role into v_guild, v_role
  from public.guild_members where user_id = auth.uid();
  if v_guild is null then
    raise exception 'vous n''appartenez à aucune guilde';
  end if;
  delete from public.guild_members where user_id = auth.uid();
  -- Transfert du lead ou dissolution si vide.
  if v_role = 'leader' then
    select user_id into v_next
    from public.guild_members
    where guild_id = v_guild
    order by joined_at asc limit 1;
    if v_next is null then
      delete from public.guilds where id = v_guild;
    else
      update public.guild_members set role = 'leader'
      where guild_id = v_guild and user_id = v_next;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC : review d'une soumission (créateur de quête ou admin) + attribution XP
-- ---------------------------------------------------------------------------
create or replace function public.review_submission(
  p_submission_id uuid,
  p_approve boolean,
  p_feedback text default ''
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_sub public.submissions%rowtype;
  v_assignment public.quest_assignments%rowtype;
  v_quest public.quests%rowtype;
  v_member record;
begin
  select * into v_sub from public.submissions where id = p_submission_id for update;
  if v_sub.id is null then
    raise exception 'soumission introuvable';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'soumission déjà évaluée';
  end if;
  select * into v_assignment from public.quest_assignments where id = v_sub.assignment_id;
  select * into v_quest from public.quests where id = v_assignment.quest_id;
  if v_quest.created_by <> auth.uid() and not public.is_admin() then
    raise exception 'seul le créateur de la quête ou un admin peut évaluer';
  end if;

  update public.submissions
  set status = case when p_approve then 'approved'::public.submission_status
                    else 'rejected'::public.submission_status end,
      feedback = coalesce(p_feedback, ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  if p_approve then
    update public.quest_assignments
    set status = 'completed', completed_at = now()
    where id = v_assignment.id;

    if v_assignment.guild_id is not null then
      -- XP intégral pour chaque membre + XP de guilde.
      for v_member in
        select user_id from public.guild_members where guild_id = v_assignment.guild_id
      loop
        insert into public.xp_events (user_id, guild_id, quest_id, amount, reason)
        values (v_member.user_id, v_assignment.guild_id, v_quest.id, v_quest.xp_reward,
                'Quête complétée : ' || v_quest.title);
        update public.profiles set xp = xp + v_quest.xp_reward where id = v_member.user_id;
      end loop;
      update public.guilds set xp = xp + v_quest.xp_reward where id = v_assignment.guild_id;
    else
      insert into public.xp_events (user_id, quest_id, amount, reason)
      values (v_assignment.user_id, v_quest.id, v_quest.xp_reward,
              'Quête complétée : ' || v_quest.title);
      update public.profiles set xp = xp + v_quest.xp_reward where id = v_assignment.user_id;
    end if;
  else
    -- Rejet : l'équipe peut retenter.
    update public.quest_assignments set status = 'in_progress' where id = v_assignment.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC : leaderboards avec filtre temporel ('week' | 'month' | 'all')
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_users(p_period text default 'all', p_limit integer default 20)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  total_xp bigint, quests_completed bigint
)
language sql stable security definer
set search_path = public
as $$
  with cutoff as (
    select case p_period
      when 'week' then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else timestamptz '-infinity'
    end as t
  )
  select p.id, p.username, p.display_name, p.avatar_url,
         coalesce(sum(e.amount), 0)::bigint,
         count(distinct e.quest_id) filter (where e.quest_id is not null)::bigint
  from public.profiles p
  join public.xp_events e on e.user_id = p.id
  where e.created_at >= (select t from cutoff)
    and p.is_banned = false
  group by p.id
  order by 5 desc
  limit p_limit;
$$;

create or replace function public.leaderboard_guilds(p_period text default 'all', p_limit integer default 20)
returns table (
  guild_id uuid, name text, emblem text, member_count bigint,
  total_xp bigint, quests_completed bigint
)
language sql stable security definer
set search_path = public
as $$
  with cutoff as (
    select case p_period
      when 'week' then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else timestamptz '-infinity'
    end as t
  )
  select g.id, g.name, g.emblem,
         (select count(*) from public.guild_members m where m.guild_id = g.id)::bigint,
         coalesce(sum(e.amount), 0)::bigint,
         count(distinct e.quest_id) filter (where e.quest_id is not null)::bigint
  from public.guilds g
  join public.xp_events e on e.guild_id = g.id
  where e.created_at >= (select t from cutoff)
  group by g.id
  order by 5 desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- RPC : stats globales (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'accès admin requis';
  end if;
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'active_users_30d', (select count(distinct user_id) from public.xp_events where created_at >= now() - interval '30 days'),
    'total_guilds', (select count(*) from public.guilds),
    'total_quests', (select count(*) from public.quests),
    'published_quests', (select count(*) from public.quests where status = 'published'),
    'quests_completed', (select count(*) from public.quest_assignments where status = 'completed'),
    'pending_submissions', (select count(*) from public.submissions where status = 'pending'),
    'total_xp_distributed', (select coalesce(sum(amount), 0) from public.xp_events)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_messages enable row level security;
alter table public.quests enable row level security;
alter table public.quest_assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.xp_events enable row level security;

-- profiles : lisibles par tous (portfolio public), modifiables par soi/admin.
create policy "profiles_select_all" on public.profiles
  for select using (true);
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());

-- guilds : lisibles par tous ; création via RPC (security definer) ;
-- update leader/admin ; delete leader/admin.
create policy "guilds_select_all" on public.guilds
  for select using (true);
create policy "guilds_update_leader_or_admin" on public.guilds
  for update using (public.is_guild_leader(id) or public.is_admin());
create policy "guilds_delete_leader_or_admin" on public.guilds
  for delete using (public.is_guild_leader(id) or public.is_admin());

-- guild_members : lisibles par tous ; insert/delete via RPC + leader kick + self leave + admin.
create policy "guild_members_select_all" on public.guild_members
  for select using (true);
create policy "guild_members_delete" on public.guild_members
  for delete using (
    user_id = auth.uid() or public.is_guild_leader(guild_id) or public.is_admin()
  );

-- guild_messages : réservés aux membres (+ admin pour modération).
create policy "guild_messages_select_members" on public.guild_messages
  for select using (public.is_guild_member(guild_id) or public.is_admin());
create policy "guild_messages_insert_members" on public.guild_messages
  for insert with check (user_id = auth.uid() and public.is_guild_member(guild_id));
create policy "guild_messages_delete_own_or_admin" on public.guild_messages
  for delete using (user_id = auth.uid() or public.is_admin());

-- quests : publiées visibles par tous ; drafts par le créateur/admin ;
-- création réservée company/admin.
create policy "quests_select_published_or_own" on public.quests
  for select using (
    status = 'published' or created_by = auth.uid() or public.is_admin()
  );
create policy "quests_insert_company_or_admin" on public.quests
  for insert with check (
    created_by = auth.uid() and public.my_role() in ('company', 'admin')
  );
create policy "quests_update_creator_or_admin" on public.quests
  for update using (created_by = auth.uid() or public.is_admin());
create policy "quests_delete_creator_or_admin" on public.quests
  for delete using (created_by = auth.uid() or public.is_admin());

-- quest_assignments : visibles par participants, créateur de la quête, admin.
create policy "assignments_select" on public.quest_assignments
  for select using (
    user_id = auth.uid()
    or (guild_id is not null and public.is_guild_member(guild_id))
    or exists (select 1 from public.quests q where q.id = quest_id and q.created_by = auth.uid())
    or public.is_admin()
  );
create policy "assignments_insert" on public.quest_assignments
  for insert with check (
    accepted_by = auth.uid()
    and (
      user_id = auth.uid()
      or (guild_id is not null and public.is_guild_leader(guild_id))
    )
    and exists (select 1 from public.quests q where q.id = quest_id and q.status = 'published')
  );
create policy "assignments_update_participant" on public.quest_assignments
  for update using (
    user_id = auth.uid()
    or (guild_id is not null and public.is_guild_member(guild_id))
    or public.is_admin()
  );
create policy "assignments_delete_admin" on public.quest_assignments
  for delete using (public.is_admin());

-- submissions : visibles participants + créateur de quête + admin ;
-- insert par participants ; la review passe par le RPC review_submission.
create policy "submissions_select" on public.submissions
  for select using (
    submitted_by = auth.uid()
    or exists (
      select 1 from public.quest_assignments a
      where a.id = assignment_id
        and (a.user_id = auth.uid() or (a.guild_id is not null and public.is_guild_member(a.guild_id)))
    )
    or exists (
      select 1 from public.quest_assignments a
      join public.quests q on q.id = a.quest_id
      where a.id = assignment_id and q.created_by = auth.uid()
    )
    or public.is_admin()
  );
create policy "submissions_insert_participant" on public.submissions
  for insert with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.quest_assignments a
      where a.id = assignment_id
        and a.status in ('in_progress', 'submitted')
        and (a.user_id = auth.uid() or (a.guild_id is not null and public.is_guild_member(a.guild_id)))
    )
  );

-- xp_events : lisibles par tous (leaderboards/portfolio) ; écrits uniquement par les RPC definer.
create policy "xp_events_select_all" on public.xp_events
  for select using (true);

-- ---------------------------------------------------------------------------
-- Storage policies (buckets créés via config.toml : avatars, deliverables)
-- ---------------------------------------------------------------------------
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars_update_own_folder" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "deliverables_public_read" on storage.objects
  for select using (bucket_id = 'deliverables');
create policy "deliverables_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "deliverables_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Realtime : chat de guilde
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.guild_messages;

-- ---------------------------------------------------------------------------
-- Grants API (les nouvelles tables ne sont plus auto-exposées par défaut)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Sécurise les fonctions exposées : révoque l'exécution anonyme quand pertinent.
revoke execute on function public.admin_stats() from anon;
revoke execute on function public.review_submission(uuid, boolean, text) from anon;
revoke execute on function public.join_guild(uuid) from anon;
revoke execute on function public.create_guild(text, text, text, text, integer) from anon;
revoke execute on function public.leave_guild() from anon;
