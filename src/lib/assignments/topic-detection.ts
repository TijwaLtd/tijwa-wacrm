import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * AI-powered topic detection for incoming conversations.
 *
 * Analyzes the first message to determine:
 *  - Language of the message
 *  - Topic/category (billing, technical support, sales, etc.)
 *  - Best department match from the account's configured departments
 *  - Confidence score
 *
 * Uses a lightweight prompt to minimize latency and AI credit usage.
 * Results are stored in conversation_topics and cached on the conversation.
 */

interface TopicDetectionResult {
  department_id: string | null;
  department_name: string | null;
  language: string;
  topic: string;
  confidence: number;
}

/**
 * Detect the topic, language, and best department for a conversation.
 * Returns the detection result and saves it to conversation_topics.
 */
export async function detectConversationTopic(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  messageText: string,
): Promise<TopicDetectionResult | null> {
  if (!messageText || messageText.trim().length < 3) return null;

  // 1. Get account's departments for matching
  const { data: departments } = await db
    .from('departments')
    .select('id, name, description')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (!departments || departments.length === 0) {
    // No departments configured — still detect language
    return detectLanguageOnly(db, accountId, conversationId, messageText);
  }

  // 2. Build a lightweight classification prompt
  const deptList = departments
    .map((d: { name: string; description: string | null }) =>
      `- "${d.name}": ${d.description || 'No description'}`,
    )
    .join('\n');

  const prompt = `Classify this customer message. Return ONLY a JSON object (no markdown).

Departments available:
${deptList}

Message: "${messageText.slice(0, 500)}"

Return JSON:
{
  "department": "<department name or 'general'>",
  "language": "<ISO 639-1 code: en, sw, es, fr, ar, etc>",
  "topic": "<brief topic: billing, technical, sales, onboarding, complaint, question, etc>",
  "confidence": <0.0-1.0>
}`;

  // 3. Call AI for classification
  try {
    const result = await classifyWithAI(prompt);
    if (!result) return null;

    // 4. Match department name to ID
    const matchedDept = departments.find(
      (d: { name: string }) =>
        d.name.toLowerCase() === result.department.toLowerCase(),
    );

    // 5. Save to conversation_topics
    const topicRecord = {
      conversation_id: conversationId,
      account_id: accountId,
      detected_department_id: matchedDept?.id ?? null,
      detected_language: result.language,
      detected_topic: result.topic,
      confidence: result.confidence,
    };

    await db.from('conversation_topics').upsert(topicRecord, {
      onConflict: 'conversation_id',
    });

    // 6. Cache language on conversation
    await db
      .from('conversations')
      .update({ detected_language: result.language })
      .eq('id', conversationId);

    return {
      department_id: matchedDept?.id ?? null,
      department_name: matchedDept?.name ?? result.department,
      language: result.language,
      topic: result.topic,
      confidence: result.confidence,
    };
  } catch (err) {
    console.error('[detectConversationTopic] AI classification failed:', err);
    return null;
  }
}

/**
 * Fallback: detect language only when no departments are configured.
 */
async function detectLanguageOnly(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  messageText: string,
): Promise<TopicDetectionResult | null> {
  const prompt = `Detect the language of this message. Return ONLY a JSON object:
{"language": "<ISO 639-1 code>"}

Message: "${messageText.slice(0, 200)}"`;

  try {
    const result = await classifyWithAI(prompt);
    if (!result) return null;

    const lang = (result as { language?: string }).language || 'en';

    await db.from('conversation_topics').upsert({
      conversation_id: conversationId,
      account_id: accountId,
      detected_language: lang,
      detected_topic: 'general',
      confidence: 0.5,
    }, { onConflict: 'conversation_id' });

    await db
      .from('conversations')
      .update({ detected_language: lang })
      .eq('id', conversationId);

    return {
      department_id: null,
      department_name: null,
      language: lang,
      topic: 'general',
      confidence: 0.5,
    };
  } catch {
    return null;
  }
}

/**
 * Call AI for classification. Uses the existing AI infrastructure
 * but with a minimal prompt for fast, cheap classification.
 */
async function classifyWithAI(prompt: string): Promise<Record<string, unknown> | null> {
  // Use the configured AI provider
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_CLASSIFICATION_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    console.warn('[classifyWithAI] no AI API key configured');
    return null;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a classification assistant. Return ONLY valid JSON, no markdown, no explanation.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    console.error('[classifyWithAI] API error:', response.status);
    return null;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error('[classifyWithAI] failed to parse JSON:', content);
    return null;
  }
}
