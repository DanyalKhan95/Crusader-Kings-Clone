/** Binary min-heap of (priority, value) pairs backed by growable typed arrays. */
export class MinHeap {
  private pri: Float64Array;
  private val: Int32Array;
  size = 0;

  constructor(capacity = 1 << 16) {
    this.pri = new Float64Array(capacity);
    this.val = new Int32Array(capacity);
  }

  push(priority: number, value: number): void {
    if (this.size === this.pri.length) {
      const p = new Float64Array(this.pri.length * 2);
      p.set(this.pri);
      this.pri = p;
      const v = new Int32Array(this.val.length * 2);
      v.set(this.val);
      this.val = v;
    }
    let i = this.size++;
    const pri = this.pri,
      val = this.val;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= priority) break;
      pri[i] = pri[parent];
      val[i] = val[parent];
      i = parent;
    }
    pri[i] = priority;
    val[i] = value;
  }

  /** Priority of the top element (undefined behaviour when empty). */
  peekPriority(): number {
    return this.pri[0];
  }

  /** Removes the top element and returns its value. */
  pop(): number {
    const pri = this.pri,
      val = this.val;
    const top = val[0];
    const n = --this.size;
    if (n > 0) {
      const lp = pri[n],
        lv = val[n];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= lp) break;
        pri[i] = pri[c];
        val[i] = val[c];
        i = c;
      }
      pri[i] = lp;
      val[i] = lv;
    }
    return top;
  }
}
