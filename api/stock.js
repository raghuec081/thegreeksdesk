
// Vercel Serverless Function
// Called as: /api/stock?symbol=AAPL
// Returns quote, 52-week range, a price chart (if available), and recent news for one symbol.
// Note: Finnhub's free tier does not include historical candle data for US stocks.
// If the candle request fails, we return everything else and simply omit the chart series
// (the frontend falls back to a day/52-week range bar instead of a broken chart).

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

    // Attempt historical candles for a chart. This commonly fails on Finnhub's free tier
    // for US stocks — if so, we just omit `chart` rather than error the whole response.
    let chart = null;
    try {
      const from90d = now - 90 * 24 * 60 * 60;
      const candleRes = await fetch(
        `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from90d}&to=${now}&token=${apiKey}`
      );
      if (candleRes.ok) {
        const candleData = await candleRes.json();
        if (candleData.s === 'ok' && Array.isArray(candleData.c) && candleData.c.length > 0) {
          chart = {
            timestamps: candleData.t,
            closes: candleData.c,
          };
        }
      }
    } catch (e) {
      chart = null; // silent fallback — handled on the frontend
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
      chart,
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
