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
