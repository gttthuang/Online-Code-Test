const http = require("node:http");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Online Code Test</title>
  </head>
  <body>
    <main>
      <h1>Online Code Test</h1>
      <p>Thin frontend placeholder. Replace this with React or your chosen frontend stack.</p>
    </main>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});

const port = Number(process.env.WEB_PORT || 5173);

server.listen(port, () => {
  console.log(`web listening on :${port}`);
});
