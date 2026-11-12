const TEMPLATE_NAMES = ['workflow_final', 'benchtodeploy_final'];
const isAccepted = (s) => ['accepted', 'sent', 'delivered', 'read'].includes(s);

export const hasSentWhatsAppTemplate = (lead) => {
  const statuses = (lead.whatsappTemplateStatuses || []).filter((i) => TEMPLATE_NAMES.includes(i.templateName));
  return statuses.length
    ? statuses.some((i) => isAccepted(i.status))
    : lead.whatsappStatus === 'sent' || lead.whatsappStatus === 'clicked' || lead.status === 'sent';
};