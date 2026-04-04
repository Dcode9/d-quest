# d-quest

## Live Quiz (Host/Join) Setup

This repository now includes a production live quiz flow:
- Host creates a room from any quiz card (`Host Live`)
- Players join with room code (`Join`)
- Host controls question progression
- Players submit answers in real time
- Leaderboard updates from persisted scores

### Required Supabase tables

Run this SQL in your Supabase project:

```sql
create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  quiz_id text,
  quiz_content jsonb not null,
  host_name text,
  host_token text not null,
  status text not null default 'waiting',
  current_question_index integer not null default -1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists live_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  player_name text not null,
  participant_token text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists live_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  participant_id uuid not null references live_participants(id) on delete cascade,
  question_index integer not null,
  selected_option integer not null,
  is_correct boolean not null,
  submitted_at timestamptz not null default now()
);

create unique index if not exists live_answers_unique
  on live_answers(session_id, participant_id, question_index);
```

### Required environment variables

Set in Vercel project:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `CEREBRAS_API_KEY` (for AI generation)

### Live APIs

- `POST /api/create-live-session`
- `POST /api/join-live-session`
- `GET /api/live-session-state`
- `POST /api/update-live-state`
- `POST /api/submit-live-answer`
