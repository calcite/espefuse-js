//import BitArray from "@bitarray/es6";
import { BitArrayPy } from "./bit_ops";

export function hexify(buffer: Buffer | string, separator: string = ""): string {
  if (typeof buffer === 'string') {
    const res = buffer.split(separator)
                      .map(x => parseInt(x, 2).toString(16).padStart(2, '0'))
                      .join(separator)
    return res;
  }
  else {
    return Array.prototype.map.call(buffer, (byte: number) => {
        return ("0" + (byte & 0xff).toString(16)).slice(-2);
    }).join(separator);
  }
}

export function popcnt(b: number): number {
    // Convert to binary string, split into array, count '1' occurrences
    return b.toString(2).split('').reduce((acc, val) => acc + (val === '1' ? 1 : 0), 0);
}

export function checkDuplicateNameInList(nameList: string[]): void {
    const duplesName = nameList.filter((name, index) => nameList.indexOf(name) !== index);
    if (duplesName.length !== 0) {
        throw new Error(`Found repeated ${duplesName} in the name list`);
    }
}

export function maskToShift(mask: number): number {
    /**
     * Return the index of the least significant bit in the mask
     */
    let shift = 0;
    while ((mask & 0x1) === 0) {
        shift += 1;
        mask >>= 1;
    }
    return shift;
}

//export function BAOverwrite(src: BitArray[], pos: number | undefined): void {
//  if (pos !== undefined)
//    this.pos = pos;
//  else if (!this.pos)
//    this.pos = 0;
//
//  let i = 0
//  for (; i < src.length; i++) {
//    this[i + this.pos] = src[i];
//  }
//  this.pos = this.pos + src.length;
//  return this;
//}
//
//export function BARead(len: any): any {
//  // if len is 'type:len' - return number (return bitarray if its bytes)
//  // if len is length, return bitarray
//  if (!this.pos)
//    this.pos = 0;
//
//  if (typeof len === 'string') {
//    if (len === 'bool') {
//      const res = parseInt(Object.values(this.read(1)).join(''), 2);
//      return res;
//    }
//    const ptr = /(\w+):(\d+)/;
//    const match = len.match(ptr);
//    const _type = match[1];
//    const blen = parseInt(match[2]);
//    if (_type == 'bytes') {
//      return this.read(blen*8)
//    }
//    const res = parseInt(Object.values(this.read(blen)).join(''), 2);
//    return res;
//  }
//  else {
//    const sub = Object.values(this).slice(this.pos, this.pos + len).join('');
//    return BitArray.from(sub);
//  }
//}
//
//export function BAAll(value: boolean): boolean {
//  if (!this.pos)
//    this.pos = 0;
//  const val = value ? 1 : 0;
//
//  return Object.values(this).filter(x => x == val).length == this.length;
//}
//
//export function BAAny(value: boolean): boolean {
//  if (!this.pos)
//    this.pos = 0;
//  const val = value ? 1 : 0;
//
//  return Object.values(this).includes(val);
//}
//
//export function BASet(value: boolean, indexes = undefined): boolean {
//  const val = value ? 1 : 0;
//  if (indexes !== undefined) {
//    console.error('Second parameter of BitArray "set" is not defined - TODO');
//    return;
//  }
//  for (let i = 0; i < this.length; i++) {
//    this[i] = value;
//  }
//}
//
//export function BAEquals(arr: BitArray): boolean {
//  return this.toString() == arr.toString();
//}
//
//export function BAReadList(biArr: BitArray[], len: number): BitArray {
//  console.error('unimplemented!');
//  return biArr;
//}

export function parseBitNumStr(str: any, len: number = 8): string {
  // return binary representation of python BitArray string input
  if (str.includes(':')) {
    const ptr = /\w+:(\d+)=(.+)/;
    const match = str.match(ptr);
    const length = parseInt(match[1]);
    str = match[2];
    return (parseInt(str, 10) >>> 0).toString(2).padStart(length, '0');
  }
  else if (typeof str == 'string') {
    if (str.toLowerCase().startsWith('0x')) {
      return parseInt(str, 16).toString(2).padStart(len, '0');
    }
    else if (str.toLowerCase().startsWith('0b')) {
      return str.slice(2).padStart(len, '0');
    }
    else if (str.toLowerCase().startsWith('bool=')) {
      return parseInt(str.split('=')[1], 10).toString(2);
    }
  }
  else if (str instanceof Uint8Array) {
    return Object.values(str).map(x => x.toString(2).padStart(8, '0'))
              .join('').padStart(len, '0');
  }

  return (parseInt(str, 10) >>> 0).toString(2).padStart(len, '0');
}

export function barToHex(bar: BitArrayPy, pad: number = 8) {
  return parseInt(Object.values(bar).join(''), 2).toString(16).padStart(pad, '0');
}

//BitArray.prototype.read = BARead;
//BitArray.prototype.overwrite = BAOverwrite;
//BitArray.prototype.all = BAAll;
//BitArray.prototype.any = BAAny;
//BitArray.prototype.equals = BAEquals;
//BitArray.prototype.set = BASet;


