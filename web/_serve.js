var http = require('http');
var fs = require('fs');
var path = require('path');
var dir = __dirname;
var types = {'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
http.createServer(function(req,res){
  var u = req.url.split('?')[0];
  if(u==='/') u='/index.html';
  var fp = path.join(dir,u);
  fs.readFile(fp,function(e,d){
    if(e){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache'});
    res.end(d);
  });
}).listen(8777, function(){ console.log('No-cache server on 8777'); });
