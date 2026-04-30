# Shule AI Backend V7 Complete Academic Suite

Built on the stable V6 package.

## Added / upgraded

### Timetable
- Admin-configurable lesson duration.
- Admin-configurable 1, 2, or 3 short breaks.
- Lunch break.
- Games break.
- Boarding/day school logic.
- Boarding remedial/prep block.
- Generate timetable for all active classes in the school.
- View generated class list.
- Click class to view class timetable.
- Edit individual slots after generation.
- Publish timetable.

### Marks Entry
- Teacher marks context endpoint.
- Load students by assigned class.
- Subject teacher can save draft marks for assigned subject/class.
- Class teacher can save and publish final marks.
- Backtesting / previous years supported through year + assessment mode.
- Teacher-defined grading scale accepted per batch.
- Pre-save analysis endpoint.

### Report Card
- Option 1 Modern Blue report card endpoint.
- Published marks only.
- Student info, academic summary, attendance summary, subject performance, strengths, improvement areas, teacher/principal remarks, and grading scale.

## Deploy order

1. Deploy backend V7.
2. Run migrations only if pending:
   ```bash
   npm run migrate
   ```
3. Restart backend.
4. Deploy frontend V7.
