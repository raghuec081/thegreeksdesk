// Vercel Serverless Function
// Called as: /api/stock?symbol=AAPL
// Returns quote, 52-week range, and recent news for one symbol using Finnhub.
// Note: the price chart is handled separately by /api/chart.js (via Twelve Data), since
// Finnhub's free tier does not include historical candle data for US stocks.

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing API key' });
  }

  const now = Math.floor(Date.now() / 1000);
  const from14d = now - 14 * 24 * 60 * 60;
  const fromDate = new Date(from14d * 1000).toISOString().split('T')[0];
  const toDate = new Date(now * 1000).toISOString().split('T')[0];

  try {
    const [quoteRes, metricRes, profileRes, newsRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&token=${apiKey}`),
    ]);

    const quote = quoteRes.ok ? await quoteRes.json() : null;
    const metric = metricRes.ok ? await metricRes.json() : null;
    const profile = profileRes.ok ? await profileRes.json() : null;
    const news = newsRes.ok ? await newsRes.json() : [];

    if (!quote || quote.c === undefined || quote.c === 0) {
      return res.status(502).json({ error: 'No quote data for symbol' });
    }

    const m = metric?.metric || {};

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      symbol,
      name: profile?.name || symbol,
      price: quote.c,
      change: quote.c - quote.pc,
      changePct: ((quote.c - quote.pc) / quote.pc) * 100,
      dayHigh: quote.h,
      dayLow: quote.l,
      open: quote.o,
      prevClose: quote.pc,
      week52High: m['52WeekHigh'] ?? null,
      week52Low: m['52WeekLow'] ?? null,
      marketCap: profile?.marketCapitalization ?? null,
      news: (news || []).slice(0, 8).map(n => ({
        headline: n.headline,
        source: n.source,
        url: n.url,
        datetime: n.datetime,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch stock data', detail: err.message });
  }
}
