export type Arg = number | string | null | { tag: 'undefined' | 'NaN' | 'Infinity' };
export interface Case { id: string; args: [Arg, Arg]; expected: number | 'TypeError' }
export const cases: readonly Case[] = [
  { id: 'zero-amount', args: [0, 25], expected: 0 },
  { id: 'zero-percent', args: [100, 0], expected: 100 },
  { id: 'full-percent', args: [100, 100], expected: 0 },
  { id: 'partial', args: [200, 25], expected: 150 },
  { id: 'fractional', args: [99.9, 12.5], expected: 87.4125 },
  { id: 'small', args: [0.1, 50], expected: 0.05 },
  { id: 'negative-amount', args: [-1, 10], expected: 'TypeError' },
  { id: 'negative-percent', args: [100, -1], expected: 'TypeError' },
  { id: 'excess-percent', args: [100, 101], expected: 'TypeError' },
  { id: 'string-amount', args: ['100', 10], expected: 'TypeError' },
  { id: 'string-percent', args: [100, '10'], expected: 'TypeError' },
  { id: 'null-amount', args: [null, 10], expected: 'TypeError' },
  { id: 'absent-percent', args: [100, { tag: 'undefined' }], expected: 'TypeError' },
  { id: 'nan-amount', args: [{ tag: 'NaN' }, 10], expected: 'TypeError' },
  { id: 'infinite-percent', args: [100, { tag: 'Infinity' }], expected: 'TypeError' },
];
export const taskContract = 'Exporte calculateDiscount(amount, percent), síncrona. Ambos devem ser números primitivos finitos; amount >= 0; percent entre 0 e 100. Invalidade lança TypeError. Retorne amount * (1 - percent / 100), sem arredondar. Sem imports, ferramentas, I/O ou efeitos externos.';
