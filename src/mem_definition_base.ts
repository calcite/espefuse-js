class EfuseRegistersBase {
  // Coding Scheme values
  static readonly CODING_SCHEME_NONE = 0;
  static readonly CODING_SCHEME_34 = 1;
  static readonly CODING_SCHEME_REPEAT = 2;
  static readonly CODING_SCHEME_NONE_RECOVERY = 3;
  static readonly CODING_SCHEME_RS = 4;

  static readonly EFUSE_BURN_TIMEOUT = 0.25; // seconds
}


class EfuseBlocksBase {
  BLOCKS: any[] | null = null;

  static NamedtupleBlock = class {
    constructor(
      public name: string | null,
      public alias: string[] | null,
      public id: number,
      public rdAddr: number,
      public wrAddr: number,
      public writeDisableBit: number,
      public readDisableBit: number,
      public len: number,
      public keyPurpose: number
    ) {}
  };

  static get(tupleBlock: [string | null, string[] | null, number, number,
                          number, number, number, number, number]): any {
    return new EfuseBlocksBase.NamedtupleBlock(...tupleBlock);
  }

  getBlocksForKeys(): string[] {
    const listOfNames: string[] = [];
    if (this.BLOCKS) {
      for (const block of this.BLOCKS) {
        const blk = EfuseBlocksBase.get(block);
        if (blk.id > 0) {
          if (blk.name) {
            listOfNames.push(blk.name);
          }
          if (blk.alias) {
            for (const alias of blk.alias) {
              listOfNames.push(alias);
            }
          }
        }
      }
    }
    return listOfNames;
  }
}

class Field {
  name: string = "";
  block: number = 0;
  word: any = null;
  pos: any = null;
  bitLen: number = 0;
  altNames: string[] = [];
  type: string = "";
  writeDisableBit: any = null;
  readDisableBit: any = null;
  category: string = "config";
  classType: string = "";
  description: string = "";
  dictionary: any = null;
}


class EfuseFieldsBase {
  ALL_EFUSES: Field[] = [];

  private setCategoryAndClassType(efuse: Field, name: string): void {
    const includes = (name: string, names: string[]): boolean =>
      names.some(word => name.includes(word));

    if (name.startsWith("SPI_PAD_CONFIG")) {
      efuse.category = "spi pad";
    } else if (name.includes("USB")) {
      efuse.category = "usb";
    } else if (name.includes("WDT")) {
      efuse.category = "wdt";
    } else if (name.includes("JTAG")) {
      efuse.category = "jtag";
    } else if (includes(name, ["FLASH", "FORCE_SEND_RESUME"])) {
      efuse.category = "flash";
    } else if (includes(name, ["VDD_SPI_", "XPD"])) {
      efuse.category = "vdd";
    } else if (name.includes("MAC")) {
      efuse.category = "MAC";
      if (["MAC", "CUSTOM_MAC", "MAC_EXT"].includes(name)) {
        efuse.classType = "mac";
      }
    } else if (
      includes(name, [
        "BLOCK_KEY0",
        "BLOCK_KEY1",
        "BLOCK_KEY2",
        "BLOCK_KEY3",
        "BLOCK_KEY4",
        "BLOCK_KEY5",
        "BLOCK1",
        "BLOCK2",
      ])
    ) {
      efuse.category = "security";
      efuse.classType = "keyblock";
    } else if (
      includes(name, [
        "KEY",
        "SECURE",
        "DOWNLOAD",
        "SPI_BOOT_CRYPT_CNT",
        "KEY_PURPOSE",
        "SECURE_VERSION",
        "DPA",
        "ECDSA",
        "FLASH_CRYPT_CNT",
        "ENCRYPT",
        "DECRYPT",
        "ABS_DONE",
      ])
    ) {
      efuse.category = "security";
      if (name.startsWith("KEY_PURPOSE")) {
        efuse.classType = "keypurpose";
      } else if (includes(name, ["FLASH_CRYPT_CNT", "SPI_BOOT_CRYPT_CNT", "SECURE_VERSION"])) {
        efuse.classType = "bitcount";
      }
    } else if (
      includes(name, ["VERSION", "WAFER", "_ID", "PKG", "PACKAGE", "REV"])
    ) {
      efuse.category = "identity";
      if (name === "OPTIONAL_UNIQUE_ID") {
        efuse.classType = "keyblock";
      }
    } else if (
      includes(name, ["ADC", "LDO", "DBIAS", "_HVT", "CALIB", "OCODE"])
    ) {
      efuse.category = "calibration";
      if (name === "ADC_VREF") {
        efuse.classType = "vref";
        return;
      }
      if (includes(name, ["ADC", "LDO", "DBIAS", "_HVT"])) {
        efuse.classType = "adc_tp";
      } else if (name === "TEMP_CALIB") {
        efuse.classType = "t_sensor";
      }
    }
  }

  constructor(e_desc: any) {
    for (const e_name in e_desc["EFUSES"]) {
      const data_dict = e_desc["EFUSES"][e_name];
      if (data_dict["show"] === "y") {
        const d = new Field();
        d.name = e_name;
        d.block = data_dict["blk"];
        d.word = data_dict["word"];
        d.pos = data_dict["pos"];
        d.bitLen = data_dict["len"];
        d.type = data_dict["type"];
        d.writeDisableBit = data_dict["wr_dis"];
        d.readDisableBit =
          typeof data_dict["rd_dis"] === "string"
            ? data_dict["rd_dis"].split(" ").map(x => parseInt(x, 10))
            : data_dict["rd_dis"];
        d.description = data_dict["desc"];
        d.altNames = data_dict["alt"] ? data_dict["alt"].split(" ") : [];
        d.dictionary =
          data_dict["dict"] !== "" ? data_dict["dict"] : null;
        this.setCategoryAndClassType(d, e_name);
        this.ALL_EFUSES.push(d);
      }
    }
  }
}

export { EfuseRegistersBase, EfuseBlocksBase, Field, EfuseFieldsBase };
