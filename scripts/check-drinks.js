const urls = [
  'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80', // lemonade
  'https://images.unsplash.com/photo-1553530666-ba11a7dc2ae8?auto=format&fit=crop&w=400&q=80', // mango
  'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=400&q=80', // mojito
  'https://images.unsplash.com/photo-1461023058943-0708e52150fe?auto=format&fit=crop&w=400&q=80', // cold brew
  'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=400&q=80' // matcha
];

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return `${res.status} ${url}`;
  } catch (e) {
    return `ERROR ${url}`;
  }
}

Promise.all(urls.map(checkUrl)).then(results => console.log(results.join('\n')));
