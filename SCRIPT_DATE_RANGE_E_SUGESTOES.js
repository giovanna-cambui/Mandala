// ========================================================================
// SCRIPT 1: DATE RANGE FILTERING + AUTO-SUGGESTED ANALYSES
// ========================================================================
// Cole este script ANTES da tag </script> final do painel-mandala.html
// (encontre a última </script> e adicione este código logo antes)

/* ====== PARTE 1: DATE RANGE PICKER ====== */

// Modificar applyFilters para incluir date range
const originalApplyFilters = applyFilters;
window.applyFilters = function(rows, fields, filters){
  if(!filters || !Object.keys(filters).length) return rows;
  return rows.filter(row=>{
    // Verificar date range
    if(filters.dateFrom || filters.dateTo){
      const dateStr = row.DATA || row.Data || row.data || row.Mes || row.mes || row.DATA_SAIDA || row['DATA SAIDA'] || '';
      if(dateStr){
        const dt = normalizeDate(String(dateStr));
        if(filters.dateFrom && dt < filters.dateFrom) return false;
        if(filters.dateTo && dt > filters.dateTo) return false;
      }
    }
    // Resto dos filtros
    return Object.keys(filters).every(dimKey=>{
      if(dimKey === 'dateFrom' || dimKey === 'dateTo') return true;
      const f = findFieldForDim(fields, dimKey);
      if(!f) return true;
      const dim = FILTER_DIM_ALIASES.find(d=>d.key===dimKey);
      if(dim && dim.isBoolean){
        const val = String(row[f]||'').toLowerCase().trim();
        const filterVal = String(filters[dimKey]||'').toLowerCase().trim();
        if(!filterVal) return true;
        return ['sim','true','1','yes','verdadeiro','v'].includes(val);
      }
      return String(row[f]) === filters[dimKey];
    });
  });
};

// Normalizar datas para YYYY-MM-DD
window.normalizeDate = function(dateStr){
  dateStr = String(dateStr).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const match1 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(match1) return match1[3] + '-' + String(match1[2]).padStart(2,'0') + '-' + String(match1[1]).padStart(2,'0');
  const match2 = dateStr.match(/([a-z]{3})\/(\d{2})/i);
  if(match2){
    const meses = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
    const m = meses[match2[1].toLowerCase()];
    const y = '20' + match2[2];
    return y + '-' + String(m).padStart(2,'0') + '-01';
  }
  return dateStr;
};

// Modificar setFilter para aceitar dateFrom/dateTo
const originalSetFilter = window.setFilter || function(){};
window.setFilter = function(filterKey, dimKey, value){
  if(!STATE.filters[filterKey]) STATE.filters[filterKey] = {};
  if(dimKey === 'dateFrom' || dimKey === 'dateTo'){
    STATE.filters[filterKey][dimKey] = value || null;
  } else {
    if(value) STATE.filters[filterKey][dimKey] = value;
    else delete STATE.filters[filterKey][dimKey];
  }
  renderContent();
};

/* ====== PARTE 2: ANÁLISES SUGERIDAS AUTOMÁTICAS ====== */

// Detectar análises sugeridas baseado em estrutura de colunas
window.suggestAnalysesForReport = async function(sector, reportId){
  const report = STATE.reports[sector].find(r=>r.id===reportId);
  if(!report || !report.sourceType) return [];
  
  const parsed = await getParsedReport(sector, reportId);
  if(!parsed) return [];
  
  const fields = parsed.fields;
  const suggestions = [];
  
  // Padrão 1: Coluna com % ou performance → Gauge
  fields.forEach(f=>{
    if(f.toLowerCase().includes('%') || f.toLowerCase().includes('perform') || f.toLowerCase().includes('perf')){
      suggestions.push({
        title: '📊 Gauge: ' + f.replace(/[%]/g,''),
        type: 'gauge',
        xField: '',
        yField: f,
        agg: 'avg',
        priority: 'high'
      });
    }
  });
  
  // Padrão 2: Coluna DATA → Linha temporal
  const dateField = fields.find(f => {
    const name = f.toLowerCase();
    return name.includes('data') || name.includes('saida') || name.includes('mes');
  });
  
  if(dateField){
    const numericFields = fields.filter(f => {
      const name = f.toLowerCase();
      if(name.includes('data') || name.includes('mes') || name.includes('expedição') || name.includes('observ') || name.includes('motora') || name.includes('conferente') || name.includes('arrumador') || name.includes('doca') || name.includes('numero') || name.includes('cavalo') || name.includes('carreta') || name.includes('motorista') || name.includes('cidade')) return false;
      const val = parsed.data[0]?.[f];
      return !isNaN(parseFloat(val)) || !isNaN(parseFloat(String(val).replace(',','.')));
    });
    numericFields.slice(0, 3).forEach(f=>{
      suggestions.push({
        title: '📈 Linha: ' + f + ' por período',
        type: 'line',
        xField: dateField,
        yField: f,
        agg: 'sum',
        priority: 'high'
      });
    });
  }
  
  // Padrão 3: Colunas categóricas → Barras
  const textFields = fields.filter(f => {
    const name = f.toLowerCase();
    if(name.includes('data') || name.includes('numero') || name.includes('observ') || name.includes('expedição')) return false;
    const vals = new Set(parsed.data.slice(0, 50).map(r=>String(r[f]||'')));
    return vals.size > 1 && vals.size < 30;
  });
  
  textFields.slice(0, 4).forEach(categoryField=>{
    const numField = fields.find(nf => {
      const name = nf.toLowerCase();
      if(name.includes('data') || name.includes('mes') || name.includes('numero') || name.includes('observ')) return false;
      const val = parsed.data[0]?.[nf];
      return !isNaN(parseFloat(val)) || !isNaN(parseFloat(String(val).replace(',','.')));
    });
    if(numField){
      suggestions.push({
        title: '📊 Barras: ' + numField + ' por ' + categoryField,
        type: 'bar',
        xField: categoryField,
        yField: numField,
        agg: 'sum',
        priority: 'medium'
      });
    }
  });
  
  // Padrão 4: KPI
  const numFields = fields.filter(f => {
    const name = f.toLowerCase();
    if(name.includes('data') || name.includes('numero') || name.includes('expedição') || name.includes('observ') || name.includes('%') || name.includes('motora')) return false;
    const v = parsed.data[0]?.[f];
    return !isNaN(parseFloat(v)) || !isNaN(parseFloat(String(v).replace(',','.')));
  });
  
  if(numFields.length){
    numFields.slice(0, 2).forEach(f=>{
      suggestions.push({
        title: '💰 KPI: ' + f,
        type: 'kpi',
        xField: '',
        yField: f,
        agg: 'sum',
        priority: 'medium'
      });
    });
  }
  
  return suggestions.sort((a,b) => {
    const prio = {high:0, medium:1, low:2};
    return (prio[a.priority]||9) - (prio[b.priority]||9);
  });
};

// Modal de sugestões
window.openSuggestionsModal = async function(sector, reportId){
  const report = STATE.reports[sector].find(r=>r.id===reportId);
  if(!report) return;
  
  const suggestions = await suggestAnalysesForReport(sector, reportId);
  if(!suggestions.length){
    toast('Nenhuma análise sugerida. Crie manualmente.');
    return;
  }
  
  const modalId = uid('sug');
  let html = `<div class="overlay active" id="${modalId}">
    <div class="overlay-card wide">
      <div class="overlay-head">
        <div>
          <h2>Análises Automáticas Sugeridas</h2>
          <p>Relatório: <b>${report.name}</b> — Selecione as análises que você quer carregar</p>
        </div>
        <button class="overlay-close" onclick="closeOverlay('${modalId}')">&times;</button>
      </div>
      <div class="overlay-body">
        <table class="data-table" style="font-size:12px;">
          <tr><th style="width:40px;"><input type="checkbox" id="sugg-all-${modalId}" onchange="document.querySelectorAll('#${modalId} .sugg-check').forEach(c=>c.checked=this.checked)"></th><th>Análise</th><th>Tipo</th><th>Prioridade</th></tr>`;
  
  suggestions.forEach((s,i)=>{
    html += `<tr>
      <td><input type="checkbox" class="sugg-check" id="sugg-${i}-${modalId}" checked></td>
      <td>${s.title}</td>
      <td>${s.type.toUpperCase()}</td>
      <td><span class="creator-tag" style="font-size:10px;">${s.priority}</span></td>
    </tr>`;
  });
  
  html += `</table>
      </div>
      <div class="overlay-foot">
        <button class="btn btn-ghost" onclick="closeOverlay('${modalId}')">Cancelar</button>
        <button class="btn btn-primary" onclick="loadSelectedSuggestions('${sector}','${reportId}','${modalId}',${JSON.stringify(suggestions).replace(/'/g, "&apos;")})">Carregar Selecionadas</button>
      </div>
    </div>
  </div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
};

// Carregar análises selecionadas
window.loadSelectedSuggestions = async function(sector, reportId, modalId, suggestionsStr){
  let suggestions = suggestionsStr;
  if(typeof suggestionsStr === 'string'){
    try{ suggestions = JSON.parse(suggestionsStr); }
    catch(e){ console.error('Parse error', e); return; }
  }
  
  const selected = [];
  suggestions.forEach((s,i)=>{
    const el = document.getElementById(`sugg-${i}-${modalId}`);
    if(el && el.checked) selected.push(s);
  });
  
  if(!selected.length){ toast('Selecione pelo menos uma análise.'); return; }
  
  const tabs = allTabsForSector(sector);
  const defaultTab = tabs[0]?.id || 'visao';
  
  selected.forEach(s=>{
    const chart = {
      id: uid('cc'),
      sector: sector,
      tab: defaultTab,
      title: s.title,
      type: s.type,
      reportId: reportId,
      xField: s.xField || '',
      yField: s.yField,
      seriesField: '',
      agg: s.agg,
      createdBy: STATE.currentUser.name,
      createdAt: todayBR(),
      isAutoSuggested: true
    };
    STATE.customCharts[sector].push(chart);
  });
  
  await saveShared('mandala:customCharts', STATE.customCharts);
  const el = document.getElementById(modalId);
  if(el) el.remove();
  renderContent();
  toast(selected.length + ' análise(s) carregada(s)! 🎉');
};

// Adicionar botão "Sugerir análises" após vincular relatório
// Modificar saveReport() para chamar este novo diálogo
const originalSaveReport = window.saveReport;
window.saveReport = async function(){
  const sector = reportModalSector;
  const responsavel = document.getElementById('report-responsavel').value.trim() || STATE.currentUser.name;
  const csvText = document.getElementById('report-csv-text').value;
  const url = document.getElementById('report-url').value.trim();
  
  if(reportSrc==='csv' && !csvText.trim()){ toast('Cole os dados em CSV.'); return; }
  if(reportSrc==='url' && !url){ toast('Informe o link publicado.'); return; }
  
  const wasNew = !reportModalId;
  
  if(reportModalId){
    const r = STATE.reports[sector].find(r=>r.id===reportModalId);
    r.sourceType = reportSrc; r.csvText = reportSrc==='csv'?csvText:''; r.url = reportSrc==='url'?url:'';
    r.responsavel = responsavel; r.updatedAt = todayBR(); if(!r.linkedAt) r.linkedAt = todayBR();
    invalidateReportCache(sector, reportModalId);
  } else {
    const name = document.getElementById('report-name').value.trim();
    if(!name){ toast('Dê um nome ao relatório.'); return; }
    const id = uid('rep');
    STATE.reports[sector].push({id, name, sourceType:reportSrc, csvText:reportSrc==='csv'?csvText:'', url:reportSrc==='url'?url:'', responsavel, linkedAt:todayBR(), updatedAt:todayBR(), calcFields:[], relations:[]});
    reportModalId = id;
  }
  
  await saveShared('mandala:reports', STATE.reports);
  closeOverlay('overlay-report');
  toast('Relatório vinculado.');
  
  // SE FOR NOVO, oferece sugerir análises
  if(wasNew){
    setTimeout(()=>openSuggestionsModal(sector, reportModalId), 500);
  }
};

console.log('✅ Scripts de Date Range + Análises Sugeridas carregados com sucesso!');
