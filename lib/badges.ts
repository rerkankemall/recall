export type Badge = { id: string; label: string; threshold: number; earned: boolean };

const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100];
const REVIEW_THRESHOLDS = [10, 50, 100, 250, 500, 1000];

export function getStreakBadges(longestStreak: number): Badge[] {
  return STREAK_THRESHOLDS.map((threshold) => ({
    id: `streak-${threshold}`,
    label: `${threshold}-day streak`,
    threshold,
    earned: longestStreak >= threshold,
  }));
}

export function getReviewBadges(totalReviews: number): Badge[] {
  return REVIEW_THRESHOLDS.map((threshold) => ({
    id: `reviews-${threshold}`,
    label: `${threshold.toLocaleString()} ideas reviewed`,
    threshold,
    earned: totalReviews >= threshold,
  }));
}
