import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid, Legend, Area, AreaChart, LineChart, Line } from "recharts";

const C = {bg:"#080c14",p:"#0f1520",pb:"#1a2332",r:"#ef4444",rd:"#7f1d1d",w:"#f59e0b",wd:"#78350f",g:"#10b981",b:"#3b82f6",pp:"#a78bfa",t:"#e2e8f0",td:"#64748b",tm:"#475569",o:"#f97316",cy:"#22d3ee",pk:"#f43f5e"};
const F="'JetBrains Mono','Fira Code',monospace";

// ═══════ ALL DATA — DAY 45 (Apr 13, 2026 16:00 CET) ═══════

// PRODUCTION — current best estimates
const prod = [
  {c:"Saudi Arabia",flag:"🇸🇦",pre:10.4,cur:9.1,hz:89,note:"East-West pipeline restored to 7M bpd (Apr 12). Manifa (300K bpd) restored. Khurais (300K bpd) still partially offline. Yanbu exports resumed. Ras Tanura refinery damaged. 600K bpd capacity lost from attacks, ~300K recovered so far."},
  {c:"Iraq",flag:"🇮🇶",pre:4.3,cur:1.2,hz:97,note:"Force majeure still active on ALL foreign-operated fields. Basra output slowly recovering (~1.2M bpd). Ceyhan pipeline suspended. Southern exports minimal. Kurdistan exports remain halted."},
  {c:"UAE",flag:"🇦🇪",pre:3.2,cur:1.8,hz:66,note:"Ruwais refinery partially restarting under ceasefire. ADCOP bypass resumed at reduced capacity. EGA declared force majeure after Taweelah hit. 334+ ballistic missiles + 1,714+ drones fired at UAE since war start."},
  {c:"Kuwait",flag:"🇰🇼",pre:2.57,cur:0.6,hz:100,note:"Mina Al-Ahmadi refinery attacked Mar 19. Force majeure. Minimal production recovery during ceasefire. Al Salmi VLCC hit by drone at Dubai port Mar 31 (oil spill risk)."},
  {c:"Qatar",flag:"🇶🇦",pre:1.8,cur:0.2,hz:100,note:"Ras Laffan: 2 LNG trains destroyed (17% capacity). Won't reach full capacity before Aug at earliest. Japanese contractor Chiyoda considering resuming NFE expansion work. $20B+ annual revenue impact."},
  {c:"Iran",flag:"🇮🇷",pre:3.2,cur:1.0,hz:80,note:"South Pars still partially offline (12% gas). Lavan refinery + Sirri crude export hit AFTER ceasefire announced. Kharg Island operational. Shadow fleet exports to China continue. Gov estimates $300B-$1T total economic damage."},
  {c:"Bahrain",flag:"🇧🇭",pre:0.2,cur:0.02,hz:100,note:"BAPCO force majeure remains. 143+ missiles + 242+ drones intercepted since war start. Infrastructure slowly being assessed under ceasefire."},
  {c:"Oman",flag:"🇴🇲",pre:1.0,cur:0.7,hz:50,note:"Duqm, Salalah, Sohar ports increasingly used as bypass. Non-Strait exports recovering. Emerging as key alternative route."},
];
const totPre=prod.reduce((s,d)=>s+d.pre,0);
const totCur=prod.reduce((s,d)=>s+d.cur,0);
const totLost=totPre-totCur;

// OIL PRICE TIMELINE
const prices=[
  {d:"Feb 27",b:72.87},{d:"Mar 2",b:84},{d:"Mar 5",b:90},{d:"Mar 9",b:119.5},{d:"Mar 10",b:87.8},
  {d:"Mar 12",b:100.5},{d:"Mar 16",b:106},{d:"Mar 19",b:113},{d:"Mar 23",b:113.5},
  {d:"Mar 26",b:116},{d:"Mar 30",b:118},{d:"Mar 31",b:119.2},
  {d:"Apr 3",b:112},{d:"Apr 7",b:108},{d:"Apr 8",b:95},{d:"Apr 9",b:98},{d:"Apr 10",b:96},
  {d:"Apr 11",b:95},{d:"Apr 13",b:102},
];

// STRAIT TRAFFIC
const strait=[
  {d:"Pre-war",c:153},{d:"Feb 28",c:105},{d:"Mar 1",c:13},{d:"Mar 4",c:5},{d:"Mar 9",c:1},
  {d:"Mar 16",c:3},{d:"Mar 23",c:2},{d:"Mar 30-Apr 5",c:11},{d:"Apr 8",c:6},
  {d:"Apr 9",c:8},{d:"Apr 10",c:15},{d:"Apr 11",c:6},{d:"Apr 13",c:3},
];

// KEY EVENTS TIMELINE
const timeline = [
  {d:"Feb 28",ev:"Operation Epic Fury launched. Khamenei killed. Iran retaliates across Gulf.",cat:"war",sev:5},
  {d:"Mar 2",ev:"IRGC declares Strait closed. Qatar LNG halted. Ras Tanura shut.",cat:"energy",sev:5},
  {d:"Mar 9",ev:"Brent hits $119.50. Mojtaba Khamenei named new supreme leader.",cat:"market",sev:5},
  {d:"Mar 11",ev:"IEA releases record 400M bbl. Iran confirms mines in Strait.",cat:"response",sev:5},
  {d:"Mar 12",ev:"IEA OMR: 'largest supply disruption in history.' Gulf cuts at 10M+ bpd.",cat:"market",sev:5},
  {d:"Mar 18",ev:"Israel strikes South Pars gas field (world's largest). 12% of Iran gas offline.",cat:"war",sev:5},
  {d:"Mar 19",ev:"Iran retaliates: Ras Laffan 'extensive damage' (17% capacity). Kuwait Mina Al-Ahmadi attacked.",cat:"energy",sev:5},
  {d:"Mar 20",ev:"Iraq force majeure on all foreign fields. Pentagon requests $200B war funding.",cat:"response",sev:3},
  {d:"Mar 22",ev:"Trump 48hr ultimatum: reopen Strait or US 'obliterates' power plants.",cat:"war",sev:5},
  {d:"Mar 25",ev:"Pakistan delivers US 15-point peace proposal to Iran. Iran rejects it.",cat:"response",sev:3},
  {d:"Mar 26",ev:"Iran allows China, Russia, India, Iraq, Pakistan vessels through Strait. Israeli airstrike kills IRGC Navy commander Tangsiri.",cat:"strait",sev:4},
  {d:"Mar 28",ev:"Houthis launch missiles/drones toward Israel — new front opens.",cat:"war",sev:4},
  {d:"Mar 30",ev:"Trump threatens desalination plants + Kharg Island. Express Rome hit by projectiles off Ras Tanura.",cat:"war",sev:4},
  {d:"Mar 31",ev:"Kuwaiti VLCC Al Salmi hit by Iranian drone at Port of Dubai. Fire + oil spill warning. Brent ~$119.",cat:"energy",sev:5},
  {d:"Apr 1",ev:"Trump claims Iran asked for ceasefire. Iran denies. IRGC: 'Strait will not be opened.' Pakistan + China deliver 5-point peace initiative.",cat:"response",sev:3},
  {d:"Apr 5",ev:"Trump threatens power plants + bridges if Strait not reopened in 2 days. Pakistan proposes 45-day ceasefire — Iran rejects.",cat:"war",sev:4},
  {d:"Apr 7-8",ev:"CEASEFIRE: US + Iran agree to 2-week ceasefire brokered by Pakistan. Iran to allow Strait shipping. Brent crashes from $108→$95. Then: Lavan refinery + Sirri struck AFTER announcement.",cat:"response",sev:5},
  {d:"Apr 8",ev:"Israel launches strongest wave of attacks on Lebanon since war start. Iran pauses Strait traffic in response. Ceasefire immediately strained.",cat:"war",sev:5},
  {d:"Apr 9",ev:"Saudi reveals 600K bpd production capacity cut + 700K bpd pipeline throughput lost from attacks. No sign Strait reopening.",cat:"energy",sev:5},
  {d:"Apr 10",ev:"Iran begins demanding $1/bbl toll in crypto for Strait passage. Publishes 2 safe routes near Larak Island. Iran confirms mines exist.",cat:"strait",sev:4},
  {d:"Apr 11",ev:"USS Petersen + USS Murphy transit Strait (first US warships since Feb 28). Iran denies it happened. Vance arrives Islamabad for talks.",cat:"strait",sev:5},
  {d:"Apr 12",ev:"ISLAMABAD TALKS FAIL after 21hrs. Vance departs. Trump announces NAVAL BLOCKADE of all Iranian ports. Saudi restores East-West pipeline to 7M bpd.",cat:"war",sev:5},
  {d:"Apr 13",ev:"TODAY: US blockade of Iranian ports begins 10am ET. CENTCOM: 'will not impede non-Iranian port traffic.' Iran calls it 'piracy.' Brent surges to $102. 3,200 vessels + 20,000 mariners stranded.",cat:"strait",sev:5},
];

// AGGREGATE DAMAGE ECONOMICS
const econData = {
  estPhysicalDamage: "15-25",
  estPhysicalDamageMid: 20,
  dailyRevLoss: 600,
  cumRevLoss45d: 27,
  projected90dRevLoss: 54,
  brentPreWar: 72.87,
  brentCurrent: 102,
  brentPeak: 119.5,
  brentQ1Close: 118,
  usGasPrice: 4.16,
  usGasPreWar: 2.98,
  ieaRelease: 400,
  usSprRelease: 172,
  globalSupplyLoss: 8,
  gulfProductionCuts: 10,
  refiningOffline: 4,
  vesselAttacks: 25,
  crewKilled: 7,
  crewMissing: 6,
  vesselsStranded: 3200,
  tankersStranded: 800,
  marinersStranded: 20000,
  daysOfWar: 45,
  straitCrossingsPerDay: 3,
  preWarStraitCrossings: 153,
  iranCivDead: 1701,
  iranChildDead: 254,
  lebDeaths: 1497,
  arabCountriesCost: 120,
  iranDamageEstLow: 300,
  iranDamageEstHigh: 1000,
  usMilitaryCost: 18,
  pentagonRequest: 200,
  saudiCapLost: 600,
  saudiPipelineLost: 700,
  ceasefire: true,
  ceasefireStart: "Apr 8",
  ceasefireEnd: "Apr 22",
  blockadeStart: "Apr 13",
};

const responseChart = [
  {name:"Gulf supply lost",val:econData.gulfProductionCuts,fill:C.r},
  {name:"IEA SPR release rate\n(~2-4M bpd max)",val:3,fill:C.b},
  {name:"Bypass pipelines\n(Saudi E-W ~7M bpd restored)",val:5,fill:C.g},
  {name:"Unrecoverable gap",val:2,fill:C.pk},
];

// ═══════ COMPONENTS ═══════
const Bg=({ch,bg,co,bo})=> <span style={{display:"inline-block",padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:700,background:bg,color:co,border:`1px solid ${bo}`,fontFamily:F,letterSpacing:"0.04em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{ch}</span>;
const SC=({l,v,s,co=C.t,ic})=> <div style={{background:C.p,border:`1px solid ${C.pb}`,borderRadius:8,padding:"12px 14px",flex:1,minWidth:145,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:0,right:0,height:2,background:co}}/><div style={{fontSize:9,color:C.td,fontFamily:F,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{ic} {l}</div><div style={{fontSize:20,fontWeight:800,color:co,fontFamily:F,lineHeight:1.1}}>{v}</div>{s&&<div style={{fontSize:9,color:C.tm,marginTop:2,fontFamily:F}}>{s}</div>}</div>;
const Sec=({ch,ac=C.r})=> <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,marginTop:24}}><div style={{width:4,height:20,background:ac,borderRadius:2}}/><h2 style={{margin:0,fontSize:12,fontWeight:700,color:C.t,fontFamily:F,letterSpacing:"0.04em",textTransform:"uppercase"}}>{ch}</h2><div style={{flex:1,height:1,background:C.pb}}/></div>;
const P=({ch,st})=> <div style={{background:C.p,border:`1px solid ${C.pb}`,borderRadius:8,padding:16,...st}}>{ch}</div>;
const Tip=({active,payload,label})=>{if(!active||!payload?.length)return null;return <div style={{background:"#1a2332",border:`1px solid ${C.pb}`,borderRadius:6,padding:"7px 10px",fontFamily:F,fontSize:10}}><div style={{color:C.td,marginBottom:2}}>{label}</div>{payload.map((p,i)=> <div key={i} style={{color:p.color||C.t}}>{p.name}: <strong>{typeof p.value==="number"?p.value.toFixed(1):p.value}</strong></div>)}</div>};
const MBar=({pct,co})=> <div style={{background:"#1a2332",borderRadius:3,height:5,width:"100%",overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",borderRadius:3,background:co||C.r}}/></div>;

// ═══════ APP ═══════
const TABS=["Situation","Production","Timeline","Infrastructure","Maritime","Economic Impact"];

export default function App(){
  const[tab,setTab]=useState("Situation");
  const catColors={war:C.r,energy:C.o,market:C.w,response:C.b,strait:C.cy};
  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.t,fontFamily:F}}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}} ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:${C.bg}} ::-webkit-scrollbar-thumb{background:${C.pb};border-radius:3px} table{border-collapse:collapse;width:100%} th,td{padding:7px 8px;text-align:left;font-family:${F};font-size:10px;border-bottom:1px solid ${C.pb}} th{color:${C.td};font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase}`}</style>

      {/* HEADER */}
      <div style={{background:"linear-gradient(180deg,#1a0808 0%,#080c14 100%)",borderBottom:`1px solid ${C.rd}`,padding:"16px 24px 12px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:C.w,boxShadow:"0 0 10px #f59e0b88",animation:"pulse 1.5s infinite"}}/>
              <span style={{fontSize:9,color:C.w,fontWeight:700,letterSpacing:"0.15em"}}>CEASEFIRE IN EFFECT (STRAINED) — DAY {econData.daysOfWar} — WEEK 7</span>
            </div>
            <h1 style={{margin:"2px 0",fontSize:19,fontWeight:800,background:"linear-gradient(90deg,#f87171,#fbbf24)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Strait of Hormuz — Hydrocarbon Impact Assessment</h1>
          </div>
          <div style={{textAlign:"right",fontSize:10,color:C.td}}>
            <div>13 Apr 2026, 16:00 CET</div>
            <div style={{color:C.r,fontWeight:700}}>⚠ US NAVAL BLOCKADE OF IRANIAN PORTS BEGINS TODAY — ISLAMABAD TALKS FAILED</div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,flexWrap:"wrap",marginTop:10}}>
          {TABS.map(t=> <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?C.p:"transparent",border:tab===t?`1px solid ${C.pb}`:"1px solid transparent",borderBottom:tab===t?`1px solid ${C.bg}`:"none",borderRadius:"5px 5px 0 0",padding:"6px 12px",color:tab===t?C.t:C.tm,fontFamily:F,fontSize:10,fontWeight:600,cursor:"pointer",letterSpacing:"0.04em",textTransform:"uppercase"}}>{t}</button>)}
        </div>
      </div>

      <div style={{padding:"0 24px 40px",maxWidth:1360,margin:"0 auto"}}>

{/* ═══ SITUATION OVERVIEW ═══ */}
{tab==="Situation"&&<>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
    <SC l="Gulf Output" v={`${totCur.toFixed(1)}M`} s={`of ${totPre.toFixed(1)}M bpd (−${((totLost/totPre)*100).toFixed(0)}%)`} co={C.r} ic="▼"/>
    <SC l="Brent Crude" v="$102/bbl" s={`Pre-war $72.87 (+40%). Peak $119.50`} co={C.o} ic="◆"/>
    <SC l="Strait Traffic" v="~3/day" s={`of 153 normal (−98%). Ceasefire = minimal`} co={C.r} ic="🚢"/>
    <SC l="Vessels Stranded" v="3,200" s="800 tankers. 20,000 mariners trapped" co={C.pk} ic="⚓"/>
    <SC l="US Gas" v="$4.16/gal" s={`Pre-war $2.98 (+40%). First >$4 since 2022`} co={C.w} ic="⛽"/>
    <SC l="Mines" v="CONFIRMED" s="Iran published 2 safe routes. US clearing" co={C.pk} ic="💣"/>
    <SC l="Ceasefire" v="STRAINED" s="Apr 8-22. Israel attacks Lebanon. Talks failed" co={C.w} ic="⏸"/>
    <SC l="US Blockade" v="BEGINS TODAY" s="All Iranian ports. 10am ET. 'Piracy' — Iran" co={C.r} ic="🚫"/>
  </div>

  <div style={{display:"flex",gap:12,marginTop:8,flexWrap:"wrap"}}>
    <div style={{flex:1.3,minWidth:380}}>
      <Sec ch="Brent Crude — Feb 27 to Apr 13 ($/bbl)" ac={C.o}/>
      <P st={{padding:14}} ch={<ResponsiveContainer width="100%" height={220}>
        <AreaChart data={prices}><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.o} stopOpacity={0.3}/><stop offset="95%" stopColor={C.o} stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.pb}/><XAxis dataKey="d" tick={{fill:C.td,fontSize:7,fontFamily:F}} angle={-25} textAnchor="end" height={40}/><YAxis domain={[60,130]} tick={{fill:C.td,fontSize:8,fontFamily:F}} unit="$"/>
        <Tooltip content={<Tip/>}/><Area type="monotone" dataKey="b" stroke={C.o} fill="url(#pg)" strokeWidth={2} name="Brent"/></AreaChart>
      </ResponsiveContainer>}/>
      <div style={{fontSize:9,color:C.tm,marginTop:4}}>Note: Apr 7-8 ceasefire announcement triggered ~20% drop. Blockade announcement (Apr 13) driving recovery to $102+.</div>
    </div>
    <div style={{flex:0.7,minWidth:280}}>
      <Sec ch="Strait Crossings / Day" ac={C.b}/>
      <P st={{padding:14}} ch={<ResponsiveContainer width="100%" height={220}>
        <BarChart data={strait}><CartesianGrid strokeDasharray="3 3" stroke={C.pb}/><XAxis dataKey="d" tick={{fill:C.td,fontSize:6,fontFamily:F}} angle={-35} textAnchor="end" height={45}/><YAxis tick={{fill:C.td,fontSize:8,fontFamily:F}}/>
        <Tooltip content={<Tip/>}/><Bar dataKey="c" name="Crossings" radius={[2,2,0,0]}>{strait.map((e,i)=> <Cell key={i} fill={i===0?C.b:e.c>10?C.g:e.c>3?C.w:C.r}/>)}</Bar></BarChart>
      </ResponsiveContainer>}/>
      <div style={{fontSize:9,color:C.tm,marginTop:4}}>Apr 10 spike (15) = Trump deadline day. Ceasefire has NOT meaningfully reopened the Strait.</div>
    </div>
  </div>

  <Sec ch="Critical Developments — Ceasefire to Blockade (Apr 7-13)" ac={C.pk}/>
  <P st={{fontSize:11,color:C.td,lineHeight:1.75}} ch={<>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.g}}>Apr 7-8 — Ceasefire announced:</strong> Pakistan-brokered 2-week ceasefire. Iran agrees to allow Strait shipping. Brent crashes from $108→$95 (-12%). But within hours: Israel launches strongest attacks on Lebanon since war start. Iran pauses Strait traffic in response. Lavan refinery + Sirri crude export hit AFTER ceasefire announced.</p>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.o}}>Apr 9-10 — Saudi damage revealed:</strong> Saudi Arabia discloses 600K bpd production capacity lost + 700K bpd pipeline throughput cut from Iranian attacks on Manifa, Khurais, Satorp (Jubail), Ras Tanura, Yanbu. Iran publishes 2 safe routes through Strait near Larak Island. Demands $1/bbl toll in crypto. Still only ~6-15 vessels/day transiting.</p>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.cy}}>Apr 11 — US warships transit Strait:</strong> USS Petersen + USS Murphy become first US warships through Strait since Feb 28. Iran denies it happened. IRGC vows "strong response." Meanwhile, Vance + Witkoff + Kushner arrive Islamabad for talks with Araghchi + Ghalibaf.</p>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.r}}>Apr 12 — Islamabad talks collapse:</strong> After 21+ hours of negotiations, Vance departs saying Iran "chose not to accept our terms." Key disagreements: nuclear program, Strait control, Lebanon, war reparations, frozen assets. Trump immediately announces FULL NAVAL BLOCKADE of all Iranian ports. Saudi restores East-West pipeline to 7M bpd.</p>
    <p style={{margin:0}}><strong style={{color:C.pk}}>Apr 13 — Today:</strong> US blockade begins 10am ET. CENTCOM: will block all traffic to/from Iranian ports but "not impede" non-Iranian port traffic through Strait. Iran calls it "illegal act of piracy." Will also interdict any vessel that paid Iran's toll. 3,200 vessels + 20,000 mariners stranded in Gulf. Brent surges to $102. CNN: even if Strait fully opens, oil flows won't normalize until July.</p>
  </>}/>

  <Sec ch="Why the Ceasefire Hasn't Fixed Anything" ac={C.b}/>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
    {[
      {t:"Strait Still Closed",v:"<10%",s:"of normal traffic. Ceasefire ≠ reopening. Mines + insurance = no ships",c:C.r},
      {t:"Vessels Trapped",v:"3,200",s:"800 tankers + 2,400 other ships. 500-700 over 10K dwt stuck inside Gulf",c:C.pk},
      {t:"Inbound Problem",v:"~100 empty",s:"400 loaded tankers want OUT. Only ~100 want IN. Takes until July to normalize (CNN)",c:C.o},
      {t:"Insurance Void",v:"WAR RISK",s:"P&I war risk still withdrawn. Owners won't transit without coverage (Lloyd's)",c:C.r},
      {t:"Mines Remain",v:"'FEW DOZEN'",s:"Iran confirmed. US has no minesweepers — last 4 decommissioned Sept 2025",c:C.pk},
      {t:"Israel/Lebanon",v:"SPOILER",s:"Netanyahu: ceasefire doesn't include Lebanon. 350 killed in Lebanon day after ceasefire",c:C.r},
    ].map((item,i)=> <P key={i} st={{padding:12,borderTop:`2px solid ${item.c}`}} ch={<>
      <div style={{fontSize:9,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em"}}>{item.t}</div>
      <div style={{fontSize:18,fontWeight:800,color:item.c,marginTop:2}}>{item.v}</div>
      <div style={{fontSize:9,color:C.tm,marginTop:2}}>{item.s}</div>
    </>}/>)}
  </div>
</>}

{/* ═══ PRODUCTION ═══ */}
{tab==="Production"&&<>
  <Sec ch="Gulf Production: Pre-War vs Current (M bpd)" ac={C.w}/>
  <P ch={<ResponsiveContainer width="100%" height={300}>
    <BarChart data={prod} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke={C.pb}/><XAxis dataKey="c" tick={{fill:C.td,fontSize:9,fontFamily:F}}/><YAxis tick={{fill:C.td,fontSize:9,fontFamily:F}} unit="M"/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontFamily:F,fontSize:10}}/>
    <Bar dataKey="pre" name="Pre-War" fill="#334155" radius={[3,3,0,0]}/><Bar dataKey="cur" name="Current (Day 45)" radius={[3,3,0,0]}>{prod.map((e,i)=> <Cell key={i} fill={e.cur/e.pre<0.3?C.r:e.cur/e.pre<0.6?C.o:C.w}/>)}</Bar></BarChart>
  </ResponsiveContainer>}/>

  <Sec ch="Country Detail" ac={C.o}/>
  {prod.map((d,i)=>{const pct=((d.pre-d.cur)/d.pre*100).toFixed(0);return <P key={i} st={{marginBottom:8,padding:12}} ch={<>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5,flexWrap:"wrap",gap:4}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>{d.flag}</span><span style={{fontSize:13,fontWeight:700}}>{d.c}</span>
        {d.hz>=95&&<Bg ch="100% HORMUZ" bg={C.rd} co="#fca5a5" bo={C.rd}/>}
      </div>
      <div><span style={{fontSize:18,fontWeight:800,color:parseInt(pct)>70?C.r:parseInt(pct)>40?C.o:C.w}}>{d.cur}M</span><span style={{fontSize:11,color:C.tm}}> / {d.pre}M</span><span style={{marginLeft:8,fontSize:12,fontWeight:700,color:parseInt(pct)>70?C.r:parseInt(pct)>40?C.o:C.w}}>▼{pct}%</span></div>
    </div>
    <MBar pct={d.cur/d.pre*100} co={parseInt(pct)>70?C.r:parseInt(pct)>40?C.o:C.w}/>
    <div style={{fontSize:10,color:C.tm,lineHeight:1.5,marginTop:5}}>{d.note}</div>
  </>}/>})}

  <Sec ch="Supply Gap: Lost vs Recoverable (Updated)" ac={C.r}/>
  <P ch={<ResponsiveContainer width="100%" height={200}>
    <BarChart data={responseChart} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke={C.pb}/><XAxis type="number" tick={{fill:C.td,fontSize:9,fontFamily:F}} unit="M bpd"/><YAxis dataKey="name" type="category" width={150} tick={{fill:C.td,fontSize:8,fontFamily:F}}/><Tooltip content={<Tip/>}/>
    <Bar dataKey="val" name="M bpd" radius={[0,3,3,0]}>{responseChart.map((e,i)=> <Cell key={i} fill={e.fill}/>)}</Bar></BarChart>
  </ResponsiveContainer>}/>
  <div style={{fontSize:10,color:C.tm,marginTop:6,lineHeight:1.5}}>Saudi's East-West pipeline restoration to 7M bpd is the single biggest positive development — it creates a viable bypass. Combined with IEA SPR releases (~2-4M bpd) and Omani port alternatives, the <strong style={{color:C.w}}>unrecoverable gap has narrowed to ~2M bpd</strong> from ~4M+ at Day 24. However, if the US blockade triggers Iranian retaliation on Saudi infrastructure again, these gains evaporate.</div>
</>}

{/* ═══ TIMELINE ═══ */}
{tab==="Timeline"&&<>
  <Sec ch="War Timeline — Key Energy & Market Events (45 Days)" ac={C.pp}/>
  <div style={{position:"relative",paddingLeft:24}}>
    <div style={{position:"absolute",left:10,top:0,bottom:0,width:2,background:C.pb}}/>
    {timeline.map((e,i)=> <div key={i} style={{marginBottom:10,position:"relative"}}>
      <div style={{position:"absolute",left:-18,top:4,width:10,height:10,borderRadius:"50%",background:catColors[e.cat]||C.td,border:`2px solid ${C.bg}`}}/>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{fontSize:10,fontWeight:700,color:C.t,minWidth:55,whiteSpace:"nowrap"}}>{e.d}</span>
        <div>
          <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:2}}>
            <Bg ch={e.cat} bg={`${catColors[e.cat]}22`} co={catColors[e.cat]} bo={`${catColors[e.cat]}44`}/>
            {e.sev>=5&&<Bg ch="CRITICAL" bg={`${C.r}22`} co={C.r} bo={`${C.r}44`}/>}
          </div>
          <div style={{fontSize:11,color:C.td,lineHeight:1.5}}>{e.ev}</div>
        </div>
      </div>
    </div>)}
  </div>
</>}

{/* ═══ INFRASTRUCTURE ═══ */}
{tab==="Infrastructure"&&<>
  <Sec ch="Major Infrastructure — Updated Damage + Recovery" ac={C.o}/>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
    {[
      {f:"🇸🇦 East-West Pipeline",v:"7M bpd capacity",d:"Pumping station hit → 700K bpd lost. RESTORED to full 7M bpd as of Apr 12. Saudi's lifeline bypassing Hormuz.",s:2,c:C.g,r:"✅ RESTORED. Now the primary export route. 5M+ bpd destined for export via Yanbu (Red Sea)."},
      {f:"🇸🇦 Manifa + Khurais Fields",v:"600K bpd total",d:"Both hit. Manifa (300K bpd) restored. Khurais (300K bpd) still partially offline.",s:3,c:C.w,r:"Manifa ✅. Khurais timeline TBD. JPMorgan: 'measurable supply shock' = ~10% of Saudi pre-conflict exports."},
      {f:"🇶🇦 Ras Laffan LNG Complex",v:"$30-40B asset",d:"2 LNG trains destroyed (17% capacity). $20B annual revenue impact. GTL plant damaged.",s:5,c:C.r,r:"Won't reach full capacity before August. Japanese contractor Chiyoda considering NFE expansion work. Years for full structural recovery."},
      {f:"🇮🇷 South Pars Gas Field",v:"$50B+ asset",d:"12% of Iran gas production offline. Asaluyeh hub taken offline.",s:4,c:C.o,r:"Weeks-months. World's largest gas field is now a proven military target."},
      {f:"🇸🇦 Satorp Jubail Refinery",v:"465K bpd",d:"Hit in April attacks. Saudi Aramco / TotalEnergies JV. One of world's largest export refineries.",s:4,c:C.o,r:"Assessment ongoing under ceasefire. Critical for refined product exports."},
      {f:"🇧🇭 BAPCO Sitra Refinery",v:"$7.3B asset",d:"Ballistic missile hit + drone. Force majeure. Bahrain's ONLY refinery.",s:5,c:C.r,r:"6-12 months if conversion units damaged."},
      {f:"🇦🇪 ADNOC Ruwais Complex",v:"$12-18B asset",d:"922K bpd refining shut. Partially restarting under ceasefire.",s:3,c:C.w,r:"Could restart if ceasefire holds. Persistent drone threat."},
      {f:"🇦🇪 Taweelah / EGA",v:"Aluminium smelter",d:"EGA (Emirates Global Aluminium) declared force majeure after Taweelah facility hit.",s:3,c:C.o,r:"Non-oil infrastructure damage expanding. Power + desal nexus."},
      {f:"🇮🇷 Lavan Refinery + Sirri",v:"Export facilities",d:"Struck AFTER ceasefire announced (Apr 7-8). Crude export capacity reduced.",s:4,c:C.r,r:"Raises question of ceasefire sincerity. Strike attribution disputed."},
      {f:"🚢 Strait Mines",v:"'Few dozen'",d:"Iran confirmed mines exist (Apr 10). Published 2 safe routes near Larak. US MCM ops beginning.",s:5,c:C.pk,r:"2+ months post-ceasefire for full clearance. US has no dedicated minesweepers — using LCS instead."},
    ].map((item,i)=> <P key={i} st={{padding:12,borderLeft:`3px solid ${item.c}`}} ch={<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:12,fontWeight:700}}>{item.f}</span>
        <span style={{fontSize:10,color:C.td}}>{item.v}</span>
      </div>
      <div style={{fontSize:10,color:C.td,lineHeight:1.5,marginBottom:4}}>{item.d}</div>
      <div style={{fontSize:9,color:C.tm,lineHeight:1.4,padding:"4px 8px",background:"#0a0e17",borderRadius:4}}><strong style={{color:item.c===C.g?C.g:C.t}}>Recovery:</strong> {item.r}</div>
    </>}/>)}
  </div>
</>}

{/* ═══ MARITIME ═══ */}
{tab==="Maritime"&&<>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
    <SC l="Vessels Stranded" v="3,200" s="Incl. 800 tankers in Gulf" co={C.pk} ic="⚓"/>
    <SC l="Mariners Trapped" v="20,000" s="Stranded since closure (IMO)" co={C.r} ic="👷"/>
    <SC l="Vessel Attacks" v="25+" s="UKMTO + CSIS confirmed" co={C.r} ic="⚠"/>
    <SC l="Iran Toll" v="$1/bbl" s="In crypto. Or $2M per vessel. Via Larak channel" co={C.w} ic="💰"/>
  </div>
  <Sec ch="Strait Status — Ceasefire + Blockade" ac={C.cy}/>
  <P st={{fontSize:11,color:C.td,lineHeight:1.8}} ch={<>
    <p style={{margin:"0 0 8px"}}>The Strait has been <strong style={{color:C.r}}>effectively closed for 45 days</strong>. The ceasefire (Apr 8) was supposed to reopen it — it hasn't meaningfully. Pre-war: 153 vessels/day. Current: ~3-15/day depending on the day. Total since Mar 1: ~150 vessels have transited (CSIS/Lloyd's List Intelligence), most via Iran's Larak Island channel.</p>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.pk}}>Mining confirmed (Apr 10):</strong> Iran officially confirmed mines in the Strait and published two safe passage routes. One route requires coordinating with IRGC near Larak Island. US has no dedicated minesweepers (last 4 decommissioned Sept 2025). USS Petersen + USS Murphy transited Apr 11 for mine-clearing assessment.</p>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.w}}>Iran's toll system:</strong> $1/bbl of oil on board, paid in cryptocurrency (FT). Or ~$2M per vessel. IRGC controls passage. Trump: "No one who pays an illegal toll will have safe passage on the high seas."</p>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.b}}>US blockade (today):</strong> CENTCOM begins blocking all traffic to/from Iranian ports at 10am ET Apr 13. Will NOT impede vessels transiting to non-Iranian ports. Will interdict any vessel that paid Iran's toll. Iran calls it "illegal, act of piracy."</p>
    <p style={{margin:"0 0 8px"}}><strong style={{color:C.r}}>Why ships still won't go:</strong> P&I war risk insurance still withdrawn. Owners won't transit without coverage. Even with ceasefire, Lloyd's: "ship operators will need to carefully assess the risk situation." CNN reports even if Strait fully opens, oil flows won't normalize until July — 400 loaded tankers want out, but only ~100 empty tankers want in.</p>
    <p style={{margin:0}}><strong style={{color:C.pp}}>Oman bypass emerging:</strong> Duqm, Salalah, Sohar ports seeing increased cargo rerouting. Adds ~2 weeks to voyages + significant cost. But it's the viable alternative.</p>
  </>}/>
  <Sec ch="Attacks on Vessels (Selected)" ac={C.r}/>
  <div style={{overflowX:"auto"}}><table><thead><tr style={{background:"#0a0e17"}}><th>Date</th><th>Vessel</th><th>Type</th><th>Damage</th><th>Casualties</th></tr></thead><tbody>
    {[
      ["Feb 28","3 tankers","Missile/Drone","1 ablaze off Oman","Unknown"],
      ["Mar 1","Skylight + MKD VYOM","Projectile/Drone boat","Both hit, fires","3 killed"],
      ["Mar 2","Stena Imperative","Drone x2","Bahrain port fire","1 killed, 2 injured"],
      ["Mar 4","Safeen Prestige","Missile","Evacuated","Unknown"],
      ["Mar 6","Tugboat","Missile x2","Sank","3 missing"],
      ["Mar 7","PRIMA + Louise P","Drone","Chemical tanker + US tanker","Unknown"],
      ["Mar 11","Mayuree Naree","Projectile x2","Engine room fire. Later grounded on Qeshm Island (Mar 27)","3 missing, 20 evac'd"],
      ["Mar 27","3 container ships","IRGC turned away","Prevented from transiting Strait","None"],
      ["Mar 30","Express Rome","Projectile x2","2 projectiles splashed nearby off Ras Tanura","None"],
      ["Mar 31","Al Salmi (VLCC)","Iranian drone","Hit at Port of Dubai. Fire. Full capacity. Oil spill warning","Unknown"],
      ["Apr 11","US destroyers","Disputed","US: transited Strait. Iran: 'strongly denied'","None"],
    ].map((r,i)=> <tr key={i} style={{background:i%2===0?"transparent":"#0a0e17"}}>{r.map((c,j)=> <td key={j} style={{fontWeight:j===0?600:400,color:j===4&&(c.includes("killed")||c.includes("missing"))?C.r:j===0?C.t:C.td}}>{c}</td>)}</tr>)}
  </tbody></table></div>
</>}

{/* ═══ ECONOMIC IMPACT ═══ */}
{tab==="Economic Impact"&&<>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
    <SC l="Est. Asset Damage" v={`$${econData.estPhysicalDamage}B`} s="Physical (Gulf-wide + Iran infra)" co={C.r} ic="💥"/>
    <SC l="Arab Countries Cost" v={`$${econData.arabCountriesCost}B+`} s="Total (as of Mar 31)" co={C.o} ic="📉"/>
    <SC l="Iran Self-Assessment" v="$300B-$1T" s="Total economic damage (Apr 11)" co={C.r} ic="💰"/>
    <SC l="US Military Cost" v="$18B+" s="First 40 days. Pentagon wants $200B more" co={C.pp} ic="🎖"/>
  </div>

  <Sec ch="Cost Breakdown: Who's Paying ($B)" ac={C.pp}/>
  <P ch={<ResponsiveContainer width="100%" height={200}>
    <BarChart data={[
      {name:"Iran total\ndamage est.",val:650,fill:C.r},
      {name:"Arab countries\n(Mar 31)",val:120,fill:C.o},
      {name:"Revenue lost\n(45 days est.)",val:27,fill:C.w},
      {name:"US military\ncost",val:18,fill:C.b},
      {name:"Physical infra\ndamage",val:20,fill:C.pk},
    ]} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke={C.pb}/><XAxis type="number" tick={{fill:C.td,fontSize:9,fontFamily:F}} unit="$B"/><YAxis dataKey="name" type="category" width={100} tick={{fill:C.td,fontSize:8,fontFamily:F}}/><Tooltip content={<Tip/>}/>
    <Bar dataKey="val" name="$B" radius={[0,3,3,0]}>{[{fill:C.r},{fill:C.o},{fill:C.w},{fill:C.b},{fill:C.pk}].map((e,i)=> <Cell key={i} fill={e.fill}/>)}</Bar></BarChart>
  </ResponsiveContainer>}/>
  <div style={{fontSize:10,color:C.tm,marginTop:6,lineHeight:1.6}}>Iran's self-assessed damage ($300B-$1T) dwarfs all other figures — it includes destroyed petrochemical plants, steel factories, pharmaceutical facilities, universities, hospitals, banks, airports, bridges, railroads, and power grid damage, not just energy infrastructure. The $650B midpoint is used above.</div>

  <Sec ch="Key Economic Indicators" ac={C.o}/>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
    {[
      {t:"Brent Pre-War → Now",v:"$72.87 → $102",s:"+40% (down from $119 peak on ceasefire)",c:C.o},
      {t:"Brent Q1 Close",v:"$118/bbl",s:"Largest Q1 increase (inflation-adj) since 1988 (EIA)",c:C.r},
      {t:"US Gasoline",v:"$4.16/gal",s:"AAA (Apr 9). First >$4 since Aug 2022. Was $2.98",c:C.w},
      {t:"US Diesel",v:"$5.40/gal",s:"Highest in 2+ years. Trucking/freight cost shock",c:C.r},
      {t:"Brent-WTI Spread",v:"Peaked $25/bbl",s:"Highest in 5+ years (Mar 31). US cushioned by domestic supply",c:C.o},
      {t:"European Gas",v:"+60%+ since war",s:"Qatari LNG offline. Won't recover until Aug at earliest",c:C.r},
      {t:"CPI Energy",v:"+10.9% m/m",s:"Gasoline +21.2% in month (Mar). Inflation accelerating",c:C.pk},
      {t:"IEA SPR Released",v:"400M bbl",s:"US 172M of 415M (41% of SPR). Covers ~40 days of lost flow",c:C.b},
      {t:"July Normalization",v:"Earliest",s:"CNN/S&P Global: even with full reopening, months to normalize",c:C.w},
    ].map((item,i)=> <P key={i} st={{padding:10,borderTop:`2px solid ${item.c}`}} ch={<>
      <div style={{fontSize:9,color:C.td,textTransform:"uppercase",letterSpacing:"0.06em"}}>{item.t}</div>
      <div style={{fontSize:15,fontWeight:800,color:item.c,marginTop:2}}>{item.v}</div>
      <div style={{fontSize:9,color:C.tm,marginTop:1}}>{item.s}</div>
    </>}/>)}
  </div>

  <Sec ch="Ceasefire Paradox: Why Prices Haven't Collapsed" ac={C.b}/>
  <P st={{fontSize:10,color:C.td,lineHeight:1.7}} ch={<>
    <p style={{margin:"0 0 6px"}}>Brent dropped ~20% on the ceasefire announcement (Apr 7-8), but has since rebounded to $102 — still +40% vs pre-war. Here's why:</p>
    <p style={{margin:"0 0 4px"}}><strong style={{color:C.t}}>Strait still closed:</strong> Ceasefire ≠ reopening. Insurance withdrawn, mines confirmed, IRGC still controlling access. Traffic at &lt;10% of normal.</p>
    <p style={{margin:"0 0 4px"}}><strong style={{color:C.t}}>Physical damage real:</strong> Ras Laffan won't recover before August. Saudi lost 600K bpd capacity. Multiple refineries offline. You can't restart infrastructure that's been bombed with a press release.</p>
    <p style={{margin:"0 0 4px"}}><strong style={{color:C.t}}>Blockade escalation:</strong> Trump's naval blockade of Iranian ports (starting today) adds a new layer of disruption. Iran has said it will retaliate — potentially re-escalating attacks on Gulf infrastructure.</p>
    <p style={{margin:0}}><strong style={{color:C.t}}>Structural bottleneck:</strong> 400 loaded tankers want out, only 100 empty ones want in. Even with full reopening, S&P Global estimates normalization by July at earliest. The ceasefire bought time, not resolution.</p>
  </>}/>

  <Sec ch="Human Cost" ac={C.pk}/>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
    {[
      {t:"Iran Civilians Killed",v:"1,701+",s:"Including 254 children (HRANA)",c:C.r},
      {t:"Lebanon Deaths",v:"1,497+",s:"Including 57 health workers. 350 killed day after ceasefire",c:C.r},
      {t:"Mariners Stranded",v:"20,000",s:"In Persian Gulf. IMO working on evacuation",c:C.o},
    ].map((item,i)=> <P key={i} st={{padding:10,borderTop:`2px solid ${item.c}`}} ch={<>
      <div style={{fontSize:9,color:C.td,textTransform:"uppercase",letterSpacing:"0.06em"}}>{item.t}</div>
      <div style={{fontSize:15,fontWeight:800,color:item.c,marginTop:2}}>{item.v}</div>
      <div style={{fontSize:9,color:C.tm,marginTop:1}}>{item.s}</div>
    </>}/>)}
  </div>
</>}

      {/* FOOTER */}
      <div style={{marginTop:32,paddingTop:12,borderTop:`1px solid ${C.pb}`,fontSize:8,color:C.tm,lineHeight:1.4}}>
        <strong>SOURCES:</strong> IEA (March 2026 OMR + reserve release + Apr STEO), EIA (Q1 2026 review, Apr STEO), Reuters, Bloomberg, CNBC, CNN, Al Jazeera, NPR, NBC News, ABC News, Fox News, Time, Wall Street Journal, CSIS, USNI News, UKMTO, CENTCOM, Goldman Sachs, JPMorgan, Rystad, S&P Global, Kpler, Lloyd's List Intelligence, Windward AI, AAA, GasBuddy, IMO, UN News, Britannica, Wikipedia compiled sources. Saudi Press Agency. HRANA (Human Rights Activists News Agency).
        <br/><strong>DISCLAIMER:</strong> Day 45 — 13 Apr 2026 16:00 CET. Production estimates combine IEA figures, Reuters/Bloomberg reporting, and analyst assessments. Iran's self-assessed damage ($300B-$1T) is Iranian government figures and not independently verified. Ceasefire (Apr 8-22) is in effect but deeply strained. US naval blockade of Iranian ports begins today — situation is highly volatile. Saudi pipeline restoration confirmed by Ministry of Energy Apr 12. Oil flow normalization timeline (July) per CNN/S&P Global assumes full Strait reopening which has not occurred.
      </div>
      </div>
    </div>
  );
}
