const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https'); // חיבור ישיר לפיקוד העורף

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('🖥️ לוח חכם התחבר לשרת הנתונים בהצלחה!');
    socket.on('disconnect', () => console.log('🖥️ לוח חכם התנתק.'));
});

console.log('📡 מתחיל להאזין להתראות פיקוד העורף (מנוע ישיר ומהיר)...');

let activeAlerts = new Set();

// פונקציה שמושכת ישירות את ה-JSON הרשמי של פיקוד העורף
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
            // מנקה את התשובה כדי לוודא שזה JSON תקין
            const cleanBody = body.replace(/^\uFEFF/, '').trim();
            if (cleanBody.length > 0) {
                try {
                    const alertData = JSON.parse(cleanBody);
                    processRawAlert(alertData);
                } catch (e) { /* התעלם משגיאות פרסור במקרה של שרת עמוס */ }
            }
        });
    });

    req.on('error', () => {}); // התעלם משגיאות רשת זמניות
    req.setTimeout(2000, () => req.abort());
    req.end();
}

function processRawAlert(alertData) {
    // פיקוד העורף לפעמים שולח מערך ולפעמים אובייקט בודד, נתייחס להכל כמערך
    const alertsList = Array.isArray(alertData) ? alertData : [alertData];
    
    alertsList.forEach(alert => {
        let locations = [];
        if (alert.data && Array.isArray(alert.data)) {
            locations = alert.data;
        }
        
        if (locations.length > 0) {
            let threatType = 'unknown'; 
            const title = alert.title || 'התראה ביטחונית';
            const desc = alert.desc || '';
            const catStr = String(alert.cat || '');

            // מילון כל הקודים הרשמיים של פיקוד העורף
            const catMap = {
                "1": "missiles", "2": "hostileAircraftIntrusion", 
                "3": "earthQuake", "4": "radiologicalEvent", 
                "5": "tsunami", "6": "hazardousMaterials",
                "7": "terroristInfiltration", "9": "nonConventional",
                "10": "endOfEvent", "11": "missiles", "13": "preAlert",
                "101": "drill_missiles", "102": "drill_aircraft",
                "103": "drill_earthQuake", "104": "drill_radiological",
                "105": "drill_tsunami", "106": "drill_hazmat",
                "107": "drill_terrorist"
            };

            if (title.includes("סתיים")) {
                threatType = 'endOfEvent';
            } else if (catMap[catStr]) {
                threatType = catMap[catStr];
            }

            // יצירת תעודת זהות ייחודית לאזעקה כדי לא להציף את המסך
            const alertId = alert.id || (threatType + "-" + locations.join(','));

            if (!activeAlerts.has(alertId)) {
                activeAlerts.add(alertId);
                console.log(`\n🚨 התראה נתפסה! [קטגוריה: ${catStr}] כותרת: ${title} | ערים: ${locations.join(', ')}`);
                
                io.emit('alert', {
                    type: threatType,
                    title: title, // הטקסט המקורי של פיקוד העורף
                    desc: desc,   // הוראות ההתגוננות ("היכנסו למרחב המוגן...")
                    cities: locations
                });
                
                // מחיקה מהזיכרון אחרי 3 דקות
                setTimeout(() => activeAlerts.delete(alertId), 180000);
            }
        }
    });
}

// דוגמים את פיקוד העורף כל 2 שניות
setInterval(fetchOrefAlerts, 2000);

server.listen(3000, () => {
    console.log('🚀 שרת ההתראות הישיר רץ וממתין ללוח בכתובת: http://localhost:3000');
});