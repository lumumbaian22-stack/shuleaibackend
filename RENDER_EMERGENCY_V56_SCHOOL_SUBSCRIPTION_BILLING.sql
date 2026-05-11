-- Shule AI v56 emergency DB repair for school subscription and billing.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS "SchoolPaymentSettings" (
  "id" SERIAL PRIMARY KEY,
  "schoolId" INTEGER,
  "schoolCode" VARCHAR(255) NOT NULL,
  "paymentMode" VARCHAR(20) DEFAULT 'manual',
  "mpesaType" VARCHAR(20) DEFAULT 'paybill',
  "tillNumber" VARCHAR(255),
  "paybillNumber" VARCHAR(255),
  "businessShortCode" VARCHAR(255),
  "accountReferenceFormat" VARCHAR(255) DEFAULT 'admissionNumber',
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
  "callbackUrl" VARCHAR(255),
  "isActive" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "auditTrail" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "PlatformPaymentSettings" (
  "id" SERIAL PRIMARY KEY,
  "businessName" VARCHAR(255) DEFAULT 'Shule AI',
  "paymentMode" VARCHAR(20) DEFAULT 'daraja',
  "mpesaType" VARCHAR(20) DEFAULT 'paybill',
  "tillNumber" VARCHAR(255),
  "paybillNumber" VARCHAR(255),
  "businessShortCode" VARCHAR(255),
  "accountNumber" VARCHAR(255) DEFAULT 'SHULEAI',
  "darajaConsumerKey" TEXT,
  "darajaConsumerSecret" TEXT,
  "darajaPasskey" TEXT,
  "darajaShortcode" VARCHAR(255),
  "darajaEnvironment" VARCHAR(20) DEFAULT 'sandbox',
  "callbackUrl" VARCHAR(255),
  "bankName" VARCHAR(255),
  "bankAccountName" VARCHAR(255),
  "bankAccountNumber" VARCHAR(255),
  "bankBranch" VARCHAR(255),
  "isActive" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "auditTrail" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "code" VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_code_unique" ON "SubscriptionPlans" ("code") WHERE "code" IS NOT NULL;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "displayName" VARCHAR(255);
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "ownerType" VARCHAR(20) DEFAULT 'child';
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "monthlyPriceKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "termlyPriceKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "yearlyPriceKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "setupFeeMinKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "setupFeeMaxKes" INTEGER;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "lockedFeatures" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "limits" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER DEFAULT 0;

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
  "billingCycle" VARCHAR(20) DEFAULT 'monthly',
  "status" VARCHAR(20) DEFAULT 'pending',
  "startDate" TIMESTAMP WITH TIME ZONE,
  "endDate" TIMESTAMP WITH TIME ZONE,
  "autoRenew" BOOLEAN DEFAULT false,
  "lastPaymentId" INTEGER,
  "features" JSONB DEFAULT '[]'::jsonb,
  "limits" JSONB DEFAULT '{}'::jsonb,
  "auditTrail" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
  "planName" VARCHAR(255) NOT NULL,
  "billingCycle" VARCHAR(20) DEFAULT 'monthly',
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(20) DEFAULT 'KES',
  "paymentMethod" VARCHAR(20) DEFAULT 'mpesa',
  "checkoutRequestId" VARCHAR(255),
  "merchantRequestId" VARCHAR(255),
  "mpesaReceiptNumber" VARCHAR(255),
  "status" VARCHAR(20) DEFAULT 'pending',
  "paidAt" TIMESTAMP WITH TIME ZONE,
  "rawCallback" JSONB DEFAULT '{}'::jsonb,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "auditTrail" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "FeatureLocks" (
  "id" SERIAL PRIMARY KEY,
  "featureKey" VARCHAR(255) UNIQUE NOT NULL,
  "featureName" VARCHAR(255) NOT NULL,
  "ownerType" VARCHAR(20) DEFAULT 'both',
  "requiredPlans" JSONB DEFAULT '[]'::jsonb,
  "gracefulFallback" BOOLEAN DEFAULT true,
  "isActive" BOOLEAN DEFAULT true,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "subscriptionPaymentId" INTEGER;
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "subscriptionId" INTEGER;
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "ownerType" VARCHAR(255);
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "billingCycle" VARCHAR(255);
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "planCode" VARCHAR(255);
ALTER TABLE "Payments" ADD COLUMN IF NOT EXISTS "planName" VARCHAR(255);
ALTER TABLE "Payments" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "Payments" ALTER COLUMN "parentId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_code_unique" ON "SubscriptionPlans" ("code");

INSERT INTO "SubscriptionPlans" ("code","name","displayName","ownerType","price_kes","monthlyPriceKes","yearlyPriceKes","setupFeeMinKes","setupFeeMaxKes","features","lockedFeatures","limits","sortOrder","isActive","createdAt","updatedAt") VALUES
('school_starter','starter','Starter','school',5000,5000,50000,50000,100000,'["Core school operations","Student management","Teacher management","Parent and student dashboards","Attendance","Homework","Timetable","Academic calendar","Marks and report cards","Finance and fee tracking","Messaging and announcements","Basic analytics","Maintenance included"]'::jsonb,'["School name/sidebar branding","AI powered analytics","Smart alerts","Advanced reports","Department management","Advanced multi-admin controls","Full AI tutor"]'::jsonb,'{"branding":false,"support":"basic"}'::jsonb,1,true,NOW(),NOW()),
('school_growth','growth','Growth','school',10000,10000,100000,50000,100000,'["Everything in Starter","School name and branding in sidebar","School logo customization","Advanced analytics","AI powered school insights","Smart alerts center","Weak student detection","Attendance intelligence","Parent engagement analytics","Teacher performance insights","Department management","Multi-admin controls","Advanced reports","Priority maintenance included"]'::jsonb,'["Enterprise integrations","Multi-campus workflows","Dedicated account support"]'::jsonb,'{"branding":true,"support":"priority"}'::jsonb,2,true,NOW(),NOW()),
('school_enterprise','enterprise','Enterprise','school',30000,30000,300000,50000,100000,'["Everything in Growth","Full AI tutor integration","Full analytics engine","Predictive academic insights","Premium reporting","SMS automation","Advanced timetable automation","Custom workflows","Multi-campus support","Dedicated support","Custom integrations"]'::jsonb,'[]'::jsonb,'{"branding":true,"support":"dedicated"}'::jsonb,3,true,NOW(),NOW()),
('child_essential','essential','Essential','child',100,100,NULL,NULL,NULL,'["Marks and report cards","Attendance","Homework tracking","Fee balance","Timetable","Teacher communication","Academic calendar","Basic performance trends","Light AI tutor"]'::jsonb,'["Personalized study plans","Deep analytics","Advanced exam preparation","Unlimited tutor use"]'::jsonb,'{"aiQuestionsPerMonth":30}'::jsonb,10,true,NOW(),NOW()),
('child_smart','smart','Smart','child',250,250,NULL,NULL,NULL,'["Everything in Essential","Weak subject detection","Performance insights","Attendance trend alerts","Homework completion insights","Academic recommendations","Study recommendations","Exam readiness insights","Parent guidance tips","Expanded AI tutor"]'::jsonb,'["Unlimited AI tutor","Full adaptive learning","Daily learning goals"]'::jsonb,'{"aiQuestionsPerMonth":150}'::jsonb,11,true,NOW(),NOW()),
('child_genius','genius','Genius','child',500,500,NULL,NULL,NULL,'["Everything in Smart","Unlimited AI tutor","Full child analytics","Performance prediction","Behavior and performance alerts","Parent coaching recommendations","Personalized study plans","Adaptive learning","Smart revision engine","Exam prep mode","Daily learning goals"]'::jsonb,'[]'::jsonb,'{"aiQuestionsPerMonth":null,"unlimitedAI":true}'::jsonb,12,true,NOW(),NOW())
ON CONFLICT ("code") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "ownerType" = EXCLUDED."ownerType",
  "price_kes" = EXCLUDED."price_kes",
  "monthlyPriceKes" = EXCLUDED."monthlyPriceKes",
  "yearlyPriceKes" = EXCLUDED."yearlyPriceKes",
  "features" = EXCLUDED."features",
  "lockedFeatures" = EXCLUDED."lockedFeatures",
  "limits" = EXCLUDED."limits",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = NOW();
ALTER TABLE "Payments" ALTER COLUMN "plan" TYPE VARCHAR(255) USING "plan"::text;
