-- Shule AI v53 emergency SQL for payment settings + subscriptions.
-- Safe to run multiple times.

ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "code" VARCHAR(40);
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "displayName" VARCHAR(80);
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "audience" VARCHAR(20) DEFAULT 'child';
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "tier" INTEGER DEFAULT 1;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "yearlyPriceKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "setupFeeMinKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "setupFeeMaxKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "billingCycles" JSONB DEFAULT '["monthly"]'::jsonb;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "limits" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "locks" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "description" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_code_unique ON "SubscriptionPlans" ("code") WHERE "code" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "SchoolPaymentSettings" (
  "id" SERIAL PRIMARY KEY,
  "schoolId" INTEGER NOT NULL UNIQUE,
  "schoolCode" VARCHAR(255) NOT NULL UNIQUE,
  "paymentMode" VARCHAR(20) NOT NULL DEFAULT 'manual',
  "mpesaType" VARCHAR(20) NOT NULL DEFAULT 'none',
  "tillNumber" VARCHAR(255),
  "paybillNumber" VARCHAR(255),
  "businessShortCode" VARCHAR(255),
  "accountReferenceFormat" VARCHAR(40) DEFAULT 'admissionNumber',
  "accountReferencePrefix" VARCHAR(255),
  "bankName" VARCHAR(255),
  "bankAccountName" VARCHAR(255),
  "bankAccountNumber" VARCHAR(255),
  "bankBranch" VARCHAR(255),
  "darajaEnabled" BOOLEAN DEFAULT false,
  "darajaConsumerKey" TEXT,
  "darajaConsumerSecret" TEXT,
  "darajaPasskey" TEXT,
  "darajaShortcode" VARCHAR(255),
  "darajaEnvironment" VARCHAR(20) DEFAULT 'sandbox',
  "callbackUrl" TEXT,
  "acceptedMethods" JSONB DEFAULT '["mpesa","bank"]'::jsonb,
  "instructions" TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "PlatformPaymentSettings" (
  "id" SERIAL PRIMARY KEY,
  "businessName" VARCHAR(255) NOT NULL DEFAULT 'Shule AI',
  "paymentMode" VARCHAR(20) NOT NULL DEFAULT 'daraja',
  "mpesaType" VARCHAR(20) NOT NULL DEFAULT 'till',
  "tillNumber" VARCHAR(255),
  "paybillNumber" VARCHAR(255),
  "businessShortCode" VARCHAR(255),
  "accountNumber" VARCHAR(255),
  "darajaConsumerKey" TEXT,
  "darajaConsumerSecret" TEXT,
  "darajaPasskey" TEXT,
  "darajaShortcode" VARCHAR(255),
  "darajaEnvironment" VARCHAR(20) DEFAULT 'sandbox',
  "callbackUrl" TEXT,
  "bankName" VARCHAR(255),
  "bankAccountName" VARCHAR(255),
  "bankAccountNumber" VARCHAR(255),
  "bankBranch" VARCHAR(255),
  "isActive" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "Subscriptions" (
  "id" SERIAL PRIMARY KEY,
  "ownerType" VARCHAR(20) NOT NULL,
  "schoolId" INTEGER,
  "schoolCode" VARCHAR(255),
  "parentId" INTEGER,
  "studentId" INTEGER,
  "planId" INTEGER,
  "planCode" VARCHAR(255) NOT NULL,
  "planName" VARCHAR(255) NOT NULL,
  "billingCycle" VARCHAR(20) NOT NULL DEFAULT 'monthly',
  "status" VARCHAR(20) DEFAULT 'pending',
  "startDate" TIMESTAMP WITH TIME ZONE,
  "endDate" TIMESTAMP WITH TIME ZONE,
  "autoRenew" BOOLEAN DEFAULT false,
  "lastPaymentId" INTEGER,
  "featuresSnapshot" JSONB DEFAULT '[]'::jsonb,
  "limitsSnapshot" JSONB DEFAULT '{}'::jsonb,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_owner_school_idx ON "Subscriptions" ("ownerType", "schoolCode");
CREATE INDEX IF NOT EXISTS subscriptions_student_idx ON "Subscriptions" ("studentId");
CREATE INDEX IF NOT EXISTS subscriptions_status_end_idx ON "Subscriptions" ("status", "endDate");

CREATE TABLE IF NOT EXISTS "SubscriptionPayments" (
  "id" SERIAL PRIMARY KEY,
  "subscriptionId" INTEGER,
  "ownerType" VARCHAR(20) NOT NULL,
  "schoolId" INTEGER,
  "schoolCode" VARCHAR(255),
  "parentId" INTEGER,
  "studentId" INTEGER,
  "planId" INTEGER,
  "planCode" VARCHAR(255) NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(20) DEFAULT 'KES',
  "billingCycle" VARCHAR(20) DEFAULT 'monthly',
  "paymentMethod" VARCHAR(20) DEFAULT 'mpesa',
  "checkoutRequestId" VARCHAR(255) UNIQUE,
  "merchantRequestId" VARCHAR(255),
  "mpesaReceiptNumber" VARCHAR(255),
  "phone" VARCHAR(255),
  "status" VARCHAR(20) DEFAULT 'pending',
  "paidAt" TIMESTAMP WITH TIME ZONE,
  "rawCallback" JSONB DEFAULT '{}'::jsonb,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS subscription_payments_checkout_idx ON "SubscriptionPayments" ("checkoutRequestId");
CREATE INDEX IF NOT EXISTS subscription_payments_student_idx ON "SubscriptionPayments" ("studentId");

CREATE TABLE IF NOT EXISTS "FeatureLocks" (
  "id" SERIAL PRIMARY KEY,
  "featureCode" VARCHAR(255) NOT NULL UNIQUE,
  "label" VARCHAR(255) NOT NULL,
  "audience" VARCHAR(20) NOT NULL DEFAULT 'both',
  "description" TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
