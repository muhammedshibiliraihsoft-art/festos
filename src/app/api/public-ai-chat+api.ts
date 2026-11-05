import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../../core/config/supabase';
import { buildPublicFestivalContext, sanitizeResponse } from '../../services/publicAiService';

export async function POST(request: Request) {
  try {
    // 1. Fetch active API Keys from the database
    const { data: dbKeys, error: dbError } = await supabase
      .from('system_api_keys')
      .select('provider, key_value')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    let apiKeys: { provider: string, key: string }[] = [];

    if (dbKeys && dbKeys.length > 0) {
      apiKeys = dbKeys.map((k: any) => ({ provider: k.provider, key: k.key_value }));
    } else {
      // Fallback to environment variables if no DB keys exist
      const envKeyString = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || '';
      const envKeys = envKeyString.split(',').map(k => k.trim()).filter(k => k.length > 0);
      apiKeys = envKeys.map(key => ({ provider: 'gemini', key }));
    }

    if (apiKeys.length === 0) {
      console.error('No API keys configured in database or environment variables.');
      return Response.json(
        { error: 'AI Assistant is currently offline. No active API keys found.' },
        { status: 500 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { message, chatHistory = [], festivalId } = body;

    if (!message) {
      return Response.json(
        { error: 'Message field is required.' },
        { status: 400 }
      );
    }

    // 3. Resolve active festival_id if not provided
    let activeFestivalId = festivalId;
    if (!activeFestivalId) {
      const { data: activeFestival, error: festivalError } = await supabase
        .from('festival_calendar')
        .select('id')
        .eq('is_active', true)
        .order('festival_year', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (festivalError || !activeFestival) {
        console.error('Could not find an active festival calendar:', festivalError);
        return Response.json(
          { response: 'Festival is currently not active. Standings and assistant will be online soon.' }
        );
      }
      activeFestivalId = activeFestival.id;
    }

    // 4. Build public festival context (under 2KB)
    const festivalContext = await buildPublicFestivalContext(activeFestivalId);

    const currentKolkataDate = new Date().toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const currentKolkataTime = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });

    let aiText = '';
    let lastError: any = null;

    const systemInstruction = `You are the "Festos AI Assistant", a friendly, public-facing virtual chatbot for festival results and schedules.

CRITICAL SAFETY RULES:
1. You are strictly READ-ONLY. You have no ability to write or modify data.
2. You only have access to published, public-safe leaderboard results, live status, and schedules.
3. NEVER access or talk about unpublished marks, raw judge scores, admin settings, judge names, private participant data, or internal API structures.
4. If the user asks for confidential, admin, or unpublished information, you MUST reply exactly: "That information is not publicly available yet."
5. Do not speculate on results. If a result is not in the context, say it is not available.

CANDIDATE SEARCH RULES:
- When a user asks for a candidate's profile by name or chest number, provide the details found in the context.
- ALWAYS include a clickable link to their full profile using this EXACT syntax: [LINK:/candidate/{Slug}|View Candidate Profile]
  For example: [LINK:/candidate/ali-hassan-101|View Ali's Profile]
- If there are multiple candidates with the same or highly similar names, list ALL matching candidates with their respective links.
- Instead of asking them to type the chest number, provide clickable options for each matching candidate using this EXACT syntax: [OPTION:query_text|button_label]
  For example: [OPTION:Show profile for Chest No 101|Ali (Chest 101)]
- You can use this [OPTION:query|label] syntax anytime you want to give the user quick clickable buttons to choose from in your response!

MULTILINGUAL CAPABILITIES:
- You understand Malayalam, English, and Manglish (Malayalam typed in Latin letters, e.g., "aaran lead cheyyunne?", "mappila pattu result vannoo?").
- You must match the language style of the user query:
  - If they ask in Malayalam, reply in natural Malayalam.
  - If they ask in English, reply in natural English.
  - If they ask in Manglish or mixed English-Malayalam, reply in mixed Malayalam-English or Manglish style, keeping it natural, concise, and friendly.

RESPONSE STYLE:
- Keep responses concise, simple, and mobile-friendly.
- Avoid technical jargon, system configuration info, or referencing database views.
- Treat all users as guests/audience members of the festival.

FESTIVAL CONTEXT DATA:
[CONTEXT]
Current Date: ${currentKolkataDate}
Current Time: ${currentKolkataTime} (Asia/Kolkata)

${festivalContext}
[/CONTEXT]

Use the above CONTEXT to answer the user query accurately. If the context does not contain the answer, politely state that the info is not available.`;

    // 7. Loop through all provided API keys. If one fails (e.g. quota limit), try the next.
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKeyObj = apiKeys[i];
      try {
        if (apiKeyObj.provider === 'gemini') {
          // --- GEMINI LOGIC ---
          const genAI = new GoogleGenerativeAI(apiKeyObj.key);
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction,
          });

          // Map chat history for Gemini expected roles ('user' or 'model')
          const mappedHistory = chatHistory.map((h: any) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
          }));

          const chatSession = model.startChat({ history: mappedHistory });
          const result = await chatSession.sendMessage(message);
          aiText = result.response.text();
        }

        // Success! Break out of the loop
        if (aiText) break;

      } catch (err: any) {
        console.warn(`${apiKeyObj.provider.toUpperCase()} API Key failed:`, err.message);
        lastError = err;
        // Continue to the next key if this one fails (e.g. quota limit)
      }
    }

    if (!aiText) {
      throw new Error(lastError?.message || 'All provided API keys failed.');
    }

    // 8. Deduplicate repeated paragraphs (common Llama hallucination issue)
    const deduplicatedText = (() => {
      const paragraphs = aiText.split('\n').filter(p => p.trim().length > 0);
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const p of paragraphs) {
        const normalized = p.trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          unique.push(p);
        }
      }
      return unique.join('\n');
    })();

    // 9. Sanitize and return response
    const sanitizedResponse = sanitizeResponse(deduplicatedText);

    return Response.json({ response: sanitizedResponse });
  } catch (error: any) {
    console.error('Error in public-ai-chat API route:', error);
    return Response.json(
      { error: 'Something went wrong while processing your request: ' + error.message },
      { status: 500 }
    );
  }
}
