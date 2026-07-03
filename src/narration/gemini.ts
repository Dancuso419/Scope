import type { LLMFn } from './narrate.ts';

// ponytail: dev + prod transport — plain fetch to the AI Studio Generative
// Language API, no SDK. Key comes from the environment (Vercel env var in prod;
// `node --env-file=.env` locally). Only this file knows about Gemini's wire format.
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const callGemini: LLMFn = async (prompt) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // Force clean JSON and keep it near-deterministic — narration must not
      // wander from the facts it's given.
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');
  return text;
};
