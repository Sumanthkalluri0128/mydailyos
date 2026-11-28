// The answer area under one Sensei question: quick-reply chips (single / multi), typed words with suggestions (text), small forms and dates.
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from './UI';
import { Chip } from './Chip';
import { DateTimeField } from './DateTimeField';
import { today } from '../config/api';
import { addWord, toggleMulti, type Option, type Question } from '../utils/sensei';

function Chips({ options, value, multi, onPick }: { options: Option[]; value: any; multi?: boolean; onPick: (id: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {options.map((o) => <Chip key={o.id} small label={`${o.emoji ? `${o.emoji} ` : ''}${o.label}`} active={multi ? (value || []).includes(o.id) : value === o.id} onPress={() => onPick(o.id)} />)}
    </View>
  );
}

export function QuestionInput({ q, draft, setDraft, onSend, busy }: { q: Question; draft: any; setDraft: (d: any) => void; onSend: (v: any) => void; busy?: boolean }) {
  const { S, colors } = useThemedStyles();
  const [word, setWord] = useState('');
  const done = (label: string, v?: any) => (
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => onSend(v === undefined ? draft : v)} style={{ alignSelf: 'flex-start', marginTop: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.primarySolid, opacity: busy ? 0.6 : 1 }}>
      <Text style={{ color: '#fff', fontWeight: '800' }}>{label}</Text>
    </TouchableOpacity>
  );

  if (q.type === 'single') return <Chips options={q.options || []} value={draft} onPick={(id) => { setDraft(id); onSend(id); }} />;

  if (q.type === 'multi') {
    const pick = (id: string) => setDraft(toggleMulti(draft, id, 'none'));
    return (
      <View>
        {q.groups ? q.groups.map((g) => <View key={g.id} style={{ marginBottom: 4 }}><Text style={S.label}>{g.label}</Text><Chips options={g.options} value={draft} multi onPick={pick} /></View>)
          : <Chips options={q.options || []} value={draft} multi onPick={(id) => setDraft(toggleMulti(draft, id, q.exclusive || 'none'))} />}
        {q.allowNone && <Chips options={[{ id: 'none', label: 'Nothing to avoid' }]} value={draft} multi onPick={pick} />}
        {done('Done')}
      </View>
    );
  }

  if (q.type === 'text') {
    const list: string[] = Array.isArray(draft) ? draft : [];
    const add = (w: string) => { setDraft(addWord(list, w, q.max || 30)); setWord(''); };
    return (
      <View>
        {list.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{list.map((w) => <Chip key={w} small active label={`${w} ✕`} onPress={() => setDraft(list.filter((x) => x !== w))} />)}</View>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(q.suggestions || []).filter((s) => !list.some((x) => x.toLowerCase() === s.toLowerCase())).map((s) => <Chip key={s} small label={`+ ${s}`} onPress={() => add(s)} />)}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <TextInput value={word} onChangeText={setWord} maxLength={40} placeholder="Type something else" placeholderTextColor={colors.muted} accessibilityLabel="Add your own" onSubmitEditing={() => add(word)} returnKeyType="done"
            style={[S.input, { flex: 1 }]} />
          <Chip small label="Add" onPress={() => add(word)} />
        </View>
        {done(list.length ? 'Done' : 'Nothing to add', list)}
      </View>
    );
  }

  if (q.type === 'form') {
    return (
      <View>
        {(q.fields || []).map((f) => (
          <View key={f.id} style={{ marginBottom: 4 }}>
            <Text style={S.label}>{f.label}</Text>
            <Chips options={f.options || []} value={draft?.[f.id]} multi={f.type === 'multi'} onPick={(id) => setDraft({ ...draft, [f.id]: f.type === 'multi' ? toggleMulti(draft?.[f.id], id, 'none') : id })} />
          </View>
        ))}
        {done('Done')}
      </View>
    );
  }

  if (q.type === 'dates') {
    const days = (q.fields || []).find((f) => f.id === 'days');
    return (
      <View>
        <DateTimeField label={(q.fields || [])[0]?.label || 'From'} mode="date" value={draft?.from || today()} onChange={(v: string) => setDraft({ ...draft, from: v })} />
        {days ? <Chips options={days.options || []} value={draft?.days} onPick={(id) => setDraft({ ...draft, days: id })} /> : null}
        {done('Done', { ...draft, from: draft?.from || today() })}
      </View>
    );
  }
  return null;
}
