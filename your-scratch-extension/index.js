const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const TargetType = require('../../extension-support/target-type');
require('regenerator-runtime/runtime');

class Scratch3SamLabs {

    constructor (runtime) {
        this.runtime = runtime;
        this.device = null; // Store the BLE device
        this.characteristic = null;
        this.connectedDevices = [];
        // UUID for the LEGO Technic Hub service
        this.LEGO_SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
        // UUID for the characteristic to write commands
        this.LEGO_CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
    }

    getInfo () {
        return {
            id: 'samlabsExtension',
            name: 'SamLabs',
            color1: '#000099',
            color2: '#660066',
            
            blocks: [
                {
                    opcode: 'myFirstBlock',
                    blockType: BlockType.REPORTER,
                    text: 'My first block [MY_NUMBER] and [MY_STRING]',
                    terminal: false,
                    arguments: {
                        MY_NUMBER: {
                            defaultValue: 123,
                            type: ArgumentType.NUMBER
                        },
                        MY_STRING: {
                            defaultValue: 'hello',
                            type: ArgumentType.STRING
                        }
                    }
                },
                {
                    opcode: 'connectToBLE',
                    blockType: BlockType.COMMAND,
                    text: 'Connect to BLE device',
                    terminal: false,
                },
                {
                    opcode: 'setLEDColor',
                    blockType: BlockType.COMMAND,
                    text: 'Set Hub Led Color: R[red], G[green], B[blue]',
                    terminal: false,
                    arguments: {
                        red: {
                            defaultValue: 0,
                            type: ArgumentType.NUMBER
                        },
                        green: {
                            defaultValue: 0,
                            type: ArgumentType.NUMBER
                        },
                        blue: {
                            defaultValue: 0,
                            type: ArgumentType.NUMBER
                        }
                    }
                }
            ]
        };
    }

    myFirstBlock ({ MY_NUMBER, MY_STRING }) {
        return MY_STRING + ' : doubled would be ' + (MY_NUMBER * 2);
    }

    async connectToBLE() {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [this.LEGO_SERVICE_UUID] }]
            });
            this.device = device;

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(this.LEGO_SERVICE_UUID);
            const characteristic = await service.getCharacteristic(this.LEGO_CHARACTERISTIC_UUID);
            this.characteristic = characteristic;

            // Enable notifications
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', this.handleNotifications.bind(this));

            console.log('Connected to LEGO Technic Hub');
        } catch (error) {
            console.error('Connection failed', error);
        }
    }

    async setLEDColor (red, green, blue) {
        let port = this.getPortOfDeviceType(23);
        if (port == -1)
        {
            console.log("Hub led not found");
            return;
        }
        const setRGBmode = new Uint8Array([
            0x41, port, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00
        ]);
        const setColor = new Uint8Array([
            0x81, port, 0x11, 0x51,  0x01, red, green, blue // RGB values
        ]);
    
        try {
            await this.writeMessage(setRGBmode);
            await this.writeMessage(setColor);
            console.log('LED color set');
        } catch (error) {
            console.error('Failed to set LED color', error);
        }
    }

    async writeMessage(msg)
    {
        const message = new Uint8Array([msg.length + 2, 0, ...msg]);
        await this.characteristic.writeValue(message);
    }

    handleNotifications(event) {
        const value = event.target.value;
        let receivedData = [];
        for (let i = 0; i < value.byteLength; i++) {
            receivedData.push(value.getUint8(i));
        }
        console.log('Received notification:', receivedData);
        if (receivedData[2] == 4)
        {
            //HUB attached/detached IO
            const port = receivedData[3];

            if (receivedData[4] != 0)
            {
                this.registerPortDevice(port, receivedData[5]);
            }
            else
            {
                this.deregisterPortDevice(port);
            }
        }
    }

    registerPortDevice(port, deviceType)
    {
        let device = { port: port, type: deviceType};
        console.log("Register device:");
        console.log(device);
        this.connectedDevices.push(device);
    }

    deregisterPortDevice(port)
    {
        for (var i = 0; i < this.connectedDevices.length; i++)
        {
            if (this.connectedDevices[i].port == port)
            {
                console.log("deregister device:");
                console.log(this.connectedDevices[i]);
                this.connectedDevices.splice(i, 1);
                break;
            }
        }
    }

    getPortOfDeviceType(type)
    {
        console.log("finding device type: " + type);
        console.log(this.connectedDevices);
        for (var i = 0; i < this.connectedDevices.length; i++)
        {
            if (this.connectedDevices[i].type == type)
            {
                console.log("device:");
                console.log(this.connectedDevices[i]);
                return this.connectedDevices[i].port;
            }
        }
        return -1;
    }
}

module.exports = Scratch3SamLabs;