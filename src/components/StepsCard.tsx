import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, lift } from '../utils/theme';
import { stepCalories, stepDistanceKm } from '../utils/energy';
import { ProgressBar } from './ProgressBar';
import { StepState } from '../hooks/useSteps';

type Props = {
  steps: number; target: number; weightKg?: number | null; state?: StepState; onEnable?: () => void;
  /** Android: read steps from Health Connect (Samsung Health). */
  source?: 'sensor' | 'health-connect'; sourceNames?: string[]; hcSupported?: boolean; onConnectHealth?: () => void; onDisconnectHealth?: () => void;
};

/** Steps vs the daily goal (10,000 by default), with the calories and distance they represent. */
export function StepsCard({ steps, target, weightKg, state, onEnable, source, sourceNames, hcSupported, onConnectHealth, onDisconnectHealth }: Props) {
  const { colors: c } = useTheme();
  const kcal = stepCalories(steps, weightKg);
  const goalHit = steps >= target;
  return (
    <View style={{ backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 22, padding: 18, marginBottom: 14, ...lift(c, 1) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: '800', color: c.muted }}>STEPS TODAY</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: c.ink }}>{steps.toLocaleString()}</Text>
        </View>
        <Text style={{ fontSize: 30 }}>{goalHit ? '🏆' : '👟'}</Text>
      </View>
      <ProgressBar
        label="Daily goal" color="#14A38B"
        value={steps} target={target}
        valueText={steps.toLocaleString()} targetText={target.toLocaleString()}
        hint={goalHit ? 'Goal reached 🎉' : `${(target - steps).toLocaleString()} to go`}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: c.chipBg, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 12, color: c.muted, fontWeight: '700' }}>CALORIES BURNED</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>{kcal.toLocaleString()} kcal</Text>
          <Text style={{ fontSize: 12, color: c.muted }}>added to today's total automatically</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.chipBg, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 12, color: c.muted, fontWeight: '700' }}>DISTANCE</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.ink }}>{stepDistanceKm(steps)} km</Text>
        </View>
      </View>
      {source === 'health-connect' && state === 'active' && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: c.ink, fontWeight: '700' }}>✅ Synced from {sourceNames?.length ? sourceNames.join(' + ') : 'Health Connect'}</Text>
          <Text style={{ fontSize: 12, color: c.muted, lineHeight: 16, marginTop: 2 }}>Same total as your health app, including steps taken with FlexFit closed. Updates every minute while the app is open.</Text>
          <TouchableOpacity onPress={onDisconnectHealth} accessibilityRole="button" style={{ paddingVertical: 8 }}><Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>Stop using Health Connect</Text></TouchableOpacity>
        </View>
      )}
      {Platform.OS === 'android' && source !== 'health-connect' && hcSupported && (
        <TouchableOpacity onPress={onConnectHealth} accessibilityRole="button" accessibilityLabel="Sync steps from Samsung Health through Health Connect" style={{ marginTop: 12, backgroundColor: c.chipBg, borderRadius: 14, padding: 12 }}>
          <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>🔗 Sync with Samsung Health →</Text>
          <Text style={{ color: c.muted, fontSize: 12, lineHeight: 16, marginTop: 2 }}>Uses Android Health Connect to read the same step count your Samsung Health shows — no more missing steps.</Text>
        </TouchableOpacity>
      )}
      {state === 'active' && source !== 'health-connect' && (
        <Text style={{ marginTop: 12, fontSize: 12, color: c.muted, lineHeight: 16 }}>
          {Platform.OS === 'ios'
            ? '✅ Counted by your iPhone all day, even with FlexFit closed — the total updates whenever you open the app.'
            : '👟 Counting while FlexFit is open. Android doesn\u2019t let apps count in the background, so steps taken with the app closed aren\u2019t captured — use “Update steps” below to add them.'}
        </Text>
      )}
      {state === 'unavailable' && (
        <Text style={{ marginTop: 12, fontSize: 12, color: c.muted, lineHeight: 16 }}>This phone has no step sensor FlexFit can use. Enter your steps manually below.</Text>
      )}
      {(state === 'needs-permission' || state === 'denied') && (
        <TouchableOpacity onPress={onEnable} style={{ marginTop: 12 }}>
          <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13 }}>
            {state === 'denied' ? 'Step counting is blocked — enable "Physical activity" for FlexFit in Settings' : 'Turn on automatic step counting →'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
