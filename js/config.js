// Central place to manage Supabase credentials so deploys can override without code edits.
// Override by setting global variables before this script loads:
//   <script>window.DQUEST_SUPABASE_URL="https://YOUR-REF.supabase.co";window.DQUEST_SUPABASE_KEY="anon-key";</script>
// If nothing is provided, we fall back to the bundled demo project values.
(function() {
    const DEFAULT_URL = "https://nlajpvlxckbgrfjfphzd.supabase.co";
    const DEFAULT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sYWpwdmx4Y2tiZ3JmamZwaHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MDgyNDQsImV4cCI6MjA4NDM4NDI0NH0.LKPu7hfb7iNwPuIn-WqR37XDwnSnwdWAPfV_IgXKF6c";

    function resolveConfig() {
        const url = window.DQUEST_SUPABASE_URL || DEFAULT_URL;
        const anonKey = window.DQUEST_SUPABASE_KEY || DEFAULT_KEY;
        return { url, anonKey };
    }

    window.getSupabaseConfig = function() {
        return resolveConfig();
    };

    window.getSupabaseHeaders = function() {
        const { anonKey } = resolveConfig();
        return {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`
        };
    };

    window.hasSupabaseConfig = function() {
        const { url, anonKey } = resolveConfig();
        return Boolean(url && anonKey && !url.includes("YOUR-REF"));
    };
})();
