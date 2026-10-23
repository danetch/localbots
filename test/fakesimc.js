#!/usr/bin/env node
// Fake simc for tests: DPS = 100000 + bonuses read from each profileset's lines (+500 embellishment, +3000 enchant 7969, +1500 per crit gem
// 240904) + a small hash; buffed stats per profileset (crit rating grows with crit gems) like profileset_output_data=stats.
const fs=require('fs');const a=process.argv.slice(2);const inp=fs.readFileSync(a[0],'utf8');
const out=a.find(x=>x.startsWith('json2=')).slice(6);
fs.appendFileSync(__dirname+'/inputs.log','=====\n'+inp+'\nARGS '+a.slice(1).join(' ')+'\n');
const names=[...new Set([...inp.matchAll(/profileset\."(c\d+)"\+=/g)].map(m=>m[1]))];
const hash=s=>[...s].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7);
const lines=inp.split('\n');
const stats=crit=>({agility:1000,crit_rating:crit,crit_pct:0.3,haste_rating:800,haste_pct:0.2,mastery_rating:500,mastery_pct:0.3,versatility_rating:400,versatility_pct:0.07});
const withStats=a.includes('profileset_output_data=stats');
// Score the FULL profile (base lines overlaid with the profileset's lines), like simc.
const baseSet={};for(const l of lines){const m=/^(\w+)=(.*)$/.exec(l.trim());if(m)baseSet[m[1]]=m[2]}
const score=set=>{const body=Object.entries(set).map(([k,v])=>k+'='+v).sort().join('|');const gems=(body.match(/240904/g)||[]).length;
 const tierN=['head','shoulder','chest','hands','legs'].filter(k=>/^,?id=90[0-4](,|$)/.test(set[k]||'')).length;
 return {mean:100000+(tierN>=4?5000:0)+(/^,?id=777(,|$)|redirected_base_stats=777(,|$)/.test(set.head||'')?3000:0)+(/embellishment=/.test(body)?500:0)+(/enchant_id=7969/.test(body)?3000:0)*(body.match(/enchant_id=7969/g)||[]).length+1500*gems+hash(body)%200,crit:1300+80*gems}};
const B=score(baseSet);
const res=names.map(n=>{const set={...baseSet};for(const l of lines){const m=new RegExp(`^profileset\\."${n}"\\+=(\\w+)=(.*)$`).exec(l);if(m)set[m[1]]=m[2]}
 const x=score(set),r={name:n,mean:x.mean,mean_error:20};if(withStats)r.overrides={stats:stats(x.crit)};return r});
const hh=a.find(x=>x.startsWith('html='));if(hh)fs.writeFileSync(hh.slice(5),'<html>fake report</html>');
fs.writeFileSync(out,JSON.stringify({sim:{players:[{collected_data:{dps:{mean:B.mean},buffed_stats:{stats:stats(B.crit)}},gear:{head:{name:'x',encoded_item:'',ilevel:300,crit_rating:100}}}],profilesets:{results:res}}}));
