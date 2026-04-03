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

console.log('📡 מתחיל להאזין להתראות (הלוגיקה המנצחת של 3:00 בבוקר)...');

let processedAlerts = new Set();
let isFirstLoad = true;

function fetchTzevaAdomAlerts() {
    https.get('https://api.tzevaadom.co.il/alerts-history', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json'
        }
    }, (res) => {
        const chunks = []; 
        res.on('data', chunk => chunks.push(chunk));
        
        res.on('end', () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8');
                const data = JSON.parse(body);
                
                if (Array.isArray(data) && data.length > 0) {
                    
                    if (isFirstLoad) {
                        data.forEach(group => {
                            group.alerts.forEach(alert => {
                                let citiesList = (Array.isArray(alert.cities) && alert.cities.length > 0) ? alert.cities : ["הודעה כללית"];
                                let alertTitle = alert.title || "";
                                let alertDesc = alert.description || "";
                                
                                citiesList.forEach(city => {
                                    // הזיכרון עכשיו שומר גם את הטקסט. אם הטקסט משתנה ל"סיום אירוע" - זה יקפוץ למסך כחדש!
                                    processedAlerts.add(`${group.id}_${city}_${alertTitle}_${alertDesc}`);
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
                            let citiesList = (Array.isArray(alert.cities) && alert.cities.length > 0) ? alert.cities : ["הודעה כללית"];
                            
                            let alertTitle = alert.title || "";
                            let alertDesc = alert.description || "";
                            let fullText = (alertTitle + " " + alertDesc).toLowerCase();

                            citiesList.forEach(city => {
                                const uniqueKey = `${group.id}_${city}_${alertTitle}_${alertDesc}`;
                                if (!processedAlerts.has(uniqueKey)) {
                                    processedAlerts.add(uniqueKey);
                                    newCitiesForThisAlert.push(city); 
                                }
                            });

                            if (newCitiesForThisAlert.length > 0) {
                                let type = "missiles";
                                let finalTitle = alertTitle || "ירי רקטות וטילים";

                                // הלוגיקה החזקה מ-3:00 בבוקר: חיפוש בכל הטקסט המלא
                                if (fullText.includes("סיום") || fullText.includes("סתיים") || fullText.includes("שגרה") || alert.threat === 10) {
                                    type = "endOfEvent";
                                    finalTitle = "סיום אירוע / חזרה לשגרה";
                                } else if (fullText.includes("מקדימ") || fullText.includes("הכנה")) {
                                    type = "preAlert";
                                    finalTitle = alertTitle || "התראה מקדימה";
                                } else {
                                    switch (alert.threat) {
                                        case 1: type = "hostileAircraftIntrusion"; finalTitle = "חדירת כלי טיס עוין"; break;
                                        case 2:
                                        case 7: type = "terroristInfiltration"; finalTitle = "חדירת מחבלים"; break;
                                        case 3: type = "earthQuake"; finalTitle = "רעידת אדמה"; break;
                                        case 4: type = "radiologicalEvent"; finalTitle = "אירוע רדיולוגי"; break;
                                        case 5: type = "tsunami"; finalTitle = "חשש לצונאמי"; break;
                                        case 6: type = "hazardousMaterials"; finalTitle = "אירוע חומרים מסוכנים"; break;
                                        case 9: type = "nonConventional"; finalTitle = "אירוע לא קונבנציונלי"; break;
                                        default: type = "missiles"; finalTitle = alertTitle || "ירי רקטות וטילים";
                                    }
                                }

                                newAlertsToEmit.push({
                                    type: type,
                                    title: finalTitle,
                                    desc: alertDesc,
                                    cities: newCitiesForThisAlert
                                });
                            }
                        });
                    });

                    newAlertsToEmit.forEach(alertObj => {
                        console.log(`📡 אזעקה שודרה: [${alertObj.type}] - ${alertObj.title} ב-${alertObj.cities.join(', ')}`);
                        io.emit('alert', alertObj);
                    });

                    if (processedAlerts.size > 15000) {
                        const idsArray = Array.from(processedAlerts);
                        processedAlerts = new Set(idsArray.slice(idsArray.length - 5000));
                    }
                }
            } catch (e) {}
        });
    }).on('error', (err) => {});
}

setInterval(fetchTzevaAdomAlerts, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת עלה בהצלחה ומאזין בפורט ${PORT}`);
});