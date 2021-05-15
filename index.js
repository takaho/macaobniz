const { json } = require('express');
const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
const TOKEN = "4423";
const Obniz = require("obniz");
const fs = require('fs');


let voltageData = new Array();
let running = false;
const interval_period = 5000;
const OBNIZ_ID = "5074-4623";
const ACCESS_TOKEN = "cq5yoJcgI0QTZNB870Scnt0HDjCI6p9DgTB9ZeHh4liEfgcPF_2YyH1PxiPITZJH";
let obniz = null;
let time_start = 0;
const num_replicates = 5;

let dump_interval = 10;
let next_dump = dump_interval;
const filename_log = "log.txt";

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

function sendSMS(message, res) {
    let AWS = require('aws-sdk');

    // Use your credentials.json as follows
    // {
    //     "accessKeyId":"XXXXXXXXXXXX",
    //     "secretAccessKey":"XXXXXXXXXXXXXXXX",
    //     "region":"XXXXXXXX"
    // }
    // AWS.config.loadFromPath('./credentials.json');
    AWS.config.update({region:"ap-northeast-1"});

    // Parameters.json should have your Phone number
    // {"PhoneNumber":"+81555555555"}
    let params = JSON.parse(fs.readFileSync("./parameters.json"));
    console.log(params);
    params["Message"] = message;

    // Create promise and SNS service object
    let publishTextPromise = new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise();

    // Handle promise's fulfilled/rejected states
    publishTextPromise.then(
        function(data) {
            console.log("MessageID is " + data.MessageId);
            console.log(data);
            res.jsonp({result:"success", messageId:data.MessageId})
        // res.render('pages/success', {'messageId':data.MessageId});
        }).catch(
        function(err) {
            res.jsonp({error:err.stack});
            // res.render('pages/error', {'error':err.stack});
            console.error(err, err.stack);
        });  
}

function process_obniz(req, res) {
    let action = req.query.action;
    if (action === 'msg') {
        let message = req.query.text;
        let token = req.query.token;
        if (token != TOKEN) {
            res.jsonp({error:"invalid token"});
        } else if (message === void 0 || message.length == 0) {
            console.error("no message");
            res.jsonp({error:"no message"});
        } else {
            try{
                sendSMS(message, res);
            } catch (e) {
                res.jsonp({error:e.stack});//toString()});
            }
        }
    } else {
        console.error("action " + action + " is not supported");
        res.jsonp({error:"action " + action + " is not supported"});
    }
}

async function readBMP280() {
    // var bmp280 = obniz.wired("BMP280", {gnd:5, vio:4, sdo:9, csb:8, sck:6, sdi:7});

    // var bmp280 = obniz.wired("BMP280",  {vio:4, vcore:4, gnd:5, csb:8, sdi: 7, sck: 6, sdo:9 });
    var bmp280 = obniz.wired("BMP280",  {vio:4, gnd:5, csb:8, sdi: 7, sck: 6, sdo:9 });
    await bmp280.applyCalibration();
    let temperature = await bmp280.getTempWait();
    let pressure = await bmp280.getPressureWait();
    console.log({temperature:temperature, pressure:pressure});
    bmp280.i2c.end();
    return {temperature:temperature, pressure:pressure};
}

async function monitor_voltage(obniz) {
    if (!running || obniz == void 0 || obniz === null) {
        return;
    }

    let circumstances;
    if (voltageData.length == 0) {
        circumstances = await readBMP280();
    }  else {
        circumstances = {temperature:0, pressure:0};
    }

    obniz.io0.output(true);
    obniz.io1.output(false);

    let dt = Date.now();
    let a2 = new Array();
    let a3 = new Array();
    let s2 = 0;
    let s3 = 0;
    for (let i = 0; i < num_replicates; i++) {
        let v2 = await obniz.ad2.getWait();
        let v3 = await obniz.ad3.getWait();
        a2.push(v2);
        a3.push(v3);
        s2 += v2;
        s3 += v3;
        await wait(50);
    }
    voltageData.push([[dt, dt-time_start], a2, a3, [circumstances.temperature, circumstances.pressure]]);

    obniz.io0.output(false);
    obniz.io1.output(false);

    console.log(Math.floor((dt - time_start)/1000) + "\t" + (s2 / num_replicates).toFixed(3) + "\t" + (s3 / num_replicates).toFixed(3))

    if (next_dump > 0 && voltageData.length >= next_dump) {
        dump_to_file();
        next_dump += dump_interval;
    }

    setTimeout(()=>{monitor_voltage(obniz)}, interval_period);
}

function dump_to_file() {
    let mode = "a";
    if (voltageData[0][0][1] < dump_interval * interval_period) { 
        mode = "w";
    }
    // console.log(voltageData.length + " " + voltageData[0][0][1] + " " +  (dump_interval * interval_period) + " " + mode);
    fs.open(filename_log, mode, (err, fd)=>{
        if (err) {
            console.error("failed to open");
            next_dump = -1;
        } else if (voltageData.length > 0) {
            let contents = "";
            if (voltageData[0][0][1] < dump_interval *interval_period) { // first log}
                contents += "Time\tElapsed";
                for (let j = 0; j < num_replicates; j++) {
                    contents += "\tIO2_" + (j + 1);
                }
                for (let j = 0; j < num_replicates; j++) {
                    contents += "\tIO3_" + (j + 1);
                }
                contents += "\tTemperature\tPressure\n";
            }
            for (let i = 0; i < voltageData.length; i++) {
                let dt = voltageData[i][0];
                let v2 = voltageData[i][1];
                let v3 = voltageData[i][2];
                let bmp = voltageData[i][3];
                contents += dt[0] + "\t" + dt[1]
                for (let j = 0; j < num_replicates; j++) {
                    contents += "\t" + v2[j].toFixed(3);
                }
                for (let j = 0; j < num_replicates; j++) {
                    contents += "\t" + v3[j].toFixed(3);
                }
                contents += "\t" + bmp[0].toFixed(2) + "\t" + bmp[1].toFixed(1) + "\n";
            }
            fs.writeSync(fd, contents);
            voltageData = new Array();
        }
    });

}

function dump_data(req, res) {
    res.jsonp({});
    // res.jsonp(voltageData);
}

function start_monitor(req, res) {
    if (obniz !== null) {
        console.error("already running");
        res.jsonp({result:"error", text:"already running"});
        return;
    }
    running = false;
    time_start = Date.now();
    obniz = new Obniz(OBNIZ_ID, {access_token:ACCESS_TOKEN});
    obniz.onconnect = async function() {
        obniz.resetOnDisconnect(false);
        running = true;
        setTimeout(()=>{monitor_voltage(obniz)}, 0);
    };
    obniz.onclose = async function() {
        obniz = null;
        running = false;
        console.log("obniz stopped")
    }

    if (req !== void 0 && res !== void 0) {
        res.jsonp({result:"error", text:"starting obniz"});
    }
}

function stop_monitor(req, res) {
    if (running) {
        running = false;
        obniz.close();
        obniz = null;
        if (req !== void 0 && res !== void 0) {
            res.jsonp({result:"success", text:'stopped'});
        }
        setTimeout(dump_to_file, 0);
    } else {
        if (req !== void 0 && res !== void 0) {
            res.jsonp({result:"error", text:'not running'});
        }
    }
}

let app = express();
app.use(express.static(path.join(__dirname, 'public')))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/', dump_data)
  .get('/stop', stop_monitor)
  .get('/start', start_monitor)
//   .get('/', (req, res) => res.render('pages/index'))
  .get('/obniz', process_obniz)
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))

// start_monitor();
