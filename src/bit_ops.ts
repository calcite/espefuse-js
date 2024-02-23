import BitArray from "@bitarray/es6";

class BitArrayPy extends BitArray {
  pos: number = 0;

  overwrite(src: BitArrayPy, pos: number | undefined = undefined): void {
    if (pos !== undefined)
      this.pos = pos;
    else if (!this.pos)
      this.pos = 0;

    let i = 0
    for (; i < src.length; i++) {
      this[i + this.pos] = src[i];
    }
    this.pos = this.pos + src.length;
  }

  read(len: any): BitArrayPy | number {
    // if len is 'type:len' - return number (return bitarray if its bytes)
    // if len is length, return bitarray
    if (!this.pos)
      this.pos = 0;

    if (typeof len === 'string') {
      if (len === 'bool') {
        const res = parseInt(Object.values(this.read(1)).join(''), 2);
        return res;
      }
      const ptr = /(\w+):(\d+)/;
      const match = len.match(ptr);
      if (!ptr.test(len)) {
        throw new Error(`BitArrayPy read failed, incompatible format; ` +
        `expected regex ptr ${ptr} - got ${len}`);
      }
      const _type = match![1];
      const blen = parseInt(match![2]);
      if (_type == 'bytes') {
        return this.read(blen*8)
      }
      const res = parseInt(Object.values(this.read(blen)).join(''), 2);
      return res;
    }
    else {
      const sub = Object.values(this).slice(this.pos, this.pos + len).join('');
      return new BitArrayPy(sub);
    }
  }

  all(value: boolean): boolean {
    if (!this.pos)
      this.pos = 0;
    const val = value ? 1 : 0;

    return Object.values(this).filter(x => x == val).length == this.length;
  }

  any(value: boolean): boolean {
    if (!this.pos)
      this.pos = 0;
    const val = value ? 1 : 0;

    return Object.values(this).includes(val);
  }

  setBits(value: boolean | number, indexes: any = null): void {
    if (indexes !== null) {
      console.error('Second parameter of BitArray "set" is not defined - TODO');
      return;
    }
    for (let i = 0; i < this.length; i++) {
      this[i] = value ? 1 : 0;
    }
  }

  equals(arr: BitArrayPy): boolean {
    return this.toString() == arr.toString();
  }

  readList(biArr: BitArrayPy, len: number): BitArrayPy {
    console.error('unimplemented!');
    return biArr;
  }

  //and(bitArr: BitArrayPy | BitArray): BitArrayPy {
  //  return super.and(bitArr) as BitArrayPy;
  //}

  //or(bitArr: BitArrayPy | BitArray): BitArrayPy {
  //  return super.or(bitArr) as BitArrayPy;
  //}

  and = (bitArr: BitArrayPy | BitArray): BitArrayPy => {
    return BitArrayPy.from(super['&'](bitArr));
  }

  or = (bitArr: BitArrayPy | BitArray): BitArrayPy => {
    return BitArrayPy.from(super['|'](bitArr));
  }

  xor = (bitArr: BitArrayPy | BitArray): BitArrayPy => {
    return BitArrayPy.from(super['^'](bitArr));
  }

  static from(source: Iterable<any>): BitArrayPy {
    return new BitArrayPy(source);
  }

  fromBuffer(data: any): BitArrayPy {
    // TODO implement this for emulator
    return new BitArrayPy(1);
  }

  toBuffer(): BitArrayPy {
    // TODO implement this for emulator
    return new BitArrayPy(1);
  }
}

export { BitArrayPy };
