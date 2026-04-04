const https = require('https');

const BASE_RSS   = 'https://www.omnycontent.com/d/playlist/178d72a7-a889-4132-8008-a5cc014ed109/c39a4cf6-7e84-43fa-bfa4-b31b00e05cfc/8a5aa674-a749-43c7-86c3-b31b00e06274/podcast.rss';
const ITUNES_URL = 'https://itunes.apple.com/lookup?id=1340384819&entity=podcastEpisode&limit=200&country=il';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

function getLastPage(xml) {
  const m = xml.match(/rel="last"[^>]*href="[^"?]*\?page=(\d+)"/)
           || xml.match(/href="[^"?]*\?page=(\d+)"[^>]*rel="last"/);
  return m ? parseInt(m[1]) : 1;
}

function extractItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`
      ));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const epMatch  = block.match(/<itunes:episode[^>]*>(\d+)<\/itunes:episode>/);
    const guidMatch = block.match(/<guid[^>]*>([^<]+)<\/guid>/);
    items.push({
      title: get('title'),
      desc:  get('description') || get('itunes:summary') || '',
      date:  get('pubDate'),
      epNum: epMatch ? parseInt(epMatch[1]) : null,
      guid:  guidMatch ? guidMatch[1].trim() : null,
    });
  }
  return items;
}

exports.handler = async () => {
  try {
    const firstPage = await fetchText(BASE_RSS);
    const lastPage  = getLastPage(firstPage);

    const [rssRest, itunesData] = await Promise.all([
      Promise.all(
        Array.from({ length: lastPage - 1 }, (_, i) =>
          fetchText(`${BASE_RSS}?page=${i + 2}`)
        )
      ),
      fetchJson(ITUNES_URL).catch(() => ({ results: [] })),
    ]);

    // Build Apple Podcasts URL map keyed by title
    const appleMap = new Map();
    for (const ep of itunesData.results || []) {
      if (ep.wrapperType === 'podcastEpisode' && ep.trackViewUrl) {
        appleMap.set((ep.trackName || '').trim(), ep.trackViewUrl);
      }
    }

    const allItems = [
      ...extractItems(firstPage),
      ...rssRest.flatMap(xml => extractItems(xml)),
    ].map(item => ({
      title:    item.title,
      desc:     item.desc,
      date:     item.date,
      epNum:    item.epNum,
      link:     appleMap.get(item.title.trim())
                || 'https://podcasts.apple.com/il/podcast/id1340384819',
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800',
      },
      body: JSON.stringify({ episodes: allItems }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
