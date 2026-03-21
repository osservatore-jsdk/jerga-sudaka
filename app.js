mapboxgl.accessToken='pk.eyJ1IjoiMHNzZXJ2YXRvcmUiLCJhIjoiY21scG0zOTlvMHVkcjNlb29rcmJvY2E5NCJ9.hNL8uFuAQgLTBrccNpVgSA';

const WORKER_URL='https://jerga-turso-proxy.osservatore.workers.dev';

async function turso(sql, args=[]){
  const r = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({sql, args})
  });
  if(!r.ok){const e=await r.text();console.error('Turso error:',e);return null;}
  const data=await r.json();
  const res=data.results?.[0];
  if(!res||res.type==='error'){console.error('Turso query error:',res);return null;}
  const cols=res.response?.result?.cols?.map(c=>c.name)||[];
  const rows=res.response?.result?.rows||[];
  return rows.map(row=>{
    const obj={};
    cols.forEach((c,i)=>{
      const cell=row[i];
      obj[c]=cell?.type==='null'?null:cell?.value??null;
    });
    return obj;
  });
}

async function tursoRun(sql, args=[]){
  let jwt=null;
  try{
    const session=window.Clerk?.session;
    if(session) jwt=await session.getToken();
  }catch(e){console.warn('No se pudo obtener token Clerk:',e);}
  const headers={'Content-Type':'application/json'};
  if(jwt) headers['Authorization']='Bearer '+jwt;
  const r = await fetch(WORKER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({sql, args})
  });
  if(!r.ok){const e=await r.text();console.error('Turso error:',e);return null;}
  const data=await r.json();
  const res=data.results?.[0];
  if(!res||res.type==='error'){console.error('Turso run error:',res);return null;}
  return res.response?.result?.last_insert_rowid??null;
}
function artistToRow(a){
  return {
    nombre:a.nombre||'',tipo:a.tipo||'',barrio:a.barrio||'',crew:a.crew||'',
    descripcion:a.descripcion||'',instagram:a.instagram||'',youtube:a.youtube||'',
    spotify:a.spotify||'',soundcloud:a.soundcloud||'',genius:a.genius||'',
    entrevista:a.entrevista||'',avatar_url:a.avatarSrc||'',
    collabs:JSON.stringify(a.collabs||[]),iniciales:a.iniciales||'',
    lat:a.lat||null,lng:a.lng||null,
    manager_nombre:a.manager?.nombre||'',manager_email:a.manager?.email||'',manager_instagram:a.manager?.instagram||'',
    generos:JSON.stringify(a.generos||[])
  };
}
function rowToArtist(r){
  const _isCABA=r.barrio&&typeof CENTS_CABA!=='undefined'&&!!CENTS_CABA[r.barrio];
  return {
    id:'a_'+r.id,_dbId:r.id,nombre:r.nombre,iniciales:r.iniciales,tipo:r.tipo,
    tipoLabel:TL[r.tipo]||r.tipo,barrio:r.barrio,ciudad:_isCABA?'CABA':'GBA',
    provincia:_isCABA?'CABA':'Buenos Aires',crew:r.crew||null,
    collabs:typeof r.collabs==='string'?JSON.parse(r.collabs||'[]'):r.collabs||[],
    descripcion:r.descripcion,instagram:r.instagram,youtube:r.youtube,
    spotify:r.spotify,soundcloud:r.soundcloud,genius:r.genius,
    entrevista:r.entrevista,avatarSrc:r.avatar_url||null,
    lat:r.lat,lng:r.lng,
    manager:(r.manager_nombre||r.manager_email||r.manager_instagram)?{nombre:r.manager_nombre,email:r.manager_email,instagram:r.manager_instagram}:null,
    generos:typeof r.generos==='string'?JSON.parse(r.generos||'[]'):r.generos||[]
  };
}
const TC={mc:'#31AEDC',prod:'#DCA331',prod_mc:'#3431DC'};
const TL={mc:'Rapero / MC',prod:'Productor',prod_mc:'Rapero y Productor'};
const GENEROS_LIST=['Boom Bap','Trap','Detroit','Memphis','Drumless','Grimey','Plug','Drill','Cloud Rap'];

function getSelectedGeneros(prefix){
  return Array.from(document.querySelectorAll('.gen-cb-'+prefix+':checked')).map(cb=>cb.value);
}

function renderGenerosSelector(prefix, selected=[]){
  return '<div id="gen-wrap-'+prefix+'" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">'+
    GENEROS_LIST.map(g=>{
      const id='gen-'+prefix+'-'+g.replace(/\s+/g,'-');
      const chk=selected.includes(g)?'checked':'';
      return '<label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer;border:1px solid var(--pb);padding:3px 7px;user-select:none">'+
        '<input type="checkbox" class="gen-cb-'+prefix+'" value="'+g+'" '+chk+' style="accent-color:var(--red);cursor:pointer">'+g+'</label>';
    }).join('')+
    '<label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer;border:1px solid var(--pb);padding:3px 7px;user-select:none;border-style:dashed" id="gen-add-'+prefix+'">'+
      '+ nuevo</label>'+
  '</div>';
}

function wireGenerosAdd(prefix){
  const addBtn=document.getElementById('gen-add-'+prefix);
  if(!addBtn)return;
  addBtn.onclick=()=>{
    const val=prompt('Nuevo género:');
    if(!val||!val.trim())return;
    const g=val.trim();
    if(!GENEROS_LIST.includes(g))GENEROS_LIST.push(g);
    const wrap=document.getElementById('gen-wrap-'+prefix);
    if(!wrap)return;
    const lbl=document.createElement('label');
    lbl.style.cssText='display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer;border:1px solid var(--pb);padding:3px 7px;user-select:none';
    lbl.innerHTML='<input type="checkbox" class="gen-cb-'+prefix+'" value="'+g+'" checked style="accent-color:var(--red);cursor:pointer">'+g;
    wrap.insertBefore(lbl,addBtn);
  };
}

const CREW_DESCS={'Souljaz':'Colectivo del underground porteño combinando rap y producción.','Cielorroto':'Proyecto del underground del conurbano bonaerense.'};

let GEO_CABA, GEO_LOC, GEO_PART, GEO_CUARTO;

const CENTS_CABA={"Agronomia":[-58.488292,-34.592766],"Almagro":[-58.421531,-34.607682],"Balvanera":[-58.40216,-34.607186],"Barracas":[-58.385892,-34.651158],"Belgrano":[-58.44284,-34.543953],"La Boca":[-58.349709,-34.627281],"Boedo":[-58.419165,-34.630769],"Caballito":[-58.443062,-34.615291],"Chacarita":[-58.455781,-34.588332],"Coghlan":[-58.474626,-34.560912],"Colegiales":[-58.450604,-34.575634],"Constitucion":[-58.383182,-34.626509],"Flores":[-58.453581,-34.642232],"Floresta":[-58.484417,-34.627077],"Liniers":[-58.518074,-34.640466],"Mataderos":[-58.499078,-34.658422],"Monserrat":[-58.380102,-34.611845],"Monte Castro":[-58.508269,-34.618637],"Nueva Pompeya":[-58.416355,-34.65307],"Nuñez":[-58.462238,-34.53405],"Palermo":[-58.410567,-34.565786],"Parque Avellaneda":[-58.474436,-34.650781],"Parque Chacabuco":[-58.436419,-34.636869],"Parque Chas":[-58.478821,-34.585778],"Parque Patricios":[-58.403138,-34.636093],"Paternal":[-58.467542,-34.59677],"Puerto Madero":[-58.352265,-34.612413],"Recoleta":[-58.381713,-34.574176],"Retiro":[-58.365799,-34.590791],"Saavedra":[-58.489471,-34.551841],"San Cristobal":[-58.401626,-34.625283],"San Nicolas":[-58.380756,-34.604999],"San Telmo":[-58.371792,-34.623138],"Velez Sarsfield":[-58.492829,-34.631815],"Versalles":[-58.520926,-34.631505],"Villa Crespo":[-58.440511,-34.599558],"Villa Del Parque":[-58.488821,-34.605116],"Villa Devoto":[-58.512293,-34.604413],"Villa Gral. Mitre":[-58.468716,-34.609184],"Villa Lugano":[-58.473093,-34.672816],"Villa Luro":[-58.503887,-34.635],"Villa Ortuzar":[-58.468972,-34.581301],"Villa Pueyrredon":[-58.503807,-34.579841],"Villa Real":[-58.524281,-34.619641],"Villa Riachuelo":[-58.463327,-34.689232],"Villa Santa Rita":[-58.483759,-34.615502],"Villa Soldati":[-58.444296,-34.664893],"Villa Urquiza":[-58.489183,-34.571426]};

const CENTS_LOC={"Vicente López":[-58.4737,-34.525123],"Gerli":[-58.366772,-34.688621],"Lomas del Mirador":[-58.532273,-34.665894],"Gregorio de Laferrere":[-58.591856,-34.747758],"Rafael Castillo":[-58.624868,-34.713853],"Isidro Casanova":[-58.577591,-34.718561],"Villa Luzuriaga":[-58.593887,-34.673085],"Ramos Mejía":[-58.558749,-34.651673],"La Tablada":[-58.525562,-34.687521],"San Justo":[-58.562559,-34.687237],"Ciudad Evita":[-58.536979,-34.724581],"Tapiales":[-58.499431,-34.707507],"Villa Madero":[-58.499601,-34.690112],"Virrey Del Pino":[-58.684495,-34.84619],"Veinte de Junio":[-58.718848,-34.785139],"González Catán":[-58.641813,-34.771317],"Aldo Bonzi":[-58.508425,-34.71474],"Boulogne Sur Mer":[-58.570907,-34.497673],"Martínez":[-58.510528,-34.493752],"Villa Adelina":[-58.545038,-34.527649],"Beccar":[-58.53712,-34.46452],"Villa de Mayo":[-58.675059,-34.4986],"Los Polvorines":[-58.698217,-34.510677],"Ingeniero Adolfo Sourdeaux":[-58.661558,-34.500748],"Grand Bourg":[-58.727547,-34.488852],"Tierras Altas":[-58.740298,-34.479523],"Tortuguitas":[-58.752543,-34.473685],"Pablo Nogués":[-58.699095,-34.479271],"El Triángulo":[-58.706342,-34.45471],"Victoria":[-58.560151,-34.462451],"Virreyes":[-58.577442,-34.46394],"Don Torcuato":[-58.623157,-34.497461],"El Talar":[-58.655767,-34.471928],"Acassuso":[-58.499057,-34.474259],"San Isidro":[-58.529256,-34.478955],"San Fernando":[-58.569576,-34.447537],"General Pacheco":[-58.64897,-34.450708],"Haedo":[-58.597823,-34.644139],"Morón":[-58.619026,-34.665186],"Castelar":[-58.645554,-34.664108],"Villa Sarmiento":[-58.571585,-34.634572],"El Palomar":[-58.601514,-34.617731],"San Miguel":[-58.71866,-34.536893],"Don Bosco":[-58.288617,-34.694667],"Villa La Florida":[-58.295532,-34.76922],"San Francisco Solano":[-58.322006,-34.785885],"Wilde":[-58.314575,-34.698178],"Villa Domínico":[-58.327188,-34.687947],"Sarandí":[-58.340859,-34.678111],"Dock Sud":[-58.339774,-34.65286],"Avellaneda":[-58.362876,-34.664732],"Piñeyro":[-58.388099,-34.669775],"Berazategui":[-58.216134,-34.766704],"Villa España":[-58.200638,-34.776121],"Ranelagh":[-58.199059,-34.794184],"Sourigues":[-58.219384,-34.80149],"Plátanos":[-58.166069,-34.76929],"Juan María Gutiérrez":[-58.179847,-34.831866],"Hudson":[-58.142053,-34.788015],"Pereyra":[-58.110152,-34.823466],"El Pato":[-58.196866,-34.906811],"Gobernador Julio A. Costa":[-58.308801,-34.813918],"Florencio Varela":[-58.274886,-34.796045],"Villa Santa Rosa":[-58.289916,-34.837103],"Villa Vatteone":[-58.263613,-34.830364],"Zeballos":[-58.242641,-34.811593],"Bosques":[-58.222755,-34.827633],"Ingeniero Juan Allan":[-58.205215,-34.861085],"Villa Brown":[-58.289639,-34.879323],"Villa San Luis":[-58.25529,-34.862761],"La Capilla":[-58.261021,-34.939242],"Troncos del Talar":[-58.614689,-34.445241],"Nordelta":[-58.649258,-34.414575],"Rincón de Milberg":[-58.614937,-34.409265],"Tigre":[-58.579732,-34.42963],"Ricardo Rojas":[-58.683831,-34.453478],"Benavídez":[-58.690802,-34.40987],"Dique Luján":[-58.689793,-34.373455],"Santa María":[-58.742984,-34.56241],"Muñiz":[-58.707049,-34.554867],"Bella Vista":[-58.696191,-34.575158],"Ciudadela":[-58.542985,-34.633094],"Sáenz Peña":[-58.532289,-34.59935],"Churruca":[-58.626023,-34.557738],"El Libertador":[-58.615311,-34.555343],"Loma Hermosa":[-58.603189,-34.568352],"Once de Septiembre":[-58.618907,-34.565954],"Pablo Podestá":[-58.611222,-34.58106],"Remedios de Escalada de San Martín":[-58.628958,-34.568245],"Villa Bosch":[-58.58036,-34.582276],"Santos Lugares":[-58.545665,-34.601158],"Martín Coronado":[-58.591892,-34.585586],"Ciudad Jardín Lomas del Palomar":[-58.59563,-34.596707],"Caseros":[-58.56578,-34.609089],"La Reja":[-58.839261,-34.645539],"Francisco Álvarez":[-58.860064,-34.607604],"Paso del Rey":[-58.750824,-34.635995],"Moreno":[-58.793795,-34.63825],"Cuartel V":[-58.815904,-34.559111],"Ministro Rivadavia":[-58.335664,-34.851109],"Glew":[-58.379062,-34.886096],"Longchamps":[-58.393824,-34.860327],"Burzaco":[-58.398931,-34.831468],"Malvinas Argentinas":[-58.700108,-34.495749],"Adrogué":[-58.391563,-34.801961],"José Mármol":[-58.369069,-34.785655],"San José":[-58.357319,-34.754754],"Rafael Calzada":[-58.350688,-34.791307],"Claypole":[-58.343868,-34.80406],"San Francisco de Asís":[-58.343593,-34.819111],"Campo de Mayo":[-58.651618,-34.534699],"Llavallol":[-58.431965,-34.794592],"Turdera":[-58.407056,-34.790208],"Temperley":[-58.391282,-34.774952],"Lomas de Zamora":[-58.411439,-34.760027],"Banfield":[-58.395765,-34.743689],"Villa Centenario":[-58.429267,-34.727756],"Villa Fiorito":[-58.44481,-34.706836],"Ingeniero Budge":[-58.458475,-34.719178],"San Antonio de Padua":[-58.697826,-34.670006],"Merlo":[-58.743658,-34.682319],"Mariano Acosta":[-58.797024,-34.715717],"Pontevedra":[-58.715204,-34.749579],"Libertad":[-58.679555,-34.708806],"Monte Chingolo":[-58.356215,-34.730225],"Valentín Alsina":[-58.413707,-34.672076],"Remedios de Escalada":[-58.397661,-34.7238],"Lanús Este":[-58.37239,-34.710857],"Lanús Oeste":[-58.416097,-34.695934],"9 de Abril":[-58.498878,-34.762433],"Luis Guillón":[-58.45304,-34.800094],"Canning":[-58.512308,-34.891663],"El Jagüel":[-58.494837,-34.830487],"Monte Grande":[-58.461811,-34.841748],"Villa Udaondo":[-58.695987,-34.618707],"Ituzaingó":[-58.683011,-34.649883],"William C. Morris":[-58.66456,-34.591932],"Villa Tesei":[-58.638616,-34.620502],"Hurlingham":[-58.636249,-34.592935],"José Ingenieros":[-58.535737,-34.618915],"Carlos Spegazzini":[-58.592539,-34.930605],"Ezeiza":[-58.519594,-34.852693],"La Unión":[-58.543409,-34.873613],"Tristán Suárez":[-58.566447,-34.887468],"Aeropuerto Internacional Ezeiza":[-58.550678,-34.804335],"Villa Celina":[-58.480506,-34.706015],"Trujui":[-58.755198,-34.594643],"Villa Raffo":[-58.534186,-34.609976],"José León Suárez":[-58.580268,-34.522875],"Villa Ballester Noreste":[-58.550262,-34.549028],"San Andrés":[-58.544872,-34.56596],"Villa Maipú":[-58.522066,-34.56943],"San Martín":[-58.540971,-34.579003],"Villa Lynch":[-58.524861,-34.592103],"Billinghurst":[-58.574627,-34.575095],"Quilmes Este":[-58.249108,-34.723998],"Quilmes Oeste":[-58.298762,-34.748604],"Bernal Este":[-58.274278,-34.703936],"Bernal Oeste":[-58.318182,-34.727452],"José C. Paz":[-58.777721,-34.511885],"Villa Libertad":[-58.561393,-34.584603],"Villa Yapeyú":[-58.549105,-34.571665],"Villa Parque Presidente Figueroa Alcorta":[-58.532167,-34.594056],"Villa Necochea":[-58.57354,-34.517765],"Villa Ciudad Jardín El Libertador":[-58.599045,-34.548364],"Barrio Escalada":[-58.592383,-34.564745],"Barrio Militar":[-58.584361,-34.567376],"Villa Coronel José María Zapiola":[-58.577286,-34.559559],"Villa Godoy Cruz":[-58.575692,-34.542383],"Chilavert":[-58.569262,-34.547095],"Villa General José Tomás Guido":[-58.566118,-34.553535],"Villa Gregoria Matorras":[-58.545609,-34.541359],"Villa General Juan Gregorio de Las Heras":[-58.55538,-34.561176],"Villa Bonich":[-58.560648,-34.572692],"Villa Ayacucho":[-58.551788,-34.589735],"Villa Bernardo de Monteagudo":[-58.539804,-34.590812],"Villa Chacabuco":[-58.526122,-34.583766],"Villa Marqués Alejandro María de Aguado":[-58.538378,-34.555054],"Villa Granaderos de San Martín":[-58.53032,-34.548801],"Villa San Lorenzo":[-58.533813,-34.561914],"Villa Independencia":[-58.59245,-34.52328],"Villa Ballester Noroeste":[-58.566031,-34.535664],"Villa Lamadrid":[-58.472113,-34.726546],"Santa Catalina":[-58.476999,-34.742641],"Villa Albertina":[-58.452521,-34.736205],"Santa Marta":[-58.44412,-34.747267],"Parque Barón":[-58.43789,-34.766796],"Ezpeleta Este":[-58.228594,-34.743899],"Ezpeleta Oeste":[-58.263778,-34.763414],"Carapachay":[-58.535809,-34.526622],"Florida":[-58.491168,-34.532723],"Florida Oeste":[-58.515143,-34.539314],"La Lucila":[-58.486972,-34.498156],"Munro":[-58.52561,-34.527207],"Olivos":[-58.498538,-34.512089],"Villa Martelli":[-58.50954,-34.552263],"Paraná de las Palmas":[-58.741395,-34.250055],"Garín":[-58.735773,-34.428513],"Ingeniero Maschwitz":[-58.740554,-34.384101],"Maquinista Savio":[-58.774244,-34.401831],"Belén de Escobar":[-58.806465,-34.324403],"Matheu":[-58.824529,-34.379866],"Loma Verde":[-58.861654,-34.327198],"El Cazador":[-58.738026,-34.324119],"Del Viso":[-58.803418,-34.44951],"Manuel Alberti":[-58.776303,-34.440748],"Lagomarsino":[-58.780493,-34.416143],"La Lonja":[-58.838283,-34.445824],"Presidente Derqui":[-58.844963,-34.49019],"Villa Astolfi":[-58.879476,-34.489288],"Pilar Sur":[-58.91908,-34.512962],"Pilar":[-58.914115,-34.457102],"Manzanares":[-59.017453,-34.445308],"Fátima":[-58.975606,-34.407912],"Zelaya":[-58.883281,-34.363696],"Villa Rosa":[-58.879746,-34.410812],"Martín García":[-58.250395,-34.18283],"El Peligro":[-58.203449,-34.97567],"Arturo Seguí":[-58.126448,-34.901358],"Villa Elisa":[-58.085511,-34.85887],"Abasto":[-58.116155,-35.004917],"Melchor Romero":[-58.047861,-34.947758],"City Bell":[-58.058217,-34.877736],"Manuel B. Gonnet":[-58.022993,-34.886741],"Joaquín Gorina":[-58.047062,-34.905613],"José Hernández":[-58.020077,-34.907612],"Ringuelet":[-57.98819,-34.886515],"Tolosa":[-57.980899,-34.899807],"La Plata":[-57.953588,-34.920524],"San Carlos":[-58.003129,-34.934365],"Villa Elvira":[-57.89041,-34.949825],"Altos de San Lorenzo":[-57.923036,-34.967905],"Eduardo Arana":[-57.836744,-34.981884],"Los Hornos":[-57.942592,-35.028221],"Lisandro Olmos":[-58.009516,-35.030172],"Ángel Etcheverry":[-58.033165,-35.106353],"Villa Garibaldi - Parque Sicardi":[-57.842788,-35.012687],"El Rincón":[-58.094452,-34.886177],"Los Porteños":[-58.081948,-34.913504],"Villa Castells":[-58.011342,-34.873667],"Colonia Urquiza":[-58.092636,-34.941694]};

async function init() {
  const GEO_CACHE_VERSION='v1';
  async function fetchWithCache(key, url){
    try{
      const cached=localStorage.getItem('geo_'+key);
      if(cached){
        const {v,d}=JSON.parse(cached);
        if(v===GEO_CACHE_VERSION)return d;
      }
    }catch(e){}
    const data=await fetch(url).then(r=>r.json());
    try{localStorage.setItem('geo_'+key,JSON.stringify({v:GEO_CACHE_VERSION,d:data}));}catch(e){}
    return data;
  }

  let resCABA, resLOC, resPART, resCUARTO, _tursoRows;
  try {
    [resCABA, resLOC, resPART, resCUARTO, _tursoRows] = await Promise.all([
      fetchWithCache('caba','./barrioscaba.json'),
      fetchWithCache('loc','./localidades.json'),
      fetchWithCache('part','./partidos.json'),
      fetchWithCache('cuarto','./cuartocordon.json'),
      turso('SELECT * FROM artists ORDER BY nombre'),
    ]);
  } catch(e) {
    console.error('Error cargando datos iniciales:', e);
    return;
  }
  
  GEO_CABA = resCABA;
  GEO_LOC = resLOC;
  GEO_PART = resPART;
  GEO_CUARTO = resCUARTO;
  
  GEO_CUARTO.features = GEO_CUARTO.features.filter(f => {
    const nm = (f.properties.NOMBRE || f.properties.nombre || f.properties.nam || '').toLowerCase();
    return !nm.includes('luján') && !nm.includes('lujan') && !nm.includes('perón') && !nm.includes('peron');
  });

  GEO_PART.features.forEach(f => {
    const nm = (f.properties.NOMBRE || f.properties.nombre || f.properties.nam || '').toLowerCase();
    if (nm.includes('luján') || nm.includes('lujan')) {
      const clone = JSON.parse(JSON.stringify(f));
      clone.properties.NOMBRE = 'Luján';
      GEO_CUARTO.features.push(clone);
    }
    if (nm.includes('perón') || nm.includes('peron')) {
      const clone = JSON.parse(JSON.stringify(f));
      clone.properties.NOMBRE = 'Presidente Perón';
      GEO_CUARTO.features.push(clone);
    }
  });

  GEO_CUARTO.features.forEach(f => {
    f.properties.NOMBRE = f.properties.NOMBRE || f.properties.nombre || f.properties.nam || '';
  });

  window.BARRIO_NAMES_CABA=GEO_CABA.features.map(f=>f.properties.nombre).sort();
  window.LOC_NAMES=GEO_LOC.features.map(f=>(f.properties.NOMBRE||f.properties.nombre||'')).sort();
  window.CUARTO_NAMES=GEO_CUARTO.features.map(f=>(f.properties.NOMBRE||f.properties.nombre||'')).sort();
  window.ALL_LOC_NAMES=[...window.BARRIO_NAMES_CABA,...window.LOC_NAMES,...window.CUARTO_NAMES];
  // Detectar nombres duplicados entre localidades para forzar el uso del key "Nombre (Partido)"
  const _locNames = GEO_LOC.features.map(f=>f.properties.NOMBRE||f.properties.nombre||'');
  const _locDupSet = new Set(_locNames.filter((n,i)=>_locNames.indexOf(n)!==i));

  window.ALL_LOC_DATA=[
    ...GEO_CABA.features.map(f=>({nombre:f.properties.nombre,key:f.properties.nombre,hint:'CABA'})).sort((a,b)=>a.nombre.localeCompare(b.nombre)),
    ...GEO_LOC.features.map(f=>{
      const p=f.properties;
      const n=p.NOMBRE||p.nombre||'';
      const dpto=p.DPTO||p.dpto||'';
      // Si el nombre está duplicado, el key incluye el partido para ser único
      const key=_locDupSet.has(n)?(n+' ('+dpto+')'):n;
      return{nombre:n,key,hint:dpto,dpto};
    }).sort((a,b)=>a.nombre.localeCompare(b.nombre)),
    ...GEO_CUARTO.features.map(f=>{const p=f.properties;const n=p.NOMBRE||p.nombre||'';return{nombre:n,key:n,hint:'Partido'}}).sort((a,b)=>a.nombre.localeCompare(b.nombre))
  ];

  let ARTISTS=[];
  if(_tursoRows){ARTISTS=_tursoRows.map(rowToArtist);}
  renderGeneroFilterDropdown();


function cleanNm(n){ return (n||'').replace(/\s*\(.*?\)\s*/g, ''); }

function getCent(name){
  if(!name) return null;
  if(CENTS_CABA[name]) return CENTS_CABA[name];
  if(CENTS_LOC[name]) return CENTS_LOC[name];
  
  const searchName = name.toLowerCase().trim();
  
  // Soporte para keys con partido: "Nombre (Partido)"
  const parenMatch = name.match(/^(.+?)\s*\((.+)\)$/);
  if(parenMatch){
    const locNombre = parenMatch[1].trim();
    const locDpto = parenMatch[2].trim().toLowerCase();
    const feat = GEO_LOC.features.find(f => {
      const n = (f.properties.NOMBRE||f.properties.nombre||'').toLowerCase().trim();
      const d = (f.properties.DPTO||f.properties.dpto||'').toLowerCase().trim();
      return n === locNombre.toLowerCase() && d === locDpto;
    });
    if(feat && feat.geometry){
      const coords = feat.geometry.coordinates.flat(Infinity);
      let minLng=Infinity,maxLng=-Infinity,minLat=Infinity,maxLat=-Infinity;
      for(let i=0;i<coords.length;i+=2){
        if(coords[i]<minLng)minLng=coords[i];if(coords[i]>maxLng)maxLng=coords[i];
        if(coords[i+1]<minLat)minLat=coords[i+1];if(coords[i+1]>maxLat)maxLat=coords[i+1];
      }
      return[(minLng+maxLng)/2,(minLat+maxLat)/2];
    }
  }

  const feat = GEO_LOC.features.find(f => (f.properties.NOMBRE || f.properties.nombre || '').toLowerCase().trim() === searchName) ||
               GEO_CUARTO.features.find(f => (f.properties.NOMBRE || f.properties.nombre || '').toLowerCase().trim() === searchName);
               
  if(feat && feat.geometry) {
    const coords = feat.geometry.coordinates.flat(Infinity);
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for(let i=0; i<coords.length; i+=2) {
      if(coords[i] < minLng) minLng = coords[i];
      if(coords[i] > maxLng) maxLng = coords[i];
      if(coords[i+1] < minLat) minLat = coords[i+1];
      if(coords[i+1] > maxLat) maxLat = coords[i+1];
    }
    return [(minLng + maxLng)/2, (minLat + maxLat)/2];
  }

  const baseName = cleanNm(name);
  return CENTS_LOC[baseName] || null;
}

function fitToLocation(name) {
  if (!name) return;
  // Si el nombre trae partido explícito ("Gerli (Avellaneda)") buscar exacto por nombre+partido
  const parenM = name.match(/^(.+?)\s*\((.+)\)$/);
  let feat;
  if (parenM) {
    feat = GEO_LOC.features.find(f => {
      const fn = (f.properties.NOMBRE||f.properties.nombre||'').toLowerCase().trim();
      const fd = (f.properties.DPTO||f.properties.dpto||'').toLowerCase().trim();
      return fn === parenM[1].toLowerCase().trim() && fd === parenM[2].toLowerCase().trim();
    });
  } else {
    feat = GEO_CABA.features.find(f => (f.properties.nombre||'') === name) ||
           GEO_LOC.features.find(f => (f.properties.NOMBRE||f.properties.nombre||'') === name) ||
           GEO_CUARTO.features.find(f => (f.properties.NOMBRE||f.properties.nombre||'') === name);
  }

  if (feat && feat.geometry) {
    const bounds = new mapboxgl.LngLatBounds();
    const coords = feat.geometry.coordinates.flat(Infinity);
    for (let i = 0; i < coords.length; i += 2) {
      bounds.extend([coords[i], coords[i+1]]);
    }
    _fitInProgress=true;
    map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 380 }, maxZoom: 14, duration: 800 });
  } else {
    const cent = getCent(name);
    if(cent) {
      _fitInProgress=true;
      map.flyTo({center: cent, zoom: 13, duration: 800});
    }
  }
}

let byId={},byName={},byBarrio={},byCrew={};
function reindex(){
  byId={};byName={};byBarrio={};byCrew={};
  ARTISTS.forEach(a=>{
    byId[a.id]=a;byName[a.nombre]=a;
    (byBarrio[a.barrio]=byBarrio[a.barrio]||[]).push(a);
    if(a.crew)(byCrew[a.crew]=byCrew[a.crew]||[]).push(a);
  });
}
reindex();

function areCollabs(a,b){
  return (a.collabs&&a.collabs.includes(b.nombre))||(b.collabs&&b.collabs.includes(a.nombre));
}
function getCollabArtists(a){
  const result=[];
  (a.collabs||[]).forEach(n=>{const c=byName[n];if(c)result.push(c);});
  ARTISTS.forEach(b=>{if(b.id!==a.id&&b.collabs&&b.collabs.includes(a.nombre)&&!result.some(r=>r.id===b.id))result.push(b);});
  return result;
}
function getCrewCollabNames(members,memberIds){
  const names=new Set();
  members.forEach(a=>{
    (a.collabs||[]).forEach(n=>{if(!memberIds.includes((byName[n]||{}).id))names.add(n);});
    ARTISTS.forEach(b=>{if(!memberIds.includes(b.id)&&b.collabs&&b.collabs.includes(a.nombre))names.add(b.nombre);});
  });
  return names;
}

let selBarrioFeat=null;

function highlightBarrio(barrioName){
  clearBarrioHighlight();
  if(!barrioName)return;
  const cabaIdx=GEO_CABA.features.findIndex(f=>(f.properties.nombre||'').toLowerCase()===barrioName.toLowerCase());
  if(cabaIdx!==-1){
    selBarrioFeat={src:'caba',id:cabaIdx};
    try{map.setFeatureState({source:'caba',id:cabaIdx},{selected:true});}catch(e){}
    return;
  }
  // Soporte para barrios con nombre duplicado: "San Francisco Solano (Almirante Brown)"
  const parenMh=barrioName.match(/^(.+?)\s*\((.+)\)$/);
  const locFeat=parenMh
    ? GEO_LOC.features.find(f=>{
        const fn=(f.properties.NOMBRE||f.properties.nombre||'').toLowerCase().trim();
        const fd=(f.properties.DPTO||f.properties.dpto||'').toLowerCase().trim();
        return fn===parenMh[1].toLowerCase().trim()&&fd===parenMh[2].toLowerCase().trim();
      })
    : GEO_LOC.features.find(f=>(f.properties.NOMBRE||f.properties.nombre||'').toLowerCase()===barrioName.toLowerCase());
  if(locFeat){
    const locId=+locFeat.properties.CODIGO;
    selBarrioFeat={src:'loc',id:locId};
    try{map.setFeatureState({source:'loc',id:locId},{selected:true});}catch(e){}
    return;
  }
  const cuartoIdx=GEO_CUARTO.features.findIndex(f=>(f.properties.NOMBRE||f.properties.nombre||'').toLowerCase()===barrioName.toLowerCase());
  if(cuartoIdx!==-1){
    selBarrioFeat={src:'cuarto',id:cuartoIdx};
    try{map.setFeatureState({source:'cuarto',id:cuartoIdx},{selected:true});}catch(e){}
    return;
  }
}

function clearBarrioHighlight(){
  if(selBarrioFeat){
    try{map.setFeatureState({source:selBarrioFeat.src,id:selBarrioFeat.id},{selected:false});}catch(e){}
    selBarrioFeat=null;
  }
}

let selId=null,selBF=null,selLoc=null,hovBF=null,hovLoc=null,hovCuarto=null;
let currentHoverId=null, hoverOverridesCache=null;
let markerHovered=false;
let extraLayerHovered=false;
let curTab='map';
const mhosts={},mobjs={};

function applyTypeFilter(){
  const showMC=document.getElementById('flt-mc').checked;
  const showProd=document.getElementById('flt-prod').checked;
  const showPM=document.getElementById('flt-pm').checked;
  refreshArtistLayer({});
  refreshClusterLayer();
}

function switchTab(t){
  curTab=t;
  document.getElementById('tab-map').classList.toggle('active',t==='map');
  const _tabCol=document.getElementById('tab-col');if(_tabCol)_tabCol.classList.toggle('active',t==='col');
  document.getElementById('map-view').style.display=t==='map'?'block':'none';
  const _collabView=document.getElementById('collab-view');if(_collabView)_collabView.style.display=t==='col'?'block':'none';
  if(t==='col')renderCollabView();
}

function renderCollabView(){
  const canvas=document.getElementById('cv-canvas');
  const empty=document.getElementById('cv-empty')||{style:{}};
  canvas.innerHTML='';
  const cities={};
  ARTISTS.forEach(a=>{const city=a.ciudad||'Otro';(cities[city]=cities[city]||[]).push(a);});
  Object.entries(cities).forEach(([city,arts])=>{
    const box=document.createElement('div');box.className='cv-city';
    const lbl=document.createElement('div');lbl.className='cv-city-label';lbl.textContent=city;
    box.appendChild(lbl);
    const row=document.createElement('div');row.className='cv-artists';
    arts.forEach(a=>{
      const node=document.createElement('div');node.className='cv-node';node.id='cvn-'+a.id;
      const circ=document.createElement('div');circ.className='cv-circle';circ.id='cvc-'+a.id;
      circ.style.borderColor=TC[a.tipo]||TC.mc;circ.style.color=TC[a.tipo]||TC.mc;
      if(a.avatarSrc){const img=document.createElement('img');img.src=a.avatarSrc;circ.appendChild(img);}
      else circ.textContent=a.iniciales||(a.nombre.slice(0,2).toUpperCase());
      const lbl2=document.createElement('div');lbl2.className='cv-label';lbl2.id='cvl-'+a.id;lbl2.textContent=a.nombre;
      node.appendChild(circ);node.appendChild(lbl2);
      node.addEventListener('click',()=>selectArtist(a.id));
      row.appendChild(node);
    });
    box.appendChild(row);canvas.appendChild(box);
  });
  empty.style.display=(!selId&&ARTISTS.length)?'block':'none';
  canvas.style.display=ARTISTS.length?'flex':'none';
  applyCollabState();
  requestAnimationFrame(()=>drawCollabLines());
}

function applyCollabState(){
  if(!selId){ARTISTS.forEach(a=>{const c=document.getElementById('cvc-'+a.id);const l=document.getElementById('cvl-'+a.id);if(c){c.classList.remove('sel-n','dim-n');c.style.background='#e0e0e0';}if(l)l.classList.remove('sel-l','dim-l');});return;}
  const sel=byId[selId];
  ARTISTS.forEach(a=>{
    const c=document.getElementById('cvc-'+a.id);const l=document.getElementById('cvl-'+a.id);if(!c)return;
    c.classList.remove('sel-n','dim-n');l.classList.remove('sel-l','dim-l');
    if(a.id===selId){c.classList.add('sel-n');c.style.background='#ddeeff';l.classList.add('sel-l');}
    else{
      const ic=sel.crew&&a.crew&&sel.crew===a.crew;
      const ico=sel.collabs&&sel.collabs.includes(a.nombre);
      if(!ic&&!ico){c.classList.add('dim-n');l.classList.add('dim-l');c.style.background='#e0e0e0';}
      else c.style.background='#e0e0e0';
    }
  });
  const _cve=document.getElementById('cv-empty');if(_cve)_cve.style.display='none';
}

function drawCollabLines(){
  const old=document.getElementById('cv-svg-wrap');if(old)old.remove();
  if(!selId)return;
  const canvas=document.getElementById('cv-canvas');
  const sel=byId[selId];
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id='cv-svg';svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible';
  const wrap=document.createElement('div');wrap.id='cv-svg-wrap';
  wrap.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2;overflow:visible';
  wrap.appendChild(svg);canvas.style.position='relative';canvas.appendChild(wrap);
  const cr=canvas.getBoundingClientRect();
  ARTISTS.forEach(b=>{
    if(b.id===selId)return;
    const ic=sel.crew&&b.crew&&sel.crew===b.crew;
    const ico=sel.collabs&&sel.collabs.includes(b.nombre);
    if(!ic&&!ico)return;
    const fn=document.getElementById('cvc-'+selId);const tn=document.getElementById('cvc-'+b.id);
    if(!fn||!tn)return;
    const fr=fn.getBoundingClientRect();const tr=tn.getBoundingClientRect();
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',fr.left+fr.width/2-cr.left);line.setAttribute('y1',fr.top+fr.height/2-cr.top);
    line.setAttribute('x2',tr.left+tr.width/2-cr.left);line.setAttribute('y2',tr.top+tr.height/2-cr.top);
    line.className='cv-line '+(ic?'crew':'collab');svg.appendChild(line);
  });
}

const map=new mapboxgl.Map({
  container:'map',
  style:{version:8,sources:{},layers:[],glyphs:"mapbox://fonts/mapbox/{fontstack}/{range}.pbf"},
  center:[-58.44,-34.615],zoom:11,minZoom:8,maxZoom:17,
  attributionControl:false
});

let _fitInProgress = false; 

map.on('load',()=>{
  
  map.addLayer({id:'bg',type:'background',paint:{'background-color':'#f0f0f0'}});

  map.addSource('wsrc',{type:'vector',url:'mapbox://mapbox.mapbox-streets-v8'});
  map.addLayer({id:'water',type:'fill',source:'wsrc','source-layer':'water',paint:{'fill-color':'#7DCAFD'}});

  map.addSource('loc',{type:'geojson',data:GEO_LOC,promoteId:'CODIGO'});
  map.addLayer({id:'loc-fill',type:'fill',source:'loc',paint:{
    'fill-color':['case',
      ['boolean',['feature-state','selected'],false],'#FFBFC1',
      ['boolean',['feature-state','hover'],false],'#FFBFC1',
      '#ebebeb'],
    'fill-opacity':1
  }});

  map.addSource('cuarto',{type:'geojson',data:GEO_CUARTO,generateId:true});
  map.addLayer({id:'cuarto-fill',type:'fill',source:'cuarto',paint:{
    'fill-color':['case',
      ['boolean',['feature-state','selected'],false],'#FFBFC1',
      ['boolean',['feature-state','hover'],false],'#FFBFC1',
      'rgba(0,0,0,0)'],
    'fill-opacity':1
  }});

  map.addSource('caba',{type:'geojson',data:GEO_CABA,generateId:true});
  map.addLayer({id:'bf',type:'fill',source:'caba',paint:{
    'fill-color':['case',
      ['boolean',['feature-state','selected'],false],'#FFBFC1',
      ['boolean',['feature-state','hover'],false],'#FFBFC1',
      '#e8e8e8'],
    'fill-opacity':0.95
  }});

  map.addLayer({id:'loc-line',type:'line',source:'loc',paint:{'line-color':'#c8c8c8','line-width':0.7}});
  map.addLayer({id:'bl',type:'line',source:'caba',paint:{'line-color':'#bbb','line-width':1}});
  map.addLayer({id:'cuarto-line',type:'line',source:'cuarto',paint:{'line-color':'#666','line-width':2.5}});

  map.addSource('part',{type:'geojson',data:GEO_PART});
  map.addLayer({id:'part-line',type:'line',source:'part',paint:{'line-color':'#666','line-width':2.5}});

  // ── CAPA NATIVA DE LÍNEAS ────────────────
  map.addSource('map-lines', {type:'geojson', data:{type:'FeatureCollection', features:[]}});
  map.addLayer({
    id: 'map-lines-layer',
    type: 'line',
    source: 'map-lines',
    paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': 0.6,
        'line-dasharray': ['case', 
            ['==', ['get', 'color'], '#777777'], 
            ['literal', [4, 3]],   // collab gris → dashed
            ['literal', [1, 0]]    // crew rojo → sólido
        ]
    }
});

  // ── CAPA DE ARTISTAS Y CLUSTERS ────────────────
  map.addSource('artists-src',{type:'geojson',data:{type:'FeatureCollection',features:[]},promoteId:'id'});
  map.addSource('clusters-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});

  // PUNTITOS SÓLIDOS (A prueba de fallos con coalesce)
  map.addLayer({id:'artists-circle',type:'circle',source:'artists-src',filter:['==',['get','visible'],1],paint:{
    'circle-radius': [
  'interpolate', ['linear'], ['zoom'],
  10, ['*', 6, ['coalesce', ['get', 'scale'], 1]],
  16, ['*', 9, ['coalesce', ['get', 'scale'], 1]]
],
    'circle-color':['get','color'],
    'circle-opacity':['get','opacity']
  }});

  map.addLayer({id:'clusters-circle',type:'circle',source:'clusters-src',filter:['==',['get','visible'],1],paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],10,10,16,13], 
    'circle-color':'#DC3137',
  }});
  
  (function addNumIcons(){
    const sz=38;
    const dpr = window.devicePixelRatio || 2; // HD Clusters
    for(let n=1;n<=200;n++){
      const cv=document.createElement('canvas');
      cv.width=sz * dpr; cv.height=sz * dpr;
      const cx=cv.getContext('2d');
      cx.scale(dpr, dpr);
      cx.clearRect(0,0,sz,sz);
      cx.font=(sz*0.45)+'px Arial,sans-serif'; 
      cx.textAlign='center';cx.textBaseline='middle';
      cx.fillStyle='#fafafa';
      cx.fillText(String(n),sz/2,sz/2+2);
      map.addImage('num-'+n,{width:sz*dpr,height:sz*dpr,pixelRatio:dpr,data:cx.getImageData(0,0,sz*dpr,sz*dpr).data});
    }
  })();
  map.addLayer({id:'clusters-label',type:'symbol',source:'clusters-src',filter:['==',['get','visible'],1],layout:{
    'icon-image':['concat','num-',['to-string',['get','count']]],
    'icon-size':['interpolate',['linear'],['zoom'],10,0.45,16,0.55],
    'icon-allow-overlap':true,
    'icon-ignore-placement':true,
  },paint:{'icon-opacity':1}});

  // Artist hover
  map.on('mousemove','artists-circle',e=>{
    if(!e.features.length)return;
    map.getCanvas().style.cursor='pointer';
    markerHovered=true;
    const f=e.features[0];
    const a=byId[f.id||f.properties.id];
    if(!a)return;
    
    if(!selId&&!crewFilter){
      if (currentHoverId !== a.id) {
         currentHoverId = a.id;
         hoverOverridesCache = _buildOverridesForCurrentState();
         ARTISTS.forEach(b => {
             const ic = a.crew && b.crew && a.crew === b.crew;
             const ico = areCollabs(a, b);
             if (!hoverOverridesCache[b.id]) hoverOverridesCache[b.id] = {};
             if (b.id === a.id) {
                 hoverOverridesCache[b.id].visible = 1;
                 hoverOverridesCache[b.id].opacity = 1;
                 hoverOverridesCache[b.id].forceOrbit = true;
                 hoverOverridesCache[b.id].scale = 2.5; // Agrandar marker en hover
             } else if (ic || ico) {
                 hoverOverridesCache[b.id].visible = 1;
                 hoverOverridesCache[b.id].opacity = 1;
                 hoverOverridesCache[b.id].forceOrbit = true;
             } else {
                 hoverOverridesCache[b.id].opacity = 0.15; 
             }
         });
         refreshArtistLayer(hoverOverridesCache);
         refreshClusterLayer();
         _doRedrawMapLines();
      }
    }
    else if(crewFilter){
      const members=byCrew[crewFilter]||[];
      const memberIds=members.map(m=>m.id);
      if(!memberIds.includes(a.id)){
        const features = [];
        const aForceOrbit = currentOverrides[a.id] ? currentOverrides[a.id].forceOrbit : false;
        const aLL=getArtistLngLat(a, aForceOrbit);
        
        members.forEach(m=>{
          if(!areCollabs(a,m))return;
          const mForceOrbit = currentOverrides[m.id] ? currentOverrides[m.id].forceOrbit : false;
          const mLL=getArtistLngLat(m, mForceOrbit);
          features.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[aLL.lng, aLL.lat], [mLL.lng, mLL.lat]] },
              properties: { color: '#777777', width: 1.5 }
          });
        });
        if(map.getSource('map-lines')) map.getSource('map-lines').setData({type: 'FeatureCollection', features});
      }
    }

    // DESPUÉS (usa e.point directo — sin re-proyección, sin offset):
const isForced = currentOverrides[a.id] ? currentOverrides[a.id].forceOrbit : false;
const aLL = getArtistLngLat(a, isForced);
const px = map.project([aLL.lng, aLL.lat]);
showTip(a, px.x, px.y);

// Avatar lazy load — posición fija sobre el marker
if (a.avatarSrc) {
  if (_hoverAv._lastArtistId !== a.id) {
    _hoverAv._lastArtistId = a.id;
    _hoverAv.style.transform = 'translate(-50%, -50%) scale(0.5)';
    _hoverAv.style.backgroundImage = `url(${a.avatarSrc})`;
    _hoverAv.style.borderColor = TC[a.tipo] || '#ffffff';
    _hoverAv.style.display = 'block';
    requestAnimationFrame(() => {
      _hoverAv.style.transform = 'translate(-50%, -50%) scale(1)';
    });
  }
  _hoverAv.style.left = px.x + 'px';
  _hoverAv.style.top  = px.y + 'px';
} else {
  _hoverAv.style.display = 'none';
  _hoverAv._lastArtistId = null;
}
  });
  
  map.on('mouseleave','artists-circle',()=>{
    map.getCanvas().style.cursor='';
    hideTip();
    markerHovered=false;
    
    // Solo ocultar avatar si no hay artista seleccionado
    if(!selId) {
      _hoverAv.style.display = 'none';
      _hoverAv.style.transform = 'translate(-50%, -50%) scale(0.5)';
      _hoverAv._lastArtistId = null;
    }
    
    if(!selId&&!crewFilter){
      currentHoverId = null;
      hoverOverridesCache = null;
      refreshArtistLayer(_buildOverridesForCurrentState());
      refreshClusterLayer();
      _doRedrawMapLines(); 
    }
    else if(crewFilter){
      _doRedrawMapLines();
    }
});
  
  map.on('click','artists-circle',e=>{
    if(!e.features.length)return;
    e.originalEvent._handled=true;
    if(crewFilter)return;
    const a=byId[e.features[0].id||e.features[0].properties.id];
    if(a)selectArtist(a.id);
  });

  map.on('mouseenter','clusters-circle',()=>{map.getCanvas().style.cursor='pointer';});
  map.on('mouseleave','clusters-circle',()=>{map.getCanvas().style.cursor='';});
  map.on('click','clusters-circle',e=>{
    if(!e.features.length)return;
    e.originalEvent._handled=true;
    const barrio=e.features[0].properties.barrio;
    expandCluster(barrio);
    const cabaIdx=GEO_CABA.features.findIndex(f=>(f.properties.nombre||'')===barrio);
    if(cabaIdx!==-1){
      openBP(cabaIdx,GEO_CABA.features[cabaIdx].properties,'caba','Barrio de CABA');
    } else {
      const locFeat=GEO_LOC.features.find(f=>(f.properties.NOMBRE||f.properties.nombre||'')===barrio);
      if(locFeat){
        const p=locFeat.properties;
        openBP(+p.CODIGO,{nombre:p.NOMBRE||p.nombre||'',subtitulo:p.DPTO||p.dpto||''},'loc',p.DPTO||p.dpto||'');
      }
    }
  });

  buildClusters();
  map.on('zoomend',checkClusterCollapse);

  const popB=new mapboxgl.Popup({closeButton:false,closeOnClick:false,offset:8});
  map.on('mousemove','bf',e=>{
    if(map.queryRenderedFeatures(e.point,{layers:['artists-circle']}).length){map.getCanvas().style.cursor='pointer';popB.remove();return;}
    if(crewFilter){popB.remove();return;}
    map.getCanvas().style.cursor='pointer';
    if(!e.features.length)return;
    const fid=e.features[0].id;
    if(hovBF!==null&&hovBF!==fid)map.setFeatureState({source:'caba',id:hovBF},{hover:false});
    hovBF=fid;map.setFeatureState({source:'caba',id:fid},{hover:true});
    const nm=e.features[0].properties.nombre||'';
    const _bfAlreadyOpen = selBF && selBF.src === 'caba' && selBF.id === fid;
    if(!markerHovered && !_bfAlreadyOpen) popB.setLngLat(e.lngLat).setHTML('<div class="pn">'+nm+'</div><div class="ps">CABA</div>').addTo(map);
    else popB.remove();  
  });
  map.on('mouseleave','bf',()=>{
    map.getCanvas().style.cursor='';
    if(hovBF!==null){map.setFeatureState({source:'caba',id:hovBF},{hover:false});hovBF=null;}
    popB.remove();
  });
  map.on('click', 'bf', e => {
    if (e.originalEvent._handled) return;
    if(map.queryRenderedFeatures(e.point,{layers:['artists-circle']}).length)return;
    e.originalEvent._handled = true;
    const p = e.features[0].properties;
    const nm = p.nombre || '';
    
    collapseAllClusters();
    openBP(e.features[0].id, p, 'caba', 'Barrio de CABA');
    fitToLocation(nm);
    if(clusters[nm]) expandCluster(nm);
  });

  const popL=new mapboxgl.Popup({closeButton:false,closeOnClick:false,offset:8});
  const popC=new mapboxgl.Popup({closeButton:false,closeOnClick:false,offset:8});
  
  map.on('mousemove','cuarto-fill',e=>{
    if(map.queryRenderedFeatures(e.point,{layers:['artists-circle']}).length){map.getCanvas().style.cursor='pointer';popC.remove();return;}
    if(crewFilter){popC.remove();return;}

    const overLoc = map.queryRenderedFeatures(e.point, { layers: ['loc-fill'] }).length > 0;
    if (overLoc) {
      if(hovCuarto!==null){
        map.setFeatureState({source:'cuarto',id:hovCuarto},{hover:false});
        hovCuarto=null;
      }
      popC.remove();
      return; 
    }

    map.getCanvas().style.cursor='pointer';
    if(!e.features.length)return;
    const fid=e.features[0].id;
    if(hovCuarto!==null&&hovCuarto!==fid)map.setFeatureState({source:'cuarto',id:hovCuarto},{hover:false});
    hovCuarto=fid;map.setFeatureState({source:'cuarto',id:fid},{hover:true});
    const nm=e.features[0].properties.NOMBRE||e.features[0].properties.nombre||'';
    const overExtraC=map.queryRenderedFeatures(e.point,{layers:['loc-fill']}).some(f=>f.properties._extra);
    const _cuartoAlreadyOpen = selBF && (selBF.src === 'cuarto' && selBF.id === fid || selBF.src === 'loc');
    if(!markerHovered && !overExtraC && !_cuartoAlreadyOpen) popC.setLngLat(e.lngLat).setHTML('<div class="pn">'+nm+'</div>').addTo(map);
    else popC.remove();
  });
  map.on('mouseleave','cuarto-fill',()=>{
    map.getCanvas().style.cursor='';
    if(hovCuarto!==null){map.setFeatureState({source:'cuarto',id:hovCuarto},{hover:false});hovCuarto=null;}
    popC.remove();
  });
  map.on('click', 'cuarto-fill', e => {
    if (e.originalEvent._handled) return;
    if(map.queryRenderedFeatures(e.point,{layers:['artists-circle']}).length)return;
    if(map.queryRenderedFeatures(e.point, { layers: ['loc-fill'] }).length > 0) return;
    e.originalEvent._handled = true;
    const p = e.features[0].properties;
    const nm = p.NOMBRE || p.nombre || '';
    
    collapseAllClusters();
    openBP(e.features[0].id, {nombre: nm, subtitulo: 'Conurbano'}, 'cuarto', 'Conurbano');
    fitToLocation(nm);
    if(clusters[nm]) expandCluster(nm);
  });

  let hovExtra={loc:null};
  const popExtra=new mapboxgl.Popup({closeButton:false,closeOnClick:false,offset:8});
  map.on('mousemove','loc-fill',e=>{
    if(map.queryRenderedFeatures(e.point,{layers:['artists-circle']}).length){map.getCanvas().style.cursor='pointer';popL.remove();return;}
    if(!e.features.length)return;
    if(crewFilter){popL.remove();popExtra.remove();return;}
    map.getCanvas().style.cursor='pointer';
    const normalFeat = e.features.find(f => f.source === 'loc' && !f.properties._extra);
    const f0 = normalFeat || e.features[0];
    const fid=f0.id;
    const isExtra=!!f0.properties._extra;
    if(isExtra){
      if(hovLoc!==null){map.setFeatureState({source:'loc',id:hovLoc},{hover:false});hovLoc=null;}
      if(hovExtra.loc!==null&&hovExtra.loc!==fid){map.setFeatureState({source:'loc',id:hovExtra.loc},{hover:false});}
      hovExtra.loc=fid;
      map.setFeatureState({source:'loc',id:fid},{hover:true});
      extraLayerHovered=true;popL.remove();
      const nm = cleanNm(f0.properties.NOMBRE||'');
      const dp=f0.properties.DPTO||'';
      if(!markerHovered)popExtra.setLngLat(e.lngLat).setHTML('<div class="pn">'+nm+'</div>'+(dp?'<div class="ps">'+dp+'</div>':'')).addTo(map);
    } else {
      if(hovExtra.loc!==null){map.setFeatureState({source:'loc',id:hovExtra.loc},{hover:false});hovExtra.loc=null;}
      extraLayerHovered=false;popExtra.remove();
      if(hovLoc!==null&&hovLoc!==fid){map.setFeatureState({source:'loc',id:hovLoc},{hover:false});}
      hovLoc=fid;
      map.setFeatureState({source:'loc',id:fid},{hover:true});
      const nm = cleanNm(f0.properties.NOMBRE||'');
      const dp=f0.properties.DPTO||'';
      const _locAlreadyOpen = selBF && selBF.src === 'loc' && selBF.id === fid;
      if(!markerHovered && !_locAlreadyOpen) popL.setLngLat(e.lngLat).setHTML('<div class="pn">'+nm+'</div>'+(dp?'<div class="ps">'+dp+'</div>':'')).addTo(map);
      else popL.remove();
    }
  });
  map.on('mouseleave','loc-fill',()=>{
    map.getCanvas().style.cursor='';
    if(hovLoc!==null){map.setFeatureState({source:'loc',id:hovLoc},{hover:false});hovLoc=null;}
    if(hovExtra.loc!==null){map.setFeatureState({source:'loc',id:hovExtra.loc},{hover:false});hovExtra.loc=null;}
    extraLayerHovered=false;popL.remove();popExtra.remove();
  });
  map.on('click', 'loc-fill', e => {
    if (e.originalEvent._handled) return;
    if(map.queryRenderedFeatures(e.point,{layers:['artists-circle']}).length)return;
    e.originalEvent._handled = true;
    const f0 = e.features.find(f => !f.properties._extra) || e.features[0];
    const p = f0.properties;
    const nm = p.NOMBRE || p.nombre || '';
    
    collapseAllClusters();
    const _dpto = p.DPTO || p.dpto || '';
    openBP(f0.id, {nombre: nm, subtitulo: _dpto}, 'loc', _dpto);
    fitToLocation(_dpto ? nm+' ('+_dpto+')' : nm);
    if(clusters[nm]) expandCluster(nm);
  });

  map.on('click',e=>{
    if(e.originalEvent._handled)return;
    const hits=[
      ...map.queryRenderedFeatures(e.point,{layers:['bf']}),
      ...map.queryRenderedFeatures(e.point,{layers:['loc-fill']}),
      ...map.queryRenderedFeatures(e.point,{layers:['cuarto-fill']}),
    ];
    if(!hits.length)closeAll();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeAll();closeModal();}});
  
  map.on('movestart',()=>{
    document.querySelectorAll('.mtt.on').forEach(t=>t.classList.remove('on'));
    // Ocultar avatar solo si no hay artista seleccionado (hover sin click)
    if(!selId) {
      _hoverAv.style.display = 'none';
      _hoverAv._lastArtistId = null;
    }
    _fitInProgress = false; 
  });

  // Reposicionar el avatar en cada frame de pan/zoom cuando está visible
  map.on('move', () => {
    if(_hoverAv._lastArtistId && _hoverAv.style.display !== 'none') {
      const a = byId[_hoverAv._lastArtistId];
      if(a) {
        const isForced = currentOverrides[a.id] ? currentOverrides[a.id].forceOrbit : false;
        const aLL = getArtistLngLat(a, isForced);
        const newPx = map.project([aLL.lng, aLL.lat]);
        _hoverAv.style.left = newPx.x + 'px';
        _hoverAv.style.top  = newPx.y + 'px';
      }
    }
  });
});

const clusters={};       
const expandedCluster={}; 
let clusterZoomBefore=null;
let currentOverrides={}; 

function getArtistLngLat(a, forceOrbit = false){
  const cl = clusters[a.barrio];
  if (cl && (cl.expanded || forceOrbit) && cl.artists.length > 1) {
     const sortedArtists = [...cl.artists].sort((x, y) => x.id.localeCompare(y.id));
     const idx = sortedArtists.findIndex(x => x.id === a.id);
     if (idx !== -1) {
         const total = sortedArtists.length;
         const angle = (idx / total) * Math.PI * 2;
         const radius = 0.0025 + (total * 0.00008); 
         const latFactor = Math.cos(a.lat * Math.PI / 180);
         return {
             lng: a.lng + (Math.cos(angle) * radius) / latFactor,
             lat: a.lat + Math.sin(angle) * radius
         };
     }
  }
  return {lng: a.lng, lat: a.lat};
}

function buildArtistGeoJSON(overrides={}){
  const features = ARTISTS.map(a => {
    const ov = overrides[a.id] || {};
    const cl = clusters[a.barrio];
    const inCollapsedCluster = cl && !cl.expanded;
    const typeVisible = isTypeVisible(a.tipo);
    const genVisible = isGeneroVisible(a);
    const visible = ov.visible !== undefined ? ov.visible : (!inCollapsedCluster && typeVisible && genVisible ? 1 : 0);
    
    const forceOrbit = ov.forceOrbit || false;
    const pos = getArtistLngLat(a, forceOrbit);

    return {
      type:'Feature',
      id: a.id,
      geometry:{type:'Point',coordinates:[pos.lng, pos.lat]},
      properties:{
        id: a.id,
        nombre: a.nombre,
        iniciales: a.iniciales || a.nombre.slice(0,2).toUpperCase(),
        tipo: a.tipo,
        color: TC[a.tipo]||TC.mc,
        visible: visible ? 1 : 0,
        opacity: ov.opacity !== undefined ? ov.opacity : 1,
        scale: ov.scale !== undefined ? ov.scale : 1
      }
    };
  });
  return {type:'FeatureCollection', features};
}

function buildClusterGeoJSON(){
  const features = Object.entries(clusters).map(([barrio, cl]) => {
    const cent = getCent(barrio);
    if(!cent) return null;
    const showMC=document.getElementById('flt-mc').checked;
    const showProd=document.getElementById('flt-prod').checked;
    const showPM=document.getElementById('flt-pm').checked;
    
    const visCount = cl.artists.filter(a => {
      const typeVis = (a.tipo==='mc'&&showMC)||(a.tipo==='prod'&&showProd)||(a.tipo==='prod_mc'&&showPM);
      const genVis = isGeneroVisible(a);
      const ov = currentOverrides[a.id];
      if (ov && ov.visible !== undefined) {
         return ov.visible === 1;
      }
      return typeVis && genVis;
    }).length;
    
    const hasForceOrbit = cl.artists.some(a => currentOverrides[a.id] && currentOverrides[a.id].forceOrbit);
    const visible = (!cl.expanded && visCount > 0 && !hasForceOrbit) ? 1 : 0;
    
    return {
      type:'Feature',
      geometry:{type:'Point',coordinates:cent},
      properties:{
        barrio,
        count: visCount,
        visible,
      }
    };
  }).filter(Boolean);
  return {type:'FeatureCollection', features};
}

function refreshArtistLayer(overrides={}){
  currentOverrides = overrides; 
  const src = map.getSource('artists-src');
  if(src) src.setData(buildArtistGeoJSON(overrides));
}

function refreshClusterLayer(){
  const src = map.getSource('clusters-src');
  if(src) src.setData(buildClusterGeoJSON());
}

function buildClusters(){
  Object.keys(clusters).forEach(k=>delete clusters[k]);
  const groups={};
  ARTISTS.forEach(a=>{(groups[a.barrio]=groups[a.barrio]||[]).push(a);});
  Object.entries(groups).forEach(([barrio,arts])=>{
    if(arts.length<2)return;
    const cent=getCent(barrio);
    if(!cent)return;
    clusters[barrio]={artists:arts,expanded:false};
  });
  refreshArtistLayer();
  refreshClusterLayer();
}

function expandCluster(barrio, onlyIds){
  const cl=clusters[barrio];if(!cl)return;
  if(cl.expanded){
    if(onlyIds){
      refreshArtistLayer(_buildOverridesForCurrentState());
    }
    return;
  }
  cl.expanded=true;
  if(!onlyIds){
    const cent=getCent(barrio);
    if(cent){
      clusterZoomBefore=map.getZoom();
      _fitInProgress=true;
      map.flyTo({center:cent,zoom:Math.max(map.getZoom(),14),duration:500});
    }
  } else {
    if(!clusterZoomBefore)clusterZoomBefore=map.getZoom();
  }
  refreshArtistLayer(_buildOverridesForCurrentState(onlyIds ? {onlyIds, barrio} : null));
  refreshClusterLayer();
}

function _buildOverridesForCurrentState(expandHint){
  const overrides={};
  if(selId){
    const a=byId[selId];
    ARTISTS.forEach(b=>{
      const ic=a.crew&&b.crew&&a.crew===b.crew;
      const ico=areCollabs(a,b);
      if(b.id===selId) overrides[b.id]={visible:1,opacity:1,forceOrbit:true,scale:1.5};
      else if(ic||ico) overrides[b.id]={visible:isTypeVisible(b.tipo)?1:0,opacity:0.5,forceOrbit:true,scale:1};
      else overrides[b.id]={visible:0,opacity:1,scale:1};
    });
  } else if(crewFilter){
    const members=byCrew[crewFilter]||[];
    const memberIds=members.map(m=>m.id);
    const showCollabs=document.getElementById('flt-collab').checked;
    const collabNames=getCrewCollabNames(members,memberIds);
    ARTISTS.forEach(a=>{
      const isMember=memberIds.includes(a.id);
      const isCollab=showCollabs&&collabNames.has(a.nombre);
      if(isMember) overrides[a.id]={visible:1,opacity:1,forceOrbit:true,scale:1};
      else if(isCollab) overrides[a.id]={visible:1,opacity:0.35,forceOrbit:true,scale:1};
      else overrides[a.id]={visible:0,opacity:1,scale:1};
    });
  } else if(expandHint&&expandHint.onlyIds){
    ARTISTS.forEach(a=>{
      overrides[a.id]={visible:expandHint.onlyIds.includes(a.id)?1:0,opacity:1,scale:1};
    });
  }
  return overrides;
}

function collapseAllClusters(){
  Object.entries(clusters).forEach(([barrio,cl])=>{
    if(!cl.expanded)return;
    cl.expanded=false;
  });
  clusterZoomBefore=null;
  refreshArtistLayer({});
  refreshClusterLayer();
}

const _tip = document.createElement('div');
_tip.className='mtt';_tip.id='mtt-global';
document.getElementById('map').appendChild(_tip);

// Avatar flotante (NUEVO LAZY LOAD)
const _hoverAv = document.createElement('div');
_hoverAv.id = 'hover-avatar';
_hoverAv.style.cssText = 'position:absolute; width:36px; height:36px; border-radius:50%; background-size:cover; background-position:center; pointer-events:none; display:none; z-index:10; border:2px solid; transform:translate(-50%, -50%) scale(0.5); transition: transform 0.1s ease-out;';
document.getElementById('map').appendChild(_hoverAv);

let _tipArtist=null;
function showTip(a, px, py) {
  // Radio base según zoom, multiplicado por scale del artista
  const zoom = map.getZoom();
  const baseRadius = 6 + (zoom - 10) * (9 - 6) / (16 - 10); // interpola igual que Mapbox
  const scale = (currentOverrides[a.id] && currentOverrides[a.id].scale) || 1;
  const radius = Math.max(6, baseRadius * scale);

  _tip.textContent = a.nombre;
  _tip.style.left = px + 'px';
  _tip.style.top  = (py - radius - 10) + 'px'; // 10px de margen sobre el borde del círculo
  _tip.classList.add('on');
  _tipArtist = a;
}
function hideTip(){_tip.classList.remove('on');_tipArtist=null;}

function isTypeVisible(tipo){
  if(tipo==='mc')return document.getElementById('flt-mc').checked;
  if(tipo==='prod')return document.getElementById('flt-prod').checked;
  if(tipo==='prod_mc')return document.getElementById('flt-pm').checked;
  return true;
}

let activeGeneroFilters=new Set(['__all__']);

function applyGeneroFilter(){
  const checked=Array.from(document.querySelectorAll('.flt-gen-cb:checked')).map(cb=>cb.value);
  const all=Array.from(document.querySelectorAll('.flt-gen-cb')).map(cb=>cb.value);
  // Si todos están chequeados, usar Set vacío especial para "mostrar todos"
  activeGeneroFilters = checked.length === all.length ? new Set(['__all__']) : new Set(checked);
  refreshArtistLayer({});
  refreshClusterLayer();
}

function isGeneroVisible(a){
  if(activeGeneroFilters.has('__all__'))return true; // todos chequeados = mostrar todos
  if(activeGeneroFilters.size===0)return false; // ninguno chequeado = ocultar todos
  const ag=a.generos||[];
  if(ag.length===0)return true; // artista sin género = siempre visible
  return ag.some(g=>activeGeneroFilters.has(g));
}

function collapseClusterOf(barrio){
  const cl=clusters[barrio];if(!cl||!cl.expanded)return;
  cl.expanded=false;
  refreshArtistLayer({});refreshClusterLayer();
}

function ensureArtistVisible(a){
  const cl=clusters[a.barrio];
  if(!cl)return;
  if(!cl.expanded)expandCluster(a.barrio,[a.id]);
}

function checkClusterCollapse(){
  if(_fitInProgress) return;
  if(selId||crewFilter) return;
  if(document.getElementById('bp')&&document.getElementById('bp').classList.contains('open')) return;
  if(clusterZoomBefore!==null&&map.getZoom()<clusterZoomBefore-0.5){
    collapseAllClusters();
  }
}

function _doRedrawMapLines(){
  if(crewFilter){
    const members=byCrew[crewFilter]||[];
    let features = getCrewLineFeatures(members);
    
    if(document.getElementById('flt-collab').checked){
      const memberIds=members.map(m=>m.id);
      const collabNames=getCrewCollabNames(members,memberIds);
      members.forEach(m=>{
        const mLL=getArtistLngLat(m, true);
        const mCollabs=getCollabArtists(m).filter(c=>!memberIds.includes(c.id)&&collabNames.has(c.nombre));
        mCollabs.forEach(c=>{
          const cLL=getArtistLngLat(c, true);
          features.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[mLL.lng, mLL.lat], [cLL.lng, cLL.lat]] },
              properties: { color: '#777777', width: 1.5 }
          });
        });
      });
    }
    if(map.getSource('map-lines')) map.getSource('map-lines').setData({type: 'FeatureCollection', features});
    return;
  }
  
  const id = selId || currentHoverId;
  if(id) {
      drawMapLines(id);
  } else {
      clearMapLines();
  }
}

function drawMapLines(fid){
  const a=byId[fid];if(!a)return;
  const features = [];
  const aForceOrbit = currentOverrides[a.id] ? currentOverrides[a.id].forceOrbit : false;
  const aLL = getArtistLngLat(a, aForceOrbit);
  
  ARTISTS.forEach(b=>{
    if(b.id===fid)return;
    const ic=a.crew&&b.crew&&a.crew===b.crew;
    const ico=areCollabs(a,b);
    if(!ic&&!ico)return;
    
    const bForceOrbit = currentOverrides[b.id] ? currentOverrides[b.id].forceOrbit : false;
    const bLL=getArtistLngLat(b, bForceOrbit);
    
    features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[aLL.lng, aLL.lat], [bLL.lng, bLL.lat]] },
        properties: { color: ic ? '#DC3137' : '#777777', width: ic ? 2 : 1.5 }
    });
  });
  if(map.getSource('map-lines')) map.getSource('map-lines').setData({type: 'FeatureCollection', features});
}

function clearMapLines(){
  if(map.getSource('map-lines')) {
    map.getSource('map-lines').setData({type: 'FeatureCollection', features: []});
  }
}

// ── SELECT ARTIST ────────────────────────────────
function selectArtist(id){
  selId=id;currentHoverId=null;
  const a=byId[id];
  ensureArtistVisible(a);
  ARTISTS.forEach(b=>{
    if(b.id===id)return;
    const ic=a.crew&&b.crew&&a.crew===b.crew;
    const ico=areCollabs(a,b);
    if(ic||ico)ensureArtistVisible(b);
  });
  
  const pos = getArtistLngLat(a);
  if(curTab==='map'){
    _fitInProgress=true;
    map.flyTo({center:[pos.lng, pos.lat],zoom:Math.max(map.getZoom(),13),duration:600});
  }
  
  highlightBarrio(a.barrio);
  const _overrides={};
  ARTISTS.forEach(b=>{
    const ic=a.crew&&b.crew&&a.crew===b.crew;
    const ico=areCollabs(a,b);
    if(b.id===id) _overrides[b.id]={visible:1,opacity:1,scale:1.5,forceOrbit:true};
    else if(ic||ico) _overrides[b.id]={visible:isTypeVisible(b.tipo)?1:0,opacity:0.5,scale:1,forceOrbit:true};
    else _overrides[b.id]={visible:0,opacity:1,scale:1};
  });
  refreshArtistLayer(_overrides);
  refreshClusterLayer();
  closeBPSilent();closeCPSilent();
  _doRedrawMapLines();
  if(curTab==='col'){applyCollabState();requestAnimationFrame(drawCollabLines);}
  fillAP(a);
  document.getElementById('ap').classList.add('open');
  document.getElementById('flt').classList.add('sh','hidden-flt');
  const _sbs=document.getElementById('sb-s');if(_sbs)_sbs.textContent='// '+a.nombre;
  // Mostrar avatar sobre el marker cuando se selecciona
  // Usamos moveend para posicionarlo correctamente después del flyTo
  if(a.avatarSrc) {
    _hoverAv._lastArtistId = a.id;
    _hoverAv.style.backgroundImage = `url(${a.avatarSrc})`;
    _hoverAv.style.borderColor = TC[a.tipo] || '#ffffff';
    _hoverAv.style.transform = 'translate(-50%, -50%) scale(1)';
    _hoverAv.style.display = 'block';
    // Posición inicial (se actualizará en cada frame del flyTo via map.on('move'))
    const isForced = _overrides[a.id] ? _overrides[a.id].forceOrbit : false;
    const aLL = getArtistLngLat(a, isForced);
    const selPx = map.project([aLL.lng, aLL.lat]);
    _hoverAv.style.left = selPx.x + 'px';
    _hoverAv.style.top  = selPx.y + 'px';
  } else {
    _hoverAv.style.display = 'none';
    _hoverAv._lastArtistId = null;
  }
}

function fillAP(a){
  // ── CONTROL DE PERMISOS EN PANEL DE ARTISTA ──
  const _canEdit = window.authCan ? window.authCan.editArtist(a._dbId) : false;
  const _editBtn = document.getElementById('p-edit-btn');
  if(_editBtn) _editBtn.style.display = _canEdit ? '' : 'none';
  const _dba = document.getElementById('disco-btn-add');
  const _dbe = document.getElementById('disco-btn-edit');
  if(_dba) _dba.style.display = _canEdit ? '' : 'none';
  if(_dbe) _dbe.style.display = _canEdit ? '' : 'none';
  // ─────────────────────────────────────────────
  const av=document.getElementById('p-av');
  if(a.avatarSrc)av.innerHTML='<img src="'+a.avatarSrc+'" alt="">';else av.textContent=a.iniciales||(a.nombre.slice(0,2).toUpperCase());
  av.style.borderColor=TC[a.tipo]||'#DC3137';
  document.getElementById('p-nm').textContent=a.nombre;
  const bclass=a.tipo==='prod_mc'?'bpm':('b'+a.tipo);
  document.getElementById('p-bd').innerHTML='<span class="pbdg '+bclass+'">'+(a.tipoLabel||TL[a.tipo]||a.tipo)+'</span>';
  const brEl=document.getElementById('p-br');
  brEl.innerHTML='<span style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted" id="p-br-link">'+cleanNm(a.barrio)+'</span>';
  document.getElementById('p-br-link').onclick=function(ev){ev.stopPropagation();openBarrioFromArtist(a.barrio);};
  document.getElementById('p-ci').textContent=a.ciudad+(a.provincia&&a.provincia!=='CABA'?', '+a.provincia:'');
  // Crew — hide if empty
  const crWrap=document.getElementById('p-cr').closest('div[id]')||document.getElementById('p-cr').parentElement;
  const crEl=document.getElementById('p-cr');
  if(a.crew){
    crEl.innerHTML='<span style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted" id="p-cr-link">'+a.crew+'</span>';
    document.getElementById('p-cr-link').onclick=function(ev){ev.stopPropagation();openCrewFromArtist(a.crew);};
    crEl.closest('div').style.display='';
  } else {
    crEl.closest('div').style.display='none';
  }
  // Géneros del artista
  const gnDiv=document.getElementById('p-gn');
  if(gnDiv){
    const gnList=a.generos&&a.generos.length?a.generos:[];
    if(gnList.length){
      gnDiv.innerHTML=gnList.map(g=>'<span style="font-size:9px;border:1px solid var(--pb);padding:2px 7px;margin-right:4px;margin-bottom:4px;display:inline-block;letter-spacing:.5px">'+g+'</span>').join('');
      gnDiv.closest('div').style.display='';
    } else {
      gnDiv.closest('div').style.display='none';
    }
  }
  // Descripción — hide if empty
  const deEl=document.getElementById('p-de');
  deEl.textContent=a.descripcion||'';
  deEl.closest('div').style.display=a.descripcion?'':'none';
  // Links — hide if none
  const lk=document.getElementById('p-lk');lk.innerHTML='';
  [['instagram','◈','IG'],['youtube','▶','YT'],['spotify','♫','SPT'],['soundcloud','◎','SC'],['genius','✦','GNS']].forEach(([k,ic,lb])=>{
    if(a[k]){const el=document.createElement('a');el.href=a[k];el.target='_blank';el.rel='noopener';el.className='plk';el.innerHTML=ic+' '+lb;lk.appendChild(el);}
  });
  lk.closest('div').style.display=lk.children.length?'':'none';
  // Manager — hide if empty
  const mgDiv=document.getElementById('p-mg'),mgC=document.getElementById('p-mg-c');
  if(a.manager&&(a.manager.nombre||a.manager.email||a.manager.instagram)){
    let mh='';
    if(a.manager.nombre)mh+='<div>'+a.manager.nombre+'</div>';
    if(a.manager.email)mh+='<div><a href="mailto:'+a.manager.email+'" style="color:var(--red)">'+a.manager.email+'</a></div>';
    if(a.manager.instagram)mh+='<div><a href="'+a.manager.instagram+'" target="_blank" rel="noopener" style="color:var(--red)">◈ Instagram</a></div>';
    mgC.innerHTML=mh;mgDiv.style.display='';
  } else {
    mgDiv.style.display='none';
  }
  // Entrevista
  const yw=document.getElementById('p-yw'),yf=document.getElementById('p-yf');
  if(a.entrevista){yf.src='https://www.youtube.com/embed/'+a.entrevista;yw.style.display='block';}
  else{yf.src='';yw.style.display='none';}
  // Discografía
  fillDiscoSection(a);
  // Colabos — AL FINAL, hide if none
  const cw=document.getElementById('p-cw'),cl=document.getElementById('p-cl');
  cl.innerHTML='';
  const collabArtists=getCollabArtists(a);
  if(collabArtists.length){
    collabArtists.forEach(c=>{
      const row=mkRow(c,()=>{closeAP();selectArtist(c.id);});
      row.addEventListener('mouseenter',()=>{
        const _ov={}; _ov[c.id]={visible:1,opacity:1,scale:1}; refreshArtistLayer(Object.assign({},_buildOverridesForCurrentState(),_ov));
      });
      row.addEventListener('mouseleave',()=>{
        refreshArtistLayer(_buildOverridesForCurrentState());
      });
      cl.appendChild(row);
    });
    cw.style.display='';
  } else {
    cw.style.display='none';
  }
}

function closeAP(collapse = true){
  selId=null;clearMapLines();clearBarrioHighlight();
  if(collapse) collapseAllClusters();
  refreshArtistLayer({});refreshClusterLayer();
  document.getElementById('ap').classList.remove('open');
  document.getElementById('flt').classList.remove('sh','hidden-flt');
  document.getElementById('p-yf').src='';const _sbs2=document.getElementById('sb-s');if(_sbs2)_sbs2.textContent='';
  _hoverAv.style.display = 'none';
  _hoverAv._lastArtistId = null;
}

function closeAPSilent(){document.getElementById('ap').classList.remove('open');document.getElementById('p-yf').src='';}

// ── BARRIO / LOC PANEL ───────────────────────────
function openBP(fid,props,src,sublabel){
  closeAP(false); 
  if(crewFilter){
    crewFilter=null;
    crewBarrioFeats.forEach(bf=>{
      try{map.setFeatureState({source:bf.src,id:bf.id},{selected:false});}catch(e){}
    });
    crewBarrioFeats=[];
    clearMapLines();
    refreshArtistLayer({});refreshClusterLayer();
  }
  if (selLoc) map.setFeatureState({source:selLoc.src,id:selLoc.id},{selected:false});
  if(selId){
    selId=null;clearMapLines();clearBarrioHighlight();
    refreshArtistLayer({});refreshClusterLayer();
    const _sbs3=document.getElementById('sb-s');if(_sbs3)_sbs3.textContent='';
  }
  if(selBF!==null){try{map.setFeatureState({source:selBF.src,id:selBF.id},{selected:false,hover:false});}catch(e){}}
  selBF={id:fid,src};
  try{map.setFeatureState({source:src,id:fid},{selected:true});}catch(e){}
  const nombre=props.nombre||props.NOMBRE||'';
  document.getElementById('bp-n').textContent=cleanNm(nombre).toUpperCase();
  document.getElementById('bp-l').textContent=props.subtitulo||sublabel||'Ciudad Autónoma de Buenos Aires';
  const lst=document.getElementById('bp-ls');lst.innerHTML='';
  // Para localidades duplicadas el artista tiene barrio="Nombre (Partido)" → buscar también esas keys
  const _bpDpto=(props.subtitulo||sublabel||'');
  const _bpArtistas=[
    ...(byBarrio[nombre]||[]),
    ...Object.keys(byBarrio)
      .filter(k=>{
        const pm=k.match(/^(.+?)\s*\((.+)\)$/);
        // Matchear si el nombre coincide Y (si tenemos dpto, que coincida; sino aceptar cualquiera)
        return pm && pm[1].trim()===nombre && (!_bpDpto||pm[2].trim().toLowerCase()===_bpDpto.toLowerCase());
      })
      .flatMap(k=>byBarrio[k])
  ];
  const _bpSeen=new Set();
  const _bpUniq=_bpArtistas.filter(a=>{if(_bpSeen.has(a.id))return false;_bpSeen.add(a.id);return true;});
  _bpUniq.forEach(a=>{
    let _rowClicked=false;
    const row=mkRow(a,()=>{_rowClicked=true;closeBPSilent();selectArtist(a.id);});
    row.addEventListener('mouseenter',()=>{ _rowClicked=false;drawMapLines(a.id); });
    row.addEventListener('mouseleave',()=>{ if(!_rowClicked)clearMapLines(); });
    lst.appendChild(row);
  });
  if(!lst.children.length)lst.innerHTML='<div class="mpty">Sin artistas registrados.</div>';
  closeAPSilent();closeCPSilent();
  document.getElementById('bp').classList.add('open');document.getElementById('flt').classList.add('sh');
}

function closeBP(){
  if(selBF!==null){try{map.setFeatureState({source:selBF.src,id:selBF.id},{selected:false,hover:false});}catch(e){} selBF=null;}
  document.getElementById('bp').classList.remove('open');document.getElementById('flt').classList.remove('sh');
  collapseAllClusters();
}
function closeBPSilent(){
  if(selBF!==null){try{map.setFeatureState({source:selBF.src,id:selBF.id},{selected:false,hover:false});}catch(e){} selBF=null;}
  document.getElementById('bp').classList.remove('open');
}

// ── CREW PANEL ───────────────────────────────────
function openCP(name){
  document.getElementById('cp-n').textContent=name.toUpperCase();
  document.getElementById('cp-d').textContent=CREW_DESCS[name]||'Sin descripción disponible.';
  const lst=document.getElementById('cp-ls');lst.innerHTML='';
  (byCrew[name]||[]).forEach(a=>lst.appendChild(mkRow(a,()=>{closeCP();selectArtist(a.id);})));
  if(!lst.children.length)lst.innerHTML='<div class="mpty">Sin miembros registrados.</div>';
  closeAPSilent();closeBPSilent();
  document.getElementById('cp').classList.add('open');document.getElementById('flt').classList.add('sh');
  // Botón editar crew
  let editBtn = document.getElementById('cp-edit-btn');
  if(!editBtn){
    editBtn = document.createElement('button');
    editBtn.id = 'cp-edit-btn';
    editBtn.className = 'madd';
    editBtn.style.cssText = 'margin-top:12px;width:100%;font-size:10px;';
    editBtn.textContent = '✎ EDITAR CREW';
    document.getElementById('cp').querySelector('.pn-body, .panel-body, #cp-ls')
      .parentNode.appendChild(editBtn);
  }
  editBtn.onclick = () => openEditCrew(name);
  // Ocultar para guests y espectadores
  const _crewRole = window.AUTH?.user?.role;
  editBtn.style.display = (_crewRole === 'admin' || _crewRole === 'manager' || _crewRole === 'artista') ? '' : 'none';
}

function openEditCrew(name){
  // Guard de permisos
  if(!window.AUTH?.user) return;
  const _r = window.AUTH.user.role;
  if(_r === 'espectador' || _r === 'pending_manager') return;
  // Crear modal de edición de crew si no existe
  let modal = document.getElementById('crew-edit-mov');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'crew-edit-mov';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:var(--bg,#fff);width:420px;max-width:95vw;padding:24px;position:relative;max-height:85vh;overflow-y:auto;">
        <div style="font-family:var(--mono,'monospace');font-size:13px;font-weight:700;letter-spacing:2px;margin-bottom:16px">EDITAR CREW</div>
        <div style="font-size:10px;color:var(--t2,#aaa);letter-spacing:1px;margin-bottom:4px">NOMBRE</div>
        <input id="ce-nombre" class="finp" style="width:100%;margin-bottom:14px;box-sizing:border-box" placeholder="Nombre de la crew">
        <div style="font-size:10px;color:var(--t2,#aaa);letter-spacing:1px;margin-bottom:4px">DESCRIPCIÓN</div>
        <textarea id="ce-desc" class="finp" rows="2" style="width:100%;margin-bottom:14px;box-sizing:border-box;resize:vertical" placeholder="Descripción de la crew"></textarea>
        <div style="font-size:10px;color:var(--t2,#aaa);letter-spacing:1px;margin-bottom:6px">MIEMBROS</div>
        <div id="ce-members-list" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:8px;margin-bottom:14px;position:relative">
          <input id="ce-add-member" class="finp" style="flex:1" placeholder="Buscar artista para agregar...">
          <div id="ce-add-member-l" class="cbo-list" style="position:absolute;top:100%;left:0;right:0;background:var(--bg,#fff);border:1px solid var(--pb,#eee);z-index:10;display:none;max-height:160px;overflow-y:auto;"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="closeEditCrew()" style="background:none;border:1px solid var(--pb,#eee);padding:7px 16px;cursor:pointer;font-family:var(--mono,'monospace');font-size:10px;letter-spacing:1px">CANCELAR</button>
          <button id="ce-submit" class="madd" onclick="submitEditCrew()">GUARDAR</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    // Combo de búsqueda de artistas
    const inp = document.getElementById('ce-add-member');
    const lst2 = document.getElementById('ce-add-member-l');
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      if(!q){lst2.style.display='none';return;}
      const matches = ARTISTS.filter(a => a.nombre.toLowerCase().includes(q) && !(window._ceCurrentMembers||[]).includes(a.id)).slice(0,8);
      if(!matches.length){lst2.style.display='none';return;}
      lst2.innerHTML = '';
      matches.forEach(a => {
        const d = document.createElement('div');
        d.className = 'cbo';
        d.textContent = a.nombre + ' · ' + (a.barrio||'');
        d.addEventListener('mousedown', e => {
          e.preventDefault();
          window._ceCurrentMembers = window._ceCurrentMembers || [];
          if(!window._ceCurrentMembers.includes(a.id)) window._ceCurrentMembers.push(a.id);
          inp.value = '';
          lst2.style.display = 'none';
          renderCEMembers();
        });
        lst2.appendChild(d);
      });
      lst2.style.display = 'block';
    });
    inp.addEventListener('blur', () => setTimeout(()=>lst2.style.display='none', 150));
  }

  // Poblar el modal con datos actuales
  const members = byCrew[name] || [];
  window._ceEditingCrew = name;
  window._ceCurrentMembers = members.map(m => m.id);
  document.getElementById('ce-nombre').value = name;
  document.getElementById('ce-desc').value = CREW_DESCS[name] || '';
  renderCEMembers();
  modal.style.display = 'flex';
}

function renderCEMembers(){
  const lst = document.getElementById('ce-members-list');
  if(!lst) return;
  const ids = window._ceCurrentMembers || [];
  if(!ids.length){ lst.innerHTML = '<div style="font-size:10px;color:var(--t2,#aaa);padding:4px 0">Sin miembros.</div>'; return; }
  lst.innerHTML = '';
  ids.forEach(id => {
    const a = byId[id]; if(!a) return;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--pb,#f0f0f0);font-size:11px;';
    row.innerHTML = `<span>${a.nombre} <span style="color:var(--t2,#aaa);font-size:10px">· ${a.barrio||''}</span></span>`;
    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.style.cssText = 'background:none;border:none;cursor:pointer;color:#c0392b;font-size:14px;padding:0 4px;';
    rm.onclick = () => {
      window._ceCurrentMembers = window._ceCurrentMembers.filter(x => x !== id);
      renderCEMembers();
    };
    row.appendChild(rm);
    lst.appendChild(row);
  });
}

function closeEditCrew(){
  const modal = document.getElementById('crew-edit-mov');
  if(modal) modal.style.display = 'none';
}

async function submitEditCrew(){
  const oldName = window._ceEditingCrew;
  const newName = (document.getElementById('ce-nombre').value || '').trim();
  const newDesc = (document.getElementById('ce-desc').value || '').trim();
  const newMemberIds = window._ceCurrentMembers || [];
  if(!newName){ alert('El nombre es obligatorio.'); return; }

  // Actualizar CREW_DESCS
  if(oldName !== newName) delete CREW_DESCS[oldName];
  CREW_DESCS[newName] = newDesc;

  // Actualizar crew en todos los artistas
  ARTISTS.forEach(a => {
    const wasMember = a.crew === oldName;
    const isMember = newMemberIds.includes(a.id);
    if(isMember) {
      a.crew = newName;
    } else if(wasMember) {
      a.crew = null;
    }
  });

  reindex(); sidx = buildSI(); buildClusters();
  closeEditCrew();

  // Persistir cambios en Turso
  const saves = ARTISTS
    .filter(a => newMemberIds.includes(a.id) || a.crew === null && byCrew[oldName]?.some(m=>m.id===a.id))
    .map(a => a._dbId ? tursoRun('UPDATE artists SET crew=? WHERE id=?',[a.crew||'',Number(a._dbId)]) : null)
    .filter(Boolean);
  await Promise.all(saves);

  // Reabrir el panel con el nuevo nombre
  closeCP();
  filterByCrew(newName);
}
function closeCP(){document.getElementById('cp').classList.remove('open');document.getElementById('flt').classList.remove('sh');clearCrewFilter();const _fgw=document.getElementById('flt-gen-wrap');if(_fgw)_fgw.style.display='';}
function closeCPSilent(){document.getElementById('cp').classList.remove('open');}
function closeAll(){closeAP(false);closeBP();closeCP();collapseAllClusters();}

function openCrewFromArtist(crewName){
  closeAP(false);
  if(curTab!=='map')switchTab('map');
  filterByCrew(crewName);
  const members=byCrew[crewName]||[];
  if(members.length>1){
    const bounds=new mapboxgl.LngLatBounds();
    members.forEach(a=>bounds.extend([a.lng,a.lat]));
    _fitInProgress=true;
    map.fitBounds(bounds,{padding:{top:60,bottom:60,left:60,right:380},duration:700,maxZoom:14});
  } else if(members.length===1){
    _fitInProgress=true;
    map.flyTo({center:[members[0].lng,members[0].lat],zoom:13,duration:700});
  }
}

// ── CREW FILTER (from search) ───────────────────────────────
let crewFilter=null;
let crewBarrioFeats=[];

function filterByCrew(crewName){
  clearCrewFilter();
  crewFilter=crewName;
  const members=byCrew[crewName]||[];
  const memberIds=members.map(m=>m.id);
  const expandedBarrios=new Set();
  members.forEach(a=>{
    const cl=clusters[a.barrio];
    if(cl){
      expandCluster(a.barrio,memberIds);
      expandedBarrios.add(a.barrio);
    }
  });
  const collabNames=getCrewCollabNames(members,memberIds);
  const _crewOverrides={};
  ARTISTS.forEach(a=>{
    const isMember=memberIds.includes(a.id);
    _crewOverrides[a.id]={visible:isMember?1:0,opacity:1,scale:1,forceOrbit:isMember};
  });
  refreshArtistLayer(_crewOverrides);
  refreshClusterLayer();
  members.forEach(a=>{
    const cabaIdx=GEO_CABA.features.findIndex(f=>(f.properties.nombre||'').toLowerCase()===a.barrio.toLowerCase());
    if(cabaIdx!==-1){
      crewBarrioFeats.push({src:'caba',id:cabaIdx});
      try{map.setFeatureState({source:'caba',id:cabaIdx},{selected:true});}catch(e){}
      return;
    }
    const _parenB=a.barrio.match(/^(.+?)\s*\((.+)\)$/);
    const locFeat=_parenB
      ? GEO_LOC.features.find(f=>{
          const fn=(f.properties.NOMBRE||f.properties.nombre||'').toLowerCase().trim();
          const fd=(f.properties.DPTO||f.properties.dpto||'').toLowerCase().trim();
          return fn===_parenB[1].toLowerCase().trim()&&fd===_parenB[2].toLowerCase().trim();
        })
      : GEO_LOC.features.find(f=>(f.properties.NOMBRE||f.properties.nombre||'').toLowerCase()===a.barrio.toLowerCase());
    if(locFeat){
      const locId=+locFeat.properties.CODIGO;
      crewBarrioFeats.push({src:'loc',id:locId});
      try{map.setFeatureState({source:'loc',id:locId},{selected:true});}catch(e){}
      return;
    }

  });
  
  _doRedrawMapLines(); 
  
  document.getElementById('flt-collab').checked=false;
  document.getElementById('flt-collab-row').style.display='flex';
  document.getElementById('flt-types').style.display='none';
  const _fgw=document.getElementById('flt-gen-wrap');if(_fgw)_fgw.style.display='none';
  openCP(crewName);
}

function getCrewLineFeatures(members){
  const features = [];
  if(members.length<2) return features;
  let edges=[];
  if(members.length<=5){
    for(let i=0;i<members.length;i++){
      for(let j=i+1;j<members.length;j++){
        edges.push([i,j]);
      }
    }
  } else {
    edges=computeMST(members);
  }
  edges.forEach(([i,j])=>{
    const a=members[i], b=members[j];
    const aLL=getArtistLngLat(a, true), bLL=getArtistLngLat(b, true);
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[aLL.lng, aLL.lat], [bLL.lng, bLL.lat]] },
      properties: { color: '#DC3137', width: 2 }
    });
  });
  return features;
}

function computeMST(members){
  const n=members.length;
  const dist=(a,b)=>Math.pow(a.lng-b.lng,2)+Math.pow(a.lat-b.lat,2);
  const inTree=new Array(n).fill(false);
  const minEdge=new Array(n).fill(Infinity);
  const minFrom=new Array(n).fill(-1);
  const edges=[];
  minEdge[0]=0;
  for(let iter=0;iter<n;iter++){
    let u=-1;
    for(let i=0;i<n;i++){
      if(!inTree[i]&&(u===-1||minEdge[i]<minEdge[u]))u=i;
    }
    inTree[u]=true;
    if(minFrom[u]!==-1)edges.push([minFrom[u],u]);
    for(let v=0;v<n;v++){
      if(!inTree[v]){
        const d=dist(members[u],members[v]);
        if(d<minEdge[v]){minEdge[v]=d;minFrom[v]=u;}
      }
    }
  }
  return edges;
}

function clearCrewFilter(){
  crewFilter=null;
  crewBarrioFeats.forEach(bf=>{
    try{map.setFeatureState({source:bf.src,id:bf.id},{selected:false});}catch(e){}
  });
  crewBarrioFeats=[];
  clearMapLines();
  collapseAllClusters();
  refreshArtistLayer({});refreshClusterLayer();
  collapseAllClusters();
  document.getElementById('flt-collab-row').style.display='none';
  document.getElementById('flt-collab').checked=false;
  document.getElementById('flt-types').style.display='';
}

function toggleCrewCollabs(){
  if(!crewFilter)return;
  const show=document.getElementById('flt-collab').checked;
  const members=byCrew[crewFilter]||[];
  const memberIds=members.map(m=>m.id);
  const collabNames=getCrewCollabNames(members,memberIds);
  const _tccOverrides={};
  ARTISTS.forEach(a=>{
    if(memberIds.includes(a.id)) {
        _tccOverrides[a.id] = {visible: 1, opacity: 1, forceOrbit: true, scale: 1};
        return;
    }
    const isCollab=collabNames.has(a.nombre);
    _tccOverrides[a.id]=show&&isCollab?{visible:1,opacity:0.35,forceOrbit:true,scale:1}:{visible:0,opacity:1,scale:1};
  });
  refreshArtistLayer(_tccOverrides);
  refreshClusterLayer(); 
  
  _doRedrawMapLines(); 
}

function mkRow(a,cb){
  const row=document.createElement('div');row.className='mrow';
  const pfp=document.createElement('div');pfp.className='mpfp';pfp.style.border='2px solid '+(TC[a.tipo]||TC.mc);pfp.style.color=TC[a.tipo]||TC.mc;
  if(a.avatarSrc)pfp.innerHTML='<img src="'+a.avatarSrc+'" alt="">';else pfp.textContent=a.iniciales||(a.nombre.slice(0,2).toUpperCase());
  const info=document.createElement('div');info.innerHTML='<div class="mn">'+a.nombre+'</div><div class="mt">'+(a.tipoLabel||TL[a.tipo]||a.tipo)+' · '+(a.barrio||'Sin barrio')+'</div>';
  row.appendChild(pfp);row.appendChild(info);row.addEventListener('click',cb);return row;
}

// ── SEARCH ───────────────────────────────────────
function norm(s){return(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}
function hl(t,q){const i=norm(t).indexOf(norm(q));if(i===-1)return t;return t.slice(0,i)+'<span class="hl">'+t.slice(i,i+q.length)+'</span>'+t.slice(i+q.length);}

function buildSI(){
  const idx=[];
  ARTISTS.forEach(a=>idx.push({type:'artist',id:a.id,terms:[a.nombre,a.crew||'',a.barrio,TL[a.tipo]||''].map(s=>(s||'').toLowerCase()),data:a}));
  [...new Set(ARTISTS.map(a=>a.crew).filter(Boolean))].forEach(c=>idx.push({type:'crew',id:c,terms:[c.toLowerCase()],data:{nombre:c,members:byCrew[c]||[]}}));
  GEO_CABA.features.forEach(f=>{const n=f.properties.nombre;idx.push({type:'barrio',id:n,terms:[n.toLowerCase()],data:{nombre:n,zona:'CABA'}});});
  GEO_LOC.features.forEach(f=>{
    const p=f.properties;const n=p.NOMBRE||p.nombre||'';const dpto=p.DPTO||p.dpto||'';
    // Usar el mismo key único que ALL_LOC_DATA para localidades con nombre duplicado
    const locEntry=(window.ALL_LOC_DATA||[]).find(o=>o.nombre===n&&o.hint===dpto&&o.key!==n);
    const locId=locEntry?locEntry.key:n;  // "Gerli (Avellaneda)" si duplicado, "Quilmes" si único
    idx.push({type:'localidad',id:locId,terms:[n.toLowerCase(),dpto.toLowerCase()],data:{nombre:n,dpto,zona:'Conurbano',key:locId}});
  });
  
  GEO_CUARTO.features.forEach(f=>{
    const n=f.properties.NOMBRE; 
    if(n) idx.push({type:'partido',id:n,terms:[n.toLowerCase()],data:{nombre:n,zona:'Conurbano'}});
  });
  
  return idx;
}

const SI=document.getElementById('si'),SR=document.getElementById('sr');
let sidx=buildSI();

SI.addEventListener('input',()=>{
  const q=SI.value.trim();
  if(!q){SR.classList.remove('on');return;}
  const qn=norm(q);
  const m=sidx.filter(x=>x.terms.some(t=>norm(t).includes(qn))).slice(0,14);
  if(!m.length){SR.innerHTML='<div style="padding:8px 12px;font-size:11px;color:#aaa">Sin resultados</div>';SR.classList.add('on');return;}
  const ar=m.filter(x=>x.type==='artist'),cr=m.filter(x=>x.type==='crew'),br=m.filter(x=>x.type==='barrio'),lo=m.filter(x=>x.type==='localidad'),pa=m.filter(x=>x.type==='partido');
  let h='';
  if(ar.length){
    h+='<div class="sri-cat">Artistas</div>';
    ar.forEach(x=>{const a=x.data;
      h+='<div class="sri" data-type="artist" data-id="'+a.id+'">'
        +'<div class="sri-pfp" style="border:2px solid '+TC[a.tipo]+';color:'+TC[a.tipo]+'">'+(a.iniciales||a.nombre.slice(0,2))+'</div>'
        +'<div><div class="sri-n">'+hl(a.nombre,q)+'</div><div class="sri-m">'+TL[a.tipo]+' · '+hl(cleanNm(a.barrio),q)+'</div></div></div>';    });
  }
  if(cr.length){
    h+='<div class="sri-cat">Crews</div>';
    cr.forEach(x=>{const crew=x.data;
      h+='<div class="sri" data-type="crew" data-id="'+crew.nombre+'">'
        +'<div class="sri-pfp" style="border:2px solid var(--red);color:var(--red);font-size:9px">CREW</div>'
        +'<div><div class="sri-n">'+hl(crew.nombre,q)+'</div><div class="sri-m">'+crew.members.length+' miembro'+(crew.members.length!==1?'s':'')+'</div></div></div>';
    });
  }
  if(br.length){
    h+='<div class="sri-cat">Barrios CABA</div>';
    br.forEach(x=>{const b=x.data;const cnt=(byBarrio[b.nombre]||[]).length;
      h+='<div class="sri" data-type="barrio" data-id="'+b.nombre+'">'
        +'<div class="sri-pfp" style="border:2px solid #aaa;color:#aaa;font-size:9px">BRR</div>'
        +'<div><div class="sri-n">'+hl(b.nombre,q)+'</div><div class="sri-m">CABA'+(cnt?' · '+cnt+' artista'+(cnt>1?'s':''):'')+' </div></div></div>';
    });
  }
  if(lo.length){
    h+='<div class="sri-cat">Localidades Conurbano</div>';
    lo.forEach(x=>{const l=x.data;const cnt=(byBarrio[l.nombre]||[]).length;
      h+='<div class="sri" data-type="localidad" data-id="'+(l.key||x.id||l.nombre)+'">'
        +'<div class="sri-pfp" style="border:2px solid #aaa;color:#aaa;font-size:9px">LOC</div>'
        +'<div><div class="sri-n">'+hl(cleanNm(l.nombre),q)+'</div><div class="sri-m">'+hl(l.dpto,q)+' · Conurbano'+(cnt?' · '+cnt+' artista'+(cnt>1?'s':''):'')+' </div></div></div>';    });
  }
  if(pa.length){
    h+='<div class="sri-cat">Partidos Conurbano</div>';
    pa.forEach(x=>{const p=x.data;
      h+='<div class="sri" data-type="partido" data-id="'+p.nombre+'">'
        +'<div class="sri-pfp" style="border:2px solid #666;color:#666;font-size:9px">PTD</div>'
        +'<div><div class="sri-n">'+hl(p.nombre,q)+'</div><div class="sri-m">Conurbano</div></div></div>';
    });
  }
  SR.innerHTML=h;
  SR.classList.add('on');
});

SR.addEventListener('click',e=>{
  const item=e.target.closest('.sri[data-type]');
  if(!item)return;
  const type=item.dataset.type;
  const id=item.dataset.id;
  SI.value='';
  SR.classList.remove('on');
  if(type==='artist'){
    const a=byId[id];
    if(!a)return;
    if(crewFilter){clearCrewFilter();closeCPSilent();}
    if(curTab==='col'){selectArtist(id);}
    else{
        const pos = getArtistLngLat(a);
        _fitInProgress=true;
        map.flyTo({center:[pos.lng, pos.lat],zoom:Math.max(map.getZoom(),13),duration:700});
        selectArtist(id);
    }
  } else if(type==='crew'){
    filterByCrew(id);
    const _crewMembers=byCrew[id]||[];
    if(_crewMembers.length>1){
      const _bounds=new mapboxgl.LngLatBounds();
      _crewMembers.forEach(a=>_bounds.extend([a.lng,a.lat]));
      _fitInProgress=true;
      map.fitBounds(_bounds,{padding:{top:60,bottom:60,left:60,right:380},duration:700,maxZoom:14});
    } else if(_crewMembers.length===1){
      _fitInProgress=true;
      map.flyTo({center:[_crewMembers[0].lng,_crewMembers[0].lat],zoom:13,duration:700});
    }
  } else if(type==='barrio'){
    if(curTab!=='map')switchTab('map');
    closeAll();
    
    const idx = GEO_CABA.features.findIndex(f=>(f.properties.nombre||'')===id);
    if(idx !== -1) openBP(idx, GEO_CABA.features[idx].properties, 'caba', 'Barrio de CABA');
    
    fitToLocation(id);
    if(clusters[id])expandCluster(id);
    
  } else if(type==='localidad'){
    if(curTab!=='map')switchTab('map');
    closeAll();
    // id puede ser "Gerli (Avellaneda)" para duplicados o "Quilmes" para únicos
    const _parenM = id.match(/^(.+?)\s*\((.+)\)$/);
    const _lf = _parenM
      ? GEO_LOC.features.find(f=>{
          const fn=(f.properties.NOMBRE||f.properties.nombre||'').toLowerCase().trim();
          const fd=(f.properties.DPTO||f.properties.dpto||'').toLowerCase().trim();
          return fn===_parenM[1].toLowerCase().trim() && fd===_parenM[2].toLowerCase().trim();
        })
      : GEO_LOC.features.find(f=>(f.properties.NOMBRE||f.properties.nombre||'')===id);
    if(_lf) {
      const p = _lf.properties;
      openBP(+p.CODIGO, {nombre: p.NOMBRE||p.nombre||'', subtitulo: p.DPTO||p.dpto||''}, 'loc', p.DPTO||p.dpto||'');
    }
    fitToLocation(id);
    if(clusters[id])expandCluster(id);
    
  } else if(type==='partido'){
    if(curTab!=='map')switchTab('map');
    closeAll();
    
    const idx = GEO_CUARTO.features.findIndex(f=>(f.properties.NOMBRE||f.properties.nombre||'')===id);
    if(idx !== -1) {
      const p = GEO_CUARTO.features[idx].properties;
      openBP(idx, {nombre: p.NOMBRE||p.nombre||'', subtitulo: 'Conurbano'}, 'cuarto', 'Conurbano');
    }
    
    fitToLocation(id);
    if(clusters[id])expandCluster(id);
  }
});

SI.addEventListener('keydown',e=>{if(e.key==='Escape'){SR.classList.remove('on');SI.blur();}});

document.addEventListener('click',e=>{if(!document.getElementById('sw').contains(e.target))SR.classList.remove('on');});
SI.addEventListener('keydown',e=>{if(e.key==='Escape'){SR.classList.remove('on');SI.blur();}});

// ── COMBOBOXES ────────────────────────────────────
function initCombo(inpId,lstId,getOpts,onSel,allowNew){
  const inp=document.getElementById(inpId);const lst=document.getElementById(lstId);
  function render(){
    const q=inp.value.trim();if(!q){lst.classList.remove('on');return;}
    const opts=getOpts(q);lst.innerHTML='';
    if(!opts.length){
      if(allowNew){const d=document.createElement('div');d.className='cbo';d.textContent='Agregar: "'+q+'"';d.addEventListener('mousedown',e=>{e.preventDefault();onSel(q,true);inp.value=q;lst.classList.remove('on');});lst.appendChild(d);}
      else{const d=document.createElement('div');d.className='cbo na';d.textContent='Sin resultados';lst.appendChild(d);}
    }else{
      opts.forEach(o=>{const d=document.createElement('div');d.className='cbo';d.textContent=o;d.addEventListener('mousedown',e=>{e.preventDefault();onSel(o,false);inp.value=o;lst.classList.remove('on');});lst.appendChild(d);});
      if(allowNew&&!opts.includes(q)){const d=document.createElement('div');d.className='cbo';d.style.borderTop='1px solid #f0f0f0';d.textContent='Agregar: "'+q+'"';d.addEventListener('mousedown',e=>{e.preventDefault();onSel(q,true);inp.value=q;lst.classList.remove('on');});lst.appendChild(d);}
    }
    lst.classList.add('on');
  }
  inp.addEventListener('input',render);
  inp.addEventListener('blur',()=>{setTimeout(()=>lst.classList.remove('on'),150);});
  inp.addEventListener('keydown',e=>{if(e.key==='Escape'){lst.classList.remove('on');inp.blur();}});
}
(function(){
  const inp=document.getElementById('f-br'),lst=document.getElementById('f-br-l');
  function render(){
    const q=inp.value.trim();if(!q){lst.classList.remove('on');return;}
    const ql=norm(q);
    const opts=(window.ALL_LOC_DATA||[]).filter(o=>norm(o.nombre).includes(ql)).slice(0,10);
    lst.innerHTML='';
    if(!opts.length){
      const d=document.createElement('div');d.className='cbo na';d.textContent='Sin resultados';lst.appendChild(d);
    } else {
      opts.forEach(o=>{
        const d=document.createElement('div');d.className='cbo';d.style.display='flex';d.style.justifyContent='space-between';d.style.alignItems='center';d.style.gap='8px';
        const nm=document.createElement('span');nm.textContent=cleanNm(o.nombre);
        const ht=document.createElement('span');ht.textContent=o.hint;ht.style.cssText='font-size:9px;color:#aaa;letter-spacing:1px;flex-shrink:0';
        d.appendChild(nm);d.appendChild(ht);
        d.addEventListener('mousedown',e=>{e.preventDefault();inp.value=cleanNm(o.key||o.nombre);document.getElementById('f-br-v').value=o.key||o.nombre;lst.classList.remove('on');});        lst.appendChild(d);
      });
    }
    lst.classList.add('on');
  }
  inp.addEventListener('input',render);
  inp.addEventListener('blur',()=>{setTimeout(()=>lst.classList.remove('on'),150);});
  inp.addEventListener('keydown',e=>{if(e.key==='Escape'){lst.classList.remove('on');inp.blur();}});
})();
initCombo('f-cr','f-cr-l',q=>[...new Set(ARTISTS.map(a=>a.crew).filter(Boolean))].filter(c=>c.toLowerCase().includes(q.toLowerCase())).slice(0,8),()=>{},true);
let selCollabs=[];
function renderCollabTags(){
  const wrap=document.getElementById('f-co-tags');wrap.innerHTML='';
  selCollabs.forEach(name=>{const tag=document.createElement('span');tag.className='ctag';tag.textContent=name;const x=document.createElement('span');x.className='ctag-x';x.textContent='×';x.addEventListener('click',()=>{selCollabs=selCollabs.filter(n=>n!==name);renderCollabTags();});tag.appendChild(x);wrap.appendChild(tag);});
  document.getElementById('f-co-v').value=selCollabs.join(',');
}
initCombo('f-co','f-co-l',q=>ARTISTS.map(a=>a.nombre).filter(n=>n.toLowerCase().includes(q.toLowerCase())&&!selCollabs.includes(n)).slice(0,8),val=>{if(!selCollabs.includes(val)){selCollabs.push(val);renderCollabTags();}setTimeout(()=>{document.getElementById('f-co').value='';},0);},false);

// ── AVATAR ────────────────────────────────────────
document.getElementById('av-in').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    const p=document.getElementById('av-pr');
    p.innerHTML='<img src="'+ev.target.result+'" alt="">';
    p._src=ev.target.result;
    // Clear URL field when a file is chosen
    const urlInp=document.getElementById('av-url');
    if(urlInp)urlInp.value='';
  };
  r.readAsDataURL(f);
});
function previewAvatarUrl(url){
  const p=document.getElementById('av-pr');
  if(!url){p.innerHTML='';p._src=null;return;}
  p.innerHTML='<img src="'+url+'" alt="" onerror="this.style.display:none">';
  p._src=url;
}

// ── DARK MODE ─────────────────────────────────────
let isDark=false;
function toggleDark(){
  isDark=!isDark;
  document.body.classList.toggle('dark',isDark);
  const btn=document.getElementById('dm-toggle');
  btn.innerHTML=isDark?'☀ LIGHT':'☽ DARK';
  
  const hlColor = isDark ? '#3d1d1d' : '#FFBFC1';

  if(map.isStyleLoaded()){
    map.setPaintProperty('bg','background-color',isDark?'#1a1a1a':'#f0f0f0');
    map.setPaintProperty('water','fill-color',isDark?'#000000':'#7DCAFD');
    map.setPaintProperty('bf','fill-color',['case',
      ['boolean',['feature-state','selected'],false], hlColor,
      ['boolean',['feature-state','hover'],false], hlColor,
      isDark?'#252525':'#e8e8e8']);
    map.setPaintProperty('loc-fill','fill-color',['case',
      ['boolean',['feature-state','selected'],false], hlColor,
      ['boolean',['feature-state','hover'],false], hlColor,
      isDark?'#222222':'#ebebeb']);
    map.setPaintProperty('cuarto-fill','fill-color',['case',
      ['boolean',['feature-state','selected'],false], hlColor,
      ['boolean',['feature-state','hover'],false], hlColor,
      'rgba(0,0,0,0)']);
    map.setPaintProperty('bl','line-color',isDark?'#444':'#bbb');
    map.setPaintProperty('loc-line','line-color',isDark?'#383838':'#c8c8c8');
    map.setPaintProperty('cuarto-line','line-color',isDark?'#555':'#666');
    map.setPaintProperty('part-line','line-color',isDark?'#555':'#666');
    
    if(map.getLayer('clusters-circle')){
      map.setPaintProperty('clusters-circle','circle-color','#DC3137');
    }
  }
}

// ── SPOTIFY IMPORT ───────────────────────────────────────────────────────────
const SPOTIFY_WORKER = 'https://jerga-spotify.osservatore.workers.dev';

async function spotifySearch(q) {
  const res = await fetch(`${SPOTIFY_WORKER}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.artists || [];
}

async function spotifyGetArtist(id) {
  const res = await fetch(`${SPOTIFY_WORKER}/artist/${id}`);
  if (!res.ok) return null;
  return await res.json();
}

async function spotifyImportArtist(spotifyId) {
  const btn = document.getElementById('sp-import-btn');
  if (btn) { btn.textContent = 'IMPORTANDO...'; btn.disabled = true; }
  const artist = await spotifyGetArtist(spotifyId);
  if (!artist) { if (btn) { btn.textContent = 'BUSCAR'; btn.disabled = false; } return; }

  // Nombre
  const nomEl = document.getElementById('f-nom');
  if (nomEl && !nomEl.value) nomEl.value = artist.name;

  // Avatar
  if (artist.image) {
    const p = document.getElementById('av-pr');
    p.innerHTML = `<img src="${artist.image}" alt="">`;
    p._src = artist.image;
    const avUrl = document.getElementById('av-url');
    if (avUrl) avUrl.value = artist.image;
  }

  // Spotify URL
  const spEl = document.getElementById('f-sp');
  if (spEl && !spEl.value && artist.spotify_url) spEl.value = artist.spotify_url;

  // Géneros
  const GENRE_MAP = {'trap':'Trap','hip hop':'Boom Bap','rap':'Boom Bap','boom bap':'Boom Bap','drill':'Drill','cloud rap':'Cloud Rap','detroit':'Detroit','memphis':'Memphis','pluggnb':'Plug','plug':'Plug','grimey':'Grimey','drumless':'Drumless'};
  const mappedGenres = new Set();
  (artist.genres || []).forEach(g => {
    const gl = g.toLowerCase();
    Object.entries(GENRE_MAP).forEach(([k, v]) => { if (gl.includes(k)) mappedGenres.add(v); });
  });
  if (mappedGenres.size > 0) {
    const fgw = document.getElementById('f-gen-wrap');
    if (fgw) { fgw.innerHTML = renderGenerosSelector('art', [...mappedGenres]); wireGenerosAdd('art'); }
  }

  // Discografía para importar al guardar
  if (artist.albums && artist.albums.length > 0) {
    window._spotifyImportedAlbums = artist.albums;
    const note = document.getElementById('sp-disco-note');
    if (note) { note.textContent = `✓ ${artist.albums.length} lanzamientos listos para importar`; note.style.display = ''; }
  }

  // Mostrar confirmación en el buscador
  const wrap = document.getElementById('sp-search-wrap');
  if (wrap) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #2a9d2a;background:rgba(42,157,42,.07)">
        ${artist.image_sm ? `<img src="${artist.image_sm}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0">` : ''}
        <div><div style="font-size:11px;color:var(--t1)">${artist.name}</div>
        <div style="font-size:9px;color:#2a9d2a;margin-top:2px">✓ Datos importados desde Spotify</div></div>
        <button onclick="resetSpotifyImport()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--tm);font-size:14px">✕</button>
      </div>`;
  }
}

function resetSpotifyImport() {
  window._spotifyImportedAlbums = null;
  const wrap = document.getElementById('sp-search-wrap');
  if (wrap) { wrap.innerHTML = buildSpotifySearchHTML(); wireSpotifySearch(); }
  const note = document.getElementById('sp-disco-note');
  if (note) note.style.display = 'none';
}

function buildSpotifySearchHTML() {
  return `
    <div style="position:relative">
      <input class="cbinp" id="sp-search-inp" type="text" placeholder="Buscá tu nombre en Spotify para pre-llenar..." autocomplete="off" style="padding-right:90px">
      <button id="sp-import-btn" onclick="doSpotifySearch()" style="position:absolute;right:0;top:0;height:100%;padding:0 12px;background:var(--red);border:none;color:#fff;font-family:var(--mono);font-size:9px;letter-spacing:1px;cursor:pointer">BUSCAR</button>
    </div>
    <div id="sp-results" style="display:none;border:1px solid var(--pb);border-top:none;max-height:200px;overflow-y:auto;background:var(--pbg)"></div>
    <div id="sp-disco-note" style="display:none;font-size:9px;color:#2a9d2a;letter-spacing:.5px;padding-top:4px"></div>`;
}

function wireSpotifySearch() {
  const inp = document.getElementById('sp-search-inp');
  if (!inp) return;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSpotifySearch(); } });
  // Cerrar resultados al hacer click fuera
  document.addEventListener('click', function _spClose(e) {
    const res = document.getElementById('sp-results');
    const wrap = document.getElementById('sp-search-wrap');
    if (res && wrap && !wrap.contains(e.target)) { res.style.display = 'none'; document.removeEventListener('click', _spClose); }
  });
}

async function doSpotifySearch() {
  const inp = document.getElementById('sp-search-inp');
  const results = document.getElementById('sp-results');
  const btn = document.getElementById('sp-import-btn');
  if (!inp || !results) return;
  const q = inp.value.trim();
  if (!q) return;
  btn.textContent = '...'; btn.disabled = true;
  const artists = await spotifySearch(q);
  btn.textContent = 'BUSCAR'; btn.disabled = false;
  if (!artists.length) {
    results.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:var(--tm)">Sin resultados</div>';
    results.style.display = 'block'; return;
  }
  results.innerHTML = artists.map(a => `
    <div onclick="spotifyImportArtist('${a.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--pb);transition:background .1s" onmouseover="this.style.background='rgba(220,49,55,.07)'" onmouseout="this.style.background=''">
      ${a.image_sm ? `<img src="${a.image_sm}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">` : '<div style="width:32px;height:32px;border-radius:50%;background:var(--pb);flex-shrink:0"></div>'}
      <div>
        <div style="font-size:11px;color:var(--t1)">${a.name}</div>
        <div style="font-size:9px;color:var(--tm);margin-top:1px">${a.followers.toLocaleString()} seguidores${a.genres.length ? ' · '+a.genres.slice(0,2).join(', ') : ''}</div>
      </div>
    </div>`).join('');
  results.style.display = 'block';
}
window.doSpotifySearch = doSpotifySearch;
window.spotifyImportArtist = spotifyImportArtist;
window.resetSpotifyImport = resetSpotifyImport;

function openModal(){
  selCollabs=[];
  window._spotifyImportedAlbums=null;
  document.getElementById('mov').classList.add('open');
  setTimeout(wireSpotifySearch, 50);
}
function closeModal(){document.getElementById('mov').classList.remove('open');resetModal();}
function resetModal(){
  ['f-nom','f-de','f-ig','f-yt','f-sp','f-sc','f-gn','f-en','f-br','f-cr','f-co','f-mg-nm','f-mg-em','f-mg-ig'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('f-tipo').value='';document.getElementById('f-br-v').value='';
  document.getElementById('f-tipo-display').innerHTML='<span style="color:#bbb">Seleccionar tipo</span>';
  selCollabs=[];renderCollabTags();
  const _fgw=document.getElementById('f-gen-wrap');if(_fgw){_fgw.innerHTML=renderGenerosSelector('art',[]);wireGenerosAdd('art');}
  const p=document.getElementById('av-pr');p.innerHTML='';delete p._src;const _avUrl=document.getElementById('av-url');if(_avUrl)_avUrl.value='';
  document.getElementById('mhdr-t').textContent='AGREGAR ARTISTA';
  const addBtn=document.getElementById('modal-submit');
  if(addBtn){addBtn.textContent='AGREGAR';addBtn.onclick=submitArtist;}
  editingId=null;
  const _mdel=document.getElementById('modal-delete');if(_mdel)_mdel.style.display='none';
}
function ytId(url){if(!url)return null;const m=url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);return m?m[1]:null;}

function submitArtist(){
  const nomEl = document.getElementById('f-nom');
  const tipoEl = document.getElementById('f-tipo');
  const brEl = document.getElementById('f-br');
  const brvEl = document.getElementById('f-br-v');
  
  const nombre = (nomEl ? nomEl.value : '').trim();
  const tipo = tipoEl ? tipoEl.value : '';
  let fbr = (brEl ? brEl.value : '').trim();
  let fbrv = (brvEl ? brvEl.value : '');
  
  let barrio = fbr;
  if (fbrv && typeof cleanNm === 'function' && cleanNm(fbrv) === fbr) { barrio = fbrv; }
  else if (fbrv && fbrv.replace(/\s*\(.*?\)\s*/g, '') === fbr) { barrio = fbrv; }
  
  if(!nombre||!tipo||!barrio){alert('Nombre, tipo y barrio son obligatorios.');return;}
  
  const id='a_'+Date.now();
  const iniciales=nombre.split(/[\s.]+/).map(w=>w[0]||'').join('').toUpperCase().slice(0,2)||nombre.slice(0,2).toUpperCase();
  const cent=getCent(barrio);
  const lng=cent?cent[0]:-58.44;const lat=cent?cent[1]:-34.615;
  const isCABA=!!CENTS_CABA[barrio];
  const crew=(document.getElementById('f-cr').value||'').trim()||null;
  
  const mgNm=(document.getElementById('f-mg-nm').value||'').trim()||null;
  const mgEm=(document.getElementById('f-mg-em').value||'').trim()||null;
  const mgIg=(document.getElementById('f-mg-ig').value||'').trim()||null;
  const manager=(mgNm||mgEm||mgIg)?{nombre:mgNm,email:mgEm,instagram:mgIg}:null;
  
  const a={
    id,nombre,iniciales,tipo,tipoLabel:TL[tipo],
    barrio,ciudad:isCABA?'CABA':'GBA',provincia:isCABA?'CABA':'Buenos Aires',
    crew,collabs:selCollabs.slice(),
    descripcion:(document.getElementById('f-de').value||'').trim(),
    instagram:(document.getElementById('f-ig').value||'').trim()||null,
    youtube:(document.getElementById('f-yt').value||'').trim()||null,
    spotify:(document.getElementById('f-sp').value||'').trim()||null,
    soundcloud:(document.getElementById('f-sc').value||'').trim()||null,
    genius:(document.getElementById('f-gn').value||'').trim()||null,
    entrevista:ytId(document.getElementById('f-en').value),
    lng,lat,avatarSrc:document.getElementById('av-pr')._src||null,
    manager,
    generos:getSelectedGeneros('art')
  };
  
  ARTISTS.push(a);
  reindex();sidx=buildSI();buildClusters();
  document.getElementById('mov').classList.remove('open');
  if(curTab!=='map')switchTab('map');
  selectArtist(id);
  resetModal();
  const row=artistToRow(a);
  tursoRun(
    'INSERT INTO artists (nombre,tipo,barrio,crew,descripcion,instagram,youtube,spotify,soundcloud,genius,entrevista,avatar_url,collabs,iniciales,lat,lng,manager_nombre,manager_email,manager_instagram,generos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [row.nombre,row.tipo,row.barrio,row.crew,row.descripcion,row.instagram,row.youtube,row.spotify,row.soundcloud,row.genius,row.entrevista,row.avatar_url,row.collabs,row.iniciales,row.lat,row.lng,row.manager_nombre,row.manager_email,row.manager_instagram,row.generos]
  ).then(async lastId=>{
    if(lastId!=null) a._dbId=String(lastId);
    // Importar discografía desde Spotify si fue pre-cargada
    const albums = window._spotifyImportedAlbums;
    if(albums && albums.length && a._dbId) {
      const TYPE_MAP = { album:'lp', single:'single', ep:'ep', compilation:'lp' };
      for(const al of albums) {
        await tursoRun(
          'INSERT INTO releases (artist_id,tipo,nombre,fecha,portada_url,spotify) VALUES (?,?,?,?,?,?)',
          [Number(a._dbId), TYPE_MAP[al.type]||'lp', al.name, al.release_date||null, al.image||null, al.spotify_url||null]
        );
      }
      window._spotifyImportedAlbums = null;
    }
  });
}
let editingId=null;

function openBarrioFromArtist(barrioName){
  if(curTab!=='map')switchTab('map');
  
  const cabaIdx=GEO_CABA.features.findIndex(f=>(f.properties.nombre||'')===barrioName);
  if(cabaIdx!==-1){openBP(cabaIdx,GEO_CABA.features[cabaIdx].properties,'caba','Barrio de CABA');}
  else {
      const parenMb = barrioName.match(/^(.+?)\s*\((.+)\)$/);
      const locFeat = parenMb
        ? GEO_LOC.features.find(f=>{
            const fn=(f.properties.NOMBRE||f.properties.nombre||'').toLowerCase().trim();
            const fd=(f.properties.DPTO||f.properties.dpto||'').toLowerCase().trim();
            return fn===parenMb[1].toLowerCase().trim() && fd===parenMb[2].toLowerCase().trim();
          })
        : GEO_LOC.features.find(f=>(f.properties.NOMBRE||f.properties.nombre||'')===barrioName);
      if(locFeat){
        const p=locFeat.properties;
        openBP(+p.CODIGO,{nombre:p.NOMBRE||p.nombre||'',subtitulo:p.DPTO||p.dpto||''},'loc',p.DPTO||p.dpto||'');
      } else {
        const cuartoIdx=GEO_CUARTO.features.findIndex(f=>(f.properties.NOMBRE||f.properties.nombre||'')===barrioName);
        if(cuartoIdx!==-1){
          const p=GEO_CUARTO.features[cuartoIdx].properties;
          openBP(cuartoIdx,{nombre:p.NOMBRE||p.nombre||''},'cuarto','Cuarto Cordón');
        }
      }
  }
  
  const cent=getCent(barrioName);
  if(cent)fitToLocation(barrioName);
  if(clusters[barrioName])expandCluster(barrioName);
}

function openEditArtist(){
  if(!selId)return;
  const a=byId[selId];if(!a)return;
  // ── GUARD DE PERMISOS ──
  if(window.authCan && !window.authCan.editArtist(a._dbId)){
    alert('No tenés permiso para editar este artista.');return;
  }
  openModal();
  document.getElementById('mhdr-t').textContent='EDITAR ARTISTA';
  const btn=document.getElementById('modal-submit');
  btn.textContent='GUARDAR';btn.onclick=saveEditArtist;
  const delBtn=document.getElementById('modal-delete');
  if(delBtn)delBtn.style.display='inline-flex';
  document.getElementById('f-nom').value=a.nombre||'';
  setTipoValue(a.tipo);
  document.getElementById('f-br').value=a.barrio||'';document.getElementById('f-br-v').value=a.barrio||'';
  document.getElementById('f-cr').value=a.crew||'';
  document.getElementById('f-de').value=a.descripcion||'';
  document.getElementById('f-ig').value=a.instagram||'';
  document.getElementById('f-yt').value=a.youtube||'';
  document.getElementById('f-sp').value=a.spotify||'';
  document.getElementById('f-sc').value=a.soundcloud||'';
  document.getElementById('f-gn').value=a.genius||'';
  document.getElementById('f-en').value=a.entrevista?'https://youtube.com/watch?v='+a.entrevista:'';
  if(a.manager){
    document.getElementById('f-mg-nm').value=a.manager.nombre||'';
    document.getElementById('f-mg-em').value=a.manager.email||'';
    document.getElementById('f-mg-ig').value=a.manager.instagram||'';
  }
  if(a.avatarSrc){
    const p=document.getElementById('av-pr');
    p.innerHTML='<img src="'+a.avatarSrc+'" alt="">';
    p._src=a.avatarSrc;
    // If it's a URL (not base64) pre-fill the URL input
    const _avUrl=document.getElementById('av-url');
    if(_avUrl) _avUrl.value=a.avatarSrc.startsWith('data:') ? '' : a.avatarSrc;
  }
  selCollabs=(a.collabs||[]).slice();renderCollabTags();
  const _fgw2=document.getElementById('f-gen-wrap');if(_fgw2){_fgw2.innerHTML=renderGenerosSelector('art',a.generos||[]);wireGenerosAdd('art');}
}

function saveEditArtist(){
  if(!editingId)return;
  const id = editingId; 
  const a=byId[id];
  if(!a)return;
  
  const nombre=(document.getElementById('f-nom').value||'').trim();
  const tipo=document.getElementById('f-tipo').value;
  
  const brEl = document.getElementById('f-br');
  const brvEl = document.getElementById('f-br-v');
  let fbr = (brEl ? brEl.value : '').trim();
  let fbrv = (brvEl ? brvEl.value : '');
  
  let barrio = fbr;
  if (fbrv && typeof cleanNm === 'function' && cleanNm(fbrv) === fbr) { barrio = fbrv; }
  else if (fbrv && fbrv.replace(/\s*\(.*?\)\s*/g, '') === fbr) { barrio = fbrv; }
  
  if(!nombre||!tipo||!barrio){alert('Nombre, tipo y barrio son obligatorios.');return;}
  
  const oldBarrio=a.barrio;
  const oldNombre=a.nombre;
  
  a.nombre=nombre;a.tipo=tipo;a.tipoLabel=TL[tipo];
  a.barrio=barrio;
  const isCABA=!!CENTS_CABA[barrio];
  a.ciudad=isCABA?'CABA':'GBA';a.provincia=isCABA?'CABA':'Buenos Aires';
  a.crew=(document.getElementById('f-cr').value||'').trim()||null;
  a.collabs=selCollabs.slice();
  a.descripcion=(document.getElementById('f-de').value||'').trim();
  a.instagram=(document.getElementById('f-ig').value||'').trim()||null;
  a.youtube=(document.getElementById('f-yt').value||'').trim()||null;
  a.spotify=(document.getElementById('f-sp').value||'').trim()||null;
  a.soundcloud=(document.getElementById('f-sc').value||'').trim()||null;
  a.genius=(document.getElementById('f-gn').value||'').trim()||null;
  a.entrevista=ytId(document.getElementById('f-en').value);
  a.avatarSrc=document.getElementById('av-pr')._src||a.avatarSrc||null;
  
  const mgNm=(document.getElementById('f-mg-nm').value||'').trim()||null;
  const mgEm=(document.getElementById('f-mg-em').value||'').trim()||null;
  const mgIg=(document.getElementById('f-mg-ig').value||'').trim()||null;
  a.manager=(mgNm||mgEm||mgIg)?{nombre:mgNm,email:mgEm,instagram:mgIg}:null;
  a.generos=getSelectedGeneros('art');
  
  a.iniciales=nombre.split(/[\s.]+/).map(w=>w[0]||'').join('').toUpperCase().slice(0,2)||nombre.slice(0,2).toUpperCase();
  
  if(barrio!==oldBarrio){
    const cent=getCent(barrio);
    if(cent){a.lng=cent[0];a.lat=cent[1];}
  }
  
  if (oldNombre !== nombre) {
    ARTISTS.forEach(b => {
      if (b.collabs && b.collabs.includes(oldNombre)) {
        b.collabs = b.collabs.map(c => c === oldNombre ? nombre : c);
      }
    });
  }

  reindex();
  sidx=buildSI();
  buildClusters();
  
  document.getElementById('mov').classList.remove('open');
  selectArtist(id);
  resetModal();
  if(a._dbId){
    const row=artistToRow(a);
    tursoRun(
      'UPDATE artists SET nombre=?,tipo=?,barrio=?,crew=?,descripcion=?,instagram=?,youtube=?,spotify=?,soundcloud=?,genius=?,entrevista=?,avatar_url=?,collabs=?,iniciales=?,lat=?,lng=?,manager_nombre=?,manager_email=?,manager_instagram=?,generos=? WHERE id=?',
      [row.nombre,row.tipo,row.barrio,row.crew,row.descripcion,row.instagram,row.youtube,row.spotify,row.soundcloud,row.genius,row.entrevista,row.avatar_url,row.collabs,row.iniciales,row.lat,row.lng,row.manager_nombre,row.manager_email,row.manager_instagram,row.generos,Number(a._dbId)]
    );
  }
}

function deleteArtist(){
  if(!editingId)return;
  const a=byId[editingId];if(!a)return;
  const _dbId=a._dbId;
  if(!confirm('¿Estás seguro que querés eliminar a '+a.nombre+'?'))return;
  const tip=document.getElementById('mtt-'+editingId);if(tip)tip.remove();
  const idx=ARTISTS.findIndex(x=>x.id===editingId);
  if(idx!==-1)ARTISTS.splice(idx,1);
  reindex();sidx=buildSI();buildClusters();
  closeModal();closeAP();
  if(_dbId){tursoRun('DELETE FROM artists WHERE id=?',[Number(_dbId)]);}
}

function setTipoValue(val){
  document.getElementById('f-tipo').value=val;
  const disp=document.getElementById('f-tipo-display');
  if(val&&TL[val]){
    disp.innerHTML='<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+(TC[val]||'#888')+'"></span><span>'+TL[val]+'</span>';
  } else {
    disp.innerHTML='<span style="color:#bbb">Seleccionar tipo</span>';
  }
}

(function initTipoDropdown(){
  const disp=document.getElementById('f-tipo-display');
  const list=document.getElementById('f-tipo-l');
  const tipos=[{v:'mc',l:'Rapero / MC'},{v:'prod',l:'Productor'},{v:'prod_mc',l:'Rapero y Productor'}];
  function render(){
    list.innerHTML='';
    tipos.forEach(t=>{
      const item=document.createElement('div');
      item.className='cbo';
      item.style.cssText='display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;font-size:12px;font-family:var(--mono);color:var(--t1)';
      item.innerHTML='<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+TC[t.v]+'"></span><span>'+t.l+'</span>';
      item.addEventListener('click',()=>{
        setTipoValue(t.v);
        list.classList.remove('on');
      });
      item.addEventListener('mouseenter',()=>{item.style.background='rgba(220,49,55,.08)';});
      item.addEventListener('mouseleave',()=>{item.style.background='';});
      list.appendChild(item);
    });
  }
  render();
  disp.addEventListener('click',()=>{list.classList.toggle('on');});
  document.addEventListener('click',e=>{if(!disp.contains(e.target)&&!list.contains(e.target))list.classList.remove('on');});
})();

// ── DISCOGRAFÍA ─────────────────────────────────────────────────────────────
let currentDiscoArtistId = null;
let currentDiscoTab = 'lp';
let currentReleases = [];
let editingReleaseId = null;
let currentReTab = 'lp';

async function loadReleases(artistDbId) {
  if(!artistDbId) return [];
  const rows = await turso('SELECT * FROM releases WHERE artist_id=? ORDER BY fecha DESC',[Number(artistDbId)]);
  return rows || [];
}

function switchDiscoTab(tipo) {
  currentDiscoTab = tipo;
  ['lp','ep','single'].forEach(t => {
    document.getElementById('dtab-'+t).classList.toggle('active', t===tipo);
  });
  renderDiscoList();
}

function renderDiscoList() {
  const list = document.getElementById('disco-list');
  if(!list) return;
  const filtered = currentReleases.filter(r => r.tipo === currentDiscoTab);
  ['lp','ep','single'].forEach(t => {
    const cnt = currentReleases.filter(r=>r.tipo===t).length;
    const el = document.getElementById('disco-count-'+t);
    if(el) el.textContent = cnt;
  });
  if(!filtered.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--t2);padding:12px 0">Sin lanzamientos.</div>';
    return;
  }
  list.innerHTML = '';
  filtered.forEach(r => {
    const div = document.createElement('div');
    div.className = 'disco-item';
    const portada = r.portada_url
      ? '<img src="'+r.portada_url+'" alt="" style="width:44px;height:44px;object-fit:cover;flex-shrink:0">'
      : '<div style="width:44px;height:44px;background:var(--pb);flex-shrink:0"></div>';
    const fecha = r.fecha ? r.fecha.slice(0,4) : '';
    const gneros = (()=>{
      try{const arr=typeof r.generos==='string'?JSON.parse(r.generos||'[]'):r.generos||[];
      return arr.length?'<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">'+arr.map(g=>'<span style="font-size:9px;border:1px solid var(--pb);padding:1px 5px">'+g+'</span>').join('')+'</div>':'';}catch(e){return '';}
    })();
    const collabs = r.collabs ? (()=>{
      const names = r.collabs.split(',').map(n=>n.trim()).filter(Boolean);
      const linked = names.map(n=>{
        const found = byName[n];
        if(found) return '<span class="disco-collab-link" style="color:var(--red);cursor:pointer;text-decoration:underline;text-decoration-style:dotted" data-artist-id="'+found.id+'">'+n+'</span>';
        return '<span>'+n+'</span>';
      }).join(', ');
      return '<div style="font-size:10px;color:var(--t2);margin-top:2px">con '+linked+'</div>';
    })() : '';
    const links = [
      r.spotify && '<a href="'+r.spotify+'" target="_blank" class="plk">♫ SPT</a>',
      r.youtube && '<a href="'+r.youtube+'" target="_blank" class="plk">▶ YT</a>',
      r.soundcloud && '<a href="'+r.soundcloud+'" target="_blank" class="plk">◎ SC</a>',
      r.bandcamp && '<a href="'+r.bandcamp+'" target="_blank" class="plk">⊙ BC</a>',
    ].filter(Boolean).join('');
    div.innerHTML = portada +
      '<div style="flex:1;min-width:0">'+
        '<div class="disco-title" style="font-size:11px;font-weight:700;letter-spacing:.5px">'+r.nombre+'</div>'+
        '<div style="font-size:10px;color:var(--t2)">'+fecha+'</div>'+
        gneros+
        collabs+
        (links ? '<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">'+links+'</div>' : '')+
      '</div>';
    list.appendChild(div);
    // Wire up artist links in collab line
    div.querySelectorAll('.disco-collab-link').forEach(el=>{
      el.addEventListener('click',e=>{e.stopPropagation();selectArtist(el.dataset.artistId);});
    });
  });
}

async function fillDiscoSection(a) {
  currentDiscoArtistId = a._dbId || null;
  currentReleases = currentDiscoArtistId ? await loadReleases(currentDiscoArtistId) : [];
  currentDiscoTab = 'lp';
  ['lp','ep','single'].forEach(t => {
    document.getElementById('dtab-'+t).classList.toggle('active', t==='lp');
  });
  renderDiscoList();
}

// ── ADD RELEASE MODAL ───────────────────────────────────────────────────────
let rlSelCollabs = [];

function renderRlCollabTags() {
  const wrap = document.getElementById('rl-co-tags'); wrap.innerHTML = '';
  if(!wrap) return;
  rlSelCollabs.forEach(name => {
    const tag = document.createElement('span'); tag.className = 'ctag'; tag.textContent = name;
    const x = document.createElement('span'); x.className = 'ctag-x'; x.textContent = '×';
    x.addEventListener('click', () => { rlSelCollabs = rlSelCollabs.filter(n => n !== name); renderRlCollabTags(); });
    tag.appendChild(x); wrap.appendChild(tag);
  });
  const hiddenInp = document.getElementById('rl-collabs');
  if(hiddenInp) hiddenInp.value = rlSelCollabs.join(', ');
}

setTimeout(() => {
  if(document.getElementById('rl-collabs-in')){
    initCombo('rl-collabs-in', 'rl-collabs-l', 
      q => ARTISTS.map(a => a.nombre).filter(n => n.toLowerCase().includes(q.toLowerCase()) && !rlSelCollabs.includes(n)).slice(0, 8),
      val => {
        if (!rlSelCollabs.includes(val)) { rlSelCollabs.push(val); renderRlCollabTags(); }
        setTimeout(() => { document.getElementById('rl-collabs-in').value = ''; }, 0);
      }, false
    );
  }
}, 500);

function openAddRelease() {
  if(!currentDiscoArtistId){alert('Guardá el artista primero.');return;}
  if(window.authCan && !window.authCan.editArtist(currentDiscoArtistId)){return;}
  document.getElementById('rl-mov').style.display='flex';
  const _rlgw=document.getElementById('rl-gen-wrap');if(_rlgw){_rlgw.innerHTML=renderGenerosSelector('rl',[]);wireGenerosAdd('rl');}
  document.getElementById('rl-nombre').value='';
  document.getElementById('rl-fecha').value='';
  
  rlSelCollabs = [];
  renderRlCollabTags();
  if(document.getElementById('rl-collabs-in')) document.getElementById('rl-collabs-in').value = '';
  
  document.getElementById('rl-spotify').value='';
  document.getElementById('rl-youtube').value='';
  document.getElementById('rl-soundcloud').value='';
  document.getElementById('rl-bandcamp').value='';
  document.getElementById('rl-portada-url').value='';
  document.getElementById('rl-av-pr').innerHTML='';
  document.getElementById('rl-av-pr')._src=null;
  document.getElementById('rl-tipo').value='lp';
  switchRlSrc('url');
  document.getElementById('rl-hdr-t').textContent='AGREGAR LANZAMIENTO';
  editingReleaseId=null;
}

function closeAddRelease() {
  document.getElementById('rl-mov').style.display='none';
}

function switchRlSrc(src) {
  document.getElementById('rl-src-url').style.display = src==='url'?'':'none';
  document.getElementById('rl-src-file').style.display = src==='file'?'':'none';
  document.getElementById('rl-src-url-btn').classList.toggle('active', src==='url');
  document.getElementById('rl-src-file-btn').classList.toggle('active', src==='file');
}

document.getElementById('rl-av-in').addEventListener('change', function() {
  const file = this.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const pr = document.getElementById('rl-av-pr');
    pr.innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">';
    pr._src = e.target.result;
  };
  reader.readAsDataURL(file);
});

async function submitRelease() {
  const nombre = document.getElementById('rl-nombre').value.trim();
  const tipo = document.getElementById('rl-tipo').value;
  if(!nombre) { alert('El nombre es obligatorio.'); return; }
  const urlTab = document.getElementById('rl-src-url').style.display !== 'none';
  const portada_url = urlTab
    ? (document.getElementById('rl-portada-url').value.trim()||null)
    : (document.getElementById('rl-av-pr')._src||null);
  
  const colVal = document.getElementById('rl-collabs') ? document.getElementById('rl-collabs').value.trim() : '';

  const row = {
    artist_id: currentDiscoArtistId,
    tipo,
    nombre,
    fecha: document.getElementById('rl-fecha').value||null,
    portada_url,
    collabs: colVal||null,
    spotify: document.getElementById('rl-spotify').value.trim()||null,
    youtube: document.getElementById('rl-youtube').value.trim()||null,
    soundcloud: document.getElementById('rl-soundcloud').value.trim()||null,
    bandcamp: document.getElementById('rl-bandcamp').value.trim()||null,
  };
  const btn = document.getElementById('rl-submit');
  btn.textContent='GUARDANDO...'; btn.disabled=true;
  if(editingReleaseId) {
    const ok = await tursoRun(
      'UPDATE releases SET artist_id=?,tipo=?,nombre=?,fecha=?,portada_url=?,collabs=?,spotify=?,youtube=?,soundcloud=?,bandcamp=?,generos=? WHERE id=?',
      [row.artist_id,row.tipo,row.nombre,row.fecha,row.portada_url,row.collabs,row.spotify,row.youtube,row.soundcloud,row.bandcamp,row.generos||'[]',Number(editingReleaseId)]
    );
    if(ok!==null) {
      const idx = currentReleases.findIndex(r=>r.id===editingReleaseId);
      if(idx!==-1) currentReleases[idx]={...currentReleases[idx],...row,id:editingReleaseId};
    }
  } else {
    const newId = await tursoRun(
      'INSERT INTO releases (artist_id,tipo,nombre,fecha,portada_url,collabs,spotify,youtube,soundcloud,bandcamp) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [row.artist_id,row.tipo,row.nombre,row.fecha,row.portada_url,row.collabs,row.spotify,row.youtube,row.soundcloud,row.bandcamp]
    );
    if(newId!=null) currentReleases.push({...row,id:String(newId)});
  }
  btn.textContent='GUARDAR'; btn.disabled=false;
  closeAddRelease();
  currentDiscoTab = tipo;
  ['lp','ep','single'].forEach(t=>document.getElementById('dtab-'+t).classList.toggle('active',t===tipo));
  renderDiscoList();
  if(document.getElementById('re-mov').style.display==='flex') renderReList();
}

function openEditReleases() {
  if(!currentDiscoArtistId){alert('Abrí un artista primero.');return;}
  if(window.authCan && !window.authCan.editArtist(currentDiscoArtistId)){return;}
  currentReTab='lp';
  ['lp','ep','single'].forEach(t=>document.getElementById('retab-'+t).classList.toggle('active',t==='lp'));
  document.getElementById('re-mov').style.display='flex';
  renderReList();
}

function closeEditReleases() {
  document.getElementById('re-mov').style.display='none';
}

function switchReTab(tipo) {
  currentReTab = tipo;
  ['lp','ep','single'].forEach(t=>document.getElementById('retab-'+t).classList.toggle('active',t===tipo));
  renderReList();
}

window.previewReCover = function(input, id) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const pr = document.getElementById('re-av-pr-'+id);
    pr.innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">';
    pr._src = e.target.result;
    document.getElementById('re-portada-'+id).value = ''; 
  };
  reader.readAsDataURL(file);
};

function renderReList() {
  const list = document.getElementById('re-list');
  const filtered = currentReleases.filter(r=>r.tipo===currentReTab);
  if(!filtered.length){list.innerHTML='<div style="font-size:11px;color:var(--t2);padding:12px 0">Sin lanzamientos.</div>';return;}
  list.innerHTML='';
  filtered.forEach(r=>{
    const item = document.createElement('div');
    item.style.cssText='border:1px solid var(--pb);margin-bottom:8px;';
    const header = document.createElement('div');
    header.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;';
    header.innerHTML='<span style="font-size:11px;font-weight:700">'+r.nombre+(r.fecha?'  <span style="font-weight:400;color:var(--t2)">'+r.fecha.slice(0,4)+'</span>':'')+'</span>'+
      '<div style="display:flex;gap:8px;align-items:center">'+
        '<button onclick="deleteRelease('+r.id+')" style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:13px" title="Eliminar">🗑</button>'+
        '<span style="font-size:11px;color:var(--t2)">▾</span>'+
      '</div>';
    const body = document.createElement('div');
    body.style.cssText='display:none;padding:10px 12px;border-top:1px solid var(--pb);display:flex;flex-direction:column;gap:8px;';
    body.id='re-body-'+r.id;
    body.innerHTML=
      '<input class="finp" id="re-nombre-'+r.id+'" value="'+escHtml(r.nombre||'')+'" placeholder="Nombre">'+
      '<input class="finp" id="re-fecha-'+r.id+'" type="date" value="'+(r.fecha||'')+'">'+
      '<input class="finp" id="re-collabs-'+r.id+'" value="'+escHtml(r.collabs||'')+'" placeholder="Colaboraciones">'+
      '<div style="display:flex; gap:8px; align-items:center;">'+
        '<div id="re-av-pr-'+r.id+'" style="width:40px;height:40px;background:var(--pb);overflow:hidden;flex-shrink:0">'+
          (r.portada_url ? '<img src="'+escHtml(r.portada_url)+'" style="width:100%;height:100%;object-fit:cover">' : '') +
        '</div>'+
        '<div style="flex:1">'+
          '<input class="finp" id="re-portada-'+r.id+'" value="'+escHtml(r.portada_url||'')+'" placeholder="URL portada o subí archivo">'+
          '<button type="button" onclick="document.getElementById(\'re-av-in-'+r.id+'\').click()" style="margin-top:4px;font-size:10px;padding:4px;cursor:pointer;background:none;border:1px solid var(--pb);color:var(--tm)">+ Subir imagen</button>'+
          '<input id="re-av-in-'+r.id+'" type="file" accept="image/png,image/jpeg" style="display:none" onchange="previewReCover(this, \''+r.id+'\')">'+
        '</div>'+
      '</div>'+
      '<input class="finp" id="re-spotify-'+r.id+'" value="'+escHtml(r.spotify||'')+'" placeholder="♫ Spotify URL">'+
      '<input class="finp" id="re-youtube-'+r.id+'" value="'+escHtml(r.youtube||'')+'" placeholder="▶ YouTube URL">'+
      '<input class="finp" id="re-soundcloud-'+r.id+'" value="'+escHtml(r.soundcloud||'')+'" placeholder="◎ SoundCloud URL">'+
      '<input class="finp" id="re-bandcamp-'+r.id+'" value="'+escHtml(r.bandcamp||'')+'" placeholder="⊙ Bandcamp URL">'+
      '<button class="madd" style="align-self:flex-end" onclick="saveRelease('+r.id+')">GUARDAR</button>';
    body.style.display='none';
    header.addEventListener('click', (e)=>{
      if(e.target.tagName==='BUTTON') return;
      const isOpen = body.style.display!=='none';
      list.querySelectorAll('[id^="re-body-"]').forEach(b=>b.style.display='none');
      list.querySelectorAll('.re-chevron').forEach(c=>c.textContent='▾');
      if(!isOpen){body.style.display='flex';header.querySelector('span:last-child').textContent='▴';}
    });
    item.appendChild(header);
    item.appendChild(body);
    list.appendChild(item);
  });
}

function escHtml(s){return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

async function saveRelease(id){
  let portada_url = document.getElementById('re-portada-'+id).value.trim();
  const pr = document.getElementById('re-av-pr-'+id);
  if(!portada_url && pr && pr._src) {
    portada_url = pr._src;
  }

  const row={
    nombre:document.getElementById('re-nombre-'+id).value.trim(),
    fecha:document.getElementById('re-fecha-'+id).value||null,
    collabs:document.getElementById('re-collabs-'+id).value.trim()||null,
    portada_url:portada_url||null,
    spotify:document.getElementById('re-spotify-'+id).value.trim()||null,
    youtube:document.getElementById('re-youtube-'+id).value.trim()||null,
    soundcloud:document.getElementById('re-soundcloud-'+id).value.trim()||null,
    bandcamp:document.getElementById('re-bandcamp-'+id).value.trim()||null,
  };
  await tursoRun(
    'UPDATE releases SET nombre=?,fecha=?,collabs=?,portada_url=?,spotify=?,youtube=?,soundcloud=?,bandcamp=? WHERE id=?',
    [row.nombre,row.fecha,row.collabs,row.portada_url,row.spotify,row.youtube,row.soundcloud,row.bandcamp,Number(id)]
  );
  const idx=currentReleases.findIndex(r=>r.id===id);
  if(idx!==-1)currentReleases[idx]={...currentReleases[idx],...row};
  renderDiscoList();
  renderReList();
}

async function deleteRelease(id){
  if(!confirm('¿Eliminar este lanzamiento?'))return;
  await tursoRun('DELETE FROM releases WHERE id=?',[Number(id)]);
  currentReleases=currentReleases.filter(r=>r.id!==id);
  renderDiscoList();
  renderReList();
}

  window.openBarrioFromArtist = openBarrioFromArtist;
  window.openCrewFromArtist = openCrewFromArtist;
  window.openEditCrew = openEditCrew;
  window.closeEditCrew = closeEditCrew;
  window.submitEditCrew = submitEditCrew;
  window.openModal=openModal;
  window.closeModal=closeModal;
  window.submitArtist=submitArtist;
  window.openEditArtist=openEditArtist;
  window.deleteArtist=deleteArtist;
  window.openAddRelease=openAddRelease;
  window.closeAddRelease=closeAddRelease;
  window.openEditReleases=openEditReleases;
  window.closeEditReleases=closeEditReleases;
  window.switchDiscoTab=switchDiscoTab;
  window.switchRlSrc=switchRlSrc;
  window.switchReTab=switchReTab;
  window.submitRelease=submitRelease;
  window.saveRelease=saveRelease;
  window.deleteRelease=deleteRelease;
  window.closeAP=closeAP;
  window.closeBP=closeBP;
  window.closeCP=closeCP;
  window.toggleDark=toggleDark;
  window.applyTypeFilter=applyTypeFilter;
  window.toggleCrewCollabs=toggleCrewCollabs;

  function renderGeneroFilterDropdown(){
    const wrap=document.getElementById('flt-gen-list');
    if(!wrap)return;
    const allG=new Set();
    ARTISTS.forEach(a=>(a.generos||[]).forEach(g=>allG.add(g)));
    GENEROS_LIST.forEach(g=>allG.add(g));
    const sorted=[...allG].sort();
    if(!sorted.length){document.getElementById('flt-gen-wrap').style.display='none';return;}
    document.getElementById('flt-gen-wrap').style.display='';
    wrap.innerHTML=sorted.map(g=>'<label class="flt-row flt-gen-row"><input type="checkbox" class="flt-gen-cb" value="'+g+'" checked onchange="applyGeneroFilter()"> '+g+'</label>').join('');
  }
  window.applyGeneroFilter=applyGeneroFilter;
  window.toggleGeneroDropdown=function(){
    const body=document.getElementById('flt-gen-body');
    const arrow=document.getElementById('flt-gen-arrow');
    const open=body.style.display!=='none'&&body.style.display!=='';
    body.style.display=open?'none':'block';
    if(arrow)arrow.textContent=open?'▾':'▴';
  };
  // Exponer ARTISTS para el calendario
  window.ARTISTS_REF = ARTISTS;
}
init();