const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https');
const cors = require('cors');

const app = express();
app.use(cors());

// יצירת שרת ה-HTTP
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" } 
});

// הגדרת תיקיית www כתיקייה סטטית (חשוב עבור קבצי CSS/JS של הלוח)
const wwwPath = path.join(__dirname, 'www');
app.use(express.static(wwwPath));

// ניתוב ה-URL הראשי לקובץ index.html שבתוך תיקיית www
app.get('/', (req, res) => {
    res.sendFile(path.join(wwwPath, 'index.html'));
});

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
                } catch (e) {
                    // התעלמות משגיאות JSON (בדרך כלל דף ריק)
                }
            }
        });
    });

    req.on('error', (e) => { 
        console.error('❌ שגיאת התחברות לפיקוד העורף (ייתכן שזו חסימת חול/IP):', e.message);
    }); 
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

            if (title.includes("סתיים") || catStr === "10") {
                threatType = 'endOfEvent';
            } else if (catMap[catStr]) {
                threatType = catMap[catStr];
            }

            // יצירת מזהה ייחודי כדי לא לשלוח את אותה התראה פעמיים באותו רגע
            const alertId = alert.id || (threatType + "-" + locations.join(','));

            if (!activeAlerts.has(alertId)) {
                activeAlerts.add(alertId);
                console.log(`🚨 אזעקה פעילה: ${title} ב-${locations.join(', ')}`);
                
                // שליחת ההתראה לכל הלוחות המחוברים
                io.emit('alert', { 
                    type: threatType, 
                    title: title, 
                    desc: desc, 
                    cities: locations 
                });

                // מחיקה מהזיכרון אחרי 3 דקות כדי לאפשר קבלת התראה חדשה באותו מקום
                setTimeout(() => activeAlerts.delete(alertId), 180000);
            }
        }
    });
}

// בדיקת התראות כל 2 שניות
setInterval(fetchOrefAlerts, 2000);

// הגדרת פורט גמיש (חשוב עבור Render/Heroku)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת עלה בהצלחה ומאזין בפורט ${PORT}`);
    console.log(`🔗 ניתן לגשת ללוח בכתובת: https://mcp-shabbat-board.onrender.com}`);
});