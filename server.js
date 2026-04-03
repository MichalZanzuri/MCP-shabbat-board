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

console.log('📡 מתחיל להאזין להתראות (גרסה סופית: זיכרון מורחב, הגנת טקסט, וזיהוי מלא)...');

let processedAlertIds = new Set();
let isFirstLoad = true;

function fetchTzevaAdomAlerts() {
    https.get('https://api.tzevaadom.co.il/alerts-history', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json'
        }
    }, (res) => {
        // מנגנון הגנה: איסוף החבילות כדי שהעברית לא תישבר באמצע משפט
        const chunks = []; 
        
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8');
                const data = JSON.parse(body);
                
                if (Array.isArray(data) && data.length > 0) {
                    
                    // טעינה ראשונה - שומרים הכל כדי לא להקפיץ היסטוריה
                    if (isFirstLoad) {
                        data.forEach(group => {
                            group.alerts.forEach(alert => {
                                alert.cities.forEach(city => {
                                    processedAlertIds.add(`${group.id}_${city}_${alert.threat}`);
                                });
                            });
                        });
                        isFirstLoad = false;
                        return;
                    }

                    let newAlertsToEmit = [];

                    data.forEach(group => {
                        group.alerts.forEach(alert => {
                            let newCitiesForThisAlert = [];

                            // בדיקה ברמת העיר כדי לא לפספס ערים שנוספו למטח קיים
                            alert.cities.forEach(city => {
                                const uniqueKey = `${group.id}_${city}_${alert.threat}`;
                                if (!processedAlertIds.has(uniqueKey)) {
                                    processedAlertIds.add(uniqueKey);
                                    newCitiesForThisAlert.push(city); 
                                }
                            });

                            if (newCitiesForThisAlert.length > 0) {
                                let type = "missiles";
                                const alertTitle = alert.title || "";
                                const alertDesc = alert.description || "";
                                const fullText = (alertTitle + " " + alertDesc).toLowerCase();
                                let title = alertTitle || "ירי רקטות וטילים";

                                // זיהוי חכם מתוך הטקסט לסיום והתראה מקדימה
                                if (fullText.includes("סיום") || fullText.includes("סתיים") || fullText.includes("שגרה")) {
                                    type = "endOfEvent";
                                    title = "סיום אירוע / חזרה לשגרה";
                                } 
                                else if (fullText.includes("מקדימה") || fullText.includes("הכנה")) {
                                    type = "preAlert";
                                    title = alertTitle || "התראה מקדימה";
                                } 
                                else {
                                    // זיהוי לפי קוד פיקוד העורף
                                    switch (alert.threat) {
                                        case 1: type = "hostileAircraftIntrusion"; title = "חדירת כלי טיס עוין"; break;
                                        case 2:
                                        case 7: type = "terroristInfiltration"; title = "חדירת מחבלים"; break;
                                        case 3: type = "earthQuake"; title = "רעידת אדמה"; break;
                                        case 4: type = "radiologicalEvent"; title = "אירוע רדיולוגי"; break;
                                        case 5: type = "tsunami"; title = "חשש לצונאמי"; break;
                                        case 6: type = "hazardousMaterials"; title = "אירוע חומרים מסוכנים"; break;
                                        case 9: type = "nonConventional"; title = "אירוע לא קונבנציונלי"; break;
                                        case 10: type = "endOfEvent"; title = "סיום אירוע"; break;
                                        default: type = "missiles"; title = alertTitle || "ירי רקטות וטילים";
                                    }
                                }

                                newAlertsToEmit.push({
                                    type: type,
                                    title: title,
                                    desc: alertDesc,
                                    cities: newCitiesForThisAlert
                                });
                            }
                        });
                    });

                    // שידור למסך
                    newAlertsToEmit.forEach(alertObj => {
                        console.log(`📡 אזעקה משודרת: [${alertObj.type}] - ${alertObj.title} ב-${alertObj.cities.join(', ')}`);
                        io.emit('alert', alertObj);
                    });

                    // מנגנון זיכרון עצום (15,000) כדי שהשרת לעולם לא ישכח את היממה האחרונה
                    if (processedAlertIds.size > 15000) {
                        const idsArray = Array.from(processedAlertIds);
                        processedAlertIds = new Set(idsArray.slice(idsArray.length - 5000));
                    }
                }
            } catch (e) {
                // התעלמות שקטה משגיאות כדי לשמור על יציבות
            }
        });
    }).on('error', (err) => {});
}

// דגימה קבועה כל 2 שניות
setInterval(fetchTzevaAdomAlerts, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת עלה בהצלחה ומאזין בפורט ${PORT}`);
});