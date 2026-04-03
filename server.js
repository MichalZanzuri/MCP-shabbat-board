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

console.log('📡 מתחיל להאזין להתראות (דרך ערוץ צבע אדום פתוח שעוקף את חסימת הענן)...');

let lastSeenId = 0;

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
                    
                    // בטעינה הראשונה של השרת, אנחנו רק שומרים את ה-ID הכי חדש
                    // כדי לא להקפיץ ללוח אזעקות היסטוריות מאתמול
                    if (lastSeenId === 0) {
                        lastSeenId = data[0].id;
                        return;
                    }

                    let hasNewAlerts = false;

                    // עוברים על ההתראות שקיבלנו
                    data.forEach(group => {
                        // אם יש מזהה התראה גדול יותר ממה שראינו - זו אזעקה חדשה!
                        if (group.id > lastSeenId) {
                            hasNewAlerts = true;
                            group.alerts.forEach(alert => {
                                let type = "missiles";
                                let title = "ירי רקטות וטילים";
                                
                                // סיווג סוג האיום לפי קוד
                                if (alert.threat === 1) {
                                    type = "hostileAircraftIntrusion";
                                    title = "חדירת כלי טיס עוין";
                                } else if (alert.threat === 2 || alert.threat === 5 || alert.threat === 7) {
                                    type = "terroristInfiltration";
                                    title = "חדירת מחבלים";
                                } else if (alert.threat === 3) {
                                    type = "earthQuake";
                                    title = "רעידת אדמה";
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

                    // מעדכנים את ה-ID כדי לא לשלוח את אותה התראה פעמיים
                    if (hasNewAlerts) {
                        const maxId = Math.max(...data.map(g => g.id));
                        if (maxId > lastSeenId) {
                            lastSeenId = maxId;
                        }
                    }
                }
            } catch (e) {
                // מתעלמים משגיאות רשת רגעיות או JSON שבור
            }
        });
    }).on('error', (err) => {
        console.error('❌ שגיאת רשת במשיכת נתונים:', err.message);
    });
}

// דגימה כל 2 שניות
setInterval(fetchTzevaAdomAlerts, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת עלה בהצלחה ומאזין בפורט ${PORT}`);
});