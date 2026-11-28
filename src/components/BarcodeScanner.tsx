import React, { useRef, useState } from 'react';
import { Keyboard, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../utils/theme';
import { Button } from './UI';

/** Full-screen barcode scanner with a typed-number fallback (also handy when the camera is denied). */
export function BarcodeScanner({ visible, onClose, onCode }: { visible: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const { colors: c } = useTheme();
  const [perm, ask] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const handled = useRef(false);
  const insets = useSafeAreaInsets();

  const submit = (code: string) => {
    const clean = code.replace(/\D/g, '');
    if (clean.length < 6 || handled.current) return;
    handled.current = true;
    Keyboard.dismiss();
    onCode(clean);
    setManual('');
    setTimeout(() => { handled.current = false; }, 1500);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {perm?.granted ? (
          <CameraView
            style={{ flex: 1 }} facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={({ data }) => submit(String(data))}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
            <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 16 }}>
              {perm && !perm.canAskAgain ? 'Camera access is blocked. Enable it in Settings, or type the barcode above.' : 'Allow camera access to scan barcodes, or type the number above.'}
            </Text>
            {(!perm || perm.canAskAgain) && <TouchableOpacity onPress={ask} style={{ backgroundColor: c.primarySolid, padding: 14, borderRadius: 14 }}><Text style={{ color: '#fff', fontWeight: '800' }}>Allow camera</Text></TouchableOpacity>}
          </View>
        )}
        {perm?.granted && (
          <View pointerEvents="none" style={{ position: 'absolute', top: '35%', left: '10%', right: '10%', height: 160, borderWidth: 3, borderColor: '#fff', borderRadius: 18, opacity: 0.85 }} />
        )}
        {/* Typed-number entry sits at the TOP, above the camera, so the on-screen keyboard never covers it. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: c.bg, paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 14, zIndex: 5, elevation: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              accessibilityLabel="Barcode number" value={manual} onChangeText={setManual} keyboardType="number-pad" returnKeyType="search"
              onSubmitEditing={() => submit(manual)} placeholder="Type the barcode number, e.g. 8901234567890" placeholderTextColor={c.muted} maxLength={14}
              style={{ flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: c.ink, backgroundColor: c.card }}
            />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Look up barcode" onPress={() => submit(manual)} style={{ minHeight: 48, minWidth: 72, marginLeft: 10, borderRadius: 12, backgroundColor: c.primarySolid, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Look up</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onClose(); }} style={{ alignItems: 'center', marginTop: 10, minHeight: 36, justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '800' }}>Close scanner</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
