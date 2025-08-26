// server.js
const express = require('express');
const db = require('./db');
const app = express();
const PORT = 4000;

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
  res.send('<a href="/employees">직원 목록 보기</a>');
});

app.get('/employees', (req, res) => {
  db.query('SELECT * FROM employees', (err, results) => {
    if (err) throw err;
    res.render('employees', { employees: results });
  });
});

app.listen(PORT, () => {
  console.log(`🌐 서버 실행 중: http://localhost:${PORT}`);
});

