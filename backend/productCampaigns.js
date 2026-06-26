const DEFAULT_PRODUCT = 'workflow_ai';
const PRODUCT_KEYS = new Set([
  'workflow_ai', 'election_survey', 'exit_interview_ai', 'ai_sales_agent',
  'english_tutor_ai', 'bench_to_billing', 'voice_agent', 'face_recognition', 'outreach_ai'
]);

const campaigns = {
  workflow_ai: {
    subject: 'Thought this may be useful',
    email: `Hi [Name],

I came across your company while looking at teams that are hiring and thought I'd reach out.

We've been building WorkflowAI to simplify parts of the hiring process by reducing some of the repetitive coordination involved.

I wasn't sure whether this is something your team is currently exploring, but I thought it might be worth introducing.

If it sounds relevant, I'd be happy to walk you through it in a short demo.

Best,
VRM AI Technology (OPC) PVT LTD`,
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_WORKFLOW_AI || 'techhiring_v3',
  },
  election_survey: {
    subject: 'Turn Voter Feedback into Actionable Election Insights',
    email: `Hi [Name],

Political campaigns need accurate voter feedback to understand public sentiment and make informed decisions.

Election Survey helps political organizations collect survey responses, analyze voter sentiment and identify important campaign trends using AI-powered analytics.

Benefits:

* Faster voter feedback collection
* AI-powered sentiment analysis
* Constituency-level campaign insights
* Better data-driven election decisions

Would you be open to a quick demo?`,
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_ELECTION_SURVEY || '',
  },
  exit_interview_ai: {
    subject: 'Turn Employee Exits into Actionable Insights',
    email: `Our Exit Interview AI automates feedback collection, sentiment analysis and reporting from exiting employees.

Benefits:

* Automated exit interviews
* Sentiment analysis
* Attrition trend identification
* Better retention strategies

Would you like a quick walkthrough?`,
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_EXIT_INTERVIEW_AI || '',
  },
  ai_sales_agent: {
    subject: 'Convert More Leads Automatically with AI',
    email: `Our AI Sales Agent handles customer conversations, lead qualification and follow-ups through WhatsApp.

Benefits:

* Instant lead response
* Automated qualification
* Reduced sales workload
* Higher conversion rates`,
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_AI_SALES_AGENT || '',
  },
  english_tutor_ai: {
    subject: 'Personalized English Training Using AI',
    email: `English Tutor AI helps organizations improve communication, spoken English and interview readiness through personalized learning paths.

Benefits:

* Personalized learning
* AI assessments
* Progress tracking
* Corporate training support`,
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_ENGLISH_TUTOR_AI || '',
  },
  bench_to_billing: {
    subject: 'Reduce Bench Cost and Increase Revenue',
    email: 'Bench-to-Billing helps IT companies maximize billable utilization by identifying deployable resources and matching them to opportunities.',
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_BENCH_TO_BILLING || '',
  },
  voice_agent: {
    subject: 'Automate Customer Calls with AI Voice Agents',
    email: 'The Voice Agent can answer calls, book appointments, collect information and support customers in Tamil and English.',
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_VOICE_AGENT || '',
  },
  face_recognition: {
    subject: 'Modern Attendance Management with AI',
    email: `Benefits:

* Contactless attendance
* Real-time tracking
* HRMS integration
* Attendance analytics`,
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_FACE_RECOGNITION || '',
  },
  outreach_ai: {
    subject: 'Scale Lead Generation Using AI',
    email: `Outreach AI combines lead scraping, contact enrichment, LinkedIn automation, email campaigns and WhatsApp outreach into one platform.

Benefits:

* More qualified leads
* Automated outreach
* Higher response rates
* Better sales productivity`,
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_OUTREACH_AI || '',
  },
};

const isValidProduct = product => PRODUCT_KEYS.has(String(product || '').trim());
const resolveProduct = product => isValidProduct(product) ? String(product).trim() : DEFAULT_PRODUCT;
const getCampaign = product => campaigns[resolveProduct(product)] || campaigns[DEFAULT_PRODUCT];

module.exports = { DEFAULT_PRODUCT, PRODUCT_KEYS, isValidProduct, resolveProduct, getCampaign };
