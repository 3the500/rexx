const express = require("express");
const path = require("path");
const { body, validationResult } = require("express-validator");

// (선택) DB 테스트용: mysql2 설치했을 때만 사용
// npm i mysql2
let pool = null;
try {
  const mysql = require("mysql2/promise");
  if (process.env.MYSQL_URL) {
    pool = mysql.createPool(process.env.MYSQL_URL);
  }
} catch (e) {
  // mysql2 없으면 DB 테스트 라우트만 비활성
}

const app = express();

// ✅ 로컬 기본 8080 유지 + Railway가 주는 PORT 있으면 그걸 우선
const PORT = Number(process.env.PORT) || 8080;

// ✅ (중요) Railway 컨테이너에서 외부 접속 가능하게 바인딩
const HOST = "0.0.0.0";

// EJS 세팅
app.set("view engine", "ejs");
// ✅ 혹시 Railway에서 working dir 달라도 안전하게
app.set("views", path.join(__dirname, "views"));

// 바디 파서
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ 헬스체크(배포 확인용)
app.get("/health", (req, res) => res.status(200).send("ok"));

// ✅ DB 연결 확인(변수/연결 확인용)
app.get("/db-ping", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, reason: "pool_not_ready (mysql2 missing or MYSQL_URL missing)" });
    const [rows] = await pool.query("SELECT 1 AS ping");
    return res.json({ ok: true, rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================================================
 * [메인 라우트]
 * =======================================================*/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "main.html"));
});

// ✅ 정적 파일 서빙도 __dirname 기반으로 (배포 환경에서 더 안전)
app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
 * [1RM 유틸]
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
 * [1RM 라우트]
 * =======================================================*/
app.get("/1rm", (req, res) => {
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
  res.render("form", { weight: w, reps: r, oneRM, table });
});

app.post("/1rm", (req, res) => {
  const weight = parseFloat(req.body.weight);
  const reps = parseInt(req.body.reps, 10);

  if (!isNaN(weight) && !isNaN(reps) && weight > 0 && reps > 0) {
    const oneRM = roundToPlate(epleyOneRM(weight, reps));
    const table = Array.from({ length: 10 }, (_, i) => {
      const rr = i + 1;
      const est = roundToPlate(epleyWeightAtReps(oneRM, rr));
      return { reps: rr, est };
    });
    res.render("form", { weight, reps, oneRM, table });
  } else {
    res.render("form", { weight: null, reps: null, oneRM: null, table: null });
  }
});

/* =========================================================
 * [칼로리 계산기 API]
 * =======================================================*/
app.post("/api/calorie",
  body("sex").isIn(["male", "female"]),
  body("age").isInt({ min: 10, max: 100 }),
  body("height_cm").isFloat({ min: 120, max: 230 }),
  body("weight_kg").isFloat({ min: 30, max: 250 }),
  body("activity").isFloat({ min: 1.1, max: 2.2 }),
  body("bulk_surplus").optional().isInt({ min: 100, max: 800 }),
  body("cut_deficit").optional().isInt({ min: 100, max: 800 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "invalid_input", errors: errors.array() });
    }

    const {
      sex, age,
      height_cm, weight_kg,
      activity,
      bulk_surplus = 300,
      cut_deficit = 300
    } = req.body;

    const bmr = sex === "male"
      ? (10 * weight_kg + 6.25 * height_cm - 5 * age + 5)
      : (10 * weight_kg + 6.25 * height_cm - 5 * age - 161);

    const tdee = bmr * activity;

    const macrosFor = (kcal, wkg) => {
      const protein_g = Math.round(1.8 * wkg);
      const fat_g = Math.round(0.8 * wkg);
      const kcal_from_pf = protein_g * 4 + fat_g * 9;
      const carb_g = Math.max(0, Math.round((kcal - kcal_from_pf) / 4));
      return { protein_g, fat_g, carb_g };
    };

    const round = n => Math.round(n);
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    const tdeeK = round(tdee);
    const bulkK = round(tdee + clamp(+bulk_surplus, 100, 800));
    const cutK = round(tdee - clamp(+cut_deficit, 100, 800));

    return res.json({
      bmr: round(bmr),
      tdee: { kcal: tdeeK, macros: macrosFor(tdeeK, weight_kg) },
      bulk: { kcal: bulkK, macros: macrosFor(bulkK, weight_kg) },
      cut: { kcal: cutK, macros: macrosFor(cutK, cutK ? weight_kg : weight_kg) }
    });
  }
);

/* =========================================================
 * [서버 실행]
 * =======================================================*/
app.listen(PORT, HOST, () => {
  console.log(`서버 실행 중: http://${HOST}:${PORT}`);
  console.log(`PORT(env)=${process.env.PORT} / MYSQL_URL=${process.env.MYSQL_URL ? "SET" : "NOT_SET"}`);
});
