const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https');
const cors = require('cors'); // הוספה

const app = express();
app.use(cors()); // הוספה

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'www', 'index.html')));
app.use(express.static(path.join(__dirname, 'www')));

io.on('connection', (socket) => {
    console.log('🖥️ לוח חכם התחבר לשרת הנתונים בהצלחה!');
    socket.on('disconnect', () => console.log('🖥️ לוח חכם התנתק.'));
});

console.log('📡 מתחיל להאזין להתראות פיקוד העורף...');

let activeAlerts = new Set();

function fetchOrefAlerts() {
    const options = {
        hostname: 'www.oref.org.il',
        port: 443,
        path: '/WarningMessages/alert/alerts.json',
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.oref.org.il/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            const cleanBody = body.replace(/^\uFEFF/, '').trim();
            if (cleanBody.length > 0) {
                try {
                    const alertData = JSON.parse(cleanBody);
                    processRawAlert(alertData);
                } catch (e) { }
            }
        });
    });

    req.on('error', (e) => { console.error('Oref Fetch Error:', e.message); }); 
    req.setTimeout(2000, () => req.abort());
    req.end();
}

function processRawAlert(alertData) {
    const alertsList = Array.isArray(alertData) ? alertData : [alertData];
    alertsList.forEach(alert => {
        let locations = alert.data || [];
        if (locations.length > 0) {
            let threatType = 'unknown'; 
            const title = alert.title || 'התראה ביטחונית';
            const desc = alert.desc || '';
            const catStr = String(alert.cat || '');

            const catMap = {
                "1": "missiles", "2": "hostileAircraftIntrusion", 
                "3": "earthQuake", "4": "radiologicalEvent", 
                "5": "tsunami", "6": "hazardousMaterials",
                "7": "terroristInfiltration", "9": "nonConventional",
                "10": "endOfEvent", "11": "missiles", "13": "preAlert"
            };

            if (title.includes("סתיים")) {
                threatType = 'endOfEvent';
            } else if (catMap[catStr]) {
                threatType = catMap[catStr];
            }

            const alertId = alert.id || (threatType + "-" + locations.join(','));

            if (!activeAlerts.has(alertId)) {
                activeAlerts.add(alertId);
                console.log(`🚨 אזעקה: ${title} ב-${locations.join(', ')}`);
                io.emit('alert', { type: threatType, title: title, desc: desc, cities: locations });
                setTimeout(() => activeAlerts.delete(alertId), 180000);
            }
        }
    });
}

setInterval(fetchOrefAlerts, 2000);

// עדכון פורט עבור Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת רץ בפורט ${PORT}`);
});