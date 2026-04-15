const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database.js');
const { sendEmail } = require('./mailer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// РАЗДАЧА ФАЙЛОВ
app.use(express.static(__dirname));

// Маршруты для страниц
app.get('/org', (req, res) => {
    res.sendFile(path.join(__dirname, 'organizer.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-requests', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-requests.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

// ==========================================
// 1. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ
// ==========================================

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const query = "SELECT * FROM Users WHERE Email = ? AND Password = ?";
    db.get(query, [email, password], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (row) {
            res.json({ success: true, user: row });
        } else {
            res.status(401).json({ success: false, message: 'Неверный email или пароль' });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { fio, email, phone, password, weight, birthDate, rank, gender } = req.body;
    
    db.get("SELECT * FROM Users WHERE Email = ?", [email], (err, existing) => {
        if (existing) {
            return res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует' });
        }

        const finalRank = rank || 'Б/Р';
        const finalGender = gender || 'Мужской';
        const role = 'User';
        const defaultBalance = 100;

        let skill = 0;
        if (finalRank === 'МСМК') skill = 95 + Math.floor(Math.random() * 6);
        else if (finalRank === 'МС') skill = 85 + Math.floor(Math.random() * 10);
        else if (finalRank === 'КМС') skill = 70 + Math.floor(Math.random() * 15);
        else if (finalRank === '1 разряд') skill = 50 + Math.floor(Math.random() * 20);
        else skill = 10 + Math.floor(Math.random() * 35);

        const sql = `INSERT INTO Users (FIO, Email, Phone, Password, Weight, BirthDate, Role, Rank, Balance, SkillLevel, Gender) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        db.run(sql, [fio, email, phone, password, weight, birthDate, role, finalRank, defaultBalance, skill, finalGender], async function(err) {
            if (err) {
                console.error("Ошибка регистрации:", err.message);
                return res.status(500).json({ success: false, message: err.message });
            }
            
            try {
                const html = `<h1>Добро пожаловать в ArmWrestle Pro!</h1><p>${fio}, вы успешно зарегистрированы!</p><p>Пол: ${finalGender}</p>`;
                await sendEmail(email, 'Добро пожаловать в ArmWrestle Pro!', html);
            } catch(emailError) {
                console.error('❌ Ошибка отправки приветственного письма:', emailError);
            }
            
            res.json({ success: true, userId: this.lastID });
        });
    });
});

// ==========================================
// 2. ФУНКЦИИ ПОЛЬЗОВАТЕЛЯ
// ==========================================

app.get('/api/user/profile/:id', (req, res) => {
    const userId = req.params.id;
    db.get("SELECT UserID, FIO, Email, Phone, Role, Weight, Balance, BirthDate, Rank, SkillLevel, Gender FROM Users WHERE UserID = ?", [userId], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false });
        res.json({ success: true, user: row });
    });
});

app.post('/api/user/update-full', (req, res) => {
    const { userId, fio, weight, birthDate, password, gender } = req.body;
    let query = "UPDATE Users SET FIO = ?, Weight = ?, BirthDate = ?, Gender = ? WHERE UserID = ?";
    let params = [fio, weight, birthDate, gender, userId];

    if (password && password.trim() !== "") {
        query = "UPDATE Users SET FIO = ?, Weight = ?, BirthDate = ?, Gender = ?, Password = ? WHERE UserID = ?";
        params = [fio, weight, birthDate, gender, password, userId];
    }

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

app.post('/api/user/add-balance', (req, res) => {
    const { userId, amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false });
    db.run("UPDATE Users SET Balance = Balance + ? WHERE UserID = ?", [amount, userId], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

app.post('/api/apply', (req, res) => {
    const { userId, compId } = req.body;
    
    db.get(`
        SELECT u.FIO, u.Email, u.Balance, u.Gender, u.Weight, c.Title, c.EntryFee, c.Categories
        FROM Users u, Competitions c 
        WHERE u.UserID = ? AND c.CompID = ?
    `, [userId, compId], (err, data) => {
        if (err || !data) return res.status(404).json({ success: false, message: "Данные не найдены" });
        
        if (data.Balance < data.EntryFee) {
            return res.json({ success: false, message: "Недостаточно средств на балансе" });
        }
        
        // Автоматическое определение категории по весу и полу
        let autoCategory = '';
        const categories = data.Categories ? data.Categories.split(',').map(c => c.trim()) : [];
        const genderCats = categories.filter(c => c.includes(data.Gender));
        
        if (genderCats.length > 0) {
            const sortedCats = [...genderCats].sort((a, b) => {
                const getWeight = (cat) => {
                    const match = cat.match(/(\d+)/);
                    return match ? parseInt(match[0]) : 999;
                };
                return getWeight(a) - getWeight(b);
            });
            
            for (let cat of sortedCats) {
                const numbers = cat.match(/(\d+)/g);
                if (numbers) {
                    if (cat.toLowerCase().includes('до')) {
                        if (data.Weight <= parseInt(numbers[0])) {
                            autoCategory = cat;
                            break;
                        }
                    } else if (cat.toLowerCase().includes('свыше')) {
                        if (data.Weight >= parseInt(numbers[0])) {
                            autoCategory = cat;
                            break;
                        }
                    } else if (numbers.length >= 2) {
                        if (data.Weight >= parseInt(numbers[0]) && data.Weight < parseInt(numbers[1])) {
                            autoCategory = cat;
                            break;
                        }
                    }
                }
            }
            if (!autoCategory) autoCategory = sortedCats[0];
        }
        
        db.run("INSERT INTO Applications (UserID, CompID, IsPaid, Status, Category) VALUES (?, ?, 0, 'Pending', ?)", 
            [userId, compId, autoCategory], async function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: "Заявка уже подана" });
            }
            
            try {
                await sendEmail(data.Email, 'Заявка на турнир подана', `<h1>Заявка подана!</h1><p>Турнир: ${data.Title}</p><p>Рекомендуемая категория: ${autoCategory}</p>`);
            } catch(emailError) {
                console.error('❌ Ошибка отправки письма:', emailError);
            }
            
            res.json({ success: true, message: "Заявка успешно отправлена! Рекомендуемая категория: " + autoCategory });
        });
    });
});

// ==========================================
// 3. ФУНКЦИИ АДМИНА
// ==========================================

app.get('/api/admin/users', (req, res) => {
    const sql = `SELECT UserID, FIO, Email, Phone, Weight, Rank, Role, Password, BirthDate, SkillLevel, Balance, Gender FROM Users`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/update-role', (req, res) => {
    const { userId, newRole } = req.body;
    db.run("UPDATE Users SET Role = ? WHERE UserID = ?", [newRole, userId], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

app.post('/api/admin/update-user-full', (req, res) => {
    const { userId, fio, weight, rank, role, email, phone, birthDate, skillLevel, balance, password, gender } = req.body;
    
    let sql, params;
    if (password) {
        sql = `UPDATE Users SET FIO=?, Weight=?, Rank=?, Role=?, Email=?, Phone=?, BirthDate=?, SkillLevel=?, Balance=?, Password=?, Gender=? WHERE UserID=?`;
        params = [fio, weight, rank, role, email, phone, birthDate, skillLevel, balance, password, gender, userId];
    } else {
        sql = `UPDATE Users SET FIO=?, Weight=?, Rank=?, Role=?, Email=?, Phone=?, BirthDate=?, SkillLevel=?, Balance=?, Gender=? WHERE UserID=?`;
        params = [fio, weight, rank, role, email, phone, birthDate, skillLevel, balance, gender, userId];
    }
    
    db.run(sql, params, function(err) {
        res.json({ success: !err });
    });
});

// ==========================================
// 4. ЗАЯВКИ НА ОРГАНИЗАТОРА
// ==========================================

app.post('/api/organizer/request', (req, res) => {
    const { fio, email, phone, password, message } = req.body;
    
    if (!fio || !email || !phone || !password) {
        return res.status(400).json({ success: false, message: 'Заполните все поля' });
    }

    db.run(
        `INSERT INTO OrganizerRequests (FIO, Email, Phone, Password, Message, Status) 
         VALUES (?, ?, ?, ?, ?, 'Pending')`,
        [fio, email, phone, password, message || ''],
        async function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Ошибка базы данных: ' + err.message });
            }
            
            try {
                await sendEmail(email, 'Заявка на организатора отправлена', '<div>Заявка отправлена!</div>');
            } catch(emailError) {
                console.error('❌ Ошибка отправки письма:', emailError);
            }
            
            res.json({ success: true, requestId: this.lastID });
        }
    );
});

app.get('/api/admin/organizer-requests', (req, res) => {
    db.all("SELECT * FROM OrganizerRequests WHERE Status = 'Pending' ORDER BY CreatedAt DESC", [], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

app.post('/api/admin/approve-organizer', (req, res) => {
    const { requestId } = req.body;
    
    db.get("SELECT * FROM OrganizerRequests WHERE RequestID = ?", [requestId], (err, request) => {
        if (err || !request) {
            return res.status(404).json({ success: false, message: 'Заявка не найдена' });
        }

        db.run(
            `INSERT INTO Users (FIO, Email, Password, Role, Balance) 
             VALUES (?, ?, ?, 'Organizer', 0)`,
            [request.FIO, request.Email, request.Password],
            function(err) {
                if (err && !err.message.includes('UNIQUE')) {
                    return res.status(500).json({ success: false, message: 'Ошибка создания пользователя' });
                }
                
                db.run(
                    "UPDATE OrganizerRequests SET Status = 'Approved', ProcessedAt = CURRENT_TIMESTAMP WHERE RequestID = ?",
                    [requestId],
                    async function() {
                        try {
                            await sendEmail(request.Email, '✅ Заявка одобрена', '<div>Вы стали организатором!</div>');
                        } catch(e) {}
                        res.json({ success: true });
                    }
                );
            }
        );
    });
});

app.post('/api/admin/reject-request', (req, res) => {
    const { requestId } = req.body;
    
    db.get("SELECT * FROM OrganizerRequests WHERE RequestID = ?", [requestId], (err, request) => {
        if (err || !request) return res.status(404).json({ success: false });
        
        db.run("UPDATE OrganizerRequests SET Status = 'Rejected', ProcessedAt = CURRENT_TIMESTAMP WHERE RequestID = ?", [requestId], async () => {
            try {
                await sendEmail(request.Email, '❌ Заявка отклонена', '<div>Ваша заявка отклонена</div>');
            } catch(e) {}
            res.json({ success: true });
        });
    });
});

// ==========================================
// 5. ФУНКЦИИ ОРГАНИЗАТОРА
// ==========================================

app.get('/api/competitions', (req, res) => {
    db.all("SELECT * FROM Competitions WHERE IsCompleted = 0 ORDER BY EventDate DESC", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

app.get('/api/competitions/by-level/:level', (req, res) => {
    const level = req.params.level;
    const query = `SELECT * FROM Competitions WHERE Level = ? AND IsCompleted = 0 AND Status = 'Registration' ORDER BY EventDate DESC`;
    db.all(query, [level], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/competitions/create', (req, res) => {
    const { title, location, eventDate, entryFee, organizerId, categories, level } = req.body;
    
    let levelRank = 2;
    let levelName = level || 'Городские';
    
    if (levelName === 'Районные') levelRank = 1;
    else if (levelName === 'Городские') levelRank = 2;
    else if (levelName === 'Республиканские') levelRank = 3;
    
    db.get("SELECT FIO FROM Users WHERE UserID = ?", [organizerId], (err, org) => {
        if (err || !org) return res.status(404).json({ success: false, message: 'Организатор не найден' });

        const query = `INSERT INTO Competitions 
                       (Title, Location, EventDate, EntryFee, OrganizerID, OrganizerFIO, Status, Categories, Level, LevelRank) 
                       VALUES (?, ?, ?, ?, ?, ?, 'Registration', ?, ?, ?)`;
        
        db.run(query, [title, location, eventDate, entryFee, organizerId, org.FIO, categories, levelName, levelRank], function(err) {
            if (err) return res.status(500).json(err);
            res.json({ success: true, compId: this.lastID });
        });
    });
});

app.get('/api/organizer/competitions/:organizerId', (req, res) => {
    const organizerId = req.params.organizerId;
    db.all("SELECT * FROM Competitions WHERE OrganizerID = ? ORDER BY EventDate DESC", [organizerId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/organizer/applications/:organizerId', (req, res) => {
    const organizerId = req.params.organizerId;
    const query = `
        SELECT 
            a.AppID, a.UserID, u.FIO, u.Email, u.Weight, u.Rank, u.Balance, u.Gender,
            a.CompID, c.Title as CompTitle, c.EntryFee, c.Categories, a.Category as SuggestedCategory
        FROM Applications a
        JOIN Users u ON a.UserID = u.UserID
        JOIN Competitions c ON a.CompID = c.CompID
        WHERE c.OrganizerID = ? AND a.IsPaid = 0 AND a.Status = 'Pending'
    `;
    db.all(query, [organizerId], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

app.get('/api/organizer/confirmed/:organizerId', (req, res) => {
    const organizerId = req.params.organizerId;
    const query = `
        SELECT a.AppID, a.UserID, u.FIO, u.Email, u.Weight, u.Rank, u.BirthDate, u.Gender, a.Category, a.CompID, c.Title
        FROM Applications a
        JOIN Users u ON a.UserID = u.UserID
        JOIN Competitions c ON a.CompID = c.CompID
        WHERE c.OrganizerID = ? AND a.IsPaid = 1
    `;
    db.all(query, [organizerId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/organizer/pay', (req, res) => {
    const { appId, userId, fee, category } = req.body;
    
    db.get("SELECT Balance, Email, FIO, Gender FROM Users WHERE UserID = ?", [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: "Пользователь не найден" });
        if (user.Balance < fee) return res.json({ success: false, message: "Недостаточно средств" });

        db.get("SELECT c.Title FROM Applications a JOIN Competitions c ON a.CompID = c.CompID WHERE a.AppID = ?", [appId], (err, comp) => {
            if (err) return res.status(500).json({ success: false });

            db.serialize(() => {
                db.run("UPDATE Users SET Balance = Balance - ? WHERE UserID = ?", [fee, userId]);
                db.run("UPDATE Applications SET IsPaid = 1, Category = ? WHERE AppID = ?", [category, appId], async function(err) {
                    if (err) return res.status(500).json({ success: false });
                    
                    try {
                        await sendEmail(user.Email, '✅ Заявка подтверждена', `<div>Заявка на турнир ${comp.Title} подтверждена! Категория: ${category}</div>`);
                    } catch(emailError) {}
                    
                    res.json({ success: true, message: "Оплата подтверждена!" });
                });
            });
        });
    });
});

// ==========================================
// 6. МАССОВАЯ ПОДАЧА ЗАЯВОК (АДМИН)
// ==========================================

app.post('/api/admin/apply-all', (req, res) => {
    const { compId } = req.body;
    if (!compId) return res.status(400).json({ success: false, message: "Не выбран турнир" });

    db.all("SELECT UserID, Weight, Gender FROM Users WHERE Role = 'User'", [], (err, users) => {
        if (err) return res.status(500).json({ success: false, message: err.message });

        let successCount = 0;
        db.serialize(() => {
            const stmt = db.prepare("INSERT OR IGNORE INTO Applications (UserID, CompID, IsPaid, Status) VALUES (?, ?, 0, 'Pending')");
            users.forEach(user => {
                stmt.run(user.UserID, compId, function(err) { if (!err) successCount++; });
            });
            stmt.finalize(() => {
                res.json({ success: true, count: successCount });
            });
        });
    });
});

app.post('/api/admin/apply-all-with-distribution', (req, res) => {
    const { compId, participantsPerCategory, categories } = req.body;
    if (!compId) return res.status(400).json({ success: false, message: "Не выбран турнир" });
    
    db.all("SELECT UserID, Weight, FIO, Gender FROM Users WHERE Role = 'User' AND Weight IS NOT NULL AND Weight > 0", [], (err, users) => {
        if (err || !users || users.length === 0) {
            return res.json({ success: false, message: "Нет пользователей для подачи заявок" });
        }
        
        const sortedUsers = [...users].sort((a, b) => (a.Weight || 0) - (b.Weight || 0));
        
        db.get("SELECT Categories FROM Competitions WHERE CompID = ?", [compId], (err, comp) => {
            let categoryList = categories || (comp?.Categories?.split(',').map(c => c.trim()) || ["До 70кг", "До 85кг", "До 100кг", "Свыше 100кг"]);
            
            const participantsPerCat = participantsPerCategory || 4;
            const categoryRanges = categoryList.map(cat => {
                let minWeight = 0, maxWeight = 999;
                const numbers = cat.match(/(\d+)/g);
                if (numbers) {
                    if (cat.toLowerCase().includes('до')) maxWeight = parseInt(numbers[0]);
                    else if (cat.toLowerCase().includes('свыше')) minWeight = parseInt(numbers[0]);
                    else if (numbers.length >= 2) { minWeight = parseInt(numbers[0]); maxWeight = parseInt(numbers[1]); }
                    else if (numbers.length === 1) maxWeight = parseInt(numbers[0]);
                }
                return { name: cat, minWeight, maxWeight, maxParticipants: participantsPerCat, participants: [] };
            });
            
            let remainingUsers = [...sortedUsers];
            for (let category of categoryRanges) {
                const eligibleUsers = remainingUsers.filter(u => u.Weight >= category.minWeight && u.Weight < category.maxWeight);
                const taken = eligibleUsers.slice(0, category.maxParticipants);
                category.participants = taken;
                taken.forEach(t => {
                    const index = remainingUsers.findIndex(u => u.UserID === t.UserID);
                    if (index !== -1) remainingUsers.splice(index, 1);
                });
            }
            
            let successCount = 0;
            const stmt = db.prepare("INSERT OR IGNORE INTO Applications (UserID, CompID, IsPaid, Status, Category) VALUES (?, ?, 0, 'Pending', ?)");
            for (let category of categoryRanges) {
                for (let user of category.participants) {
                    stmt.run(user.UserID, compId, category.name, function(err) { if (!err) successCount++; });
                }
            }
            stmt.finalize(() => {
                res.json({ success: true, count: successCount, message: `Успешно подано ${successCount} заявок` });
            });
        });
    });
});

// ==========================================
// 7. ПРОТОКОЛЫ
// ==========================================

app.post('/api/protocol/save', (req, res) => {
    const { compId, title, category, results, handResults } = req.body;
    
    if (!compId || !results) {
        return res.status(400).json({ success: false, message: "Недостаточно данных" });
    }
    
    const stmt = db.prepare(`
        INSERT INTO Protocols (CompID, Category, Place, UserID, FIO, WinsLeft, WinsRight, LossesLeft, LossesRight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        stmt.run(
            compId, 
            category || 'Общий', 
            r.place || i + 1,
            r.userId,
            r.fio,
            r.leftWins || 0,
            r.rightWins || 0,
            r.leftLoss || 0,
            r.rightLoss || 0
        );
    }
    
    stmt.finalize((err) => {
        if (err) {
            console.error("Ошибка сохранения протокола:", err);
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true, message: "Протокол сохранен в БД" });
    });
});

app.get('/api/protocol/by-competition/:compId', (req, res) => {
    const compId = req.params.compId;
    
    const query = `
        SELECT * FROM Protocols 
        WHERE CompID = ? 
        ORDER BY 
            CASE WHEN Category = 'Общая' THEN 0 ELSE 1 END,
            Place ASC
    `;
    
    db.all(query, [compId], (err, rows) => {
        if (err) {
            console.error("Ошибка загрузки протокола:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.get('/api/protocol/participants/:compId', (req, res) => {
    const compId = req.params.compId;
    
    const query = `
        SELECT 
            a.UserID,
            u.FIO,
            u.Weight,
            a.Category,
            p.Place,
            p.WinsLeft,
            p.WinsRight,
            p.LossesLeft,
            p.LossesRight
        FROM Applications a
        JOIN Users u ON a.UserID = u.UserID
        LEFT JOIN Protocols p ON p.UserID = a.UserID AND p.CompID = a.CompID
        WHERE a.CompID = ? AND a.IsPaid = 1
        ORDER BY a.Category, p.Place ASC
    `;
    
    db.all(query, [compId], (err, rows) => {
        if (err) {
            console.error("Ошибка:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// ==========================================
// 8. СОХРАНЕНИЕ ПРОТОКОЛА (ОСНОВНОЙ)
// ==========================================

app.post('/api/save-protocol', (req, res) => {
    const { results } = req.body;
    
    console.log('📝 Получен запрос на сохранение протокола:', results?.length || 0, 'записей');
    
    if (!results || !results.length) {
        return res.status(400).json({ success: false, message: 'Нет данных' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    let completed = 0;
    
    const compId = results[0].compId;
    
    // Сначала удаляем старые результаты этого турнира
    db.run('DELETE FROM Protocols WHERE CompID = ?', [compId], (err) => {
        if (err) {
            console.error('Ошибка очистки:', err.message);
        }
        
        if (results.length === 0) {
            return res.json({ success: true, message: 'Нет данных для сохранения' });
        }
        
        // Вставляем новые результаты
        results.forEach(r => {
            const query = `INSERT INTO Protocols (CompID, Category, UserID, FIO, WinsLeft, WinsRight, LossesLeft, LossesRight, CreatedAt)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
            db.run(query, [r.compId, r.category, r.userId, r.fio, r.winsLeft, r.winsRight, r.lossesLeft, r.lossesRight], function(err) {
                if (err) {
                    console.error('Ошибка вставки:', err.message);
                    errorCount++;
                } else {
                    successCount++;
                }
                completed++;
                if (completed === results.length) {
                    console.log(`✅ Протокол сохранен: ${successCount} записей, ошибок: ${errorCount}`);
                    res.json({ success: true, message: `Сохранено: ${successCount}, ошибок: ${errorCount}` });
                }
            });
        });
    });
});

app.get('/api/get-protocol/:compId', (req, res) => {
    const compId = req.params.compId;
    db.all('SELECT * FROM Protocols WHERE CompID = ? ORDER BY Category, UserID', [compId], (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, results: rows });
        }
    });
});

// ==========================================
// 9. РЕДАКТИРОВАНИЕ И ЗАВЕРШЕНИЕ ТУРНИРОВ
// ==========================================

app.post('/api/organizer/edit-competition', (req, res) => {
    const { compId, title, location, eventDate, entryFee, maxParticipants, level, status, categories } = req.body;
    
    if (!compId) {
        return res.status(400).json({ success: false, message: "Не указан ID турнира" });
    }
    
    const query = `
        UPDATE Competitions 
        SET Title = ?, Location = ?, EventDate = ?, EntryFee = ?, 
            MaxParticipants = ?, Level = ?, Status = ?, Categories = ?
        WHERE CompID = ?
    `;
    
    db.run(query, [title, location, eventDate, entryFee, maxParticipants, level, status, categories, compId], function(err) {
        if (err) {
            console.error("Ошибка обновления:", err);
            return res.status(500).json({ success: false, message: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: "Турнир не найден" });
        }
        
        console.log(`✅ Турнир ${compId} обновлен`);
        res.json({ success: true, message: "Турнир обновлен" });
    });
});

app.post('/api/organizer/complete-competition', (req, res) => {
    const { compId } = req.body;
    
    if (!compId) {
        return res.status(400).json({ success: false, message: "Не указан ID турнира" });
    }
    
    console.log(`📝 Завершаем турнир ID: ${compId}`);
    
    db.run("UPDATE Competitions SET Status = 'Completed' WHERE CompID = ?", [compId], function(err) {
        if (err) {
            console.error("❌ Ошибка завершения турнира:", err);
            return res.status(500).json({ success: false, message: err.message });
        }
        
        if (this.changes === 0) {
            console.log(`⚠️ Турнир ${compId} не найден`);
            return res.status(404).json({ success: false, message: "Турнир не найден" });
        }
        
        console.log(`✅ Турнир ${compId} успешно завершен! Status: Completed`);
        res.json({ success: true, message: "Турнир завершен" });
    });
});

app.post('/api/organizer/cancel-competition', (req, res) => {
    const { compId } = req.body;
    
    if (!compId) {
        return res.status(400).json({ success: false, message: "Не указан ID турнира" });
    }
    
    db.run("UPDATE Competitions SET Status = 'Cancelled' WHERE CompID = ?", [compId], function(err) {
        if (err) {
            console.error("❌ Ошибка отмены турнира:", err);
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true, message: "Турнир отменен" });
    });
});

// ==========================================
// 10. ЗАЯВКИ ПОЛЬЗОВАТЕЛЯ
// ==========================================

app.get('/api/user/applications/:userId', (req, res) => {
    const userId = req.params.userId;
    const query = `
        SELECT a.*, c.Title as TournamentTitle, c.EventDate, c.Location, c.EntryFee
        FROM Applications a
        JOIN Competitions c ON a.CompID = c.CompID
        WHERE a.UserID = ?
        ORDER BY c.EventDate DESC
    `;
    db.all(query, [userId], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

// ==========================================
// 11. ДИАГНОСТИЧЕСКИЕ ЭНДПОИНТЫ
// ==========================================

app.get('/api/debug/all-applications', (req, res) => {
    const query = `
        SELECT a.AppID, a.UserID, u.FIO, u.Weight, u.Gender, a.CompID, c.Title as CompTitle, a.Category, a.Status, a.IsPaid, c.OrganizerID
        FROM Applications a
        JOIN Users u ON a.UserID = u.UserID
        JOIN Competitions c ON a.CompID = c.CompID
        ORDER BY a.AppID DESC LIMIT 30
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/organizer/applications/debug/:organizerId', (req, res) => {
    const organizerId = req.params.organizerId;
    const query = `
        SELECT a.AppID, a.UserID, u.FIO, u.Weight, u.Gender, a.CompID, c.Title as CompTitle, a.Category, a.Status, a.IsPaid, c.OrganizerID
        FROM Applications a
        JOIN Users u ON a.UserID = u.UserID
        JOIN Competitions c ON a.CompID = c.CompID
        WHERE c.OrganizerID = ? ORDER BY a.AppID DESC
    `;
    db.all(query, [organizerId], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

app.get('/api/debug/application/:appId', (req, res) => {
    const appId = req.params.appId;
    const query = `
        SELECT a.*, u.FIO, u.Email, u.Weight, u.Gender, c.Title as CompTitle, c.OrganizerID
        FROM Applications a
        JOIN Users u ON a.UserID = u.UserID
        JOIN Competitions c ON a.CompID = c.CompID
        WHERE a.AppID = ?
    `;
    db.get(query, [appId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// ==========================================
// ЗАПУСК СЕРВЕРА
// ==========================================

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ СЕРВЕР РАБОТАЕТ: http://localhost:${PORT}`);
    console.log(`👥 База данных подключена`);
});