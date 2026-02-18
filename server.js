const express = require("express");
const path = require("path");
const { body, validationResult } = require("express-validator");

/* =========================
 * [추가 #1] 인증/DB용 라이브러리 추가
 *  - bcryptjs: 비밀번호 해시
 *  - jsonwebtoken: JWT 발급/검증
 *  - mysql2/promise: MySQL 연결
 * =======================*/
const bcrypt = require("bcryptjs"); // ✅ [추가]
const jwt = require("jsonwebtoken"); // ✅ [추가]

// DB 연결 (mysql2 설치 필요)
let pool = null;
try {
  const mysql = require("mysql2/promise");
  if (process.env.MYSQL_URL) {
    pool = mysql.createPool(process.env.MYSQL_URL);
  }
} catch (e) {
  // mysql2 없으면 DB 관련 라우트들만 실패
}

const app = express();

// ✅ 로컬 기본 8080 유지 + Railway가 주는 PORT 있으면 그걸 우선
const PORT = Number(process.env.PORT) || 8080;

// ✅ (중요) Railway 컨테이너에서 외부 접속 가능하게 바인딩
const HOST = "0.0.0.0";

// EJS 세팅
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 바디 파서
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ 헬스체크(배포 확인용)
app.get("/health", (req, res) => res.status(200).send("ok"));

// ✅ DB 연결 확인(변수/연결 확인용)
app.get("/db-ping", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        reason: "pool_not_ready (mysql2 missing or MYSQL_URL missing)",
      });
    }
    const [rows] = await pool.query("SELECT 1 AS ping");
    return res.json({ ok: true, rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================================================
 * [추가 #2] JWT 설정 + 인증 미들웨어
 *  - JWT_SECRET: Railway Variables에 꼭 넣어야 함
 *  - JWT_EXPIRES_IN: 선택(기본 7d)
 *  - Authorization: Bearer <token> 형태로 받음
 * =======================================================*/
const JWT_SECRET = process.env.JWT_SECRET; // ✅ [추가]
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // ✅ [추가]

function signToken(payload) { // ✅ [추가]
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authRequired(req, res, next) { // ✅ [추가]
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ ok: false, message: "missing_token" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: "invalid_token" });
  }
}

/* =========================================================
 * [메인 라우트]
 * =======================================================*/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "main.html"));
});

// ✅ 정적 파일 서빙
app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
 * [추가 #3] 회원가입/로그인 API (JWT 버전)
 *
 *  POST /api/auth/register
 *    body: { email, password, nickname? }
 *    - users 테이블에 저장
 *    - 성공하면 JWT 발급
 *
 *  POST /api/auth/login
 *    body: { email, password }
 *    - 비밀번호 검증
 *    - 성공하면 JWT 발급
 *
 *  GET /api/auth/me
 *    headers: Authorization: Bearer <token>
 *    - 로그인 상태 확인 (JWT 검증)
 * =======================================================*/

// ✅ 회원가입
app.post("/api/auth/register", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, message: "db_not_ready" });
    if (!JWT_SECRET) return res.status(500).json({ ok: false, message: "JWT_SECRET_not_set" });

    const { email, password, nickname } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "email_password_required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, message: "password_too_short(min_8)" });
    }

    // 이메일 중복 체크
    const [exists] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (exists.length) {
      return res.status(409).json({ ok: false, message: "email_already_exists" });
    }

    // 비번 해시
    const password_hash = await bcrypt.hash(password, 12);

    // 저장
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)",
      [email, password_hash, nickname || null]
    );

    const userId = result.insertId;

    // JWT 발급
    const token = signToken({ id: userId, email });

    return res.json({
      ok: true,
      token,
      user: { id: userId, email, nickname: nickname || null },
    });
  } catch (e) {
    console.error("register error:", e);
    return res.status(500).json({ ok: false, message: "server_error" });
  }
});

// ✅ 로그인
app.post("/api/auth/login", async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, message: "db_not_ready" });
    if (!JWT_SECRET) return res.status(500).json({ ok: false, message: "JWT_SECRET_not_set" });

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "email_password_required" });
    }

    // 유저 조회
    const [rows] = await pool.query(
      "SELECT id, email, password_hash, nickname, role FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, message: "invalid_credentials" });
    }

    const user = rows[0];

    // 비밀번호 확인
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, message: "invalid_credentials" });
    }

    // 마지막 로그인 업데이트(선택)
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    // JWT 발급
    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return res.json({
      ok: true,
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role },
    });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ ok: false, message: "server_error" });
  }
});

// ✅ 내 정보(로그인 상태 확인)
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, message: "db_not_ready" });

    const [rows] = await pool.query(
      "SELECT id, email, nickname, role, created_at, last_login_at FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (!rows.length) return res.status(404).json({ ok: false, message: "user_not_found" });

    return res.json({ ok: true, user: rows[0] });
  } catch (e) {
    console.error("me error:", e);
    return res.status(500).json({ ok: false, message: "server_error" });
  }
});

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
app.get("/index.html", (req, res) => {
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
app.post(
  "/api/calorie",
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

    const { sex, age, height_cm, weight_kg, activity, bulk_surplus = 300, cut_deficit = 300 } = req.body;

    const bmr =
      sex === "male"
        ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
        : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;

    const tdee = bmr * activity;

    const macrosFor = (kcal, wkg) => {
      const protein_g = Math.round(1.8 * wkg);
      const fat_g = Math.round(0.8 * wkg);
      const kcal_from_pf = protein_g * 4 + fat_g * 9;
      const carb_g = Math.max(0, Math.round((kcal - kcal_from_pf) / 4));
      return { protein_g, fat_g, carb_g };
    };

    const round = (n) => Math.round(n);
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    const tdeeK = round(tdee);
    const bulkK = round(tdee + clamp(+bulk_surplus, 100, 800));
    const cutK = round(tdee - clamp(+cut_deficit, 100, 800));

    return res.json({
      bmr: round(bmr),
      tdee: { kcal: tdeeK, macros: macrosFor(tdeeK, weight_kg) },
      bulk: { kcal: bulkK, macros: macrosFor(bulkK, weight_kg) },
      cut: { kcal: cutK, macros: macrosFor(cutK, weight_kg) },
    });
  }
);

/* =========================================================
 * [리스트컬 계산기 API] ✅ 추가됨
 *  POST /api/wristcurl
 *    body: { bodyweightKg, weightKg, reps(optional) }
 * =======================================================*/
// ==============================
// 리스트컬 계산기
// ==============================
function wristcurlEstimate1RM(weight, reps) {
  if (!reps || reps <= 1) return weight;
  const r = Math.min(Math.max(reps, 2), 20); // 2~20 reps만 신뢰 구간
  return weight * (1 + r / 30); // Epley
}

function wristcurlGetGrade(ratio) {
  // ratio = usedWeight / bodyweight
  if (ratio < 0.10) return { key: "입문", emoji: "🔰", range: "< 10%" };
  if (ratio < 0.18) return { key: "초급", emoji: "🟢", range: "10% ~ 18%" };
  if (ratio < 0.25) return { key: "중급", emoji: "🔵", range: "18% ~ 25%" };
  if (ratio < 0.35) return { key: "고급", emoji: "🟣", range: "25% ~ 35%" };
  return { key: "괴물", emoji: "🔴", range: "35% +" };
}

function wristcurlPercentileHint(ratio) {
  // 통계가 아니라 재미/자기점검용 문구
  if (ratio < 0.10) return "대략 하위권(입문 구간)";
  if (ratio < 0.18) return "대략 보통~초급 상위";
  if (ratio < 0.25) return "대략 상위권(중급 이상)";
  if (ratio < 0.35) return "대략 상위 10% 내외 느낌";
  return "대략 상위 1~3%급 느낌";
}

function wristcurlArmwrestlingHint(ratio) {
  if (ratio < 0.10) return "우선 폼(풀레인지/반동X)부터 고정하면 성장속도 빠름";
  if (ratio < 0.18) return "탑롤/훅 둘 다 기반 생기는 구간. 손가락+프로네이션도 같이 ㄱㄱ";
  if (ratio < 0.25) return "손목 플렉션 기반 확실. 실전에서 손목 싸움 이길 확률 올라감";
  if (ratio < 0.35) return "훅 잠재력 큼. 압박 걸 때 손목이 버텨줄 확률 높음";
  return "손목 괴물급. 상대 손목 말림 만드는 무기 가능";
}

app.post("/api/wristcurl", (req, res) => {
  try {
    const { bodyweightKg, weightKg, reps } = req.body || {};

    const bw = Number(bodyweightKg);
    const w = Number(weightKg);
    const r =
      reps === "" || reps === undefined || reps === null ? null : Number(reps);

    if (!Number.isFinite(bw) || bw <= 0) {
      return res
        .status(400)
        .json({ ok: false, message: "체중(kg)을 올바르게 입력해줘." });
    }
    if (!Number.isFinite(w) || w <= 0) {
      return res
        .status(400)
        .json({ ok: false, message: "중량(kg)을 올바르게 입력해줘." });
    }
    if (r !== null && (!Number.isFinite(r) || r <= 0)) {
      return res
        .status(400)
        .json({ ok: false, message: "반복수(reps)를 올바르게 입력해줘." });
    }

    const usedWeight = wristcurlEstimate1RM(w, r); // reps 있으면 1RM 추정
    const ratio = usedWeight / bw;
    const percentBW = ratio * 100;

    const grade = wristcurlGetGrade(ratio);

    return res.json({
      ok: true,
      input: { bodyweightKg: bw, weightKg: w, reps: r },
      result: {
        usedWeightKg: Number(usedWeight.toFixed(1)),
        percentBW: Number(percentBW.toFixed(1)),
        grade,
        percentileHint: wristcurlPercentileHint(ratio),
        armwrestlingHint: wristcurlArmwrestlingHint(ratio),
        note:
          r && r > 1
            ? "반복수를 입력해서 1RM(추정) 기준으로 계산했어."
            : "반복수 미입력: 입력 중량 기준으로 계산했어.",
      },
    });
  } catch (e) {
    console.error("wristcurl error:", e);
    return res
      .status(500)
      .json({ ok: false, message: "server_error" });
  }
});

/* =========================================================
 * [서버 실행]
 * =======================================================*/
app.listen(PORT, HOST, () => {
  console.log(`서버 실행 중: http://${HOST}:${PORT}`);
  console.log(`PORT(env)=${process.env.PORT} / MYSQL_URL=${process.env.MYSQL_URL ? "SET" : "NOT_SET"}`);
  console.log(`JWT_SECRET=${process.env.JWT_SECRET ? "SET" : "NOT_SET"} / JWT_EXPIRES_IN=${JWT_EXPIRES_IN}`);
});
