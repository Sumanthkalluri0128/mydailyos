// A bottom sheet that always fits the screen: scrolls when tall, closes on backdrop tap or Android back.
import React from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../utils/theme';

export function BottomSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors: c } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable accessible={false} onPress={() => {}} style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 28, maxHeight: Math.round(height * 0.9) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: c.ink, fontSize: 20, fontWeight: '900' }} accessibilityRole="header">{title}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.ink, fontSize: 16 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
