// Vercel Serverless Function
// Called as: /api/option-chain?symbol=SPX&type=put
// Returns a simplified, near-the-money options chain snapshot using Massive.com (formerly
// Polygon.io). Index options (SPX, NDX, VIX) require the "I:" prefix on Massive's side —
// this function adds that automatically for known index symbols.
//
// Docs: https://massive.com/docs/rest/options/snapshots/option-chain-snapshot

const INDEX_SYMBOLS = new Set(['SPX', 'NDX', 'VIX', 'RUT', 'DJI']);

export default async function handler(req, res) {
  const { symbol, type } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Massive API key' });
  }

  const upperSymbol = symbol.toUpperCase();
  const underlyingTicker = INDEX_SYMBOLS.has(upperSymbol) ? `I:${upperSymbol}` : upperSymbol;
  const contractType = type === 'call' ? 'call' : 'put';

  try {
    const url = `https://api.massive.com/v3/snapshot/options/${encodeURIComponent(underlyingTicker)}?contract_type=${contractType}&order=asc&sort=strike_price&limit=50&apiKey=${apiKey}`;
    const response = await fetch(url);
    const rawText = await response.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      // Massive didn't return JSON at all — show the raw response so we can see what happened
      return res.status(502).json({
        error: 'Non-JSON response from Massive',
        httpStatus: response.status,
        rawBody: rawText.slice(0, 500),
      });
    }

    if (!response.ok || data.status === 'ERROR' || data.status === 'NOT_AUTHORIZED' || !data.results) {
      // Surface Massive's actual error details instead of hiding them
      return res.status(502).json({
        error: 'Massive API did not return usable data',
        httpStatus: response.status,
        massiveStatus: data.status ?? null,
        massiveMessage: data.error ?? data.message ?? null,
        requestUrl: underlyingTicker,
      });
    }

    const underlyingPrice = data.results[0]?.underlying_asset?.price ?? null;

    const expirations = [...new Set(data.results.map(r => r.details?.expiration_date).filter(Boolean))].sort();
    const nearestExpiry = expirations[0] || null;

    const simplified = data.results
      .filter(r => r.details?.expiration_date === nearestExpiry)
      .filter(r => {
        if (!underlyingPrice || !r.details?.strike_price) return true;
        return Math.abs(r.details.strike_price - underlyingPrice) / underlyingPrice < 0.05;
      })
      .map(r => ({
        strike: r.details?.strike_price ?? null,
        type: r.details?.contract_type ?? null,
        expiration: r.details?.expiration_date ?? null,
        delta: r.greeks?.delta ?? null,
        theta: r.greeks?.theta ?? null,
        gamma: r.greeks?.gamma ?? null,
        iv: r.implied_volatility ?? null,
        bid: r.last_quote?.bid ?? null,
        ask: r.last_quote?.ask ?? null,
        openInterest: r.open_interest ?? null,
      }))
      .sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({
      symbol: upperSymbol,
      underlyingPrice,
      expiration: nearestExpiry,
      contractType,
      contracts: simplified,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch options chain', detail: err.message });
  }
}
