## Javascript port of espefuses

**Only the esp32s3 variant is partially supported.**

No read/write file operation is implemented (burnKey input values, emulator output..).

---

`argparse` (parsing cmd line arguments) part of esptool is not implemented.

(Only burnEfuse operation is performing the ArgValue check - e.g. transform MAC address in string format to binary representation..)

---

#### usage

webpack example

```javascript
import { ESPLoader, LoaderOptions, Transport } from "esptool-js";
import { getEfuses, getEspEmulator } from "@0m/espefuse-js";

// same as term in esptool-js
const espLoaderTerminal = {  
   // xterm-js or any other output                                                  
   clean() {                                                                    
      terminal.clear();                                                  
   },                                                                           
   writeLine(data) {                                                            
      terminal.writeln(data);                                            
   },                                                                           
   write(data) {                                                                
      terminal.write(data);                                              
   },
};

const main = async () => {
   // esptool
   const dev = await this.getDevice();
   const transp = new Transport(dev, true);

   const loaderOptions: LoaderOptions = {                                     
            transport: transp,                                                  
            baudrate: 115200,                                                 
            terminal: espLoaderTerminal,                                        
            enableTracing: false,                                                    
         };
   const espLoader = new ESPLoader(loaderOptions);

   // espefuses
   const efuseOptions = {
            esp: espLoader,
            skipConnect: false,                                
            debug: true,
            doNotConfirm: true,
            terminal: this.espLoaderTerminal
         };

   const [efuses, operations] = getEfuses(efuseOptions);
   await efuses.setup();

   // print efuses summary
   await operations.summary(espLoader, efuses, {format: "summary"});
}

main.then(() => {});

```

#### EspEfuses settings:

 - esp: esptool-js instance
 - skipConnect: `boolean = false` (assume esptool-js instance is connected if `true`)
 - debug: `boolean = false`
 - doNotConfirm: `boolean = false` (not-confirm burn op?)
 - terminal = `null`; same as in esptool-js
 - confirmFn = `null`; Confirmation function. Return `true` to confirm or raise Error to deny. 

#### operations

List of implemented operations:

```
args used in all ops:
esp: ESPLoader insance
efuses: EspEfuses instance
```

---

 - **summary** `async function summary(esp: any, efuses: any, args: any): Promise<void>`

    args: `{format: "summary"}` for human readable format

 - **burnBit** `async function burnBit(esp: any, efuses: any, args: any): Promise<void>`

    
    ```
    args:
    block: blockName, - Efuse block to burn [string - BLOCK0,BLOCK1,BLOCK2,BLOCK3]
    bitNumber: bitNum - Bit number in the efuse block [0..BLK_LEN-1]
    ```

 - **burnEfuse** `async function burnEfuse(esp: any, efuses: any, args: any): Promise<void>`

    
    ```
    args:
    nameValuePairs: [{[efuseName]: efuseValue}, ...]
    ```

 - **readEfuse** `async function readEfuse(esp: any, efuses: any, args: any)`

   ```
   args:
   efuses: list of efuse names to read [efuseName, ..] 
   ```

   returns dict `{[efuseName]: value, ...}`

 - **writeProtectEfuse** `async function writeProtectEfuse(esp: any, efuses: any, args: any): Promise<void>`

   ```
   args:
   efuseName: list of efuse names to write protect [efuseName, ...]

   ```

 - **burnKey** `async function burnKey(esp: any, efuses: any, args: any, digest: any = null): Promise<void>`

   ```
   args:
   keypurpose: list of key purpose [TODO?: support "XTS_AES_256_KEY"]
   block: block name list
   keyfile: list of files to read block data from. (not supported, TODO?)
   forceWriteAlways: [boolean]
   noWriteProtect: [boolean]

   digest: list of data keys to burn
   ```

   If `keyfile` is not set, `digest` is used instead as source for data to burn.

   Number of items in `block`, `keypurpose`, and `keyfile` / `digest` must be the same.

Operations can be emulated for debugging purposes.
