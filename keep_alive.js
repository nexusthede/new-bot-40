const http = require("http");

http.createServer((req, res) => {
  res.writeHead(200, {"Content-Type": "text/plain"});
  res.end("Bot is running!");
}).listen(process.env.PORT || 3000);
