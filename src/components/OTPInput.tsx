import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
  Pressable,
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { COLORS, FONTS } from '../constants';

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (otp: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  autoFocus = true,
  disabled = false,
}: OTPInputProps) {
  const hiddenInputRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(autoFocus ? 0 : null);
  const [isFocused, setIsFocused] = useState(false);

  // Animation for focused box
  const animatedValues = useRef(
    Array.from({ length }, () => new Animated.Value(0))
  ).current;

  // Current active index based on value length
  const activeIndex = Math.min(value.length, length - 1);

  useEffect(() => {
    const currentFocused = isFocused ? activeIndex : null;
    setFocusedIndex(currentFocused);

    animatedValues.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: currentFocused === index ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
  }, [isFocused, activeIndex, animatedValues]);

  // Split value into array of single characters
  const otpArray = value.split('').slice(0, length);

  const handleChange = (text: string) => {
    const cleanText = text.replace(/\D/g, '').slice(0, length);
    onChange(cleanText);
  };

  const handlePress = () => {
  const delay = Platform.OS === 'android' ? 100 : 50;
  if (Platform.OS === 'android') {
    hiddenInputRef.current?.blur();
  }
  setTimeout(() => {
    hiddenInputRef.current?.focus();
  }, delay);
};
  return (
    <View style={styles.container}>
      {/* Hidden input that captures the full OTP including auto-fill */}
      <TextInput
  ref={hiddenInputRef}
  style={styles.hiddenInput}
  value={value}
  onChangeText={handleChange}
  onFocus={() => setIsFocused(true)}
  onBlur={() => setIsFocused(false)}
  keyboardType="number-pad"
  maxLength={length}
  editable={!disabled}
  autoFocus={autoFocus}
  textContentType="oneTimeCode"
  autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
  showSoftInputOnFocus
  caretHidden
  // Add this:
  onPressIn={handlePress}
/>

      {/* Visual OTP boxes */}
      <Pressable style={styles.boxesRow} onPress={handlePress}>
        {Array.from({ length }).map((_, index) => {
          const isFilled = !!otpArray[index];
          const isCurrentFocused = focusedIndex === index;

          const borderColor = animatedValues[index].interpolate({
            inputRange: [0, 1],
            outputRange: [
              isFilled ? 'rgba(92, 59, 255, 0.5)' : COLORS.border,
              COLORS.secondary,
            ],
          });

          const scale = animatedValues[index].interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.05],
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.inputWrapper,
                {
                  transform: [{ scale }],
                },
              ]}
            >
              <LinearGradient
                colors={
                  isFilled
                    ? ['rgba(92, 59, 255, 0.08)', 'rgba(255, 95, 43, 0.08)']
                    : [COLORS.card, COLORS.bgSecondary]
                }
                style={[styles.inputContainer]}
              >
                <Animated.View
                  style={[
                    styles.inputBorder,
                    {
                      borderColor: borderColor,
                      borderWidth: isCurrentFocused ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.digitBox}>
                    <Animated.Text
                      style={[
                        styles.digitText,
                        isFilled && styles.digitTextFilled,
                        disabled && styles.inputDisabled,
                      ]}
                    >
                      {otpArray[index] || ''}
                    </Animated.Text>
                  </View>
                </Animated.View>
              </LinearGradient>
            </Animated.View>
          );
        })}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  hiddenInput: {
    position: 'absolute',
    top: -200,
    left: 0,
    width: 1,
    height: 1,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
  },
  inputContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputBorder: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  digitBox: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitText: {
    fontSize: 24,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  digitTextFilled: {
    color: COLORS.secondary,
  },
  inputDisabled: {
    opacity: 0.5,
  },
});

export default OTPInput;
