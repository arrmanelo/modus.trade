import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createEngine } from '../core/engine-api.js';
import { isStaffOf, isAuthorOf, isFinal } from '../core/engine-core.js';

function fixture(){
 const env={now:()=>Date.parse('2026-11-13T10:00:00Z'),hmac:s=>crypto.createHmac('sha256','acceptance-only').update(s).digest('hex'),bitrixLive:false};
 const engine=createEngine(env);
 const call=(user,method,path,body={},query={})=>engine.handle({method,path,body,query,token:user?engine.tokenFor(user):null});
 const ctx={state:engine.getState(),env,now:engine.now()};
 const create=()=>call('u_emp_proc','POST','/appeals',{type:'problem',categoryId:'c_it',title:'Проверка заявки с файлом',description:'В системе приходится повторно вводить сведения о заявке.',priority:'high',isPublic:false,files:[{name:'test.txt',type:'text/plain',data:Buffer.from('demo').toString('base64')}]});
 return {engine,call,ctx,create};
}
test('1. Обращение с файлом регистрируется; вложение доступно только участникам',()=>{
 const {call,create,engine}=fixture();assert.equal(call(null,'GET','/appeals').status,401);
 const r=create();assert.equal(r.status,201);const a=r.json.appeal;
 assert.equal(a.id,'A-041');assert.equal(a.attachments.length,1);assert.equal(a.assignee.id,'u_it');
 const fid=a.attachments[0].id;assert.equal(Buffer.from(call('u_emp_proc','GET','/files/'+fid).file.data,'base64').toString(),'demo');
 assert.equal(call('u_office','GET','/files/'+fid).status,404);
 assert.equal(call('u_office','GET','/appeals/'+a.id).status,404);
 const restored=createEngine({now:()=>Date.now(),hmac:s=>s,bitrixLive:false},JSON.parse(JSON.stringify(engine.getState())));
 assert.equal(restored.getState().appeals.find(x=>x.id===a.id).attachments[0],fid);
});
test('2. Правила маршрутизации, заместитель и резервный координатор',()=>{
 const {call,engine}=fixture();
 const normal=call('u_emp_proc','POST','/route-preview',{type:'problem',categoryId:'c_it'});assert.equal(normal.json.assignee.id,'u_it');
 const replacement=call('u_emp_proc','POST','/route-preview',{type:'idea',categoryId:'c_training'});assert.equal(replacement.json.fallback,true);assert.equal(replacement.json.assignee.id,'u_hr');
 engine.getState().rules=[];
 const fallback=call('u_emp_proc','POST','/route-preview',{type:'problem',categoryId:'c_it'});assert.equal(fallback.json.assignee.id,'u_admin');assert.equal(fallback.json.fallback,true);
});
test('3. Уточнение, ответ автора, история и уведомления',()=>{
 const {call,create}=fixture();const id=create().json.appeal.id;
 assert.equal(call('u_emp_proc','POST',`/appeals/${id}/status`,{to:'review'}).status,403);
 assert.equal(call('u_it','POST',`/appeals/${id}/status`,{to:'clarify',text:''}).status,400);
 assert.equal(call('u_it','POST',`/appeals/${id}/status`,{to:'clarify',text:'Какая версия программы?'}).status,200);
 assert.equal(call('u_emp_proc','POST',`/appeals/${id}/comments`,{text:'Версия указана в приложенном файле.'}).status,200);
 const r=call('u_emp_proc','GET','/appeals/'+id).json.appeal;assert.equal(r.status,'review');
 assert(r.events.some(e=>e.text==='Какая версия программы?'));assert(r.events.some(e=>e.text==='Версия указана в приложенном файле.'));
 assert(call('u_emp_proc','GET','/notifications').json.items.some(n=>n.appealId===id));
});
test('4. Мотивированный отказ, результат автору и обязательное объяснение',()=>{
 const {call,create}=fixture();const id=create().json.appeal.id;
 assert.equal(call('u_it','POST',`/appeals/${id}/status`,{to:'rejected',text:''}).status,400);
 const reason='Изменение включено в план обновления, отдельная доработка не требуется.';
 assert.equal(call('u_it','POST',`/appeals/${id}/status`,{to:'rejected',text:reason}).status,200);
 assert.equal(call('u_emp_proc','GET','/appeals/'+id).json.appeal.rejection,reason);
 const a17=call('u_office','GET','/appeals/A-017').json.appeal;assert.equal(a17.status,'rejected');assert(a17.rejection.length>10);
});
test('5. Фильтры по подразделению, категории, статусу, периоду и просрочкам',()=>{
 const {call}=fixture();
 const list=q=>{const r=call('u_admin','GET','/appeals',{},q);assert.equal(r.status,200);return r.json.items;};
 for(const [key,value,field] of [['departmentId','d_proc','authorDepartmentId'],['categoryId','c_it','categoryId'],['status','new','status']]){const xs=list({[key]:value});assert(xs.length);assert(xs.every(a=>a[field]===value));}
 const overdue=list({overdue:'1',sort:'due'});assert(overdue.length);assert(overdue.every(a=>a.overdue));
 const from=Date.parse('2026-11-01T00:00:00Z'),to=Date.parse('2026-11-13T23:59:59Z');const xs=list({from,to});assert(xs.length);assert(xs.every(a=>a.createdAt>=from&&a.createdAt<=to));
 assert.equal(list({q:'A-017'}).length,1);
});
test('6. Аналитика: типы, доля завершённых, среднее первого ответа',()=>{
 const {call,engine}=fixture();const r=call('u_admin','GET','/analytics');assert.equal(r.status,200);
 const list=engine.getState().appeals.filter(a=>!a.mergedInto),answered=list.filter(a=>a.firstResponseAt);
 assert.equal(Object.values(r.json.byType).reduce((x,y)=>x+y,0),list.length);
 assert.equal(r.json.kpi.closedShare,Math.round(list.filter(isFinal).length/list.length*1000)/1000);
 const avg=answered.reduce((n,a)=>n+(a.firstResponseAt-a.createdAt)/3600000,0)/answered.length;
 assert.equal(r.json.kpi.avgFirstResponseHours,Math.round(avg*10)/10);
 assert.equal(call('u_emp_proc','GET','/analytics').status,403);
 assert.equal(engine.getState().appeals.filter(a=>a.source==='dataset').length,20);
 assert.equal(engine.getState().appeals.filter(a=>a.source==='extra').length,20);
});
test('Аналитика, кластеры и CSV не раскрывают обращения вне зоны ответственности',()=>{
 const {call,ctx}=fixture();const user=ctx.state.users.find(u=>u.id==='u_dir');
 const allowed=ctx.state.appeals.filter(a=>isStaffOf(ctx,user,a)||isAuthorOf(ctx,user,a));
 const ids=new Set(allowed.map(a=>a.id));assert(!ids.has('A-035'));
 const r=call('u_dir','GET','/analytics');assert.equal(r.status,200);assert.equal(r.json.kpi.total,allowed.filter(a=>!a.mergedInto).length);
 assert(r.json.clusters.every(c=>c.members.every(id=>ids.has(id))));assert(r.json.overdueList.every(a=>ids.has(a.id)));
 const csv=call('u_dir','GET','/export.csv');assert.equal(csv.status,200);assert(!csv.text.includes('A-035;'));
 assert.equal(call('u_dir','GET','/analytics',{}, {categoryId:'c_it'}).json.byCategory.every(c=>c.id==='c_it'),true);
});
test('CSV защищает от формул, внутренние заметки скрыты, Битрикс24 имитируется',()=>{
 const {call,create,engine}=fixture();const id=create().json.appeal.id;
 engine.getState().appeals.find(a=>a.id===id).title='=1+1';
 assert(call('u_admin','GET','/export.csv').text.includes("'=1+1"));
 call('u_it','POST',`/appeals/${id}/comments`,{text:'Служебная заметка',internal:true});
 assert(!call('u_emp_proc','GET','/appeals/'+id).json.appeal.events.some(e=>e.text==='Служебная заметка'));
 const progress=call('u_it','POST',`/appeals/${id}/status`,{to:'progress',text:'Устранить повторный ввод, проверить на тестовой заявке.',dueDate:Date.parse('2026-11-20T12:00:00Z')});assert.equal(progress.status,200);
 const task=engine.getState().outbox.find(o=>o.appealId===id&&o.method==='tasks.task.add');assert(task);assert.equal(task.status,'simulated');
});
