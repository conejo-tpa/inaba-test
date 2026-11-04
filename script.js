const $=id=>document.getElementById(id);
let spPref="no";
const f=(n,d=1)=>n.toLocaleString("es-AR",{maximumFractionDigits:d});

// Trozos de placa a lo largo de un eje de largo L, centrado.
// mode "tile": una placa queda centrada. mode "joint": una junta queda centrada.
function axis(L,t,g,mode){
  const p=t+g, s=typeof mode==="number"?mode:mode==="tile"?L/2-t/2:L/2+g/2, n=Math.ceil(L/p)+2, out=[];
  for(let i=-n;i<=n;i++){
    const a=s+i*p, b=a+t, ca=Math.max(a,0), cb=Math.min(b,L);
    if(cb-ca>1e-6) out.push({a:ca,w:cb-ca,full:cb-ca>=t-1e-6});
  }
  return out.sort((x,y)=>x.a-y.a);
}
const minCut=ps=>{const c=ps.filter(x=>!x.full).map(x=>x.w);return c.length?Math.min(...c):Infinity};

// Busca la posición que más se acerca a la elegida (centro o borde) y deja todos los cortes >= req.
// Si hace falta, corre el plano de a 1 mm, probando primero los corrimientos más chicos.
function fit(L,t,g,base,stag,req,cent){
  const p=t+g, half=p/2;
  const mk=d=>{const a=axis(L,t,g,base+d),b=stag?axis(L,t,g,base+d+half):a;return {d,a,b,sh:false,m:Math.min(minCut(a),minCut(b))}};
  const first=[mk(0)]; if(cent&&!stag) first.push(mk(half));
  const ok0=first.filter(c=>c.m>=req); if(ok0.length) return ok0.sort((x,y)=>y.m-x.m)[0];
  const all=[...first];
  for(let k=1;k<=Math.ceil(half*10);k++){
    const pair=[mk(k/10),mk(-k/10)]; pair.forEach(c=>c.sh=true);
    const good=pair.filter(c=>c.m>=req); if(good.length) return good.sort((x,y)=>y.m-x.m)[0];
    all.push(...pair);
  }
  const bestM=Math.max(...all.map(c=>c.m));
  return all.find(c=>c.m>=bestM-0.5);
}

function calc(){
  const W=+$("pw").value*100, H=+$("ph").value*100, tw=+$("tw").value, th=+$("th").value;
  const ceil=$("surf").value==="ceil", fixed=ceil&&$("ctype").value==="fix", rem=ceil&&!fixed;
  $("fct").hidden=!ceil; $("fct").style.display=ceil?"":"none"; $("est").hidden=!ceil; $("est").style.display=ceil?"":"none"; $("lmode").hidden=ceil; $("ljt").hidden=rem; $("legc").hidden=!rem;
  $("er1").hidden=fixed; $("lrun").hidden=fixed; $("er3").hidden=fixed; if(fixed) $("spmsg").hidden=true;
  $("lgE").textContent=fixed?"Molduras del perímetro":"Estructura del cielorraso";
  $("lgW").textContent=ceil?"Cielorraso (en metros)":"Pared (en metros)";
  $("lbH").textContent=ceil?"Largo (m)":"Alto (m)";
  $("ttl").textContent=ceil?"Plano de cielorraso":"Plano de placas para la pared";
  const g=rem?0:(+$("jt").value||0)/10, extra=+$("wa").value||0, stag=ceil?false:$("mode").value==="stag";
  const res=$("res");
  if(!(W>0&&H>0&&tw>0&&th>0)){res.innerHTML='<span class="err">Completá todas las medidas con números mayores a 0.</span>';$("svg").innerHTML="";return}

  const sx=$("sx").value, sy=$("sy").value, req=+$("mc").value||0;
  // Vertical y horizontal: se parte del centro o del borde elegido y se corre lo mínimo para evitar cortes chicos.
  const fy=fit(H,th,g,sy==="center"?H/2-th/2:sy==="bottom"?H-th:0,false,req,sy==="center");
  const fx=fit(W,tw,g,sx==="center"?W/2-tw/2:sx==="left"?0:W-tw,stag,req,sx==="center");
  const rowsP=fy.a, hA=fx.a, hB=fx.b;

  const pieces=[]; let used=0, nr=rowsP.length;
  rowsP.forEach((r,j)=>{
    const k=sy==="bottom"?nr-1-j:j;
    const cols=k%2===0?hA:hB;
    cols.forEach(c=>{
      const full=c.full&&r.full;
      pieces.push({x:c.a,y:r.a,w:c.w,h:r.w,full});
      used+=c.w*r.w;
    });
  });
  const whole=pieces.filter(p=>p.full).length, cuts=pieces.length-whole, total=pieces.length;
  const buy=Math.ceil(total*(1+extra/100));
  const tileA=tw*th, wasteA=(total*tileA-used)/10000, wastePct=(total*tileA-used)/(total*tileA)*100;

  // Lista de cortes agrupados por medida
  const grp={};
  pieces.filter(p=>!p.full).forEach(p=>{
    const k=f(p.w)+" × "+f(p.h); grp[k]=(grp[k]||0)+1;
  });
  const rows=Object.entries(grp).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${k} cm</td><td>${v}</td></tr>`).join("");

  const mc=Math.min(minCut(rowsP),minCut(hA),minCut(hB));
  let mats="";
  if(fixed){
    const ML=+$("mo").value||100, molds=Math.ceil(2*(W+H)/ML-1e-9);
    mats=`<h2>Moldura perimetral</h2><table><tr><th>Material</th><th>Cantidad</th></tr>
    <tr><td>Molduras de ${f(ML/100,2)} m (perímetro ${f(2*(W+H)/100,2)} m)</td><td>${molds}</td></tr></table>
    <p class="note">Cielorraso fijo: las placas van encastradas y a plomo, sin largueros ni cortitos.</p>`;
  }
  if(rem){
    const LL=+$("lg").value||364, CL=+$("ct").value||60, ML=+$("mo").value||100, runV=$("run").value==="v";
    const Nx=hA.length, Ny=rowsP.length;
    const lines=Math.max((runV?Nx:Ny)-1,0), lineLen=runV?H:W;
    // Empalme: si la línea entra en un solo larguero se puede elegir; si no, es obligatorio y se bloquea la opción.
    const need=lineLen>LL+1e-6, sel=$("sp");
    if(!sel.disabled) spPref=sel.value;
    sel.disabled=need; sel.value=need?"si":spPref;
    const splice=need||sel.value==="si";
    const alt=runV?W:H, spm=$("spmsg");
    const msg=need?`No se puede evitar el empalme: cada línea mide ${f(lineLen/100,2)} m y el larguero ${f(LL/100,2)} m.`+(alt<=LL+1e-6?` Si los largueros van hacia el otro lado, cada línea mide ${f(alt/100,2)} m y no hace falta empalmar.`:""):"";
    spm.hidden=!msg; spm.textContent=msg;
    const perLine=Math.ceil(lineLen/LL-1e-9), larg=lines*perLine, largMin=Math.ceil(lines*lineLen/LL-1e-9), last=lineLen-(perLine-1)*LL;
    const cort=runV?(Ny-1)*Nx:(Nx-1)*Ny;
    const cortCut=runV?(Ny-1)*hA.filter(x=>!x.full).length:(Nx-1)*rowsP.filter(x=>!x.full).length;
    const molds=Math.ceil(2*(W+H)/ML-1e-9);
    mats=`<h2>Materiales de la estructura</h2><table><tr><th>Material</th><th>Cantidad</th></tr>
    <tr><td>Largueros de ${f(LL/100,2)} m${splice&&perLine>1?" (empalmados)":" (sin empalme)"}</td><td>${larg}</td></tr>
    <tr><td>Cortitos de ${f(CL/100,2)} m${cortCut?` (${cortCut} se cortan a medida)`:""}</td><td>${cort}</td></tr>
    <tr><td>Molduras de ${f(ML/100,2)} m (perímetro ${f(2*(W+H)/100,2)} m)</td><td>${molds}</td></tr></table>
    <p class="note">${splice&&perLine>1?`${lines} líneas de larguero de ${f(lineLen/100,2)} m, cada una con ${perLine} trozos empalmados. Si cortás los trozos parejos, son ${perLine} de ${f(lineLen/perLine,1)} cm.${last<LL*0.5?` El último trozo suelto mediría ${f(last,1)} cm y queda flojo, por eso conviene cortarlos parejos.`:""} Si empalmás aprovechando los recortes, el mínimo sería ${largMin} largueros.`:`${lines} líneas de larguero, cada una de un solo larguero cortado a ${f(lineLen/100,2)} m.`}</p>`;
  }
  const lr=ps=>{const a=ps[0],b=ps[ps.length-1];return [a.full?0:a.w,b.full?0:b.w]};
  const sd=v=>v>0?f(v)+" cm":"entera";
  const [hAl,hAr]=lr(hA), [hBl,hBr]=lr(hB), [vt,vb]=lr(rowsP);
  const shifts=[];
  if(fx.sh) shifts.push(`${f(Math.abs(fx.d))} cm hacia la ${fx.d>0?"derecha":"izquierda"}`);
  if(fy.sh) shifts.push(`${f(Math.abs(fy.d))} cm hacia ${fy.d>0?"abajo":"arriba"}`);
  const shiftNote=shifts.length?`<p class="note">Para evitar cortes menores a ${f(req)} cm se corrió el plano ${shifts.join(" y ")}. Queda un poco descentrado, pero sin trozos finitos.</p>`:"";
  const warn=mc<req-0.05?`<div class="warn">Con estas medidas no se logra un corte de ${f(req)} cm o más; el mejor posible es de ${f(mc)} cm. Probá cambiar la junta, la disposición o el corte mínimo deseado.</div>`:"";

  res.innerHTML=`<div class="big">${buy} placas para comprar</div>
  <div>${whole} enteras + ${cuts} cortadas = ${total} colocadas${extra>0?`, más ${f(extra,1)}% de margen`:""}</div>
  <dl>
  <dt>Desperdicio de corte</dt><dd>${f(wasteA,2)} m² (${f(wastePct)}%)</dd>
  <dt>Superficie ${ceil?"del cielorraso":"de la pared"}</dt><dd>${f(W*H/10000,2)} m²</dd>
  <dt>Cortes a los costados (izq. / der.)</dt><dd>${stag?`fila 1: ${sd(hAl)} / ${sd(hAr)}; fila 2: ${sd(hBl)} / ${sd(hBr)}`:`${sd(hAl)} / ${sd(hAr)}`}</dd>
  <dt>Cortes en altura (arriba / abajo)</dt><dd>${sd(vt)} / ${sd(vb)}</dd>
  </dl>${mats}${warn}${shiftNote}
  ${rows?`<h2>Cortes necesarios</h2><table><tr><th>Medida del trozo</th><th>Cantidad</th></tr>${rows}</table>`:""}
  <p class="note">Cada placa cortada se cuenta como una placa entera. Las sobras (el otro trozo de cada placa) podrían reutilizarse en otros cortes, así que el desperdicio real puede ser menor.</p>`;

  draw(W,H,pieces,rem?{cols:hA,rows:rowsP,runV:$("run").value==="v"}:null);
}

function draw(W,H,pieces,T){
  if(pieces.length>1500){$("svg").innerHTML='<p class="note">El plano se omite porque hay demasiadas placas.</p>';return}
  const m=26, vw=700, s=vw/W, vh=H*s;
  let r="";
  pieces.forEach(p=>{
    const px=p.w*s, py=p.h*s;
    r+=`<rect x="${p.x*s}" y="${p.y*s}" width="${px}" height="${py}" fill="var(${p.full?'--tile':'--cut'})" stroke="var(--grout)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if(!p.full){
      const cw=p.w<p.w+1e-9&&px, parts=[];
      const lab=(Math.abs(p.w-(+$("tw").value))>1e-6?f(p.w):"")+(Math.abs(p.w-(+$("tw").value))>1e-6&&Math.abs(p.h-(+$("th").value))>1e-6?"×":"")+(Math.abs(p.h-(+$("th").value))>1e-6?f(p.h):"");
      const fs=Math.min(11,px/(lab.length*0.62),py*0.6);
      if(fs>=5.5) r+=`<text x="${p.x*s+px/2}" y="${p.y*s+py/2}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="var(--txt)">${lab}</text>`;
    }
  });
  let tl="";
  if(T){
    const xs=T.cols.slice(0,-1).map(c=>(c.a+c.w)*s), ys=T.rows.slice(0,-1).map(q=>(q.a+q.w)*s);
    const ln=(x1,y1,x2,y2,c,w,o)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round"/>`;
    const V=x=>ln(x,0,x,vh,"var(--accent)",3.2,1), Hh=y=>ln(0,y,vw,y,"var(--accent)",3.2,1);
    const v=x=>ln(x,0,x,vh,"var(--ink)",1.4,.55), h=y=>ln(0,y,vw,y,"var(--ink)",1.4,.55);
    if(T.runV){ys.forEach(y=>tl+=h(y));xs.forEach(x=>tl+=V(x))}else{xs.forEach(x=>tl+=v(x));ys.forEach(y=>tl+=Hh(y))}
    tl+=`<rect x="0" y="0" width="${vw}" height="${vh}" fill="none" stroke="#d98a1c" stroke-width="5"/>`;
  }
  const dim=`font-size="12" fill="var(--mute)" text-anchor="middle"`;
  $("svg").innerHTML=`<svg viewBox="${-m} ${-m} ${vw+2*m} ${vh+2*m}" role="img" aria-label="Plano de placas de la pared">
  <rect x="0" y="0" width="${vw}" height="${vh}" fill="var(--grout)"/>${r}${tl}
  <rect x="0" y="0" width="${vw}" height="${vh}" fill="none" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  <text x="${vw/2}" y="-9" ${dim}>${f(W/100,2)} m</text>
  <text transform="translate(-9 ${vh/2}) rotate(-90)" ${dim}>${f(H/100,2)} m</text></svg>`;
}
["pw","ph","tw","th","mode","jt","wa","sx","sy","mc","surf","lg","ct","mo","run","sp","ctype"].forEach(i=>$(i).addEventListener("input",calc));
calc();
