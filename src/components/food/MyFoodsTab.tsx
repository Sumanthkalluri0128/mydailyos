// The "My foods" tab body: search, favourites, custom foods. Split out of app/food.tsx; it gets everything it needs as props.
import { BuddyEmpty } from '../../motion/Buddy';
import { Text, TouchableOpacity, View } from 'react-native';
import { Button, Field, useThemedStyles } from '../UI';
import { Chip } from '../Chip';

export function MyFoodsTab(props: any) {
  const { deleteCustom, duplicate, favOnly, filtered, mineOnly, openEdit, openNew, q, setFavOnly, setMineOnly, toggleFavorite, setQ } = props;
  const { S, colors } = useThemedStyles();
  return (
    <>
    <View style={{ flexDirection: 'row', marginBottom: 10 }}>
      <Chip label="Favourites" active={favOnly} onPress={() => setFavOnly((v) => !v)} small />
      <Chip label="Custom only" active={mineOnly} onPress={() => setMineOnly((v) => !v)} small />
    </View>
    <Field label="Search foods" value={q} onChangeText={setQ} placeholder="Search the food database..." />
    <Button title="+ Add a custom food" onPress={() => openNew()} />
    <View style={{ height: 10 }} />
    {!q && !favOnly && !mineOnly && <Text style={[S.muted, { textAlign: 'center', paddingVertical: 20 }]}>Search above to find a food, or tap Favourites / Custom only to see your own.</Text>}
    {(q || favOnly || mineOnly) && filtered.map((x) => (
      <View key={x._id} style={[S.item]}>
        <View style={S.between}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{x.name}{!!x.brand && ` · ${x.brand}`}</Text>
            <Text style={S.muted}>{x.calories} kcal · {x.servingSize}{x.servingUnit} · P{x.protein}g C{x.carbohydrates}g F{x.fat}g</Text>
          </View>
          <TouchableOpacity onPress={() => toggleFavorite(x)} hitSlop={10}><Text style={{ fontSize: 18 }}>{x.isFavorite ? '⭐' : '☆'}</Text></TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 10, gap: 14 }}>
          {x.isCustom ? (
            <>
              <TouchableOpacity onPress={() => openEdit(x)}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Edit</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => deleteCustom(x)}><Text style={S.delete}>Delete</Text></TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => duplicate(x)}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Duplicate & edit</Text></TouchableOpacity>
          )}
        </View>
      </View>
    ))}
    {filtered.length === 0 && <View style={S.card}><BuddyEmpty scene="eat" title="No foods match" text="Try adding one." /></View>}
    </>
  );
}
