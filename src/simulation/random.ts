/** Explicit state PRNG: reproducible in browser, tests and resumed runs. */
export class Random {
  constructor(public state: number) { this.state = state >>> 0; }
  uniform() { let t = this.state += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); this.state >>>= 0; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  normal() { return Math.sqrt(-2 * Math.log(Math.max(1e-12, this.uniform()))) * Math.cos(2 * Math.PI * this.uniform()); }
  lognormal(mean: number, cv: number) { const variance = Math.log(1 + cv * cv); return mean * Math.exp(Math.sqrt(variance) * this.normal() - variance / 2); }
  bernoulli(p: number) { return this.uniform() < Math.max(0, Math.min(1, p)); }
  binomial(n: number, p: number) { let count = 0; for (let i = 0; i < n; i++) if (this.bernoulli(p)) count++; return count; }
  poisson(mean: number): number { // splitting keeps Knuth's algorithm stable for large means
    if (mean <= 0) return 0;
    if (mean > 20) return this.poisson(mean / 2) + this.poisson(mean / 2);
    const limit = Math.exp(-mean); let product = 1, k = 0;
    do { k++; product *= Math.max(1e-12, this.uniform()); } while (product > limit);
    return k - 1;
  }
}
