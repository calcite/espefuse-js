import { EfuseBlockBase , EspEfusesBase , EfuseFieldBase }
  from '../base_fields';
import { EfuseDefineRegisters, EfuseDefineBlocks, EfuseDefineFields }
  from './mem_definition';
import { BitArrayPy } from "../bit_ops";
import { parseBitNumStr, hexify } from '../utils';
import struct from 'python-struct';
import { rsEncodeMsg } from '../reed_solomon';
import { Buffer } from 'buffer';

class EfuseBlock extends EfuseBlockBase {
  lenOfBurnUnit(): number {
    // The writing register window is 8 registers for any blocks.
    // len in bytes
    return 8 * 4;
  }

  constructor(parent: any, param: any, skipRead: boolean = false) {
    parent.readCodingScheme();
    super(parent, param, skipRead);
  }

  async applyCodingScheme(): Promise<number[]> {
    // await is not needed in original py code
    let data : Uint8Array = (new Uint8Array(this.getRaw(false))).reverse();
    if (data.length < this.lenOfBurnUnit()) {
      const addEmptyBytes = this.lenOfBurnUnit() - data.length;
      const emptyBytes = new Uint8Array(addEmptyBytes);
      data = new Uint8Array([...data, ...emptyBytes]);
    }

    if (this.getCodingScheme() === this.parent.REGS.CODING_SCHEME_RS) {
      // takes 32 bytes
      // apply RS encoding
      // 32 bytes of data + 12 bytes RS
      const encodedData = rsEncodeMsg(Array.from(data), 12);

      const words = struct.unpack('<' + 'I'.repeat(11), Buffer.from(encodedData));
      // returns 11 words (8 words of data + 3 words of RS coding)
      return words;
    } else {
      // takes 32 bytes
      const words = struct.unpack('<' + 'I'.repeat(data.length / 4), Buffer.from(data));
      // returns 8 words
      return words;
    }
  }
}


class EspEfuses extends EspEfusesBase {
  debug: boolean = false;
  doNotConfirm: boolean = false;
  _esp: any; // Replace 'any' with the actual type of _esp

  //constructor(esp: any, skipConnect: boolean = false, debug: boolean = false, doNotConfirm: boolean = false, terminal = null, confirmFn = null) {
  constructor(options: { esp: any, skipConnect?: boolean, debug?: boolean,
    doNotConfirm?: boolean, terminal?: any, confirmFn?: any }) {
    const {
      esp,
      skipConnect = false,
      debug = false,
      doNotConfirm = false,
      terminal = null,
      confirmFn = null
    } = options;

    super();
    this.Blocks = new EfuseDefineBlocks();
    this.Fields = new EfuseDefineFields();
    this.REGS = EfuseDefineRegisters;
    this.BURN_BLOCK_DATA_NAMES = this.Blocks.getBurnBlockDataNames();
    //this.BLOCKS_FOR_KEYS = this.Blocks.getBlocksForKeys();
    this._esp = esp;
    this.debug = debug;
    this.doNotConfirm = doNotConfirm;
    this.skipConnect = skipConnect;
    this.terminal = terminal;
    this.confirmFn = confirmFn;

    if (esp.chip.CHIP_NAME !== 'ESP32-S3') {
      throw new Error(
        `Expected the 'esp' param for ESP32-S3 chip but got for '${esp.chip.CHIP_NAME}'.`
      );
    }

    // TODO
    //if (!skipConnect) {
    //  const flags = this._esp.getSecurityInfo().flags;
    //  const GET_SECURITY_INFO_FLAG_SECURE_DOWNLOAD_ENABLE = 1 << 2;

    //  if (flags & GET_SECURITY_INFO_FLAG_SECURE_DOWNLOAD_ENABLE) {
    //    throw new Error(
    //      'Secure Download Mode is enabled. The tool cannot read eFuses.'
    //    );
    //  }
    //}
  }

  async setup(): Promise<void> {
    this.blocks = [];

    for (const block of this.Blocks.BLOCKS) {
      const efuseBlock = new EfuseBlock(this, EfuseDefineBlocks.get(block), this.skipConnect);
      this.blocks.push(efuseBlock);
      await efuseBlock.readReady;
    }

    if (!this.skipConnect) {
      await this.getCodingSchemeWarnings();
    }

    this.efuses = this.Fields.EFUSES.map((efuse) => EfuseField.convert(this, efuse));
    this.efuses.push(...this.Fields.KEYBLOCKS.map((efuse) => EfuseField.convert(this, efuse)));

    if (this.skipConnect) {
      this.efuses.push(...this.Fields.BLOCK2_CALIBRATION_EFUSES.map((efuse) => EfuseField.convert(this, efuse)));
    } else {
      if (await this.getItem('BLK_VERSION_MAJOR').get() === 1) {
        this.efuses.push(...this.Fields.BLOCK2_CALIBRATION_EFUSES.map((efuse) => EfuseField.convert(this, efuse)));
      }

      this.efuses.push(...this.Fields.CALC.map((efuse) => EfuseField.convert(this, efuse)));
    }
  }

  /**
   * Write to ESP Loader constructor's terminal with or without new line.
   * @param {string} str - String to write.
   * @param {boolean} withNewline - Add new line at the end ?
   */
  write(str: string, withNewline = true) {
    if (this.terminal) {
      if (withNewline) {
        this.terminal.writeLine(str);
      } else {
        this.terminal.write(str);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(str);
    }
  }

  /**
   * Write error message to ESP Loader constructor's terminal with or without new line.
   * @param {string} str - String to write.
   * @param {boolean} withNewline - Add new line at the end ?
   */
  error(str: string, withNewline = true) {
    this.write(`Error: ${str}`, withNewline);
  }

  /**
   * Write information message to ESP Loader constructor's terminal with or without new line.
   * @param {string} str - String to write.
   * @param {boolean} withNewline - Add new line at the end ?
   */
  info(str: string, withNewline = true) {
    //console.log((new Error()).stack);
    console.log(str);
    this.write(str, withNewline);
  }

  /**
   * Write debug message to ESP Loader constructor's terminal with or without new line.
   * @param {string} str - String to write.
   * @param {boolean} withNewline - Add new line at the end ?
   */
  //debug(str: string, withNewline = true) {
  //  if (this.debug) {
  //    this.write(`Debug: ${str}`, withNewline);
  //  }
  //}

  getItem(efuseName: string): EfuseField {
    for (const efuse of this.efuses) {
      if (efuseName === efuse.name || efuse.altNames.some((altName) => altName === efuseName)) {
        return efuse;
      }
    }

    let newFields = false;
    for (const efuse of this.Fields.BLOCK2_CALIBRATION_EFUSES) {
      if (efuseName === efuse.name || efuse.altNames.some((altName) => altName === efuseName)) {
        this.efuses.push(...this.Fields.BLOCK2_CALIBRATION_EFUSES.map((efuse) => EfuseField.convert(this, efuse)));
        newFields = true;
      }
    }

    if (newFields) {
      for (const efuse of this.efuses) {
        if (efuseName === efuse.name || efuse.altNames.some((altName) => altName === efuseName)) {
          return efuse;
        }
      }
    }

    throw new Error(`Invalid efuse name - ${efuseName}`);
  }

  readCodingScheme(): void {
    this.codingScheme = this.REGS.CODING_SCHEME_RS;
  }

  async printStatusRegs(): Promise<void> {
    this.info('');
    this.blocks[0].printBlock(this.blocks[0].errBitarray, 'err__regs', true);
    this.info(`${"EFUSE_RD_RS_ERR0_REG".padEnd(27)} 0x${
      hexify((await this.readReg(this.REGS.EFUSE_RD_RS_ERR0_REG))
                        .toString(), ' ').padStart(8, '0')}`);
    this.info(`${"EFUSE_RD_RS_ERR0_REG".padEnd(27)} 0x${
      hexify((await this.readReg(this.REGS.EFUSE_RD_RS_ERR1_REG))
                        .toString(), ' ').padStart(8, '0')}`);
  }

  async efuseControllerSetup(): Promise<void> {
    await this.setEfuseTiming();
    await this.clearPgmRegisters();
    await this.waitEfuseIdle();
  }

  async writeEfuses(block: number): Promise<boolean> {
    await this.efuseProgram(block);
    return await this.getCodingSchemeWarnings(true);
  }

  async clearPgmRegisters(): Promise<void> {
    await this.waitEfuseIdle();
    for (let r = this.REGS.EFUSE_PGM_DATA0_REG; r < this.REGS.EFUSE_PGM_DATA0_REG + 32; r += 4) {
      await this.writeReg(r, 0);
    }
  }

  async waitEfuseIdle(): Promise<void> {
    const deadline = (Date.now()/1000) + this.REGS.EFUSE_BURN_TIMEOUT;
    while ((Date.now()/1000) < deadline) {
      const cmds = this.REGS.EFUSE_PGM_CMD | this.REGS.EFUSE_READ_CMD;
      if ((await this.readReg(this.REGS.EFUSE_CMD_REG) & cmds) === 0) {
        if ((await this.readReg(this.REGS.EFUSE_CMD_REG) & cmds) === 0) {
          // Due to a hardware error, we have to read READ_CMD again
          // to make sure the efuse clock is normal.
          // For PGM_CMD it is not necessary.
          return;
        }
      }
    }
    throw new Error('Timed out waiting for Efuse controller command to complete');
  }

  async efuseProgram(block: number): Promise<void> {
    await this.waitEfuseIdle();
    await this.writeReg(this.REGS.EFUSE_CONF_REG, this.REGS.EFUSE_WRITE_OP_CODE);
    await this.writeReg(this.REGS.EFUSE_CMD_REG, this.REGS.EFUSE_PGM_CMD | (block << 2));
    await this.waitEfuseIdle();
    await this.clearPgmRegisters();
    await this.efuseRead();
  }

  async efuseRead(): Promise<void> {
    await this.waitEfuseIdle();
    await this.writeReg(this.REGS.EFUSE_CONF_REG, this.REGS.EFUSE_READ_OP_CODE);
    // need to add a delay after triggering EFUSE_READ_CMD, as ROM loader checks some
    // efuse registers after each command is completed
    // if ENABLE_SECURITY_DOWNLOAD or DIS_DOWNLOAD_MODE is enabled by the current cmd, then we need to try to reconnect to the chip.
    try {
      await this.writeReg(this.REGS.EFUSE_CMD_REG, this.REGS.EFUSE_READ_CMD, 0xFFFFFFFF, 0, 0);
      await this.waitEfuseIdle();
    } catch (fatalError) {
      this.info(`FATAL! ${fatalError}`);
      const secureDownloadModeBefore = this._esp.secureDownloadMode;

      try {
        this._esp = await this.reconnectChip(this._esp);
      } catch (fatalError) {
        this.info('Can not re-connect to the chip');
        this.info(`${this.getItem('DIS_DOWNLOAD_MODE')} ` +
          `${this.getItem('DIS_DOWNLOAD_MODE').get()}` +
          this.getItem('DIS_DOWNLOAD_MODE').get(false));
        if (!this.getItem('DIS_DOWNLOAD_MODE').get() && this.getItem('DIS_DOWNLOAD_MODE').get(false)) {
          this.info('This is the correct behavior as we are actually burning DIS_DOWNLOAD_MODE which disables the connection to the chip');
          this.info('DIS_DOWNLOAD_MODE is enabled');
          this.info('Successful');
          return; // finish without errors
        }
        throw fatalError;
      }

      this.info('Established a connection with the chip');
      if (this._esp.secureDownloadMode && !secureDownloadModeBefore) {
        this.info('Secure download mode is enabled');
        if (!this.getItem('ENABLE_SECURITY_DOWNLOAD').get() && this.getItem('ENABLE_SECURITY_DOWNLOAD').get(false)) {
          this.info('espefuse tool cannot continue to work in Secure download mode');
          this.info('ENABLE_SECURITY_DOWNLOAD is enabled');
          this.info('Successful');
          return; // finish without errors
        }
      }
      throw fatalError;
    }
  }

  async setEfuseTiming(): Promise<void> {
    // Set timing registers for burning efuses
    const apbFreq = await this.getCrystalFreq();
    if (apbFreq !== 40) {
      throw new Error(`The eFuse supports only xtal=40M (xtal was ${apbFreq})`);
    }

    await this.updateReg(this.REGS.EFUSE_DAC_CONF_REG, this.REGS.EFUSE_DAC_NUM_M, 0xFF);
    await this.updateReg(this.REGS.EFUSE_DAC_CONF_REG, this.REGS.EFUSE_DAC_CLK_DIV_M, 0x28);
    await this.updateReg(this.REGS.EFUSE_WR_TIM_CONF1_REG, this.REGS.EFUSE_PWR_ON_NUM_M, 0x3000);
    await this.updateReg(this.REGS.EFUSE_WR_TIM_CONF2_REG, this.REGS.EFUSE_PWR_OFF_NUM_M, 0x190);
  }

  async getCodingSchemeWarnings(silent: boolean = false): Promise<boolean> {
    // Check if the coding scheme has detected any errors.
    let oldAddrReg = 0;
    let regValue = 0;
    let retFail = false;

    for (const block of this.blocks) {
      if (block.id === 0) {
        const words: any[] = [];
        for (let offs = 0; offs < 5; offs++) {
          const word = await this.readReg(this.REGS.EFUSE_RD_REPEAT_ERR0_REG + offs * 4);
          words.push(word);
        }

        block.errBitarray.pos = 0;
        for (const word of words.reverse()) {
          block.errBitarray.overwrite(BitArrayPy.from(parseBitNumStr(`uint:32=${word}`)));
        }

        block.numErrors = Object.values(block.errBitarray)
                                .filter(x => x == '1').length;
        block.fail = block.numErrors !== 0;
      } else {
        const [addrReg, errNumMask, errNumOffs, failBit] = this.REGS.BLOCK_ERRORS[block.id] || [];
        if (errNumMask === undefined || errNumOffs === undefined || failBit === undefined) {
          continue;
        }

        if (addrReg !== oldAddrReg) {
          oldAddrReg = addrReg;
          regValue = await this.readReg(addrReg);
        }

        block.fail = (regValue & (1 << failBit)) !== 0;
        block.numErrors = (regValue >> errNumOffs) & errNumMask;
      }

      retFail ||= block.fail;

      if (!silent && (block.fail || block.numErrors)) {
        this.info(`Error(s) in BLOCK${block.id} [ERRORS:${block.numErrors} FAIL:${block.fail}]`);
      }
    }

    if ((this.debug || retFail) && !silent) {
      await this.printStatusRegs();
    }

    return retFail;
  }

  summary(): string {
    if (this.getItem('VDD_SPI_FORCE').get() === 0) {
      let output = "Flash voltage (VDD_SPI) determined by GPIO45 on reset ";
      output += "(GPIO45=High: VDD_SPI pin is powered from internal 1.8V LDO\n";
      output += "GPIO45=Low or NC: VDD_SPI pin is powered directly from ";
      output += "VDD3P3_RTC_IO via resistor Rspi. ";
      output += "Typically this voltage is 3.3 V).";
      return output;
    } else if (this.getItem('VDD_SPI_XPD').get() === 0) {
      return "Flash voltage (VDD_SPI) internal regulator disabled by efuse.";
    } else if (this.getItem('VDD_SPI_TIEH').get() === 0) {
      return "Flash voltage (VDD_SPI) set to 1.8V by efuse.";
    } else {
      return "Flash voltage (VDD_SPI) set to 3.3V by efuse.";
    }
  }
}

class EfuseField extends EfuseFieldBase {
  static convert(parent: any, efuse: any): EfuseFieldBase {
    const efuseClassMap: Record<string, new (parent: any, param: any) => EfuseFieldBase> = {
      "mac": EfuseMacField,
      "keypurpose": EfuseKeyPurposeField,
      "t_sensor": EfuseTempSensor,
      "adc_tp": EfuseAdcPointCalibration,
      "wafer": EfuseWafer,
    };

    const EfuseClass = efuseClassMap[efuse.classType] || EfuseField;
    return new EfuseClass(parent, efuse);
  }
}

class EfuseWafer extends EfuseField {
  get(fromRead: boolean = true): number {
    const hiBits = this.parent.getItem("WAFER_VERSION_MINOR_HI").get(fromRead);
    if (this.parent.getItem("WAFER_VERSION_MINOR_HI").bitLen != 1)
      throw Error('WAFER_VERSION_MINOR_HI is not 1');
    const loBits = this.parent.getItem("WAFER_VERSION_MINOR_LO").get(fromRead);
    if (this.parent.getItem("WAFER_VERSION_MINOR_LO").bitLen != 3)
      throw Error('WAFER_VERSION_MINOR_LO is not 3');
    return (hiBits << 3) + loBits;
  }

  save(new_value: any): void {
    throw new Error(`Burning ${this.name} is not supported`);
  }
}

class EfuseTempSensor extends EfuseField {
  get(fromRead: boolean = true): number {
    const value = this.getBitstring(fromRead);
    const sig = value[0] ? -1 : 1;
    const uint = parseInt(Object.values(value).slice(1).join(''), 2);
    return sig * uint * 0.1;
  }
}

class EfuseAdcPointCalibration extends EfuseField {
  get(fromRead: boolean = true): number {
    const STEP_SIZE = 4;
    const value = this.getBitstring(fromRead);
    const sig = value[0] ? -1 : 1;
    const uint = parseInt(Object.values(value).slice(1).join(''), 2);
    return sig * uint * STEP_SIZE;
  }
}

class EfuseMacField extends EfuseField {
  checkFormat(new_value_str: string | null): Uint8Array {
    if (new_value_str === null) {
      throw new Error("Required MAC Address in AA:CD:EF:01:02:03 format!");
    }
    if (!new_value_str.split || new_value_str.split(":").length !== 6) {
      throw new Error(
        "MAC Address needs to be a 6-byte hexadecimal format separated by colons (:)!"
      );
    }
    const hexad = new_value_str.replace(/:/g, "");
    if (hexad.length !== 12) {
      throw new Error(
        "MAC Address needs to be a 6-byte hexadecimal number (12 hexadecimal characters)!"
      );
    }
    // order of Uint8Array = [0xaa, 0xcd, 0xef, 0x01, 0x02, 0x03]
    const bindata = new Uint8Array(hexad.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    // unicast address check according to
    // https://tools.ietf.org/html/rfc7042#section-2.1
    if (bindata[0] & 0x01) {
      throw new Error("Custom MAC must be a unicast MAC!");
    }
    return bindata;
  }

  check(): string {
    const [errs, fail] = this.parent.getBlockErrors(this.block);
    if (errs !== 0 || fail) {
      return `Block${this.block} has ERRORS:${errs} FAIL:${fail}`;
    } else {
      return "OK";
    }
  }

  get(fromRead: boolean = true): string {
    const mac = this.name === "CUSTOM_MAC" ?
      this.getRaw(fromRead).toString().split(' ').join(':')
      :
      this.getRaw(fromRead).toString().split(' ').join(':');
    return `${hexify(mac, ":")} ${this.check()}`;
  }

  save(new_value: any): void {
    const printField = (e: EfuseMacField, newValue: any): void => {
      this.parent.info(
        `    - '${e.name}' (${e.description}) ${e.getBitstring()} -> ${newValue}`
      );
    };

    if (this.name === "CUSTOM_MAC") {
      const bitarrayMac = this.convertToBitString(new_value);
      printField(this, bitarrayMac);
      super.save(new_value);
    } else {
      // Writing the BLOCK1 (MAC_SPI_8M_0) default MAC is not sensible,
      // as it's written in the factory.
      throw new Error("Writing Factory MAC address is not supported");
    }
  }
}

class EfuseKeyPurposeField extends EfuseField {
  static KEY_PURPOSES: [string, number, string | null, string | null, string][]
    = [
    ["USER", 0, null, null, "no_need_rd_protect"],                        // User purposes (software-only use)
    ["RESERVED", 1, null, null, "no_need_rd_protect"],                    // Reserved
    ["XTS_AES_256_KEY_1", 2, null, "Reverse", "need_rd_protect"],        // XTS_AES_256_KEY_1 (flash/PSRAM encryption)
    ["XTS_AES_256_KEY_2", 3, null, "Reverse", "need_rd_protect"],        // XTS_AES_256_KEY_2 (flash/PSRAM encryption)
    ["XTS_AES_128_KEY", 4, null, "Reverse", "need_rd_protect"],          // XTS_AES_128_KEY (flash/PSRAM encryption)
    ["HMAC_DOWN_ALL", 5, null, null, "need_rd_protect"],                 // HMAC Downstream mode
    ["HMAC_DOWN_JTAG", 6, null, null, "need_rd_protect"],                // JTAG soft enable key (uses HMAC Downstream mode)
    ["HMAC_DOWN_DIGITAL_SIGNATURE", 7, null, null, "need_rd_protect"],   // Digital Signature peripheral key (uses HMAC Downstream mode)
    ["HMAC_UP", 8, null, null, "need_rd_protect"],                       // HMAC Upstream mode
    ["SECURE_BOOT_DIGEST0", 9, "DIGEST", null, "no_need_rd_protect"],    // SECURE_BOOT_DIGEST0 (Secure Boot key digest)
    ["SECURE_BOOT_DIGEST1", 10, "DIGEST", null, "no_need_rd_protect"],   // SECURE_BOOT_DIGEST1 (Secure Boot key digest)
    ["SECURE_BOOT_DIGEST2", 11, "DIGEST", null, "no_need_rd_protect"],   // SECURE_BOOT_DIGEST2 (Secure Boot key digest)
    ["XTS_AES_256_KEY", -1, "VIRTUAL", null, "no_need_rd_protect"],      // Virtual purpose splits to XTS_AES_256_KEY_1 and XTS_AES_256_KEY_2
  ];

  static KEY_PURPOSES_NAME = EfuseKeyPurposeField.KEY_PURPOSES.map(name => name[0]);
  static DIGEST_KEY_PURPOSES = EfuseKeyPurposeField.KEY_PURPOSES.filter(name => name[2] === "DIGEST").map(name => name[0]);

  checkFormat(new_value_str: string): string {
    // str convert to int: "XTS_AES_128_KEY" - > str(4)
    // if int: 4 -> str(4)
    let raw_val = new_value_str;
    for (const purposeName of EfuseKeyPurposeField.KEY_PURPOSES) {
      if (purposeName[0] === new_value_str) {
        raw_val = purposeName[1].toString();
        break;
      }
    }
    if (/^\d+$/.test(raw_val)) {
      const numericValue = parseInt(raw_val, 10);
      const validValues = EfuseKeyPurposeField.KEY_PURPOSES.filter(p => p[1] > 0)
                                                           .map(p => p[1]);
      if (!validValues.includes(numericValue)) {
        throw new Error(`'${raw_val}' can not be set (value out of range)`);
      }
    } else {
      throw new Error(`'${raw_val}' unknown name`);
    }
    return raw_val;
  }

  needReverse(newKeyPurpose: string): boolean {
    for (const key of EfuseKeyPurposeField.KEY_PURPOSES) {
      if (key[0] === newKeyPurpose) {
        return key[3] === "Reverse";
      }
    }
    return false;
  }

  needRdProtect(newKeyPurpose: string): boolean {
    for (const key of EfuseKeyPurposeField.KEY_PURPOSES) {
      if (key[0] === newKeyPurpose) {
        return key[4] === "need_rd_protect";
      }
    }
    return false;
  }

  get(fromRead: boolean = true): string {
    for (const purpose of EfuseKeyPurposeField.KEY_PURPOSES) {
      if (purpose[1] === this.getRaw(fromRead)) {
        return purpose[0];
      }
    }
    return "FORBIDDEN_STATE";
  }

  getName(rawVal: string): string | null {
    for (const key of EfuseKeyPurposeField.KEY_PURPOSES) {
      if (key[1]!.toString() === rawVal) {
        return key[0];
      }
    }
    return null;
  }

  save(new_value: any): void {
    const rawVal = parseInt(this.checkFormat(new_value.toString()), 10);
    const strNewValue = this.getName(rawVal.toString());
    if (this.name === "KEY_PURPOSE_5" && strNewValue?.startsWith("XTS_AES")) {
      throw new Error(`${this.name} can not have ${strNewValue} key due to a hardware bug (please see TRM for more details)`);
    }
    super.save(rawVal);
  }
}

export { EfuseKeyPurposeField, EfuseMacField, EfuseAdcPointCalibration,
  EfuseTempSensor, EfuseWafer, EfuseField, EspEfuses, EfuseBlock };
