import { EfuseBlocksBase, EfuseFieldsBase, EfuseRegistersBase, Field }
  from './mem_definition_base';
import efuseDefs from './efuse_defs';


class EfuseDefineRegisters extends EfuseRegistersBase {
  // EFUSE registers & command/conf values
  static readonly EFUSE_ADDR_MASK = 0x00000FFF;
  static readonly EFUSE_MEM_SIZE = 0x01FC + 4;

  static readonly DR_REG_EFUSE_BASE = 0x60007000;
  static readonly EFUSE_PGM_DATA0_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE;
  static readonly EFUSE_CHECK_VALUE0_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x020;
  static readonly EFUSE_CLK_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1C8;
  static readonly EFUSE_CONF_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1CC;
  static readonly EFUSE_STATUS_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1D0;
  static readonly EFUSE_CMD_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1D4;
  static readonly EFUSE_RD_RS_ERR0_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1C0;
  static readonly EFUSE_RD_RS_ERR1_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1C4;
  static readonly EFUSE_RD_REPEAT_ERR0_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x17C;
  static readonly EFUSE_RD_REPEAT_ERR1_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x180;
  static readonly EFUSE_RD_REPEAT_ERR2_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x184;
  static readonly EFUSE_RD_REPEAT_ERR3_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x188;
  static readonly EFUSE_RD_REPEAT_ERR4_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x18C;
  static readonly EFUSE_DAC_CONF_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1E8;
  static readonly EFUSE_RD_TIM_CONF_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1EC;
  static readonly EFUSE_WR_TIM_CONF1_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1F4;
  static readonly EFUSE_WR_TIM_CONF2_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1F8;
  static readonly EFUSE_DATE_REG = EfuseDefineRegisters.DR_REG_EFUSE_BASE + 0x1FC;
  static readonly EFUSE_WRITE_OP_CODE = 0x5A5A;
  static readonly EFUSE_READ_OP_CODE = 0x5AA5;
  static readonly EFUSE_PGM_CMD_MASK = 0x3;
  static readonly EFUSE_PGM_CMD = 0x2;
  static readonly EFUSE_READ_CMD = 0x1;

  static readonly BLOCK_ERRORS = [
    // error_reg,               err_num_mask, err_num_offs,     fail_bit
    [EfuseDefineRegisters.EFUSE_RD_REPEAT_ERR0_REG, null, null, null], // BLOCK0
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 0, 3], // MAC_SPI_8M_0
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 4, 7], // BLOCK_SYS_DATA
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 8, 11], // BLOCK_USR_DATA
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 12, 15], // BLOCK_KEY0
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 16, 19], // BLOCK_KEY1
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 20, 23], // BLOCK_KEY2
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 24, 27], // BLOCK_KEY3
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR0_REG, 0x7, 28, 31], // BLOCK_KEY4
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR1_REG, 0x7, 0, 3], // BLOCK_KEY5
    [EfuseDefineRegisters.EFUSE_RD_RS_ERR1_REG, 0x7, 4, 7], // BLOCK_SYS_DATA2
  ];

  // EFUSE_WR_TIM_CONF2_REG
  static readonly EFUSE_PWR_OFF_NUM_S = 0;
  static readonly EFUSE_PWR_OFF_NUM_M = 0xFFFF << EfuseDefineRegisters.EFUSE_PWR_OFF_NUM_S;

  // EFUSE_WR_TIM_CONF1_REG
  static readonly EFUSE_PWR_ON_NUM_S = 8;
  static readonly EFUSE_PWR_ON_NUM_M = 0x0000FFFF << EfuseDefineRegisters.EFUSE_PWR_ON_NUM_S;

  // EFUSE_DAC_CONF_REG
  static readonly EFUSE_DAC_CLK_DIV_S = 0;
  static readonly EFUSE_DAC_CLK_DIV_M = 0xFF << EfuseDefineRegisters.EFUSE_DAC_CLK_DIV_S;

  // EFUSE_DAC_CONF_REG
  static readonly EFUSE_DAC_NUM_S = 9;
  static readonly EFUSE_DAC_NUM_M = 0xFF << EfuseDefineRegisters.EFUSE_DAC_NUM_S;
}

class EfuseDefineBlocks extends EfuseBlocksBase {
  private static readonly __base_rd_regs = EfuseDefineRegisters.DR_REG_EFUSE_BASE;
  private static readonly __base_wr_regs = EfuseDefineRegisters.EFUSE_PGM_DATA0_REG;

  // List of efuse blocks
  readonly BLOCKS: any[] = [
    // Name,             Alias,       Index, Read address,                             Write address,                    Write protect bit, Read protect bit, Len, key_purpose
    ["BLOCK0",           [],          0,     EfuseDefineBlocks.__base_rd_regs + 0x02C, EfuseDefineBlocks.__base_wr_regs, null, null, 6, null],
    ["MAC_SPI_8M_0",     ["BLOCK1"],  1,     EfuseDefineBlocks.__base_rd_regs + 0x044, EfuseDefineBlocks.__base_wr_regs, 20,   null, 6, null],
    ["BLOCK_SYS_DATA",   ["BLOCK2"],  2,     EfuseDefineBlocks.__base_rd_regs + 0x05C, EfuseDefineBlocks.__base_wr_regs, 21,   null, 8, null],
    ["BLOCK_USR_DATA",   ["BLOCK3"],  3,     EfuseDefineBlocks.__base_rd_regs + 0x07C, EfuseDefineBlocks.__base_wr_regs, 22,   null, 8, null],
    ["BLOCK_KEY0",       ["BLOCK4"],  4,     EfuseDefineBlocks.__base_rd_regs + 0x09C, EfuseDefineBlocks.__base_wr_regs, 23,   0,    8, "KEY_PURPOSE_0"],
    ["BLOCK_KEY1",       ["BLOCK5"],  5,     EfuseDefineBlocks.__base_rd_regs + 0x0BC, EfuseDefineBlocks.__base_wr_regs, 24,   1,    8, "KEY_PURPOSE_1"],
    ["BLOCK_KEY2",       ["BLOCK6"],  6,     EfuseDefineBlocks.__base_rd_regs + 0x0DC, EfuseDefineBlocks.__base_wr_regs, 25,   2,    8, "KEY_PURPOSE_2"],
    ["BLOCK_KEY3",       ["BLOCK7"],  7,     EfuseDefineBlocks.__base_rd_regs + 0x0FC, EfuseDefineBlocks.__base_wr_regs, 26,   3,    8, "KEY_PURPOSE_3"],
    ["BLOCK_KEY4",       ["BLOCK8"],  8,     EfuseDefineBlocks.__base_rd_regs + 0x11C, EfuseDefineBlocks.__base_wr_regs, 27,   4,    8, "KEY_PURPOSE_4"],
    ["BLOCK_KEY5",       ["BLOCK9"],  9,     EfuseDefineBlocks.__base_rd_regs + 0x13C, EfuseDefineBlocks.__base_wr_regs, 28,   5,    8, "KEY_PURPOSE_5"],
    ["BLOCK_SYS_DATA2",  ["BLOCK10"], 10,    EfuseDefineBlocks.__base_rd_regs + 0x15C, EfuseDefineBlocks.__base_wr_regs, 29,   6,    8, null],
  ];

  getBurnBlockDataNames(): string[] {
    const listOfNames: string[] = [];
    for (const block of this.BLOCKS) {
      const blk = EfuseDefineBlocks.get(block);
      if (blk.name) {
        listOfNames.push(blk.name);
      }
      if (blk.alias) {
        for (const alias of blk.alias) {
          listOfNames.push(alias);
        }
      }
    }
    return listOfNames;
  }
}

class EfuseDefineFields extends EfuseFieldsBase {
  EFUSES: Field[] = [];
  KEYBLOCKS: Field[] = [];
  BLOCK2_CALIBRATION_EFUSES: Field[] = [];
  CALC: Field[] = [];

  constructor() {
    //const dirName = path.dirname(path.resolve(__dirname));
    //const fileName = path.join(dirName, 'efuse_defs', __filename.replace('.ts', '.yaml'));

    const eDesc = efuseDefs;
    //yaml.safeLoad(fs.readFileSync(fileName, 'utf8')) as any;

    super(eDesc);

    for (const efuse of this.ALL_EFUSES) {
      if (efuse.name === 'BLOCK_USR_DATA' ||
        efuse.name === 'BLOCK_KEY0' ||
        efuse.name === 'BLOCK_KEY1' ||
        efuse.name === 'BLOCK_KEY2' ||
        efuse.name === 'BLOCK_KEY3' ||
        efuse.name === 'BLOCK_KEY4' ||
        efuse.name === 'BLOCK_KEY5' ||
        efuse.name === 'BLOCK_SYS_DATA2') {
        if (efuse.name === 'BLOCK_USR_DATA') {
          efuse.bitLen = 256;
          efuse.type = 'bytes:32';
        }
        this.KEYBLOCKS.push(efuse);
      } else if (efuse.category === 'calibration') {
        this.BLOCK2_CALIBRATION_EFUSES.push(efuse);
      }
      else {
        this.EFUSES.push(efuse);
      }
    }

    const f = new Field();
    f.name = 'WAFER_VERSION_MINOR';
    f.block = 0;
    f.bitLen = 4;
    f.type = `uint:${f.bitLen}`;
    f.category = 'identity';
    f.classType = 'wafer';
    f.description = 'calc WAFER VERSION MINOR = WAFER_VERSION_MINOR_HI << 3 + WAFER_VERSION_MINOR_LO (read only)';
    this.CALC.push(f);

    this.ALL_EFUSES = [];
  }
}


export { EfuseDefineRegisters, EfuseDefineBlocks, EfuseDefineFields };
