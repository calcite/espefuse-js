TS port of espefuses tool. Only the esp32s3 variant is supported.

EspEfuses settings:

 - esp: esptool-js instance
 - skipConnect: `boolean = false` (assume esptool-js instance is connected if `true`)
 - debug: `boolean = false`
 - doNotConfirm: `boolean = false` (not-confirm burn op?)
 - terminal = `null`; same as in esptool-js
 - confirmFn = `null`; Confirmation function. Return `true` to confirm or raise Error to deny. 

### operations

List of implemented operations:

 - summary `async function summary(esp: any, efuses: any, args: any): Promise<void>`

    args: `{format: "summary"}` for human readable format

 - burnBit `async function burnBit(esp: any, efuses: any, args: any): Promise<void>`

    args:
    ```
    block: blockName, - Efuse block to burn [string - BLOCK0,BLOCK1,BLOCK2,BLOCK3]
    bitNumber: bitNum - Bit number in the efuse block [0..BLK_LEN-1]
    ```

 - burnEfuse

    args:
    ```
    nameValuePairs: [{[efuseName]: efuseValue}, ...]
    ```

 - readEfuse
 - writeProtectEfuse
 - burnKey

 Operations can be emulated for debugging purposes.