import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme, lift } from '../utils/theme';
import { Profile } from '../hooks/useProfile';
import { dayBalance, expectedEnergy } from '../utils/energy';
import { fmtEnergy, fmtWeight } from '../utils/units';
import { ProgressBar } from './ProgressBar';

/**
 * "How much should I eat for my weight, and where am I today?"
 * `workout` and `stepKcal` are today's calories burned by logged exercise and by steps. Uses the one shared energy model
 * (same numbers as the website): only activity BEYOND what the daily target already assumes earns extra food.
 */
export function CalorieBalance({ profile, eaten, workout, stepKcal, extra = 0, collapsible = false, showProgress = true }: { profile: Profile | null; eaten: number; workout: number; stepKcal: number; extra?: number; collapsible?: boolean; showProgress?: boolean }) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(!collapsible);
  const unit = profile?.units?.energy || 'kcal';
  const wUnit = profile?.units?.weight || 'kg';
  const e = expectedEnergy(profile);
  const card = { backgroundColor: c.card, borderWidth: c.cardBorderWidth, borderColor: c.cardBorder, borderRadius: 22, padding: 18, marginBottom: 14, ...lift(c, 1) } as const;

  if (!e) {
    return (
      <View style={card}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>Your calorie target</Text>
        <Text style={{ color: c.muted, marginTop: 6, fontSize: 13 }}>Add your weight, height and age to see how many calories you should eat each day.</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={{ marginTop: 10 }}>
          <Text style={{ color: c.primary, fontWeight: '800' }}>Complete profile →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const b = dayBalance(profile, { eaten, workout, steps: stepKcal, extra });
  const net = b.net ?? 0;
  const deficit = net >= 0;
  const goalText = e.direction === 'lose' ? 'to lose weight' : e.direction === 'gain' ? 'to gain weight' : 'to maintain weight';
  const Row = ({ l, v, strong, color }: { l: string; v: string; strong?: boolean; color?: string }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.muted, fontSize: 13, flex: 1, paddingRight: 8 }}>{l}</Text>
      <Text style={{ color: color || c.ink, fontSize: 13, fontWeight: strong ? '800' : '700' }}>{v}</Text>
    </View>
  );

  return (
    <View style={card}>
      <TouchableOpacity disabled={!collapsible} activeOpacity={0.8} onPress={() => setOpen((o) => !o)} accessibilityRole={collapsible ? 'button' : undefined}
        accessibilityLabel={collapsible ? `Your calorie plan, ${open ? 'collapse' : 'expand'}` : undefined} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.ink }}>{collapsible ? 'Your calorie plan' : 'Calories for your weight'}</Text>
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
            Based on {fmtWeight(e.weightKg, wUnit)} · eat about {fmtEnergy(b.target, unit)} a day {goalText}{e.mode === 'manual' ? ' (your own target)' : ''}.
          </Text>
        </View>
        {collapsible && <Text style={{ color: c.muted, fontSize: 22, marginLeft: 10 }}>{open ? '⌃' : '⌄'}</Text>}
      </TouchableOpacity>

      {showProgress && (
        <View style={{ marginTop: 14 }}>
          <ProgressBar
            label="Eaten today" color="#E8823A" overIsBad
            value={b.eaten} target={b.budget}
            valueText={fmtEnergy(b.eaten, unit)} targetText={fmtEnergy(b.budget, unit)}
            hint={b.remaining >= 0 ? `${fmtEnergy(b.remaining, unit)} left` : `${fmtEnergy(-b.remaining, unit)} over`}
          />
        </View>
      )}

      {open && <View style={{ marginTop: showProgress ? 0 : 12 }}>
      <Row l={e.mode === 'manual' ? 'Daily target (yours)' : 'Daily target (what to eat)'} v={fmtEnergy(b.target, unit)} />
      <Row l="Maintenance (what you burn)" v={fmtEnergy(e.tdee, unit)} />
      <Row l={`Activity today (workouts ${fmtEnergy(workout, unit)} + steps ${fmtEnergy(stepKcal, unit)})`} v={fmtEnergy(b.burned, unit)} />
      <Row l="Already counted in your target" v={`− ${fmtEnergy(Math.min(b.burned, e.baselineActivityKcal), unit)}`} />
      <Row l="Extra food earned by activity" v={`+ ${fmtEnergy(b.bonus, unit)}`} strong />
      {b.extra > 0 && <Row l="Festival / trip / diet-break room today" v={`+ ${fmtEnergy(b.extra, unit)}`} strong />}
      <Row l="Eaten today" v={fmtEnergy(b.eaten, unit)} />
      <View style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: deficit ? c.successSoft : c.dangerSoft }}>
        <Text style={{ fontWeight: '800', color: deficit ? c.successInk : c.dangerInk }}>
          {deficit ? 'Calorie deficit' : 'Calorie surplus'}: {fmtEnergy(Math.abs(net), unit)}
        </Text>
        <Text style={{ fontSize: 12, marginTop: 3, color: deficit ? c.successInk : c.dangerInk }}>
          {deficit ? 'Below' : 'Above'} what you burn today (maintenance + extra activity − food) ≈ {(b.fatKg ?? 0).toFixed(2)} kg of body {deficit ? 'fat lost' : 'weight gained'} if every day were like this.
        </Text>
      </View>
      </View>}
    </View>
  );
}
