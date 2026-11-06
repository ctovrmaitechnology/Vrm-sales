CREATE TABLE "company" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "email_status" TEXT NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);
