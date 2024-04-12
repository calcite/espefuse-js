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

