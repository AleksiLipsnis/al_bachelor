// backend/server.js
// Bakalaura darba prototipa serveris
// Arhitektūra: Natural Language → CNL → JSON component tree → HTML/CSS → LLM Audit
// Autors: Aleksis Lipsnis

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { generateCNL, generateJSON, generateHTML, auditWithNielsen } = require('./pipeline');
const { AVAILABLE_MODELS, getAuditorModel, calculateCost } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// --- API endpoints ---

// Pieejamo modeļu saraksts
app.get('/api/models', (req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

// ═══════════════════════════════════════════════════════════════════
// Pipeline izpildes plūsma (kopīga /api/generate un /api/regenerate)
//
// Pipeline posmi:
//   cnl    - Natural Language → CNL
//   json   - CNL → JSON komponentu koks
//   html   - JSON komponentu koks → HTML + CSS
//   audit  - LLM kvalitātes audits pret Nīlsena heiristikām
//
// Funkcijai tiek padots starta posms un jau pieejamie dati no iepriekšējiem posmiem
// (piem., ja sākam no 'json' posma, lietotājs ir rediģējis CNL un padod savu CNL versiju).
// ═══════════════════════════════════════════════════════════════════

async function runPipeline({ res, send, prompt, model, apiKey, fromStage, providedCNL, providedJSON }) {
  // Definējam visus posmus secīgi - tālāk darbojas tikai tie, kas ir aiz `fromStage`
  const stagesOrder = ['cnl', 'json', 'html', 'audit'];
  const fromIdx = stagesOrder.indexOf(fromStage);

  if (fromIdx === -1) {
    throw new Error(`Nezināms pipeline posms: ${fromStage}`);
  }

  // Metriku objekts katram posmam
  const metrics = {
    cnl:   { durationMs: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, skipped: fromIdx > 0 },
    json:  { durationMs: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, skipped: fromIdx > 1 },
    html:  { durationMs: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, skipped: fromIdx > 2 },
    audit: { durationMs: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, skipped: false, auditorModel: null },
    totalMs: 0,
    totalCostUsd: 0,
    model: model,
    startedFrom: fromStage
  };

  const startTotal = Date.now();
  let cnlText = providedCNL;
  let jsonTree = providedJSON;
  let htmlOutput = null;

  // ═══════════════════════════════════════════════════════════════
  // POSMS 1: Natural Language → CNL (palaiž tikai ja sākam no šejienes)
  // ═══════════════════════════════════════════════════════════════
  if (fromIdx === 0) {
    send('stage', { stage: 'cnl', status: 'start' });
    const t1 = Date.now();
    const cnlResult = await generateCNL(prompt, model, apiKey);
    metrics.cnl.durationMs = Date.now() - t1;
    metrics.cnl.tokensIn = cnlResult.usage?.prompt_tokens || 0;
    metrics.cnl.tokensOut = cnlResult.usage?.completion_tokens || 0;
    metrics.cnl.costUsd = calculateCost(model, metrics.cnl.tokensIn, metrics.cnl.tokensOut);
    cnlText = cnlResult.content;
    send('cnl', { content: cnlText, metrics: metrics.cnl });
  }

  // ═══════════════════════════════════════════════════════════════
  // POSMS 2: CNL → JSON (palaiž ja sākam no cnl vai json posma)
  // ═══════════════════════════════════════════════════════════════
  if (fromIdx <= 1) {
    if (!cnlText) {
      throw new Error('Trūkst CNL teksta posmam JSON');
    }
    send('stage', { stage: 'json', status: 'start' });
    const t2 = Date.now();
    const jsonResult = await generateJSON(cnlText, model, apiKey);
    metrics.json.durationMs = Date.now() - t2;
    metrics.json.tokensIn = jsonResult.usage?.prompt_tokens || 0;
    metrics.json.tokensOut = jsonResult.usage?.completion_tokens || 0;
    metrics.json.costUsd = calculateCost(model, metrics.json.tokensIn, metrics.json.tokensOut);
    jsonTree = jsonResult.parsed;
    send('json', { content: jsonResult.content, parsed: jsonTree, metrics: metrics.json });
  }

  // ═══════════════════════════════════════════════════════════════
  // POSMS 3: JSON → HTML/CSS (palaiž visās perģenerēšanas situācijās līdz audita)
  // ═══════════════════════════════════════════════════════════════
  if (fromIdx <= 2) {
    if (!jsonTree) {
      throw new Error('Trūkst JSON koka posmam HTML');
    }
    send('stage', { stage: 'html', status: 'start' });
    const t3 = Date.now();
    htmlOutput = await generateHTML(jsonTree, model, apiKey);
    metrics.html.durationMs = Date.now() - t3;
    metrics.html.tokensIn = htmlOutput.usage?.prompt_tokens || 0;
    metrics.html.tokensOut = htmlOutput.usage?.completion_tokens || 0;
    metrics.html.costUsd = calculateCost(model, metrics.html.tokensIn, metrics.html.tokensOut);
    send('html', { html: htmlOutput.html, css: htmlOutput.css, metrics: metrics.html });
  }

  // Aprēķinām ģenerēšanas (3 pirmie posmi) kopējās izmaksas
  const generationCost = metrics.cnl.costUsd + metrics.json.costUsd + metrics.html.costUsd;

  // ═══════════════════════════════════════════════════════════════
  // POSMS 4: LLM kvalitātes audits (vienmēr palaiž, jo ir atkarīgs no HTML)
  // ═══════════════════════════════════════════════════════════════
  // Tiek izmantots cits modelis nekā ģenerēšanā, lai izvairītos no pašnovērtējuma efekta.
  if (!htmlOutput) {
    // Šī situācija nedrīkstētu rasties, jo HTML vienmēr tiek palaists
    throw new Error('Trūkst HTML rezultāta auditam');
  }

  send('stage', { stage: 'audit', status: 'start' });
  const auditorModel = getAuditorModel(model);
  const t4 = Date.now();

  try {
    const auditResult = await auditWithNielsen({
      originalPrompt: prompt,
      jsonTree: jsonTree,
      html: htmlOutput.html,
      model: auditorModel,
      apiKey: apiKey
    });

    metrics.audit.durationMs = Date.now() - t4;
    metrics.audit.tokensIn = auditResult.usage?.prompt_tokens || 0;
    metrics.audit.tokensOut = auditResult.usage?.completion_tokens || 0;
    metrics.audit.costUsd = calculateCost(auditorModel, metrics.audit.tokensIn, metrics.audit.tokensOut);
    metrics.audit.auditorModel = auditorModel;

    send('audit', {
      audit: auditResult.audit,
      metrics: metrics.audit
    });
  } catch (auditErr) {
    // Auditora kļūda nedrīkst sabojāt visu plūsmu - ģenerēšana jau ir gatava
    console.error('[AUDIT ERROR]', auditErr.message);
    send('audit_error', { message: auditErr.message });
  }

  // Kopējie rezultāti
  metrics.totalMs = Date.now() - startTotal;
  metrics.totalCostUsd = generationCost + metrics.audit.costUsd;
  metrics.generationCostUsd = generationCost;

  send('done', { metrics });
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/generate - pilna pipeline plūsma no nulles
// ═══════════════════════════════════════════════════════════════════
app.post('/api/generate', async (req, res) => {
  const { prompt, model, apiKey } = req.body;

  if (!prompt || !model) {
    return res.status(400).json({ error: 'Trūkst prompt vai model parametra' });
  }

  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key || key === 'sk-or-v1-YOUR_KEY_HERE') {
    return res.status(400).json({
      error: 'OpenRouter API atslēga nav konfigurēta. Ievadiet to UI vai .env failā.'
    });
  }

  setupSSE(res);
  const send = makeSseSender(res);

  try {
    await runPipeline({
      res, send,
      prompt, model, apiKey: key,
      fromStage: 'cnl',
      providedCNL: null,
      providedJSON: null
    });
    res.end();
  } catch (err) {
    console.error('[GENERATE ERROR]', err);
    send('error', { message: err.message || 'Nezināma kļūda' });
    res.end();
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/regenerate - perģenerēšana no konkrēta posma
//
// Lietotājs ir rediģējis CNL vai JSON UI un grib palaist tikai turpmākos posmus.
// Tas ir koncepcijas galvenais ieguvums - lokālas korekcijas bez visa pipeline atkārtošanas.
//
// Parametri:
//   prompt   - oriģinālais lietotāja prasību apraksts (auditā nepieciešams)
//   model    - LLM modelis
//   apiKey   - API atslēga
//   fromStage - 'json' (ja CNL rediģēts) vai 'html' (ja JSON rediģēts)
//   cnl      - rediģētais CNL teksts (obligāts ja fromStage='json')
//   json     - rediģētais JSON koks (obligāts ja fromStage='html')
// ═══════════════════════════════════════════════════════════════════
app.post('/api/regenerate', async (req, res) => {
  const { prompt, model, apiKey, fromStage, cnl, json } = req.body;

  if (!prompt || !model) {
    return res.status(400).json({ error: 'Trūkst prompt vai model parametra' });
  }
  if (!fromStage || !['json', 'html'].includes(fromStage)) {
    return res.status(400).json({ error: 'Nepareizs fromStage. Atļauts: json, html' });
  }
  if (fromStage === 'json' && !cnl) {
    return res.status(400).json({ error: 'Trūkst rediģētā CNL teksta' });
  }
  if (fromStage === 'html' && !json) {
    return res.status(400).json({ error: 'Trūkst rediģētā JSON koka' });
  }

  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key || key === 'sk-or-v1-YOUR_KEY_HERE') {
    return res.status(400).json({
      error: 'OpenRouter API atslēga nav konfigurēta.'
    });
  }

  // Ja lietotājs padod JSON virknei - mēģinām parsēt
  let parsedJSON = null;
  if (fromStage === 'html') {
    try {
      parsedJSON = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (err) {
      return res.status(400).json({ error: 'Nederīgs JSON formāts: ' + err.message });
    }
  }

  setupSSE(res);
  const send = makeSseSender(res);

  try {
    await runPipeline({
      res, send,
      prompt, model, apiKey: key,
      fromStage,
      providedCNL: cnl || null,
      providedJSON: parsedJSON
    });
    res.end();
  } catch (err) {
    console.error('[REGENERATE ERROR]', err);
    send('error', { message: err.message || 'Nezināma kļūda' });
    res.end();
  }
});

// --- Palīgfunkcijas SSE protokolam ---

function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function makeSseSender(res) {
  return function send(event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  Form Generator - Bakalaura darba prototips          ║`);
  console.log(`║  Aleksis Lipsnis, RTU 2026                           ║`);
  console.log(`╠══════════════════════════════════════════════════════╣`);
  console.log(`║  Serveris darbojas: http://localhost:${PORT}           ║`);
  console.log(`║  Pipeline: NL → CNL → JSON → HTML/CSS + Audits      ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
});
