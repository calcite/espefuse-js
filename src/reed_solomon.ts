// for more info see
// https://en.wikiversity.org/wiki/Reed%E2%80%93Solomon_codes_for_coders
// (chatGPT)


function gfPow(x: number, power: number): number {
  return gfExp[(gfLog[x] * power) % 255];
}

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) {
    return 0;
  }
  return gfExp[gfLog[x] + gfLog[y]]; // should be gfExp[(gfLog[x] + gfLog[y]) % 255] if gfExp wasn't oversized
}

function gfPolyMul(p: number[], q: number[]): number[] {
  /** Multiply two polynomials, inside Galois Field */
  // Pre-allocate the result array
  const r: number[] = new Array(p.length + q.length - 1).fill(0);
  // Compute the polynomial multiplication (just like the outer product of two vectors,
  // we multiply each coefficients of p with all coefficients of q)
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      r[i + j] ^= gfMul(p[i], q[j]); // equivalent to: r[i + j] = gfAdd(r[i+j], gfMul(p[i], q[j]))
      // -- you can see it's your usual polynomial multiplication
    }
  }
  return r;
}

let gfExp: number[] = [];
let gfLog: number[] = [];

function initTables(prim: number = 0x11d): [number[], number[]] {
  /** Precompute the logarithm and anti-log tables for faster computation later, using the provided primitive polynomial. */
  // prim is the primitive (binary) polynomial. Since it's a polynomial in the binary sense,
  // it's only in fact a single galois field value between 0 and 255, and not a list of gf values.
  gfExp = new Array(512).fill(0); // anti-log (exponential) table
  gfLog = new Array(256).fill(0); // log table
  // For each possible value in the galois field 2^8, we will pre-compute the logarithm and anti-logarithm (exponential) of this value
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x; // compute anti-log for this value and store it in a table
    gfLog[x] = i; // compute log at the same time
    x = gfMultNoLUT(x, 2, prim);
  }

  // Optimization: double the size of the anti-log table so that we don't need to mod 255 to
  // stay inside the bounds (because we will mainly use this table for the multiplication of two GF numbers, no more).
  for (let i = 255; i < 512; i++) {
    gfExp[i] = gfExp[i - 255];
  }
  return [gfLog, gfExp];
}

function gfMultNoLUT(x: number, y: number, prim: number = 0, fieldCharacFull: number = 256, carryless: boolean = true): number {
  /** Galois Field integer multiplication using Russian Peasant Multiplication algorithm (faster than the standard multiplication + modular reduction).
   * If prim is 0 and carryless=false, then the function produces the result for a standard integers multiplication (no carry-less arithmetics nor modular reduction). */
  let r = 0;
  while (y) {
    // while y is above 0
    if (y & 1) {
      r = r ^ x;
      // y is odd, then add the corresponding x to r (the sum of all x's corresponding to odd y's will give the final product).
      // Note that since we're in GF(2), the addition is in fact an XOR (very important because in GF(2) the multiplication and additions are carry-less, thus it changes the result!).
    }
    y = y >> 1; // equivalent to y // 2
    x = x << 1; // equivalent to x*2
    if (prim > 0 && x & fieldCharacFull) {
      x = x ^ prim;
    }
    // GF modulo: if x >= 256 then apply modular reduction using the primitive polynomial
    // (we just subtract, but since the primitive number can be above 256 then we directly XOR).
  }
  return r;
}

function rsGeneratorPoly(nsym: number): number[] {
  /** Generate an irreducible generator polynomial (necessary to encode a message into Reed-Solomon) */
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    g = gfPolyMul(g, [1, gfPow(2, i)]);
  }
  return g;
}

function gfPolyDiv(dividend: number[], divisor: number[]): [number[], number[]] {
  /** Fast polynomial division by using Extended Synthetic Division and optimized for GF(2^p) computations
   * (doesn't work with standard polynomials outside of this galois field, see the Wikipedia article for generic algorithm). */
  // CAUTION: this function expects polynomials to follow the opposite convention at decoding:
  // the terms must go from the biggest to lowest degree (while most other functions here expect
  // a list from lowest to biggest degree). eg: 1 +
  const msgOut: number[] = [...dividend]; // Copy the dividend
  for (let i = 0; i < dividend.length - (divisor.length - 1); i++) {
    const coef = msgOut[i]; // precaching
    if (coef !== 0) { // log(0) is undefined, so we need to avoid that case explicitly (and it's also a good optimization).
      for (let j = 1; j < divisor.length; j++) {
        if (divisor[j] !== 0) { // log(0) is undefined
          msgOut[i + j] ^= gfMul(divisor[j], coef); // equivalent to the more mathematically correct
          // (but xoring directly is faster): msg_out[i + j] += -divisor[j] * coef
        }
      }
    }
  }
  // The resulting msg_out contains both the quotient and the remainder, the remainder being the size of the divisor
  // (the remainder has necessarily the same degree as the divisor -- not length but degree == length-1 -- since it's
  // what we couldn't divide from the dividend), so we compute the index where this separation is, and return the quotient and remainder.
  const separator = -(divisor.length - 1);
  return [msgOut.slice(0, separator), msgOut.slice(separator)]; // return quotient, remainder.
}

export function rsEncodeMsg(msgIn: number[], nsym: number): number[] {
  /** Reed-Solomon main encoding function */
  const gen = rsGeneratorPoly(nsym);
  // Pad the message, then divide it by the irreducible generator polynomial
  const [, remainder] = gfPolyDiv(msgIn.concat(Array(gen.length - 1).fill(0)), gen);
  // The remainder is our RS code! Just append it to our original message to get our full codeword (this represents a polynomial of max 256 terms)
  const msgOut = msgIn.concat(remainder);
  // Return the codeword
  return msgOut;
}

initTables();
