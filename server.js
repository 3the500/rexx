const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// EJS 세팅
app.set('view engine', 'ejs');

// POST 요청 파싱
app.use(express.urlencoded({ extended: true }));


app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname, "public", "main.html"));
});

// 정적 파일 폴더
app.use(express.static('public'));

const path = require("path");



// 공통 유틸 (Epley + 0.5kg 반올림)
function roundToPlate(kg, step = 0.5) {
  return Math.round(kg / step) * step;
}
function epleyOneRM(w, r) {
  return w * (1 + r / 30);
}
function epleyWeightAtReps(oneRM, reps) {
  return oneRM / (1 + 0.0333 * reps);
}

// 루트 페이지 (GET): 폼만 렌더링 (쿼리 있을 경우 프리필)
app.get('/', (req, res) => {
  const w = parseFloat(req.query.w);
  const r = parseInt(req.query.r, 10);
  let oneRM, table = null;

  if (!isNaN(w) && !isNaN(r) && w > 0 && r > 0) {
    oneRM = roundToPlate(epleyOneRM(w, r));
    table = Array.from({ length: 10 }, (_, i) => {
      const reps = i + 1;
      const est = roundToPlate(epleyWeightAtReps(oneRM, reps));
      return { reps, est };
    });
  }
  res.render('form', { weight: w, reps: r, oneRM, table });
});

// 루트 페이지 (POST): JS 비활성 환경 대비 SSR
app.post('/', (req, res) => {
  const weight = parseFloat(req.body.weight);
  const reps = parseInt(req.body.reps, 10);

  if (!isNaN(weight) && !isNaN(reps) && weight > 0 && reps > 0) {
    const oneRM = roundToPlate(epleyOneRM(weight, reps));
    const table = Array.from({ length: 10 }, (_, i) => {
      const r = i + 1;
      const est = roundToPlate(epleyWeightAtReps(oneRM, r));
      return { reps: r, est };
    });
    res.render('form', { weight, reps, oneRM, table });
  } else {
    res.render('form', { weight: null, reps: null, oneRM: null, table: null });
  }
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
