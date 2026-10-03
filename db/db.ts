import * as SQLite from 'expo-sqlite';
import type { Habit, HabitLog, HabitWithStatus } from '../types/habit';
export type { Habit, HabitLog, HabitWithStatus };

export const DATABASE_NAME = 'habittracker.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function setDatabase(db: SQLite.SQLiteDatabase): void {
  dbInstance = db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DATABASE_NAME);
  }
  return dbInstance;
}

/**
 * Initializes database tables and pragmas.
 */
export async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    setDatabase(db);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (habit_id) REFERENCES habits (id) ON DELETE CASCADE,
        UNIQUE(habit_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_id ON habit_logs (habit_id);
      CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs (date);
    `);
    console.log('[Database] Tables initialized successfully');
  } catch (error) {
    console.error('[Database] Failed to initialize SQLite tables:', error);
    throw error;
  }
}

/**
 * Formats a Date object to YYYY-MM-DD string using local time.
 */
export function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Creates a new habit.
 */
export async function createHabit(
  name: string,
  db?: SQLite.SQLiteDatabase
): Promise<Habit> {
  const database = db ?? getDatabase();
  const trimmedName = name.trim();
  const result = await database.runAsync(
    'INSERT INTO habits (name) VALUES (?);',
    [trimmedName]
  );
  const created = await database.getFirstAsync<Habit>(
    'SELECT id, name, created_at FROM habits WHERE id = ?;',
    [result.lastInsertRowId]
  );
  if (!created) {
    throw new Error(`Failed to retrieve newly created habit with id ${result.lastInsertRowId}`);
  }
  return created;
}

/**
 * Retrieves all habits ordered by creation ID.
 */
export async function getAllHabits(
  db?: SQLite.SQLiteDatabase
): Promise<Habit[]> {
  const database = db ?? getDatabase();
  return await database.getAllAsync<Habit>(
    'SELECT id, name, created_at FROM habits ORDER BY id ASC;'
  );
}

/**
 * Deletes a habit and all associated logs.
 */
export async function deleteHabit(
  id: number,
  db?: SQLite.SQLiteDatabase
): Promise<void> {
  const database = db ?? getDatabase();
  await database.runAsync('DELETE FROM habit_logs WHERE habit_id = ?;', [id]);
  await database.runAsync('DELETE FROM habits WHERE id = ?;', [id]);
}

/**
 * Marks a habit as done (completed = 1) for a specific date (YYYY-MM-DD).
 */
export async function markHabitDone(
  habitId: number,
  date: string,
  db?: SQLite.SQLiteDatabase
): Promise<void> {
  const database = db ?? getDatabase();
  await database.runAsync(
    `INSERT INTO habit_logs (habit_id, date, completed)
     VALUES (?, ?, 1)
     ON CONFLICT(habit_id, date) DO UPDATE SET completed = 1;`,
    [habitId, date]
  );
}

/**
 * Marks a habit as undone (completed = 0) for a specific date (YYYY-MM-DD).
 */
export async function markHabitUndone(
  habitId: number,
  date: string,
  db?: SQLite.SQLiteDatabase
): Promise<void> {
  const database = db ?? getDatabase();
  await database.runAsync(
    `INSERT INTO habit_logs (habit_id, date, completed)
     VALUES (?, ?, 0)
     ON CONFLICT(habit_id, date) DO UPDATE SET completed = 0;`,
    [habitId, date]
  );
}

/**
 * Checks if a habit was completed on a specific date (YYYY-MM-DD).
 */
export async function isHabitDoneOnDate(
  habitId: number,
  date: string,
  db?: SQLite.SQLiteDatabase
): Promise<boolean> {
  const database = db ?? getDatabase();
  const row = await database.getFirstAsync<{ completed: number }>(
    'SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?;',
    [habitId, date]
  );
  return Boolean(row && row.completed === 1);
}

/**
 * Calculates current streak for a habit.
 * Counts consecutive days ending today (or yesterday, if today isn't marked yet)
 * where completed = true; returns 0 if both today and yesterday are missing.
 */
export async function getCurrentStreak(
  habitId: number,
  baseDateOrDb?: Date | SQLite.SQLiteDatabase,
  customDb?: SQLite.SQLiteDatabase
): Promise<number> {
  let baseDate = new Date();
  let db: SQLite.SQLiteDatabase | undefined;

  if (baseDateOrDb instanceof Date) {
    baseDate = baseDateOrDb;
    db = customDb;
  } else if (baseDateOrDb && typeof (baseDateOrDb as any).runAsync === 'function') {
    db = baseDateOrDb as SQLite.SQLiteDatabase;
  }

  const database = db ?? getDatabase();

  // Fetch all completed dates for this habit
  const completedLogs = await database.getAllAsync<{ date: string }>(
    'SELECT date FROM habit_logs WHERE habit_id = ? AND completed = 1;',
    [habitId]
  );

  const completedDates = new Set<string>(completedLogs.map((log) => log.date));

  const todayStr = formatDate(baseDate);

  const yesterday = new Date(baseDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  const isTodayDone = completedDates.has(todayStr);
  const isYesterdayDone = completedDates.has(yesterdayStr);

  // If neither today nor yesterday is completed, streak is 0
  if (!isTodayDone && !isYesterdayDone) {
    return 0;
  }

  let streak = 0;
  const checkDate = new Date(baseDate);

  if (isTodayDone) {
    // Today is done: streak ends today. Count backwards from today.
    while (true) {
      const dateStr = formatDate(checkDate);
      if (completedDates.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  } else {
    // Today is not marked yet, but yesterday is done: streak ends yesterday. Count backwards from yesterday.
    checkDate.setDate(checkDate.getDate() - 1);
    while (true) {
      const dateStr = formatDate(checkDate);
      if (completedDates.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  return streak;
}

/**
 * Clears all data from habits and habit_logs (for test/reset purposes).
 */
export async function clearAllData(db?: SQLite.SQLiteDatabase): Promise<void> {
  const database = db ?? getDatabase();
  await database.runAsync('DELETE FROM habit_logs;');
  await database.runAsync('DELETE FROM habits;');
}

/**
 * Retrieves all habits along with today's completion status and current streak.
 */
export async function getHabitsWithStatus(
  baseDate: Date = new Date(),
  db?: SQLite.SQLiteDatabase
): Promise<HabitWithStatus[]> {
  const database = db ?? getDatabase();
  const habits = await getAllHabits(database);
  const todayStr = formatDate(baseDate);

  return await Promise.all(
    habits.map(async (habit) => {
      const isDoneToday = await isHabitDoneOnDate(habit.id, todayStr, database);
      const currentStreak = await getCurrentStreak(habit.id, baseDate, database);
      return {
        ...habit,
        isDoneToday,
        currentStreak,
      };
    })
  );
}

