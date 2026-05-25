// backend/models.js
// Pieejamo OpenRouter modeļu saraksts pētījumam.
// Izvēlēti pārstāvji no galvenajiem piegādātājiem un cenu kategorijām,
// lai varētu salīdzināt kvalitāti, ātrumu un izmaksas.
//
// Cenas tiek izmantotas, lai aprēķinātu vienas ģenerēšanas izmaksas dolāros.
// Cenas - par 1 miljonu žetonu (in/out). Pārbaudīt aktualitāti https://openrouter.ai/models

const AVAILABLE_MODELS = [
  // ═══════════════════════════════════════════════════════════════
  // FRONTIER / PREMIUM MODEĻI - jaunākie un jaudīgākie
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'anthropic/claude-opus-4.7',
    name: 'Claude Opus 4.7',
    provider: 'Anthropic',
    tier: 'frontier',
    pricing: { input: 5.00, output: 25.00 },
    description: 'Anthropic frontier modelis - augsta precizitāte un zema halucināciju varbūtība'
  },
  {
    id: 'openai/gpt-5.5',
    name: 'GPT-5.5',
    provider: 'OpenAI',
    tier: 'frontier',
    pricing: { input: 2.50, output: 15.00 },
    description: 'OpenAI jaunākais frontier modelis ar uzlabotu agentic veiktspēju'
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    tier: 'frontier',
    pricing: { input: 0.55, output: 2.19 },
    description: 'DeepSeek frontier modelis - 1.6T parametri, salīdzināms ar GPT-5.5 par 1/10 cenas'
  },

  // ═══════════════════════════════════════════════════════════════
  // PREMIUM MODEĻI - mid-range, lielisks cenas-veiktspējas balanss
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    tier: 'premium',
    pricing: { input: 3.00, output: 15.00 },
    description: 'Anthropic mid-range modelis - laba strukturēta JSON izvade'
  },
  {
    id: 'openai/gpt-5.4',
    name: 'GPT-5.4',
    provider: 'OpenAI',
    tier: 'premium',
    pricing: { input: 2.50, output: 15.00 },
    description: 'Daudzpusīgs OpenAI ražošanas modelis ar 1M kontekstu'
  },

  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    tier: 'premium',
    pricing: { input: 1.25, output: 10.00 },
    description: 'Google multimodāls modelis ar lielu konteksta logu'
  },

  // ═══════════════════════════════════════════════════════════════
  // FAST / BUDGET MODEĻI - ātri un ekonomiski
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    tier: 'fast',
    pricing: { input: 1.00, output: 5.00 },
    description: 'Ātrs un lēts Claude variants, laba instrukciju ievērošana'
  },
  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'OpenAI',
    tier: 'fast',
    pricing: { input: 0.15, output: 0.60 },
    description: 'Ekonomiska GPT-5 versija, piemērota lieliem eksperimentiem'
  },

  // ═══════════════════════════════════════════════════════════════
  // OPEN-SOURCE - atvērtā pirmkoda modeļi salīdzināšanai
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'Meta',
    tier: 'budget',
    pricing: { input: 0.20, output: 0.60 },
    description: 'Meta jaunākais atvērtā pirmkoda modelis ar lielu konteksta logu'
  },
];

// Modelis, ko izmantot LLM auditoram (Nīlsena heiristiku vērtēšanai).
// Tas atšķiras no ģenerēšanas modeļa, lai izvairītos no pašnovērtējuma efekta.
const DEFAULT_AUDITOR_MODEL = 'anthropic/claude-opus-4.7';

// Funkcija, kas atgriež auditora modeli, kas atšķiras no ģenerēšanas modeļa.
// Ja ģenerēšana notika ar Anthropic - auditoram izmantojam GPT, un otrādi.
function getAuditorModel(generationModel) {
  if (generationModel.startsWith('anthropic/')) {
    return 'openai/gpt-5.5';
  }
  if (generationModel.startsWith('openai/')) {
    return 'anthropic/claude-opus-4.7';
  }
  return DEFAULT_AUDITOR_MODEL;
}

// Aprēķina vienas API izsaukuma izmaksas dolāros, balstoties uz žetonu skaitu
function calculateCost(modelId, tokensIn, tokensOut) {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
  if (!model || !model.pricing) return 0;

  // Cenas ir par 1 miljonu žetonu
  const costIn = (tokensIn / 1_000_000) * model.pricing.input;
  const costOut = (tokensOut / 1_000_000) * model.pricing.output;
  return costIn + costOut;
}

module.exports = {
  AVAILABLE_MODELS,
  DEFAULT_AUDITOR_MODEL,
  getAuditorModel,
  calculateCost
};
