import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../constants';
import { LANGUAGES } from '../constants/languages';
import { Language } from '../types';
import Ionicons from 'react-native-vector-icons/Ionicons';

interface LanguageSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (language: Language) => void;
  title: string;
  /** Shown under the title, e.g. clarifying "Which language do you speak?" for native-language pickers. */
  subtitle?: string;
  selectedLanguage: Language | null;
  languages?: Language[];
}

export function LanguageSelector({
  visible,
  onClose,
  onSelect,
  title,
  subtitle,
  selectedLanguage,
  languages,
}: LanguageSelectorProps) {
  const { height: screenHeight } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  const sheetMaxHeight = Math.min(screenHeight * 0.82, screenHeight - insets.top - 24);

  const renderLanguageItem = useCallback(({ item }: { item: Language }) => {
    const selected = selectedLanguage?.code === item.code;
    return (
      <TouchableOpacity
        style={[styles.languageItem, selected && styles.languageItemSelected]}
        onPress={() => {
          onSelect(item);
          onClose();
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.languageFlag}>{item.flag}</Text>
        <View style={styles.languageNameWrap}>
          {item.englishName && item.englishName !== item.name ? (
            <>
              <Text style={styles.languageEnglishName}>{item.name}</Text>
              <Text style={styles.languageNativeName}>{item.englishName}</Text>
            </>
          ) : (
            <Text style={styles.languageName} numberOfLines={1}>{item.name}</Text>
          )}
        </View>
        {selected && (
          <View style={styles.checkmarkWrap}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedLanguage, onSelect, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={languages ?? LANGUAGES}
            renderItem={renderLanguageItem}
            keyExtractor={(item) => item.code}
            style={styles.languageList}
            contentContainerStyle={styles.languageListContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#121826',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.5,
    borderColor: 'rgba(255,87,34,0.35)',
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 22,
  },
  titleWrap: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    color: '#fff',
    fontFamily: FONTS.bold,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageList: {
    flexGrow: 0,
  },
  languageListContent: {
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 8,
  },
  languageItemSelected: {
    backgroundColor: 'rgba(255,91,46,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,91,46,0.45)',
  },
  languageFlag: {
    fontSize: 30,
    marginRight: 14,
  },
  languageNameWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  languageEnglishName: {
    fontSize: 17,
    color: '#fff',
    fontFamily: FONTS.semiBold,
    lineHeight: 23,
  },
  languageNativeName: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    lineHeight: 20,
    marginTop: 1,
  },
  languageName: {
    fontSize: 18,
    color: '#fff',
    fontFamily: FONTS.medium,
  },
  checkmarkWrap: {
    flexShrink: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
