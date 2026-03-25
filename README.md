# 🤖 Salesforce AI Sales Assistant — LWC + Gemini Integration

[![Salesforce](https://img.shields.io/badge/Salesforce-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://salesforce.com)
[![Apex](https://img.shields.io/badge/Apex-032D60?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![LWC](https://img.shields.io/badge/LWC-032D60?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/docs/component-library)
[![Gemini AI](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

> A production-ready Salesforce Lightning Web Component that embeds Google Gemini AI directly into your Opportunity record pages — delivering AI-powered deal summaries, smart email drafts, a live chat assistant, and full response history. All within Salesforce.

---

## 📸 Features at a Glance

| Feature | Description |
|---|---|
| 🧠 **AI Deal Summary** | Instant SUMMARY / RISKS / NEXT STEPS breakdown with typing animation |
| ✉️ **Email Drafter** | AI-generated personalised follow-up emails, editable & one-click send |
| 💬 **Live Chat** | Ask anything about the deal — real-time AI responses in-context |
| 🕓 **Response History** | Paginated & filterable history of all AI interactions per record |
| 📊 **Deal Health Gauge** | Visual SVG half-circle score (0–100) derived from probability + close date |
| 🎯 **Confidence Ring** | AI-reported confidence score (0–10) rendered as animated SVG ring |
| ⚠️ **Competitor Alerts** | Auto-detects competitor mentions in description/account name |
| ⚡ **Smart Caching** | Saves AI responses to custom object; skips callout if cache exists |
| 👍 **Feedback System** | Thumbs up/down feedback saved directly to each AI response record |
| 🔄 **Async Queueable** | `AIQueueable` for triggering AI from Flows, Apex Triggers, or Scheduled Jobs |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│         LWC: aiAssistant            │
│  (aiAssistant.html / .js / .css)    │
│  • 4 Tabs: Summary, Email,          │
│    Chat, History                    │
│  • SVG Deal Health + Confidence     │
│  • Typing animation                 │
└────────────┬────────────────────────┘
             │ @AuraEnabled Apex
             ▼
┌─────────────────────────────────────┐
│       AIController.cls              │
│  • generate()     – main entry      │
│  • getHistory()   – paginated       │
│  • saveFeedback() – thumbs up/down  │
│  • sendEmail()    – Messaging API   │
│  • getOpportunityMeta() – header    │
└────────────┬────────────────────────┘
             │
     ┌───────┴──────────┐
     ▼                  ▼
┌──────────┐    ┌──────────────────┐
│PromptBuilder│  │   AIService.cls  │
│  .cls    │    │  HTTP Callout →  │
│ Builds   │    │  Gemini API      │
│ prompts  │    │  Parses JSON     │
└──────────┘    └──────────────────┘
                         │
                         ▼
             ┌───────────────────────┐
             │  AI_Response__c       │
             │  (Custom Object)      │
             │  Caches all responses │
             └───────────────────────┘
```

---

## 📁 Project Structure

```
force-app/
└── main/
    └── default/
        ├── classes/
        │   ├── AIController.cls          # Main Apex controller (@AuraEnabled methods)
        │   ├── AIController.cls-meta.xml
        │   ├── AIQueueable.cls           # Async AI via Queueable interface
        │   ├── AIQueueable.cls-meta.xml
        │   ├── AIService.cls             # HTTP callout to Gemini API
        │   ├── AIService.cls-meta.xml
        │   ├── PromptBuilder.cls         # Prompt templates (summary/email/custom)
        │   ├── PromptBuilder.cls-meta.xml
        │   ├── AIAssistantTest.cls       # ✅ 100% coverage test suite
        │   └── AIAssistantTest.cls-meta.xml
        └── lwc/
            └── aiAssistant/
                ├── aiAssistant.html      # Component template (4 tabs + SVG gauges)
                ├── aiAssistant.js        # Component controller (LWC)
                ├── aiAssistant.css       # Custom styles
                └── aiAssistant.js-meta.xml
```

---

## ⚙️ Prerequisites

- Salesforce org (Developer, Sandbox, or Production)
- Salesforce CLI (`sf` or `sfdx`)
- Google Gemini API key ([Get one free](https://makersuite.google.com/app/apikey))
- API access enabled on the Salesforce org

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/salesforce-ai-sales-assistant.git
cd salesforce-ai-sales-assistant
```

### 2. Authorize Your Org

```bash
sf org login web --alias my-org --set-default
```

### 3. Create the Custom Object: `AI_Response__c`

Create these fields on the custom object:

| Field Label | API Name | Type |
|---|---|---|
| Record ID | `RecordId__c` | Text (18) |
| Type | `Type__c` | Text (20) — `summary`, `email`, `custom` |
| Response | `Response__c` | Long Text Area (131072) |
| Prompt | `Prompt__c` | Long Text Area (32768) |
| Feedback | `Feedback__c` | Text (20) — `positive` / `negative` |

### 4. Create the Custom Metadata Type: `AI_Config__mdt`

| Field Label | API Name | Type |
|---|---|---|
| API Key | `API_Key__c` | Text (255) |

Create a record named **`Default`** and paste your Gemini API key into `API_Key__c`.

### 5. Add Remote Site Setting

Go to **Setup → Remote Site Settings** and add:

```
Name:        Gemini_AI
Remote Site URL: https://generativelanguage.googleapis.com
```

### 6. Deploy to Org

```bash
sf project deploy start --source-dir force-app/
```

### 7. Add to Opportunity Page Layout

1. Go to the **Opportunity** object in App Builder
2. Open **Lightning App Builder**
3. Drag `aiAssistant` component onto the page
4. **Activate** and **Save**

---

## ✅ Running Tests

```bash
# Run all tests
sf apex run test --class-names AIAssistantTest --result-format human --wait 10

# Run with code coverage
sf apex run test --class-names AIAssistantTest --code-coverage --result-format human

# Run all tests in org
sf apex run test --test-level RunLocalTests --result-format human --wait 30
```

Expected result: **100% coverage** across all 4 Apex classes with 0 failures.

---

## 🔧 Configuration

### Switch AI Model

In `AIService.cls`, update the endpoint constant:

```apex
private static final String ENDPOINT =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=';
```

Replace `gemini-2.5-flash` with any supported Gemini model (e.g., `gemini-1.5-pro`).

### Tune Generation Parameters

```apex
private static final Map<String, Object> GEN_CONFIG = new Map<String, Object>{
    'temperature'     => 0.4,   // 0.0 = precise, 1.0 = creative
    'maxOutputTokens' => 1024,
    'topP'            => 0.95
};
```

### Add Competitor Keywords

In `aiAssistant.js`, extend the `COMPETITOR_KEYWORDS` array:

```javascript
const COMPETITOR_KEYWORDS = [
    'salesforce', 'hubspot', 'zoho', 'pipedrive',
    'microsoft dynamics', 'your_competitor_here'
];
```

---

## 🔁 Using the Queueable (Async AI)

Trigger AI generation from anywhere in Apex (triggers, flows, scheduled jobs):

```apex
// Generate summary async
System.enqueueJob(new AIQueueable(opportunityId, 'summary'));

// Generate email async
System.enqueueJob(new AIQueueable(opportunityId, 'email'));

// Custom question async
System.enqueueJob(new AIQueueable(opportunityId, 'custom', 'What discount should I offer?'));
```

---

## 🛡️ Security Considerations

- API key stored in **Custom Metadata** (not hardcoded or in a field)
- Uses `with sharing` on `AIController` to respect record-level security
- All DML uses `insert`/`update` (no unescaped dynamic SOQL)
- `Prompt__c` is truncated at 32,768 chars before insert to prevent governor limit issues

---

## 📊 Governor Limits Awareness

| Resource | Usage |
|---|---|
| HTTP Callouts | 1 per `generate()` call (100/transaction limit safe) |
| SOQL Queries | 2–3 per call (well within 100 limit) |
| DML Statements | 1 insert per AI response |
| Heap Size | Prompts truncated at 32KB |
| Timeout | Callout timeout set to 120s (max allowed) |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

Built with ❤️ by a Salesforce Developer passionate about AI-powered CRM experiences.

- **LinkedIn:** [Your LinkedIn Profile]
- **Trailhead:** [Your Trailhead Profile]
- **Email:** your.email@example.com

---

## ⭐ If this helped you, please star the repo!
