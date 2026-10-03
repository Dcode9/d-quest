# D'Quest

D'Quest is a browser-based quiz platform that lets learners explore local quizzes and generate new quizzes instantly with AI.

## Features
- Browse and play built-in quizzes from the `quizzes/` folder
- Search existing quizzes by title, topic or grade
- AI-generated quizzes through `/api/generate-quiz`
- Quiz player with timer, scoring and progress
- Live rooms (host and join with a 6 digit PIN)
- Make your own quiz, keep it on the device or publish it

## Project Structure
- `/index.html` - home: search, library, entry buttons
- `/player.html` - solo quiz player
- `/css/` - design system: `tokens.css`, `base.css`, `components.css`, then page files (`home.css`, `play.css`, `preview-builder.css`) and `live.css` for the live room
- `/js/main.js` - home controller (ES module)
- `/js/lib/` - `dom.js`, `storage.js`, `quizzes.js` (catalog and loading), `generate.js` (AI generate and publish)
- `/js/views/` - `card.js`, `preview.js`, `builder.js`
- `/js/play/` - `main.js` (loader), `game.js` (state machine), `audio.js`
- `/js/live.js` - live room: host and player flows over Supabase realtime (markup built in JS, styled by `css/live.css`)
- `/js/lib/sfx.js` - original sound effects, synthesised with WebAudio (no audio files)
- `/js/lib/suggest.js` - picks the end-of-quiz "What next?" quizzes from the AI's candidates using the score
- `/js/config.js`, `/js/dverse-auth.js` - Supabase config and D'Verse sign-in bridge
- `/quizzes/` - built-in quiz JSON files, listed in `quizzes/index.json`
- `/api/` - serverless endpoints (unchanged)

## Adding a built-in quiz
Drop a JSON file in `quizzes/` and add its file name to `quizzes/index.json`.

## Local Quizzes Added
This repository includes these newly added quizzes:
1. **English Grammar (Grade X)**
   - Topics include noun, pronouns, adjectives, direct/indirect speech, determiners, etc.
2. **Skill: AI - Employability Skills**
3. **Skill: Communication Skills**
4. **Green Skills**

## Quiz JSON Format
Each quiz file in `quizzes/` follows this shape:
- `id` (string)
- `title` (string)
- `metadata` object with `grade`, `topic`, `difficulty`, optional `emoji`
- `questions` array of:
  - `question` (string)
  - `options` (array of 4 strings)
  - `correctIndex` (0-3)

## Running the Project
This project is static-first and can be served by any static server.

Example:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000`.

## AI Quiz Generation
D'Quest now uses the same D'Ai backend/model system as the D'Ai app.

The `/api/generate-quiz` endpoint:
- routes model generation through D'Ai's provider cascade
- grounds every generated quiz with D'Ai's web-search layer when sources are available
- validates the returned JSON and automatically runs a repair pass when the schema or question quality checks fail
- keeps model/provider API keys out of the D'Quest repository

### Vercel configuration
Set this server-side environment variable on the D'Quest Vercel project:

- `DAI_API_BASE_URL` — optional; defaults to the current D'Ai production API base.

The D'Ai project owns the provider credentials (Gemini/Groq/Cerebras/Pollinations/Inception and the web-search key), so those secrets should remain in D'Ai rather than being copied into browser code.

## Notes
- Local quiz lists are configured in:
  - `js/app.js`
  - `js/search.js`
- Add new local quiz files to both lists to make them searchable and visible in the UI.
- Search prompts can be plain topics (for example, "photosynthesis") or richer requests such as "10 challenging questions about world geography".


## End-of-quiz suggestions
The AI returns about 10 candidate next quizzes, each tagged with a kind (`fundamentals`, `same`, `related`, `deeper`, `challenge`) and a difficulty. `js/lib/suggest.js` picks three from the player's score: a low score gets easier fundamentals practice, a great score gets deeper or harder quizzes.

## AI usage guard
`api/_rate.js` protects the anonymous AI endpoint in three layers, and all of them fail open (if a counter cannot be reached the request is allowed):
1. 15 calls per 10 minutes per IP (memory of one serverless instance).
2. A per-instance hourly ceiling (`AI_INSTANCE_HOURLY_LIMIT`, default 300).
3. An optional shared daily budget across all instances (`AI_DAILY_LIMIT`, default 1500). It starts counting once this table exists in Supabase:

```sql
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_day_idx on public.ai_usage (day);
alter table public.ai_usage enable row level security;
create policy "ai_usage_insert" on public.ai_usage for insert to anon, authenticated with check (true);
create policy "ai_usage_count" on public.ai_usage for select to anon, authenticated using (true);
```
Until the table exists the shared layer stays off. The per-IP and per-instance layers cap requests, not dollars; a hard dollar limit belongs in the AI provider account.
