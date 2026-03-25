/**
 * AIService — Handles all callouts to Gemini (or any LLM endpoint).
 *
 * To swap models: update the ENDPOINT constant and body shape.
 * API Key is stored in Custom Metadata: AI_Config__mdt.Default.API_Key__c
 */
public with sharing class AIService {

    private static final String ENDPOINT =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=';

    // Generation config — tune temperature for creativity vs precision
    private static final Map<String, Object> GEN_CONFIG = new Map<String, Object>{
        'temperature'     => 0.4,
        'maxOutputTokens' => 1024,
        'topP'            => 0.95
    };

    public static String generateResponse(String prompt) {
        try {
            AI_Config__mdt config = AI_Config__mdt.getInstance('Default');
            if (config == null || String.isBlank(config.API_Key__c)) {
                return '❌ API Key not configured in AI_Config__mdt (Custom Metadata).';
            }

            Http http       = new Http();
            HttpRequest req = new HttpRequest();
            req.setEndpoint(ENDPOINT + config.API_Key__c.trim());
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(120000);

            Map<String, Object> body = new Map<String, Object>{
                'contents' => new List<Object>{
                    new Map<String, Object>{
                        'parts' => new List<Object>{
                            new Map<String, Object>{ 'text' => prompt }
                        }
                    }
                },
                'generationConfig' => GEN_CONFIG
            };

            req.setBody(JSON.serialize(body));

            HttpResponse res = http.send(req);

            if (res.getStatusCode() != 200) {
                System.debug(LoggingLevel.ERROR, 'Gemini HTTP ' + res.getStatusCode() + ': ' + res.getBody());
                return '❌ Gemini API Error ' + res.getStatusCode() + '. Check debug logs.';
            }

            return parseResponse(res.getBody());

        } catch (CalloutException ce) {
            System.debug(LoggingLevel.ERROR, 'Callout failed: ' + ce.getMessage());
            return '❌ Callout Error: ' + ce.getMessage();
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'AIService Error: ' + e.getMessage());
            return '❌ Error: ' + e.getMessage();
        }
    }

    // ─────────────────────────────────────────────
    // PRIVATE: Parse Gemini response JSON
    // ─────────────────────────────────────────────

    private static String parseResponse(String body) {
        try {
            Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(body);

            List<Object> candidates = (List<Object>) root.get('candidates');
            if (candidates == null || candidates.isEmpty()) {
                return '❌ No candidates returned by AI.';
            }

            Map<String, Object> content = (Map<String, Object>)
                ((Map<String, Object>) candidates[0]).get('content');
            if (content == null) { return '❌ Empty content from AI.'; }

            List<Object> parts = (List<Object>) content.get('parts');
            if (parts == null || parts.isEmpty()) { return '❌ No parts in AI content.'; }

            String text = '';
            for (Object p : parts) {
                Object t = ((Map<String, Object>) p).get('text');
                if (t != null) { text += (String) t; }
            }

            return String.isBlank(text) ? '❌ AI returned blank response.' : text.trim();

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Parse error: ' + e.getMessage() + ' | body: ' + body);
            return '❌ Failed to parse AI response. Check logs.';
        }
    }
}