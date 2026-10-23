const http=require('http'), fs=require('fs'), path=require('path');
const {WebSocketServer}=require('ws');
const PORT=Number(process.env.PORT||8080), MAX=16, TICK=100;
const CLASSES={assault:{hp:100,damage:23,rate:160,range:58},sniper:{hp:85,damage:85,rate:1100,range:120},medic:{hp:100,damage:20,rate:260,range:70},heavy:{hp:150,damage:18,rate:115,range:64}};
const rooms=new Map(); let idCounter=1;
const staticRoot=__dirname;
const server=http.createServer((req,res)=>{
 let url=new URL(req.url,'http://localhost').pathname;
 if(url==='/')url='/multiplayer.html';
 const allowed=new Set(['/multiplayer.html','/index.html','/menu-background.png','/deadlands-online.html']);
 if(!allowed.has(url)){res.writeHead(404);return res.end('Not found')}
 const file=path.join(staticRoot,url);
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Missing file')}
 res.writeHead(200,{'Content-Type':url.endsWith('.html')?'text/html':'image/png','Cache-Control':'no-cache'});res.end(data)});
});
const wss=new WebSocketServer({noServer:true});
const deadWss=new WebSocketServer({noServer:true});
const liveWss=new WebSocketServer({noServer:true});
server.on('upgrade',(req,socket,head)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const target=pathname==='/deadlands-ws'?deadWss:pathname==='/deadlands-live'?liveWss:pathname==='/'?wss:null;
 if(!target){socket.destroy();return;}
 target.handleUpgrade(req,socket,head,ws=>target.emit('connection',ws,req));
});
const deadRooms=new Map();let deadId=1;
function deadCode(){let c;do{c=Math.random().toString(36).slice(2,8).toUpperCase()}while(deadRooms.has(c));return c}
function deadRoster(room){const players=[...room.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,yaw:p.yaw}));for(const p of room.values())if(p.ws.readyState===1)p.ws.send(JSON.stringify({type:'roster',players}))}
deadWss.on('connection',ws=>{
 let room=null,code='',player=null;const send=o=>{if(ws.readyState===1)ws.send(JSON.stringify(o))};
 ws.on('message',raw=>{if(raw.length>2048)return;let m;try{m=JSON.parse(raw)}catch{return}
 if(!player&&(m.type==='create'||m.type==='join')){
  code=m.type==='create'?deadCode():String(m.code||'').toUpperCase().slice(0,6);
  room=deadRooms.get(code);if(m.type==='join'&&!room)return send({type:'error',message:'Room not found'});
  if(room&&room.size>=4)return send({type:'error',message:'Room full (4/4)'});
  if(!room){room=new Map();deadRooms.set(code,room)}
  player={ws,id:'d'+deadId++,name:String(m.name||'Survivor').slice(0,16),x:0,y:5,z:0,yaw:0};room.set(player.id,player);
  send({type:'joined',code,id:player.id,count:room.size});deadRoster(room);return;
 }
 if(!player)return;
 if(m.type==='move'){
  for(const k of ['x','y','z','yaw']){const v=Number(m[k]);if(Number.isFinite(v)&&Math.abs(v)<100000)player[k]=v}
 }else if(m.type==='shot')for(const p of room.values())if(p!==player&&p.ws.readyState===1)p.ws.send(JSON.stringify({type:'shot',id:player.id}));
 });
 ws.on('close',()=>{if(!player||!room)return;room.delete(player.id);if(room.size===0)deadRooms.delete(code);else deadRoster(room)});
});
setInterval(()=>{for(const room of deadRooms.values())deadRoster(room)},150);

function send(ws,obj){if(ws.readyState===1)ws.send(JSON.stringify(obj))}
function broadcast(room,obj){for(const p of room.players.values())send(p.ws,obj)}
function code(){let s;do{s=Math.random().toString(36).slice(2,8).toUpperCase()}while(rooms.has(s));return s}
function roomFor(mode,privateRoom){if(!privateRoom){for(const r of rooms.values())if(!r.private&&r.mode===mode&&r.players.size<MAX)return r}let id=code(),r={id,mode,private:privateRoom,players:new Map(),scores:[0,0],started:Date.now()};rooms.set(id,r);return r}
function safeName(s){return String(s||'Soldier').replace(/[<>&"']/g,'').slice(0,16)||'Soldier'}
function spawn(p){p.x=(p.team===0?-24:24)+(Math.random()-.5)*7;p.z=(Math.random()-.5)*40;p.yaw=p.team===0?Math.PI/2:-Math.PI/2;p.hp=CLASSES[p.classId].hp;p.alive=true;p.invulnerableUntil=Date.now()+1500}
function leave(ws){let p=ws.p;if(!p)return;let r=rooms.get(p.room);if(r){r.players.delete(p.id);broadcast(r,{type:'left',id:p.id});if(!r.players.size)rooms.delete(r.id)}ws.p=null}
wss.on('connection',ws=>{
 send(ws,{type:'hello',message:'FRONTLINE multiplayer server ready'});
 ws.on('message',raw=>{
  if(raw.length>2048)return;
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==='join'){
   if(ws.p)return;
   let mode=m.mode==='ffa'?'ffa':'tdm',classId=CLASSES[m.classId]?m.classId:'assault';
   let r;
   if(m.code){r=rooms.get(String(m.code).trim().toUpperCase());if(!r)return send(ws,{type:'error',message:'Room code not found'});if(r.mode!==mode)return send(ws,{type:'error',message:'Select the same mode as the room'})}
   else r=roomFor(mode,!!m.private);
   if(r.players.size>=MAX)return send(ws,{type:'error',message:'Room full'});
   let p={ws,id:String(idCounter++),room:r.id,name:safeName(m.name),classId,team:mode==='ffa'?-1:(Array.from(r.players.values()).filter(x=>x.team===0).length<=Array.from(r.players.values()).filter(x=>x.team===1).length?0:1),kills:0,deaths:0,lastShot:0,lastMove:0,x:0,z:0,yaw:0,hp:100,alive:true};
   spawn(p);ws.p=p;r.players.set(p.id,p);
   send(ws,{type:'joined',id:p.id,room:r.id,mode:r.mode,players:Array.from(r.players.values()).map(state),scores:r.scores});
   broadcast(r,{type:'player',player:state(p)});
  }else if(ws.p){
   let p=ws.p,r=rooms.get(p.room);if(!r)return;
   if(m.type==='move'&&p.alive){
    const now=Date.now();if(now-p.lastMove<25)return;
    let x=Number(m.x),z=Number(m.z),yaw=Number(m.yaw);
    if(![x,z,yaw].every(Number.isFinite))return;
    if(Math.abs(x)>45||Math.abs(z)>62)return;
    const dt=Math.min(0.2,(now-p.lastMove)/1000||.05),maxSpeed=p.classId==='assault'?9:7;
    if(p.lastMove&&Math.hypot(x-p.x,z-p.z)>maxSpeed*dt+1.4)return;
    p.x=x;p.z=z;p.yaw=yaw;p.lastMove=now;
   }else if(m.type==='shoot'&&p.alive){
    let now=Date.now(),stats=CLASSES[p.classId];
    if(now-p.lastShot<stats.rate)return;p.lastShot=now;
    let target=r.players.get(String(m.target||'')),hit=false;
    if(target&&target!==p&&target.alive&&(r.mode==='ffa'||target.team!==p.team)&&now>target.invulnerableUntil){
     const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
     const delta=Math.atan2(Math.sin(angle-p.yaw),Math.cos(angle-p.yaw));
     if(d<stats.range&&Math.abs(delta)<(p.classId==='sniper'?.12:.20)){
      hit=true;target.hp=Math.max(0,target.hp-stats.damage);
      if(target.hp===0){target.alive=false;target.deaths++;p.kills++;if(r.mode==='tdm')r.scores[p.team]++;broadcast(r,{type:'kill',killer:p.name,victim:target.name,scores:r.scores});setTimeout(()=>{if(r.players.get(target.id)===target){spawn(target);broadcast(r,{type:'player',player:state(target)})}},3000)}
     }
    }
    broadcast(r,{type:'shot',id:p.id,target:target?.id||null,hit});
   }else if(m.type==='heal'&&p.classId==='medic'&&p.alive){
    let now=Date.now();if(now-(p.lastHeal||0)<12000)return;p.lastHeal=now;
    for(const ally of r.players.values())if(ally.alive&&(r.mode==='ffa'?ally===p:ally.team===p.team)&&Math.hypot(ally.x-p.x,ally.z-p.z)<9)ally.hp=Math.min(CLASSES[ally.classId].hp,ally.hp+35);
   }
  }
 });
 ws.on('close',()=>leave(ws));ws.on('error',()=>leave(ws));
});
function state(p){return {id:p.id,name:p.name,x:p.x,z:p.z,yaw:p.yaw,hp:p.hp,maxHp:CLASSES[p.classId].hp,alive:p.alive,team:p.team,classId:p.classId,kills:p.kills,deaths:p.deaths}}
setInterval(()=>{for(const r of rooms.values()){broadcast(r,{type:'state',players:Array.from(r.players.values()).map(state),scores:r.scores});if(r.mode==='tdm'&&Math.max(...r.scores)>=75){broadcast(r,{type:'matchEnd',winner:r.scores[0]>=75?'ALLIES':'AXIS'});r.scores=[0,0];for(const p of r.players.values()){p.kills=0;p.deaths=0;spawn(p)}}else if(r.mode==='ffa'){const winner=Array.from(r.players.values()).find(p=>p.kills>=30);if(winner){broadcast(r,{type:'matchEnd',winner:winner.name});for(const p of r.players.values()){p.kills=0;p.deaths=0;spawn(p)}}}}},TICK);

// DEADLANDS SHARED SURVIVAL ARENA: authoritative zombies, health, waves, kills, pickups.
const liveRooms=new Map();
const random=(a,b)=>a+Math.random()*(b-a);
const safe=(n,a,b)=>Math.max(a,Math.min(b,n));
function liveCode(){let v;do{v=Math.random().toString(36).slice(2,8).toUpperCase()}while(liveRooms.has(v));return v}
function liveSend(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function liveBroadcast(r,o){for(const p of r.players.values())liveSend(p.ws,o)}
function liveSpawn(r){const count=5+r.wave*3+r.players.size*2;for(let i=0;i<count;i++){const a=random(0,Math.PI*2),dist=random(30,47);r.zombies.push({id:r.nextZ++,x:Math.sin(a)*dist,z:Math.cos(a)*dist,hp:55+r.wave*12,maxHp:55+r.wave*12,attackAt:0})}}
function liveState(r){return {type:'world',code:r.code,wave:r.wave,kills:r.kills,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,yaw:p.y,hp:p.hp,kills:p.kills,ammo:p.ammo})),zombies:r.zombies.map(z=>({id:z.id,x:z.x,z:z.z,hp:z.hp,maxHp:z.maxHp})),pickups:r.pickups}}
liveWss.on('connection',ws=>{
 let room=null,player=null;
 ws.on('message',raw=>{
  if(raw.length>2048)return;let m;try{m=JSON.parse(raw)}catch{return}
  if(!player){
   if(m.type!=='create'&&m.type!=='join')return;
   const code=m.type==='create'?liveCode():String(m.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
   room=liveRooms.get(code);
   if(m.type==='join'&&!room)return liveSend(ws,{type:'error',message:'Room not found'});
   if(room&&room.players.size>=4)return liveSend(ws,{type:'error',message:'Room is full'});
   if(!room){room={code,players:new Map(),zombies:[],pickups:[],wave:1,kills:0,nextZ:1,nextP:1,nextPlayer:1,nextWaveAt:0};liveRooms.set(code,room);liveSpawn(room)}
   const id='p'+room.nextPlayer++;
   player={id,ws,name:String(m.name||'Survivor').replace(/[<>&]/g,'').slice(0,16),x:random(-5,5),z:random(-5,5),yaw:0,hp:100,kills:0,ammo:180,lastMove:0,lastShot:0,deadUntil:0};
   room.players.set(id,player);liveSend(ws,{type:'joined',id,code});liveBroadcast(room,{type:'notice',message:player.name+' joined the team'});return;
  }
  if(m.type==='move'){
   const x=Number(m.x),z=Number(m.z),yaw=Number(m.yaw),now=Date.now();
   if(![x,z,yaw].every(Number.isFinite)||Math.abs(x)>55||Math.abs(z)>55||!player.hp)return;
   const dt=Math.min(.3,(now-player.lastMove)/1000||.1);
   if(player.lastMove&&Math.hypot(x-player.x,z-player.z)>10*dt+2)return;
   player.x=x;player.z=z;player.yaw=yaw;player.lastMove=now;
  }else if(m.type==='shoot'){
   const now=Date.now();if(!player.hp||player.ammo<=0||now-player.lastShot<200)return;
   player.lastShot=now;player.ammo--;
   const dx=Math.sin(player.yaw),dz=Math.cos(player.yaw);
   let hit=null,nearest=1e9;
   for(const z of room.zombies){
    const vx=z.x-player.x,vz=z.z-player.z,along=vx*dx+vz*dz,perp=Math.abs(vx*dz-vz*dx);
    if(along>0&&along<60&&perp<.95&&along<nearest){hit=z;nearest=along}
   }
   if(hit){hit.hp-=38;if(hit.hp<=0){room.zombies.splice(room.zombies.indexOf(hit),1);player.kills++;room.kills++;if(Math.random()<.23)room.pickups.push({id:room.nextP++,x:hit.x,z:hit.z,kind:Math.random()<.6?'ammo':'health'})}}
   liveBroadcast(room,{type:'fire',id:player.id,hit:hit?.id||null});
  }else if(m.type==='pickup'){
   const id=Number(m.id),i=room.pickups.findIndex(q=>q.id===id);
   if(i<0||!player.hp)return;
   const q=room.pickups[i];if(Math.hypot(q.x-player.x,q.z-player.z)>3)return;
   if(q.kind==='ammo')player.ammo=Math.min(300,player.ammo+60);else player.hp=Math.min(100,player.hp+40);
   room.pickups.splice(i,1);
  }else if(m.type==='revive'){
   if(player.hp||Date.now()<player.deadUntil)return;
   player.hp=100;player.ammo=Math.max(player.ammo,60);player.x=random(-4,4);player.z=random(-4,4);
  }
 });
 ws.on('close',()=>{if(!room||!player)return;room.players.delete(player.id);if(!room.players.size)liveRooms.delete(room.code);else liveBroadcast(room,{type:'notice',message:player.name+' disconnected'})});
 ws.on('error',()=>{try{ws.close()}catch{}});
});
let lastLiveTick=Date.now();
setInterval(()=>{
 const now=Date.now(),dt=Math.min(.2,(now-lastLiveTick)/1000);lastLiveTick=now;
 for(const r of liveRooms.values()){
  for(const z of r.zombies){
   let target=null,best=1e9;
   for(const p of r.players.values()){if(!p.hp)continue;const d=Math.hypot(z.x-p.x,z.z-p.z);if(d<best){best=d;target=p}}
   if(!target)continue;
   if(best>1.35){z.x+=(target.x-z.x)/best*safe(1.3+r.wave*.1,1.3,3.5)*dt;z.z+=(target.z-z.z)/best*safe(1.3+r.wave*.1,1.3,3.5)*dt}
   else if(now-z.attackAt>1100){z.attackAt=now;target.hp=Math.max(0,target.hp-12);if(!target.hp)target.deadUntil=now+5000}
  }
  if(!r.zombies.length){
   if(!r.nextWaveAt){r.nextWaveAt=now+4500;liveBroadcast(r,{type:'notice',message:'Wave '+r.wave+' cleared! Next wave in 4 seconds'})}
   else if(now>=r.nextWaveAt){r.wave++;r.nextWaveAt=0;liveSpawn(r)}
  }
  liveBroadcast(r,liveState(r));
 }
},100);

server.listen(PORT,'0.0.0.0',()=>console.log('Frontline online server listening on '+PORT));
