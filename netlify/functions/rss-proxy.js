const https = require('https');

const RSS_URL = 'https://www.omnycontent.com/d/playlist/178d72a7-a889-4132-8008-a5cc014ed109/c39a4cf6-7e84-43fa-bfa4-b31b00e05cfc/8a5aa674-a749-43c7-86c3-b31b00e06274/podcast.rss';

exports.handler = async () => {
  return new Promise((resolve) => {
    https.get(RSS_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=1800',
          },
          body: data,
        });
      });
    }).on('error', (err) => {
      resolve({ statusCode: 500, body: 'RSS fetch failed: ' + err.message });
    });
  });
};
