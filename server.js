const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

// מייבאים את הספרייה הישראלית שעוקפת את החסימות!
const pikudHaoref = require('pikud-haoref-api');

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

console.log('📡 מתחיל להאזין להתראות פיקוד העורף (דרך פרוקסי ישראלי עוקף חסימות)...');

let activeAlerts = new Set();

// הפעלת ההאזנה דרך הספרייה שעוקפת את Render
pikudHaoref.startPolling(function (err, alert) {
    if (err) {
        console.error('❌ שגיאה במשיכת נתונים:', err.message || err);
        return;
    }

    // אם קיבלנו התראה פעילה
    if (alert && alert.cities && alert.cities.length > 0) {
        
        let type = alert.type;
        
        // התאמה ללוגיקה המקורית שלנו במידת הצורך
        if (alert.title && alert.title.includes("סתיים")) {
            type = "endOfEvent";
        } else if (alert.title && alert.title.includes("מקדימה")) {
            type = "preAlert";
        }

        // מזהה ייחודי למניעת כפילויות
        const alertId = type + "-" + alert.cities.join(',');

        if (!activeAlerts.has(alertId)) {
            activeAlerts.add(alertId);
            console.log(`🚨 אזעקה פעילה: ${alert.title} ב-${alert.cities.join(', ')}`);
            
            // שליחת ההתראה ללוח התצוגה (index.html)
            io.emit('alert', { 
                type: type, 
                title: alert.title || 'התראה ביטחונית', 
                desc: alert.instructions || '', 
                cities: alert.cities 
            });

            // מחיקה מהזיכרון אחרי 3 דקות כדי לאפשר לאותה עיר להופיע שוב
            setTimeout(() => activeAlerts.delete(alertId), 180000);
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת עלה בהצלחה ומאזין בפורט ${PORT}`);
});