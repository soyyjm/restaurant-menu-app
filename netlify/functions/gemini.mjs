// Gemini proxy for Menu-opp. The API key lives only in Netlify env vars
// (GEMINI_API_KEY); the browser sends its Supabase session token and a short
// text, and the prompt is built here so the key cannot be used for anything else.
//
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional default),
//      GEMINI_ALLOWED_EMAILS (optional, comma-separated: only these accounts),
//      SUPABASE_URL / SUPABASE_ANON_KEY (optional overrides of the public values).

export const ALLOWED_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const SUPABASE_URL = 'https://nkteqmgslcrqiglzcsyv.supabase.co';
// Public anon key (already shipped in index.html); used only to validate user tokens.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdGVxbWdzbGNycWlnbHpjc3l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzE4NzMsImV4cCI6MjA3MTYwNzg3M30.XmyXU4LAUYorfwsXjEEjHQsOHDWGa3gESxu2xq3XPm0';
const MAX_BODY_BYTES = 4000;
const MAX_TEXT_CHARS = { dish: 200, text: 600 };
const LANG_NAMES = { es: 'Spanish', ca: 'Catalan', en: 'English' };

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    es: { type: 'string', description: 'Corrected Spanish dish name, preserving valid text when no correction is needed.' },
    ca: { type: 'string', description: 'Catalan translation of the corrected Spanish dish name.' }
  },
  required: ['es', 'ca']
};
const LEGACY_TRANSLATION_SCHEMA = {
  type: 'OBJECT',
  properties: { es: { type: 'STRING' }, ca: { type: 'STRING' } },
  required: ['es', 'ca'],
  propertyOrdering: ['es', 'ca']
};

const env = name => (globalThis.Netlify?.env?.get(name) ?? process.env[name] ?? '').trim();

export function pickModel(requested) {
  if (ALLOWED_MODELS.includes(requested)) return requested;
  const configured = env('GEMINI_MODEL');
  return ALLOWED_MODELS.includes(configured) ? configured : FALLBACK_MODEL;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function verifyUser(req) {
  const match = (req.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!match) return { error: json(401, { error: 'Inicia sesión para usar la traducción con Gemini.', code: 'no_session' }) };
  let res;
  try {
    res = await fetch(`${env('SUPABASE_URL') || SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env('SUPABASE_ANON_KEY') || SUPABASE_ANON_KEY, Authorization: `Bearer ${match[1]}` },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return { error: json(502, { error: 'No se pudo comprobar la sesión.', code: 'auth_unavailable' }) };
  }
  if (!res.ok) return { error: json(401, { error: 'La sesión ha caducado. Vuelve a iniciar sesión.', code: 'invalid_session' }) };
  const user = await res.json().catch(() => null);
  if (!user?.id) return { error: json(401, { error: 'Sesión no válida.', code: 'invalid_session' }) };
  const allowed = env('GEMINI_ALLOWED_EMAILS').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(user.email || '').toLowerCase())) {
    return { error: json(403, { error: 'Esta cuenta no tiene permiso para usar Gemini.', code: 'not_allowed' }) };
  }
  return { user };
}

function thinkingConfig(model) {
  // Gemini 3 ignores temperature/topP; keep thinking minimal for short translations.
  // 3.8 Flash does not support "minimal", so it uses "low".
  return { thinkingLevel: model.includes('flash-lite') ? 'minimal' : 'low' };
}

export function buildRequests({ task, text, model, sourceLang, targetLang }) {
  if (task === 'dish') {
    const prompt = `You are a Spanish-to-Catalan translator and Spanish proofreader for a restaurant menu.
Proofread the Spanish dish name word by word before translating it. Correct clear spelling mistakes and missing accents, but do not change valid culinary names or the meaning.
Always return the corrected Spanish in "es", even when it is unchanged. For example, "Jamon con patats fritas" must become "Jamón con patatas fritas".
Then translate that corrected Spanish into Catalan in "ca".
The dish name may have had a price supplement removed before translation. Do not invent, remove, or translate price supplements.
Return exactly one JSON object with these two string fields and no introduction, markdown, or explanation:
{"es":"corrected Spanish","ca":"Catalan translation"}

Dish name: ${JSON.stringify(text)}`;
    const base = { maxOutputTokens: 256, thinkingConfig: thinkingConfig(model) };
    return [
      { ...base, responseFormat: { text: { mimeType: 'application/json', schema: TRANSLATION_SCHEMA } } },
      // Compatibility retry with the classic structured-output fields.
      { ...base, responseMimeType: 'application/json', responseSchema: LEGACY_TRANSLATION_SCHEMA }
    ].map(generationConfig => ({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }));
  }
  const prompt = `Translate the following restaurant menu text from ${LANG_NAMES[sourceLang]} to ${LANG_NAMES[targetLang]}. Return only the translation, no explanation.\n\nText: ${JSON.stringify(text)}`;
  return [{
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 256, thinkingConfig: thinkingConfig(model) }
  }];
}

function candidateText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const final = parts.filter(p => p.text && p.thought !== true);
  return (final.length ? final : parts.filter(p => p.text)).map(p => p.text.trim()).join('\n').trim();
}

function hasCatalanJson(out) {
  try { return Boolean(String(JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || '').ca || '').trim()); }
  catch { return false; }
}

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.', code: 'method' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'Texto demasiado largo.', code: 'too_large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'Petición no válida.', code: 'bad_json' }); }

  const task = body?.task;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const sourceLang = body?.sourceLang || 'es';
  const targetLang = body?.targetLang || 'ca';
  if (!['dish', 'text'].includes(task)) return json(400, { error: 'Tarea no válida.', code: 'bad_task' });
  if (!text) return json(400, { error: 'Falta el texto.', code: 'no_text' });
  if (text.length > MAX_TEXT_CHARS[task]) return json(413, { error: 'Texto demasiado largo.', code: 'too_large' });
  if (task === 'text' && (!LANG_NAMES[sourceLang] || !LANG_NAMES[targetLang] || sourceLang === targetLang)) {
    return json(400, { error: 'Idioma no válido.', code: 'bad_lang' });
  }

  const auth = await verifyUser(req);
  if (auth.error) return auth.error;

  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return json(503, { error: 'Gemini no está configurado en el servidor (falta GEMINI_API_KEY).', code: 'no_key' });

  const model = pickModel(body?.model);
  let lastError = { status: 502, message: 'Respuesta vacía de Gemini.' };
  for (const payload of buildRequests({ task, text, model, sourceLang, targetLang })) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      lastError = { status: 504, message: 'Gemini no respondió a tiempo.' };
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Never forward Google's raw error body: it can echo request details.
      const status = res.status === 429 ? 429 : 502;
      const message = res.status === 429 ? 'Límite de Gemini alcanzado; inténtalo en un minuto.'
        : (res.status === 400 || res.status === 403) ? `Gemini rechazó la petición (HTTP ${res.status}). Revisa la clave y el modelo en Netlify.`
        : `Gemini devolvió HTTP ${res.status}.`;
      lastError = { status, message };
      // A 400 on the first structured-output shape is worth one retry with the classic shape.
      if (res.status !== 400) break;
      continue;
    }
    const out = candidateText(data);
    if (out && (task !== 'dish' || hasCatalanJson(out))) return json(200, { text: out, model });
    lastError = { status: 502, message: out ? 'Respuesta no válida (se esperaba JSON con es y ca).' : 'Respuesta vacía de Gemini.' };
  }
  return json(lastError.status, { error: lastError.message, code: 'gemini_error', model });
}

export const config = { path: '/api/gemini' };
