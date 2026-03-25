import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import generate           from '@salesforce/apex/AIController.generate';
import getHistory         from '@salesforce/apex/AIController.getHistory';
import sendEmail          from '@salesforce/apex/AIController.sendEmail';
import saveFeedback       from '@salesforce/apex/AIController.saveFeedback';
import getOpportunityMeta from '@salesforce/apex/AIController.getOpportunityMeta';

const TABS = [
    { label: '📋 Summary', value: 'summary' },
    { label: '📧 Email',   value: 'email'   },
    { label: '💬 Chat',    value: 'chat'    },
    { label: '🕓 History', value: 'history' }
];

// Extend this list with competitors relevant to your industry
const COMPETITOR_KEYWORDS = [
    'salesforce', 'hubspot', 'zoho', 'pipedrive', 'microsoft dynamics',
    'sugarcrm', 'freshsales', 'oracle', 'sap', 'monday', 'clickup'
];

export default class AiAssistant extends LightningElement {

    @api recordId;

    // ── Tab state ──
    @track activeTab = 'summary';
    tabs = TABS;

    // ── Loading ──
    @track isLoading = false;
    @track isSending = false;

    // ── Summary ──
    @track sections          = null;
    @track fromCache         = false;
    @track cachedAt          = '';
    @track summaryResponseId = '';

    // ── Confidence score (0–10 returned by AI) ──
    @track confidenceScore = null;

    // ── Competitor detection ──
    @track detectedCompetitors = [];

    // ── Typing effect ──
    @track typingText  = '';
    _typingTimer       = null;
    _typingFullText    = '';

    // ── Email ──
    @track emailParsed = { subject: '', body: '' };

    // ── Chat ──
    @track messages  = [];
    @track userInput = '';

    // ── History ──
    @track history       = [];
    @track historyFilter = 'all';

    // ── Opp meta ──
    @track oppMeta = {
        name: '', stage: '', amount: '', probability: '',
        closeDate: '', accountName: '', ownerName: '', description: ''
    };

    // ─────────────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────────────

    connectedCallback() {
        this.loadOppMeta();
        this.loadHistory();
    }

    disconnectedCallback() {
        this._clearTypingTimer();
    }

    // ─────────────────────────────────────────────────────
    // OPP META  →  auto-summary  +  competitor scan
    // ─────────────────────────────────────────────────────

    loadOppMeta() {
        getOpportunityMeta({ recordId: this.recordId })
            .then(meta => {
                this.oppMeta = { ...this.oppMeta, ...meta };
                this._detectCompetitors(meta);
                // AUTO-GENERATE: kick off summary on first load (uses cache if available)
                if (!this.sections) {
                    this.callAI('summary', null, false);
                }
            })
            .catch(() => {});
    }

    // Scan description / account / opp name for known competitor names
    _detectCompetitors(meta) {
        const haystack = [
            meta.description  || '',
            meta.accountName  || '',
            meta.name         || ''
        ].join(' ').toLowerCase();

        this.detectedCompetitors = COMPETITOR_KEYWORDS
            .filter(c => haystack.includes(c))
            .map(c => c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    }

    // ─────────────────────────────────────────────────────
    // DEAL HEALTH SCORE CARD  (0–100)
    // Weighted: 60% probability + 40% days-to-close urgency
    // ─────────────────────────────────────────────────────

    get dealHealthScore() {
        const prob = Number(this.oppMeta.probability) || 0;
        let dateScore = 50;
        if (this.oppMeta.closeDate) {
            const days = Math.ceil(
                (new Date(this.oppMeta.closeDate) - new Date()) / 86400000
            );
            if      (days > 60) dateScore = 100;
            else if (days > 30) dateScore = 75;
            else if (days > 14) dateScore = 50;
            else if (days > 0)  dateScore = 25;
            else                dateScore = 0;
        }
        return Math.round(prob * 0.6 + dateScore * 0.4);
    }

    get dealHealthColor() {
        const s = this.dealHealthScore;
        return s >= 70 ? '#22c55e' : s >= 40 ? '#f59e0b' : '#ef4444';
    }

    get dealHealthLabel() {
        const s = this.dealHealthScore;
        return s >= 70 ? 'Healthy' : s >= 40 ? 'At Risk' : 'Critical';
    }

    get dealHealthLabelClass() {
        const s = this.dealHealthScore;
        return s >= 70 ? 'health-tag health-good'
             : s >= 40 ? 'health-tag health-warn'
             :            'health-tag health-bad';
    }

    // Half-circle SVG arc for the health gauge (cx=60,cy=60,r=46)
    get healthArcPath() {
        const score = this.dealHealthScore;
        const angle = (score / 100) * 180; // 0–180 degrees
        const rad   = (angle - 180) * (Math.PI / 180);
        const cx = 60, cy = 60, r = 46;
        const x  = cx + r * Math.cos(rad);
        const y  = cy + r * Math.sin(rad);
        const lg = angle > 180 ? 1 : 0;
        return `M ${cx - r} ${cy} A ${r} ${r} 0 ${lg} 1 ${x} ${y}`;
    }

    // ─────────────────────────────────────────────────────
    // CONFIDENCE SCORE GAUGE  (0–10 ring)
    // ─────────────────────────────────────────────────────

    get confidenceCircumference() { return +(2 * Math.PI * 30).toFixed(2); }

    get confidenceDashOffset() {
        if (this.confidenceScore === null) return this.confidenceCircumference;
        return +(this.confidenceCircumference * (1 - this.confidenceScore / 10)).toFixed(2);
    }

    get confidenceStroke() {
        const s = this.confidenceScore || 0;
        return s >= 7 ? '#22c55e' : s >= 4 ? '#f59e0b' : '#ef4444';
    }

    get confidenceLabel() {
        const s = this.confidenceScore;
        if (s === null) return '—';
        return s >= 7 ? 'Strong' : s >= 4 ? 'Moderate' : 'Weak';
    }

    get hasConfidenceScore() { return this.confidenceScore !== null; }
    get hasCompetitors()     { return this.detectedCompetitors.length > 0; }
    get competitorList()     { return this.detectedCompetitors.join(', '); }

    // ─────────────────────────────────────────────────────
    // TABS
    // ─────────────────────────────────────────────────────

    get tabClasses() {
        return this.tabs.map(t => ({
            ...t,
            cls: 'tab-btn' + (t.value === this.activeTab ? ' tab-active' : '')
        }));
    }

    handleTabClick(e) {
        this.activeTab = e.currentTarget.dataset.tab;
        if (this.activeTab === 'history') this.loadHistory();
    }

    get isSummaryTab() { return this.activeTab === 'summary'; }
    get isEmailTab()   { return this.activeTab === 'email';   }
    get isChatTab()    { return this.activeTab === 'chat';    }
    get isHistoryTab() { return this.activeTab === 'history'; }

    // ─────────────────────────────────────────────────────
    // SUMMARY ACTIONS
    // ─────────────────────────────────────────────────────

    handleSummary()        { this.callAI('summary', null, false); }
    handleRefreshSummary() { this.callAI('summary', null, true);  }

    // ─────────────────────────────────────────────────────
    // COPY TO CLIPBOARD
    // ─────────────────────────────────────────────────────

    handleCopySummary() {
        if (!this.sections) return;
        const t =
            `SUMMARY:\n${this.sections.summary}\n\n` +
            `RISKS:\n${this.sections.risks}\n\n` +
            `NEXT STEPS:\n${this.sections.steps}\n\n` +
            `RISK LEVEL: ${this.sections.riskLevel}`;
        this._copy(t, 'Summary copied to clipboard!');
    }

    handleCopyEmail() {
        if (!this.emailParsed.body) return;
        this._copy(
            `Subject: ${this.emailParsed.subject}\n\n${this.emailParsed.body}`,
            'Email copied to clipboard!'
        );
    }

    _copy(text, msg) {
        navigator.clipboard.writeText(text)
            .then(()  => this.toast('Copied ✓', msg, 'success'))
            .catch(()  => this.toast('Error', 'Clipboard not available.', 'error'));
    }

    // ─────────────────────────────────────────────────────
    // EMAIL
    // ─────────────────────────────────────────────────────

    handleEmail()               { this.callAI('email', null, false); }
    handleEmailSubjectChange(e) { this.emailParsed = { ...this.emailParsed, subject: e.target.value }; }
    handleEmailBodyChange(e)    { this.emailParsed = { ...this.emailParsed, body:    e.target.value }; }

    handleSendEmail() {
        if (!this.emailParsed.body) {
            this.toast('No Email', 'Generate an email first.', 'warning');
            return;
        }
        this.isSending = true;
        sendEmail({
            recordId:  this.recordId,
            emailBody: this.emailParsed.body,
            subject:   this.emailParsed.subject
        })
        .then(res => this.toast(
            res.success ? 'Email Sent' : 'Email Failed',
            res.message,
            res.success ? 'success' : 'error'
        ))
        .catch(() => this.toast('Error', 'Email failed unexpectedly.', 'error'))
        .finally(() => { this.isSending = false; });
    }

    // ─────────────────────────────────────────────────────
    // CHAT
    // ─────────────────────────────────────────────────────

    handleInputChange(e)  { this.userInput = e.target.value; }

    handleInputKeyUp(e) {
        if (e.key === 'Enter' && !e.shiftKey) this.handleAsk();
    }

    handleAsk() {
        const q = this.userInput.trim();
        if (!q) return;
        this.addMessage(q, 'user');
        this.userInput = '';
        this.callAI('custom', q, false);
    }

    // ─────────────────────────────────────────────────────
    // HISTORY
    // ─────────────────────────────────────────────────────

    get historyFilterOptions() {
        return [
            { label: 'All',     value: 'all'     },
            { label: 'Summary', value: 'summary' },
            { label: 'Email',   value: 'email'   },
            { label: 'Chat',    value: 'custom'  }
        ];
    }

    handleHistoryFilterChange(e) {
        this.historyFilter = e.detail.value;
        this.loadHistory();
    }

    loadHistory() {
        getHistory({ recordId: this.recordId, typeFilter: this.historyFilter, pageSize: 15 })
            .then(rows => {
                this.history = rows.map(r => ({
                    ...r,
                    shortResponse: r.Response__c ? r.Response__c.substring(0, 180) + '…' : '',
                    typeLabel:     this.typeLabel(r.Type__c),
                    typeBadge:     'badge badge-' + r.Type__c
                }));
            })
            .catch(() => {});
    }

    typeLabel(t) {
        return { summary: '📋 Summary', email: '📧 Email', custom: '💬 Chat' }[t] || t;
    }

    // ─────────────────────────────────────────────────────
    // FEEDBACK
    // ─────────────────────────────────────────────────────

    handleFeedback(e) {
        const { id, value } = e.currentTarget.dataset;
        saveFeedback({ responseId: id, feedback: value })
            .then(() => this.toast('Feedback Saved', 'Thank you!', 'success'))
            .catch(() => {});
    }

    // ─────────────────────────────────────────────────────
    // TYPING EFFECT
    // Characters revealed at adaptive speed (faster for long text)
    // ─────────────────────────────────────────────────────

    _runTypingEffect(fullText, onDone) {
        this._clearTypingTimer();
        this.typingText = '';
        let i = 0;
        const speed = Math.max(6, Math.min(18, Math.round(3500 / fullText.length)));

        this._typingTimer = setInterval(() => {
            if (i < fullText.length) {
                this.typingText = fullText.substring(0, ++i);
            } else {
                this._clearTypingTimer();
                if (onDone) onDone();
            }
        }, speed);
    }

    _clearTypingTimer() {
        if (this._typingTimer) {
            clearInterval(this._typingTimer);
            this._typingTimer = null;
        }
    }

    // ─────────────────────────────────────────────────────
    // CORE AI CALL
    // ─────────────────────────────────────────────────────

    callAI(type, prompt, forceRefresh) {
        this.isLoading = true;

        generate({ recordId: this.recordId, type, prompt, forceRefresh: !!forceRefresh })
            .then(result => {
                if (result.error) {
                    this.toast('AI Error', result.error, 'error');
                    if (type === 'custom') this.addMessage('❌ ' + result.error, 'ai');
                    return;
                }

                if (type === 'summary') {
                    const parsed           = this.parseSections(result.response);
                    this.confidenceScore   = this._extractConfidence(result.response);
                    this.fromCache         = result.fromCache;
                    this.cachedAt          = result.cachedAt || '';
                    this.summaryResponseId = result.responseId || '';
                    this.activeTab         = 'summary';

                    if (!result.fromCache) {
                        // Animate summary text; reveal full sections object when done
                        this._runTypingEffect(parsed.summary, () => {
                            this.sections = parsed;
                        });
                    } else {
                        this.sections = parsed;
                    }

                } else if (type === 'email') {
                    this.emailParsed = this.parseEmail(result.response);
                    this.activeTab   = 'email';

                } else {
                    // Chat: show animated placeholder while typing effect runs
                    const uid = Date.now() + Math.random();
                    this.messages = [
                        ...this.messages,
                        { id: uid, text: '', className: 'msg msg-ai' }
                    ];

                    this._runTypingEffect(result.response, () => {
                        this.messages = this.messages.map(m =>
                            m.id === uid ? { ...m, text: result.response } : m
                        );
                        this._scrollChat();
                    });
                }

                this.loadHistory();
            })
            .catch(err => {
                const msg = err?.body?.message || 'Unexpected error';
                this.toast('Error', msg, 'error');
                if (type === 'custom') this.addMessage('❌ ' + msg, 'ai');
            })
            .finally(() => { this.isLoading = false; });
    }

    // ─────────────────────────────────────────────────────
    // PARSERS
    // ─────────────────────────────────────────────────────

    parseSections(text) {
        const get = (label, next) => {
            const rx = new RegExp(label + ':\\s*([\\s\\S]*?)(?=' + next + ':|$)', 'i');
            const m  = text.match(rx);
            return m ? m[1].trim() : '';
        };
        return {
            summary:   get('SUMMARY',    'RISKS'),
            risks:     get('RISKS',      'NEXT STEPS'),
            steps:     get('NEXT STEPS', 'RISK LEVEL'),
            riskLevel: get('RISK LEVEL', 'CONFIDENCE|~~~')
        };
    }

    parseEmail(text) {
        const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
        const bodyMatch    = text.match(/BODY:\s*([\s\S]+)/i);
        return {
            subject: subjectMatch ? subjectMatch[1].trim() : 'Follow-up',
            body:    bodyMatch    ? bodyMatch[1].trim()    : text
        };
    }

    // Pull "CONFIDENCE SCORE: 8" or "CONFIDENCE: 7" from AI response
    _extractConfidence(text) {
        const m = text.match(/CONFIDENCE(?:\s*SCORE)?:\s*(\d+)/i);
        if (m) {
            const n = parseInt(m[1], 10);
            return (n >= 0 && n <= 10) ? n : null;
        }
        return null;
    }

    // ─────────────────────────────────────────────────────
    // GETTERS
    // ─────────────────────────────────────────────────────

    get riskClass() {
        if (!this.sections?.riskLevel) return 'risk-badge';
        const v = this.sections.riskLevel.toLowerCase();
        if (v.includes('high'))   return 'risk-badge risk-high';
        if (v.includes('medium')) return 'risk-badge risk-medium';
        return 'risk-badge risk-low';
    }

    get cacheLabel() {
        if (!this.fromCache) return '';
        const d = this.cachedAt ? new Date(this.cachedAt).toLocaleString() : '';
        return '⚡ Loaded from cache' + (d ? ' · ' + d : '');
    }

    // While typing effect runs for summary, show typingText; after done show sections.summary
    get summaryDisplayText() {
        return (this.sections && !this._typingTimer)
            ? this.sections.summary
            : this.typingText;
    }

    get isTypingSummary() {
        return !this.sections && !!this._typingTimer;
    }

    get hasOppName()  { return !!(this.oppMeta?.name);   }
    get hasOppStage() { return !!(this.oppMeta?.stage);  }
    get hasSummary()  { return !!this.sections;          }
    get hasEmail()    { return !!this.emailParsed?.body; }
    get hasMessages() { return this.messages.length > 0; }
    get hasHistory()  { return this.history.length  > 0; }
    get sendLabel()   { return this.isSending ? 'Sending…' : 'Send Email'; }

    // ─────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────

    addMessage(text, role) {
        this.messages = [
            ...this.messages,
            { id: Date.now() + Math.random(), text, className: role === 'ai' ? 'msg msg-ai' : 'msg msg-user' }
        ];
        this._scrollChat();
    }

    _scrollChat() {
        setTimeout(() => {
            const el = this.template.querySelector('.chat-scroll');
            if (el) el.scrollTop = el.scrollHeight;
        }, 50);
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}