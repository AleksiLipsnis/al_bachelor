# Form Generator — AI-asistēta formu ģenerēšana

Bakalaura darba praktiskā daļa — **"Mākslīgā intelekta asistēta lietotāja saskarnes formu ģenerēšana no prasību aprakstiem"**.

**Autors:** Aleksis Lipsnis
**Vadītāja:** Dr. sc. ing. prof. Oksana Ņikiforova
**RTU, 2026**

---

## Kas tas ir?

Tīmekļa lietotne, kas demonstrē daudzslāņu ģenerēšanas arhitektūru no bakalaura darba 1.2. attēla:

```
  Dabīgā valoda (jebkura)
         ↓
  Kontrolētā dabīgā valoda (CNL)      ← Posms 1
         ↓
  JSON komponentu koks                ← Posms 2 (starpreprezentācija)
         ↓
  HTML + CSS forma                    ← Posms 3
```

Lietotājs ievada prasību jebkurā valodā (latviešu, krievu, angļu, u.c.), un sistēma parāda **katru posmu reāllaikā** — CNL struktūru, JSON koku un galīgo HTML/CSS formu.

## Pētniecības aspekts

Lietotne izmanto **OpenRouter API**, kas sniedz piekļuvi 290+ modeļiem caur vienu API atslēgu. Tas ļauj salīdzināt:

- **Kvalitāti** (cik pareizi ģenerē CNL/JSON/HTML)
- **Ātrumu** (ģenerēšanas laiks katram posmam)
- **Cenu** (patērētos žetonus)

starp dažādām modeļu ģimenēm (Claude, GPT, Gemini, DeepSeek, Llama, Mistral, Qwen).

## Instalācija

### Priekšnosacījumi

- **Node.js** 18 vai jaunāks ([lejupielāde](https://nodejs.org/))
- **OpenRouter API atslēga** — iegūstiet bez maksas: https://openrouter.ai/keys

### Solis pa solim

```bash
# 1. Ieiet projekta mapē
cd form-generator

# 2. Instalēt atkarības
npm install

# 3. (Izvēles) izveidot .env failu ar API atslēgu
cp .env.example .env
# Atver .env un ieliek savu OPENROUTER_API_KEY

# 4. Palaist serveri
npm start
```

Atvērt pārlūkā: **http://localhost:3000**

> **Piezīme:** API atslēgu var ievadīt arī tieši lietotnes saskarnē — tā tiks saglabāta tikai tava pārlūka `localStorage`, nevis nosūtīta nekur citur, izņemot tavu lokālo serveri.

## Lietošana

1. Ievadiet savu OpenRouter API atslēgu
2. Izvēlieties modeli (sākumā iesaku **Claude Sonnet 4.5** — labākais strukturētai izvadei)
3. Aprakstiet formu brīvā tekstā (vai nospiediet kādu no piemēriem)
4. Nospiediet **"Ģenerēt formu"**
5. Vērojiet, kā secīgi parādās CNL → JSON → HTML
6. Nospiediet **"Skatīt kodu"**, lai redzētu un nokopētu HTML/CSS

## Projekta struktūra

```
form-generator/
├── backend/
│   ├── server.js       # Express serveris + SSE straumēšana
│   ├── pipeline.js     # 3 ģenerēšanas posmi (CNL, JSON, HTML)
│   └── models.js       # Pieejamo modeļu saraksts
├── frontend/
│   ├── index.html      # Galvenā lapa
│   ├── css/style.css   # Stili (minimālistisks dizains)
│   └── js/app.js       # SSE apstrāde un UI loģika
├── package.json
├── .env.example
└── README.md
```

## Kā strādā katra posma uzvedne

### Posms 1: CNL (Controlled Natural Language)
Uzvedne liek LLM pārveidot brīvas formas tekstu strukturētā šablonā ar laukiem: `LAUKS`, `TIPS`, `OBLIGĀTS`, `VALIDĀCIJA`, `KĻŪDAS ZIŅOJUMS`. Tas samazina neskaidrību [8].

### Posms 2: JSON komponentu koks
Uzvedne pārveido CNL par mašīnlasāmu JSON struktūru ar definētu šēmu. Izmanto **response_format: json_object** stingrai sintaksei.

### Posms 3: HTML + CSS
Ģenerē semantisku HTML ar ARIA atribūtiem un tīru CSS. Forma tiek renderēta Shadow DOM, lai neskartu galvenās lapas stilus.

## Tālāka pētīšana

Lai veidotu **rezultātu tabulu bakalaura darbam**, varat:

1. Palaist vienu un to pašu uzvedni ar dažādiem modeļiem
2. Salīdzināt metrikās — laiks, žetoni
3. Manuāli novērtēt kvalitāti pret Nīlsena heiristikām [21]
4. Veikt statistisku analīzi (piem., 10 ģenerēšanas reizes uz modeli)

## Licence

MIT — brīvi izmantojams akadēmiskā darbā ar atsauci.
