export const WHEEL_TIME_ZONE='America/New_York';
export const WHEEL_LAUNCH_KEY='2026-09-05';

function easternParts(value=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:WHEEL_TIME_ZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    weekday:'short',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23'
  }).formatToParts(value);
  return Object.fromEntries(parts.map(x=>[x.type,x.value]));
}

function dateKey(date){
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth()+1).padStart(2,'0'),
    String(date.getUTCDate()).padStart(2,'0')
  ].join('-');
}

function weekLabelForKey(key){
  const noon=new Date(`${key}T12:00:00Z`);
  return `Week of ${new Intl.DateTimeFormat('en-US',{
    month:'short',
    day:'numeric',
    year:'numeric',
    timeZone:'UTC'
  }).format(noon)}`;
}

export function wheelTiming(value=new Date()){
  const p=easternParts(value);
  const localDate=new Date(Date.UTC(
    Number(p.year),
    Number(p.month)-1,
    Number(p.day)
  ));
  const weekday=localDate.getUTCDay();
  const afterDeadline=weekday===6&&Number(p.hour)>=20;

  let daysBack=(weekday-6+7)%7;
  if(weekday===6&&!afterDeadline)daysBack=7;

  const latest=new Date(localDate);
  latest.setUTCDate(latest.getUTCDate()-daysBack);

  let daysForward=(6-weekday+7)%7;
  if(weekday===6&&afterDeadline)daysForward=7;

  const next=new Date(localDate);
  next.setUTCDate(next.getUTCDate()+daysForward);

  const latestDrawKey=dateKey(latest);
  const nextDrawKey=dateKey(next);

  return {
    latestDrawKey:latestDrawKey>=WHEEL_LAUNCH_KEY?latestDrawKey:null,
    latestWeekLabel:weekLabelForKey(latestDrawKey),
    nextDrawKey,
    nextWeekLabel:weekLabelForKey(nextDrawKey),
    isDrawHour:weekday===6&&Number(p.hour)===20,
    nextDrawLabel:`Saturday, ${new Intl.DateTimeFormat('en-US',{
      month:'short',
      day:'numeric',
      timeZone:'UTC'
    }).format(next)} at 8:00 PM ET`
  };
}
