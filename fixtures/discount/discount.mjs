export function calculateDiscount(amount, percent) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 ||
      typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new TypeError('Invalid input');
  }
  return amount * (1 - Math.floor(percent / 100));
}
