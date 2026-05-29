const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenRouter({ model, apiKey, system, user, jsonMode = false }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2, 
    max_tokens: 10000
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Form Generator - RTU Bachelor Thesis'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API kļūda (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};

  console.log(`[${model}] finish_reason: ${data.choices?.[0]?.finish_reason}, tokens: in=${usage.prompt_tokens} out=${usage.completion_tokens}, cost estimate via UI`);

  return { content, usage };
}

const CNL_SYSTEM_PROMPT = `Tu esi prasību inženieris, kas pārveido brīvas formas lietotāja aprakstus Kontrolētās Dabīgās Valodas (CNL) specifikācijā.

CNL ŠABLONS formas prasībām:

FORMA: <formas nosaukums>
MĒRĶIS: <īss mērķa apraksts>

LAUKI:
  LAUKS: <nosaukums>
    TIPS: <text | email | password | number | tel | url | date | textarea | select | radio | checkbox>
    ETIĶETE: <redzamā etiķete lietotājam>
    OBLIGĀTS: <jā | nē>
    PLACEHOLDER: <palīgteksts, ja nepieciešams>
    VALIDĀCIJA: <validācijas noteikumi vai "nav">
    KĻŪDAS ZIŅOJUMS: <teksts, ko rādīt kļūdas gadījumā>
    IESPĒJAS: <tikai select/radio/checkbox: saraksts atdalīts ar |>

DARBĪBAS:
  POGA: <teksts>
    TIPS: <primary | secondary | destructive>
    DARBĪBA: <submit | reset | cancel>

NOTEIKUMI:
1. Atbildi TIKAI CNL formātā, bez papildu paskaidrojumiem.
2. Saglabā lietotāja ievadītās valodas etiķetes (latviešu, krievu, angļu u.c.).
3. Ja lietotājs nav norādījis lauku, BET tas ir loģiski nepieciešams (piem., pieteikumam vajag e-pastu), pievieno to.
4. Obligāti aizpildi validāciju un kļūdas ziņojumus katram laukam.
5. Vienmēr ir vismaz viena primary poga iesniegšanai.`;

async function generateCNL(userPrompt, model, apiKey) {
  const userMessage = `Lietotāja brīvais apraksts:
"""
${userPrompt}
"""

Pārveido šo aprakstu CNL formātā atbilstoši šablonam.`;

  return await callOpenRouter({
    model, apiKey,
    system: CNL_SYSTEM_PROMPT,
    user: userMessage,
    jsonMode: false
  });
}

const JSON_SCHEMA_EXAMPLE = {
  formName: "Pieteikuma forma",
  purpose: "Lietotāja pieteikums kontam",
  fields: [
    {
      id: "email",
      type: "email",
      label: "E-pasts",
      required: true,
      placeholder: "jusu.vards@piemers.lv",
      validation: { pattern: "email", minLength: 5 },
      errorMessage: "Lūdzu, ievadiet derīgu e-pasta adresi"
    },
    {
      id: "password",
      type: "password",
      label: "Parole",
      required: true,
      placeholder: "Vismaz 8 rakstzīmes",
      validation: { minLength: 8 },
      errorMessage: "Parolei jābūt vismaz 8 rakstzīmes garai"
    }
  ],
  actions: [
    { id: "submit", label: "Pieteikties", type: "primary", action: "submit" },
    { id: "cancel", label: "Atcelt", type: "secondary", action: "cancel" }
  ]
};

const JSON_SYSTEM_PROMPT = `Tu esi specializēts transformācijas rīks, kas pārveido CNL specifikāciju par JSON komponentu koku.

JSON SHĒMA (obligāta struktūra):
${JSON.stringify(JSON_SCHEMA_EXAMPLE, null, 2)}

LAUKU TIPI: text, email, password, number, tel, url, date, textarea, select, radio, checkbox.

Papildu lauki tiek pievienoti attiecīgi:
  - select/radio/checkbox: pievieno "options": [{ "value": "v1", "label": "Etiķete 1" }, ...]
  - number: validation var saturēt "min", "max"
  - text/textarea: validation var saturēt "minLength", "maxLength", "pattern"

NOTEIKUMI:
1. Atbildi TIKAI ar derīgu JSON objektu, bez Markdown, bez paskaidrojumiem.
2. Katram laukam "id" ir kamieļa stila identifikators (firstName, emailAddress u.c.).
3. Saglabā visu informāciju no CNL ieraksta.
4. Nepapildini ar laukiem, kas nebija CNL.`;

async function generateJSON(cnlText, model, apiKey) {
  const userMessage = `CNL specifikācija:
"""
${cnlText}
"""

Pārveido to JSON komponentu kokā atbilstoši šēmai.`;

  const result = await callOpenRouter({
    model, apiKey,
    system: JSON_SYSTEM_PROMPT,
    user: userMessage,
    jsonMode: true
  });

  let parsed = null;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    const match = result.content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        throw new Error('Neizdevās parsēt JSON no modeļa atbildes: ' + e.message);
      }
    } else {
      throw new Error('Modelis neatgrieza derīgu JSON');
    }
  }

  return { ...result, parsed };
}

const HTML_SYSTEM_PROMPT = `Tu esi priekšpuses izstrādātājs, kas ģenerē HTML un CSS no JSON komponentu koka.

ATBILDES FORMĀTA OBLIGĀTĀS PRASĪBAS (kritiski - JSON parsēšana iet uz priekšu uzreiz):
1. Atbildi TIKAI ar derīgu JSON objektu ar tieši diviem laukiem: "html" un "css".
2. Bez Markdown apvalka, bez paskaidrojumiem, bez teksta pirms vai pēc JSON.
3. Visas teksta vērtības JSON laukos jābūt korekti aizvietotām (escaped):
   - Dubultās pēdiņas iekšā vērtībā kā \\"
   - Atpakaļvērstās slīpsvītras kā \\\\
   - Jaunās rindas kā \\n (nevis tiešais teksta jaunās rindas raksturs!)
   - Tabulators kā \\t
4. NEIZMANTO <script> tagus HTML iekšā. Visu interaktivitāti realizē tikai ar HTML un CSS:
   - Zvaigžņu vērtējumu - ar radio pogu kopu un CSS :checked pseudo-klasi
   - Saliekamie izvēles saraksti - ar standarta <select> elementu
   - Validāciju - ar HTML5 atribūtiem (required, pattern, minlength) un CSS :invalid pseudoklasi
5. Izvairies no liela apjoma vienā rindā - ja CSS ir garš, glabā to ar saliktiem selektoriem vairākās rindās (atceries jaunās rindas escapēt kā \\n).

HTML PRASĪBAS:
- Semantisks HTML5 (<form>, <label>, <input>, <button>).
- Katram <input> ir saistīts <label> caur for/id.
- Obligātajiem laukiem aria-required="true".
- Kļūdu ziņojumi saistīti caur aria-describedby.
- Teksta virziens atbilst ievades valodai.
- Zvaigžņu vērtējumam (jeb 1-5 zvaigznes) izmanto radio pogu kopu, ko ar CSS pārveidot par klikšķināmām ikonām (parasta tehnika ir reverse-row + :checked + ~ selektors).

CSS PRASĪBAS:
- Mūsdienīgs, tīrs dizains (nav jātēlo materiāls vai bootstrap).
- Kontrastaugsts tekstu un fonu kombinācija (WCAG AA).
- Fokusa rāmji interaktīviem elementiem.
- Responsīvs (mobilie un darbvirsmas).
- Sarkana primārā poga ir slikts dizains - izmanto zilus vai zaļus toņus primārajām, sarkanu tikai destructive.
- Izmanto CSS klašu pieeju (nav inline stili).
- Forma centrēta, max-width: 480px, laba atstarpe.

PIEMĒRS atbildes (uzmanība uz korektu escape sekvenču izmantošanu):
{"html":"<form class=\\"form\\">\\n  <label for=\\"name\\">Vārds</label>\\n  <input id=\\"name\\" required>\\n</form>","css":".form{max-width:480px;margin:0 auto;}\\n.form input{padding:8px;}"}`;

async function generateHTML(jsonTree, model, apiKey) {
  const userMessage = `JSON komponentu koks:
"""
${JSON.stringify(jsonTree, null, 2)}
"""

Ģenerē HTML un CSS šai formai. Atceries: JSON laukos visas pēdiņas, slīpsvītras un jaunās rindas jābūt korekti escapētām.`;

  const result = await callOpenRouter({
    model, apiKey,
    system: HTML_SYSTEM_PROMPT,
    user: userMessage,
    jsonMode: true
  });

  const parsed = extractHtmlCss(result.content);
  if (!parsed) {
    throw new Error('Neizdevās izvilkt HTML/CSS no modeļa atbildes pat ar fallback metodēm');
  }

  return {
    html: parsed.html || '',
    css: parsed.css || '',
    usage: result.usage
  };
}

function extractHtmlCss(content) {
  if (!content) return null;

  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj === 'object') {
      return { html: obj.html || '', css: obj.css || '' };
    }
  } catch (_) {
  }

  let cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const objStr = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const obj = JSON.parse(objStr);
      if (obj && typeof obj === 'object') {
        return { html: obj.html || '', css: obj.css || '' };
      }
    } catch (_) {
    }
  }

  const htmlMatch = cleaned.match(/"html"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  const cssMatch = cleaned.match(/"css"\s*:\s*"((?:[^"\\]|\\.)*)"/s);

  if (htmlMatch || cssMatch) {
    const unescape = s => s
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\');
    return {
      html: htmlMatch ? unescape(htmlMatch[1]) : '',
      css: cssMatch ? unescape(cssMatch[1]) : ''
    };
  }

  return null;
}

const NIELSEN_HEURISTICS = [
  '1. Sistēmas statusa redzamība',
  '2. Atbilstība starp sistēmu un reālo pasauli',
  '3. Lietotāja kontrole un brīvība',
  '4. Konsekvence un standarti',
  '5. Kļūdu novēršana',
  '6. Atpazīšana, nevis atcerēšanās',
  '7. Elastīgums un efektivitāte',
  '8. Estētisks un minimālistisks dizains',
  '9. Palīdzība kļūdu atpazīšanā un novēršanā',
  '10. Palīdzība un dokumentācija'
];

const AUDIT_SYSTEM_PROMPT = `Tu esi UX eksperts, kas vērtē lietotāja saskarnes formas kvalitāti pret Nīlsena 10 lietojamības heiristikām.

DESMIT HEIRISTIKAS:
${NIELSEN_HEURISTICS.join('\n')}

UZDEVUMS:
Tev tiks dots:
1. Sākotnējais lietotāja prasību apraksts
2. Ģenerētā formas JSON struktūra
3. Ģenerētais HTML kods

Tev jāizvērtē forma pret katru no 10 Nīlsena heiristikām un jāatgriež strukturēta atbilde.

IZVADES FORMĀTS (obligāti JSON):
{
  "heuristics": [
    {
      "id": 1,
      "name": "Sistēmas statusa redzamība",
      "score": <skaitlis no 1 līdz 5, kur 5 = pilnīga atbilstība>,
      "comment": "<īss konkrēts komentārs latviešu valodā: kas ir labi, kas nav>"
    },
    ... (kopā 10 elementi - viens katrai heiristikai)
  ],
  "averageScore": <vidējais visu 10 heiristiku vērtējums>,
  "summary": "<2-3 teikumu kopējais novērtējums>",
  "completeness": {
    "requirementsCovered": <skaitlis: cik no sākotnējām prasību vienībām ir formā>,
    "totalRequirements": <skaitlis: cik vienības bija sākotnējā aprakstā>,
    "missingItems": [<saraksts ar trūkstošajām vienībām, ja tādas ir>]
  }
}

NOTEIKUMI:
1. Atbildi TIKAI ar derīgu JSON objektu, bez Markdown, bez paskaidrojumiem.
2. Vērtējumi 1-5 jābūt veseliem skaitļiem.
3. Komentāri jābūt konkrēti, ne vispārīgi (piem., "kļūdu ziņojumi ir, bet pārāk vispārīgi", nevis "lietojamība laba").
4. Ja heiristika nav piemērojama šai formai, dod 5 ar komentāru "Nav piemērojama šajā kontekstā".`;

async function auditWithNielsen({ originalPrompt, jsonTree, html, model, apiKey }) {
  const userMessage = `SĀKOTNĒJAIS PRASĪBU APRAKSTS:
"""
${originalPrompt}
"""

ĢENERĒTĀ FORMAS JSON STRUKTŪRA:
"""
${JSON.stringify(jsonTree, null, 2)}
"""

ĢENERĒTAIS HTML KODS:
"""
${html}
"""

Veic auditu pret 10 Nīlsena heiristikām un atgriež strukturētu JSON atbildi.`;

  const result = await callOpenRouter({
    model, apiKey,
    system: AUDIT_SYSTEM_PROMPT,
    user: userMessage,
    jsonMode: true
  });

  let parsed = null;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    const match = result.content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        throw new Error('Neizdevās parsēt audita JSON: ' + e.message);
      }
    } else {
      throw new Error('Auditors neatgrieza derīgu JSON');
    }
  }

  if (parsed.heuristics && Array.isArray(parsed.heuristics) && parsed.heuristics.length > 0) {
    if (typeof parsed.averageScore !== 'number') {
      const sum = parsed.heuristics.reduce((s, h) => s + (Number(h.score) || 0), 0);
      parsed.averageScore = Number((sum / parsed.heuristics.length).toFixed(2));
    }
  }

  return {
    audit: parsed,
    usage: result.usage,
    auditorModel: model
  };
}

module.exports = {
  generateCNL,
  generateJSON,
  generateHTML,
  auditWithNielsen,
  NIELSEN_HEURISTICS
};
