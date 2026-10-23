const http=require('http'), fs=require('fs'), path=require('path');
const {WebSocketServer}=require('ws');
const PORT=Number(process.env.PORT||8080), MAX=16, TICK=100;
const CLASSES={assault:{hp:100,damage:23,rate:160,range:58},sniper:{hp:85,damage:85,rate:1100,range:120},medic:{hp:100,damage:20,rate:260,range:70},heavy:{hp:150,damage:18,rate:115,range:64}};
const rooms=new Map(); let idCounter=1;
const staticRoot=__dirname;
const server=http.createServer((req,res)=>{
 let url=new URL(req.url,'http://localhost').pathname;
 if(url==='/')url='/multiplayer.html';
 const allowed=new Set(['/multiplayer.html','/index.html','/menu-background.png']);
 if(!allowed.has(url)){res.writeHead(404);return res.end('Not found')}
 const file=path.join(staticRoot,url);
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Missing file')}
 res.writeHead(200,{'Content-Type':url.endsWith('.html')?'text/html':'image/png','Cache-Control':'no-cache'});res.end(data)});
});
const wss=new WebSocketServer({server});
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
server.listen(PORT,'0.0.0.0',()=>console.log('Frontline online server listening on '+PORT));
