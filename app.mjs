import {calendar,date,day,defaults,iso,nextDay,payday,windows} from './engine.mjs'
import {translate} from './labels.mjs'
import {currencies,methods,types,valid} from './storage.mjs'

const $=id=>document.getElementById(id)
const root=$('screen'), dialog=$('dialog'), key='money-grow:v1'
const read=()=>{
  try { const s=JSON.parse(localStorage.getItem(key)); return valid(s) ? s : defaults() }
  catch { return defaults() }
}
let state=read(), model=calendar(state.schedule), page='dashboard', pendingInstall
const mini=new URLSearchParams(location.search).has('mini')
document.body.classList.toggle('mini',mini)
const t=k=>translate(state.lang,k)
const locale=()=>({ko:'ko-KR',ja:'ja-JP',en:'en-US'})[state.lang]
let format, precise, rateFormat, fullDate, shortDate, percentage
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
const iconPaths={
 dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 sources:'M4 7h16v13H4zM4 7V5l13-2v4m3 5h-6v4h6',
 history:'M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8m0-5v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2',
 plus:'M12 5v14M5 12h14', mini:'M3 4h18v16H3zM12 11h6v6h-6z',
 sun:'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8m0-5v2m0 14v2M3 12h2m14 0h2M6 6l1.5 1.5m9 9L18 18M6 18l1.5-1.5m9-9L18 6',
 moon:'M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z', lock:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', bolt:'m13 2-8 12h6l-1 8 9-12h-7z',
 clock:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18m0 4v5l4 2', calendar:'M3 6h18v15H3zM3 10h18M8 3v5m8-5v5', goal:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18m0 5a4 4 0 1 0 0 8 4 4 0 1 0 0-8'
}
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[k]}"/></svg>`
const btn=(k,action,i='',extra='')=>`<button type="button" data-action="${action}" ${extra} aria-label="${t(k)}" title="${t(k)}">${i?icon(i):''}<span${i?' class="wide-text"':''}>${t(k)}</span></button>`
const heading=k=>`<div class="heading"><h2>${t(k)}</h2></div>`
let noticeTimer
function notify(message) {
  $('notice').textContent=t(message)
  clearTimeout(noticeTimer)
  noticeTimer=setTimeout(()=>$('notice').textContent='',3600)
}
function commit(next) {
  if(!valid(next)) return 'invalid'
  try { localStorage.setItem(key,JSON.stringify(next)) } catch { return 'storage' }
  state=next
  model=calendar(state.schedule)
  if(dialog.open) dialog.close()
  render()
  notify('saved')
  return ''
}
function dates(now) {
  return [day(now),new Date(now.getFullYear(),now.getMonth(),1),new Date(now.getFullYear(),0,1)]
}
function actual(from,to) {
  const start=iso(from), end=iso(to)
  return state.receipts.reduce((sum,r)=>r.date>=start&&r.date<=end?sum+r.amount:sum,0)
}
const total=(from,to)=>model.total(state.sources,from,to)
const sourceName=s=>esc(s.name||t(s.type))
let nextSample=0, sample=null, chartDay=''
function render() {
  document.documentElement.lang=state.lang
  document.documentElement.dataset.theme=state.theme
  document.querySelector('meta[name=theme-color]').content=state.theme==='dark'?'#101727':'#f4f6fb'
  const loc=locale(), options={style:'currency',currency:state.currency}
  format=new Intl.NumberFormat(loc,options).format
  precise=new Intl.NumberFormat(loc,{...options,minimumFractionDigits:2,maximumFractionDigits:2}).format
  rateFormat=new Intl.NumberFormat(loc,{...options,minimumFractionDigits:2,maximumFractionDigits:4}).format
  fullDate=new Intl.DateTimeFormat(loc,{dateStyle:'full'}).format
  shortDate=new Intl.DateTimeFormat(loc,{month:'short',day:'numeric',weekday:'short'}).format
  percentage=new Intl.NumberFormat(loc,{style:'percent',maximumFractionDigits:1}).format
  $('today-date').textContent=fullDate(new Date())
  $('page-title').textContent=t(mini?'mini':page)
  $('nav').innerHTML=['dashboard','sources','history','settings'].map(k=>`<button type="button" data-action="page:${k}" ${k===page?'aria-current="page"':''}>${icon(k)}${t(k)}</button>`).join('')
  $('rail-bottom').innerHTML=icon('lock')+t('local')
  $('actions').innerHTML=(mini?btn('full','full'):btn('mini','mini','mini','id="open-mini"'))
    + `<button type="button" data-action="theme" aria-label="${t('theme')}" title="${t('theme')}">${icon(state.theme==='light'?'moon':'sun')}</button>`
    + (!mini && ['dashboard','sources'].includes(page)?btn('add','source','plus','id="add-source" class="primary"'):'')
  root.innerHTML=({dashboard,sources,history,settings})[page]()
  nextSample=0
  chartDay=''
  update(Date.now())
}
function dashboard() {
  return `<section class="hero">
    <canvas id="chart" aria-hidden="true"></canvas>
    <div class="live"><i class="dot"></i><span id="live"></span></div>
    <p class="caption">${t('hero')}</p><p class="counter" id="counter"></p>
    <p class="hero-foot">${t('running')} <strong id="hero-rate"></strong></p>
  </section>
  <div class="rates">${['second','minute','hour','daily'].map((k,i)=>`<div class="card"><span class="chip">${icon(['bolt','clock','clock','calendar'][i])}</span><div class="label">${t(k)}</div><strong class="value" id="rate-${i}"></strong></div>`).join('')}</div>
  <div id="standard">${heading('snapshot')}<div class="three">
   ${['today','monthly','yearly'].map((k,i)=>`<div class="card"><div class="label">${t(k)} · ${t('forecast')}</div><strong class="value" id="estimate-${i}"></strong><div class="foot muted"><span>${t('history')}</span><strong id="actual-${i}"></strong></div></div>`).join('')}
  </div>
  <div class="two">
    <section class="card"><div class="card-head"><h2>${t('work')}</h2>${icon('clock')}</div>
    <div class="foot"><span class="muted" id="work-label"></span><strong id="time-left"></strong></div>
    <div class="foot"><span class="muted">${t('remaining')}</span><strong id="work-money"></strong></div>
    <div class="foot"><span class="muted">${t('payday')}</span><strong id="payday"></strong></div></section>
    <section class="card"><div class="card-head"><h2>${t('goal')}</h2>${icon('goal')}</div>
    <div class="foot"><span class="muted">${t('assets')}</span><strong>${format(state.assets)}</strong></div>
    <progress aria-label="${t('goal')}" value="${Math.min(1,state.assets/state.goal)}" max="1"></progress>
    <div class="foot"><strong>${percentage(state.assets/state.goal)}</strong><span class="muted">${format(state.goal)}</span></div>
    <div class="foot">${btn('edit','goal')}</div></section>
  </div>
  <div class="heading"><h2>${t('sources')}</h2>${btn('manage','page:sources')}</div>
  <section class="card">${sourceRows(false)}</section></div>`
}
function sourceRows(editable) {
  if(!state.sources.length) return `<p class="empty">${t('empty')}</p>`
  return state.sources.map(s=>`<div class="row"><div><span class="row-name">${sourceName(s)}</span><span class="muted">${t(methods[s.method])} · ${s.method==='simple'||s.method==='compound'?percentage(s.rate/100):format(s.amount)}</span></div><div class="row-actions">${editable?btn('edit','source:'+s.id)+btn('remove','delete-source:'+s.id,'','class="danger"'):`<span class="badge">${t(s.timing==='work'?'worktime':'always')}</span>`}</div></div>`).join('')
}
const sources=()=>`<section class="card">${sourceRows(true)}</section>`
function history() {
  const rows=[...state.receipts].sort((a,b)=>b.date.localeCompare(a.date))
  return `<section class="card"><div class="card-head"><p class="muted">${t('recordHelp')}</p>${btn('record','receipt','plus','class="primary"')}</div>
  ${rows.length?rows.map(r=>`<div class="row"><div><span class="row-name">${esc(r.name)||t('history')}</span><span class="muted">${r.date} · ${format(r.amount)}</span></div><div class="row-actions">${btn('edit','receipt:'+r.id)}${btn('remove','delete-receipt:'+r.id,'','class="danger"')}</div></div>`).join(''):`<p class="empty">${t('empty')}</p>`}</section>`
}
const settings=()=>`<div class="stack"><section class="card"><div class="card-head"><h2>${t('appearance')}</h2>${btn('edit','appearance')}</div><div class="foot muted">${state.currency} · ${t(state.theme)} · ${{ko:'한국어',ja:'日本語',en:'English'}[state.lang]}</div></section>
<section class="card"><div class="card-head"><h2>${t('schedule')}</h2>${btn('edit','schedule')}</div><div class="foot muted">${state.schedule.in}–${state.schedule.out} · ${t('payday')} ${shortDate(payday(new Date(),state.schedule.payday))}</div></section>
<section class="card"><h2>${t('backup')}</h2><div class="foot">${btn('download','backup')}${btn('restore','restore')}<input type="file" accept=".json,application/json" id="backup-file" hidden></div></section>
<section class="card"><h2>${t('install')}</h2><div class="foot"><p class="muted">${t('installHelp')}</p>${pendingInstall?btn('install','install'):''}</div></section></div>`
const put=(id,value)=>{const el=$(id);if(el&&el.textContent!==value)el.textContent=value}
function update(ms) {
  if(page!=='dashboard') return
  const now=new Date(ms)
  if(ms>=nextSample || ms<sample?.ms) {
    const [today,...periods]=dates(now), tomorrow=nextDay(today)
    const work=windows(today,state.schedule), end=work.at(-1)?.[1] ?? 0
    const remaining=Math.max(0,end-ms)
    const rate=total(now,new Date(ms+1))*1000
    sample={ms,rate,today,value:total(today,now)}
    nextSample=ms+400
    put('live',t(rate!==0?'live':'idle'))
    put('hero-rate',rateFormat(rate)+' / '+t('second'))
    ;[rate,rate*60,rate*3600,total(today,tomorrow)].forEach((v,i)=>put('rate-'+i,(i===0?rateFormat:precise)(v)))
    ;[today,...periods].forEach((from,i)=>{
      put('estimate-'+i,format(i===0?sample.value:total(from,now)))
      put('actual-'+i,format(actual(from,now)))
    })
    const seconds=Math.ceil(remaining/1000)
    const time=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,'0')).join(':')
    put('work-label',t(remaining?'until':'off'))
    put('time-left',remaining?time:'')
    put('work-money',format(remaining?total(now,new Date(end)):0))
    put('payday',shortDate(payday(now,state.schedule.payday)))
    put('today-date',fullDate(now))
    if(chartDay!==iso(today)) { chartDay=iso(today); drawChart() }
  }
  const value=sample.value+sample.rate*(ms-sample.ms)/1000
  put('counter',precise(Math.abs(value)<0.005?0:value))
}
function drawChart() {
  const canvas=$('chart')
  if(!canvas||!sample) return
  const {width,height}=canvas.getBoundingClientRect(), scale=devicePixelRatio||1
  canvas.width=Math.round(width*scale)
  canvas.height=Math.round(height*scale)
  const ctx=canvas.getContext('2d')
  ctx.scale(scale,scale)
  const from=sample.today,to=nextDay(from)
  const values=Array.from({length:49},(_,i)=>total(from,new Date(+from+(to-from)*i/48)))
  const high=Math.max(1,...values), low=Math.min(0,...values)
  const points=values.map((v,i)=>[i*width/48,height*.80-(v-low)/(high-low)*height*.55])
  ctx.strokeStyle='#ffffff2c'
  for(let i=1;i<=4;i++) {ctx.beginPath();ctx.moveTo(0,height*i/5);ctx.lineTo(width,height*i/5);ctx.stroke()}
  const line=()=>points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y))
  const fill=ctx.createLinearGradient(0,0,0,height)
  fill.addColorStop(0,'#95b4ff77');fill.addColorStop(1,'#95b4ff05')
  ctx.beginPath();line();ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle=fill;ctx.fill()
  ctx.beginPath();line();ctx.lineWidth=2.5;ctx.strokeStyle='#a1c3ff';ctx.stroke()
}
const input=(k,name,value='',extra='')=>`<label>${t(k)}<input name="${name}" value="${esc(value)}" ${extra}></label>`
const numeric=(k,name,value,step='any',extra='')=>input(k,name,value,`type="number" step="${step}" required ${extra}`)
const dateInput=(k,name,value,extra='')=>input(k,name,value,`type="date" min="1900-01-01" max="2199-12-31" ${extra}`)
function select(k,name,value,options) {
  return `<label>${t(k)}<select name="${name}">${Object.entries(options).map(([v,label])=>`<option value="${v}" ${v===value?'selected':''}>${label}</option>`).join('')}</select></label>`
}
const textArea=(k,entries)=>`<label class="wide">${t(k)}<textarea name="${k}" rows="3">${esc(entries.join('\n'))}</textarea></label>`
const num=(data,k)=>Number(data.get(k))
const uid=()=>globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)
const upsert=(rows,entry)=>rows.some(x=>x.id===entry.id)?rows.map(x=>x.id===entry.id?entry:x):[...rows,entry]
function form(title,fields,save,hint='') {
  dialog.innerHTML=`<form><h2 id="dialog-title">${t(title)}</h2>${hint?'<p class="muted">'+t(hint)+'</p>':''}<div class="fields">${fields}</div><div class="error" role="alert"></div><div class="form-actions">${btn('cancel','cancel')}<button class="primary">${t('save')}</button></div></form>`
  dialog.setAttribute('aria-labelledby','dialog-title')
  const f=dialog.querySelector('form')
  f.onsubmit=event=>{
    event.preventDefault()
    const error=commit(save(new FormData(f)))
    if(error) f.querySelector('.error').textContent=t(error)
  }
  dialog.showModal()
  return f
}
function sourceForm(id) {
  const old=state.sources.find(s=>s.id===id)
  const s=old??{type:'other',name:'',method:'monthly',timing:'always',start:iso(new Date()),end:'',amount:0,principal:0,payment:0,rate:0}
  const labels=items=>Object.fromEntries(items.map(k=>[k,t(k)]))
  const f=form(old?'edit':'add',
    input('name','name',s.name,'maxlength="80"')+select('type','type',s.type,labels(types))
    +select('method','method',s.method,Object.fromEntries(Object.entries(methods).map(([k,v])=>[k,t(v)])))
    +select('timing','timing',s.timing,{always:t('always'),work:t('worktime')})
    +numeric('amount','amount',s.amount,'any','min="0"')
    +numeric('principal','principal',s.principal,'any','min="0"')
    +numeric('payment','payment',s.payment,'any','min="0"')
    +numeric('rate','rate',s.rate,'any','min="-99" max="1000"')
    +dateInput('start','start',s.start,'required')+dateInput('end','end',s.end),
    data=>({...state,sources:upsert(state.sources,{id:old?.id??uid(),...Object.fromEntries(data),amount:num(data,'amount'),principal:num(data,'principal'),payment:num(data,'payment'),rate:num(data,'rate')})}))
  const defaultsByType={salary:['monthly','work'],deposit:['simple','always'],saving:['simple','always'],mmf:['compound','always'],other:['monthly','always']}
  function refresh() {
    const interest=['simple','compound'].includes(f.elements.method.value)
    const visible={amount:!interest,principal:interest,payment:interest&&f.elements.type.value==='saving',rate:interest}
    for(const [name,show] of Object.entries(visible)) {
      f.elements[name].closest('label').hidden=!show
      f.elements[name].required=show
    }
  }
  f.elements.type.onchange=()=>{
    ;[f.elements.method.value,f.elements.timing.value]=defaultsByType[f.elements.type.value]
    refresh()
  }
  f.elements.method.onchange=refresh
  refresh()
}
function receiptForm(id) {
  const old=state.receipts.find(r=>r.id===id)
  form(old?'edit':'record',input('name','name',old?.name,'maxlength="80"')
    +dateInput('received','date',old?.date??iso(new Date()),'required')+numeric('amount','amount',old?.amount??0),
    data=>({...state,receipts:upsert(state.receipts,{id:old?.id??uid(),name:data.get('name'),date:data.get('date'),amount:num(data,'amount')})}))
}
function scheduleForm() {
  const s=state.schedule, time=k=>input(k,k,s[k],'type="time" required')
  const weekdays=Array.from({length:7},(_,i)=>`<label><input type="checkbox" name="weekdays" value="${i}" ${s.weekdays.includes(i)?'checked':''}>${new Intl.DateTimeFormat(locale(),{weekday:'short'}).format(new Date(2024,0,7+i))}</label>`).join('')
  form('schedule',time('in')+time('out')+time('lunch')+numeric('minutes','minutes',s.minutes,1,'min="0" max="1440"')
    +numeric('payDayInput','payday',s.payday,1,'min="1" max="31"')+numeric('period','period',s.period,1,'min="1" max="31"')
    +`<fieldset class="wide"><legend>${t('weekdays')}</legend><div class="checks">${weekdays}</div></fieldset>`
    +textArea('holidays',s.holidays)+textArea('leave',s.leave),
    data=>({...state,schedule:{...Object.fromEntries(data),minutes:num(data,'minutes'),payday:num(data,'payday'),period:num(data,'period'),
      weekdays:data.getAll('weekdays').map(Number),holidays:data.get('holidays').split(/\s+/).filter(Boolean),leave:data.get('leave').split(/\s+/).filter(Boolean)}}))
}
function appearanceForm() {
  form('appearance',select('language','lang',state.lang,{ko:'한국어',ja:'日本語',en:'English'})
    +select('theme','theme',state.theme,{light:t('light'),dark:t('dark')})
    +select('currency','currency',state.currency,Object.fromEntries(currencies.map(c=>[c,c]))),
    data=>({...state,...Object.fromEntries(data)}),'currencyHelp')
}
function backup() {
  const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}))
  const a=document.createElement('a')
  a.href=url
  a.download='money-grow-'+iso(new Date())+'.json'
  a.click()
  setTimeout(()=>URL.revokeObjectURL(url),30000)
}
root.addEventListener('change',async e=>{
  if(e.target.id!=='backup-file'||!e.target.files[0]) return
  const file=e.target.files[0]
  e.target.value=''
  try {
    if(file.size>10_000_000) return notify('badFile')
    const next=JSON.parse(await file.text())
    if(!valid(next)) return notify('badFile')
    if(confirm(t('restored'))) {
      const error=commit(next)
      if(error) notify(error)
    }
  } catch { notify('badFile') }
})
document.addEventListener('click',async e=>{
  const action=e.target.closest('button[data-action]')?.dataset.action
  if(!action) return
  const [kind,id]=action.split(':')
  if(kind==='page') {page=id;render();window.scrollTo(0,0)}
  if(kind==='theme') {const error=commit({...state,theme:state.theme==='light'?'dark':'light'});if(error)notify(error)}
  if(kind==='mini') {
    const url=new URL(location.href)
    url.searchParams.set('mini','1')
    if(!window.open(url.href,'moneyGrowMini','popup,width=440,height=390')) location.href=url.href
  }
  if(kind==='full') {
    const url=new URL(location.href)
    url.searchParams.delete('mini')
    location.href=url.href
  }
  if(kind==='source') sourceForm(id)
  if(kind==='receipt') receiptForm(id)
  if(kind==='cancel') dialog.close()
  if(kind==='schedule') scheduleForm()
  if(kind==='appearance') appearanceForm()
  if(kind==='goal') form('goal',numeric('assets','assets',state.assets,'any','min="0"')+numeric('goal','goal',state.goal,'any','min="1"'),data=>({...state,assets:num(data,'assets'),goal:num(data,'goal')}))
  if(kind==='backup') backup()
  if(kind==='restore') $('backup-file').click()
  if(kind==='install'&&pendingInstall) {
    await pendingInstall.prompt()
    pendingInstall=null
    render()
  }
  if(kind.startsWith('delete-')&&confirm(t('deleted'))) {
    const list=kind==='delete-source'?'sources':'receipts'
    const error=commit({...state,[list]:state[list].filter(x=>x.id!==id)})
    if(error) notify(error)
  }
})
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pendingInstall=e;if(page==='settings')render()})
window.addEventListener('appinstalled',()=>{pendingInstall=null;if(page==='settings')render()})
window.addEventListener('storage',e=>{
  if(e.key===key||e.key===null) {state=read();model=calendar(state.schedule);render()}
})
window.addEventListener('resize',drawChart)
document.addEventListener('visibilitychange',()=>{if(!document.hidden)nextSample=0})
function frame() {
  if(!document.hidden) update(Date.now())
  requestAnimationFrame(frame)
}
render()
requestAnimationFrame(frame)
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error)
