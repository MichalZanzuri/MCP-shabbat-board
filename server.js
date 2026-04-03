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

console.log('📡 מתחיל להאזין להתראות (מערכת זיכרון חכמה מופעלת)...');

// כאן אנחנו שומרים את ההיסטוריה כדי לא לפספס כלום
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
                    
                    // בטעינה הראשונה רק "לומדים" מה היה כדי לא להקפיץ אזעקות עבר
                    if (isFirstLoad) {
                        data.forEach(group => processedAlertIds.add(group.id));
                        isFirstLoad = false;
                        return;
                    }

                    // עוברים על כל האזעקות
                    data.forEach(group => {
                        // אם יש פה ID שעוד לא ראינו - זו אזעקה חדשה בוודאות!
                        if (!processedAlertIds.has(group.id)) {
                            processedAlertIds.add(group.id); 
                            
                            group.alerts.forEach(alert => {
                                let type = "missiles";
                                let title = "ירי רקטות וטילים";
                                
                                if (alert.threat === 1) {
                                    type = "hostileAircraftIntrusion";
                                    title = "חדירת כלי טיס עוין";
                                } else if (alert.threat === 2 || alert.threat === 5 || alert.threat === 7) {
                                    type = "terroristInfiltration";
                                    title = "חדירת מחבלים";
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

                    // מנקים ישנים כדי לא לסתום את הזיכרון של השרת
                    if (processedAlertIds.size > 200) {
                        const idsArray = Array.from(processedAlertIds);
                        processedAlertIds = new Set(idsArray.slice(idsArray.length - 100));
                    }
                }
            } catch (e) {
                // התעלמות משגיאות רשת
            }
        });
    }).on('error', (err) => {});
}

// דגימה מהירה כל 2 שניות
setInterval(fetchTzevaAdomAlerts, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת עלה בהצלחה ומאזין בפורט ${PORT}`);
});