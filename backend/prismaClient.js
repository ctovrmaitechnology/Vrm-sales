const { PrismaClient } = require('@prisma/client');

if (!global.__prismaClientInstance) {
  global.__prismaClientInstance = new PrismaClient();
}

module.exports = global.__prismaClientInstance;
