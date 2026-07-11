-- ──────────────────────────────────────────────────────────────
-- YT AutoPilot V2 — Supabase Schema
-- Supabase dashboard > SQL Editor > New query > Paste & Run
-- ──────────────────────────────────────────────────────────────

-- 1. USERS (team members)
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  password    text not null,
  name        text not null,
  role        text not null default 'editor'
                check (role in ('admin','manager','uploader','editor')),
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- 2. CHANNELS
create table if not exists channels (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  niche            text,
  lang             text default 'Hindi',
  youtube_api_key  text,
  client_id        text,
  client_secret    text,
  refresh_token    text,
  drive_folder_id  text,
  drive_folder_name text,
  upload_time      text default '10:00',
  privacy          text default 'public'
                     check (privacy in ('public','private','unlisted')),
  auto_watch       boolean default false,
  watch_interval   int default 5,
  enabled          boolean default true,
  last_checked     timestamptz,
  created_at       timestamptz default now()
);

-- 3. UPLOAD QUEUE
create table if not exists upload_queue (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid references channels(id) on delete cascade,
  drive_link   text not null,
  title        text,
  description  text,
  tags         text,
  sched_date   date,
  sched_time   time,
  privacy      text default 'public',
  status       text default 'queued'
                 check (status in ('queued','approved','uploading','done','error','cancelled')),
  approved     boolean default false,
  approved_by  uuid references users(id),
  yt_video_id  text,
  error_msg    text,
  added_by     uuid references users(id),
  added_at     timestamptz default now(),
  done_at      timestamptz
);

-- 4. DRIVE ITEMS (detected files)
create table if not exists drive_items (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid references channels(id) on delete cascade,
  drive_file_id text unique not null,
  name         text,
  size         bigint,
  mime_type    text,
  drive_link   text,
  status       text default 'detected'
                 check (status in ('detected','queued','uploaded','ignored')),
  detected_at  timestamptz default now()
);

-- 5. ACTIVITY LOGS
create table if not exists activity_logs (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete set null,
  user_id    uuid references users(id) on delete set null,
  status     text,
  message    text,
  created_at timestamptz default now()
);

-- 6. TEAM↔CHANNEL assignments
create table if not exists team_channel_access (
  user_id    uuid references users(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  primary key (user_id, channel_id)
);

-- Indexes for fast lookups
create index if not exists idx_queue_status    on upload_queue(status);
create index if not exists idx_queue_channel   on upload_queue(channel_id);
create index if not exists idx_drive_channel   on drive_items(channel_id);
create index if not exists idx_logs_created    on activity_logs(created_at desc);
