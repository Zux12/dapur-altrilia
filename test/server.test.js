'use strict';
process.env.NODE_ENV='test';
const {test,after}=require('node:test');const assert=require('node:assert/strict');
const game=require('../server');let base;
const listening=new Promise(resolve=>game.server.listen(0,'127.0.0.1',()=>{base='http://127.0.0.1:'+game.server.address().port;resolve()}));
after(()=>game.stop());
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function post(route,data,token){await listening;let r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,data:await r.json()}}
async function join(name,profile){let r=await post('/api/join',{name,profile});assert.equal(r.status,200,JSON.stringify(r.data));return r.data}
function player(c){return game.players.get(c.token)}
async function act(c,a){return post('/api/action',a,c.token)}
function go(c,position){let p=player(c);[p.x,p.z]=position;p.lastMove=Date.now()}
async function leaveAll(){for(let p of [...game.players.values()])await post('/api/leave',{},p.token)}
test('Four-device matchmaking, cooking, purchases, saving and reconnect',async()=>{
 let a=await join('Chef A'),b=await join('Chef B'),c=await join('Chef C'),d=await join('Chef D'),e=await join('Chef E');
 assert.equal(a.state.room,b.state.room);assert.equal(a.state.room,d.state.room);assert.notEqual(a.state.room,e.state.room);assert.equal(player(a).room.members.size,4);
 assert.equal((await post('/api/join',{name:'chef a'})).status,400);
 let abort=new AbortController();let eventResponse=await fetch(base+'/api/events?token='+a.token,{signal:abort.signal});assert.equal(eventResponse.headers.get('content-type'),'text/event-stream');let reader=eventResponse.body.getReader();let eventText=new TextDecoder().decode((await reader.read()).value);assert.match(eventText,/event: state/);await reader.cancel();abort.abort();
 await pause(180);go(a,[-6,-1]);go(b,[-6,-1]);let [x,y]=await Promise.all([act(a,{type:'claim',table:0}),act(b,{type:'claim',table:0})]);assert.equal([x,y].filter(q=>q.status===200).length,1);let chef=x.status===200?a:b,other=x.status===200?b:a;
 go(chef,[-7.5,8]);assert.equal((await act(chef,{type:'stove',stove:0,table:0})).status,200);assert.equal((await act(chef,{type:'cook',stove:0})).status,400);assert.equal((await act(chef,{type:'collect',stove:0})).status,400);
 let r=player(chef).room,recipe=game.CONFIG.recipes.find(q=>q.id===r.tables[0].recipe);
 for(let ingredient of recipe.ingredients)assert.equal((await act(chef,{type:'ingredient',stove:0,ingredient})).status,200);
 assert.equal((await act(chef,{type:'cook',stove:0})).status,200);await pause(400);assert.equal(r.stoves[0].state,'ready');assert.equal((await act(chef,{type:'collect',stove:0})).status,200);
 go(chef,[0,-1]);assert.equal((await act(chef,{type:'serve',table:1})).status,400);assert.ok(player(chef).plate);
 go(chef,[-6,-1]);let paid=await act(chef,{type:'serve',table:0});assert.equal(paid.status,200);assert.equal(paid.data.profile.coins,300+recipe.reward);assert.equal((await act(chef,{type:'serve',table:0})).status,400);assert.equal(player(chef).profile.coins,300+recipe.reward);
 go(chef,[7,-14]);assert.equal((await act(chef,{type:'travel',destination:'home'})).status,200);assert.equal((await act(chef,{type:'buy',item:'flowers',x:-6,z:-6})).status,400);let purchase=await act(chef,{type:'buy',item:'bench',x:2,z:2,rotation:1});assert.equal(purchase.status,200);assert.equal(purchase.data.profile.coins,200+recipe.reward);let bench=purchase.data.profile.items.find(i=>i.type==='bench');assert.equal((await act(chef,{type:'place',id:bench.id,x:3,z:3,rotation:2})).status,200);assert.equal((await act(chef,{type:'buy',item:'treehouse',x:0,z:1})).status,400);
 go(other,[7,-14]);assert.equal((await act(other,{type:'travel',destination:'visit',owner:chef.id})).status,200);assert.equal((await act(other,{type:'place',id:bench.id,x:0,z:0})).status,400);
 let stored=JSON.parse(JSON.stringify(player(chef).profile)),name=player(chef).name;
 await post('/api/leave',{},chef.token);assert.equal(player(other).zone,'hospital');let returned=await join(name,stored);assert.equal(returned.profile.coins,stored.coins);assert.deepEqual(returned.profile.items,stored.items);
 // Disconnect a cook: return order and free stove.
 let cc=player(c);cc.zone='hospital';go(c,[6,-1]);assert.equal((await act(c,{type:'claim',table:2})).status,200);go(c,[2.5,8]);assert.equal((await act(c,{type:'stove',stove:2,table:2})).status,200);let cr=cc.room;await post('/api/leave',{},c.token);assert.equal(cr.stoves[2].owner,null);assert.equal(cr.tables[2].state,'waiting');
 // Offline harvest is capped to a single payment.
 let rich=await join('Petani',{coins:1000,served:0,items:[{id:'apple',type:'apple',x:2,z:2,rotation:0,lastHarvest:0}]});go(rich,[7,-14]);await act(rich,{type:'travel',destination:'home'});let rp=player(rich),center=game.CONFIG.islandCenters[rp.slot];go(rich,[center[0]+2,center[1]+2]);assert.equal((await act(rich,{type:'harvest',id:'apple'})).status,200);assert.equal(rp.profile.coins,1020);assert.equal((await act(rich,{type:'harvest',id:'apple'})).status,400);
 await leaveAll();assert.equal(game.rooms.size,0);
});
test('Malformed save and invalid actions are rejected',async()=>{
 assert.equal((await post('/api/join',{name:'<script>'})).status,400);
 assert.equal((await post('/api/join',{name:'Bad Save',profile:{coins:-20,items:[]}})).status,400);
 let a=await join('Chef Valid');assert.equal((await act(a,{type:'claim',table:999})).status,400);assert.equal((await post('/api/action',{type:'serve',table:0},'wrong')).status,401);await leaveAll();
});
