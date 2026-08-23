import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import { COLORS } from '../constants';

type Props = {
  /** 1-based index of the step currently on screen. */
  step: number;
  totalSteps: number;
};

/** Slim single progress bar — fills proportionally to step/totalSteps. */
export function OnboardingProgressBar({ step, totalSteps }: Props) {
  const widthAnim = useRef(new Animated.Value(step / totalSteps)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: step / totalSteps,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step, totalSteps]);

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});
