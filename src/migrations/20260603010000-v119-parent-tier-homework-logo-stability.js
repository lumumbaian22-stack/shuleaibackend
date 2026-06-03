'use strict';

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // v119 keeps parent subscriptions as Basic / Premium / Ultimate per child.
    // Do not overwrite a super admin's custom settings; only seed missing defaults.
    await q.query(`
      INSERT INTO "Settings" ("key", "value", "createdAt", "updatedAt")
      VALUES ('platform_payment_settings', jsonb_build_object(
        'parentPlans', jsonb_build_array(
          jsonb_build_object('code','child_basic','name','Basic','monthlyPriceKes',100,'features',jsonb_build_array('report_cards','attendance','progress'),'limits',jsonb_build_object('days',30,'aiQuestionsPerDay',0,'aiQuestionsPerMonth',0)),
          jsonb_build_object('code','child_premium','name','Premium','monthlyPriceKes',250,'features',jsonb_build_array('report_cards','attendance','progress','ai_tutor_limited','child_timetable'),'limits',jsonb_build_object('days',30,'aiQuestionsPerDay',6,'aiQuestionsPerMonth',180)),
          jsonb_build_object('code','child_ultimate','name','Ultimate','monthlyPriceKes',500,'features',jsonb_build_array('report_cards','attendance','progress','ai_tutor_extended','child_timetable','live_child_analytics','advanced_alerts','child_recommendations'),'limits',jsonb_build_object('days',30,'aiQuestionsPerDay',50,'aiQuestionsPerMonth',1500))
        )
      ), NOW(), NOW())
      ON CONFLICT ("key") DO UPDATE
      SET "value" = CASE
        WHEN COALESCE("Settings"."value"->'parentPlans', '[]'::jsonb) = '[]'::jsonb THEN jsonb_set("Settings"."value", '{parentPlans}', EXCLUDED."value"->'parentPlans', true)
        ELSE "Settings"."value"
      END,
      "updatedAt" = NOW()
    `).catch(() => null);

    // Make sure Growth/Enterprise school plan settings include homework if the super admin plan JSON exists already.
    await q.query(`
      UPDATE "Settings"
      SET "value" = jsonb_set("value", '{schoolPlans}', (
        SELECT jsonb_agg(
          CASE
            WHEN lower(COALESCE(plan->>'code', plan->>'name', '')) LIKE '%growth%' OR lower(COALESCE(plan->>'code', plan->>'name', '')) LIKE '%enterprise%'
              THEN jsonb_set(plan, '{features}', COALESCE(plan->'features','[]'::jsonb) || CASE WHEN COALESCE(plan->'features','[]'::jsonb) ? 'homework' THEN '[]'::jsonb ELSE '["homework"]'::jsonb END, true)
            ELSE plan
          END
        ) FROM jsonb_array_elements(COALESCE("value"->'schoolPlans','[]'::jsonb)) plan
      ), true),
      "updatedAt" = NOW()
      WHERE "key" = 'platform_payment_settings' AND jsonb_typeof("value"->'schoolPlans') = 'array'
    `).catch(() => null);

    // Keep old plan aliases working while new UI shows Basic/Premium/Ultimate.
    await q.query(`UPDATE "SubscriptionPlans" SET "code"='child_basic', "displayName"='Basic', "name"='Basic' WHERE "ownerType"='child' AND lower(COALESCE("code","name")) IN ('child_essential','essential')`).catch(() => null);
    await q.query(`UPDATE "SubscriptionPlans" SET "code"='child_premium', "displayName"='Premium', "name"='Premium', "limits" = COALESCE("limits", '{}'::jsonb) || '{"aiQuestionsPerDay":6,"aiQuestionsPerMonth":180}'::jsonb WHERE "ownerType"='child' AND lower(COALESCE("code","name")) IN ('child_smart','smart')`).catch(() => null);
    await q.query(`UPDATE "SubscriptionPlans" SET "code"='child_ultimate', "displayName"='Ultimate', "name"='Ultimate', "limits" = COALESCE("limits", '{}'::jsonb) || '{"aiQuestionsPerDay":50,"aiQuestionsPerMonth":1500}'::jsonb WHERE "ownerType"='child' AND lower(COALESCE("code","name")) IN ('child_genius','genius')`).catch(() => null);
  },
  async down() {}
};
