import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getHabitsWithStatus,
  markHabitDone,
  markHabitUndone,
  deleteHabit,
  getCurrentStreak,
  formatDate,
} from '../db/db';
import type { HomeScreenProps } from '../types/navigation';
import type { HabitWithStatus } from '../types/habit';

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const db = useSQLiteContext();
  const [habits, setHabits] = useState<HabitWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchHabits = useCallback(async () => {
    try {
      const data = await getHabitsWithStatus(new Date(), db);
      setHabits(data);
    } catch (error) {
      console.error('Failed to load habits:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void fetchHabits();
    }, [fetchHabits])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void fetchHabits();
  }, [fetchHabits]);

  // Toggle habit done / undone for today
  const handleToggleDone = async (habit: HabitWithStatus) => {
    if (togglingId === habit.id) return;

    const todayStr = formatDate(new Date());
    const willBeDone = !habit.isDoneToday;

    // Optimistically update the UI
    setTogglingId(habit.id);
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habit.id
          ? {
              ...h,
              isDoneToday: willBeDone,
              currentStreak: willBeDone ? h.currentStreak + 1 : Math.max(0, h.currentStreak - 1),
            }
          : h
      )
    );

    try {
      if (willBeDone) {
        await markHabitDone(habit.id, todayStr, db);
      } else {
        await markHabitUndone(habit.id, todayStr, db);
      }

      // Re-query the exact streak from database logic
      const accurateStreak = await getCurrentStreak(habit.id, undefined, db);

      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id
            ? { ...h, isDoneToday: willBeDone, currentStreak: accurateStreak }
            : h
        )
      );
    } catch (error) {
      console.error('Failed to toggle habit status:', error);
      // Revert on error
      void fetchHabits();
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async (habitId: number) => {
    try {
      setDeletingId(habitId);
      await deleteHabit(habitId, db);
      await fetchHabits();
    } catch (error) {
      console.error('Failed to delete habit:', error);
      Alert.alert('Error', 'Failed to delete habit. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeletePress = (habit: HabitWithStatus) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Delete habit "${habit.name}"?`);
      if (confirmed) {
        void confirmDelete(habit.id);
      }
    } else {
      Alert.alert(
        'Delete Habit',
        `Are you sure you want to delete "${habit.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => void confirmDelete(habit.id),
          },
        ]
      );
    }
  };

  const completedCount = habits.filter((h) => h.isDoneToday).length;
  const pendingHabits = habits.filter((h) => !h.isDoneToday);
  const progressPercent = habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0;

  // Header rendered above the list: includes Progress Bar and "Pending Today" Panel
  const renderListHeader = () => {
    if (habits.length === 0) return null;

    return (
      <View style={styles.listHeaderWrapper}>
        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeaderRow}>
            <View>
              <Text style={styles.progressTitle}>Today{"'"}s Progress</Text>
              <Text style={styles.progressSubtitle}>
                {completedCount === habits.length
                  ? 'All habits completed!'
                  : `${habits.length - completedCount} remaining to complete`}
              </Text>
            </View>
            <View style={styles.progressPercentageBadge}>
              <Text style={styles.progressPercentageText}>{progressPercent}%</Text>
            </View>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        {/* --- PENDING TODAY SECTION --- */}
        <View style={styles.pendingSection}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Pending Today</Text>
            {pendingHabits.length > 0 ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingHabits.length} to do</Text>
              </View>
            ) : null}
          </View>

          {pendingHabits.length === 0 ? (
            // Celebratory empty state when all habits are done today
            <View style={styles.allDoneCard}>
              <View style={styles.allDoneIconCircle}>
                <Text style={styles.allDoneEmoji}>🎉</Text>
              </View>
              <View style={styles.allDoneTextWrapper}>
                <Text style={styles.allDoneTitle}>All done for today!</Text>
                <Text style={styles.allDoneSubtitle}>
                  You have completed every habit for today. Great job keeping your streaks alive!
                </Text>
              </View>
            </View>
          ) : (
            // List of incomplete habits pending today
            <View style={styles.pendingList}>
              {pendingHabits.map((item) => {
                const isToggling = togglingId === item.id;
                return (
                  <TouchableOpacity
                    key={`pending-${item.id}`}
                    style={styles.pendingItemCard}
                    onPress={() => handleToggleDone(item)}
                    disabled={isToggling}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pendingCheckbox}>
                      {isToggling ? (
                        <ActivityIndicator size="small" color="#4F46E5" />
                      ) : (
                        <View style={styles.checkboxEmptyDot} />
                      )}
                    </View>

                    <View style={styles.pendingDetails}>
                      <Text style={styles.pendingItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.pendingItemStreak}>
                        {item.currentStreak > 0
                          ? `🔥 ${item.currentStreak} day streak`
                          : '0 day streak'}
                      </Text>
                    </View>

                    <View style={styles.markDoneHintBadge}>
                      <Text style={styles.markDoneHintText}>Tap to complete</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Section title for All Habits */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>All Habits</Text>
          <Text style={styles.sectionSubtitleText}>{habits.length} total</Text>
        </View>
      </View>
    );
  };

  const renderHabitItem = ({ item }: { item: HabitWithStatus }) => {
    const isDeleting = deletingId === item.id;
    const isToggling = togglingId === item.id;

    return (
      <View
        style={[
          styles.habitCard,
          item.isDoneToday ? styles.habitCardDone : styles.habitCardPending,
        ]}
      >
        {/* Large, comfortable Checkbox Target (minimum 44x44 points) */}
        <TouchableOpacity
          style={[
            styles.checkbox,
            item.isDoneToday ? styles.checkboxDone : styles.checkboxPending,
          ]}
          onPress={() => handleToggleDone(item)}
          disabled={isToggling || isDeleting}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={`Mark ${item.name} as ${item.isDoneToday ? 'incomplete' : 'complete'}`}
        >
          {item.isDoneToday ? (
            <Text style={styles.checkmark}>✓</Text>
          ) : isToggling ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : (
            <View style={styles.checkboxEmptyDot} />
          )}
        </TouchableOpacity>

        {/* Habit info & streak */}
        <TouchableOpacity
          style={styles.habitDetails}
          onPress={() => handleToggleDone(item)}
          disabled={isToggling || isDeleting}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.habitName,
              item.isDoneToday && styles.habitNameDone,
            ]}
            numberOfLines={2}
          >
            {item.name}
          </Text>

          {/* Streak badge & completion status */}
          <View style={styles.metaRow}>
            <View
              style={[
                styles.streakBadge,
                item.currentStreak > 0
                  ? styles.streakBadgeActive
                  : styles.streakBadgeZero,
              ]}
            >
              <Text
                style={[
                  styles.streakText,
                  item.currentStreak > 0
                    ? styles.streakTextActive
                    : styles.streakTextZero,
                ]}
              >
                {item.currentStreak > 0
                  ? `🔥 ${item.currentStreak} day streak`
                  : '0 day streak'}
              </Text>
            </View>

            {item.isDoneToday ? (
              <View style={styles.doneIndicatorBadge}>
                <Text style={styles.completedBadgeText}>Completed today</Text>
              </View>
            ) : (
              <View style={styles.pendingIndicatorBadge}>
                <Text style={styles.pendingIndicatorText}>Pending</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Delete action */}
        <TouchableOpacity
          style={[styles.deleteButton, isDeleting && styles.buttonDisabled]}
          onPress={() => handleDeletePress(item)}
          disabled={isDeleting || isToggling}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Delete ${item.name}`}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Text style={styles.deleteButtonText}>Delete</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.content}>
        {/* Top Header Row with Clear Primary Action */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Habit Tracker</Text>
            <Text style={styles.screenSubtitle}>
              {habits.length === 0
                ? 'Ready to build new habits'
                : `${completedCount} of ${habits.length} completed today`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddHabit')}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.addButtonText}>+ New Habit</Text>
          </TouchableOpacity>
        </View>

        {/* Habits List / Friendly Empty State / Loading */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingText}>Loading habits...</Text>
          </View>
        ) : (
          <FlatList
            data={habits}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderHabitItem}
            ListHeaderComponent={renderListHeader}
            contentContainerStyle={[
              styles.listContent,
              habits.length === 0 && styles.emptyListContent,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                colors={['#4F46E5']}
                tintColor="#4F46E5"
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Text style={styles.emptyIconText}>🌱</Text>
                </View>
                <Text style={styles.emptyTitle}>Add your first habit to get started</Text>
                <Text style={styles.emptySubtitle}>
                  Track your daily routines, stay accountable, and build unstoppable momentum day by day.
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddButton}
                  onPress={() => navigation.navigate('AddHabit')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emptyAddButtonText}>+ Add Habit</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  listHeaderWrapper: {
    marginBottom: 8,
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  progressSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  progressPercentageBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  progressPercentageText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4F46E5',
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 5,
  },
  pendingSection: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubtitleText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadgeText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
  },
  allDoneCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  allDoneIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  allDoneEmoji: {
    fontSize: 24,
  },
  allDoneTextWrapper: {
    flex: 1,
  },
  allDoneTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 3,
  },
  allDoneSubtitle: {
    fontSize: 13,
    color: '#15803D',
    lineHeight: 19,
  },
  pendingList: {
    gap: 12,
  },
  pendingItemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  pendingCheckbox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  pendingDetails: {
    flex: 1,
    marginRight: 10,
  },
  pendingItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 3,
  },
  pendingItemStreak: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  markDoneHintBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  markDoneHintText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 36,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  habitCard: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  habitCardPending: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  habitCardDone: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  // Large 42x42 tap target
  checkbox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  checkboxPending: {
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#F8FAFC',
  },
  checkboxDone: {
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  checkboxEmptyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: Platform.OS === 'android' ? -2 : 0,
  },
  habitDetails: {
    flex: 1,
    marginRight: 12,
  },
  habitName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    lineHeight: 22,
  },
  habitNameDone: {
    color: '#065F46',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  streakBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  streakBadgeActive: {
    backgroundColor: '#FEF3C7',
  },
  streakBadgeZero: {
    backgroundColor: '#F1F5F9',
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
  },
  streakTextActive: {
    color: '#B45309',
  },
  streakTextZero: {
    color: '#64748B',
  },
  doneIndicatorBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  completedBadgeText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pendingIndicatorBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingIndicatorText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIconText: {
    fontSize: 34,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
    lineHeight: 28,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 360,
  },
  emptyAddButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
