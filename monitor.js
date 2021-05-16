const Obniz = require("obniz");
const OBNIZ_ID = "5074-4623";
const ACCESS_TOKEN = "cq5yoJcgI0QTZNB870Scnt0HDjCI6p9DgTB9ZeHh4liEfgcPF_2YyH1PxiPITZJH";
const num_replicates = 3;
const fs = require('fs');
const filename_log = "monitor.log";

// const duration = 7200 * 1000;
// const interval = 30000;
const interval = 2000;
const duration = 60 * 1000;
let time_start;

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function monitor_voltage(obniz) {
    let dt = Date.now();
    let a2 = new Array();
    let a3 = new Array();

    obniz.io0.output(true);
    obniz.io1.output(false);

    for (let i = 0; i < num_replicates; i++) {
        let v2 = await obniz.ad2.getWait();
        let v3 = await obniz.ad3.getWait();
        a2.push(v2);
        a3.push(v3);
        await wait(50);
    }

    obniz.io0.output(false);
    obniz.io1.output(false);
    return {time:dt, digital:a2, analog:a3};
}


async function sense_obniz() {
    let ret = await monitor_voltage(obniz);
    let line = (ret.time - time_start).toString();
    for (let i = 0; i < num_replicates; i++) {
        line += "\t" + ret.digital[i] + "\t" + ret.analog[i];
    }
    let fd = fs.openSync(filename_log, "a");
    fs.writeFileSync(fd, line + "\n");

    console.log(line);

    if (ret.time - time_start > duration) {
        running = false;
        obniz.close();
    }
    if (running) {
        setTimeout(sense_obniz, interval);
    }
}

let obniz = new Obniz(OBNIZ_ID, {access_token:ACCESS_TOKEN});
obniz.onconnect = async function() {
    time_start = Date.now();
    running = true;
    setTimeout(sense_obniz, 0);
};

obniz.onclose = async function() {
    obniz = null;
    running = false;
    console.log("obniz stopped")
}
