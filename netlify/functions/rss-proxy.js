const https = require('https');

const BASE_URL = 'https://www.omnycontent.com/d/playlist/178d72a7-a889-4132-8008-a5cc014ed109/c39a4cf6-7e84-43fa-bfa4-b31b00e05cfc/8a5aa674-a749-43c7-86c3-b31b00e06274/podcast.rss';

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function getLastPage(xml) {
  const m = xml.match(/rel="last"[^>]*href="[^"]*\?page=(\d+)"/);
  if (!m) {
    const m2 = xml.match(/href="[^"]*\?page=(\d+)"[^>]*rel="last"/);
    return m2 ? parseInt(m2[1]) : 1;
  }
  return parseInt(m[1]);
}

function extractItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const enclosureMatch = block.match(/<enclosure[^>]+url="([^"]+)"/);
    const episodeMatch   = block.match(/<itunes:episode>(\d+)<\/itunes:episode>/);
    items.push({
      title:  get('title'),
      desc:   get('description') || get('itunes:summary') || '',
      date:   get('pubDate'),
      link:   enclosureMatch ? enclosureMatch[1] : '',
      epNum:  episodeMatch ? episodeMatch[1] : null,
    });
  }
  return items;
}

exports.handler = async () => {
  try {
    const firstPage = await fetchPage(BASE_URL);
    const lastPage  = getLastPage(firstPage);

    // fetch remaining pages in parallel
    const pagePromises = [];
    for (let p = 2; p <= lastPage; p++) {
      pagePromises.push(fetchPage(`${BASE_URL}?page=${p}`));
    }
    const rest = await Promise.all(pagePromises);

    const allItems = [
      ...extractItems(firstPage),
      ...rest.flatMap(xml => extractItems(xml)),
    ];

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
