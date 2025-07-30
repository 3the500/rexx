const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// EJS 세팅
app.set('view engine', 'ejs');

// POST 요청 파싱
app.use(express.urlencoded({ extended: true }));

// 정적 파일 폴더 (필요하면 유지)
app.use(express.static('public'));

// 루트 페이지: form.ejs 렌더링
app.get('/', (req, res) => {
  res.render('form'); // views 폴더에 form.ejs가 있어야 함
});

// POST 요청 처리
app.post('/', (req, res) => {
  const weight = parseFloat(req.body.weight);
  const reps = parseInt(req.body.reps);

  if (!isNaN(weight) && !isNaN(reps)) {
    const oneRM = Math.round(weight * (1 + reps / 30));
    res.render('form', { oneRM }); // 결과 포함해서 렌더링
  } else {
    res.render('form'); // 입력 오류 시 다시 렌더링
  }
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

