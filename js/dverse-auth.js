(() => {
    const PORTAL_ORIGIN = (window.DVERSE_PORTAL_ORIGIN || 'https://dverse.fun').replace(/\/$/, '');
    const AUTH_BRIDGE_URL = `${PORTAL_ORIGIN}/auth-bridge.html`;
    const authRedirectUrl = () => `${window.location.origin}/`;
    const config = window.getSupabaseConfig ? window.getSupabaseConfig() : {};
    const client = window.supabase && config.url && config.anonKey
        ? window.supabase.createClient(config.url, config.anonKey)
        : null;
    let portalSessionPromise = null;

    function bridgeRequest(message, timeoutMs = 2500) {
        if (!PORTAL_ORIGIN || window.location.origin === PORTAL_ORIGIN || typeof document === 'undefined') {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const frame = document.createElement('iframe');
            let finished = false;

            function cleanup(value) {
                if (finished) return;
                finished = true;
                window.removeEventListener('message', onMessage);
                clearTimeout(timer);
                frame.remove();
                resolve(value);
            }

            function onMessage(event) {
                if (event.origin !== PORTAL_ORIGIN) return;
                const data = event.data || {};
                if (data.source !== 'dverse-auth-bridge' || data.requestId !== requestId) return;
                cleanup(data);
            }

            const timer = setTimeout(() => cleanup(null), timeoutMs);
            frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
            frame.setAttribute('aria-hidden', 'true');
            frame.addEventListener('load', () => {
                frame.contentWindow?.postMessage({
                    source: 'dverse-app',
                    requestId,
                    ...message
                }, PORTAL_ORIGIN);
            });
            window.addEventListener('message', onMessage);
            frame.src = AUTH_BRIDGE_URL;
            (document.body || document.documentElement).appendChild(frame);
        });
    }

    async function bootstrapFromPortal() {
        if (!client) return null;
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (data.session) return data.session;

        if (!portalSessionPromise) {
            portalSessionPromise = (async () => {
                const response = await bridgeRequest({ type: 'dverse-auth:get-session' });
                const session = response?.session;
                if (!session?.access_token || !session?.refresh_token) return null;
                const { data: restored, error: restoreError } = await client.auth.setSession({
                    access_token: session.access_token,
                    refresh_token: session.refresh_token
                });
                if (restoreError) throw restoreError;
                return restored.session || null;
            })().finally(() => {
                portalSessionPromise = null;
            });
        }
        return portalSessionPromise;
    }

    function syncSessionToPortal(session) {
        if (!session?.access_token || !session?.refresh_token) return;
        bridgeRequest({
            type: 'dverse-auth:set-session',
            session: {
                access_token: session.access_token,
                refresh_token: session.refresh_token
            }
        }, 1500).catch((error) => console.warn('[DVerse] Portal session sync failed:', error));
    }

    function render(session) {
        const label = document.getElementById('dverse-account-label');
        const button = document.getElementById('dverse-auth-button');
        const meta = session?.user?.user_metadata || {};
        const name = meta.full_name || meta.name || session?.user?.email || "D'Verse";
        if (label) label.textContent = session ? name : "D'Verse";
        if (button) button.textContent = session ? 'Sign out' : 'Sign in';
    }

    async function signIn() {
        if (!client) throw new Error('D\'Verse Supabase client is not configured.');
        window.location.href = `${PORTAL_ORIGIN}/?dverse_return_to=${encodeURIComponent(authRedirectUrl())}`;
    }

    async function signOut() {
        if (!client) return;
        const { error } = await client.auth.signOut();
        if (error) throw error;
        await bridgeRequest({ type: 'dverse-auth:sign-out' }, 1500);
    }

    window.dverseAuth = {
        supabase: client,
        getSession: bootstrapFromPortal,
        signIn,
        signOut
    };

    document.addEventListener('DOMContentLoaded', async () => {
        const button = document.getElementById('dverse-auth-button');
        let currentSession = null;

        button?.addEventListener('click', async () => {
            try {
                if (currentSession) await signOut();
                else await signIn();
                currentSession = null;
                render(null);
            } catch (error) {
                console.error('[DVerse] Auth action failed:', error);
            }
        });

        if (!client) {
            render(null);
            return;
        }

        client.auth.onAuthStateChange((event, session) => {
            if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) syncSessionToPortal(session);
            currentSession = session;
            render(session);
        });

        try {
            currentSession = await bootstrapFromPortal();
            render(currentSession);
        } catch (error) {
            console.error('[DVerse] Session restore failed:', error);
            render(null);
        }
    });
})();
