import {date,iso} from './engine.mjs'
const oneOf=(n,items)=>items.includes(n)
const number=(n,min=0,max=1e15)=>typeof n==='number' && Number.isFinite(n) && n>=min && n<=max
const whole=(n,min,max)=>Number.isInteger(n)&&number(n,min,max)
export const validDate=s=>typeof s==='string' && /^(19\d{2}|20\d{2}|21\d{2})-\d{2}-\d{2}$/.test(s)&&iso(date(s))===s
const time=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const word=(s,n)=>typeof s==='string'&&s.length<=n
const dates=a=>Array.isArray(a)&&a.length<=20000&&a.every(validDate)
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(s)
export const methods={monthly:'mMonthly',hourly:'mHourly',daily:'mDaily',simple:'mSimple',compound:'mCompound'}
export const types=['salary','deposit','saving','mmf','other']
export const currencies=['KRW','JPY','USD','EUR','GBP','CNY','CAD','AUD','CHF']
export function valid(state) {
  const s=state?.schedule
  return state?.version===1&&oneOf(state.lang,['ko','ja','en'])&&oneOf(state.theme,['light','dark'])&&oneOf(state.currency,currencies)&&
    number(state.goal,1)&&number(state.assets)&&
    (state.home===undefined || !!state.home&&word(state.home.title,60)&&oneOf(state.home.period,['today','month','year'])&&(state.home.source===''||id(state.home.source)))&&s&&time(s.in)&&time(s.out)&&s.in<s.out&&time(s.lunch)&&whole(s.minutes,0,1440)&&
    whole(s.payday,1,31)&&whole(s.period,1,31)&&Array.isArray(s.weekdays)&&s.weekdays.length<=7&&s.weekdays.every(n=>whole(n,0,6))&&dates(s.holidays)&&dates(s.leave)&&
    Array.isArray(state.sources)&&state.sources.length<=250&&state.sources.every(x=>x&&id(x.id)&&word(x.name,80)&&oneOf(x.type,types)&&Object.hasOwn(methods,x.method)&&
    number(x.amount)&&number(x.principal)&&number(x.payment)&&number(x.rate,-99,1000)&&validDate(x.start)&&(x.end===''||validDate(x.end)&&x.end>=x.start)&&oneOf(x.timing,['always','work']))&&
    Array.isArray(state.receipts)&&state.receipts.length<=10000&&state.receipts.every(x=>x&&id(x.id)&&word(x.name,80)&&number(x.amount,-1e15)&&validDate(x.date))&&
    [state.sources,state.receipts].every(items=>new Set(items.map(x=>x.id)).size===items.length)
}
