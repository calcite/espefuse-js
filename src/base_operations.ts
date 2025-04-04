import { BitArrayPy } from "./bit_ops";
import { hexify, checkDuplicateNameInList } from './utils';
import { CheckArgValue } from './base_fields';

export async function summary(esp: any, efuses: any, args: any): Promise<void> {
  //"""Print a human-readable summary of efuse contents"""
  const humanOutput = args.format === "summary";
  const jsonEfuse: any = {};

  //if (args.file !== process.stdout) {
  //  console.log("Saving efuse values to " + args.file.name);
  //}

  if (humanOutput) {
    efuses.info(
        "EFUSE_NAME (Block)".padEnd(12, ' ') +
        "Description".padEnd(12, ' ') +
        " " +
        "[Meaningful Value] " +
        "[Readable/Writeable] " +
        "(Hex Value)"
      );
    efuses.info("-".repeat(88));
  }

  for (const category of Array.from(new Set(
                                    efuses.efuses.map((e: any) => e.category)))
                              .sort((a: any, b: any) => a.localeCompare(b))) {
    if (humanOutput) {
      efuses.info(`${category} fuses:`);
    }

    for (const e of efuses.efuses.filter((e: any) => e.category === category)) {
      let raw = "";
      if (e.efuseType.startsWith("bytes")) {
        raw = "";
      } else {
        raw = `(${e.getBitstring()})`;
      }

      const [readable, writeable] = [e.isReadable(), e.isWriteable()];
      let perms = "";
      if (readable && writeable) {
        perms = "R/W";
      } else if (readable) {
        perms = "R/-";
      } else if (writeable) {
        perms = "-/W";
      } else {
        perms = "-/-";
      }

      const baseValue = await e.getMeaning();
      let value = baseValue.toString();

      if (!readable) {
        const countReadDisableBits = e.getCountReadDisableBits();
        if (countReadDisableBits === 2) {
          const v = [value.slice(0, value.length / 2), value.slice(value.length / 2)];
          for (let i = 0; i < countReadDisableBits; i++) {
            if (!e.isReadable(i)) {
              v[i] = v[i].replace("0", "?");
            }
          }
          value = v.join("");
        } else {
          value = value.replace("0", "?");
        }
      }

      if (humanOutput) {
        efuses.info(
          e.getInfo().padEnd(51) +
          e.description.slice(0, 50).padEnd(51) +
          "\n  ".repeat(value.length >= 20 ? 1 : 0) +
          ' = ' +
          `${value} ` +
          `${perms} ` +
          `${raw}`
        );
        const descLen = e.description.slice(50).length;
        if (descLen) {
          for (let i = 50; i < descLen + 50; i += 50) {
            efuses.info(
              "".padEnd(51) +
              e.description.slice(i, 50 + i).padEnd(51)
            );
          }
        }
      }

      if (args.format === "json") {
        jsonEfuse[e.name] = {
          "name": e.name,
          "value": readable ? baseValue : value,
          "readable": readable,
          "writeable": writeable,
          "description": e.description,
          "category": e.category,
          "block": e.block,
          "word": e.word,
          "pos": e.pos,
          "efuse_type": e.efuseType,
          "bit_len": e.bitLen,
        };
      }
    }

    if (humanOutput) {
      efuses.info("");
    }
  }

  if (humanOutput) {
    efuses.info(efuses.summary());
    const warnings = await efuses.getCodingSchemeWarnings();
    if (warnings) {
      efuses.info("WARNING: Coding scheme has encoding bit error warnings");
    }

    //if (args.file !== process.stdout) {
    //  args.file.close();
    //  console.log("Done");
    //}
  }

  if (args.format === "json") {
    //fs.writeFileSync(args.file, JSON.stringify(jsonEfuse, null, 4));
    //console.log("");
    efuses.info(JSON.stringify(jsonEfuse, null, 4));
  }
}

export async function burnBit(esp: any, efuses: any, args: any): Promise<void> {
  efuses.forceWriteAlways = args.forceWriteAlways;
  const numBlock = efuses.getIndexBlockByName(args.block);
  const block = efuses.blocks[numBlock];
  const dataBlock = new BitArrayPy(block.getBlockLen() * 8);
  try {
    dataBlock[dataBlock.length - 1 - args.bitNumber] = 1;
  } catch (error) {
    throw new Error(`${args.block} has bitNumber in [0..${dataBlock.length - 1}]`);
  }
  //dataBlock.reverse();
  efuses.info(`bitNumber:   [${dataBlock.length - 1}]........................................................[0]`);
  efuses.info(`BLOCK${block.id}   : ` +
              '0x' + hexify(dataBlock.toString(), ' ').replace(/ /g, ''));
  block.printBlock(dataBlock, "regsToWrite", true);
  const burnArr = dataBlock.toString().split(' ')
                                      .map(x => parseInt(x, 2)).reverse()
  block.save(burnArr);

  if (!(await efuses.burnAll(true))) {
    return;
  }
  efuses.info("Successful");
}

export async function readEfuse(esp: any, efuses: any, args: any): Promise<any> {
  const burnEfusesList = args.efuses.map(name => efuses.getItem(name));

  const res = {};
  for (let i = 0; i < burnEfusesList.length; i++) {
    const efuse = burnEfusesList[i];
    if (!efuse.isReadable()) {
      res[efuse.name] = null;
      efuses.info( `Efuse ${efuse.name} is read-protected.` +
        `Read back the burn value is not possible.`);
    } else {
      const burnedValue = efuse.getBitstring();
      efuses.info(`${efuse.name} ${hexify(burnedValue.toString(), ' ')}`);
      res[efuse.name] = efuse.getBitstring();
    }
  }
  return res;
}

export async function burnEfuse(esp: any, efuses: any, args: any): Promise<void> {
  function printAttention(blockedEfusesAfterBurn: string[]): void {
    if (blockedEfusesAfterBurn.length) {
      efuses.info(
        "    ATTENTION! This BLOCK uses NOT the NONE coding scheme " +
        "and after 'BURN', these efuses can not be burned in the future:"
      );
      for (let i = 0; i < blockedEfusesAfterBurn.length; i += 5) {
        efuses.info(
          "              ",
          blockedEfusesAfterBurn.slice(i, i + 5).join('')
        );
      }
    }
  }

  const efuseNameList = Object.keys(args.nameValuePairs);
  const burnEfusesList = efuseNameList.map(name => efuses.getItem(name));
  //const oldValueList = burnEfusesList.map(efuse => efuse.getRaw());
  const newValueList: any[] = Object.values(args.nameValuePairs);
  checkDuplicateNameInList(efuseNameList);

  // Preprocess efuse values (MAC string to bytes, ..)
  // In python tool, this action is performed during argparse.
  // TODO move this somewhere else ?
  for (let i = 0; i < burnEfusesList.length; i++) {
    const efuse = burnEfusesList[i];
    const newValue: any = newValueList[i];
    newValueList[i] = new CheckArgValue(efuses, efuse.name).call(newValue)
  }

  let attention = "";
  efuses.info("The efuses to burn:");
  for (const block of efuses.blocks) {
    const burnListABlock = burnEfusesList.filter(e => e.block === block.id);
    if (burnListABlock.length) {
      efuses.info(`  from BLOCK${block.id}`);
      for (const field of burnListABlock) {
        efuses.info(`     - ${field.name}`);
        if (efuses.blocks[field.block].getCodingScheme() !== efuses.REGS.CODING_SCHEME_NONE) {
          const usingTheSameBlockNames = efuses.efuses.filter(e => e.block === field.block).map(e => e.name);
          const wrNames = burnListABlock.map(e => e.name);
          const blockedEfusesAfterBurn = usingTheSameBlockNames.filter(name => !wrNames.includes(name));
          attention = " (see 'ATTENTION!' above)";
          printAttention(blockedEfusesAfterBurn);
        }
      }
    }
  }

  efuses.info(`\nBurning efuses${attention}:`);
  for (let i = 0; i < burnEfusesList.length; i++) {
    const efuse = burnEfusesList[i];
    const newValue = newValueList[i];
    efuses.info(
      `\n    - '${efuse.name}' (${efuse.description}) ` +
      `${hexify(efuse.getBitstring().toString(), ' ')} -> ` +
      `${hexify(efuse.convertToBitString(newValue).toString(), ' ')}`
    );
    efuse.save(newValue);
  }

  efuses.info("\n");
  if (efuseNameList.includes("ENABLE_SECURITY_DOWNLOAD")) {
    efuses.info(
      "ENABLE_SECURITY_DOWNLOAD -> 1: eFuses will not be read back " +
      "for confirmation because this mode disables " +
      "any SRAM and register operations."
    );
    efuses.info("                               espefuse will not work.");
    efuses.info("                               esptool can read/write only flash.");
  }

  if (efuseNameList.includes("DIS_DOWNLOAD_MODE")) {
    efuses.info(
      "DIS_DOWNLOAD_MODE -> 1: eFuses will not be read back for " +
      "confirmation because this mode disables any communication with the chip."
    );
    efuses.info(
      "                        espefuse/esptool will not work because " +
      "they will not be able to connect to the chip."
    );
  }

  if (
    esp.chip.CHIP_NAME === "ESP32" &&
    esp.getChipRevision() >= 300 &&
    efuseNameList.includes("UART_DOWNLOAD_DIS")
  ) {
    efuses.info(
      "UART_DOWNLOAD_DIS -> 1: eFuses will be read for confirmation, " +
      "but after that connection to the chip will become impossible."
    );
    efuses.info("                        espefuse/esptool will not work.");
  }

  if (!(await efuses.burnAll({ checkBatchMode: true }))) {
    return;
  }

  efuses.info("Checking efuses...");
  let raiseError = false;
  for (let i = 0; i < burnEfusesList.length; i++) {
    const efuse = burnEfusesList[i];
    const newValue = newValueList[i];
    if (!efuse.isReadable()) {
      efuses.info(
        `Efuse ${efuse.name} is read-protected. Read back the burn value is not possible.`
      );
    } else {
      const newBitString = efuse.convertToBitString(newValue);
      const burnedValue = efuse.getBitstring();
      if (!burnedValue.equals(newBitString)) {
        efuses.info(
          `${burnedValue} -> ${newBitString} ` +
          `Efuse ${efuse.name} failed to burn. Protected?`
        );
        raiseError = true;
      }
    }
  }
  if (raiseError) {
    throw Error("The burn was not successful.");
  } else {
    efuses.info("Successful");
  }
}

export async function writeProtectEfuse(esp: any, efuses: any, args: any): Promise<void>
{
  checkDuplicateNameInList(args.efuseName);

  for (const efuseName of args.efuseName) {
    const efuse = efuses.getItem(efuseName);

    if (!efuse.isWriteable()) {
      efuses.info(`Efuse ${efuse.name} is already write protected`);
    } else {
      // make full list of which efuses will be disabled
      // (ie share a write disable bit)
      const allDisabling = efuses.efuses.filter(
        (e: any) => e.writeDisableBit === efuse.writeDisableBit);
      const names = allDisabling.map((e: any) => e.name).join(", ");

      efuses.info(`writing ${efuseName}`);
      efuses.info(
        `Permanently write-disabling efuse${
          allDisabling.length > 1 ?  "s" : ""} ${names}`);

      efuse.disableWrite();
    }
  }

  if (!(await efuses.burnAll(true))) {
    return;
  }

  efuses.info("Checking efuses...");
  let raiseError = false;

  for (const efuseName of args.efuseName) {
    const efuse = efuses.getItem(efuseName);

    if (efuse.isWriteable()) {
      efuses.info(`Efuse ${efuse.name} is not write-protected.`);
      raiseError = true;
    }
  }

  if (raiseError) {
    throw new Error("The burn was not successful.");
  } else {
    efuses.info("Successful");
  }
}
