# d-quest

## Supabase setup

The app ships with demo Supabase credentials so it works out of the box, but you should plug in your own project to avoid rate limits or outages.

1. Create a new project in Supabase.
2. Copy the project URL (e.g. `https://xyzcompany.supabase.co`) and the **anon** public API key from Project Settings → API.
3. Set them at runtime before scripts load, or edit `js/config.js`:
   ```html
   <script>
     window.DQUEST_SUPABASE_URL = "https://xyzcompany.supabase.co";
     window.DQUEST_SUPABASE_KEY = "your-anon-key";
   </script>
   ```
4. Deploy with those values injected (e.g. in Vercel, add the snippet above in a custom `_app` head or inject via environment replacement).

If Supabase isn’t configured or reachable, the app will fall back to local quizzes and log a warning. Live quizzes and cloud search require working Supabase credentials.
