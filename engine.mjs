export const DAY = 86400000
export const iso = d => [d.getFullYear(), d.getMonth()+1, d.getDate()].map((n,i)=>i ? String(n).padStart(2,'0') : n).join('-')
export const date = s => new Date(s+'T00:00:00')
const year = d => d.getFullYear()
const month = d => d.getMonth()
export const day = d => new Date(year(d), month(d), d.getDate())
export const nextDay = d => new Date(year(d),month(d),d.getDate()+1)
const min = (a,b) => Math.min(+a,+b)
const max = (a,b) => Math.max(+a,+b)
const clock = (d,s) => new Date(year(d),month(d),d.getDate(),...s.split(':').map(Number))
const clipped = (y,m,n) => {
  const end = new Date(y,m+1,0)
  return new Date(year(end),month(end),Math.min(n,end.getDate()))
}
export function cycle(d,n) {
  const start = clipped(year(d),month(d),n)
  const offset = d < start ? -1 : 0
  return [clipped(year(d),month(d)+offset,n),clipped(year(d),month(d)+offset+1,n)]
}
export function defaults() {
  return {
    version:1, lang:'ko', theme:'light', currency:'KRW', goal:10000000, assets:0,
    schedule:{ in:'09:00', out:'18:00', lunch:'12:00', minutes:60, weekdays:[1,2,3,4,5], holidays:[], leave:[], payday:1, period:1 },
    sources:[],
    receipts:[]
  }
}
function isWorkday(d,s) {
  const key=iso(d)
  return s.weekdays.includes(d.getDay())&&!s.holidays.includes(key)&&!s.leave.includes(key)
}
export function isLunchBreak(now,s) {
  if(!s.minutes||!isWorkday(now,s)) return false
  const lunch=+clock(now,s.lunch)
  return now>=clock(now,s.in)&&now<clock(now,s.out)&&now>=lunch&&now<lunch+s.minutes*60000
}
export function windows(d,s) {
  if (!isWorkday(d,s)) return []
  const a=+clock(d,s.in), b=+clock(d,s.out)
  const l=+clock(d,s.lunch), r=l+s.minutes*60000
  if (!s.minutes || r<=a || l>=b) return [[a,b]]
  return [[a,Math.min(b,l)],[Math.max(a,r),b]].filter(([x,y])=>x<y)
}
function overlap(a,b,u,v) { return Math.max(0,min(b,v)-max(a,u)) }
function work(a,b,s) {
  let ms=0
  for(let d=day(new Date(a));d<b;d=nextDay(d)) {
    for(const [u,v] of windows(d,s)) ms+=overlap(a,b,u,v)
  }
  return ms
}
export function calendar(s) {
  const cache=new Map()
  const span=(a,b,timing)=>timing==='work' ? work(a,b,s) : b-a
  const denominator=(a,b,timing)=>{
    const key=[+a,+b,timing].join('/')
    if(!cache.has(key)) cache.set(key,span(a,b,timing))
    return cache.get(key)
  }
  function sourceTotal(src,from,to) {
    const origin=date(src.start)
    let a=max(origin,from)
    const end=src.end ? min(nextDay(date(src.end)),to) : +to
    if(a>=end) return 0
    if(src.method==='hourly') return src.amount*span(a,end,src.timing)/3600000
    if(src.method==='daily') {
      let total=0
      while(a<end) {
        const d=day(new Date(a)), b=+nextDay(d), stop=Math.min(b,end), units=denominator(d,b,src.timing)
        if(units) total+=src.amount*span(a,stop,src.timing)/units
        a=stop
      }
      return total
    }
    if(src.method==='simple' || src.method==='compound') {
      const annual=src.rate/100
      const logRate=Math.log1p(annual)
      const interest=(principal,origin,from,to)=>{
        const elapsed=span(from,to,src.timing)/(365*DAY)
        if(!elapsed) return 0
        if(src.method==='simple') return principal*annual*elapsed
        const prior=span(origin,from,src.timing)/(365*DAY)
        return principal*Math.exp(logRate*prior)*Math.expm1(logRate*elapsed)
      }
      let total=interest(src.principal,origin,a,end)
      if(src.type==='saving' && src.payment) {
        const due=origin.getDate()
        for(let i=1;;i++) {
          const paid=clipped(year(origin),month(origin)+i,due)
          if(paid>=end) break
          total+=interest(src.payment,paid,Math.max(a,+paid),end)
        }
      }
      return total
    }
    let total=0
    while(a<end) {
      const [x,y]=cycle(new Date(a),src.type==='salary' ? s.period : 1)
      const stop=min(y,end)
      const units=denominator(x,y,src.timing)
      if(units) total+=src.amount*span(a,stop,src.timing)/units
      a=stop
    }
    return total
  }
  return {sourceTotal,total:(sources,from,to)=>sources.reduce((n,src)=>n+sourceTotal(src,from,to),0)}
}
export function payday(now,n) {
  const today=day(now)
  const thisMonth=clipped(year(now),month(now),n)
  return thisMonth>=today ? thisMonth : clipped(year(now),month(now)+1,n)
}
