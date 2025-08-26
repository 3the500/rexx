// db.js
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',          // 또는 네가 설정한 사용자명
  password: '',
  database: 'testdb'
});

connection.connect((err) => {
  if (err) throw err;
  console.log('✅ MySQL 연결됨');
});

module.exports = connection;

