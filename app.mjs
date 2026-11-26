import {calendar,date,day,defaults,iso,isLunchBreak,nextDay,payday,windows} from './engine.mjs'
import {translate} from './labels.mjs'
import {currencies,methods,types,valid,validDate} from './storage.mjs'

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
let format, precise, rateFormat, fullDate, shortDate, percentage, counterFormats
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
function counterAmount(value,rate) {
  const digits=rate?Math.min(8,Math.max(2,2-Math.floor(Math.log10(Math.abs(rate))))):2
  return counterFormats[digits-2](value===0?0:value)
}
function idleReason(sources,today,ms,work) {
  if(!sources.length) return 'idleEmpty'
  const key=iso(today)
  const started=sources.filter(src=>src.start<=key)
  if(!started.length) return 'idleFuture'
  const active=started.filter(src=>!src.end||src.end>=key)
  if(!active.length) return 'idleEnded'
  if(active.every(src=>src.timing==='work')&&!work.some(([a,b])=>a<=ms&&ms<b)) return isLunchBreak(new Date(ms),state.schedule)?'idleLunch':'idleWork'
  return 'idleZero'
}
const sourceName=s=>esc(s.name||t(s.type))
let nextSample=0, sample=null, chartDay=''
function render() {
  document.body.classList.toggle('compact-dashboard',page==='dashboard'&&!mini)
  document.documentElement.lang=state.lang
  document.documentElement.dataset.theme=state.theme
  document.querySelector('meta[name=theme-color]').content=state.theme==='dark'?'#101727':'#f4f6fb'
  const loc=locale(), options={style:'currency',currency:state.currency}
  format=new Intl.NumberFormat(loc,options).format
  precise=new Intl.NumberFormat(loc,{...options,minimumFractionDigits:2,maximumFractionDigits:2}).format
  const normalRate=new Intl.NumberFormat(loc,{...options,minimumFractionDigits:2,maximumFractionDigits:4}).format
  const smallRate=new Intl.NumberFormat(loc,{...options,minimumFractionDigits:2,maximumFractionDigits:12}).format
  rateFormat=value=>value!==0&&Math.abs(value)<0.01?smallRate(value):normalRate(value)
  counterFormats=Array.from({length:7},(_,i)=>new Intl.NumberFormat(loc,{...options,minimumFractionDigits:i+2,maximumFractionDigits:i+2}).format)
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
function maturity(source) {
  if(!source || !['deposit','saving'].includes(source.type) || !['simple','compound'].includes(source.method)) return ''
  if(!source.end) return `<p class="muted maturity-help">${t('maturityHelp')}</p>`
  const projection=model.sourceTotal(source,date(source.start),nextDay(date(source.end)))
  return `<dl class="maturity-summary"><div><dt>${t('maturityDate')}</dt><dd><time datetime="${source.end}">${fullDate(date(source.end))}</time></dd></div><div><dt>${t('maturityInterest')}</dt><dd>${precise(projection)}</dd></div></dl>`
}
const homePeriods=()=>({auto:t('compactAuto'),today:t('today'),month:t('monthly'),year:t('yearly'),since:t('compactSince')})
function homePeriod(source) {
  const configured=state.home?.period
  if(configured && configured!=='auto') return configured
  return ['deposit','saving','mmf'].includes(source?.type)?'since':'today'
}
function mobileDashboard() {
  if(mini) return ''
  const selected=state.sources.find(s=>s.id===state.home?.source)
  const period=homePeriod(selected)
  const shown=selected?[selected]:state.sources
  const rows=shown.map(s=>`<div class="compact-row"><span>${sourceName(s)}</span><strong class="compact-income ${s.type}" id="compact-source-${s.id}"></strong></div>`).join('')
  return `<section class="compact-panel" aria-label="${t('dashboard')}">
    <header class="compact-header"><span class="compact-brand"><img src="./icon-192.png" width="22" height="22" alt=""> MONEY GROW</span>
      <div><span class="compact-status" id="compact-status"><i></i><span id="compact-live"></span></span>${btn('settings','page:settings','settings')}</div>
    </header>
    <div class="compact-total"><p>${esc(state.home?.title || t(({month:'compactMonth',year:'compactYear',since:'compactLifetime'})[period]||'hero'))}</p><strong id="compact-counter"></strong>
      <label class="compact-picker"><span class="compact-sr">${t('sources')}</span><select id="compact-picker"><option value="">${t('compactAll')}</option>${state.sources.map(s=>`<option value="${s.id}" ${s===selected?'selected':''}>${sourceName(s)}</option>`).join('')}</select></label>
      <label class="compact-picker"><span class="compact-sr">${t('compactPeriod')}</span><select id="compact-period">${Object.entries(homePeriods()).map(([value,label])=>`<option value="${value}" ${value===(state.home?.period??'auto')?'selected':''}>${label}</option>`).join('')}</select></label></div>
    ${maturity(selected)}
    <div class="compact-rates">${['second','minute','hour'].map((k,i)=>`<div><span>${t(k)}</span><strong id="compact-rate-${i}"></strong></div>`).join('')}</div>
    <section class="compact-sources" aria-label="${t('sources')}">${rows||btn('add','source')}</section>
    <section class="compact-work" ${selected?.timing==='always'?'hidden':''}><div class="compact-row"><span id="compact-work-label"></span><strong id="compact-time"></strong></div>
      <progress id="compact-progress" max="1" value="0" aria-label="${t('work')}" hidden></progress>
      <p class="compact-encouragement" id="compact-encouragement"></p>
    </section>
  </section>`
}
function rateCards() {
  return `<div class="rates">${['second','minute','hour','daily'].map((k,i)=>`<div class="card">${mini?'':`<span class="chip">${icon(['bolt','clock','clock','calendar'][i])}</span>`}<div class="label">${t(k)}</div><strong class="value" id="rate-${i}"></strong></div>`).join('')}</div>`
}
function dashboard() {
  const counter=`<section class="hero">
    ${mini?'':'<canvas id="chart" aria-hidden="true"></canvas>'}
    <div class="live"><i class="dot"></i><span id="live"></span></div>
    <p class="caption">${t('hero')}</p><p class="counter" id="counter"></p>
    ${mini?'':`<p class="hero-foot">${t('running')} <strong id="hero-rate"></strong></p>`}
  </section>${rateCards()}`
  if(mini) return counter
  return `${mobileDashboard()}<div class="desktop-dashboard">${counter}
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
  <section class="card">${sourceRows(false)}</section></div></div>`
}
function sourceRows(editable) {
  if(!state.sources.length) return `<p class="empty">${t('empty')}</p>`
  return state.sources.map(s=>`<div class="row"><div><span class="row-name">${sourceName(s)}</span><span class="muted">${t(methods[s.method])} · ${s.method==='simple'||s.method==='compound'?percentage(s.rate/100):format(s.amount)}</span></div>${editable?maturity(s):''}<div class="row-actions">${editable?btn('edit','source:'+s.id)+btn('remove','delete-source:'+s.id,'','class="danger"'):`<span class="badge">${t(s.timing==='work'?'worktime':'always')}</span>`}</div></div>`).join('')
}
const sources=()=>`<section class="card">${sourceRows(true)}</section>`
function history() {
  const rows=[...state.receipts].sort((a,b)=>b.date.localeCompare(a.date))
  return `<section class="card"><div class="card-head"><p class="muted">${t('recordHelp')}</p>${btn('record','receipt','plus','class="primary"')}</div>
  ${rows.length?rows.map(r=>`<div class="row"><div><span class="row-name">${esc(r.name)||t('history')}</span><span class="muted">${r.date} · ${format(r.amount)}</span></div><div class="row-actions">${btn('edit','receipt:'+r.id)}${btn('remove','delete-receipt:'+r.id,'','class="danger"')}</div></div>`).join(''):`<p class="empty">${t('empty')}</p>`}</section>`
}
const settings=()=>`<div class="stack"><section class="card"><div class="card-head"><h2>${t('compactHome')}</h2>${btn('edit','compact-home')}</div></section><section class="card"><div class="card-head"><h2>${t('appearance')}</h2>${btn('edit','appearance')}</div><div class="foot muted">${state.currency} · ${t(state.theme)} · ${{ko:'한국어',ja:'日本語',en:'English'}[state.lang]}</div></section>
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
    let compactRate=0, compactValue=0
    if($('compact-counter')) {
      const selected=state.sources.find(s=>s.id===state.home?.source)
      const visibleSources=selected?[selected]:state.sources
      const measure=(a,b)=>model.total(visibleSources,a,b)
      const period=homePeriod(selected)
      const start=period==='since'
        ? new Date(visibleSources.reduce((earliest,src)=>Math.min(earliest,+date(src.start)),ms))
        : period==='month'?periods[0]:period==='year'?periods[1]:today
      compactRate=measure(now,new Date(ms+1))*1000
      compactValue=measure(start,now)
      put('compact-live',t(compactRate!==0?'compactLive':idleReason(visibleSources,today,ms,work)))
      $('compact-status').classList.toggle('earning',compactRate!==0)
      ;[compactRate,compactRate*60,compactRate*3600].forEach((v,i)=>put('compact-rate-'+i,rateFormat(v)))
      for(const src of visibleSources) {
        const value=model.sourceTotal(src,start,now)
        put('compact-source-'+src.id,(value>0?'+':'')+(value===0?format(0):precise(value)))
        $('compact-source-'+src.id).classList.toggle('zero',value===0)
      }
      const progress=$('compact-progress')
      const scheduled=work.reduce((sum,[a,b])=>sum+b-a,0)
      const worked=work.reduce((sum,[a,b])=>sum+Math.max(0,Math.min(ms,b)-a),0)
      progress.hidden=!scheduled
      progress.value=scheduled?worked/scheduled:0
      const message=!scheduled?'cheerOff':!remaining?'cheerDone':isLunchBreak(now,state.schedule)?'cheerLunch':progress.value>=0.8?'cheerSoon':'cheerWork'
      put('compact-encouragement',t(message))
    }
    sample={ms,rate,today,compactRate,compactValue,value:total(today,now)}
    nextSample=ms+400
    put('live',t(rate!==0?'live':idleReason(state.sources,today,ms,work)))
    put('hero-rate',rateFormat(rate)+' / '+t('second'))
    ;[rate,rate*60,rate*3600,total(today,tomorrow)].forEach((v,i)=>put('rate-'+i,(i===3?precise:rateFormat)(v)))
    ;[today,...periods].forEach((from,i)=>{
      put('estimate-'+i,format(i===0?sample.value:total(from,now)))
      put('actual-'+i,format(actual(from,now)))
    })
    const seconds=Math.ceil(remaining/1000)
    const time=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,'0')).join(':')
    put('work-label',t(remaining?'until':'off'))
    put('time-left',remaining?time:'')
    put('compact-work-label',t(remaining?'until':'off'))
    put('compact-time',remaining?time:'')
    put('work-money',format(remaining?total(now,new Date(end)):0))
    put('payday',shortDate(payday(now,state.schedule.payday)))
    put('today-date',fullDate(now))
    if(chartDay!==iso(today)) { chartDay=iso(today); drawChart() }
  }
  const value=sample.value+sample.rate*(ms-sample.ms)/1000
  const display=counterAmount(value,sample.rate)
  put('counter',display)
  const compact=sample.compactValue+sample.compactRate*(ms-sample.ms)/1000
  put('compact-counter',counterAmount(compact,sample.compactRate))
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
const num=(data,k)=>Number(data.get(k))
const uid=()=>globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)
const upsert=(rows,entry)=>rows.some(x=>x.id===entry.id)?rows.map(x=>x.id===entry.id?entry:x):[...rows,entry]
function form(title,fields,save,hint='') {
  dialog.classList.toggle('schedule-dialog',title==='schedule')
  dialog.innerHTML=`<form><h2 id="dialog-title" ${title==='schedule'?'tabindex="-1" autofocus':''}>${t(title)}</h2>${hint?'<p class="muted">'+t(hint)+'</p>':''}<div class="fields">${fields}</div><div class="error" role="alert"></div><div class="form-actions">${btn('cancel','cancel')}<button class="primary">${t('save')}</button></div></form>`
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
    const endLabel=interest&&['deposit','saving'].includes(f.elements.type.value)?'maturityDate':'end'
    f.elements.end.closest('label').firstChild.textContent=t(endLabel)
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
  const s=state.schedule
  const time=k=>input(k,k,s[k],'type="time" required')
  const weekdays=Array.from({length:7},(_,i)=>`<label><input type="checkbox" name="weekdays" value="${i}" ${s.weekdays.includes(i)?'checked':''}><span>${new Intl.DateTimeFormat(locale(),{weekday:'short'}).format(new Date(2024,0,7+i))}</span></label>`).join('')
  const group=(label,fields)=>`<fieldset class="schedule-group"><legend>${t(label)}</legend><div class="schedule-grid">${fields}</div></fieldset>`
  const dates={holidays:[...new Set(s.holidays)].sort(),leave:[...new Set(s.leave)].sort()}
  const picker=(key,label)=>`<fieldset class="schedule-group" data-date-group="${key}"><legend>${t(label)}</legend>
    <div class="schedule-date-entry">${dateInput('chooseDate',key+'Date','')}<button type="button" data-add-date>${t('addDate')}</button></div>
    <ul class="schedule-date-list"></ul></fieldset>`
  const f=form('schedule',
    group('work',time('in')+time('out')+time('lunch')+numeric('minutes','minutes',s.minutes,1,'min="0" max="1440"'))
    +`<fieldset class="schedule-group"><legend>${t('weekdays')}</legend><div class="checks">${weekdays}</div></fieldset>`
    +group('payroll',numeric('payDayInput','payday',s.payday,1,'min="1" max="31"')+numeric('period','period',s.period,1,'min="1" max="31"'))
    +picker('holidays','holidayDates')+picker('leave','leaveDates'),
    data=>({...state,schedule:{...s,in:data.get('in'),out:data.get('out'),lunch:data.get('lunch'),
      minutes:num(data,'minutes'),payday:num(data,'payday'),period:num(data,'period'),
      weekdays:data.getAll('weekdays').map(Number),...dates}}))
  for(const group of f.querySelectorAll('[data-date-group]')) {
    const key=group.dataset.dateGroup
    const field=group.querySelector('input')
    const add=group.querySelector('[data-add-date]')
    const list=group.querySelector('ul')
    function showDates() {
      list.hidden=dates[key].length===0
      list.innerHTML=dates[key].map(d=>`<li><time datetime="${d}">${d}</time><button type="button" data-remove-date="${d}" aria-label="${d} ${t('remove')}">${t('remove')}</button></li>`).join('')
    }
    function updateAdd() {add.disabled=!validDate(field.value)||dates[key].includes(field.value)}
    field.addEventListener('input',updateAdd)
    field.addEventListener('change',updateAdd)
    add.addEventListener('click',()=>{
      if(!validDate(field.value)||dates[key].includes(field.value)) return
      dates[key].push(field.value)
      dates[key].sort()
      field.value=''
      showDates()
      updateAdd()
    })
    list.addEventListener('click',e=>{
      const value=e.target.closest('[data-remove-date]')?.dataset.removeDate
      if(!value) return
      dates[key]=dates[key].filter(d=>d!==value)
      showDates()
      updateAdd()
      field.focus()
    })
    showDates()
    updateAdd()
  }
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
  const homeField={'compact-picker':'source','compact-period':'period'}[e.target.id]
  if(homeField) {
    const error=commit({...state,home:{source:'',period:'auto',title:'',...state.home,[homeField]:e.target.value}})
    if(error)notify(error)
    return
  }
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
    if(!window.open(url.href,'moneyGrowMini','popup,width=460,height=290,resizable=yes')) location.href=url.href
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
  if(kind==='compact-home') {
    const home=state.home??{source:'',title:'',period:'auto'}
    const options={'':t('compactAll')}
    for(const source of state.sources) options[source.id]=sourceName(source)
    form('compactHome',input('compactTitle','title',home.title,'maxlength="60"')
      +select('sources','source',home.source,options)
      +select('compactPeriod','period',home.period,homePeriods()),
      data=>({...state,home:Object.fromEntries(data)}))
  }
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
