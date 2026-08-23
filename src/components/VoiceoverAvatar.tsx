import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../constants';

type Props = {
  visible: boolean;
  isPlaying: boolean;
  /** Replays the clip when the speaker badge is tapped. Badge is non-interactive if omitted. */
  onReplay?: () => void;
};

const SIZE = 140;

/** Big centered talking-avatar Lottie shown as a hero above the step title; plays while its voice-over clip is speaking. */
export function VoiceoverAvatar({ visible, isPlaying, onReplay }: Props) {
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (isPlaying) {
      lottieRef.current?.play();
    } else {
      lottieRef.current?.reset();
    }
  }, [isPlaying]);

  if (!visible) return null;

  return (
    <View style={styles.heroWrap}>
      <View style={[styles.ring, isPlaying && styles.ringActive]} />
      <View style={styles.avatarWrap}>
        <LottieView
          ref={lottieRef}
          source={require('../../assets/anim/female.json')}
          loop
          autoPlay={false}
          style={styles.lottie}
        />
      </View>
      <TouchableOpacity
        style={styles.speakerBadge}
        onPress={onReplay}
        disabled={!onReplay}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isPlaying ? 'volume-high' : 'volume-high-outline'} size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  ring: {
    position: 'absolute',
    width: SIZE + 24,
    height: SIZE + 24,
    borderRadius: (SIZE + 24) / 2,
    backgroundColor: 'rgba(255,91,46,0.08)',
  },
  ringActive: {
    backgroundColor: 'rgba(255,91,46,0.16)',
  },
  avatarWrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(255,91,46,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,91,46,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  lottie: {
    width: SIZE,
    height: SIZE,
  },
  speakerBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1D26',
    borderWidth: 2,
    borderColor: '#080C16',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
