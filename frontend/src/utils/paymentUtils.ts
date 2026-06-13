export function formatMnt(amountMnt: number | null | undefined): string {
  if (!amountMnt) return 'Үнэ тохируулаагүй';
  return new Intl.NumberFormat('mn-MN', {
    style: 'currency',
    currency: 'MNT',
    maximumFractionDigits: 0,
  }).format(amountMnt);
}
