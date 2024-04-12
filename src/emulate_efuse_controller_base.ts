import { BitArrayPy } from "./bit_ops";
import { EfuseBlocksBase } from './mem_definition_base';
import { hexify } from './utils';

abstract class EmulateEfuseControllerBase {
  CHIP_NAME: string = "";
  mem: BitArrayPy | null = null;
  debug: boolean = false;
  Blocks: any = null;
  Fields: any = null;
  REGS: any = null;
  efuseFile: string | null = null;

  abstract getMajorChipVersion(): number;
  abstract getMinorChipVersion(): number;

  constructor(efuseFile: string | null = null, efuseMemSize: number, debug: boolean = false) {
    // in case of porting another dev, efuseMemSize is js specific
    // (super in js must be called first in child)
    this.debug = debug;
    this.efuseFile = efuseFile;
    if (this.efuseFile) {
      /* TODO
      try {
        const fileData = fs.readFileSync(this.efuseFile);
        this.mem = BitArrayPy.fromBuffer(fileData);
      } catch (error) {
        // The file is empty or does not fit the length.
        this.mem = new BitArrayPy(efuseMemSize * 8);
        this.mem.setBits(0);
        fs.writeFileSync(this.efuseFile, this.mem.toBuffer());
      }
      */
    } else {
      // efuseFile is not provided
      // It means we do not want to keep the result of efuse operations
      this.mem = new BitArrayPy(efuseMemSize * 8);
    }
  }

  // esptool method start >>
  getChipDescription(): string {
    const majorRev = this.getMajorChipVersion();
    const minorRev = this.getMinorChipVersion();
    return `${this.CHIP_NAME} (revision v${majorRev}.${minorRev})`;
  }

  getChipRevision(): number {
    return this.getMajorChipVersion() * 100 + this.getMinorChipVersion();
  }

  readEfuse(n: number, block: number = 0): number {
    const blk = EfuseBlocksBase.get(this.Blocks.BLOCKS[block]);
    return this.readReg(blk.rdAddr + (4 * n));
  }

  readReg(addr: number): number {
    this.mem!.pos = this.mem!.length - ((addr - this.REGS.DR_REG_EFUSE_BASE) * 8 + 32);
    return <number> this.mem!.read('uint:32');
  }

  async writeReg(addr: number, value: number, mask: number = 0xFFFFFFFF,
                 delayUs: number = 0, delayAfterUs: number = 0): Promise<void> {
    this.mem!.pos = this.mem!.length - ((addr - this.REGS.DR_REG_EFUSE_BASE) * 8 + 32);
    this.mem!.overwrite(BitArrayPy.from(((value & mask) >>> 0).toString(2).padStart(32, '0')));
    await this.handleWritingEvent(addr, value);
  }

  updateReg(addr: number, mask: number, newVal: number): void {
    const position = this.mem!.length - ((addr - this.REGS.DR_REG_EFUSE_BASE) * 8 + 32);
    this.mem!.pos = position;
    const curVal: any = this.mem!.read('uint:32');
    this.mem!.pos = position;
    this.mem!.overwrite(BitArrayPy.from(((curVal | (newVal & mask)) >>> 0).toString(2).padStart(32, '0')));
  }

  writeEfuse(n: number, value: number, block: number = 0): void {
    const blk = EfuseBlocksBase.get(this.Blocks.BLOCKS[block]);
    this.writeReg(blk.wrAddr + (4 * n), value);
  }

  handleWritingEvent(addr: number, value: number): void {
    this.saveToFile();
  }

  saveToFile(): void {
    if (this.efuseFile) {
      // TODO write to file
      //fs.writeFileSync(this.efuseFile, this.mem!.toBuffer());
    }
  }

  handleCodingScheme(blk: any, data: any): any {
    return data;
  }

  async copyBlocksWrRegsToRdRegs(updatedBlock: number | null = null): Promise<void> {
    for (const b of this.Blocks.BLOCKS.slice().reverse()) {
      const blk = EfuseBlocksBase.get(b);
      if (updatedBlock !== null && blk.id !== updatedBlock) {
        continue;
      }
      let data = this.readBlock(blk.id, true);
      if (!data)
        throw new Error(`Read field - block is null`);
      if (this.debug) {
        console.log(`${blk.name} ` +
          hexify(data.toString(), ' ').replace(/ /g, ''));
      }
      let plainData = await this.handleCodingScheme(blk, data);
      plainData = this.checkWrProtectionArea(blk.id, plainData);
      this.updateBlock(blk, plainData);
    }
  }

  cleanBlocksWrRegs(): void {
    for (const b of this.Blocks.BLOCKS) {
      const blk = EfuseBlocksBase.get(b);
      for (let offset = 0; offset < blk.len * 4; offset += 4) {
        const wrAddr = blk.wrAddr + offset;
        this.writeReg(wrAddr, 0);
      }
    }
  }

  readField(name: string, bitstring: boolean = true): BitArrayPy | number | null {
    for (const field of this.Fields.EFUSES) {
      if (field.name === name) {
        this.readBlock(field.block);
        const block = this.readBlock(field.block);
        if (!block)
          throw new Error(`Read field - block is null`);
        let fieldLen: number;
        if (field.type.startsWith("bool")) {
          fieldLen = 1;
        } else {
          fieldLen = parseInt(field.type.match(/\d+/)![0], 10);
          if (field.type.startsWith("bytes")) {
            fieldLen *= 8;
          }
        }
        block.pos = block.length - (field.word * 32 + field.pos + fieldLen);
        if (bitstring) {
          return block.read(fieldLen);
        } else {
          return block.read(field.type);
        }
      }
    }
    return null;
  }

  getBitlenOfBlock(blk: any, wr: boolean = false): number {
    return 32 * blk.len;
  }

  readBlock(idx: number, wrRegs: boolean = false): BitArrayPy | null {
    if (!this.mem)
      throw new Error(`Cannot overwrite mem from block - this.mem is null`);
    let block: BitArrayPy | null = null;
    for (const b of this.Blocks.BLOCKS) {
      const blk = EfuseBlocksBase.get(b);
      if (blk.id === idx) {
        const blkLenBits = this.getBitlenOfBlock(blk, wrRegs);
        const addr = wrRegs ? blk.wrAddr : blk.rdAddr;
        this.mem.pos = this.mem.length - ((addr - this.REGS.DR_REG_EFUSE_BASE) * 8 + blkLenBits);
        block = <BitArrayPy> this.mem.read(blkLenBits);
        break;
      }
    }
    return block;
  }

  updateBlock(blk: any, wrData: BitArrayPy): void {
    wrData = this.readBlock(blk.id)!.or(wrData);
    this.overwriteMemFromBlock(blk, wrData);
  }

  overwriteMemFromBlock(blk: any, wrData: BitArrayPy): void {
    if (!this.mem)
      throw new Error(`Cannot overwrite mem from block - this.mem is null`);
    this.mem.pos = this.mem.length - ((blk.rdAddr - this.REGS.DR_REG_EFUSE_BASE) * 8 + wrData.length);
    this.mem.overwrite(wrData);
  }

  checkWrProtectionArea(numBlk: number, wrData: BitArrayPy): BitArrayPy {
    // checks fields which have the write protection bit.
    // if the write protection bit is set, we need to protect that area from changes.
    const writeDisableBit = <number> this.readField("WR_DIS", false)!;
    const maskWrData = new BitArrayPy(wrData.length);
    maskWrData.setBits(0);
    const blk = EfuseBlocksBase.get(this.Blocks.BLOCKS[numBlk]);
    if (blk.writeDisableBit !== null && (writeDisableBit & (1 << blk.writeDisableBit))) {
      maskWrData.setBits(1);
    } else {
      for (const field of this.Fields.EFUSES) {
        if (blk.id === field.block && field.block === numBlk && field.writeDisableBit !== null &&
          (writeDisableBit & (1 << field.writeDisableBit))) {
          const data = <BitArrayPy> this.readField(field.name)!;
          data.setBits(1);
          maskWrData.pos = maskWrData.length - (field.word * 32 + field.pos + data.length);
          maskWrData.overwrite(data);
        }
      }
    }
    //maskWrData.invert();
    return wrData.and(BitArrayPy.from(Object.values(maskWrData).map(x => !x)));
  }

  checkRdProtectionArea(): void {
    // checks fields which have the read protection bits.
    // if the read protection bit is set then we need to reset this field to 0.
    const readDisableBit = <number> this.readField("RD_DIS", false)!;
    for (const b of this.Blocks.BLOCKS) {
      const blk = EfuseBlocksBase.get(b);
      let block = this.readBlock(blk.id)!;
      if (blk.readDisableBit !== null && (readDisableBit & (1 << blk.readDisableBit))) {
        block.setBits(0);
      } else {
        for (const field of this.Fields.EFUSES) {
          if (blk.id === field.block && field.readDisableBit !== null &&
            (readDisableBit & (1 << field.readDisableBit))) {
            const rawData = <BitArrayPy> this.readField(field.name)!;
            rawData.setBits(0);
            block.pos = block.length - (field.word * 32 + field.pos + rawData.length);
            block.overwrite(new BitArrayPy(rawData.length));
          }
        }
      }
      this.overwriteMemFromBlock(blk, block);
    }
  }

  cleanMem(): void {
    this.mem!.setBits(0);
    if (this.efuseFile) {
      /* TODO ? save to file
      const f = Deno.openSync(this.efuseFile, { write: true, create: true });
      this.mem.tofile(f);
      f.close();
      */
    }
  }
}

export { EmulateEfuseControllerBase };
