const express = require('express');
const path = require('path');
const app = express();

// 🔥 배포용 포트 설정
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/favicon.ico', (req, res) => res.status(204));
app.get('/', (req, res) => {
  console.log('폼 페이지 요청 들어옴');
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

