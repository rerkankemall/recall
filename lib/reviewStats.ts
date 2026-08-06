export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Shared by /api/stats (per-request, signed-in user) and the weekly recap
// cron (per-user, admin client) so the streak definition never diverges
// between what a user sees in-app and what the email tells them.
export function computeStreakAndWeek(reviewedAts: string[]): {
  streak: number;
  reviewedThisWeek: number;
  totalReviews: number;
} {
  const counts = new Map<string, number>();
  reviewedAts.forEach((r) => {
    const key = dateKey(new Date(r));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const totalReviews = reviewedAts.length;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let streak = 0;
  {
    const cursor = new Date(today);
    if (!counts.has(dateKey(cursor))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (counts.has(dateKey(cursor))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  let reviewedThisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    reviewedThisWeek += counts.get(dateKey(d)) || 0;
  }

  return { streak, reviewedThisWeek, totalReviews };
}

// The longest run of consecutive-day reviews ever, not just the current
// active streak — badges should stay earned permanently even after a streak
// later breaks, so this is computed separately from computeStreakAndWeek.
export function computeLongestStreak(reviewedAts: string[]): number {
  const uniqueDays = Array.from(new Set(reviewedAts.map((r) => dateKey(new Date(r))))).sort();
  if (uniqueDays.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1] + 'T00:00:00Z').getTime();
    const cur = new Date(uniqueDays[i] + 'T00:00:00Z').getTime();
    const diffDays = Math.round((cur - prev) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}
