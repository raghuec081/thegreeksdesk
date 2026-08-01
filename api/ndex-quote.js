// Vercel Serverless Function
// Called as: /api/index-quote?symbol=NDX
// Returns a real index quote (not an ETF proxy) using Twelve Data, which — unlike Finnhub's
// free tier — supports actual index tickers and includes 52-week range in the same call.
//
// Note: Twelve Data's exact symbol strings for indices are usually the plain name (NDX, SPX,
// DJI, RUT, VIX), but this can occasionally vary by data source. If a symbol doesn't resolve,
// this returns an error and the frontend falls back to labeled demo data rather than guessing.

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Twelve Data API key' });
  }

  try {
    const response = await fetch(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
    );
    const data = await response.json();

    if (data.status === 'error' || data.code) {
      return res.status(502).json({ error: data.message || 'Twelve Data returned an error' });
    }

    const price = parseFloat(data.close);
    const prevClose = parseFloat(data.previous_close);

    if (isNaN(price) || isNaN(prevClose)) {
      return res.status(502).json({ error: 'Unexpected response shape from Twelve Data' });
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=59');
    return res.status(200).json({
      symbol,
      name: data.name || symbol,
      price,
      change: price - prevClose,
      changePct: ((price - prevClose) / prevClose) * 100,
      dayHigh: parseFloat(data.high) || null,
      dayLow: parseFloat(data.low) || null,
      week52High: data.fifty_two_week ? parseFloat(data.fifty_two_week.high) : null,
      week52Low: data.fifty_two_week ? parseFloat(data.fifty_two_week.low) : null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch index quote', detail: err.message });
  }
}
