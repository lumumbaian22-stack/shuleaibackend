# Shule AI v150.1 — Backend Dashboard Behaviour Lock

This backend keeps the working v149.8 timetable DB lock and adds behaviour fixes required by the v150.1 frontend.

## Locked fixes
- Published timetable class/user endpoints rebuild class-specific lessons from global slots when compact class summaries are stored.
- Parent child timetable access uses strict parent-child ownership instead of the parent's default schoolCode, supporting multi-child/multi-school parents.
- Realtime socket room checks allow authorized parent-child contexts and parent conversations across linked child schools while keeping teacher/admin school scoping.
- Class report publishing accepts explicit `publishAnyway` confirmation metadata and stores unresolved issue summary in the report snapshot metadata.

## Timetable
The v149.8 Render/PostgreSQL timetable write stability remains unchanged.
