const express = require('express');
const path = require("path");
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 8080;

// EJS 세팅
app.set('view engine', 'ejs');

// 바디 파서
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // 🔥 JSON 파싱 (API용)

/* =========================================================
 * [메인 라우트]  — 사이트 홈을 public/main.html로 고정
 *   - 주의: express.static 보다 "위"에 두어야 / 에서 main이 확실히 뜸
 * =======================================================*/
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// 정적 파일 서빙 (CSS/JS/이미지/정적 HTML 등)
app.use(express.static('public'));

/* =========================================================
 * [1RM 계산기 관련 유틸 함수]
 * =======================================================*/
function roundToPlate(kg, step = 0.5) {
  return Math.round(kg / step) * step;
}
function epleyOneRM(w, r) {
  return w * (1 + r / 30);
}
function epleyWeightAtReps(oneRM, reps) {
  return oneRM / (1 + 0.0333 * reps);
}

/* =========================================================
 * [1RM 계산기 라우트] — 경로를 /1rm 로 변경
 *   - form.ejs 의 <form action="..."> 도 /1rm 로 바꿔줘야 함!
 * =======================================================*/
// 1RM (GET): 쿼리 있을 경우 프리필
app.get('/1rm', (req, res) => {
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

// 1RM (POST): JS 비활성 환경 대비 SSR
app.post('/1rm', (req, res) => {
  const weight = parseFloat(req.body.weight);
  const reps = parseInt(req.body.reps, 10);

  if (!isNaN(weight) && !isNaN(reps) && weight > 0 && reps > 0) {
    const oneRM = roundToPlate(epleyOneRM(weight, reps));
    const table = Array.from({ length: 10 }, (_, i) => {
      const rr = i + 1;
      const est = roundToPlate(epleyWeightAtReps(oneRM, rr));
      return { reps: rr, est };
    });
    res.render('form', { weight, reps, oneRM, table });
  } else {
    res.render('form', { weight: null, reps: null, oneRM: null, table: null });
  }
});

/* =========================================================
 * [칼로리 계산기 API] — POST /api/calorie
 *   - 한 번에 유지/벌크/다이어트 3가지 결과 반환
 * =======================================================*/
app.post('/api/calorie',
  body('sex').isIn(['male','female']),
  body('age').isInt({ min: 10, max: 100 }),
  body('height_cm').isFloat({ min: 120, max: 230 }),
  body('weight_kg').isFloat({ min: 30, max: 250 }),
  body('activity').isFloat({ min: 1.1, max: 2.2 }),
  body('bulk_surplus').optional().isInt({ min: 100, max: 800 }),
  body('cut_deficit').optional().isInt({ min: 100, max: 800 }),
  (req,res)=>{
    const errors = validationResult(req);
    if(!errors.isEmpty()){
      return res.status(400).json({ message:'invalid_input', errors: errors.array() });
    }

    const {
      sex, age,
      height_cm, weight_kg,
      activity,
      bulk_surplus = 300,
      cut_deficit = 300
    } = req.body;

    // BMR (Mifflin-St Jeor)
    const bmr = sex === 'male'
      ? (10*weight_kg + 6.25*height_cm - 5*age + 5)
      : (10*weight_kg + 6.25*height_cm - 5*age - 161);

    const tdee = bmr * activity;

    // 매크로 계산
    const macrosFor = (kcal, wkg)=>{
      const protein_g = Math.round(1.8 * wkg);
      const fat_g     = Math.round(0.8 * wkg);
      const kcal_from_pf = protein_g*4 + fat_g*9;
      const carb_g    = Math.max(0, Math.round((kcal - kcal_from_pf) / 4));
      return { protein_g, fat_g, carb_g };
    };

    const round = n => Math.round(n);
    const clamp = (n, lo, hi)=> Math.max(lo, Math.min(hi, n));

    const tdeeK = round(tdee);
    const bulkK = round(tdee + clamp(+bulk_surplus,100,800));
    const cutK  = round(tdee - clamp(+cut_deficit,100,800));

    return res.json({
      bmr: round(bmr),
      tdee: { kcal: tdeeK, macros: macrosFor(tdeeK, weight_kg) },
      bulk: { kcal: bulkK, macros: macrosFor(bulkK, weight_kg) },
      cut:  { kcal: cutK,  macros: macrosFor(cutK,  weight_kg) }
    });
  }
);

/* =========================================================
 * [서버 실행]
 * =======================================================*/
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
