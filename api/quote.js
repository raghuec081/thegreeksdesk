// Vercel Serverless Function
// Called by the site as: /api/quote?symbol=AAPL
// Keeps the Finnhub API key secret on the server side — never exposed to the browser.

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing API key' });
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Finnhub responded with ${response.status}`);
    }

    const data = await response.json();

    // Finnhub quote shape: c = current price, pc = previous close
    if (data.c === undefined || data.pc === undefined || data.c === 0) {
      return res.status(502).json({ error: 'No data for symbol' });
    }

    const price = data.c;
    const prevClose = data.pc;
    const chg = ((price - prevClose) / prevClose) * 100;

    // Cache for 30 seconds at the edge to stay well within free-tier rate limits
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=59');
    return res.status(200).json({ symbol, price, chg });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quote', detail: err.message });
  }
}
