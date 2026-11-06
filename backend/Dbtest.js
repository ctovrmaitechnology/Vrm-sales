const { Client } = require('pg');

const connectionString = 'postgresql://postgres.rdxaymtpzvkgbeogntmo:q2AeUwEDMskzWXvR@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres';

const client = new Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase connections
  },
});

async function testConnection() {
  try {
    console.log('⏳ Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connection successful!\n');

    // Basic DB info
    const dbResult = await client.query('SELECT current_database() AS database, current_user AS user, version() AS version;');
    const { database, user, version } = dbResult.rows[0];

    console.log('📦 Database :', database);
    console.log('👤 User     :', user);
    console.log('🛠  Version  :', version);

    // List tables in public schema
    const tableResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('\n📋 Tables in public schema:');
    if (tableResult.rows.length === 0) {
      console.log('   (no tables found)');
    } else {
      tableResult.rows.forEach((row) => console.log('  -', row.table_name));
    }

  } catch (err) {
    console.error('❌ Connection failed!');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Connection closed.');
  }
}

testConnection();