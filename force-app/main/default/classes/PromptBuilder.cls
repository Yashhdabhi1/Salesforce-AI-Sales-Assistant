/**
 * PromptBuilder — Builds structured prompts for each AI action.
 * Uses the full Opportunity + Account context for richer responses.
 */
public class PromptBuilder {

    // ─────────────────────────────────────────────
    // OPPORTUNITY SUMMARY
    // ─────────────────────────────────────────────

    public static String buildOpportunitySummary(Opportunity opp) {
        String ctx = buildContext(opp);
        return
            'You are an expert Salesforce Sales Intelligence Assistant.\n\n' +
            'Analyze the following opportunity and respond EXACTLY in this structured format ' +
            '(do not add extra headings or markdown):\n\n' +

            'SUMMARY:\n' +
            '- [2-3 concise bullet points about the deal]\n\n' +

            'RISKS:\n' +
            '- [2-3 specific risks based on stage, amount, and close date]\n\n' +

            'NEXT STEPS:\n' +
            '- [2-3 actionable next steps the sales rep should take]\n\n' +

            'RISK LEVEL: [High / Medium / Low — one word only]\n\n' +

            'CONFIDENCE SCORE: [A number from 0 to 10 rating your confidence this deal will close — 10 is certain]\n\n' +

            '--- Opportunity Context ---\n' + ctx;
    }

    // ─────────────────────────────────────────────
    // EMAIL DRAFT
    // ─────────────────────────────────────────────

    public static String buildEmailPrompt(Opportunity opp) {
        String ctx = buildContext(opp);
        return
            'You are a professional B2B sales email writer.\n\n' +
            'Write a personalized, concise follow-up sales email.\n' +
            'Respond EXACTLY in this format:\n\n' +

            'SUBJECT: [Email subject line]\n\n' +
            'BODY:\n' +
            'Dear [Contact Name],\n\n' +
            '[2-3 short paragraphs: value proposition, deal context, clear CTA]\n\n' +
            'Best regards,\n' +
            '[Owner Name]\n\n' +

            '--- Opportunity Context ---\n' + ctx;
    }

    // ─────────────────────────────────────────────
    // CUSTOM QUESTION
    // ─────────────────────────────────────────────

    public static String buildCustomPrompt(String userInput, Opportunity opp) {
        String ctx = buildContext(opp);
        return
            'You are a Salesforce Sales AI Assistant.\n\n' +
            'Answer the following sales question concisely and actionably.\n\n' +
            '--- Opportunity Context ---\n' + ctx + '\n\n' +
            '--- User Question ---\n' + userInput;
    }

    // ─────────────────────────────────────────────
    // PRIVATE: Build shared context block
    // ─────────────────────────────────────────────

    private static String buildContext(Opportunity opp) {
        List<String> lines = new List<String>{
            'Opportunity Name : ' + opp.Name,
            'Stage            : ' + opp.StageName,
            'Amount           : $' + (opp.Amount != null ? String.valueOf(opp.Amount) : 'N/A'),
            'Probability      : ' + (opp.Probability != null ? String.valueOf(opp.Probability) + '%' : 'N/A'),
            'Close Date       : ' + (opp.CloseDate != null ? String.valueOf(opp.CloseDate) : 'N/A'),
            'Lead Source      : ' + (String.isNotBlank(opp.LeadSource)  ? opp.LeadSource  : 'N/A'),
            'Opportunity Type : ' + (String.isNotBlank(opp.Type)        ? opp.Type        : 'N/A'),
            'Description      : ' + (String.isNotBlank(opp.Description) ? opp.Description : 'N/A'),
            'Account Name     : ' + (opp.Account != null ? opp.Account.Name      : 'N/A'),
            'Industry         : ' + (opp.Account != null ? opp.Account.Industry  : 'N/A'),
            'Annual Revenue   : ' + (opp.Account != null && opp.Account.AnnualRevenue != null
                                        ? '$' + String.valueOf(opp.Account.AnnualRevenue) : 'N/A'),
            'Owner            : ' + (opp.Owner != null ? opp.Owner.Name  : 'N/A')
        };
        return String.join(lines, '\n');
    }
}