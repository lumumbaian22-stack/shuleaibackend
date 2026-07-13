# V2022 CBC Report Card DOCX Template Lock

Focused patch based on the uploaded `CBC_Report_Card_Final (1).docx` template.

## Scope
- Replaced the frontend draft preview report-card HTML with the uploaded one-page CBC layout.
- Replaced the backend published PDF renderer with the same one-page CBC layout.
- Kept draft and published reports on one shared layout, with status/date differences only.
- Kept v2021 auth, realtime, payment, analytics, and tenant-security logic untouched.

## Template sections now matched
- Header logo/crest area, school name, motto, credentials, contact details, curriculum label.
- Report-card title area with Report ID, verification URL and code.
- Gold divider line.
- Student information row with photo, Elimu ID, admission number, teacher, class/stream, report type, promotion status, term/year/generated/published dates.
- Academic performance table with dynamic assessment columns and final level.
- Performance level key.
- Performance summary, attendance summary, CBC core values.
- Teacher feedback.
- Class teacher and headteacher comments.
- Term information row.
- Signature lines and footer.

## Admin settings added inside existing Academic & Report Card Settings
- Verification URL.
- Default promotion status fallback.
- Closing date.
- Opens next term.
- Fee balance display fallback.
- Toggles for promotion status, core values, teacher feedback, term information.

## Notes
- No database migration required.
- Uses existing school/reportCardSettings JSON fields.
- If real student/core-value/fee/term data is missing, the renderer shows a safe dash rather than inventing data.
