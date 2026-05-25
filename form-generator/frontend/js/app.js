// frontend/js/app.js
// Galvenā lietotnes loģika - SSE notikumu apstrāde, UI atjaunināšana, Shadow DOM rendēšana.
// Bakalaura darbs, Aleksis Lipsnis, RTU 2026.

// ═══════════════════════════════════════════════════════════════════
// DOM elementi
// ═══════════════════════════════════════════════════════════════════

const el = {
  // Ievads
  apiKey: document.getElementById('apiKey'),
  toggleKey: document.getElementById('toggleKey'),
  modelSelect: document.getElementById('modelSelect'),
  modelDescription: document.getElementById('modelDescription'),
  userPrompt: document.getElementById('userPrompt'),
  generateBtn: document.getElementById('generateBtn'),
  errorBox: document.getElementById('errorBox'),

  // Posmi
  stageCnl: document.getElementById('stageCnl'),
  stageJson: document.getElementById('stageJson'),
  stageHtml: document.getElementById('stageHtml'),
  stageAudit: document.getElementById('stageAudit'),

  outputCNL: document.getElementById('outputCNL'),
  outputJSON: document.getElementById('outputJSON'),
  auditContent: document.getElementById('auditContent'),

  metaCNL: document.getElementById('metaCNL'),
  metaJSON: document.getElementById('metaJSON'),
  metaHTML: document.getElementById('metaHTML'),
  metaAudit: document.getElementById('metaAudit'),

  // Regenerate pogas
  regenerateFromCnl: document.getElementById('regenerateFromCnl'),
  regenerateFromJson: document.getElementById('regenerateFromJson'),
  dirtyCnl: document.getElementById('dirtyCnl'),
  dirtyJson: document.getElementById('dirtyJson'),
  jsonError: document.getElementById('jsonError'),

  // Rezultāts
  formPreview: document.getElementById('formPreview'),
  viewCodeBtn: document.getElementById('viewCodeBtn'),
  metricsPanel: document.getElementById('metricsPanel'),

  mModel: document.getElementById('mModel'),
  mTime: document.getElementById('mTime'),
  mTokens: document.getElementById('mTokens'),
  mCost: document.getElementById('mCost'),
  mCompleteness: document.getElementById('mCompleteness'),
  mNielsen: document.getElementById('mNielsen'),

  // Modāls
  codeModal: document.getElementById('codeModal'),
  closeModal: document.getElementById('closeModal'),
  codeContent: document.querySelector('#codeContent code'),
  copyBtn: document.getElementById('copyBtn'),
  copyStatus: document.getElementById('copyStatus'),
};

// Globālais stāvoklis
const state = {
  result: { html: '', css: '' },
  currentTab: 'html',
  isGenerating: false,

  // Sākotnējās modeļa atbildes (lietotāja rediģēšanas atskaites punkts)
  originalCNL: '',
  originalJSON: '', // glabājam kā formatētu JSON virkni

  // Parsētais JSON koks (pēdējais derīgais)
  jsonTree: null,

  // Pēdējie ievades dati - vajadzīgi perģenerēšanai
  lastPrompt: '',
  lastModel: ''
};

// ═══════════════════════════════════════════════════════════════════
// Inicializācija
// ═══════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  loadApiKey();
  loadModels();
  attachEventListeners();
});

function loadApiKey() {
  const saved = localStorage.getItem('openrouter_key');
  if (saved) el.apiKey.value = saved;
}

async function loadModels() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();

    el.modelSelect.innerHTML = '';

    const tiers = {
      frontier: { label: 'Frontier modeļi (jaunākie)', models: [] },
      premium: { label: 'Premium modeļi', models: [] },
      fast: { label: 'Ātrie modeļi (budget-friendly)', models: [] },
      budget: { label: 'Open-source modeļi', models: [] }
    };

    data.models.forEach(m => {
      const tier = m.tier || 'premium';
      if (tiers[tier]) tiers[tier].models.push(m);
    });

    Object.values(tiers).forEach(tier => {
      if (tier.models.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = tier.label;
      tier.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} · ${m.provider}`;
        opt.dataset.description = m.description || '';
        group.appendChild(opt);
      });
      el.modelSelect.appendChild(group);
    });

    updateModelDescription();
  } catch (err) {
    showError('Neizdevās ielādēt modeļu sarakstu: ' + err.message);
  }
}

function updateModelDescription() {
  const opt = el.modelSelect.options[el.modelSelect.selectedIndex];
  el.modelDescription.textContent = opt?.dataset.description || '';
}

function attachEventListeners() {
  el.toggleKey.addEventListener('click', () => {
    el.apiKey.type = el.apiKey.type === 'password' ? 'text' : 'password';
  });

  el.apiKey.addEventListener('change', () => {
    localStorage.setItem('openrouter_key', el.apiKey.value);
  });

  el.modelSelect.addEventListener('change', updateModelDescription);

  el.generateBtn.addEventListener('click', handleGenerate);

  // Examples
  document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => loadExample(btn.dataset.example));
  });

  // Rediģēšanas izsekošana CNL un JSON laukos
  el.outputCNL.addEventListener('input', handleCnlEdit);
  el.outputJSON.addEventListener('input', handleJsonEdit);

  // Perģenerēšanas pogas
  el.regenerateFromCnl.addEventListener('click', () => runRegenerate('json'));
  el.regenerateFromJson.addEventListener('click', () => runRegenerate('html'));

  // Modal
  el.viewCodeBtn.addEventListener('click', openCodeModal);
  el.closeModal.addEventListener('click', closeCodeModal);
  el.codeModal.addEventListener('click', e => {
    if (e.target === el.codeModal) closeCodeModal();
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  el.copyBtn.addEventListener('click', handleCopy);
}

function loadExample(type) {
  const examples = {
    registration: 'Reģistrācijas forma ar laukiem: vārds, uzvārds, e-pasts, parole (vismaz 8 rakstzīmes), apstiprināt paroli, piekrišana lietošanas noteikumiem.',
    feedback: 'Atsauksmes forma ar laukiem: vārds, e-pasts, vērtējums no 1 līdz 5 zvaigznēm, komentārs (līdz 500 rakstzīmēm), datums.',
    order: 'Форма заказа: имя получателя, телефон, адрес доставки, способ оплаты (карта/наличные), комментарий курьеру.',
    booking: 'A hotel booking form with check-in date, check-out date, number of guests (1-6), room type (single, double, suite), guest full name, email, and special requests textarea.'
  };
  el.userPrompt.value = examples[type] || '';
}

// ═══════════════════════════════════════════════════════════════════
// Galvenā ģenerēšanas plūsma (no nulles)
// ═══════════════════════════════════════════════════════════════════

async function handleGenerate() {
  if (state.isGenerating) return;

  const prompt = el.userPrompt.value.trim();
  const model = el.modelSelect.value;
  const apiKey = el.apiKey.value.trim();

  if (!prompt) return showError('Lūdzu ievadiet prasību aprakstu');
  if (!model) return showError('Izvēlieties modeli');
  if (!apiKey) return showError('Ievadiet OpenRouter API atslēgu');

  hideError();
  resetUI();

  state.lastPrompt = prompt;
  state.lastModel = model;

  await runPipelineRequest('/api/generate', {
    prompt, model, apiKey
  });
}

// ═══════════════════════════════════════════════════════════════════
// Perģenerēšana no konkrēta posma
// ═══════════════════════════════════════════════════════════════════

async function runRegenerate(fromStage) {
  if (state.isGenerating) return;

  const apiKey = el.apiKey.value.trim();
  if (!apiKey) return showError('Ievadiet OpenRouter API atslēgu');
  if (!state.lastPrompt) return showError('Vispirms ģenerējiet formu no nulles');

  // Sagatavojam datus atkarībā no posma
  const payload = {
    prompt: state.lastPrompt,
    model: state.lastModel,
    apiKey,
    fromStage
  };

  if (fromStage === 'json') {
    // Lietotājs rediģēja CNL → padodam jauno CNL
    const editedCnl = el.outputCNL.value.trim();
    if (!editedCnl) return showError('CNL teksts ir tukšs');
    payload.cnl = editedCnl;
  } else if (fromStage === 'html') {
    // Lietotājs rediģēja JSON → padodam jauno JSON
    const editedJson = el.outputJSON.value.trim();
    if (!editedJson) return showError('JSON teksts ir tukšs');

    // Klienta puses JSON validācija pirms nosūtīšanas
    try {
      JSON.parse(editedJson);
      hideJsonError();
    } catch (err) {
      return showJsonError('Nederīgs JSON formāts: ' + err.message);
    }
    payload.json = editedJson;
  }

  hideError();
  resetUIForRegenerate(fromStage);

  await runPipelineRequest('/api/regenerate', payload);
}

// ═══════════════════════════════════════════════════════════════════
// Vienota pipeline pieprasījuma loģika (gan /generate, gan /regenerate)
// ═══════════════════════════════════════════════════════════════════

async function runPipelineRequest(endpoint, payload) {
  state.isGenerating = true;
  el.generateBtn.disabled = true;
  el.generateBtn.textContent = 'Ģenerē...';
  el.regenerateFromCnl.disabled = true;
  el.regenerateFromJson.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Servera kļūda: ${response.status}`);
    }

    await readSSE(response);
  } catch (err) {
    showError(err.message);
  } finally {
    state.isGenerating = false;
    el.generateBtn.disabled = false;
    el.generateBtn.textContent = 'Ģenerēt formu';
    el.regenerateFromCnl.disabled = false;
    el.regenerateFromJson.disabled = false;
    // Pēc perģenerēšanas atkārtoti pārvērtējam dirty statusu
    updateDirtyIndicators();
  }
}

async function readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const parsed = parseSSE(part);
      if (parsed) handleSSEEvent(parsed);
    }
  }
}

function parseSSE(raw) {
  const lines = raw.trim().split('\n');
  if (lines.length === 0) return null;

  let event = 'message';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }

  if (!data) return null;

  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data };
  }
}

function handleSSEEvent({ event, data }) {
  switch (event) {
    case 'stage':
      markStageStarted(data.stage);
      break;

    case 'cnl':
      // Atjauninām CNL un fiksējam to kā sākotnēju (oriģinālu) versiju
      el.outputCNL.value = data.content;
      state.originalCNL = data.content;
      el.outputCNL.disabled = false;
      el.metaCNL.innerHTML = renderMeta(data.metrics);
      markStageDone('cnl');
      updateDirtyIndicators();
      break;

    case 'json':
      // Atjauninām JSON un fiksējam kā oriģinālu
      const jsonStr = JSON.stringify(data.parsed, null, 2);
      el.outputJSON.value = jsonStr;
      state.originalJSON = jsonStr;
      state.jsonTree = data.parsed;
      el.outputJSON.disabled = false;
      el.metaJSON.innerHTML = renderMeta(data.metrics);
      markStageDone('json');
      updateDirtyIndicators();
      hideJsonError();
      break;

    case 'html':
      // HTML/CSS netiek attēlots kā teksts - rezultāts iet uz formas priekšskatījumu
      state.result = { html: data.html, css: data.css };
      el.metaHTML.innerHTML = renderMeta(data.metrics);
      markStageDone('html');
      renderFormPreview(data.html, data.css);
      el.viewCodeBtn.disabled = false;
      break;

    case 'audit':
      renderAudit(data.audit);
      el.metaAudit.innerHTML = renderAuditMeta(data.metrics);
      markStageDone('audit');
      updateNielsenMetric(data.audit);
      updateCompletenessMetric(data.audit);
      break;

    case 'audit_error':
      el.auditContent.innerHTML = `<p class="audit-warning">⚠ Audita kļūda: ${escapeHtml(data.message)}</p>`;
      markStageError('audit');
      break;

    case 'done':
      updateTotalMetrics(data.metrics);
      break;

    case 'error':
      showError(data.message);
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Rediģēšanas izsekošana - dirty stāvoklis
// ═══════════════════════════════════════════════════════════════════

function handleCnlEdit() {
  updateDirtyIndicators();
}

function handleJsonEdit() {
  // Klienta puses JSON validācija pa to laiku, kad lietotājs raksta
  const text = el.outputJSON.value.trim();
  if (text) {
    try {
      JSON.parse(text);
      hideJsonError();
    } catch (err) {
      showJsonError('Nederīgs JSON: ' + err.message.split('\n')[0]);
    }
  } else {
    hideJsonError();
  }
  updateDirtyIndicators();
}

function updateDirtyIndicators() {
  const cnlDirty = el.outputCNL.value !== state.originalCNL && state.originalCNL !== '';
  const jsonDirty = el.outputJSON.value !== state.originalJSON && state.originalJSON !== '';

  // CNL dirty stāvoklis
  if (cnlDirty) {
    el.dirtyCnl.classList.remove('hidden');
    el.regenerateFromCnl.classList.remove('hidden');
    el.stageCnl.classList.add('stage-dirty');
  } else {
    el.dirtyCnl.classList.add('hidden');
    el.regenerateFromCnl.classList.add('hidden');
    el.stageCnl.classList.remove('stage-dirty');
  }

  // JSON dirty stāvoklis - rāda pogu tikai ja JSON ir derīgs
  const jsonValid = isValidJson(el.outputJSON.value);
  if (jsonDirty && jsonValid) {
    el.dirtyJson.classList.remove('hidden');
    el.regenerateFromJson.classList.remove('hidden');
    el.stageJson.classList.add('stage-dirty');
  } else if (jsonDirty && !jsonValid) {
    // Dirty bet nederīgs - rādam indikatoru, bet pogu paslēpjam
    el.dirtyJson.classList.remove('hidden');
    el.regenerateFromJson.classList.add('hidden');
    el.stageJson.classList.add('stage-dirty');
  } else {
    el.dirtyJson.classList.add('hidden');
    el.regenerateFromJson.classList.add('hidden');
    el.stageJson.classList.remove('stage-dirty');
  }
}

function isValidJson(text) {
  if (!text || !text.trim()) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function showJsonError(msg) {
  el.jsonError.textContent = msg;
  el.jsonError.classList.remove('hidden');
}

function hideJsonError() {
  el.jsonError.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════
// UI atjaunināšana
// ═══════════════════════════════════════════════════════════════════

function markStageStarted(stage) {
  const stageEl = document.getElementById('stage' + capitalize(stage));
  if (!stageEl) return;
  const statusEl = stageEl.querySelector('.stage-status');
  statusEl.dataset.status = 'running';
  statusEl.textContent = 'Ģenerē...';
  stageEl.classList.add('stage-active');
  stageEl.classList.remove('stage-dirty'); // Tīrām dirty statusu, jo posms tiek atjaunots
}

function markStageDone(stage) {
  const stageEl = document.getElementById('stage' + capitalize(stage));
  if (!stageEl) return;
  const statusEl = stageEl.querySelector('.stage-status');
  statusEl.dataset.status = 'done';
  statusEl.textContent = 'Gatavs';
  stageEl.classList.remove('stage-active');
  stageEl.classList.add('stage-done');
}

function markStageError(stage) {
  const stageEl = document.getElementById('stage' + capitalize(stage));
  if (!stageEl) return;
  const statusEl = stageEl.querySelector('.stage-status');
  statusEl.dataset.status = 'error';
  statusEl.textContent = 'Kļūda';
  stageEl.classList.remove('stage-active');
}

function renderMeta(metrics) {
  if (!metrics) return '';
  if (metrics.skipped) return '⏭ izlaists (nemainīts no iepriekšējās ģenerēšanas)';
  const time = formatMs(metrics.durationMs);
  const tokIn = metrics.tokensIn || 0;
  const tokOut = metrics.tokensOut || 0;
  const cost = (metrics.costUsd || 0).toFixed(4);
  return `⏱ ${time} · ↓ ${tokIn} tok · ↑ ${tokOut} tok · 💲 ${cost}$`;
}

function renderAuditMeta(metrics) {
  if (!metrics) return '';
  const time = formatMs(metrics.durationMs);
  const tokIn = metrics.tokensIn || 0;
  const tokOut = metrics.tokensOut || 0;
  const cost = (metrics.costUsd || 0).toFixed(4);
  const auditor = metrics.auditorModel ? metrics.auditorModel.split('/').pop() : '';
  return `⏱ ${time} · ↓ ${tokIn} tok · ↑ ${tokOut} tok · 💲 ${cost}$ · 🤖 ${auditor}`;
}

function renderAudit(audit) {
  if (!audit || !audit.heuristics) {
    el.auditContent.innerHTML = '<p class="muted">Audita rezultāti nav pieejami.</p>';
    return;
  }

  const avgScore = audit.averageScore || 0;
  const stars = '★'.repeat(Math.round(avgScore)) + '☆'.repeat(5 - Math.round(avgScore));

  let html = `
    <div class="audit-summary">
      <div class="audit-avg">
        <span class="audit-score">${avgScore.toFixed(2)}/5</span>
        <span class="audit-stars">${stars}</span>
      </div>
      <p class="audit-summary-text">${escapeHtml(audit.summary || '')}</p>
    </div>
    <div class="audit-list">
  `;

  audit.heuristics.forEach(h => {
    const scoreClass = h.score >= 4 ? 'good' : h.score >= 3 ? 'mid' : 'low';
    html += `
      <div class="audit-item">
        <div class="audit-item-head">
          <span class="audit-item-name">${escapeHtml(h.name || ('Heiristika ' + h.id))}</span>
          <span class="audit-item-score audit-score-${scoreClass}">${h.score}/5</span>
        </div>
        <p class="audit-item-comment">${escapeHtml(h.comment || '')}</p>
      </div>
    `;
  });

  html += '</div>';

  if (audit.completeness) {
    const c = audit.completeness;
    let missingHtml = '';
    if (c.missingItems && c.missingItems.length > 0) {
      missingHtml = `<p class="audit-missing"><strong>Trūkstošās vienības:</strong> ${c.missingItems.map(escapeHtml).join(', ')}</p>`;
    }
    html += `
      <div class="audit-completeness">
        <h4>Prasību pilnīgums</h4>
        <p>Apstrādāts <strong>${c.requirementsCovered}</strong> no <strong>${c.totalRequirements}</strong> prasību vienībām</p>
        ${missingHtml}
      </div>
    `;
  }

  el.auditContent.innerHTML = html;
}

function updateNielsenMetric(audit) {
  if (!audit || typeof audit.averageScore !== 'number') return;
  el.mNielsen.textContent = audit.averageScore.toFixed(2) + '/5';
}

function updateCompletenessMetric(audit) {
  if (!audit || !audit.completeness) return;
  const c = audit.completeness;
  el.mCompleteness.textContent = `${c.requirementsCovered}/${c.totalRequirements}`;
}

function updateTotalMetrics(metrics) {
  if (!metrics) return;

  el.mModel.textContent = metrics.model ? metrics.model.split('/').pop() : '—';
  el.mTime.textContent = formatMs(metrics.totalMs);

  const totalIn = (metrics.cnl?.tokensIn || 0) + (metrics.json?.tokensIn || 0) + (metrics.html?.tokensIn || 0);
  const totalOut = (metrics.cnl?.tokensOut || 0) + (metrics.json?.tokensOut || 0) + (metrics.html?.tokensOut || 0);
  el.mTokens.textContent = `${totalIn} / ${totalOut}`;

  const genCost = metrics.generationCostUsd || 0;
  el.mCost.textContent = '$' + genCost.toFixed(4);
}

function resetUI() {
  // Outputs - tīrām un atspējojam rediģēšanu līdz pirmajai veiksmīgai ģenerēšanai
  el.outputCNL.value = '';
  el.outputCNL.placeholder = 'Ģenerē...';
  el.outputCNL.disabled = true;
  el.outputJSON.value = '';
  el.outputJSON.placeholder = 'Gaida CNL pabeigšanu...';
  el.outputJSON.disabled = true;
  el.auditContent.innerHTML = '<p class="muted small">Gaida HTML pabeigšanu...</p>';

  // Oriģinālie teksti
  state.originalCNL = '';
  state.originalJSON = '';
  state.jsonTree = null;

  // Meta
  el.metaCNL.textContent = '';
  el.metaJSON.textContent = '';
  el.metaHTML.textContent = '';
  el.metaAudit.textContent = '';

  // Statuses
  ['Cnl', 'Json', 'Html', 'Audit'].forEach(s => {
    const stageEl = document.getElementById('stage' + s);
    if (!stageEl) return;
    stageEl.classList.remove('stage-active', 'stage-done', 'stage-dirty');
    const statusEl = stageEl.querySelector('.stage-status');
    statusEl.dataset.status = 'waiting';
    statusEl.textContent = 'Gaida';
  });

  // Indikators dirty/pogas
  el.dirtyCnl.classList.add('hidden');
  el.dirtyJson.classList.add('hidden');
  el.regenerateFromCnl.classList.add('hidden');
  el.regenerateFromJson.classList.add('hidden');
  hideJsonError();

  // Form preview
  el.formPreview.innerHTML = '<p class="muted center">Ģenerē formu...</p>';

  // Metrics
  el.mModel.textContent = '—';
  el.mTime.textContent = '—';
  el.mTokens.textContent = '—';
  el.mCost.textContent = '—';
  el.mCompleteness.textContent = '—';
  el.mNielsen.textContent = '—';

  el.viewCodeBtn.disabled = true;
}

/**
 * Daļēja UI atjaunošana perģenerēšanas gadījumā.
 * Saglabājam to, kas paliek nemainīgs, un atjaunojam tikai posmus aiz fromStage.
 *
 * fromStage='json' (CNL rediģēts): paliek CNL kā ir, JSON/HTML/audit tiek pārģenerēti
 * fromStage='html' (JSON rediģēts): paliek CNL un JSON, HTML/audit tiek pārģenerēti
 */
function resetUIForRegenerate(fromStage) {
  const resetCnl = false; // CNL nekad netiek pārģenerēts no UI
  const resetJson = fromStage === 'json'; // tikai ja sākam no JSON posma
  const resetHtml = true;  // HTML vienmēr tiek pārģenerēts
  const resetAudit = true; // audits vienmēr atkārtots

  if (resetJson) {
    // CNL paliek kā ir, bet markējam ka tas tagad ir oriģināls
    state.originalCNL = el.outputCNL.value;
    el.outputJSON.value = '';
    el.outputJSON.placeholder = 'Pārģenerē...';
    state.originalJSON = '';
    state.jsonTree = null;
    el.metaJSON.textContent = '';
    const stageEl = el.stageJson;
    stageEl.classList.remove('stage-active', 'stage-done', 'stage-dirty');
    const statusEl = stageEl.querySelector('.stage-status');
    statusEl.dataset.status = 'waiting';
    statusEl.textContent = 'Gaida';
  } else {
    // CNL paliek kā oriģināls
    state.originalCNL = el.outputCNL.value;
    // JSON arī paliek kā oriģināls (ja lietotājs rediģēja - kā tagad ir)
    state.originalJSON = el.outputJSON.value;
  }

  if (resetHtml) {
    state.result = { html: '', css: '' };
    el.metaHTML.textContent = '';
    const stageEl = el.stageHtml;
    stageEl.classList.remove('stage-active', 'stage-done');
    const statusEl = stageEl.querySelector('.stage-status');
    statusEl.dataset.status = 'waiting';
    statusEl.textContent = 'Gaida';
    el.viewCodeBtn.disabled = true;
    el.formPreview.innerHTML = '<p class="muted center">Pārģenerē formu...</p>';
  }

  if (resetAudit) {
    el.metaAudit.textContent = '';
    el.auditContent.innerHTML = '<p class="muted small">Gaida HTML pabeigšanu...</p>';
    const stageEl = el.stageAudit;
    stageEl.classList.remove('stage-active', 'stage-done');
    const statusEl = stageEl.querySelector('.stage-status');
    statusEl.dataset.status = 'waiting';
    statusEl.textContent = 'Gaida';
    el.mNielsen.textContent = '—';
    el.mCompleteness.textContent = '—';
  }

  // Visu metru daļa - pārrāda tikai pēc 'done' notikuma
  el.mTime.textContent = '—';
  el.mTokens.textContent = '—';
  el.mCost.textContent = '—';

  // Tīrām dirty indikatorus, jo tagad sākam jaunu ciklu
  updateDirtyIndicators();
}

// ═══════════════════════════════════════════════════════════════════
// Shadow DOM rendering — formas priekšskatījums
// ═══════════════════════════════════════════════════════════════════

function renderFormPreview(html, css) {
  el.formPreview.innerHTML = '';

  const host = document.createElement('div');
  host.className = 'shadow-host';
  el.formPreview.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = css || '';
  shadow.appendChild(styleEl);

  const content = document.createElement('div');
  content.innerHTML = html || '';
  shadow.appendChild(content);

  shadow.querySelectorAll('form').forEach(f => {
    f.addEventListener('submit', e => {
      e.preventDefault();
      alert('Demo režīms: forma tika iesniegta');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// Modāls — kods
// ═══════════════════════════════════════════════════════════════════

function openCodeModal() {
  if (!state.result.html) return;
  state.currentTab = 'html';
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === 'html');
  });
  el.codeContent.textContent = state.result.html;
  el.codeModal.classList.remove('hidden');
}

function closeCodeModal() {
  el.codeModal.classList.add('hidden');
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  el.codeContent.textContent = getCodeForTab(tab);
}

function getCodeForTab(tab) {
  const { html, css } = state.result;
  if (tab === 'html') return html;
  if (tab === 'css') return css;
  return `<!DOCTYPE html>
<html lang="lv">
<head>
  <meta charset="UTF-8" />
  <style>
${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

async function handleCopy() {
  const code = getCodeForTab(state.currentTab);
  try {
    await navigator.clipboard.writeText(code);
    el.copyStatus.textContent = '✓ Nokopēts';
    setTimeout(() => { el.copyStatus.textContent = ''; }, 2000);
  } catch {
    el.copyStatus.textContent = 'Kļūda kopējot';
  }
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatMs(ms) {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

function showError(message) {
  el.errorBox.textContent = message;
  el.errorBox.classList.remove('hidden');
}

function hideError() {
  el.errorBox.classList.add('hidden');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
