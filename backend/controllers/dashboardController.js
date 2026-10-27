const { PrismaClient } = require('@prisma/client');
const prisma = require('../prismaClient');
const { getUnifiedEmailDashboard, getUnifiedWhatsAppDashboard } = require('../unifiedDb');

async function getDashboard(req, res) {
  try {
    res.json(await getUnifiedEmailDashboard());
  } catch (error) {
    res.status(500).json({
      error: "Dashboard fetch failed"
    });
  }
}

async function getWhatsAppDashboard(req, res) {
  try {
    res.json(await getUnifiedWhatsAppDashboard());
  } catch (error) {
    res.status(500).json({
      error: "WhatsApp Dashboard fetch failed"
    });
  }
}

async function getOverviewStats(req, res) {
  try {
    const [
      totalLeads,
      totalCompanies,
      leadsEmailsSent,
      companyEmailsSent,
      emailHistorySent,
      users
    ] = await Promise.all([
      prisma.leads.count(),
      prisma.company.count(),
      prisma.leads.count({ where: { email_status: 'sent' } }),
      prisma.company.count({ where: { email_status: 'sent' } }),
      prisma.email_history.count({ where: { status: 'sent' } }),
      prisma.users.findMany({
        where: { is_active: true },
        orderBy: { employee_name: 'asc' },
        include: {
          _count: {
            select: { leads: true, companies: true, email_history: true }
          }
        }
      })
    ]);

    const totalEmailsSent = Math.max(emailHistorySent, leadsEmailsSent + companyEmailsSent);

    return res.json({
      success: true,
      totalLeads,
      totalCompanies,
      totalEmailsSent,
      totalUsers: users.length,
      users
    });
  } catch (error) {
    console.error('Failed to get overview stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch overview stats.' });
  }
}

async function searchLeadsAndCompanies(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, leads: [], companies: [], totalFound: 0 });
    }

    const [leads, companies] = await Promise.all([
      prisma.leads.findMany({
        where: {
          OR: [
            { full_name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone_number: { contains: q, mode: 'insensitive' } },
            { whatsapp_number: { contains: q, mode: 'insensitive' } },
            { company_name: { contains: q, mode: 'insensitive' } },
          ]
        },
        include: {
          owner: { select: { id: true, employee_name: true } }
        },
        orderBy: { created_at: 'desc' },
        take: 20
      }),
      prisma.company.findMany({
        where: {
          OR: [
            { full_name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone_number: { contains: q, mode: 'insensitive' } },
            { whatsapp_number: { contains: q, mode: 'insensitive' } },
            { company_name: { contains: q, mode: 'insensitive' } },
          ]
        },
        include: {
          owner: { select: { id: true, employee_name: true } }
        },
        orderBy: { created_at: 'desc' },
        take: 20
      })
    ]);

    return res.json({
      success: true,
      query: q,
      totalFound: leads.length + companies.length,
      leads,
      companies
    });
  } catch (error) {
    console.error('Failed to search leads and companies:', error);
    return res.status(500).json({ success: false, error: 'Search failed.' });
  }
}

module.exports = {
  getDashboard,
  getWhatsAppDashboard,
  getOverviewStats,
  searchLeadsAndCompanies
};
