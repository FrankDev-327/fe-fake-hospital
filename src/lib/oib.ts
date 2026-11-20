/**
 * Croatian OIB (personal ID): 11 digits, the last is a check digit (ISO 7064 MOD 11,10).
 * Same check as the backend, so a typo is caught while typing, not after sending.
 */
export function isValidOib(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  return (11 - a) % 10 === Number(oib[10]);
}
