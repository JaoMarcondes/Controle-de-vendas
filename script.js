const cfg = window.SUPABASE_CONFIG || {};
const isConfigured =
  cfg.url &&
  cfg.publishableKey &&
  !cfg.url.includes("COLE_") &&
  !cfg.publishableKey.includes("COLE_");

const db = isConfigured ? window.supabase.createClient(cfg.url, cfg.publishableKey) : null;
let currentUser = null;
let sales = [];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const shortMoney = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(v)||0);
const dateBR = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
const initials = n => (n||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

function syncState(type, text){
  const dot = $('#syncDot'), label = $('#syncText');
  if(!dot || !label) return;
  dot.className = type || '';
  label.textContent = text;
}

function authMessage(text, ok=false){
  const el = $('#authMessage');
  el.textContent = text || '';
  el.style.color = ok ? '#9dc8a8' : '#d9b7a7';
}

async function signIn(email,password){
  authMessage('Entrando...');
  const { error } = await db.auth.signInWithPassword({ email, password });
  if(error) throw error;
}

async function signUp(email,password){
  authMessage('Criando conta...');
  const { data, error } = await db.auth.signUp({ email, password });
  if(error) throw error;
  if(!data.session){
    authMessage('Conta criada. Confirme seu e-mail e depois entre.', true);
    return;
  }
}

async function signOut(){
  if(!db) return;
  await db.auth.signOut({ scope:'local' });
}

async function loadSales(){
  if(!currentUser) return;
  syncState('', 'Sincronizando...');
  const { data, error } = await db
    .from('sales')
    .select('id,client,project,sale_date,status,value,created_at')
    .order('sale_date',{ascending:false})
    .order('created_at',{ascending:false});

  if(error){
    console.error(error);
    syncState('error','Erro de sincronização');
    toast('Não foi possível carregar as vendas.');
    return;
  }

  sales = (data || []).map(row => ({
    id: row.id,
    client: row.client,
    project: row.project,
    date: row.sale_date,
    status: row.status,
    value: Number(row.value),
    created_at: row.created_at
  }));
  syncState('online','Dados sincronizados');
  render();
}

function filteredPeriod(list){
  const p = $('#period').value;
  if(p === 'all') return list;
  const now = new Date();
  return list.filter(s=>{
    const d = new Date(s.date+'T12:00:00');
    if(p==='month') return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    return (now-d)/86400000 <= Number(p);
  });
}

function rows(list,target){
  $(target).innerHTML = list.length ? list.map(s=>`<tr>
<td><div class="clientCell"><span class="avatar">${initials(s.client)}</span><b>${escapeHtml(s.client)}</b></div></td>
<td>${escapeHtml(s.project)}</td><td>${dateBR(s.date)}</td>
<td><span class="status ${s.status==='Fechada'?'closed':'pending'}">${escapeHtml(s.status)}</span></td>
<td>${money(s.value)}</td>
<td><button class="rowBtn" data-edit="${s.id}">Editar</button> <button class="rowBtn" data-delete="${s.id}">Excluir</button></td>
</tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:45px;color:#758279">Nenhuma venda encontrada.</td></tr>`;
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function localISO(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function fromISO(iso){
  const [y,m,d]=iso.split('-').map(Number);
  return new Date(y,m-1,d,12,0,0,0);
}

function addDays(date,amount){
  const d=new Date(date);
  d.setDate(d.getDate()+amount);
  return d;
}

function niceAxisMax(value){
  if(value<=0) return 100;
  const target=value*1.16;
  const magnitude=Math.pow(10,Math.floor(Math.log10(target)));
  const normalized=target/magnitude;
  let nice;
  if(normalized<=1) nice=1;
  else if(normalized<=2) nice=2;
  else if(normalized<=5) nice=5;
  else nice=10;
  return nice*magnitude;
}

function getDailyChartSeries(list){
  const today=new Date();
  today.setHours(12,0,0,0);
  const selected=$('#period').value;

  let startDate;
  if(selected==='7'){
    startDate=addDays(today,-6);
  }else if(selected==='30'){
    startDate=addDays(today,-29);
  }else if(selected==='month'){
    startDate=new Date(today.getFullYear(),today.getMonth(),1,12,0,0,0);
  }else{
    const closedDates=list
      .filter(s=>s.status==='Fechada' && s.date)
      .map(s=>fromISO(s.date))
      .sort((a,b)=>a-b);

    const minimumStart=addDays(today,-6);
    if(closedDates.length){
      startDate=closedDates[0] < minimumStart ? closedDates[0] : minimumStart;
    }else{
      startDate=minimumStart;
    }
  }

  const bucket=new Map();
  list
    .filter(s=>s.status==='Fechada')
    .forEach(s=>{
      const current=bucket.get(s.date) || {value:0,count:0};
      current.value+=Number(s.value)||0;
      current.count+=1;
      bucket.set(s.date,current);
    });

  const series=[];
  for(let d=new Date(startDate); d<=today; d=addDays(d,1)){
    const iso=localISO(d);
    const day=bucket.get(iso) || {value:0,count:0};
    series.push({
      iso,
      date:new Date(d),
      value:day.value,
      count:day.count
    });
  }

  // Garante um começo visual em zero, como um gráfico de tendência.
  if(series.length && series[0].value>0){
    const previous=addDays(series[0].date,-1);
    series.unshift({
      iso:localISO(previous),
      date:previous,
      value:0,
      count:0
    });
  }

  return series;
}

function renderChart(list){
  const series=getDailyChartSeries(list);
  const svg=$('#chart');
  const labels=$('#chartLabels');
  const yAxis=$('#chartYAxis');
  const tooltip=$('#chartTooltip');

  if(!svg || !labels || !yAxis) return;

  const todayISO=localISO(new Date());
  const todayPoint=series.find(p=>p.iso===todayISO) || {value:0,count:0};

  $('#todaySales').textContent=(Number(todayPoint.value)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  $('#todayCount').textContent=`${todayPoint.count} ${todayPoint.count===1?'venda':'vendas'} hoje`;

  const total=series.reduce((sum,p)=>sum+p.value,0);
  const active=series.filter(p=>p.value>0);
  const best=active.length
    ? active.reduce((a,b)=>b.value>a.value?b:a)
    : null;

  $('#chartTotal').textContent=shortMoney(total);
  $('#activeDays').textContent=String(active.length).padStart(2,'0');
  $('#bestDay').textContent=best
    ? `${dateBR(best.iso).slice(0,5)} · ${shortMoney(best.value)}`
    : '—';

  const w=1000;
  const h=300;
  const top=20;
  const bottom=274;
  const usableH=bottom-top;
  const maxValue=Math.max(0,...series.map(p=>p.value));
  const axisMax=Math.max(maxValue,1000);

  const points=series.map((p,i)=>{
    const x=series.length===1 ? w/2 : i*(w/(series.length-1));
    const y=bottom-(p.value/axisMax)*usableH;
    return {...p,x,y};
  });

  // Eixo visual de R$ 100 em R$ 100.
  // A escala mínima é R$ 1.000, mas os valores das vendas não são alterados.
  let grid='';
  let yLabels='';
  const step=100;

  for(let value=0; value<=axisMax; value+=step){
    const ratio=value/axisMax;
    const y=bottom-(ratio*usableH);
    const baseline=value===0;

    grid+=`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${baseline?'rgba(126,185,142,.28)':'rgba(255,255,255,.065)'}" stroke-width="${baseline?1.4:1}" vector-effect="non-scaling-stroke"/>`;
    yLabels+=`<span style="bottom:${ratio*100}%">${shortMoney(value)}</span>`;
  }

  yAxis.innerHTML=yLabels;

  const linePath=points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ');
  const areaPath=points.length
    ? `M ${points[0].x} ${bottom} `+points.map(p=>`L ${p.x} ${p.y}`).join(' ')+` L ${points.at(-1).x} ${bottom} Z`
    : '';

  const zeroSegments=points.map(p=>{
    if(p.value!==0) return '';
    return `<circle cx="${p.x}" cy="${p.y}" r="2.4" fill="#6b8272" opacity=".68"/>`;
  }).join('');

  svg.innerHTML=`
    <defs>
      <linearGradient id="dailyFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#5fa878" stop-opacity=".30"/>
        <stop offset=".7" stop-color="#5fa878" stop-opacity=".06"/>
        <stop offset="1" stop-color="#5fa878" stop-opacity="0"/>
      </linearGradient>
      <filter id="pointGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    ${grid}
    ${areaPath ? `<path d="${areaPath}" fill="url(#dailyFill)"/>` : ''}
    ${linePath ? `<path d="${linePath}" fill="none" stroke="#72b786" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}
    ${zeroSegments}
    ${points.map((p,i)=>p.value>0 ? `
      <g class="chart-hit" data-index="${i}">
        <circle cx="${p.x}" cy="${p.y}" r="12" fill="transparent"/>
        <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#0d1d13" stroke="#8bc79a" stroke-width="2.5" vector-effect="non-scaling-stroke" filter="url(#pointGlow)"/>
      </g>` : `
      <g class="chart-hit" data-index="${i}">
        <circle cx="${p.x}" cy="${p.y}" r="10" fill="transparent"/>
      </g>`).join('')}
  `;

  // Datas: mostra no máximo 7 marcações para não poluir.
  labels.innerHTML='';
  const maxLabels=7;
  const stride=Math.max(1,Math.ceil(points.length/(maxLabels-1)));
  points.forEach((p,i)=>{
    const show=i===0 || i===points.length-1 || i%stride===0;
    if(!show) return;
    const el=document.createElement('span');
    el.textContent=dateBR(p.iso).slice(0,5);
    el.style.left=`${(p.x/w)*100}%`;
    labels.appendChild(el);
  });

  const showTooltip=(index,event)=>{
    const p=points[index];
    if(!p || !tooltip) return;
    tooltip.hidden=false;
    tooltip.innerHTML=`${dateBR(p.iso)}<b>${money(p.value)}</b><small>${p.count} ${p.count===1?'venda':'vendas'} no dia</small>`;

    const box=$('.chartBox').getBoundingClientRect();
    const source=event.currentTarget.querySelector('circle') || event.currentTarget;
    const rect=source.getBoundingClientRect();
    const left=Math.max(70,Math.min(box.width-70,rect.left-box.left+rect.width/2));
    const top=Math.max(55,rect.top-box.top);
    tooltip.style.left=left+'px';
    tooltip.style.top=top+'px';
  };

  svg.querySelectorAll('.chart-hit').forEach(hit=>{
    const index=Number(hit.dataset.index);
    hit.style.cursor='pointer';
    hit.addEventListener('pointerenter',e=>showTooltip(index,e));
    hit.addEventListener('pointermove',e=>showTooltip(index,e));
    hit.addEventListener('pointerleave',()=>{ if(tooltip) tooltip.hidden=true; });
    hit.addEventListener('click',e=>{
      e.stopPropagation();
      showTooltip(index,e);
    });
  });
}
function renderClients(list){
  const map={};
  list.forEach(s=>{
    map[s.client] ??= {name:s.client,count:0,total:0,last:s.date};
    map[s.client].count++;
    map[s.client].total+=s.value;
    if(s.date>map[s.client].last) map[s.client].last=s.date;
  });
  const q=$('#clientSearch').value.toLowerCase();
  const arr=Object.values(map).filter(c=>c.name.toLowerCase().includes(q));
  $('#clientGrid').innerHTML=arr.length?arr.map(c=>`<article class="clientCard">
    <div class="clientCell"><span class="avatar">${initials(c.name)}</span><div><h3>${escapeHtml(c.name)}</h3><p>Último projeto em ${dateBR(c.last)}</p></div></div>
    <div class="clientStats"><div><small>Projetos</small><strong>${c.count}</strong></div><div><small>Valor total</small><strong>${money(c.total)}</strong></div></div>
  </article>`).join(''):'<p>Nenhum cliente encontrado.</p>';
}

function render(){
  const periodList=filteredPeriod(sales);
  const q=$('#overviewSearch').value.toLowerCase();
  const overview=periodList.filter(s=>(s.client+' '+s.project).toLowerCase().includes(q));
  const closed=periodList.filter(s=>s.status==='Fechada');
  const revenue=closed.reduce((a,s)=>a+s.value,0);
  const clients=new Set(periodList.map(s=>s.client));

  $('#revenue').textContent=money(revenue);
  $('#sites').textContent=String(closed.length).padStart(2,'0');
  $('#ticket').textContent=money(closed.length?revenue/closed.length:0);
  $('#clients').textContent=String(clients.size).padStart(2,'0');
  $('#sideSales').textContent=sales.length;
  $('#sideClients').textContent=new Set(sales.map(s=>s.client)).size;
  $('#chartTotal').textContent=shortMoney(revenue);
  $('#largest').textContent=shortMoney(Math.max(0,...closed.map(s=>s.value)));
  $('#latest').textContent=sales.length?dateBR([...sales].sort((a,b)=>b.date.localeCompare(a.date))[0].date):'—';
  $('#pending').textContent=String(periodList.filter(s=>s.status==='Pendente').length).padStart(2,'0');
  $('#recordCount').textContent=overview.length;
  $('#historySub').textContent=sales.length?'Suas vendas mais recentes':'Cadastre sua primeira venda';
  $('#demoLabel').style.display='none';

  rows([...overview].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8),'#overviewBody');

  const sq=$('#salesSearch').value.toLowerCase(), status=$('#statusFilter').value;
  const salesPage=[...sales]
    .sort((a,b)=>b.date.localeCompare(a.date))
    .filter(s=>(s.client+' '+s.project).toLowerCase().includes(sq)&&(status==='all'||s.status===status));
  rows(salesPage,'#salesBody');
  $('#salesCount').textContent=salesPage.length;

  renderChart(periodList);
  renderClients(sales);
}

function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===name));
  const id=name==='clients'?'clientsView':name;
  $('#'+id).classList.add('active');
  $('#sidebar').classList.remove('open');
}

function openModal(s){
  $('#saleForm').reset();
  $('#saleId').value=s?.id||'';
  $('#modalTitle').textContent=s?'Editar venda':'Registrar projeto';
  $('#saleDate').value=s?.date||new Date().toISOString().slice(0,10);
  $('#saleStatus').value=s?.status||'Fechada';
  if(s){
    $('#clientName').value=s.client;
    $('#projectName').value=s.project;
    $('#saleValue').value=s.value;
  }
  $('#saleModal').showModal();
}

async function saveSaleFromForm(){
  if(!currentUser) return;
  const id=$('#saleId').value;
  const payload={
    user_id: currentUser.id,
    client: $('#clientName').value.trim(),
    project: $('#projectName').value.trim(),
    sale_date: $('#saleDate').value,
    status: $('#saleStatus').value,
    value: Number($('#saleValue').value)
  };

  syncState('', 'Salvando...');
  let result;
  if(id){
    result=await db.from('sales').update(payload).eq('id',id).eq('user_id',currentUser.id);
  }else{
    result=await db.from('sales').insert(payload);
  }
  if(result.error){
    console.error(result.error);
    syncState('error','Erro ao salvar');
    throw result.error;
  }
  await loadSales();
}

async function deleteSale(id){
  syncState('', 'Excluindo...');
  const { error }=await db.from('sales').delete().eq('id',id).eq('user_id',currentUser.id);
  if(error) throw error;
  await loadSales();
}

async function clearAllSales(){
  const ids=sales.map(s=>s.id);
  if(!ids.length) return;
  syncState('', 'Limpando...');
  const { error }=await db.from('sales').delete().in('id',ids);
  if(error) throw error;
  await loadSales();
}

function exportBackup(){
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),sales},null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='verde-dashboard-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importBackup(file){
  const data=JSON.parse(await file.text());
  if(!Array.isArray(data.sales)) throw new Error('Backup inválido');
  if(sales.length){
    const ids=sales.map(s=>s.id);
    const { error:delError }=await db.from('sales').delete().in('id',ids);
    if(delError) throw delError;
  }
  if(data.sales.length){
    const payload=data.sales.map(s=>({
      user_id:currentUser.id,
      client:String(s.client||'').trim(),
      project:String(s.project||'').trim(),
      sale_date:s.date,
      status:s.status==='Pendente'?'Pendente':'Fechada',
      value:Number(s.value)||0
    })).filter(s=>s.client&&s.project&&s.sale_date);
    if(payload.length){
      const { error }=await db.from('sales').insert(payload);
      if(error) throw error;
    }
  }
  await loadSales();
}

function toast(t){
  const el=$('#toast');
  el.textContent=t;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2200);
}

function showAuth(){
  $('#authScreen').hidden=false;
  $('#dashboardApp').hidden=true;
  currentUser=null;
}

async function showDashboard(user){
  currentUser=user;
  $('#authScreen').hidden=true;
  $('#dashboardApp').hidden=false;
  $('#accountEmail').textContent=user.email||'Conta conectada';
  await loadSales();
}

async function init(){
  if(!isConfigured){
    $('#authSetupWarning').hidden=false;
    $('#authForm').querySelectorAll('input,button').forEach(el=>el.disabled=true);
    authMessage('Abra config.js e adicione a URL e a chave pública do Supabase.');
    return;
  }

  const { data:{ session } } = await db.auth.getSession();
  if(session?.user) await showDashboard(session.user);
  else showAuth();

  db.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT') showAuth();
    if(event==='SIGNED_IN' && session?.user && currentUser?.id!==session.user.id){
      showDashboard(session.user);
    }
  });
}

$('#authForm').addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    await signIn($('#authEmail').value.trim(),$('#authPassword').value);
    authMessage('');
  }catch(err){
    authMessage(err.message || 'Não foi possível entrar.');
  }
});

$('#signupBtn').addEventListener('click',async()=>{
  try{
    await signUp($('#authEmail').value.trim(),$('#authPassword').value);
  }catch(err){
    authMessage(err.message || 'Não foi possível criar a conta.');
  }
});

$('#logoutBtn').onclick=signOut;
$$('[data-view]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showView(el.dataset.view)}));
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
$$('[data-new-sale]').forEach(b=>b.onclick=()=>openModal());
$('#closeModal').onclick=$('#cancelModal').onclick=()=>$('#saleModal').close();

$('#saleForm').onsubmit=async e=>{
  e.preventDefault();
  const editing=Boolean($('#saleId').value);
  const submit=e.submitter;
  if(submit) submit.disabled=true;
  try{
    await saveSaleFromForm();
    $('#saleModal').close();
    toast(editing?'Venda atualizada.':'Venda registrada.');
  }catch(err){
    alert('Erro ao salvar: '+(err.message||'verifique o Supabase'));
  }finally{
    if(submit) submit.disabled=false;
  }
};

document.addEventListener('click',async e=>{
  const edit=e.target.dataset.edit, del=e.target.dataset.delete;
  if(edit) openModal(sales.find(s=>s.id===edit));
  if(del && confirm('Excluir esta venda?')){
    try{
      await deleteSale(del);
      toast('Venda excluída.');
    }catch(err){
      alert('Erro ao excluir: '+(err.message||'verifique o Supabase'));
    }
  }
});

$('#overviewSearch').oninput=render;
$('#period').onchange=render;
$('#salesSearch').oninput=render;
$('#statusFilter').onchange=render;
$('#clientSearch').oninput=render;

const clearSalesBtn = $('#clearSales');
if(clearSalesBtn){
  clearSalesBtn.onclick=async()=>{
    if(!confirm('Isso vai apagar TODAS as suas vendas do Supabase. Continuar?')) return;
    try{
      await clearAllSales();
      toast('Vendas apagadas.');
    }catch(err){
      alert('Erro ao apagar: '+(err.message||'verifique o Supabase'));
    }
  };
}

const exportBtn = $('#exportBtn');
if(exportBtn) exportBtn.onclick=exportBackup;

const importInput = $('#importInput');
if(importInput) importInput.onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file) return;
  if(!confirm('A importação substituirá as vendas atuais. Continuar?')) return;
  try{
    await importBackup(file);
    toast('Backup importado.');
  }catch(err){
    alert('Arquivo inválido ou erro no banco: '+(err.message||''));
  }finally{
    e.target.value='';
  }
};

render();
init();

// Atualiza o eixo de datas automaticamente. Ao virar o dia, um novo ponto em R$ 0 aparece.
setInterval(()=>render(),60000);
