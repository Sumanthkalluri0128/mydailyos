// Confidence badge for a food: 'verified' (backed by a named source, set only by the data importer),
// 'typical' (approximate catalogue value) or 'user' (added or edited by the person).
function confidenceOf(food) {
  if (!food) return 'typical';
  if (food.userId) return 'user'; // a person-owned food is only ever visible to its owner
  if (food.verified === true && String(food.dataSource || '').trim()) return 'verified';
  return 'typical';
}
module.exports = { confidenceOf };
