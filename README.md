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

 - summary
 - burnBit
 - burnEfuse
 - readEfuse
 - writeProtectEfuse
 - burnKey

 Operations can be emulated for debugging purposes.