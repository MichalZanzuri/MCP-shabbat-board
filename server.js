const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const wwwPath = path.join(__dirname, 'www');
app.use(express.static(wwwPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(wwwPath, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('🖥️ לוח חכם התחבר לשרת הנתונים בהצלחה!');
});

console.log('📡 מתחיל להאזין להתראות (מערכת מלאה כולל סיום אירוע והתראה מקדימה)...');

// זיכרון היסטורי למניעת כפילויות ופספוסים
let processedAlertIds = new Set();
let isFirstLoad = true;

function fetchTzevaAdomAlerts() {
    https.get('https://api.tzevaadom.co.il/alerts-history', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json'
        }
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (Array.isArray(data) && data.length > 0) {
                    
                    if (isFirstLoad) {
                        data.forEach(group => processedAlertIds.add(group.id));
                        isFirstLoad = false;
                        return;
                    }

                    data.forEach(group => {
                        if (!processedAlertIds.has(group.id)) {
                            processedAlertIds.add(group.id); 
                            
                            group.alerts.forEach(alert => {
                                let type = "missiles";
                                // לוקחים את הכותרת המקורית מה-API אם קיימת, אחרת ברירת מחדל
                                let title = alert.title || "ירי רקטות וטילים";

                                // זיהוי חכם לפי טקסט (התראה מקדימה וסיום אירוע)
                                if (title.includes("מקדימה")) {
                                    type = "preAlert";
                                } else if (title.includes("סתיים") || title.includes("סיום")) {
                                    type = "endOfEvent";
                                } else {
                                    // זיהוי לפי קוד איום לכל שאר סוגי ההתראות
                                    switch (alert.threat) {
                                        case 1:
                                            type = "hostileAircraftIntrusion";
                                            title = "חדירת כלי טיס עוין";
                                            break;
                                        case 2:
                                        case 7:
                                            type = "terroristInfiltration";
                                            title = "חדירת מחבלים";
                                            break;
                                        case 3:
                                            type = "earthQuake";
                                            title = "רעידת אדמה";
                                            break;
                                        case 4:
                                            type = "radiologicalEvent";
                                            title = "אירוע רדיולוגי";
                                            break;
                                        case 5:
                                            type = "tsunami";
                                            title = "חשש לצונאמי";
                                            break;
                                        case 6:
                                            type = "hazardousMaterials";
                                            title = "אירוע חומרים מסוכנים";
                                            break;
                                        case 9:
                                            type = "nonConventional";
                                            title = "אירוע לא קונבנציונלי";
                                            break;
                                        case 10: // התווסף זיהוי של קוד 10!
                                            type = "endOfEvent";
                                            title = "סיום אירוע";
                                            break;
                                        default:
                                            type = "missiles";
                                            title = "ירי רקטות וטילים";
                                    }
                                }
                                
                                console.log(`🚨 אזעקה חדשה זוהתה: ${title} ב-${alert.cities.join(', ')}`);
                                
                                io.emit('alert', { 
                                    type: type, 
                                    title: title, 
                                    desc: "", 
                                    cities: alert.cities 
                                });
                            });
                        }
                    });

                    // ניקוי זיכרון
                    if (processedAlertIds.size > 200) {
                        const idsArray = Array.from(processedAlertIds);
                        processedAlertIds = new Set(idsArray.slice(idsArray.length - 100));
                    }
                }
            } catch (e) {
                // התעלמות משגיאות JSON
            }
        });
    }).on('error', (err) => {
        // התעלמות משגיאות רשת זמניות
    });
}

setInterval(fetchTzevaAdomAlerts, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת עלה בהצלחה ומאזין בפורט ${PORT}`);
});