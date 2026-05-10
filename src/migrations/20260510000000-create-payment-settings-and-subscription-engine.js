'use strict';

const CHILD_FEATURES = {
  essential: ['basic_parent_child_view','marks_view','attendance_view','homework_view','timetable_view','fee_balance_view','report_cards','light_ai_tutor'],
  smart: ['basic_parent_child_view','marks_view','attendance_view','homework_view','timetable_view','fee_balance_view','report_cards','light_ai_tutor','expanded_ai_tutor','weak_subject_detection','study_recommendations','exam_readiness','parent_insights'],
  genius: ['basic_parent_child_view','marks_view','attendance_view','homework_view','timetable_view','fee_balance_view','report_cards','light_ai_tutor','expanded_ai_tutor','unlimited_ai_tutor','weak_subject_detection','study_recommendations','exam_readiness','parent_insights','personalized_study_plan','adaptive_learning','advanced_child_analytics']
};

const SCHOOL_FEATURES = {
  starter: ['students','teachers','parents','attendance','homework','basic_timetable','calendar','marks','reports','fee_tracking','messaging','basic_analytics','maintenance'],
  growth: ['students','teachers','parents','attendance','homework','basic_timetable','calendar','marks','reports','fee_tracking','messaging','basic_analytics','maintenance','school_sidebar_branding','logo_branding','advanced_analytics','smart_alerts','department_management','multi_admin','advanced_reports','priority_support'],
  enterprise: ['students','teachers','parents','attendance','homework','basic_timetable','calendar','marks','reports','fee_tracking','messaging','basic_analytics','maintenance','school_sidebar_branding','logo_branding','advanced_analytics','smart_alerts','department_management','multi_admin','advanced_reports','priority_support','full_ai_tutor','predictive_insights','sms_automation','advanced_timetable_automation','custom_integrations','dedicated_support']
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    const describe = async (table) => {
      try { return await queryInterface.describeTable(table); } catch (_) { return null; }
    };
    const addColumn = async (table, name, definition) => {
      const desc = await describe(table);
      if (desc && !desc[name]) await queryInterface.addColumn(table, name, definition);
    };

    // Extend SubscriptionPlans without breaking existing rows.
    await addColumn('SubscriptionPlans', 'code', { type: DataTypes.STRING(40), unique: true, allowNull: true });
    await addColumn('SubscriptionPlans', 'displayName', { type: DataTypes.STRING(80), allowNull: true });
    await addColumn('SubscriptionPlans', 'audience', { type: DataTypes.ENUM('school','child'), allowNull: false, defaultValue: 'child' });
    await addColumn('SubscriptionPlans', 'tier', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 });
    await addColumn('SubscriptionPlans', 'yearlyPriceKes', { type: DataTypes.INTEGER, allowNull: true });
    await addColumn('SubscriptionPlans', 'setupFeeMinKes', { type: DataTypes.INTEGER, allowNull: true });
    await addColumn('SubscriptionPlans', 'setupFeeMaxKes', { type: DataTypes.INTEGER, allowNull: true });
    await addColumn('SubscriptionPlans', 'billingCycles', { type: DataTypes.JSONB, allowNull: false, defaultValue: ['monthly'] });
    await addColumn('SubscriptionPlans', 'limits', { type: DataTypes.JSONB, allowNull: false, defaultValue: {} });
    await addColumn('SubscriptionPlans', 'locks', { type: DataTypes.JSONB, allowNull: false, defaultValue: [] });
    await addColumn('SubscriptionPlans', 'description', { type: DataTypes.TEXT, allowNull: true });

    if (!await describe('SchoolPaymentSettings')) {
      await queryInterface.createTable('SchoolPaymentSettings', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        schoolId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        schoolCode: { type: DataTypes.STRING, allowNull: false, unique: true },
        paymentMode: { type: DataTypes.ENUM('manual','daraja','bank','mixed'), allowNull: false, defaultValue: 'manual' },
        mpesaType: { type: DataTypes.ENUM('till','paybill','none'), allowNull: false, defaultValue: 'none' },
        tillNumber: { type: DataTypes.STRING, allowNull: true },
        paybillNumber: { type: DataTypes.STRING, allowNull: true },
        businessShortCode: { type: DataTypes.STRING, allowNull: true },
        accountReferenceFormat: { type: DataTypes.ENUM('admissionNumber','studentId','nemisNumber','custom'), defaultValue: 'admissionNumber' },
        accountReferencePrefix: { type: DataTypes.STRING, allowNull: true },
        bankName: { type: DataTypes.STRING, allowNull: true },
        bankAccountName: { type: DataTypes.STRING, allowNull: true },
        bankAccountNumber: { type: DataTypes.STRING, allowNull: true },
        bankBranch: { type: DataTypes.STRING, allowNull: true },
        darajaEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
        darajaConsumerKey: { type: DataTypes.TEXT, allowNull: true },
        darajaConsumerSecret: { type: DataTypes.TEXT, allowNull: true },
        darajaPasskey: { type: DataTypes.TEXT, allowNull: true },
        darajaShortcode: { type: DataTypes.STRING, allowNull: true },
        darajaEnvironment: { type: DataTypes.ENUM('sandbox','production'), defaultValue: 'sandbox' },
        callbackUrl: { type: DataTypes.TEXT, allowNull: true },
        acceptedMethods: { type: DataTypes.JSONB, defaultValue: ['mpesa','bank'] },
        instructions: { type: DataTypes.TEXT, allowNull: true },
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
        metadata: { type: DataTypes.JSONB, defaultValue: {} },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
    }

    if (!await describe('PlatformPaymentSettings')) {
      await queryInterface.createTable('PlatformPaymentSettings', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        businessName: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Shule AI' },
        paymentMode: { type: DataTypes.ENUM('manual','daraja','bank','mixed'), allowNull: false, defaultValue: 'daraja' },
        mpesaType: { type: DataTypes.ENUM('till','paybill','none'), allowNull: false, defaultValue: 'till' },
        tillNumber: { type: DataTypes.STRING, allowNull: true },
        paybillNumber: { type: DataTypes.STRING, allowNull: true },
        businessShortCode: { type: DataTypes.STRING, allowNull: true },
        accountNumber: { type: DataTypes.STRING, allowNull: true },
        darajaConsumerKey: { type: DataTypes.TEXT, allowNull: true },
        darajaConsumerSecret: { type: DataTypes.TEXT, allowNull: true },
        darajaPasskey: { type: DataTypes.TEXT, allowNull: true },
        darajaShortcode: { type: DataTypes.STRING, allowNull: true },
        darajaEnvironment: { type: DataTypes.ENUM('sandbox','production'), defaultValue: 'sandbox' },
        callbackUrl: { type: DataTypes.TEXT, allowNull: true },
        bankName: { type: DataTypes.STRING, allowNull: true },
        bankAccountName: { type: DataTypes.STRING, allowNull: true },
        bankAccountNumber: { type: DataTypes.STRING, allowNull: true },
        bankBranch: { type: DataTypes.STRING, allowNull: true },
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
        metadata: { type: DataTypes.JSONB, defaultValue: {} },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
    }

    if (!await describe('Subscriptions')) {
      await queryInterface.createTable('Subscriptions', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        ownerType: { type: DataTypes.ENUM('school','child'), allowNull: false },
        schoolId: { type: DataTypes.INTEGER, allowNull: true },
        schoolCode: { type: DataTypes.STRING, allowNull: true },
        parentId: { type: DataTypes.INTEGER, allowNull: true },
        studentId: { type: DataTypes.INTEGER, allowNull: true },
        planId: { type: DataTypes.INTEGER, allowNull: true },
        planCode: { type: DataTypes.STRING, allowNull: false },
        planName: { type: DataTypes.STRING, allowNull: false },
        billingCycle: { type: DataTypes.ENUM('monthly','termly','yearly','custom'), allowNull: false, defaultValue: 'monthly' },
        status: { type: DataTypes.ENUM('active','expired','cancelled','pending','paused'), defaultValue: 'pending' },
        startDate: { type: DataTypes.DATE, allowNull: true },
        endDate: { type: DataTypes.DATE, allowNull: true },
        autoRenew: { type: DataTypes.BOOLEAN, defaultValue: false },
        lastPaymentId: { type: DataTypes.INTEGER, allowNull: true },
        featuresSnapshot: { type: DataTypes.JSONB, defaultValue: [] },
        limitsSnapshot: { type: DataTypes.JSONB, defaultValue: {} },
        metadata: { type: DataTypes.JSONB, defaultValue: {} },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
      await queryInterface.addIndex('Subscriptions', ['ownerType','schoolCode']);
      await queryInterface.addIndex('Subscriptions', ['studentId']);
      await queryInterface.addIndex('Subscriptions', ['status','endDate']);
    }

    if (!await describe('SubscriptionPayments')) {
      await queryInterface.createTable('SubscriptionPayments', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        subscriptionId: { type: DataTypes.INTEGER, allowNull: true },
        ownerType: { type: DataTypes.ENUM('school','child'), allowNull: false },
        schoolId: { type: DataTypes.INTEGER, allowNull: true },
        schoolCode: { type: DataTypes.STRING, allowNull: true },
        parentId: { type: DataTypes.INTEGER, allowNull: true },
        studentId: { type: DataTypes.INTEGER, allowNull: true },
        planId: { type: DataTypes.INTEGER, allowNull: true },
        planCode: { type: DataTypes.STRING, allowNull: false },
        amount: { type: DataTypes.INTEGER, allowNull: false },
        currency: { type: DataTypes.STRING, defaultValue: 'KES' },
        billingCycle: { type: DataTypes.ENUM('monthly','termly','yearly','custom'), defaultValue: 'monthly' },
        paymentMethod: { type: DataTypes.ENUM('mpesa','bank','card','manual'), defaultValue: 'mpesa' },
        checkoutRequestId: { type: DataTypes.STRING, allowNull: true, unique: true },
        merchantRequestId: { type: DataTypes.STRING, allowNull: true },
        mpesaReceiptNumber: { type: DataTypes.STRING, allowNull: true },
        phone: { type: DataTypes.STRING, allowNull: true },
        status: { type: DataTypes.ENUM('pending','success','failed','cancelled'), defaultValue: 'pending' },
        paidAt: { type: DataTypes.DATE, allowNull: true },
        rawCallback: { type: DataTypes.JSONB, defaultValue: {} },
        metadata: { type: DataTypes.JSONB, defaultValue: {} },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
      await queryInterface.addIndex('SubscriptionPayments', ['checkoutRequestId']);
      await queryInterface.addIndex('SubscriptionPayments', ['studentId']);
    }

    if (!await describe('FeatureLocks')) {
      await queryInterface.createTable('FeatureLocks', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        featureCode: { type: DataTypes.STRING, allowNull: false, unique: true },
        label: { type: DataTypes.STRING, allowNull: false },
        audience: { type: DataTypes.ENUM('school','child','both'), allowNull: false, defaultValue: 'both' },
        description: { type: DataTypes.TEXT, allowNull: true },
        isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
        metadata: { type: DataTypes.JSONB, defaultValue: {} },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
    }

    const plans = [
      { code:'school_starter', name:'starter', displayName:'Starter', audience:'school', tier:1, price_kes:5000, yearlyPriceKes:50000, setupFeeMinKes:50000, setupFeeMaxKes:100000, billingCycles:['monthly','yearly'], features:SCHOOL_FEATURES.starter, locks:['school_sidebar_branding','advanced_analytics','smart_alerts','full_ai_tutor'], description:'Core school operating system. Maintenance included.' },
      { code:'school_growth', name:'growth', displayName:'Growth', audience:'school', tier:2, price_kes:10000, yearlyPriceKes:100000, setupFeeMinKes:50000, setupFeeMaxKes:100000, billingCycles:['monthly','yearly'], features:SCHOOL_FEATURES.growth, locks:['full_ai_tutor','sms_automation','custom_integrations'], description:'Recommended school plan with branding, advanced analytics, and priority maintenance.' },
      { code:'school_enterprise', name:'enterprise', displayName:'Enterprise', audience:'school', tier:3, price_kes:30000, yearlyPriceKes:300000, setupFeeMinKes:50000, setupFeeMaxKes:100000, billingCycles:['monthly','yearly','custom'], features:SCHOOL_FEATURES.enterprise, locks:[], description:'Full enterprise school automation and premium support.' },
      { code:'child_essential', name:'essential', displayName:'Essential', audience:'child', tier:1, price_kes:100, billingCycles:['monthly'], features:CHILD_FEATURES.essential, limits:{ aiTutorQuestionsPerMonth:30 }, locks:['expanded_ai_tutor','unlimited_ai_tutor','advanced_child_analytics'], description:'Entry plan per child.' },
      { code:'child_smart', name:'smart', displayName:'Smart', audience:'child', tier:2, price_kes:250, billingCycles:['monthly'], features:CHILD_FEATURES.smart, limits:{ aiTutorQuestionsPerMonth:150 }, locks:['unlimited_ai_tutor','advanced_child_analytics'], description:'Best value child plan with deeper learning insights.' },
      { code:'child_genius', name:'genius', displayName:'Genius', audience:'child', tier:3, price_kes:500, billingCycles:['monthly'], features:CHILD_FEATURES.genius, limits:{ aiTutorQuestionsPerMonth:null }, locks:[], description:'Premium child plan with full AI learning support.' }
    ];

    for (const plan of plans) {
      await queryInterface.sequelize.query(`
        INSERT INTO "SubscriptionPlans"
          ("code","name","displayName","audience","tier","price_kes","yearlyPriceKes","setupFeeMinKes","setupFeeMaxKes","billingCycles","features","limits","locks","description","isActive","createdAt","updatedAt")
        VALUES
          (:code,:name,:displayName,:audience,:tier,:price_kes,:yearlyPriceKes,:setupFeeMinKes,:setupFeeMaxKes,:billingCycles::jsonb,:features::jsonb,:limits::jsonb,:locks::jsonb,:description,true,NOW(),NOW())
        ON CONFLICT ("code") DO UPDATE SET
          "displayName"=EXCLUDED."displayName",
          "audience"=EXCLUDED."audience",
          "tier"=EXCLUDED."tier",
          "price_kes"=EXCLUDED."price_kes",
          "yearlyPriceKes"=EXCLUDED."yearlyPriceKes",
          "features"=EXCLUDED."features",
          "limits"=EXCLUDED."limits",
          "locks"=EXCLUDED."locks",
          "description"=EXCLUDED."description",
          "updatedAt"=NOW()
      `, { replacements: { ...plan, billingCycles: JSON.stringify(plan.billingCycles || []), features: JSON.stringify(plan.features || []), limits: JSON.stringify(plan.limits || {}), locks: JSON.stringify(plan.locks || []) } });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SubscriptionPayments');
    await queryInterface.dropTable('Subscriptions');
    await queryInterface.dropTable('FeatureLocks');
    await queryInterface.dropTable('PlatformPaymentSettings');
    await queryInterface.dropTable('SchoolPaymentSettings');
  }
};
