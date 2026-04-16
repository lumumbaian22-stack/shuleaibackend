const { HomeTask, Competency, LearningOutcome } = require('../src/models');

const templates = [
  { title: 'Practice {subject} problems', instructions: 'Solve {number} {subject} problems involving {topic}.', type: 'Practice', points: 10 },
  // Add more templates
];

async function generate() {
  const competencies = await Competency.findAll({ include: [LearningOutcome] });
  for (const comp of competencies) {
    for (const grade of ['Grade 1', 'Grade 2', ...]) {
      for (const template of templates) {
        // Expand placeholders
        const title = template.title.replace('{subject}', comp.name);
        // Create HomeTask
        await HomeTask.create({ title, instructions, gradeLevel: grade, competencyId: comp.id, ... });
      }
    }
  }
}
