export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface Schedulable {
  interval_days: number;
  ease: number;
  reps: number;
}

// Simplified SM-2. Returns the new interval/ease/reps/due_date for an idea
// after the person rates how well they recalled it.
export function schedule(idea: Schedulable, grade: Grade) {
  let { interval_days: interval, ease, reps } = idea;

  if (grade === 'again') {
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else if (grade === 'hard') {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease = Math.max(1.3, ease - 0.15);
  } else if (grade === 'good') {
    interval = Math.max(1, Math.round(interval * ease));
  } else if (grade === 'easy') {
    interval = Math.max(1, Math.round(interval * ease * 1.3));
    ease = ease + 0.15;
  }

  reps += 1;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + interval);

  return { interval_days: interval, ease, reps, due_date: dueDate.toISOString() };
}
