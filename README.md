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
- `/css/` - design system: `tokens.css`, `base.css`, `components.css`, then page files (`home.css`, `play.css`, `preview-builder.css`) and `live-theme.css` for the live room skin
- `/js/main.js` - home controller (ES module)
- `/js/lib/` - `dom.js`, `storage.js`, `quizzes.js` (catalog and loading), `generate.js` (AI generate and publish)
- `/js/views/` - `card.js`, `preview.js`, `builder.js`
- `/js/play/` - `main.js` (loader), `game.js` (state machine), `audio.js`
- `/js/live.js` - live room logic (unchanged behaviour, themed by `css/live-theme.css`)
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
