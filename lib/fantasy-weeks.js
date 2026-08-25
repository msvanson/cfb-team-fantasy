export const FANTASY_WEEKS_2026=[
 {key:'Week 1',label:'Week 1',start:'2026-08-28T00:00:00-04:00',end:'2026-09-08T00:00:00-04:00',dates:'Aug 28 – Sep 7'},
 {key:'Week 2',label:'Week 2',start:'2026-09-08T00:00:00-04:00',end:'2026-09-14T00:00:00-04:00',dates:'Sep 8–13'},
 {key:'Week 3',label:'Week 3',start:'2026-09-14T00:00:00-04:00',end:'2026-09-21T00:00:00-04:00',dates:'Sep 14–20'},
 {key:'Week 4',label:'Week 4',start:'2026-09-21T00:00:00-04:00',end:'2026-09-28T00:00:00-04:00',dates:'Sep 21–27'},
 {key:'Week 5',label:'Week 5',start:'2026-09-28T00:00:00-04:00',end:'2026-10-05T00:00:00-04:00',dates:'Sep 28 – Oct 4'},
 {key:'Week 6',label:'Week 6',start:'2026-10-05T00:00:00-04:00',end:'2026-10-12T00:00:00-04:00',dates:'Oct 5–11'},
 {key:'Week 7',label:'Week 7',start:'2026-10-12T00:00:00-04:00',end:'2026-10-19T00:00:00-04:00',dates:'Oct 12–18'},
 {key:'Week 8',label:'Week 8',start:'2026-10-19T00:00:00-04:00',end:'2026-10-26T00:00:00-04:00',dates:'Oct 19–25'},
 {key:'Week 9',label:'Week 9',start:'2026-10-26T00:00:00-04:00',end:'2026-11-02T00:00:00-05:00',dates:'Oct 26 – Nov 1'},
 {key:'Week 10',label:'Week 10',start:'2026-11-02T00:00:00-05:00',end:'2026-11-09T00:00:00-05:00',dates:'Nov 2–8'},
 {key:'Week 11',label:'Week 11',start:'2026-11-09T00:00:00-05:00',end:'2026-11-16T00:00:00-05:00',dates:'Nov 9–15'},
 {key:'Week 12',label:'Week 12',start:'2026-11-16T00:00:00-05:00',end:'2026-11-23T00:00:00-05:00',dates:'Nov 16–22'},
 {key:'Week 13',label:'Week 13',start:'2026-11-23T00:00:00-05:00',end:'2026-11-30T00:00:00-05:00',dates:'Nov 23–29'},
 {key:'Conference Championship Week',label:'Conference Championship Week',start:'2026-11-30T00:00:00-05:00',end:'2026-12-07T00:00:00-05:00',dates:'Nov 30 – Dec 6'},
 {key:'Playoffs',label:'Playoffs',start:'2026-12-07T00:00:00-05:00',end:'2027-01-28T00:00:00-05:00',dates:'Dec 7 – Jan 27'}
];
export function fantasyWeekForDate(value){
 const t=new Date(value).getTime();
 return FANTASY_WEEKS_2026.find(w=>t>=new Date(w.start).getTime()&&t<new Date(w.end).getTime())||null;
}
export function currentFantasyWeek(now=new Date()){
 return fantasyWeekForDate(now)||FANTASY_WEEKS_2026[0];
}
