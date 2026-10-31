const axios = require('axios');

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const WHATSAPP_TOKEN = () => process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = () => process.env.PHONE_NUMBER_ID;
const WABA_ID = () => process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

async function graphGet(path, params = {}) {
  const token = WHATSAPP_TOKEN();
  if (!token) {
    const err = new Error('WHATSAPP_TOKEN is not configured.');
    err.code = 'missing_token';
    throw err;
  }
  const response = await axios.get(`${GRAPH_BASE_URL}/${path}`, {
    params: { access_token: token, ...params },
  });
  return response.data;
}

// Phone number quality rating, messaging limit tier, verification status.
// Only needs PHONE_NUMBER_ID + WHATSAPP_TOKEN (already configured).
async function getPhoneNumberHealth() {
  const phoneNumberId = PHONE_NUMBER_ID();
  if (!phoneNumberId) {
    return { configured: false, error: 'PHONE_NUMBER_ID is not configured.' };
  }

  try {
    const data = await graphGet(phoneNumberId, {
      fields: [
        'display_phone_number',
        'verified_name',
        'quality_rating',
        'messaging_limit_tier',
        'name_status',
        'code_verification_status',
        'platform_type',
        'throughput',
      ].join(','),
    });

    return {
      configured: true,
      phoneNumberId,
      displayPhoneNumber: data.display_phone_number || null,
      verifiedName: data.verified_name || null,
      qualityRating: data.quality_rating || 'UNKNOWN',
      messagingLimitTier: data.messaging_limit_tier || 'UNKNOWN',
      nameStatus: data.name_status || null,
      codeVerificationStatus: data.code_verification_status || null,
      throughputLevel: data.throughput?.level || null,
    };
  } catch (error) {
    return {
      configured: true,
      error: error.response?.data?.error?.message || error.message,
    };
  }
}

// WABA-level account info (currency, verification/review status).
async function getAccountInfo() {
  const wabaId = WABA_ID();
  if (!wabaId) {
    return { configured: false, error: 'WHATSAPP_BUSINESS_ACCOUNT_ID is not configured.' };
  }

  try {
    const data = await graphGet(wabaId, {
      fields: 'name,currency,timezone_id,account_review_status,business_verification_status',
    });
    return {
      configured: true,
      wabaId,
      name: data.name || null,
      currency: data.currency || 'USD',
      accountReviewStatus: data.account_review_status || null,
      businessVerificationStatus: data.business_verification_status || null,
    };
  } catch (error) {
    return {
      configured: true,
      error: error.response?.data?.error?.message || error.message,
    };
  }
}

// Prepaid credit / funding balance for the Business Manager that owns this
// WABA. Requires the token to carry the `business_management` permission
// (separate from whatsapp_business_messaging/management) — most WhatsApp API
// tokens are not issued with it, so this degrades to a clear "permission
// needed" message instead of failing the whole insights response.
async function getAccountBalance() {
  const wabaId = WABA_ID();
  if (!wabaId) {
    return { configured: false, error: 'WHATSAPP_BUSINESS_ACCOUNT_ID is not configured.' };
  }

  try {
    const wabaData = await graphGet(wabaId, { fields: 'owner_business_info' });
    const businessId = wabaData.owner_business_info?.id;
    if (!businessId) {
      return { configured: true, error: 'Could not resolve the owning Business Manager for this WABA.' };
    }

    const data = await graphGet(`${businessId}/extendedcredits`, {
      fields: 'balance,amount_available,credit_available,currency,legal_entity_name',
    });
    const line = data.data?.[0];
    if (!line) {
      return { configured: true, error: 'No credit line found for this Business Manager.' };
    }

    return {
      configured: true,
      businessId,
      businessName: line.legal_entity_name || null,
      currency: line.currency || null,
      balance: line.balance?.amount != null ? Number(line.balance.amount) : null,
      amountAvailable: line.amount_available?.amount != null ? Number(line.amount_available.amount) : null,
      creditAvailable: line.credit_available?.amount != null ? Number(line.credit_available.amount) : null,
    };
  } catch (error) {
    const graphError = error.response?.data?.error;
    const isPermissionError = graphError?.code === 200 || graphError?.type === 'OAuthException';
    return {
      configured: true,
      permissionMissing: isPermissionError,
      error: isPermissionError
        ? 'Your WhatsApp token needs the "business_management" permission to read account balance. Regenerate it in Meta Business settings with that scope added.'
        : (graphError?.message || error.message),
    };
  }
}

// WhatsApp Business Account level: message template list + per-template quality.
async function getMessageTemplates() {
  const wabaId = WABA_ID();
  if (!wabaId) {
    return { configured: false, error: 'WHATSAPP_BUSINESS_ACCOUNT_ID is not configured.', templates: [] };
  }

  try {
    const data = await graphGet(`${wabaId}/message_templates`, {
      fields: 'id,name,status,category,language,quality_score',
      limit: 100,
    });
    const templates = (data.data || []).map((tmpl) => ({
      id: tmpl.id,
      name: tmpl.name,
      status: tmpl.status,
      category: tmpl.category,
      language: tmpl.language,
      qualityScore: tmpl.quality_score?.score || null,
    }));
    return { configured: true, templates };
  } catch (error) {
    return {
      configured: true,
      error: error.response?.data?.error?.message || error.message,
      templates: [],
    };
  }
}

// Per-message pricing analytics (amount spent), grouped by pricing category
// (Marketing / Utility / Authentication / Service). This is WhatsApp's
// current (2025+) per-message billing model — replaces the older,
// conversation-based conversation_analytics endpoint.
async function getMessageSpend({ startDate, endDate, currency } = {}) {
  const wabaId = WABA_ID();
  if (!wabaId) {
    return { configured: false, error: 'WHATSAPP_BUSINESS_ACCOUNT_ID is not configured.' };
  }

  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);

  try {
    const data = await graphGet(`${wabaId}/pricing_analytics`, {
      start: startUnix,
      end: endUnix,
      granularity: 'DAILY',
      metric_types: JSON.stringify(['VOLUME', 'COST']),
      dimensions: JSON.stringify(['PRICING_CATEGORY']),
    });

    const points = (data?.data || []).flatMap((entry) => entry.data_points || []);
    const byCategory = new Map();
    let totalCost = 0;
    let totalVolume = 0;

    for (const point of points) {
      const category = point.pricing_category || 'OTHER';
      const cost = Number(point.cost || 0);
      const volume = Number(point.volume || 0);
      totalCost += cost;
      totalVolume += volume;
      if (!byCategory.has(category)) byCategory.set(category, { category, cost: 0, volume: 0 });
      const entry = byCategory.get(category);
      entry.cost += cost;
      entry.volume += volume;
    }

    return {
      configured: true,
      currency: currency || 'USD',
      totalCost: Number(totalCost.toFixed(2)),
      totalVolume,
      byCategory: [...byCategory.values()]
        .map((entry) => ({ ...entry, cost: Number(entry.cost.toFixed(2)) }))
        .sort((a, b) => b.cost - a.cost),
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
    };
  } catch (error) {
    return {
      configured: true,
      error: error.response?.data?.error?.message || error.message || 'Pricing analytics are not available for this account.',
    };
  }
}

// Message volume (sent/delivered) straight from the WABA analytics field.
async function getMessageVolume({ startDate, endDate } = {}) {
  const wabaId = WABA_ID();
  if (!wabaId) {
    return { configured: false, error: 'WHATSAPP_BUSINESS_ACCOUNT_ID is not configured.' };
  }

  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);

  try {
    const data = await graphGet(wabaId, {
      fields: `analytics.start(${startUnix}).end(${endUnix}).granularity(DAY)`,
    });

    const points = data?.analytics?.data_points || [];
    const totalSent = points.reduce((sum, point) => sum + Number(point.sent || 0), 0);
    const totalDelivered = points.reduce((sum, point) => sum + Number(point.delivered || 0), 0);

    return {
      configured: true,
      totalSent,
      totalDelivered,
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
    };
  } catch (error) {
    return {
      configured: true,
      error: error.response?.data?.error?.message || error.message || 'Message analytics are not available for this account.',
    };
  }
}

// Per-template send/delivered/read/clicked/replied analytics, straight from
// the Meta Graph API (/{WABA_ID}/template_analytics) — not from our own DB.
async function getTemplateAnalytics({ startDate, endDate } = {}) {
  const wabaId = WABA_ID();
  if (!wabaId) {
    return { configured: false, error: 'WHATSAPP_BUSINESS_ACCOUNT_ID is not configured.', perTemplate: [] };
  }

  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);

  try {
    const templatesResult = await getMessageTemplates();
    const templates = (templatesResult.templates || []).filter((t) => t.id);
    if (!templates.length) {
      return { configured: true, perTemplate: [], rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
    }
    const nameById = new Map(templates.map((t) => [t.id, t.name]));
    const templateIds = templates.map((t) => t.id);

    const byTemplate = new Map(templateIds.map((id) => [id, {
      templateName: nameById.get(id),
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      clicked: 0,
    }]));

    const baseParams = {
      start: startUnix,
      end: endUnix,
      granularity: 'DAILY',
      metric_types: JSON.stringify(['SENT', 'DELIVERED', 'READ', 'CLICKED', 'REPLIED']),
      template_ids: JSON.stringify(templateIds),
    };

    // Meta paginates data_points. paging.next comes back with the
    // access_token redacted ("--sanitized--"), so we can't follow it
    // directly — instead reissue the request each time with our own token
    // and the `after` cursor from paging.cursors.
    let after;
    for (let page = 0; page < 20; page++) {
      const data = await graphGet(`${wabaId}/template_analytics`, {
        ...baseParams,
        ...(after ? { after } : {}),
      });
      const points = (data?.data || []).flatMap((entry) => entry.data_points || []);

      for (const point of points) {
        const entry = byTemplate.get(point.template_id);
        if (!entry) continue;
        entry.sent += Number(point.sent || 0);
        entry.delivered += Number(point.delivered || 0);
        entry.read += Number(point.read || 0);
        entry.replied += Number(point.replied || 0);
        if (Array.isArray(point.clicked)) {
          entry.clicked += point.clicked.reduce((sum, c) => sum + Number(c.count || 0), 0);
        }
      }

      after = data?.paging?.cursors?.after;
      if (!after || !data?.paging?.next) break;
    }

    const perTemplate = [...byTemplate.values()].sort((a, b) => b.sent - a.sent);
    const totalSent = perTemplate.reduce((sum, t) => sum + t.sent, 0);
    const totalDelivered = perTemplate.reduce((sum, t) => sum + t.delivered, 0);
    const totalRead = perTemplate.reduce((sum, t) => sum + t.read, 0);
    const totalReplied = perTemplate.reduce((sum, t) => sum + t.replied, 0);

    return {
      configured: true,
      perTemplate,
      totalSent,
      totalDelivered,
      totalRead,
      totalReplied,
      deliveryRate: totalSent > 0 ? Number(((totalDelivered / totalSent) * 100).toFixed(1)) : 0,
      readRate: totalDelivered > 0 ? Number(((totalRead / totalDelivered) * 100).toFixed(1)) : 0,
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
    };
  } catch (error) {
    return {
      configured: true,
      error: error.response?.data?.error_user_msg || error.response?.data?.error?.message || error.message,
      perTemplate: [],
    };
  }
}

module.exports = {
  getPhoneNumberHealth,
  getAccountInfo,
  getAccountBalance,
  getMessageTemplates,
  getMessageSpend,
  getMessageVolume,
  getTemplateAnalytics,
};
