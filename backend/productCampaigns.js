const DEFAULT_PRODUCT = 'it';

// Initial email for the separate "VRM Product" choice.
const VRM_PRODUCT_SUBJECT = 'AI Products from VRM AI Technology: Workflow AI, Bench to Deploy, AI Buddy and More';
const VRM_PRODUCT_EMAIL = `Dear Sir/Madam,

Greetings from VRM AI Technology (OPC) Pvt. Ltd.!

We are an AI-based product development company specialising in building intelligent software solutions that help businesses automate operations, improve workforce efficiency, and enhance productivity.

We would like to introduce our AI-powered products designed to address different business requirements.

1. Workflow AI – End-to-End Recruitment Automation
Workflow AI streamlines the entire hiring process through AI-powered automation, reducing manual screening and evaluation efforts.

Key Features:
- Intelligent resume screening and candidate ranking based on job descriptions.
- AI-powered voice interviews with automated candidate evaluation.
- Asynchronous video interviews to assess communication, confidence, and role suitability.
- Automated coding assessments with anti-cheat proctoring.
- End-to-end recruitment workflow management.

Product Demo:
https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing

2. Bench to Deploy – Intelligent Bench Management
Bench to Deploy helps IT companies optimise bench utilisation by matching unassigned employees with open client requirements.

Key Features:
- Matches available bench employees with relevant client requirements.
- Creates personalised upskilling roadmaps based on skill gaps.
- Validates technical readiness before candidate profile submission.
- Helps improve employee utilisation and deployment efficiency.

Product Demo:
https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

3. AI Buddy – AI-Powered Language Learning and Coaching
AI Buddy is an intelligent language coaching platform designed to improve employee communication and language proficiency.

Key Features:
- Interactive voice conversations and speaking simulations.
- Real-time pronunciation, accent, and grammar feedback.
- Personalised learning tracks based on employee skill levels.
- Corporate upskilling programmes tailored to organisational requirements.
- Enterprise analytics to track employee language proficiency and progress.

Product Demo:
https://drive.google.com/file/d/1z4URqyc3_lAuTFmtHDyrakv54mUySSsG/view?usp=drive_link

4. People Connect (Global) – AI-Powered Citizen Engagement
People Connect is an AI-powered citizen engagement platform that modernises public services through intelligent communication and digital governance.

Key Features:
- Citizen engagement portal.
- Real-time grievance tracking.
- Public sentiment analysis.
- Automated communication.

5. Visionix SI – Biometric Security and Check-ins
Visionix SI automates biometric security, liveness verification, and employee check-ins.

Key Features:
- Real-time face recognition.
- Biometric gate integration.
- Liveness detection bot.
- Secure visual logging panels.

6. Exit Intelligence – Workforce Intelligence
Exit Intelligence is AI-powered workforce intelligence that transforms employee feedback into actionable retention and organisational insights.

Key Features:
- AI-powered exit interviews.
- Employee sentiment analysis.
- Attrition and workforce insights.
- Executive HR dashboards.

Let's Connect!
We would be happy to arrange a personalised product demonstration and discuss how these solutions can support your organisation's specific requirements.

Book a Demo:
https://vrmaitechnology.com/contactus/#send-message-section

We also have a referral programme for organisations that connect us with potential clients. Please let us know if you would be interested in learning more.

Thank you for your valuable time and consideration. We look forward to exploring potential business opportunities with your organisation.

Best Regards,
VRM AI Technology (OPC) Pvt. Ltd.`;


const campaigns = {
  it: {
    subject: 'AI-Powered Hiring and Bench Management Solutions from VRM AI Technology',
    email: `Dear Sir/Madam,

I am writing on behalf of VRM AI Technology, an AI-based product development company that builds AI-powered software products and solutions for businesses.

We have recently launched two products designed for talent operations, both currently deployed with enterprise clients:

1. Workflow AI – An AI-powered recruitment automation platform that streamlines hiring through intelligent resume screening, AI-powered video interviews, coding assessments, telephonic interview automation, candidate evaluations, and end-to-end recruitment workflow management.

2. Bench to Deploy
A platform that matches unassigned bench employees to open client requirements, creates personalised upskilling roadmaps, and validates technical readiness before any profile is submitted.

Both products are built on production-grade AI, including conversational voice agents, Gemini-powered evaluation, and Monaco-based coding sandboxes.

Product demonstrations:

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

Should either solution be relevant to your team's requirements, we would be pleased to arrange a tailored walkthrough.

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`,
    followUps: [
      {
        subject: 'Following Up: AI-Powered Hiring and Bench Management Solutions',
        email: `Dear Sir/Madam,

I hope this message finds you well.

I am following up on my previous email regarding two AI products from VRM AI Technology that are currently deployed with enterprise clients.

1. Workflow AI – end-to-end hiring automation (resume screening, AI voice interviews, video assessments, proctored coding tests). Your team is involved only at the final shortlist stage.

2. Bench to Deploy – matches bench employees to open requirements, builds upskilling roadmaps, and validates readiness before submission.

If you missed the demos, here they are:

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

We would be glad to arrange a tailored walkthrough at your convenience.

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Could Our AI Hiring Tools Support Your Team?',
        email: `Dear Sir/Madam,

I hope you are doing well.

Just checking in regarding VRM AI Technology's hiring and bench management solutions.

If your organisation is looking to reduce manual effort in hiring or improve bench utilisation, we would love the opportunity to show how Workflow AI and Bench to Deploy can support your team.

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

If these products are not relevant at this stage, we would truly appreciate a referral to someone who may find them useful.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Final Follow-Up: AI Hiring and Bench Management from VRM AI Technology',
        email: `Dear Sir/Madam,

I hope you are well.

This is my final follow-up regarding Workflow AI and Bench to Deploy from VRM AI Technology.

We understand every organisation has different priorities. If improving your hiring pipeline or bench utilisation is something your team is considering, we would be grateful for the opportunity to demonstrate how our solutions can help.

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

If these solutions are not relevant to your current needs, we would sincerely appreciate a referral to someone who may benefit.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration. We hope to have the opportunity to work with your organisation in the future.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      }
    ],
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_IT || 'workflow',
    whatsappLanguage: 'en'
  },

  non_it: {
    subject: 'Automate Your Hiring Pipeline with Workflow AI',
    email: `Dear Hiring Team,

I am writing on behalf of VRM AI Technology, an AI-based product development company that builds AI-powered software products and solutions for businesses.

One of our recent products is Workflow AI, an enterprise hiring automation platform that handles the entire screening pipeline without manual effort.

Key capabilities:

Resume screening: Scores and ranks candidates against your job description in seconds.
AI voice calls: Screens candidates and delivers structured hiring notes.
Async video interviews: Evaluates communication, confidence, and role fit.
Automated coding assessments: Includes anti-cheat proctoring.

Your team is involved only at the final shortlist stage.

I have included a short demo for your reference. No setup is needed, just a quick watch:
Workflow AI Demo: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing

We would be pleased to walk you through how it fits your current hiring workflow.
Book a 15-min call: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`,
    followUps: [
      {
        subject: 'Following Up: Automate Your Hiring Pipeline with Workflow AI',
        email: `Dear Hiring Team,

I hope this message finds you well.

I am following up on my previous email regarding Workflow AI, our enterprise hiring automation platform.

Many organisations are eliminating manual screening effort by automating resume ranking, AI voice calls, video assessments, and coding tests. Your team would only be involved at the final shortlist stage.

Workflow AI Demo: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing

We would be pleased to walk you through how it fits your current hiring workflow.
Book a 15-min call: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Could Workflow AI Support Your Hiring Team?',
        email: `Dear Hiring Team,

I hope you are doing well.

Just checking in regarding Workflow AI from VRM AI Technology.

If your organisation is looking to reduce manual screening effort, improve hiring speed, and ensure every candidate goes through a consistent evaluation process, we would love to show you what Workflow AI can do.

Workflow AI Demo: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing

Book a 15-min call: https://vrmaitechnology.com/contactus/#send-message-section

If Workflow AI is not relevant to your current hiring needs, we would truly appreciate a referral to someone who may find it useful.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Final Follow-Up: Workflow AI Hiring Automation',
        email: `Dear Hiring Team,

I hope you are well.

This is my final follow-up regarding Workflow AI from VRM AI Technology.

We understand every organisation has its own timelines and priorities. If streamlining your hiring pipeline is something your team is considering, we would be grateful for the opportunity to demonstrate how Workflow AI can reduce manual effort and improve consistency across your screening process.

Workflow AI Demo: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing

Book a 15-min call: https://vrmaitechnology.com/contactus/#send-message-section

If Workflow AI is not relevant right now, we would sincerely appreciate a referral to someone who may benefit.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      }
    ],
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_NON_IT || 'workflow',
    whatsappLanguage: 'en'
  },

  bpo: {
    subject: 'AI Buddy: An AI Language Coach for Your Team\'s Learning and Development',
    email: `Dear Learning and Development Team,

I am writing on behalf of VRM AI Technology, an AI-based product development company that builds AI-powered software products and solutions for businesses.

One of our recent products is AI Buddy, an intelligent AI language coach that helps employees learn, practise, and communicate fluently across multiple languages, right from their device.

Key capabilities:

Voice conversations: Natural dialogue and interactive speaking simulations.
Real-time feedback: Pronunciation, accent, and grammar.
Personalised learning tracks: Tailored to each employee's role and level.
Corporate upskilling curricula: Designed around your team's specific needs.
Enterprise analytics: Track fluency progression across the team.

There is no classroom and no fixed schedule. Employees practise at their own pace and receive coaching in real time.

I have included a short demo so you can see it in action:
AI Buddy Demo: https://drive.google.com/file/d/1z4URqyc3_lAuTFmtHDyrakv54mUySSsG/view?usp=drive_link

We would be pleased to walk you through how it fits into your team's learning and development workflow.
Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`,
    followUps: [
      {
        subject: 'Following Up: AI Buddy Language Coaching for Your Team',
        email: `Dear Learning and Development Team,

I hope this message finds you well.

I am following up on my previous email regarding AI Buddy, our AI-powered language coaching platform for enterprise teams.

AI Buddy offers voice conversations, real-time pronunciation and grammar feedback, personalised learning tracks, and enterprise-level analytics — all accessible from any device, at any time.

AI Buddy Demo: https://drive.google.com/file/d/1z4URqyc3_lAuTFmtHDyrakv54mUySSsG/view?usp=drive_link

We would be pleased to walk you through how it fits your team's learning and development workflow.
Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Could AI Buddy Support Your Team\'s Language Development?',
        email: `Dear Learning and Development Team,

I hope you are doing well.

Just checking in regarding AI Buddy from VRM AI Technology.

If your organisation is looking to improve employee communication skills, offer flexible language learning, and track fluency progress across your team, we would love to show you what AI Buddy can do.

AI Buddy Demo: https://drive.google.com/file/d/1z4URqyc3_lAuTFmtHDyrakv54mUySSsG/view?usp=drive_link

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

If AI Buddy is not relevant to your current requirements, we would truly appreciate a referral to someone who may find it useful.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Final Follow-Up: AI Buddy Language Coaching from VRM AI Technology',
        email: `Dear Learning and Development Team,

I hope you are well.

This is my final follow-up regarding AI Buddy from VRM AI Technology.

We understand every organisation has different L&D priorities. If improving language fluency and communication skills across your team is something you are considering, we would be grateful for the opportunity to demonstrate how AI Buddy can help your employees learn and practise at their own pace with real-time AI coaching.

AI Buddy Demo: https://drive.google.com/file/d/1z4URqyc3_lAuTFmtHDyrakv54mUySSsG/view?usp=drive_link

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

If AI Buddy is not relevant right now, we would sincerely appreciate a referral to someone who may benefit.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration.

Best regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      }
    ],
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_BPO || 'ai_buddy',
    whatsappLanguage: 'en'
  },

  recruitment: {
    subject: 'AI-Powered Hiring and Bench Management Solutions from VRM AI Technology',
    email: `Dear Sir/Madam,

I am writing on behalf of VRM AI Technology, a Bengaluru-based AI development company specialising in Generative AI systems, conversational voice agents, and custom machine learning software for enterprise clients.

We have recently launched two products designed for talent operations, both currently deployed with enterprise clients:

1. Workflow AI
An end-to-end hiring automation platform covering resume screening, AI-led voice interviews, video assessments, and proctored coding tests. Your team is involved only at the final decision stage.

2. Bench to Deploy
A platform that matches unassigned bench employees to open client requirements, creates personalised upskilling roadmaps, and validates technical readiness before any profile is submitted.

Both products are built on production-grade AI, including conversational voice agents, Gemini-powered evaluation, and Monaco-based coding sandboxes.

Product demonstrations:

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

Should either solution be relevant to your team's requirements, we would be pleased to arrange a tailored walkthrough.

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`,
    followUps: [
      {
        subject: 'Following Up: AI-Powered Hiring and Bench Management Solutions',
        email: `Dear Sir/Madam,

I hope this message finds you well.

I am following up on my previous email regarding two AI products from VRM AI Technology that are currently deployed with enterprise clients.

1. Workflow AI – end-to-end hiring automation (resume screening, AI voice interviews, video assessments, proctored coding tests). Your team is involved only at the final shortlist stage.

2. Bench to Deploy – matches bench employees to open requirements, builds upskilling roadmaps, and validates readiness before submission.

If you missed the demos, here they are:

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

We would be glad to arrange a tailored walkthrough at your convenience.

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Could Our AI Hiring Tools Support Your Recruitment Operations?',
        email: `Dear Sir/Madam,

I hope you are doing well.

Just checking in regarding VRM AI Technology's hiring and bench management solutions.

If your organisation is looking to reduce manual effort in hiring or improve bench utilisation, we would love the opportunity to show how Workflow AI and Bench to Deploy can support your team.

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

If these products are not relevant at this stage, we would truly appreciate a referral to someone who may find them useful.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Final Follow-Up: AI Hiring and Bench Management from VRM AI Technology',
        email: `Dear Sir/Madam,

I hope you are well.

This is my final follow-up regarding Workflow AI and Bench to Deploy from VRM AI Technology.

We understand every organisation has different priorities. If improving your hiring pipeline or bench utilisation is something your team is considering, we would be grateful for the opportunity to demonstrate how our solutions can help.

Workflow AI: https://drive.google.com/file/d/1aCEqwMIpUgY1NXAoTQqCbJIwqPutku3f/view?usp=sharing
Bench to Deploy: https://drive.google.com/file/d/1xtNqQX7qHogouW1wLUAz1dLt2o7N-KQQ/view?usp=sharing

Book a demo: https://vrmaitechnology.com/contactus/#send-message-section

If these solutions are not relevant to your current needs, we would sincerely appreciate a referral to someone who may benefit.

We also run a referral programme for organisations that connect us with the right teams — happy to share details if that is of interest.

Thank you for your time and consideration. We hope to have the opportunity to work with your organisation in the future.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      }
    ],
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_RECRUITMENT || 'workflow',
    whatsappLanguage: 'en'
  },

  vrm_product: {
    subject: VRM_PRODUCT_SUBJECT,
    email: VRM_PRODUCT_EMAIL,
    followUps: [
      {
        subject: 'Following Up: AI Products from VRM AI Technology',
        email: `Dear [Name],

I hope you are doing well.

I am following up on my earlier email about VRM AI Technology's AI products: Workflow AI, Bench to Deploy, AI Buddy, People Connect (Global), Visionix SI and Exit Intelligence.

If any of these could help your team, we would be glad to arrange a short demo.

Book a Demo:
https://vrmaitechnology.com/contactus/#send-message-section

We also have a referral programme for organisations that connect us with potential clients. Please let us know if you would be interested in learning more.

Thank you for your time.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Could Our AI Products Support Your Team?',
        email: `Dear [Name],

I hope you are well.

Just checking in regarding our AI products from VRM AI Technology. Whether your focus is hiring automation, bench utilisation, language and communication training, global talent connections, or employee exit insights, we have a product that can help.

Book a Demo:
https://vrmaitechnology.com/contactus/#send-message-section

If these are not relevant at this stage, we would appreciate a referral to someone who may find them useful.

We also have a referral programme for organisations that connect us with potential clients. Please let us know if you would be interested in learning more.

Thank you for your time.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      },
      {
        subject: 'Final Follow-Up: VRM AI Technology Products',
        email: `Dear [Name],

I hope you are well.

This is my final follow-up regarding VRM AI Technology's AI products. We understand every organisation has different priorities, and we would be grateful for the opportunity to show how our solutions can help.

Book a Demo:
https://vrmaitechnology.com/contactus/#send-message-section

If these are not relevant to your current needs, we would sincerely appreciate a referral to someone who may benefit.

We also have a referral programme for organisations that connect us with potential clients. Please let us know if you would be interested in learning more.

Thank you for your time and consideration.

Warm regards,
VRM AI Technology (OPC) Pvt. Ltd.`
      }
    ],
    whatsappTemplate: process.env.WHATSAPP_TEMPLATE_IT || 'workflow',
    whatsappLanguage: 'en'
  }
};

const PRODUCT_ALIASES = {
  it: 'it',
  'non it': 'non_it',
  non_it: 'non_it',
  nonit: 'non_it',
  bpo: 'bpo',
  recruitment: 'recruitment',
  'vrm product': 'vrm_product',
  vrm_product: 'vrm_product',
  vrmproduct: 'vrm_product',
  // legacy aliases kept for backward compatibility
  workflow_ai: 'it',
  workflowai: 'it',
  workflow: 'it',
  bench_to_billing: 'it',
  benchtobilling: 'it',
  english_tutor_ai: 'bpo',
  englishtutor: 'bpo',
  english_tutor: 'bpo'
};

const normalizeProduct = product =>
  String(product || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const PRODUCT_KEYS = new Set(Object.keys(campaigns));
const resolveProduct = product => {
  const normalized = normalizeProduct(product);
  if (PRODUCT_KEYS.has(normalized)) return normalized;
  const compact = normalized.replace(/_/g, '');
  return PRODUCT_ALIASES[normalized] || PRODUCT_ALIASES[compact] || DEFAULT_PRODUCT;
};
const isValidProduct = product => {
  const normalized = normalizeProduct(product);
  const compact = normalized.replace(/_/g, '');
  return PRODUCT_KEYS.has(normalized) || Boolean(PRODUCT_ALIASES[normalized] || PRODUCT_ALIASES[compact]);
};
const getCampaign = product => campaigns[resolveProduct(product)] || campaigns[DEFAULT_PRODUCT];

module.exports = { DEFAULT_PRODUCT, PRODUCT_KEYS, isValidProduct, resolveProduct, getCampaign };