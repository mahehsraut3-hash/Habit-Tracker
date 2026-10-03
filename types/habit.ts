export interface Habit {
  id: number;
  name: string;
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  date: string; // Format: YYYY-MM-DD
  completed: number; // 1 for true, 0 for false
}

export interface HabitWithStatus extends Habit {
  isDoneToday: boolean;
  currentStreak: number;
}
