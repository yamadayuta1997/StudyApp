import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Platform, TouchableOpacity, Text, View } from 'react-native';

// compare.tsx / answer.tsx で使われているパターンを最小限に再現
const CameraButtonSection = () => (
  <View>
    <TouchableOpacity testID="gallery-btn">
      <Text>🖼 選択</Text>
    </TouchableOpacity>
    {Platform.OS !== 'web' && (
      <TouchableOpacity testID="camera-btn">
        <Text>📷 撮影</Text>
      </TouchableOpacity>
    )}
  </View>
);

describe('Camera button — Platform.OS guard', () => {
  let savedOS: typeof Platform.OS;

  beforeEach(() => {
    savedOS = Platform.OS;
  });

  afterEach(() => {
    (Platform as any).OS = savedOS;
  });

  it('Web版ではカメラボタンが非表示になる', () => {
    (Platform as any).OS = 'web';
    render(<CameraButtonSection />);
    expect(screen.queryByTestId('camera-btn')).toBeNull();
    expect(screen.getByTestId('gallery-btn')).toBeTruthy();
  });

  it('iOS版ではカメラボタンが表示される', () => {
    (Platform as any).OS = 'ios';
    render(<CameraButtonSection />);
    expect(screen.getByTestId('camera-btn')).toBeTruthy();
    expect(screen.getByTestId('gallery-btn')).toBeTruthy();
  });

  it('Android版ではカメラボタンが表示される', () => {
    (Platform as any).OS = 'android';
    render(<CameraButtonSection />);
    expect(screen.getByTestId('camera-btn')).toBeTruthy();
    expect(screen.getByTestId('gallery-btn')).toBeTruthy();
  });
});
