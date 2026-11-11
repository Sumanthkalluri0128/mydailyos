// Cursor paging for lists that sort newest first by date. Cursor = "YYYY-MM-DD~<id>" (opaque to clients: send back `nextCursor` as `cursor`).
// Existing clients that send no `cursor` get the same first page they always got, plus `hasMore` and `nextCursor` they can ignore.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f]{24}$/i;

function parseCursor(raw) {
  if (raw == null || raw === '') return null;
  const parts = String(raw).split('~');
  const [date, id] = parts;
  return parts.length === 2 && DATE.test(date) && ID.test(id) ? { date, id } : false;     // false = malformed
}
/** Adds "strictly older than the cursor" to a filter. `filter.date` may already hold from/to bounds; they are kept. */
function applyCursor(filter, cursor, ObjectId) {
  if (!cursor) return filter;
  const older = { $or: [{ date: { $lt: cursor.date } }, { date: cursor.date, _id: { $lt: ObjectId ? new ObjectId(cursor.id) : cursor.id } }] };
  return filter.$and ? { ...filter, $and: [...filter.$and, older] } : { ...filter, $and: [older] };
}
const pageSize = (raw, def, max) => Math.min(Math.max(parseInt(raw, 10) || def, 1), max);
/** Ask the database for limit + 1 rows, then call this: it trims the extra row and says whether there is more. */
function finishPage(rows, limit) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { page, hasMore, nextCursor: hasMore && last ? `${last.date}~${String(last._id)}` : null };
}
module.exports = { parseCursor, applyCursor, pageSize, finishPage };
