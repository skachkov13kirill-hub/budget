const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 8777;
const dir = __dirname;
const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((req, res) => {
  let p = path.join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(p)] || 'text/plain', 'Cache-Control': 'no-cache, no-store'});
    res.end(data);
  });
}).listen(port, () => console.log('http://localhost:' + port));
