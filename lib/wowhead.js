// Wowhead tooltip/icon parameters for a simc item string: ",id=123,bonus_id=1/2/3,ilevel=700" -> "item=123&bonus=1:2:3&ilvl=700" ('' when there is no id).
function whOf(item) {
  const s = String(item || ''), id = /(?:^|,)id=(\d+)/.exec(s)?.[1];
  if (!id) return '';
  const b = /bonus_id=([\d\/:]+)/.exec(s)?.[1], il = /ilevel=(\d+)/.exec(s)?.[1];
  return `item=${id}` + (b ? `&bonus=${b.replace(/\//g, ':')}` : '') + (il ? `&ilvl=${il}` : '');
}
module.exports = { whOf };
