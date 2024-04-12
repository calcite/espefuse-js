import { hexify, checkDuplicateNameInList } from '../utils';
export { summary , burnBit , readEfuse , burnEfuse , writeProtectEfuse }
  from "../base_operations";

export async function burnKey(esp: any, efuses: any, args: any,
                              digest: any = null): Promise<void> {
  // TODO enable XTS_AES_256_KEY
  let datafileList: any[];
  if (digest === null) {
    datafileList = args.keyfile.filter(name => name !== null);
  } else {
    datafileList = digest.filter(name => name !== null);
  }

  efuses.forceWriteAlways = args.forceWriteAlways;

  const blockNameList = args.block.filter(name => name !== null);
  const keyPurposeList = args.keypurpose.filter(name => name !== null);
  const writeProtect = !args.noWriteProtect;

  //if ("XTS_AES_256_KEY" in keyPurposeList) {
  //  split512BitKey(efuses, blockNameList, datafileList, keyPurposeList);
  //}

  checkDuplicateNameInList(blockNameList);

  if (blockNameList.length !== datafileList.length ||
      blockNameList.length !== keyPurposeList.length) {
    throw new Error(`The number of blocks (${blockNameList.length}), ` +
      `datafile (${datafileList.length}) and keypurpose ` +
      `(${keyPurposeList.length}) should be the same.`);
  }

  efuses.info("Burn keys to blocks:");
  for (let i = 0; i < blockNameList.length; i++) {
    const blockName = blockNameList[i];
    const datafile = datafileList[i];
    const keyPurpose = keyPurposeList[i];

    let efuse: any = null;
    for (const block of efuses.blocks) {
      if (blockName === block.name || block.alias.includes(blockName)) {
        efuse = efuses.getItem(block.name);
        break;
      }
    }
    if (efuse === null) {
      throw new Error(`Unknown block name - ${blockName}`);
    }

    const numBytes = efuse.bitLen / 8;
    const blockNum = efuses.getIndexBlockByName(blockName);
    const block = efuses.blocks[blockNum];

    let data;
    if (digest === null) {
      data = datafile.read();
    } else {
      data = datafile;
    }

    efuses.info(` - ${efuse.name}`);
    let reversMsg: any = null;
    if (efuses.getItem(block.keyPurposeName).needReverse(keyPurpose)) {
      reversMsg = "\tReversing byte order for AES-XTS hardware peripheral";
      data = data.reverse();
    }
    efuses.info(
      `-> [${args.showSensitiveInfo ?
              hexify(data, ' ') :
              Array(data.length).fill("??").join(" ")}]`
    );
    data = new Uint8Array(data);
    if (reversMsg) {
      efuses.info(reversMsg);
    }
    if (data.length !== numBytes) {
      throw new Error(`Incorrect key file size ${data.length}. ` +
        `Key file must be ${numBytes} bytes (${numBytes * 8} bits) ` +
        `of raw binary key data.`);
    }

    const keyPurposeObj = efuses.getItem(block.keyPurposeName);
    const readProtect =
      keyPurposeObj.needRdProtect(keyPurpose) && !args.noReadProtect;

    efuse.save(data);

    let disableWrProtectKeyPurpose = false;
    if (keyPurposeObj.get() !== keyPurpose) {
      if (keyPurposeObj.isWriteable()) {
        efuses.info(`\t'${block.keyPurposeName}': '${keyPurposeObj.get()}' ` +
                    `-> '${keyPurpose}'.`);
        keyPurposeObj.save(keyPurpose);
        disableWrProtectKeyPurpose = true;
      } else {
        throw new Error(
          `It is not possible to change '${block.keyPurposeName}' to ` +
          `'${keyPurpose}' because write protection bit is set.`);
      }
    } else {
      efuses.info(`\t'${block.keyPurposeName}' is already '${keyPurpose}'.`);
      if (keyPurposeObj.isWriteable()) {
        disableWrProtectKeyPurpose = true;
      }
    }

    if (disableWrProtectKeyPurpose) {
      efuses.info(`\tDisabling write to '${block.keyPurposeName}'.`);
      keyPurposeObj.disableWrite();
    }

    if (readProtect) {
      efuses.info("\tDisabling read to key block");
      efuse.disableRead();
    }

    if (writeProtect) {
      efuses.info("\tDisabling write to key block");
      efuse.disableWrite();
    }
    efuses.info("");
  }

  if (!writeProtect) {
    efuses.info("Keys will remain writeable (due to --no-write-protect)");
  }
  if (args.noReadProtect) {
    efuses.info("Keys will remain readable (due to --no-read-protect)");
  }

  if (!efuses.burnAll(true)) {
    return;
  }
  efuses.info("Successful");
}
