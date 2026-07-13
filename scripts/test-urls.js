const urls = [
  'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80', // burger
  'https://images.unsplash.com/photo-1544025162-8315ea07fc7a?auto=format&fit=crop&w=400&q=80', // another
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80', // pizza
  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=400&q=80', // pasta
  'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80', // tacos
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80', // pizza
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=400&q=80', // food
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80' // steak
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
