# D'Quest

D'Quest is a browser-based quiz platform that lets learners explore local quizzes and generate new quizzes instantly with AI.

## Features
- Browse and play built-in quizzes from the `quizzes/` folder
- Search existing quizzes by title
- AI-generated quizzes through `/api/generate-quiz`
- Quiz player with scoring and progress flow

## Project Structure
- `/index.html` - main landing/search page
- `/player.html` - quiz player page
- `/js/` - client logic (`app.js`, `search.js`, `game.js`)
- `/quizzes/` - local quiz JSON files
- `/api/` - serverless API endpoints

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
