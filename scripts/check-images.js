const urls = [
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
  'https://foodish-api.com/images/burger/burger1.jpg',
  'https://foodish-api.com/images/pizza/pizza1.jpg',
  'https://foodish-api.com/images/dessert/dessert1.jpg',
  'https://foodish-api.com/images/pasta/pasta1.jpg',
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
