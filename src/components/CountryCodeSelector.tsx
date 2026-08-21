import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../constants';
import { COUNTRIES } from '../constants/countries';
import { Country } from '../types';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useI18n } from '../localization';

interface CountryCodeSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: Country) => void;
  selectedCountry: Country | null;
}

export function CountryCodeSelector({
  visible,
  onClose,
  onSelect,
  selectedCountry,
}: CountryCodeSelectorProps) {
  const { t } = useI18n();
  const { height: screenHeight } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  const sheetMaxHeight = Math.min(screenHeight * 0.82, screenHeight - insets.top - 24);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q)
    );
  }, [query]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const renderItem = useCallback(({ item }: { item: Country }) => {
    const selected = selectedCountry?.code === item.code;
    return (
      <TouchableOpacity
        style={[styles.item, selected && styles.itemSelected]}
        onPress={() => {
          onSelect(item);
          handleClose();
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.flag}>{item.flag}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.dialCode}>{item.dialCode}</Text>
        {selected && (
          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} style={{ marginLeft: 8 }} />
        )}
      </TouchableOpacity>
    );
  }, [selectedCountry, onSelect]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />

        <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>{t('country_selector_title')}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('country_selector_search_placeholder')}
              placeholderTextColor={COLORS.textDim}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={(item) => item.code}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
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
    marginBottom: 14,
    paddingHorizontal: 22,
  },
  title: {
    fontSize: 22,
    color: '#fff',
    flex: 1,
    fontFamily: FONTS.bold,
    marginRight: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 22,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    fontFamily: FONTS.regular,
    padding: 0,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
  },
  itemSelected: {
    backgroundColor: 'rgba(255,91,46,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,91,46,0.45)',
  },
  flag: {
    fontSize: 22,
    marginRight: 12,
  },
  name: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    fontFamily: FONTS.medium,
  },
  dialCode: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: FONTS.semiBold,
  },
});
