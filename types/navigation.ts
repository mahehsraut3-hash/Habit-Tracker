import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Home: undefined;
  AddHabit: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type AddHabitScreenProps = NativeStackScreenProps<RootStackParamList, 'AddHabit'>;

export type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
