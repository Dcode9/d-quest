export default async function handler(req) {
  console.log('[HEALTH] Health check endpoint called');
  console.log('[HEALTH] Method:', req.method);
  console.log('[HEALTH] URL:', req.url);
  
  const envVars = Object.keys(process.env).filter(k => 
    k.includes('CEREBRAS') || k.includes('API') || k.includes('VERCEL')
  );
  
  console.log('[HEALTH] Available environment variables:', envVars);
  
  const hasApiKey = !!process.env.CEREBRAS_API_KEY;
  const apiKeyLength = process.env.CEREBRAS_API_KEY ? process.env.CEREBRAS_API_KEY.length : 0;
  
  const response = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'unknown',
    hasApiKey: hasApiKey,
    apiKeyLength: apiKeyLength,
    availableEnvVars: envVars,
    nodeVersion: process.version
  };
  
  console.log('[HEALTH] Response:', JSON.stringify(response, null, 2));
  
  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
