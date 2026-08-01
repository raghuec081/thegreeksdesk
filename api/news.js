// Vercel Serverless Function
// Called as: /api/news
// Returns general market headlines from Finnhub for the homepage news panel.

export default async function handler(req, res) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing API key' });
  }

  try {
    const response = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${apiKey}`);
    if (!response.ok) {
      throw new Error(`Finnhub responded with ${response.status}`);
    }
    const data = await response.json();

    const headlines = (data || [])
      .filter(n => n.headline && n.url)
      .slice(0, 8)
      .map(n => ({
        headline: n.headline,
        source: n.source,
        url: n.url,
        datetime: n.datetime,
      }));

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ headlines });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch news', detail: err.message });
  }
}
