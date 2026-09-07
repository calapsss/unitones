export type Sort = { key: string; descending: boolean };
const ranks = ['GEN','LTGEN','MGEN','BGEN','COL','LTC','MAJ','CPT','1LT','2LT','CMS','SMS','MSG','TSG','SSG','SGT','A1C','A2C','AM'];
export function rankOrder(rank: string) {
  const normalized = rank.toUpperCase().replace(/\s*\(T\)$/, '').trim().replace('AW1C','A1C').replace('AW2C','A2C').replace(/^AW$/, 'AM');
  const position = ranks.indexOf(normalized);
  return position < 0 ? ranks.length : position;
}
export function sortRows<T extends Record<string, any>>(rows: T[], sort: Sort): T[] {
  const value = (row: T) => sort.key === 'rank' ? rankOrder(row.rank || '') : sort.key.split('.').reduce<any>((v, key) => v?.[key], row);
  return [...rows].sort((a,b) => {
    const av = value(a), bv = value(b);
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), undefined, {numeric:true, sensitivity:'base'});
    return comparison * (sort.descending ? -1 : 1) || String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
  });
}
