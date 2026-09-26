'use strict';
// 01. HTTP + multiplayer. No third-party packages or database required.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const CONFIG = require('./game-config.json');
const recipes = new Map(CONFIG.recipes.map(x => [x.id, x]));
const shop = new Map(CONFIG.shop.map(x => [x.id, x]));
const TEST_SPEED = process.env.NODE_ENV === 'test' ? 0.01 : 1;
const rooms = new Map(), players = new Map();
const now = () => Date.now();
const seconds = s => s * 1000 * TEST_SPEED;
const json = (res, code, data) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
function profileInput(input, name) {
  const clean = {version:1, name, coins:CONFIG.startingCoins, served:0, items:[{id:randomUUID(),type:'flowers',x:-3,z:2,rotation:0,lastHarvest:now()}]};
  if (!input || typeof input !== 'object') return clean;
  // Local profiles are trusted only for this private four-device test; not secure currency.
  if (!Number.isSafeInteger(input.coins) || input.coins < 0 || input.coins > 1e7 || !Array.isArray(input.items) || input.items.length > CONFIG.maxItems) throw Error('Berkas simpanan tidak valid.');
  clean.coins = input.coins;
  clean.served = Number.isSafeInteger(input.served) && input.served >= 0 ? Math.min(input.served,1e6) : 0;
  clean.items = [];
  const ids = new Set();
  for (const i of input.items) {
    if (!i || !shop.has(i.type) || ![i.x,i.z,i.rotation].every(Number.isFinite) || Math.abs(i.x)>8 || Math.abs(i.z)>8) throw Error('Posisi barang dalam simpanan tidak valid.');
    const id = typeof i.id === 'string' && i.id.length<80 && !ids.has(i.id) ? i.id : randomUUID(); ids.add(id);
    clean.items.push({id,type:i.type,x:i.x,z:i.z,rotation:((i.rotation%4)+4)%4,lastHarvest:Number.isFinite(i.lastHarvest)?Math.max(0,Math.min(now(),i.lastHarvest)):now()});
  }
  return clean;
}
function createRoom() {
  const r={id:randomUUID(),members:new Map(),tables:CONFIG.tables.map((p,i)=>({id:i,position:p,state:'arriving',recipe:CONFIG.recipes[Math.floor(Math.random()*CONFIG.recipes.length)].id,owner:null,generation:randomUUID(),since:now()+seconds(i*2),until:now()+seconds(4+i*2)})),stoves:CONFIG.stoves.map((p,i)=>({id:i,position:p,owner:null,table:null,ingredients:[],state:'idle',readyAt:0}))};
  rooms.set(r.id,r);return r;
}
function emit(p,event,data){if(p.stream&&!p.stream.destroyed){if(p.stream.writableLength>500000){p.stream.destroy();return}p.stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)}}
function publicPlayer(p){return {id:p.id,name:p.name,slot:p.slot,x:p.x,y:p.y,z:p.z,yaw:p.yaw,zone:p.zone,plate:p.plate,island:p.profile.items}}
function state(r){return {room:r.id,serverTime:now(),players:[...r.members.values()].map(publicPlayer),tables:r.tables,stoves:r.stoves}}
function broadcast(r){const s=state(r);for(const p of r.members.values())emit(p,'state',s)}
function persist(p){emit(p,'profile',{...p.profile,savedAt:now()})}
function notice(p,text){emit(p,'notice',{text})}
function closePlayer(p){if(!players.has(p.token))return;const r=p.room;r.members.delete(p.id);players.delete(p.token);for(const visitor of r.members.values())if(visitor.zone===p.id){visitor.zone='hospital';visitor.x=7;visitor.y=0;visitor.z=-12;visitor.yaw=Math.PI;visitor.lastMove=now();emit(visitor,'teleport',{x:7,y:0,z:-12,yaw:Math.PI,zone:'hospital'});notice(visitor,'Pemilik pulau keluar. Kamu kembali ke halaman rumah sakit.');}for(const t of r.tables)if(t.owner===p.id){t.owner=null;t.state='waiting';t.since=now();}for(const s of r.stoves)if(s.owner===p.id)Object.assign(s,{owner:null,table:null,ingredients:[],state:'idle',readyAt:0});if(p.stream)p.stream.end();if(r.members.size)broadcast(r);else rooms.delete(r.id)}
function near(p,position,d=2.5){return Math.hypot(p.x-position[0],p.z-position[1])<=d}
function hospital(p){if(p.zone!=='hospital')throw Error('Kembali ke restoran terlebih dahulu.')}
function ownIsland(p){if(p.zone!==p.id)throw Error('Kamu hanya dapat mengubah pulaumu sendiri.')}
function slotCenter(p){return CONFIG.islandCenters[p.slot]}
function validPlacement(p,type,x,z,except){const def=shop.get(type),radius=def.radius;if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)+radius>8.5||Math.abs(z)+radius>8.5)throw Error('Barang terlalu dekat tepi pulau.');if(Math.hypot(x+6,z+6)<radius+1.5)throw Error('Sisakan ruang di depan portal.');if(p.profile.items.some(i=>i.id!==except&&Math.hypot(i.x-x,i.z-z)<shop.get(i.type).radius+radius+.15))throw Error('Tempat ini bertabrakan dengan barang lain.')}
function action(p,a){const r=p.room;let changed=true,save=false;
  switch(a.type){
    case 'move': {
      changed=false;if(![a.x,a.y,a.z,a.yaw].every(Number.isFinite))break;
      let dt=Math.min(1.5,Math.max(.05,(now()-p.lastMove)/1000)),d=Math.hypot(a.x-p.x,a.z-p.z);
      if(d>dt*6+.8)break;
      if(p.zone==='hospital'){if(Math.abs(a.x)>15.2||a.z< -19||a.z>13)break;}else{let owner=r.members.get(p.zone);if(!owner)break;let [x,z]=slotCenter(owner);if(Math.abs(a.x-x)>9||Math.abs(a.z-z)>9||a.y<0||a.y>3.2)break;}
      p.x=a.x;p.y=Math.max(0,Math.min(3,a.y));p.z=a.z;p.yaw=a.yaw;p.lastMove=now();break;
    }
    case 'claim': {hospital(p);let t=r.tables[a.table];if(!t||!near(p,t.position))throw Error('Dekati meja pasien.');if(t.state!=='waiting'||t.owner)throw Error('Pesanan ini sudah diambil.');if(r.tables.filter(t=>t.owner===p.id).length>=2)throw Error('Maksimum dua pesanan aktif.');t.owner=p.id;t.state='ordered';t.since=now();notice(p,'Pesanan meja '+(t.id+1)+' diterima. Pergi ke dapur.');break;}
    case 'stove': {hospital(p);let s=r.stoves[a.stove],t=r.tables[a.table];if(!s||!near(p,s.position))throw Error('Dekati wajan.');if(s.owner)throw Error('Wajan sedang digunakan.');if(r.stoves.some(s=>s.owner===p.id))throw Error('Kamu sudah menggunakan satu wajan.');if(!t||t.owner!==p.id||t.state!=='ordered')throw Error('Pilih pesanan yang belum dimasak.');s.owner=p.id;s.table=t.id;s.generation=t.generation;s.state='preparing';s.ingredients=[];t.state='preparing';break;}
    case 'ingredient': {hospital(p);let s=r.stoves[a.stove];if(!s||s.owner!==p.id||s.state!=='preparing'||!near(p,s.position,3))throw Error('Pilih wajan milikmu.');if(!CONFIG.ingredients[a.ingredient])throw Error('Bahan tidak dikenal.');if(s.ingredients.includes(a.ingredient))s.ingredients=s.ingredients.filter(i=>i!==a.ingredient);else if(s.ingredients.length<8)s.ingredients.push(a.ingredient);break;}
    case 'cook': {hospital(p);let s=r.stoves[a.stove];if(!s||s.owner!==p.id||s.state!=='preparing'||!near(p,s.position,3))throw Error('Dekati wajan milikmu.');let t=r.tables[s.table],rec=recipes.get(t.recipe);if([...s.ingredients].sort().join(',')!==[...rec.ingredients].sort().join(','))throw Error('Bahan belum sesuai resep. Klik bahan untuk menambah atau menghapusnya.');s.state='cooking';s.readyAt=now()+seconds(rec.seconds);t.state='cooking';notice(p,'Masakan sedang dimasak. Kamu boleh mengambil pesanan lain.');break;}
    case 'collect': {hospital(p);let s=r.stoves[a.stove];if(!s||s.owner!==p.id||s.state!=='ready'||!near(p,s.position,3))throw Error('Hidangan belum siap atau wajan terlalu jauh.');if(p.plate)throw Error('Sajikan piring yang sedang kamu bawa.');p.plate={table:s.table,generation:s.generation,recipe:r.tables[s.table].recipe};r.tables[s.table].state='plated';Object.assign(s,{owner:null,table:null,ingredients:[],state:'idle',readyAt:0});break;}
    case 'serve': {hospital(p);let t=r.tables[a.table];if(!t||!near(p,t.position))throw Error('Dekati meja pasien.');if(!p.plate||p.plate.table!==t.id||p.plate.generation!==t.generation||t.owner!==p.id||t.state!=='plated')throw Error('Ini bukan pesanan meja ini.');let rec=recipes.get(t.recipe);p.plate=null;t.owner=null;t.state='eating';t.since=now();t.until=now()+seconds(8);p.profile.coins+=rec.reward;p.profile.served++;save=true;notice(p,'Terima kasih! +'+rec.reward+' KA untuk '+rec.name+'.');break;}
    case 'travel': {
      if(a.destination==='home'||a.destination==='visit'){if(p.zone==='hospital'&&!near(p,CONFIG.hospitalPortal,3))throw Error('Pergi ke portal di halaman depan rumah sakit.');let owner=a.destination==='home'?p:r.members.get(a.owner);if(!owner)throw Error('Pemain sudah meninggalkan sesi.');if(p.plate||r.stoves.some(s=>s.owner===p.id)||r.tables.some(t=>t.owner===p.id))throw Error('Selesaikan pesanan aktif sebelum mengunjungi pulau.');let [x,z]=slotCenter(owner);p.zone=owner.id;p.x=x-4.5;p.z=z-6;p.y=0;p.yaw=0;
      }else if(a.destination==='hospital'){if(p.zone==='hospital')break;p.zone='hospital';p.x=7;p.z=-12;p.y=0;p.yaw=Math.PI;}else throw Error('Tujuan tidak tersedia.');p.lastMove=now();emit(p,'teleport',{x:p.x,y:p.y,z:p.z,yaw:p.yaw,zone:p.zone});break;
    }
    case 'buy': {ownIsland(p);let def=shop.get(a.item);if(!def)throw Error('Barang tidak dikenal.');if(p.profile.items.length>=CONFIG.maxItems)throw Error('Pulau mencapai batas 60 barang untuk versi uji.');if(p.profile.coins<def.price)throw Error('Koin belum cukup.');validPlacement(p,def.id,a.x,a.z);p.profile.coins-=def.price;p.profile.items.push({id:randomUUID(),type:def.id,x:a.x,z:a.z,rotation:Number.isInteger(a.rotation)?((a.rotation%4)+4)%4:0,lastHarvest:now()});save=true;notice(p,def.name+' berhasil dibeli dan ditempatkan.');break;}
    case 'place': {ownIsland(p);let i=p.profile.items.find(i=>i.id===a.id);if(!i)throw Error('Barang tidak ditemukan.');validPlacement(p,i.type,a.x,a.z,i.id);i.x=a.x;i.z=a.z;i.rotation=Number.isInteger(a.rotation)?((a.rotation%4)+4)%4:0;save=true;break;}
    case 'harvest': {ownIsland(p);let i=p.profile.items.find(i=>i.id===a.id),def=i&&shop.get(i.type);if(!def?.harvestSeconds)throw Error('Barang ini tidak dapat dipanen.');let [x,z]=slotCenter(p);if(!near(p,[x+i.x,z+i.z],3.5))throw Error('Dekati pohon atau sapi.');if(now()-i.lastHarvest<def.harvestSeconds*1000)throw Error('Panen belum siap.');i.lastHarvest=now();p.profile.coins+=def.harvestReward;save=true;notice(p,'Panen berhasil! +'+def.harvestReward+' KA.');break;}
    case 'feed': {ownIsland(p);let i=p.profile.items.find(i=>i.id===a.id);if(!i||i.type!=='cow')throw Error('Sapi tidak ditemukan.');let [x,z]=slotCenter(p);if(!near(p,[x+i.x,z+i.z],3.5))throw Error('Dekati sapi.');notice(p,'Sapi senang! Pakan gratis; waktu panen tetap berjalan.');break;}
    case 'chat': {const texts=['Ikuti aku!','Butuh bantuan!','Pesanan sudah siap!','Ayo ke pulau!'];if(!texts.includes(a.text))break;if(now()-p.lastChat<2000)break;p.lastChat=now();for(let q of r.members.values())notice(q,p.name+': '+a.text);break;}
    default: throw Error('Aksi tidak dikenal.');
  }
  if(save)persist(p);if(changed)broadcast(r);return {ok:true,profile:save?{...p.profile,savedAt:now()}:undefined};
}
async function body(req){let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)throw Error('Permintaan terlalu besar.');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString()||'{}')}
const index=fs.readFileSync(path.join(__dirname,'public/index.html'));
const server=http.createServer(async(req,res)=>{try{let u=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(index);return}
  if(req.method==='GET'&&u.pathname==='/api/config'){json(res,200,CONFIG);return}
  if(req.method==='GET'&&u.pathname==='/healthz'){json(res,200,{ok:true,game:'Dapur Altrilia'});return}
  if(req.method==='POST'){
    const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host){json(res,403,{error:'Asal permintaan tidak diizinkan.'});return}
    let a=await body(req);
    if(u.pathname==='/api/join'){
      let name=String(a.name||'').normalize('NFKC').trim().replace(/\s+/g,' ');if(!/^[\p{L}\p{N} _-]{2,20}$/u.test(name))throw Error('Gunakan nama 2–20 huruf atau angka.');
      if([...players.values()].some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Nama ini sedang bermain. Gunakan nama lain atau tunggu sekitar 40 detik setelah keluar.');
      if(players.size>=128)throw Error('Server uji sedang penuh. Coba sebentar lagi.');
      let profile=profileInput(a.profile,name),r=[...rooms.values()].find(r=>r.members.size<CONFIG.maxPlayers)||createRoom(),slot=[0,1,2,3].find(i=>![...r.members.values()].some(p=>p.slot===i));
      let p={id:randomUUID(),token:randomBytes(24).toString('hex'),name,profile,room:r,slot,x:0,y:0,z:-16,yaw:0,zone:'hospital',plate:null,lastSeen:now(),lastMove:now(),lastChat:0,stream:null,window:now(),actions:0};r.members.set(p.id,p);players.set(p.token,p);json(res,200,{token:p.token,id:p.id,profile:p.profile,state:state(r)});broadcast(r);return;
    }
    const token=req.headers.authorization?.replace(/^Bearer /,'');let p=players.get(token);if(!p){json(res,401,{error:'Sesi berakhir. Masuk kembali dengan simpanan lokalmu.'});return}p.lastSeen=now();
    if(u.pathname==='/api/leave'){closePlayer(p);json(res,200,{ok:true});return}
    if(u.pathname==='/api/action'){if(now()-p.window>1000){p.window=now();p.actions=0}if(++p.actions>50){json(res,429,{error:'Terlalu banyak aksi.'});return}json(res,200,action(p,a));return}
  }
  if(req.method==='GET'&&u.pathname==='/api/events'){
    let p=players.get(u.searchParams.get('token'));if(!p){json(res,401,{error:'Sesi berakhir.'});return}
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 1500\n\n');if(p.stream)p.stream.end();p.stream=res;p.lastSeen=now();emit(p,'state',state(p.room));persist(p);req.on('close',()=>{if(p.stream===res){p.stream=null;p.lastSeen=now()}});return;
  }
  json(res,404,{error:'Tidak ditemukan.'});
}catch(e){json(res,400,{error:e.message||'Permintaan tidak valid.'})}});
let lastMotion=0,lastBeat=0;
const timer=setInterval(()=>{let t=now();for(let p of players.values()){if(p.stream&&!p.stream.destroyed)p.lastSeen=t;if(t-p.lastSeen>40000)closePlayer(p)}for(let r of rooms.values()){let changed=false;
  for(let s of r.stoves)if(s.state==='cooking'&&t>=s.readyAt){s.state='ready';r.tables[s.table].state='ready';changed=true;let p=r.members.get(s.owner);if(p)notice(p,'Wajan '+(s.id+1)+': hidangan siap diambil!')}
  for(let table of r.tables){if(t<table.until)continue;if(table.state==='arriving'){table.state='waiting';table.since=t;changed=true}else if(table.state==='eating'){table.state='leaving';table.since=t;table.until=t+seconds(4);changed=true}else if(table.state==='leaving'){table.state='empty';table.since=t;table.until=t+seconds(5);changed=true}else if(table.state==='empty'){table.state='arriving';table.recipe=CONFIG.recipes[Math.floor(Math.random()*CONFIG.recipes.length)].id;table.generation=randomUUID();table.since=t;table.until=t+seconds(4);changed=true}}
  if(changed)broadcast(r);if(t-lastMotion>=120){let motion=[...r.members.values()].map(p=>({id:p.id,x:p.x,y:p.y,z:p.z,yaw:p.yaw,zone:p.zone,plate:p.plate}));for(let p of r.members.values())emit(p,'motion',motion)}
  if(t-lastBeat>=12000)for(let p of r.members.values())emit(p,'heartbeat',{serverTime:t});
}if(t-lastMotion>=120)lastMotion=t;if(t-lastBeat>=12000)lastBeat=t;},60);
timer.unref();
if(require.main===module){server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Dapur Altrilia siap pada port '+(process.env.PORT||3000)));process.on('SIGTERM',()=>{for(let p of players.values()){persist(p);emit(p,'notice',{text:'Server memulai ulang. Simpanan lokal tetap ada.'});p.stream?.end()}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2500).unref()})}
module.exports={server,rooms,players,action,profileInput,CONFIG,stop(){clearInterval(timer);for(let p of players.values())closePlayer(p);server.close()}};
