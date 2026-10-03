import React, { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';

import { HomeScreen } from './screens/HomeScreen';
import { AddHabitScreen } from './screens/AddHabitScreen';
import { DATABASE_NAME, initDatabase } from './db/database';
import type { RootStackParamList } from './types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

function DatabaseLoadingFallback() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#4F46E5" />
      <Text style={styles.loadingText}>Initializing database...</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Suspense fallback={<DatabaseLoadingFallback />}>
        <SQLiteProvider
          databaseName={DATABASE_NAME}
          onInit={initDatabase}
          useSuspense
        >
          <NavigationContainer>
            <StatusBar style="dark" />
            <Stack.Navigator
              initialRouteName="Home"
              screenOptions={{
                headerStyle: {
                  backgroundColor: '#FFFFFF',
                },
                headerTintColor: '#0F172A',
                headerTitleStyle: {
                  fontWeight: '700',
                },
                headerShadowVisible: false,
                contentStyle: {
                  backgroundColor: '#F8FAFC',
                },
              }}
            >
              <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{ title: 'Habit Tracker' }}
              />
              <Stack.Screen
                name="AddHabit"
                component={AddHabitScreen}
                options={{ title: 'Add Habit' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </SQLiteProvider>
      </Suspense>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
});
