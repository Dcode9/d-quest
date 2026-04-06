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

## AI Quiz Generation Setup
To enable AI generation in deployed/serverless environments:
- Set `CEREBRAS_API_KEY` for `/api/generate-quiz`

## Notes
- Local quiz lists are configured in:
  - `js/app.js`
  - `js/search.js`
- Add new local quiz files to both lists to make them searchable and visible in the UI.
