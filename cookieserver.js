const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser'); // 추가

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const correctId = 'admin';
const correctPw = '1234';

// 로그인 페이지
app.get('/', (req, res) => {
  res.send(`
    <form method="POST" action="/login">
      ID: <input name="username"><br>
      PW: <input name="password"><br>
      <button>Login</button>
    </form>
  `);
});

// 로그인 요청 처리
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === correctId && password === correctPw) {
    // 로그인 성공 → 쿠키 발급
    res.cookie('auth', 'admin-token');
    res.send('<h1>로그인 성공. <a href="/mypage">마이페이지</a></h1>');
  } else {
    res.send('<h1>로그인 실패</h1>');
  }
});

// 마이페이지 (인증 필요)
app.get('/mypage', (req, res) => {
  if (req.cookies.auth === 'admin-token') {
    res.send('<h1>관리자 페이지입니다 </h1>');
  } else {
    res.send('<h1>접근 권한 없음 </h1>');
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
