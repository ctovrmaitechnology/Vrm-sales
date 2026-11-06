const prisma = require('../prismaClient');

const DEFAULT_CATEGORIES = ['IT', 'NON IT', 'BPO', 'Recruitment'];

let tableInitialized = false;

/**
 * Ensures categories table exists in the PostgreSQL database and seeds default categories.
 */
async function ensureCategoriesTable() {
  if (tableInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed default categories if not already present
    for (const cat of DEFAULT_CATEGORIES) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO categories (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING;
      `, cat);
    }

    tableInitialized = true;
  } catch (err) {
    console.error('Error ensuring categories table:', err.message);
  }
}

/**
 * GET /api/categories
 * Returns all categories (defaults + custom saved in DB + distinct sources from leads/companies)
 */
async function getCategories(req, res) {
  try {
    await ensureCategoriesTable();

    let dbRows = [];
    try {
      dbRows = await prisma.$queryRawUnsafe(`
        SELECT name FROM categories ORDER BY id ASC;
      `);
    } catch (e) {
      console.warn('Querying categories table failed, falling back:', e.message);
    }

    // Also pick up distinct source values from leads and company tables
    const [leadsSources, companySources] = await Promise.all([
      prisma.leads.findMany({
        where: { source: { not: null } },
        distinct: ['source'],
        select: { source: true },
      }).catch(() => []),
      prisma.company.findMany({
        where: { source: { not: null } },
        distinct: ['source'],
        select: { source: true },
      }).catch(() => []),
    ]);

    // Keep default categories at the top in exact order
    const categoryMap = new Map();
    DEFAULT_CATEGORIES.forEach((cat) => categoryMap.set(cat.toLowerCase(), cat));

    // Add DB categories
    for (const row of dbRows) {
      const name = (row.name || '').trim();
      if (name && !categoryMap.has(name.toLowerCase())) {
        categoryMap.set(name.toLowerCase(), name);
      }
    }

    // Add existing leads & company sources
    for (const row of leadsSources) {
      const name = (row.source || '').trim();
      if (name && !categoryMap.has(name.toLowerCase())) {
        categoryMap.set(name.toLowerCase(), name);
      }
    }
    for (const row of companySources) {
      const name = (row.source || '').trim();
      if (name && !categoryMap.has(name.toLowerCase())) {
        categoryMap.set(name.toLowerCase(), name);
      }
    }

    const categories = Array.from(categoryMap.values());
    return res.json({ success: true, categories });
  } catch (error) {
    console.error('Failed to get categories:', error);
    return res.status(500).json({
      error: 'Failed to retrieve categories',
      categories: DEFAULT_CATEGORIES
    });
  }
}

/**
 * POST /api/categories
 * Adds a new custom category into the database
 */
async function addCategory(req, res) {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const trimmedName = name.trim();

    if (trimmedName.length > 100) {
      return res.status(400).json({ error: 'Category name cannot exceed 100 characters.' });
    }

    await ensureCategoriesTable();

    // Check duplicate case-insensitively
    let existingRows = [];
    try {
      existingRows = await prisma.$queryRawUnsafe(`
        SELECT name FROM categories WHERE LOWER(name) = LOWER($1);
      `, trimmedName);
    } catch (e) {
      console.warn('Duplicate check query failed:', e.message);
    }

    const matchesDefault = DEFAULT_CATEGORIES.some(
      (c) => c.toLowerCase() === trimmedName.toLowerCase()
    );

    if (matchesDefault || (existingRows && existingRows.length > 0)) {
      return res.status(409).json({ error: `Category "${trimmedName}" already exists.` });
    }

    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO categories (name) VALUES ($1);
      `, trimmedName);
    } catch (insertError) {
      if (insertError.message && insertError.message.includes('unique')) {
        return res.status(409).json({ error: `Category "${trimmedName}" already exists.` });
      }
      throw insertError;
    }

    return res.status(201).json({
      success: true,
      message: 'Category added successfully.',
      category: trimmedName,
    });
  } catch (error) {
    console.error('Failed to add category:', error);
    return res.status(500).json({ error: 'Failed to save new category in the database.' });
  }
}

module.exports = {
  DEFAULT_CATEGORIES,
  getCategories,
  addCategory,
};

