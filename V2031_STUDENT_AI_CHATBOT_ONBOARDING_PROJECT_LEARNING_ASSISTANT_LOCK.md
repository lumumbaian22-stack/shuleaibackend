# V2031 Student AI Chatbot Onboarding + Project Learning Assistant Lock

This integration upgrades the existing `/api/tutor` and Student Dashboard AI Tutor into the ShuleAI Learning Assistant.

## Integrated behavior
- First-time onboarding before student chat use.
- Backend auto-detects student school, class, curriculum, subjects, marks, attendance, and tasks.
- Student AI does not ask for class/curriculum unless the student profile is missing.
- Answers must be complete, student-friendly, and step-by-step for complex processes.
- School project help is guided: title, aim, research questions, materials, method, findings, conclusion, recommendation, presentation, checklist.
- Students may study ahead safely; their class level is the starting point, not a limit.
- Unsafe, harmful, private-data, cheating, and cyber-abuse requests are redirected to safe learning.
- Chat history continues using TutorSession and TutorMessage.
- Admin AI Learning Assistant settings are stored in School.settings.aiLearningAssistant.

## Untouched areas
Payments, payment providers, analytics, report cards, parent-teacher messaging, auth/tenant isolation, and dashboard navigation were not changed.
