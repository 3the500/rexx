app.get('/comment.html', (req, res) => {
  const content = req.query.content || '';
  res.send(`
    <html>
      <head><title>댓글</title></head>
      <body>
        <h1>댓글</h1>
        <p>${content}</p>
      </body>
    </html>
  `);
});

