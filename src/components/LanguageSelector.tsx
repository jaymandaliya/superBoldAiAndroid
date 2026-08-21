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
import LinearGradient from 'react-native-linear-gradient';
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
  selectedLanguage: Language | null;
  languages?: Language[];
}

export function LanguageSelector({
  visible,
  onClose,
  onSelect,
  title,
  selectedLanguage,
  languages,
}: LanguageSelectorProps) {
  const { height: screenHeight } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  const availableHeight = screenHeight - insets.top - insets.bottom - 24;
  const modalMaxHeight = Math.min(screenHeight * 0.82, availableHeight);

  const renderLanguageItem = useCallback(({ item }: { item: Language }) => (
    <TouchableOpacity
      style={[
        styles.languageItem,
        selectedLanguage?.code === item.code && styles.languageItemSelected,
      ]}
      onPress={() => {
        onSelect(item);
        onClose();
      }}
      activeOpacity={0.7}
    >
      <Text style={styles.languageFlag}>{item.flag}</Text>
      <View style={styles.languageNameWrap}>
        {item.englishName ? (
          <>
            <Text style={styles.languageEnglishName}>{item.englishName}</Text>
            {item.englishName !== item.name && (
              <Text style={styles.languageNativeName}>{item.name}</Text>
            )}
          </>
        ) : (
          <Text style={styles.languageName}>{item.name}</Text>
        )}
      </View>
      {selectedLanguage?.code === item.code && (
        <View style={styles.checkmarkWrap}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
        </View>
      )}
    </TouchableOpacity>
  ), [selectedLanguage, onSelect, onClose]);

  return (
    <Modal 
      visible={visible} 
      animationType="slide" 
      transparent={true} 
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.modalOverlay,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <LinearGradient
          colors={[COLORS.card, COLORS.bgSecondary]}
          style={[styles.modalContent, { maxHeight: modalMaxHeight }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={languages ?? LANGUAGES}
            renderItem={renderLanguageItem}
            keyExtractor={(item) => item.code}
            style={styles.languageList}
            contentContainerStyle={styles.languageListContent}
            showsVerticalScrollIndicator={true}
          />
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: COLORS.bgLight,
    borderRadius: 22,
    width: '100%',
    paddingTop: 20,
    paddingBottom: 12,
    minHeight: 300,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgLighter,
  },
  modalTitle: {
    fontSize: 22,
    color: COLORS.text,
    flex: 1,
    fontFamily: FONTS.bold,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: COLORS.textMuted,
    fontFamily: FONTS.bold,
  },
  languageList: {
    flexGrow: 0,
  },
  languageListContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 10,
    marginHorizontal: 2,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  languageItemSelected: {
    backgroundColor: COLORS.modalSelectedBg,
    borderWidth: 2,
    borderColor: COLORS.modalSelectedBorder,
  },
  languageFlag: {
    fontSize: 32,
    marginRight: 16,
  },
  languageNameWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  languageEnglishName: {
    fontSize: 17,
    color: COLORS.text,
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
    color: COLORS.text,
    flex: 1,
    fontFamily: FONTS.medium,
  },
  checkmark: {
    fontSize: 22,
    color: COLORS.success,
    fontFamily: FONTS.bold,
  },
  checkmarkWrap: {
    flexShrink: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});