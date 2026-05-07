import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemedView } from '../themed-view';
import { Text } from 'react-native';

jest.mock('@/hooks/use-theme-color', () => ({
  useThemeColor: () => '#ffffff',
}));

describe('ThemedView', () => {
  it('renders children', () => {
    render(
      <ThemedView>
        <Text>Content</Text>
      </ThemedView>
    );
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('applies custom lightColor prop without crashing', () => {
    render(
      <ThemedView lightColor="#ff0000">
        <Text>Red bg</Text>
      </ThemedView>
    );
    expect(screen.getByText('Red bg')).toBeTruthy();
  });
});
