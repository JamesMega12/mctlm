const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000,root=__dirname;
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json'};
http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(root,path.normalize(p));if(!f.startsWith(root))return res.writeHead(403).end();
 fs.readFile(f,(err,d)=>{if(err)return res.writeHead(404).end('Not found');res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(d)});
}).listen(PORT,()=>console.log(`Master checklist demo running at http://localhost:${PORT}`));
