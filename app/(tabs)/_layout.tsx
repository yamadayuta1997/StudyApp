import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) {
        router.push(screen as any);
      } else {
        router.push('/(tabs)/answer');
      }
    });
    return () => sub.remove();
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="answer"
        options={{
          title: '採点',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="pencil.and.outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: '苦手分析',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '履歴',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="list.bullet" color={color} />,
        }}
      />
      <Tabs.Screen
        name="textbook"
        options={{
          title: '教科書',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="book.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'カレンダー',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="compare"
        options={{
          title: '比較添削',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="arrow.left.arrow.right" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '過去のミス履歴',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="clock.arrow.circlepath" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
