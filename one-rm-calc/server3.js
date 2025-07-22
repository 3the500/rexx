const express = require('express');
const app = express();
const PORT = 5000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('form');
});

app.post('/calculate', (req, res) => {
  const weight = parseFloat(req.body.weight);
  const reps = parseInt(req.body.reps);

  const epley = weight * (1 + reps / 30);
  const brzycki = weight * 36 / (37 - reps);

  res.render('result', {
    weight,
    reps,
    epley: epley.toFixed(1),
    brzycki: brzycki.toFixed(1)
  });
});

app.listen(PORT, () => {
  console.log(`🔥 서버 실행 중: http://localhost:${PORT}`);
});

