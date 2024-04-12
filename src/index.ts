export { EspEfuses } from "./esp32s3/fields";
export { summary, burnBit, burnEfuse, readEfuse, writeProtectEfuse } from "./base_operations";
export { burnKey } from "./esp32s3/operations";
export { EmulateEfuseController } from "./esp32s3/emulate_efuse_controller";

import * as esp32s3 from './esp32s3';

//const SUPPORTED_BURN_COMMANDS = [
//  "writeProtectEfuse",
//  "burnEfuse",
//  "burnBit",
//  "burnKey",
//  "burnKeyDigest",
//  "burnCustomMac",
//];
//
//const SUPPORTED_COMMANDS = [
//  "summary",
//  "dump",
//  "getCustomMac",
//  ...SUPPORTED_BURN_COMMANDS
//];

const SUPPORTED_CHIPS = {
  "esp32s3": {chipName: "ESP32-S3", efuseLib: esp32s3},
};

function getEfuses( options ): [any, any] {
  for (const name in SUPPORTED_CHIPS) {
    if (SUPPORTED_CHIPS[name].chipName === options.esp.CHIP_NAME) {
      const efuse = SUPPORTED_CHIPS[name].efuseLib;
      return [
        new efuse.EspEfuses(options),
        efuse.operations
      ];
    }
  }
  throw new Error(`get_efuses: Unsupported chip (${options.esp.CHIP_NAME})`);
}

function getEspEmulator(chipName="ESP32-S3"): any {
  for (const name in SUPPORTED_CHIPS) {
    if (SUPPORTED_CHIPS[name].chipName === chipName) {
      const efuse = SUPPORTED_CHIPS[name].efuseLib;
      return efuse.EmulateEfuseController;
    }
  }
  throw new Error(`get_efuses: Unsupported chip (${chipName})`);
}

export { getEfuses, getEspEmulator };
