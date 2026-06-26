-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "Status" TEXT,
ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "followUp1Sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUp2Sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "initialEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "whatsappClickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsappStatus" TEXT;
