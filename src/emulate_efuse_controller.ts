//import BitArrayPy from "@bitarray/es6";
import { BitArrayPy } from "./bit_ops";
import { rsEncodeMsg } from './reed_solomon';

import { EfuseDefineBlocks, EfuseDefineFields, EfuseDefineRegisters } from './mem_definition';
import { EmulateEfuseControllerBase } from './emulate_efuse_controller_base';

class EmulateEfuseController extends EmulateEfuseControllerBase {
  CHIP_NAME: string = "ESP32-S3";
  chip: any;
  //mem: any = null;
  //debug: boolean = false;

  constructor(efuseFile: string | null = null, debug: boolean = false) {
    super(efuseFile, debug);
    this.Blocks = new EfuseDefineBlocks();
    this.Fields = new EfuseDefineFields();
    this.REGS = EfuseDefineRegisters;
    this.writeReg(this.REGS.EFUSE_CMD_REG, 0);
    this.chip = {CHIP_NAME: "ESP32-S3"};

    this.chip.getCrystalFreq = this.getCrystalFreq;
  }

  getMajorChipVersion(): number {
    return 0;
  }

  getMinorChipVersion(): number {
    return 2;
  }

  getCrystalFreq(): number {
    return 40; // MHz (common for all chips)
  }

  getSecurityInfo(): Record<string, number> {
    return {
      "flags": 0,
      "flash_crypt_cnt": 0,
      "key_purposes": 0,
      "chip_id": 0,
      "api_version": 0,
    };
  }

  async handleWritingEvent(addr: number, value: number): Promise<void> {
    if (addr === this.REGS.EFUSE_CMD_REG) {
      if (value & this.REGS.EFUSE_PGM_CMD) {
        await this.copyBlocksWrRegsToRdRegs((value >> 2) & 0xF);
        this.cleanBlocksWrRegs();
        this.checkRdProtectionArea();
        this.writeReg(addr, 0);
        this.writeReg(this.REGS.EFUSE_CMD_REG, 0);
      } else if (value === this.REGS.EFUSE_READ_CMD) {
        this.writeReg(addr, 0);
        this.writeReg(this.REGS.EFUSE_CMD_REG, 0);
        this.saveToFile();
      }
    }
  }

  getBitlenOfBlock(blk: any, wr: boolean = false): number {
    if (blk.id === 0) {
      return wr ? 32 * 8 : 32 * blk.len;
    } else {
      return wr ? 32 * 8 + 32 * 3 : 32 * blk.len;
    }
  }

  async handleCodingScheme(blk: any, data: any): Promise<any> {
    if (blk.id !== 0) {
      const codedBytes = 12;
      data.pos = codedBytes * 8;
      //const plainData = data.readlist("32*uint:8").reverse();
      const plainData = data.toString().split(' ').slice(codedBytes).reverse().map(x => parseInt(x, 2));

      const calcEncodedData = rsEncodeMsg(Array.from(plainData), 12);

      data.pos = 0;
      if (JSON.stringify(calcEncodedData) !== JSON.stringify(
          data.toString().split(' ').reverse().map(x => parseInt(x, 2)))) {
        throw new Error("Error in coding scheme data");
      }
      data = BitArrayPy.from(data.toString().split(' ').slice(codedBytes).join(''));
    }
    if (blk.len < 8) {
      // ????????????
      data = BitArrayPy.from(Object.values(data).slice((8 - blk.len) * 32).join(''));
    }
    return data;
  }
}

export { EmulateEfuseController };
