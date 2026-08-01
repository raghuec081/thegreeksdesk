// Vercel Serverless Function
// Called as: /api/chart?symbol=AAPL  (also works for indices, e.g. /api/chart?symbol=NDX)
// Returns ~90 days of daily closes for the price chart, using Twelve Data — Finnhub's free
// tier does not include historical candles for US stocks, so this covers that gap and also
// works for real index symbols.

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
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=90&apikey=${apiKey}`
    );
    const data = await response.json();

    if (data.status === 'error' || !data.values) {
      return res.status(502).json({ error: data.message || 'No historical data available for this symbol' });
    }

    // Twelve Data returns newest-first — reverse so the chart draws left (oldest) to right (newest)
    const values = [...data.values].reverse();

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      symbol,
      dates: values.map(v => v.datetime),
      closes: values.map(v => parseFloat(v.close)),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch chart data', detail: err.message });
  }
}
