const http=require('http');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {WebSocketServer,WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');const GAME_VERSION='5.2-github-multiplayer-r2';const rooms=new Map();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost')}catch{res.writeHead(400).end();return}
 if(url.pathname==='/version.json'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify({version:GAME_VERSION}));return}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return}
 if(file===root)file=path.join(root,'index.html');
 fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404).end('Nao encontrado');return}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res)})
});
const wss=new WebSocketServer({server,path:'/ws'});
const send=(ws,data)=>{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data))};
const peers=room=>[room.host,room.guest].filter(Boolean);
const broadcast=(room,data)=>peers(room).forEach(ws=>send(ws,data));
const drop=ws=>{const id=ws.room;if(!id)return;const room=rooms.get(id);if(!room)return;
 if(room.host===ws)room.host=null;if(room.guest===ws)room.guest=null;
 broadcast(room,{type:'presence',players:peers(room).length});
 if(!room.host&&!room.guest)rooms.delete(id);ws.room=null};
wss.on('connection',ws=>{
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
 if(typeof m!=='object'||!m)return;
 if(m.version!==GAME_VERSION){send(ws,{type:'version_mismatch',serverVersion:GAME_VERSION});return;}
 if(m.type==='create'){
  if(ws.room)return send(ws,{type:'error',message:'Voce ja esta em uma sala.'});
  const id=crypto.randomBytes(5).toString('hex').toUpperCase();rooms.set(id,{host:ws,guest:null,started:false,side:null,order:null});ws.room=id;ws.role='host';
  send(ws,{type:'created',room:id,role:'host',version:GAME_VERSION});broadcast(rooms.get(id),{type:'presence',players:1});return;
 }
 if(m.type==='join'){
  if(ws.room)return send(ws,{type:'error',message:'Voce ja esta em uma sala.'});
  const id=String(m.room||'').toUpperCase();const room=rooms.get(id);
  if(!room||!room.host||room.guest||room.started)return send(ws,{type:'error',message:'Sala nao encontrada, iniciada ou lotada.'});
  room.guest=ws;ws.room=id;ws.role='guest';send(ws,{type:'joined',room:id,role:'guest',version:GAME_VERSION});broadcast(room,{type:'presence',players:2});return;
 }
 const room=rooms.get(ws.room);if(!room)return send(ws,{type:'error',message:'Entre em uma sala primeiro.'});
 if(m.type==='start'){
  if(room.host!==ws||!room.guest||room.started)return send(ws,{type:'error',message:'Somente o anfitriao inicia com dois jogadores.'});
  const factionMembers={Demacia:['garen','vayne','lux','sona','galio'],Noxus:['darius','draven','leblanc','swain','sion'],Freljord:['ashe','sejuani','braum','nunu','tryndamere']};const factions=m.factions||{red:'Demacia',blue:'Noxus'};const valid=new Set([...factionMembers[factions.red]||[],...factionMembers[factions.blue]||[]]);
  if(!Array.isArray(m.order)||m.order.length!==10||new Set(m.order).size!==10||m.order.some(id=>!valid.has(id))||!['red','blue'].includes(m.side)||factions.red===factions.blue||!factionMembers[factions.red]||!factionMembers[factions.blue])return send(ws,{type:'error',message:'Ordem ou nacao invalida.'});
  room.started=true;room.side=m.side;room.order=m.order;room.factions=factions;
  send(room.host,{type:'start',room:ws.room,role:'host',side:m.side,order:m.order,factions});
  send(room.guest,{type:'start',room:ws.room,role:'guest',side:m.side==='red'?'blue':'red',order:m.order,factions});return;
 }
 if(m.type==='action'){
  if(!room.started||!room.host||!room.guest)return send(ws,{type:'error',message:'Partida pausada.'});
  if(!m.action||!['mode','hex','undo','end'].includes(m.action.type)||typeof m.champion!=='string'||!Number.isInteger(m.turn))return;
  const side=room.host===ws?room.side:room.side==='red'?'blue':'red';
  const members={Demacia:['garen','vayne','lux','sona','galio'],Noxus:['darius','draven','leblanc','swain','sion'],Freljord:['ashe','sejuani','braum','nunu','tryndamere']};const team=members[room.factions[side]];
  if(!team.includes(m.champion))return;
  if(m.action.type==='hex'&&(!Number.isInteger(m.action.q)||!Number.isInteger(m.action.r)||Math.abs(m.action.q)>8||Math.abs(m.action.r)>8))return;
  if(m.action.type==='mode'&&!['move','attack','spell'].includes(m.action.mode))return;
  broadcast(room,{type:'action',action:m.action,champion:m.champion,turn:m.turn});
 }
 });
 ws.on('close',()=>drop(ws));ws.on('error',()=>drop(ws));
});
const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log(`Runeterra Hex multiplayer: http://localhost:${port}`));
