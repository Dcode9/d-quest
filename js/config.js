// Central place to manage Supabase credentials so deploys can override without code edits.
// Override by setting global variables before this script loads:
//   <script>window.DQUEST_SUPABASE_URL="https://YOUR-REF.supabase.co";window.DQUEST_SUPABASE_KEY="anon-key";</script>
// If nothing is provided, we fall back to the bundled demo project values.
(function() {
    const DEFAULT_URL = "https://apshufcfkoervmpizvoq.supabase.co";
    const DEFAULT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwc2h1ZmNma29lcnZtcGl6dm9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDQxOTgsImV4cCI6MjA5MDYyMDE5OH0.71IdaYCvXdudadPOyE_M2dCNAz830AHuRQFXWITCd7g";

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
