/**
 * AIController — Advanced AI Sales Assistant
 * 
 * Features:
 *  - Summary caching (reads saved summary before calling AI)
 *  - Refresh-force flag to bypass cache
 *  - Rich Opportunity query (Account, Owner, Close Date, Probability)
 *  - Email recipient pulled from primary Contact on Opportunity
 *  - Paginated history with type filter
 *  - Feedback (thumbs up/down) on AI responses
 */
public with sharing class AIController {

    // ─────────────────────────────────────────────
    // GENERATE / CACHED SUMMARY
    // ─────────────────────────────────────────────

    @AuraEnabled
    public static Map<String, Object> generate(
        Id recordId,
        String type,
        String prompt,
        Boolean forceRefresh
    ) {
        Map<String, Object> result = new Map<String, Object>();

        // ── Fetch cached summary (skip AI call if available & not forcing refresh) ──
        if (type == 'summary' && forceRefresh != true) {
            AI_Response__c cached = getCachedSummary(recordId);
            if (cached != null) {
                result.put('response',  cached.Response__c);
                result.put('fromCache', true);
                result.put('cachedAt',  String.valueOf(cached.CreatedDate));
                result.put('responseId', cached.Id);
                return result;
            }
        }

        // ── Fetch Opportunity with full fields ──
        Opportunity opp = getOpportunity(recordId);

        // ── Build prompt ──
        String finalPrompt;
        if      (type == 'summary') { finalPrompt = PromptBuilder.buildOpportunitySummary(opp); }
        else if (type == 'email')   { finalPrompt = PromptBuilder.buildEmailPrompt(opp);        }
        else if (type == 'custom')  {
            if (String.isBlank(prompt)) {
                result.put('error', 'Please enter a question.');
                return result;
            }
            finalPrompt = PromptBuilder.buildCustomPrompt(prompt, opp);
        }
        else {
            result.put('error', 'Invalid request type.');
            return result;
        }

        // ── Call AI ──
        String response = AIService.generateResponse(finalPrompt);

        if (response != null && response.startsWith('❌')) {
            result.put('error', response);
            return result;
        }

        // ── Save response ──
        AI_Response__c rec = new AI_Response__c(
            RecordId__c  = recordId,
            Type__c      = type,
            Response__c  = response,
            Prompt__c    = finalPrompt.left(32768)
        );
        insert rec;

        result.put('response',   response);
        result.put('fromCache',  false);
        result.put('responseId', rec.Id);
        return result;
    }

    // ─────────────────────────────────────────────
    // HISTORY
    // ─────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static List<AI_Response__c> getHistory(Id recordId, String typeFilter, Integer pageSize) {
        Integer lim = (pageSize != null && pageSize > 0) ? pageSize : 10;
        if (String.isBlank(typeFilter) || typeFilter == 'all') {
            return [
                SELECT Id, Type__c, Response__c, CreatedDate, Feedback__c
                FROM   AI_Response__c
                WHERE  RecordId__c = :recordId
                ORDER BY CreatedDate DESC
                LIMIT :lim
            ];
        }
        return [
            SELECT Id, Type__c, Response__c, CreatedDate, Feedback__c
            FROM   AI_Response__c
            WHERE  RecordId__c = :recordId
            AND    Type__c     = :typeFilter
            ORDER BY CreatedDate DESC
            LIMIT :lim
        ];
    }

    // ─────────────────────────────────────────────
    // FEEDBACK (thumbs up / down)
    // ─────────────────────────────────────────────

    @AuraEnabled
    public static void saveFeedback(Id responseId, String feedback) {
        AI_Response__c rec = [SELECT Id FROM AI_Response__c WHERE Id = :responseId LIMIT 1];
        rec.Feedback__c = feedback;
        update rec;
    }

    // ─────────────────────────────────────────────
    // SEND EMAIL
    // ─────────────────────────────────────────────

    @AuraEnabled
    public static Map<String, Object> sendEmail(Id recordId, String emailBody, String subject) {
        Map<String, Object> result = new Map<String, Object>();
        try {
            Opportunity opp = [
                SELECT Name, Account.Name,
                       (SELECT Contact.Email, Contact.Name FROM OpportunityContactRoles
                        WHERE IsPrimary = true LIMIT 1)
                FROM   Opportunity
                WHERE  Id = :recordId
                LIMIT  1
            ];

            String toEmail = 'placeholder@example.com';
            String toName  = 'Customer';

            if (!opp.OpportunityContactRoles.isEmpty()) {
                OpportunityContactRole ocr = opp.OpportunityContactRoles[0];
                if (String.isNotBlank(ocr.Contact.Email)) {
                    toEmail = ocr.Contact.Email;
                    toName  = ocr.Contact.Name;
                }
            }

            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setToAddresses(new String[]{ toEmail });
            mail.setSubject(String.isBlank(subject) ? 'Follow-up: ' + opp.Name : subject);
            mail.setHtmlBody(emailBody.replace('\n', '<br/>'));

            Messaging.sendEmail(new Messaging.SingleEmailMessage[]{ mail });

            result.put('success', true);
            result.put('message', '✅ Email sent to ' + toName + ' (' + toEmail + ')');
        } catch (Exception e) {
            result.put('success', false);
            result.put('message', '❌ Email failed: ' + e.getMessage());
        }
        return result;
    }

    // ─────────────────────────────────────────────
    // OPPORTUNITY META (for LWC header)
    // ─────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getOpportunityMeta(Id recordId) {
        Opportunity opp = getOpportunity(recordId);
        Map<String, Object> meta = new Map<String, Object>();
        meta.put('name',        opp.Name);
        meta.put('stage',       opp.StageName);
        meta.put('amount',      opp.Amount);
        meta.put('probability', opp.Probability);
        meta.put('closeDate',   String.valueOf(opp.CloseDate));
        meta.put('accountName', opp.Account != null ? opp.Account.Name : '');
        meta.put('ownerName',   opp.Owner  != null ? opp.Owner.Name   : '');
        meta.put('description', opp.Description != null ? opp.Description : '');
        return meta;
    }

    // ─────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────

    private static AI_Response__c getCachedSummary(Id recordId) {
        List<AI_Response__c> cached = [
            SELECT Id, Response__c, CreatedDate
            FROM   AI_Response__c
            WHERE  RecordId__c = :recordId
            AND    Type__c     = 'summary'
            ORDER BY CreatedDate DESC
            LIMIT  1
        ];
        return cached.isEmpty() ? null : cached[0];
    }

    private static Opportunity getOpportunity(Id recordId) {
        return [
            SELECT Id, Name, StageName, Amount, Probability, CloseDate,
                   Description, LeadSource, Type,
                   Account.Name, Account.Industry, Account.AnnualRevenue,
                   Owner.Name, Owner.Email
            FROM   Opportunity
            WHERE  Id = :recordId
            LIMIT  1
        ];
    }
}