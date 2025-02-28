const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const TargetType = require('../../extension-support/target-type');
require('regenerator-runtime/runtime');

class Scratch3SamLabs {

    constructor (runtime) {
        this.runtime = runtime;
        this.deviceMap = new Map(); // Store multiple devices
        this.numberOfConnectedDevices = 0;
        this.blocks = [
            {
                opcode: 'connectToDevice',
                blockType: BlockType.COMMAND,
                text: 'Connect to a block',
                terminal: false
            },
            {
                opcode: 'setLEDColor',
                blockType: BlockType.COMMAND,
                text: 'Set Block [num] Status Led Color: R[red], G[green], B[blue]',
                terminal: false,
                arguments: {
                    num: {defaultValue: 0, type: ArgumentType.NUMBER },
                    red: { defaultValue: 0, type: ArgumentType.NUMBER },
                    green: { defaultValue: 0, type: ArgumentType.NUMBER },
                    blue: { defaultValue: 0, type: ArgumentType.NUMBER }
                }
            },
            {
                opcode: 'setLEDRGBColor',
                blockType: BlockType.COMMAND,
                text: 'Set Block [num] RGB Led Color: R[red], G[green], B[blue]',
                terminal: false,
                arguments: {
                    num: {defaultValue: 0, type: ArgumentType.NUMBER },
                    red: { defaultValue: 0, type: ArgumentType.NUMBER },
                    green: { defaultValue: 0, type: ArgumentType.NUMBER },
                    blue: { defaultValue: 0, type: ArgumentType.NUMBER }
                }
            },
            {
                opcode: 'setBlockMotorSpeed',
                blockType: BlockType.COMMAND,
                text: 'Set Block [num] motor speed [val]',
                terminal: false,
                arguments: {
                    num: {defaultValue: 0, type: ArgumentType.NUMBER },
                    val: { defaultValue: 0, type: ArgumentType.NUMBER }
                }
            },
            {
                opcode: 'getSensorValue',
                blockType: BlockType.REPORTER,
                text: 'Sensor value, Block [num]',
                terminal: false,
                arguments: {
                    num: {defaultValue: 0, type: ArgumentType.NUMBER }
                }
            },
            {
                opcode: 'getBattery',
                blockType: BlockType.REPORTER,
                text: 'Battery percentage, Block [num]',
                terminal: false,
                arguments: {
                    num: {defaultValue: 0, type: ArgumentType.NUMBER }
                }
            }
        ];

        this.colors = [
            "#FF00FF", "#00FFFF", "#FFFF00", "#808000",
            "#FF0000", "#00FF00", "#0000FF"
        ];
    }

    hexToRgb(hex) {
        hex = hex.replace(/^#/, ""); // Remove "#" if present
        if (hex.length === 3) {
            // Convert short hex (e.g. #F00) to full hex (#FF0000)
            hex = hex.split("").map(c => c + c).join("");
        }
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);
        return { r, g, b };
    }
    
    
    getInfo () {
        return {
            id: 'samlabsExtension',
            name: 'SamLabs',
            color1: '#0FBD8C',
            color2: '#0DA57A',
            blocks: this.blocks
        };
    }

    addBlock(newBlock) {
        this.blocks.push(newBlock);
        this.runtime._refreshExtensions(); // Force a refresh of the extension
    }

    async connectToDevice() {
        try {
            // Request a Bluetooth device with the specified filter
            const device = await navigator.bluetooth.requestDevice({
                filters: [{
                    namePrefix: 'SAM', // Filter by device name starting with 'SAM'
                }],
                optionalServices: [
                    '0000180f-0000-1000-8000-00805f9b34fb',
                    '3b989460-975f-11e4-a9fb-0002a5d5c51b'
                ]
            });

            console.log('Device found:', device);

            device.addEventListener('gattserverdisconnected', () => this.onDisconnected(device));

            // Connect to the GATT server
            const server = await device.gatt.connect();
            console.log('Connected to GATT server');

            await this.setupGATTDevice(server, device);

        } catch (error) {
            console.log('Error:', error);
        }
    }

    async setupGATTDevice(server, device)
    {
        const num = this.numberOfConnectedDevices;
        this.numberOfConnectedDevices++;
        // Get the Battery Service
        const battServ = await server.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
        console.log('Battery Service found:', battServ);

        // Get the Battery Level Characteristic
        const batteryLevelCharacteristic = await battServ.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
        console.log('Battery Level Characteristic found:', batteryLevelCharacteristic);

        const SAMServ = await server.getPrimaryService('3b989460-975f-11e4-a9fb-0002a5d5c51b');

        var SAMSensorCharacteristic = null;
        var SensorAvailable = true;

        try{
            SAMSensorCharacteristic = await SAMServ.getCharacteristic('4c592e60-980c-11e4-959a-0002a5d5c51b');
        } catch (error) {
            console.log('Sensor characteristic not found');
            SensorAvailable = false;
        }
        var SAMActorCharacteristic = null;
        var ActorAvailable = true;

        try{
            SAMActorCharacteristic = await SAMServ.getCharacteristic('84fc1520-980c-11e4-8bed-0002a5d5c51b');
        } catch (error) {
            console.log('Actor characteristic not found');
            ActorAvailable = false;
        }

        const SAMStatusLEDCharacteristic = await SAMServ.getCharacteristic('5baab0a0-980c-11e4-b5e9-0002a5d5c51b');

        let block = { 
            num: num,
            device: device, 
            battReadNotifyCharacteristic: batteryLevelCharacteristic,
            SAMSensorCharacteristic: SAMSensorCharacteristic,
            SensorAvailable: SensorAvailable,
            ActorAvailable: ActorAvailable,
            SAMActorCharacteristic: SAMActorCharacteristic,
            SAMStatusLEDCharacteristic:SAMStatusLEDCharacteristic,
            value: 0,
            battery: 0};

        this.deviceMap.set(num,block);
        this.setBlockLedColor(block, this.hexToRgb(this.colors[num]));

        if (SensorAvailable)
        {
            await SAMSensorCharacteristic.startNotifications();
            SAMSensorCharacteristic.addEventListener('characteristicvaluechanged', this.handleSensorNotifications.bind(this, num));
        }    
        
        await batteryLevelCharacteristic.startNotifications();
        batteryLevelCharacteristic.addEventListener('characteristicvaluechanged', this.handleBattChange.bind(this, num));
    

        console.log(`Connected to ${device.name || 'Unknown Device'}, num ${num}`);
    }

    async reconnect(device) {
        try {
            console.log('Reconnecting to device...');
            const server = await device.gatt.connect();
            console.log('Reconnected to GATT server');
            this.setupGATTDevice(server, device);
        } catch (error) {
            console.log('Reconnection failed:', error);
            setTimeout(() => this.reconnect(device), 5000); // Retry after 5 seconds
        }
    }
    
    onDisconnected(event) {
        this.reconnect(event.target);
    }

    handleSensorNotifications(num, event) {
        const value = event.target.value;
        let device = this.deviceMap.get(num);
        device.value = value.getUint8(0);
    }

    handleBattChange(num, event)
    {
        const value = event.target.value;
        let device = this.deviceMap.get(num);
        device.battery = value.getUint8(0);
    }

    async setLEDColor(args)
    {
        const num = Number(args.num);
        const block = this.deviceMap.get(num);
        if (!block)
        {
            return;
        }
        await this.setBlockLedColor(block, { r: args.red, g: args.green, b: args.blue });
    }
    
    async setBlockLedColor(block, color)
    {
        let message = new Uint8Array([
            color.r,
            color.g,
            color.b
        ]);
        await block.SAMStatusLEDCharacteristic.writeValue(message);
    }

    async setLEDRGBColor(args)
    {
        const num = Number(args.num);
        const block = this.deviceMap.get(num);
        if (!block)
        {
            return;
        }

        let message = new Uint8Array([
            args.red,
            args.green,
            args.blue
        ]);
        await block.SAMActorCharacteristic.writeValue(message);
    }

    async setBlockMotorSpeed(args)
    {
        const block = this.deviceMap.get(Number(args.num));
        if (!block)
        {
            return;
        }
        let speed = Number(args.val)
        if (speed < 0)
        {
            speed = Math.abs(speed) * 1.27 + 128
        }
        else
        {
            speed = speed * 1.27
        }
        let message = new Uint8Array([speed]);
        await block.SAMActorCharacteristic.writeValue(message);
    }

    getSensorValue(args)
    {
        const block = this.deviceMap.get(Number(args.num));
        if (!block)
        {
            return 0;
        }
        return block.value;
    }

    getBattery(args)
    {
        const block = this.deviceMap.get(Number(args.num));
        if (!block)
        {
            return 0;
        }
        return block.battery;
    }
}

module.exports = Scratch3SamLabs;