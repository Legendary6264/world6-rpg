// Bounded, canonical nonnegative fractions. Limits are serialization/CPU limits,
// not game timing rules. No display rounding is used for saved progress.
export type ExactAmount = { numerator: string; denominator: string }
export const MAX_EXACT_DIGITS = 96
const MAX_AMOUNT = 10n ** 24n
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const digits = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_EXACT_DIGITS && /^(0|[1-9][0-9]*)$/.test(v)
const gcd = (a: bigint, b: bigint) => { while (b) { const r = a % b; a = b; b = r } return a }
export function isExactAmount(v: unknown): v is ExactAmount {
  if (!record(v) || Object.keys(v).length !== 2 || !digits(v.numerator) || !digits(v.denominator)) return false
  const n = BigInt(v.numerator), d = BigInt(v.denominator)
  return d > 0n && n <= MAX_AMOUNT * d && gcd(n, d) === 1n
}
function read(v: ExactAmount): [bigint, bigint] {
  if (!isExactAmount(v)) throw Error('Некорректный точный остаток работы.')
  return [BigInt(v.numerator), BigInt(v.denominator)]
}
export function exactAmount(n: bigint, d = 1n): ExactAmount {
  if (n < 0n || d <= 0n) throw Error('Работа должна быть неотрицательной, знаменатель — положительным.')
  const factor = gcd(n, d), value = { numerator: String(n / factor), denominator: String(d / factor) }
  if (!isExactAmount(value)) throw Error('Точность или объём остатка превышает технический предел. Ничего не округлено.')
  return value
}
export function amountFromNumber(value: number): ExactAmount {
  if (!Number.isFinite(value) || value < 0 || value > 1e24) throw Error('Недопустимая величина работы.')
  const [mantissa, exponent = '0'] = value.toString().split('e')
  const [whole, decimals = ''] = mantissa.split('.'), scale = decimals.length - Number(exponent)
  return scale >= 0 ? exactAmount(BigInt(whole + decimals), 10n ** BigInt(scale)) : exactAmount(BigInt(whole + decimals) * 10n ** BigInt(-scale))
}
export function compareAmounts(a: ExactAmount, b: ExactAmount): -1 | 0 | 1 {
  const [an, ad] = read(a), [bn, bd] = read(b), x = an * bd, y = bn * ad
  return x < y ? -1 : x > y ? 1 : 0
}
export function subtractAmounts(a: ExactAmount, b: ExactAmount): ExactAmount {
  const [an, ad] = read(a), [bn, bd] = read(b)
  return exactAmount(an * bd - bn * ad, ad * bd)
}
export function addAmounts(a: ExactAmount, b: ExactAmount): ExactAmount {
  const [an, ad] = read(a), [bn, bd] = read(b)
  return exactAmount(an * bd + bn * ad, ad * bd)
}
export function scaleAmount(a: ExactAmount, b: ExactAmount, divisor = exactAmount(1n)): ExactAmount {
  const [an, ad] = read(a), [bn, bd] = read(b), [cn, cd] = read(divisor)
  if (cn === 0n) throw Error('Нельзя делить работу на ноль.')
  return exactAmount(an * bn * cd, ad * bd * cn)
}
export const copyAmount = (v: ExactAmount): ExactAmount => ({ numerator: v.numerator, denominator: v.denominator })
