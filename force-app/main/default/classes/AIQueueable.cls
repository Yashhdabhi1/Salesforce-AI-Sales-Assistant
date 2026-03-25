/**
 * AIQueueable — Async AI generation for Flows, triggers, or scheduled jobs.
 *
 * Usage:
 *   System.enqueueJob(new AIQueueable(recordId, 'summary'));
 */
public class AIQueueable implements Queueable, Database.AllowsCallouts {

    private final Id     recordId;
    private final String type;
    private final String customPrompt;

    public AIQueueable(Id recordId, String type) {
        this(recordId, type, null);
    }

    public AIQueueable(Id recordId, String type, String customPrompt) {
        this.recordId     = recordId;
        this.type         = type;
        this.customPrompt = customPrompt;
    }

    public void execute(QueueableContext ctx) {
        try {
            Opportunity opp = [
                SELECT Id, Name, StageName, Amount, Probability, CloseDate,
                       Description, LeadSource, Type,
                       Account.Name, Account.Industry, Account.AnnualRevenue,
                       Owner.Name, Owner.Email
                FROM   Opportunity
                WHERE  Id = :recordId
                LIMIT  1
            ];

            String prompt;
            if      (type == 'summary') { prompt = PromptBuilder.buildOpportunitySummary(opp); }
            else if (type == 'email')   { prompt = PromptBuilder.buildEmailPrompt(opp);        }
            else if (type == 'custom' && String.isNotBlank(customPrompt)) {
                prompt = PromptBuilder.buildCustomPrompt(customPrompt, opp);
            } else {
                System.debug(LoggingLevel.WARN, 'AIQueueable: unknown type=' + type);
                return;
            }

            String response = AIService.generateResponse(prompt);

            insert new AI_Response__c(
                RecordId__c = recordId,
                Type__c     = type,
                Response__c = response,
                Prompt__c   = prompt.left(32768)
            );

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'AIQueueable failed: ' + e.getMessage());
        }
    }
}