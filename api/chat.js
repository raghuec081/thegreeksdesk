// Vercel Serverless Function
// Called as: POST /api/chat
// Private endpoint backing /assistant.html. Checks a shared password against
// ASSISTANT_PASSWORD before doing anything else, then reasons over the trade
// data in ASSISTANT_TRADE_DATA using a free OpenRouter model. This endpoint
// is not linked from any public page and has no execution capability of any
// kind, it only ever returns text.

const FREE_MODELS = [
  'google/gemma-4-31b-it:free',
  'z-ai/glm-5.2:free',
  'minimax/minimax-m3:free',
];

const SYSTEM_PROMPT_TEMPLATE = `You are a private trading journal assistant for one person only. You have access to their real historical options trades below. Your job is strictly reflective and analytical:
- Answer questions about patterns in their past trades (sizing, win rate, common mistakes)
- When they describe a trade they're considering, compare it to similar situations in their history and describe what happened before — never tell them what to do
- Never use predictive language ('this will,' 'this should go up') — only descriptive, historical language ('in similar setups, you...')
- Never suggest this reasoning applies to anyone other than this specific person and their specific data — this is not general trading advice
- If asked something outside your trade data (e.g. general market predictions), say plainly that you can only reason about their own historical data, not forecast markets
- You have no ability to place trades, connect to any account, or take any real-world action. If asked to do so, explain clearly that you're a read-only reflective tool.

Here is the trade history and notes to reason from:
{{TRADE_DATA}}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, message, history } = req.body || {};

  const expectedPassword = process.env.ASSISTANT_PASSWORD;
  if (!expectedPassword || password !== expectedPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Password-only ping from the gate screen: confirm access without
  // spending a model call or requiring a real question yet.
  if (!message || !message.trim()) {
    return res.status(200).json({ ok: true });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing OPENROUTER_API_KEY' });
  }

  const tradeData = process.env.ASSISTANT_TRADE_DATA || '(No trade data has been configured yet.)';
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{{TRADE_DATA}}', tradeData);

  const priorMessages = Array.isArray(history)
    ? history
        .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        .slice(-10)
    : [];

  const messages = [
    { role: 'system', content: systemPrompt },
    ...priorMessages,
    { role: 'user', content: message },
  ];

  const attempted = [];

  for (const model of FREE_MODELS) {
    attempted.push(model);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages }),
      });

      if (!response.ok) {
        continue;
      }

      const json = await response.json();
      const reply = json?.choices?.[0]?.message?.content;
      if (reply && reply.trim()) {
        return res.status(200).json({ reply, model });
      }
    } catch (err) {
      continue;
    }
  }

  return res.status(502).json({
    error: 'All free models failed to respond. Try again shortly, OpenRouter free models are sometimes rate-limited or temporarily unavailable.',
    attempted,
  });
}
