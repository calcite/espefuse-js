import { binascii } from 'binascii';
//import BitArrayPy from "@bitarray/es6";
import { BitArrayPy } from "./bit_ops";
import { hexify, parseBitNumStr, maskToShift } from './utils';
import { EspEfuses } from './fields';
// BitArrayPy, util.hexify ??

class CheckArgValue {
  efuses: any;
  name: string;

  constructor(efuses: any, name: string) {
    this.efuses = efuses;
    this.name = name;
  }

  call(newValueStr: string): any {
    const checkArgValue = (efuse: any, newValue: any): any => {
      if (efuse.efuseType.startsWith("bool")) {
        newValue = newValue === null ? 1 : parseInt(newValue, 0);
        if (newValue !== 1) {
          throw new Error(`New value is not accepted for efuse '${efuse.name}'`+
          ` (will always burn 0->1), given value=${newValue}`);
        }
      } else if (efuse.efuseType.startsWith("int") ||
                  efuse.efuseType.startsWith("uint")) {
        if (efuse.efuseClass === "bitcount") {
          if (newValue === null) {
            let old_value = efuse.getRaw();
            newValue = old_value;
            let bit = 1;
            while (newValue === old_value) {
              newValue = bit | old_value;
              bit <<= 1;
            }
          } else {
            newValue = parseInt(newValue, 0);
          }
        } else {
          if (newValue === null) {
            throw new Error(`New value required for efuse '${efuse.name}' (given None)`);
          }
          newValue = parseInt(newValue, 0);
          if (newValue === 0) {
            throw new Error(`New value should not be 0 for '${efuse.name}' (given value=${newValue})`);
          }
        }
      } else if (efuse.efuseType.startsWith("bytes")) {
        if (newValue === null) {
          throw new Error(`New value required for efuse '${efuse.name}' (given None)`);
        }
        if (newValue.length * 8 !== efuse.bitarray.length) {
          throw new Error(`The length of efuse '${efuse.name}' (${efuse.bitarray.len} bits) (given len of the new value= ${newValue.length * 8} bits)`);
        }
      } else {
        throw new Error(`The '${efuse.efuseType}' type for the '${efuse.name}' efuse is not supported yet.`);
      }
      return newValue;
    };

    const efuse = this.efuses.getItem(this.name);
    const newValue = efuse.checkFormat(newValueStr);
    return checkArgValue(efuse, newValue);
  }
}

abstract class EfuseProtectBase {
  // This class is used by EfuseBlockBase and EfuseFieldBase
  readDisableBit: number | number[] | null;
  writeDisableBit: number | null;
  name: string;
  parent: EspEfuses;

  getReadDisableMask(blkPart?: number | null): number {
    /** Returns mask of read protection bits
        blk_part:
            - None: Calculate mask for all read protection bits.
            - a number: Calculate mask only for specific item in read protection
              list.
     */
    let mask = 0;

    if (Array.isArray(this.readDisableBit)) {
      if (blkPart === null || blkPart === undefined) {
        for (const i of this.readDisableBit) {
          mask |= 1 << i;
        }
      } else {
        mask |= 1 << this.readDisableBit[blkPart];
      }
    } else if (this.readDisableBit !== null) {
      mask = 1 << this.readDisableBit;
    }

    return mask;
  }

  getCountReadDisableBits(): number {
    // Returns the number of read protection bits used by the field
    // On the C2 chip, BLOCK_KEY0 has two read protection bits [0, 1].
    return this.getReadDisableMask().toString(2).split('1').length - 1;
  }

  isReadable(blkPart?: number | null): boolean {
    // Return true if the efuse is readable by software
    const numBit = this.readDisableBit;

    if (numBit === null) {
      return true; // read cannot be disabled
    }

    return (this.parent.getItem("RD_DIS").get() & this.getReadDisableMask(blkPart)) === 0;
  }

  disableRead(): void {
    const numBit = this.readDisableBit;

    if (numBit === null) {
      throw new Error("This efuse cannot be read-disabled");
    }

    if (!this.parent.getItem("RD_DIS").isWriteable()) {
      throw new Error(
        "This efuse cannot be read-disabled due to the RD_DIS field is already write-disabled"
      );
    }

    this.parent.getItem("RD_DIS").save(this.getReadDisableMask());
  }

  isWriteable(): boolean {
    const numBit = this.writeDisableBit;

    if (numBit === null) {
      return true; // write cannot be disabled
    }

    return (this.parent.getItem("WR_DIS").get() & (1 << numBit)) === 0;
  }

  disableWrite(): void {
    const numBit = this.writeDisableBit;
    if (numBit === null)
      return;

    if (!this.parent.getItem("WR_DIS").isWriteable()) {
      throw new Error(
        "This efuse cannot be write-disabled due to the WR_DIS field is already write-disabled"
      );
    }

    this.parent.getItem("WR_DIS").save(1 << numBit);
  }

  checkWrRdProtect(): void {
    if (!this.isReadable()) {
      let errorMsg = `\t${this.name} is read-protected.`;
      errorMsg += "The written value cannot be read; the efuse/block looks as all 0.\n";
      errorMsg += `\tBurn in this case may damage an already written value.`;
      this.parent.printErrorMsg(errorMsg);
    }

    if (!this.isWriteable()) {
      const errorMsg = `\t${this.name} is write-protected. Burn is not possible.`;
      this.parent.printErrorMsg(errorMsg);
    }
  }
}

abstract class EfuseBlockBase extends EfuseProtectBase {
  parent: any;
  name: string;
  alias: string[];
  id: number;
  rdAddr: number;
  wrAddr: number;
  writeDisableBit: number | null;
  readDisableBit: number | number[];
  len: number;
  keyPurposeName: string;
  bitarray: BitArrayPy;
  wrBitarray: BitArrayPy;
  fail: boolean;
  numErrors: number;
  errBitarray: BitArrayPy | null;
  readReady: any;

  abstract applyCodingScheme(): Promise<number[]>;

  constructor(parent: any, param: any, skipRead = false) {
    super();
    this.parent = parent;
    this.name = param.name;
    this.alias = param.alias;
    this.id = param.id;
    this.rdAddr = param.rdAddr;
    this.wrAddr = param.wrAddr;
    this.writeDisableBit = param.writeDisableBit;
    this.readDisableBit = param.readDisableBit;
    this.len = param.len;
    this.keyPurposeName = param.keyPurpose;
    const bitBlockLen = this.getBlockLen() * 8;
    this.bitarray = new BitArrayPy(bitBlockLen);
    this.bitarray.setBits(0);
    this.wrBitarray = new BitArrayPy(bitBlockLen);
    this.wrBitarray.setBits(0);
    this.fail = false;
    this.numErrors = 0;
    this.readReady = undefined;

    if (this.id === 0) {
      this.errBitarray = new BitArrayPy(bitBlockLen);
      this.errBitarray.setBits(0);
    } else {
      this.errBitarray = null;
    }

    //if (!skipRead) {
    //  this.read();
    //}
    this.readReady = new Promise(async (r) => {
      if (skipRead)
        r(null);
      else {
        await this.read();
        r('DONE!');
      }
    });
  }

  getBlockLen(): number {
    const codingScheme = this.getCodingScheme();
    if (codingScheme === this.parent.REGS.CODING_SCHEME_NONE) {
      return this.len * 4;
    } else if (codingScheme === this.parent.REGS.CODING_SCHEME_34) {
      return ((this.len * 3) / 4) * 4;
    } else if (codingScheme === this.parent.REGS.CODING_SCHEME_RS) {
      return this.len * 4;
    } else {
      throw new Error(`Coding scheme (${codingScheme}) not supported`);
    }
  }

  getCodingScheme(): number {
    if (this.id === 0) {
      return this.parent.REGS.CODING_SCHEME_NONE;
    } else {
      return this.parent.codingScheme;
    }
  }

  getRaw(fromRead = true): Uint8Array {
    const getUintArr = (x: BitArrayPy) =>
      x.toString().split(' ').map(y => parseInt(y, 2));
    if (fromRead) {
      return new Uint8Array(getUintArr(this.bitarray));
    } else {
      return new Uint8Array(getUintArr(this.wrBitarray));
    }
  }

  get(fromRead = true): BitArrayPy {
    return this.getBitstring(fromRead);
  }

  getBitstring(fromRead = true): BitArrayPy {
    if (fromRead) {
      return this.bitarray;
    } else {
      return this.wrBitarray;
    }
  }

  convertToBitstring(newData: number[] | BitArrayPy): BitArrayPy {
    if (newData instanceof BitArrayPy) {
      return newData;
    } else {
      return BitArrayPy.from(
        newData.map(x => x.toString(2).padStart(8, '0')).join(''))
    }
  }

  async getWords(): Promise<number[]> {
    function getOffsets(block: EfuseBlockBase): number[] {
      return Array.from(
        { length: block.getBlockLen() / 4 },
        (_, index) => index * 4 + block.rdAddr
      );
    }

    const results: any[] = [];
    for (const offs of getOffsets(this)) {
      results.push(await this.parent.readReg(offs));
    }
    return results;
  }

  async read(): Promise<void> {
    const words = await this.getWords();
    const data = BitArrayPy.from(
      words.reverse().map(x => parseBitNumStr(`uint:32=${x}`)).join(''))
    this.bitarray.overwrite(data, 0);
    this.printBlock(this.bitarray, 'read_regs');
  }

  printBlock(bitString: BitArrayPy, comment: string, debug = false): void {
    if (this.parent.debug || debug) {
      bitString.pos = 0;
      const bits = Object.values(bitString).join('')
      const groups = (bits.match(/.{1,32}/g) || []).map(
        x => parseInt(x, 2).toString(16).padStart(8, '0'));

      this.parent.info(
        this.name.padEnd(15) +
        `(${this.alias.slice(0, 16).join(' ').padEnd(16)}) ` +
        `[${this.id.toString().padEnd(2, ' ')}] ` +
        comment + ' ' +
        groups.reverse().join(' ')
      )
    }
  }

  checkWrData(): boolean {
    const wrData = this.wrBitarray;

    if (wrData.all(false)) {
      // nothing to burn
      if (this.parent.debug) {
        this.parent.info(`[${this.id}] ${this.name.padEnd(20)} nothing to burn`);
      }
      return false;
    }

    if (wrData.byteLength !== this.bitarray.byteLength) {
      throw new Error(
        `Data does not fit: the block${this.id} size is ` +
        `${this.bitarray.byteLength} bytes, data is ${wrData.byteLength / 8} ` +
        `bytes`
      );
    }

    this.checkWrRdProtect();

    if (this.getBitstring().all(false)) {
      this.parent.info(`[${this.id}] ${this.name.padEnd(20)} is empty, will burn the new value`);
    } else {
      // the written block in the chip is not empty
      if (this.getBitstring().equals(wrData)) {
        this.parent.info(`[${this.id}] ${this.name.padEnd(20)} is already written the same value, continue with EMPTY_BLOCK`);
        wrData.setBits(0);
      } else {
        this.parent.info(`[${this.id}] ${this.name.padEnd(20)} is not empty`);
        this.parent.info(`\t(written ): ${hexify(this.getBitstring().toString(), ' ')}`);
        this.parent.info(`\t(to write): ${hexify(wrData.toString(), ' ')}`);

        const mask = this.getBitstring().and(wrData);

        if (mask.equals(wrData)) {
          this.parent.info(
            "\tAll wr_data bits are set in the written block, continue with EMPTY_BLOCK."
          );
          wrData.setBits(0);
        } else {
          const codingScheme = this.getCodingScheme();

          if (codingScheme === this.parent.REGS.CODING_SCHEME_NONE) {
            this.parent.info("\t(coding scheme = NONE)");
          } else if (codingScheme === this.parent.REGS.CODING_SCHEME_RS) {
            this.parent.info("\t(coding scheme = RS)");
            const error_msg = `Burn into ${this.name} is forbidden (RS coding scheme does not allow this).`;
            this.parent.printErrorMsg(error_msg);
          } else if (codingScheme === this.parent.REGS.CODING_SCHEME_34) {
            // TODO - scheme 3/4 is not supported in js port, yet!!!!!!!!!
            throw new Error('Scheme 3/4 is not supported in js port, yet; TODO')
            //this.parent.info("\t(coding scheme = 3/4)");

            //let data_can_not_be_burn = false;

            //for (let i = 0; i < this.getBitstring().length; i += 6 * 8) {
            //  const rdChunk = this.getBitstring().slice(i, i + 6 * 8);
            //  const wrChunk = wrData.slice(i, i + 6 * 8);

            //  if (rdChunk.any(true)) {
            //    if (wrChunk.any(true)) {
            //      this.parent.info(`\twritten chunk [${i / (6 * 8)}] and wr_chunk are not empty. `);

            //      if (rdChunk.equals(wrChunk)) {
            //        this.parent.info("wr_chunk == rd_chunk. Continue with empty chunk.");
            //        // TODO
            //        wrData.setBits(0, i, i + 6 * 8);
            //      } else {
            //        this.parent.info("wr_chunk != rd_chunk. Can not burn.");
            //        this.parent.info(`\twritten ${rdChunk.toString('hex')}`);
            //        this.parent.info(`\tto write ${wrChunk.toString('hex')}`);
            //        data_can_not_be_burn = true;
            //      }
            //    }
            //  }
            //}

            //if (data_can_not_be_burn) {
            //  const error_msg = `Burn into ${this.name} is forbidden (3/4 coding scheme does not allow this).`;
            //  this.parent.printErrorMsg(error_msg);
            //}
          } else {
            throw new Error(
              `The coding scheme (${codingScheme}) is not supported`
            );
          }
        }
      }
    }
    return true;
  }

  save(newData: number[]): void {
    // new_data will be checked by check_wr_data() during burn_all()
    // new_data (bytes)  = [0][1][2] ... [N]            (original data)
    // in string format  = [0] [1] [2] ... [N]          (util.hexify(data, " "))
    // in hex format     = 0x[N]....[2][1][0]           (from bitstring print(data))
    // in reg format     = [3][2][1][0] ... [N][][][]   (as it will be in the device)
    // in bitstring      = [N] ... [2][1][0]            (to get a correct bitstring need to reverse new_data)
    // *[x] - means a byte.

    //const data = new BitArrayPy({ bytes: new Uint8Array(newData.reverse()) });
    const data = BitArrayPy.from(newData.reverse().flatMap(
      x => x.toString(2).padStart(8, '0')).join(''));

    if (this.parent.debug) {
      this.parent.info("\twritten : " +
        hexify(this.getBitstring().toString(), ' ') +
        " ->\n\tto write: " +
        hexify(data.toString(), ' ') + ' '
      );
    }

    this.wrBitarray.overwrite(this.wrBitarray.or(data), 0);
  }

  async burnWords(words: number[]): Promise<void> {
    for (let burns = 0; burns < 3; burns++) {
      await this.parent.efuseControllerSetup();

      if (this.parent.debug) {
        this.parent.info(`Write data to BLOCK${this.id}`);
      }

      let writeRegAddr = this.wrAddr;

      for (const word of words) {
        // For ep32s2: using EFUSE_PGM_DATA[0..7]_REG for writing data
        //   32 bytes to EFUSE_PGM_DATA[0..7]_REG
        //   12 bytes to EFUSE_CHECK_VALUE[0..2]_REG. These regs are next after
        //   EFUSE_PGM_DATA_REG
        // For esp32:
        //   each block has the special regs EFUSE_BLK[0..3]_WDATA[0..7]_REG
        //   for writing data

        if (this.parent.debug) {
          this.parent.info(`Addr 0x${writeRegAddr.toString(16)}, data=0x${word.toString(16).padStart(8, '0')}`);
        }

        await this.parent.writeReg(writeRegAddr, word);
        writeRegAddr += 4;
      }

      await this.parent.writeEfuses(this.id);

      for (let _ = 0; _ < 5; _++) {
        await this.parent.efuseRead();
        await this.parent.getCodingSchemeWarnings(true);

        if (this.fail || this.numErrors) {
          this.parent.info(
            `Error in BLOCK${this.id}, re-burn it again (#${burns}), to fix it. ` +
            `fail_bit=${this.fail}, num_errors=${this.numErrors}`
          );
          break;
        }
      }

      if (!this.fail && this.numErrors === 0) {
        break;
      }
    }
  }

  async burn(): Promise<void> {
    if (this.wrBitarray.all(false)) {
      // nothing to burn
      return;
    }

    const beforeBurnBitarray = BitArrayPy.from(Object.values(this.bitarray));

    if (beforeBurnBitarray === this.bitarray)
      throw new Error('beforeBurnBitarray is not a clone!');

    this.printBlock(this.wrBitarray, "to_write");

    const words = await this.applyCodingScheme();
    await this.burnWords(words);

    await this.read();

    if (!this.isReadable()) {
      this.parent.info(
        `${this.name} (${this.alias}) is read-protected. ` +
        "Read back the burn value is not possible."
      );

      if (this.bitarray.all(false)) {
        this.parent.info("Read all '0'");
      } else {
        // Should never happen
        throw new Error(
          `The ${this.name} is read-protected but not all '0' (${this.bitarray.toString()})`
        );
      }
    } else {
      if (this.wrBitarray.equals(this.bitarray)) {
        this.parent.info(`BURN BLOCK${this.id} - OK (write block == read block)`);
      } else if (
        this.wrBitarray.and(this.bitarray).equals(this.wrBitarray) &&
        this.bitarray.and(beforeBurnBitarray).equals(beforeBurnBitarray)
      ) {
        this.parent.info(`BURN BLOCK${this.id} - OK (all write block bits are set)`);
      } else {
        // Happens only when an efuse is written and read-protected
        // in one command
        this.printBlock(this.wrBitarray, "Expected");
        this.printBlock(this.bitarray, "Real    ");

        // Read-protected BLK0 values are reported back as zeros,
        // raise error only for other blocks
        if (this.id !== 0) {
          throw new Error(`Burn ${this.name} (${this.alias}) was not successful`);
        }
      }
    }

    this.wrBitarray.setBits(0);
  }
}


class EspEfusesBase {
  _esp: any; // Replace 'any' with the actual type of _esp
  blocks: any[] = []; // Replace 'any' with the actual type of blocks
  efuses: any[] = []; // Replace 'any' with the actual type of efuses
  codingScheme: any; // Replace 'any' with the actual type of codingScheme
  forceWriteAlways: any; // Replace 'any' with the actual type of forceWriteAlways
  batchModeCnt: number = 0;
  confirmFn: Function | null = null; // function

  [key: string]: any; // Add more specific types as needed

  //[Symbol.iterator]() {
  //  return this.efuses[Symbol.iterator]();
  //}

  async getCrystalFreq() {
    return await this._esp.chip.getCrystalFreq(this._esp);
  }

  //async readEfuse(n: number) {
  //  return await this._esp.readEfuse(n);
  //}

  async readReg(addr: number) {
    return await this._esp.readReg(addr);
  }

  async writeReg(addr: number, value: number, mask: number = 0xFFFFFFFF, delayUs: number = 0, delayAfterUs: number = 0) {
    return await this._esp.writeReg(addr, value, mask, delayUs, delayAfterUs);
  }

  async updateReg(addr: number, mask: number, newVal: number) {
    if (this._esp.updateReg) {
      return await this._esp.updateReg(addr, mask, newVal);
    }
    /**
     * Update register at 'addr', replace the bits masked out by 'mask'
     * with newVal. newVal is shifted left to match the LSB of 'mask'
     *
     * Returns just-written value of register.
     */
    const shift = maskToShift(mask);
    let val = await this.readReg(addr);
    val &= ~mask;
    val |= (newVal << shift) & mask;
    await this.writeReg(addr, val);

    return val;
  }

  efuseControllerSetup() {
    // Implement according to TypeScript needs
  }

  async reconnectChip(esp: any) {
    this.parent.info("Re-connecting...");
    const baudrate = esp._port.baudrate;
    const port = esp._port.port;
    await esp._port.close();
    return await esp.cmds.detectChip(port, baudrate);
  }

  getIndexBlockByName(name: string) {
    for (const block of this.blocks) {
      if (block.name === name || block.alias.includes(name)) {
        return block.id;
      }
    }
    return null;
  }

  async readBlocks() {
    for (const block of this.blocks) {
      await block.read();
    }
  }

  async updateEfuses() {
    for (const efuse of this.efuses) {
      await efuse.update(this.blocks[efuse.block].bitarray);
    }
  }

  async burnAll(checkBatchMode: boolean = false): Promise<boolean> {
    if (checkBatchMode) {
      if (this.batchModeCnt !== 0) {
        this.info("\nBatch mode is enabled, the burn will be done at the end of the command.");
        return false;
      }
    }

    this.info("\nCheck all blocks for burn...");
    this.info("idx, BLOCK_NAME,          Conclusion");
    let haveWrDataForBurn = false;

    for (const block of this.blocks) {
      block.checkWrData();

      if (!haveWrDataForBurn && block.getBitstring(false).any(true)) {
        haveWrDataForBurn = true;
      }
    }

    if (!haveWrDataForBurn) {
      this.info("Nothing to burn, see messages above.");
      return true;
    }

    await EspEfusesBase.confirm("", this.doNotConfirm, this.info.bind(this), this.confirmFn);

    // Burn from BLKn -> BLK0. Because BLK0 can set rd or/and wr protection bits.
    for (const block of this.blocks.slice().reverse()) {
      const oldFail = block.fail;
      const oldNumErrors = block.numErrors;
      await block.burn();

      if ((block.fail && oldFail !== block.fail) || (block.numErrors && block.numErrors > oldNumErrors)) {
        throw new Error("Error(s) were detected in eFuses");
      }
    };

    this.info("Reading updated efuses...");
    this.readCodingScheme();
    await this.readBlocks();
    await this.updateEfuses();
    return true;
  }

  static async confirm(action: string, doNotConfirm: boolean, logFn: Function,
                       confirmFn: Function | null = null): Promise<void> {
    logFn(`${action}${action.endsWith("\n") ? "" : ". "}This is an irreversible operation!`);

    if (!doNotConfirm) {
      logFn('Press OK to burn efuses or cancel to abort burning.');
      // Required for runtimes which disable line buffering, i.e., mingw in mintty
      //process.stdout.write("Type 'BURN' (all capitals) to continue: ");
      if (!confirmFn)
        confirmFn = confirm;
      const answer = await confirmFn('Press OK to burn efuses or cancel to abort burning.'); //readlineSync.question();

      if (!answer) { // !== "BURN") {
        logFn("Aborting.");
        throw new Error('Aborting.');
      }
    }
  }

  printErrorMsg(errorMsg: string): void {
    if (this.forceWriteAlways !== null) {
      if (!this.forceWriteAlways) {
        errorMsg += "(use '--force-write-always' option to ignore it)";
      }
    }

    if (this.forceWriteAlways) {
      this.info(`${errorMsg} Skipped because '--force-write-always' option.`);
    } else {
      this.info(errorMsg);
      throw new Error(errorMsg);
    }
  }

  getBlockErrors(blockNum: number): [number, boolean] {
    return [this.blocks[blockNum].numErrors, this.blocks[blockNum].fail];
  }
}


class EfuseFieldBase extends EfuseProtectBase {
  category: string;
  parent: any; // Replace 'any' with the actual type of 'parent'
  block: number;
  word: number | null;
  pos: number | null;
  writeDisableBit: number | null;
  readDisableBit: number | null;
  name: string;
  efuseClass: string;
  efuseType: string;
  description: string;
  dictValue: any; // Replace 'any' with the actual type of 'dictionary'
  bitLen: number;
  altNames: string[];
  fail: boolean;
  numErrors: number;
  bitarray: BitArrayPy;

  constructor(parent: any, param: any) {
    super();
    this.category = param.category;
    this.parent = parent;
    this.block = param.block;
    this.word = param.word;
    this.pos = param.pos;
    this.writeDisableBit = param.writeDisableBit;
    this.readDisableBit = param.readDisableBit;
    this.name = param.name;
    this.efuseClass = param.classType;
    this.efuseType = param.type;
    this.description = param.description;
    this.dictValue = param.dictionary;
    this.bitLen = param.bitLen;
    this.altNames = param.altNames;
    this.fail = false;
    this.numErrors = 0;
    this.bitarray = new BitArrayPy(this.bitLen);
    this.bitarray.setBits(0);
    this.update(this.parent.blocks[this.block].bitarray);
  }

  isFieldCalculated(): boolean {
    return this.word === null || this.pos === null;
  }

  checkFormat(newValueStr: string | null): any {
    if (newValueStr === null) {
      return newValueStr;
    } else {
      if (this.efuseType.startsWith("bytes")) {
        if (newValueStr.startsWith("0x")) {
          return new BitArrayPy(
            binascii.unhexlify(newValueStr.substring(2)).reverse()
          );
        } else {
          return new BitArrayPy(binascii.unhexlify(newValueStr));
        }
      } else {
        return newValueStr;
      }
    }
  }

  convertToBitString(newValue: any): BitArrayPy {
    if (newValue instanceof BitArrayPy) {
      return newValue;
    } else {
      if (this.efuseType.startsWith("bytes")) {
        return BitArrayPy.from(parseBitNumStr(newValue.reverse(),
          newValue.length * 8));
      } else {
        try {
          return BitArrayPy.from(parseBitNumStr(`${this.efuseType}=${newValue}`));
        } catch (err) {
          this.parent.info(
            `New value '${newValue}' is not suitable for ${this.name} (${this.efuseType})`
          );
          throw err;
        }
      }
    }
  }

  async checkNewValue(bitArrayNewValue: BitArrayPy): Promise<void> {
    const bitArrayOldValue = this.getBitstring().or(
      this.getBitstring(false) // Assuming the second parameter is for 'from_read'
    );

    if (!bitArrayNewValue.any(true) && !bitArrayOldValue.any(true)) {
      return;
    }

    if (bitArrayNewValue.length !== bitArrayOldValue.length) {
      throw new Error(
        `For ${this.name} efuse, the length of the new value is wrong, expected ${
          bitArrayOldValue.length
        } bits, was ${bitArrayNewValue.length} bits.`
      );
    }

    if (bitArrayNewValue.equals(bitArrayOldValue)) {
      let error_msg = `\tThe same value for ${this.name} `;
      error_msg += "is already burned. Do not change the efuse.";
      this.parent.error(error_msg);
      bitArrayNewValue.setBits(0);
    } else if (bitArrayNewValue.equals(this.getBitstring(false))) {
      let error_msg = `\tThe same value for ${this.name} `;
      error_msg += "is already prepared for the burn operation.";
      this.parent.error(error_msg);
      bitArrayNewValue.setBits(0);
    } else {
      if (this.name !== "WR_DIS" && this.name !== "RD_DIS") {
        if (!bitArrayNewValue.or(bitArrayOldValue).equals(bitArrayNewValue)) {
          let error_msg = "\tNew value contains some bits that cannot be cleared ";
          error_msg += `(value will be ${bitArrayOldValue.or(bitArrayNewValue)})`;
          this.parent.printErrorMsg(error_msg);
        }
      }
      this.checkWrRdProtect();
    }
  }

  saveToBlock(bitarrayField: BitArrayPy): void {
    const block = this.parent.blocks[this.block];
    const wrBitarrayTemp = BitArrayPy.from(Object.values(block.wrBitarray));
    const position = wrBitarrayTemp.length - (
                            this.word! * 32 + this.pos! + bitarrayField.length);
    wrBitarrayTemp.overwrite(bitarrayField, position);
    block.wrBitarray.overwrite(block.wrBitarray.or(wrBitarrayTemp), 0);
  }

  save(newValue: any): void {
    const bitarrayField = this.convertToBitString(newValue);
    this.checkNewValue(bitarrayField);
    this.saveToBlock(bitarrayField);
  }

  update(bitArrayBlock: any): void {
    if (this.isFieldCalculated()) {
      this.bitarray.overwrite(
        this.convertToBitString(this.checkFormat(this.get())),
        0
      );
      return;
    }
    const fieldLen = this.bitarray.length;
    bitArrayBlock.pos =
      bitArrayBlock.length - (this.word! * 32 + this.pos! + fieldLen);
    this.bitarray.overwrite(bitArrayBlock.read(fieldLen), 0);

    const errBitarray = this.parent.blocks[this.block].errBitarray;
    if (errBitarray) {
      errBitarray.pos =
        errBitarray.length - (this.word! * 32 + this.pos! + fieldLen);
      this.fail = !errBitarray.read(fieldLen).all(false);
    } else {
      this.fail = this.parent.blocks[this.block].fail;
      this.numErrors = this.parent.blocks[this.block].numErrors;
    }
  }

  getRaw(fromRead: boolean = true): any {
    return this.getBitstring(fromRead).read(this.efuseType);
  }

  get(fromRead: boolean = true): any {
    if (this.efuseType.startsWith("bytes")) {
      return hexify(this.getBitstring(fromRead).toString().split(' ').reverse()
                        .join(' '), ' ');
      //return hexify(
      //  this.getBitstring(fromRead).bytes.reverse(), " ");
    } else {
      return this.getRaw(fromRead);
    }
  }

  async getMeaning(fromRead: boolean = true): Promise<any> {
    if (this.dictValue) {
      try {
        return this.dictValue[await this.getRaw(fromRead)];
      } catch (error) {
        // Handle KeyError
      }
    }
    return this.get(fromRead);
  }

  getBitstring(fromRead: boolean = true): BitArrayPy {
    if (fromRead) {
      this.bitarray.pos = 0;
      return this.bitarray;
    } else {
      const fieldLen = this.bitarray.length;
      const block = this.parent.blocks[this.block];
      block.wrBitarray.pos =
        block.wrBitarray.length - (this.word! * 32 + this.pos! + fieldLen);
      return block.wrBitarray.read(this.bitarray.length);
    }
  }

  async burn(newValue: any): Promise<void> {
    this.save(newValue);
    await this.parent.burnAll();
  }

  getInfo(): string {
    let output = `${this.name} (BLOCK${this.block})`;
    if (this.block === 0) {
      if (this.fail) {
        output += "[error]";
      }
    } else {
      const [errs, fail] = this.parent.getBlockErrors(this.block);
      if (errs !== 0 || fail) {
        output += "[error]";
      }
    }
    if (this.efuseClass === "keyblock") {
      const name = this.parent.blocks[this.block].keyPurposeName;
      if (name) {
        output += `\n  Purpose: ${this.parent.getItem(name).get()}\n `;
      }
    }
    return output;
  }
}

export { EfuseProtectBase , EfuseBlockBase , EspEfusesBase , EfuseFieldBase,
  CheckArgValue };
