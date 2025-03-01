const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const BLE = require('../../io/ble');
const Base64Util = require('../../util/base64-util');
require('regenerator-runtime/runtime');

const SamLabsBLE = {
    battServ: '0000180f-0000-1000-8000-00805f9b34fb',
    batteryLevelCharacteristic: '00002a19-0000-1000-8000-00805f9b34fb',
    SAMServ: '3b989460-975f-11e4-a9fb-0002a5d5c51b',
    SensorCharacteristic: '4c592e60-980c-11e4-959a-0002a5d5c51b',
    ActorCharacteristic: '84fc1520-980c-11e4-8bed-0002a5d5c51b',
    StatusLedCharacteristic: '5baab0a0-980c-11e4-b5e9-0002a5d5c51b'
}

class SamLabsBlock {
    constructor (runtime, extensionId, num) {
        this._runtime = runtime;
        this._runtime.on('PROJECT_STOP_ALL', this.stopAll.bind(this));
        this._extensionId = extensionId;
        this._ble = null;
        this._runtime.registerPeripheralExtension(extensionId, this);
        this.reset = this.reset.bind(this);
        this._onConnect = this._onConnect.bind(this);
        this._pingDevice = this._pingDevice.bind(this);
        this.num = num;
        this.value = 0;
        this.battery = 0;
        this.ActorAvailable = false;
        this.SensorAvailable = false;
    }

    getBattery()
    {
        return this.battery;
    }

    getSensorValue()
    {
        return this.value;
    }

    setStatusLed(inputRGB) {
        const message = new Uint8Array([
            (inputRGB >> 16) & 0x000000FF,
            (inputRGB >> 8) & 0x000000FF,
            (inputRGB) & 0x000000FF
        ]);
        this.send(SamLabsBLE.StatusLedCharacteristic, message);
    }

    sendActorValue(val)
    {
        this.send(SamLabsBLE.ActorCharacteristic, new Uint8Array([val]));
    }

    stopAll()
    {
        if (!this.isConnected()) return;
        if (!this.ActorAvailable) return;
        this.send(SamLabsBLE.ActorCharacteristic, new Uint8Array([0]));
    }

    scan () {
        if (this._ble) {
            this._ble.disconnect();
        }
        try {
            this._ble = new BLE(this._runtime, this._extensionId, {
                filters: [{
                    //namePrefix: 'SAM',
                    //services: [SamLabsBLE.battServ, SamLabsBLE.SAMServ],
                }],
                optionalServices: []
            }, this._onConnect, this.reset);
        } catch (error) {
            console.error("Failed to initialize BLE:", error);
        }
    }

    connect (id) {
        if (this._ble) {
            this._ble.connectPeripheral(id);
        }
    }

    disconnect () {
        if (this._ble) {
            this._ble.disconnect();
        }

        this.reset();
    }
    reset () {
        this.ActorAvailable = false;
        this.SensorAvailable = false;
    }
    isConnected () {
        let connected = false;
        if (this._ble) {
            connected = this._ble.isConnected();
        }
        return connected;
    }
    send (uuid, message) {
        if (!this.isConnected()) return Promise.resolve();

        return this._ble.write(
            SamLabsBLE.SAMServ,
            uuid,
            Base64Util.uint8ArrayToBase64(message),
            'base64'
        );
    }
    getCharacteristics (serviceId) {
        return this._ble.sendRemoteRequest('getCharacteristics', { serviceId })
            .then(response => response.characteristics)
            .catch(e => {
                this._ble.handleDisconnectError(e);
                return [];
            });
    }
    _onConnect () {
        this.getCharacteristics(SamLabsBLE.SAMServ)
        .then(characteristics => {
            console.log('Characteristics: ', characteristics)
            this.SensorAvailable = characteristics.some(c => c.id === SamLabsBLE.SensorCharacteristic);
            this.ActorAvailable = characteristics.some(c => c.id === SamLabsBLE.ActorCharacteristic);
            console.log(`Characteristic ${SamLabsBLE.SensorCharacteristic} available:`, this.SensorAvailable);
            console.log(`Characteristic ${SamLabsBLE.ActorCharacteristic} available:`, this.ActorAvailable);
        });

        if (this.SensorAvailable) {
            this._ble.startNotifications(
                SamLabsBLE.SAMServ,
                SamLabsBLE.SensorCharacteristic,
                this._onMessage.bind(this, SamLabsBLE.SensorCharacteristic)
            );
        }

        this._ble.startNotifications(
            SamLabsBLE.battServ,
            SamLabsBLE.batteryLevelCharacteristic,
            this._onMessage.bind(this, SamLabsBLE.batteryLevelCharacteristic)
        );

    }
    _onMessage (characteristics, base64)
    {
        const data = Base64Util.base64ToUint8Array(base64);
        if (characteristics == SamLabsBLE.SensorCharacteristic)
        {
            this.value = data[0];
        }
        else
        {
            this.battery = data[0];
        }
    }
    _pingDevice () 
    {
    }
}

class Scratch3SamLabs {

    constructor (runtime) {
        this.runtime = runtime;
        this.deviceMap = new Map(); // Store multiple devices
        this.numberOfConnectedDevices = 0;
        this.extensionId = 'samlabsExtension';
        this.device = new SamLabsBlock(runtime, this.extensionId);
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
            id: this.extensionId,
            name: 'SamLabs',
            showStatusButton: true,
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