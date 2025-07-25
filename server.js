const express = require('express');
const path = require('path');
const app = express(); // 여기서 정의

app.use(express.static('public'));

app.get('/comment.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'comment.html'));
});

// ... 다른 라우팅들

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 실행 중 on port ${PORT}`);
});

