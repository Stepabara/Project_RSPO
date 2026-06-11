// database.js - добавляем поле Gender

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'arm_wrestling.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("🗄️ Инициализация базы данных ARM BY...");

    // ========================================
    // 1. ОСНОВНАЯ ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ (с полом)
    // ========================================
    db.run(`CREATE TABLE IF NOT EXISTS Users (
        UserID INTEGER PRIMARY KEY AUTOINCREMENT,
        FIO TEXT NOT NULL,
        Password TEXT NOT NULL,
        Role TEXT DEFAULT 'User',
        Email TEXT UNIQUE,
        Phone TEXT,
        BirthDate TEXT,
        Weight REAL DEFAULT 0,
        SkillLevel INTEGER DEFAULT 1,
        Rank TEXT DEFAULT 'Б/Р',
        Gender TEXT DEFAULT 'Мужской',
        TelegramUsername TEXT,
        IsActive INTEGER DEFAULT 1,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ========================================
    // 2. ТАБЛИЦА СОРЕВНОВАНИЙ
    // ========================================
    db.run(`CREATE TABLE IF NOT EXISTS Competitions (
        CompID INTEGER PRIMARY KEY AUTOINCREMENT,
        Title TEXT NOT NULL,
        OrganizerID INTEGER NOT NULL,
        OrganizerFIO TEXT NOT NULL,
        Location TEXT,
        EventDate TEXT,
        Status TEXT DEFAULT 'Registration',
        Categories TEXT DEFAULT 'Общая',
        MaxParticipants INTEGER DEFAULT 64,
        Level TEXT DEFAULT 'Городские',
        LevelRank INTEGER DEFAULT 2,
        IsCompleted INTEGER DEFAULT 0,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (OrganizerID) REFERENCES Users(UserID)
    )`);

    // ========================================
    // 3. ЗАЯВКИ АТЛЕТОВ НА ТУРНИРЫ
    // ========================================
    db.run(`CREATE TABLE IF NOT EXISTS Applications (
        AppID INTEGER PRIMARY KEY AUTOINCREMENT,
        UserID INTEGER,
        CompID INTEGER,
        IsPaid INTEGER DEFAULT 0,
        Status TEXT DEFAULT 'Pending',
        Category TEXT,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (UserID) REFERENCES Users(UserID),
        FOREIGN KEY (CompID) REFERENCES Competitions(CompID),
        UNIQUE(UserID, CompID)
    )`);

    // ========================================
    // 4. ЗАЯВКИ НА РОЛЬ ОРГАНИЗАТОРА
    // ========================================
    db.run(`CREATE TABLE IF NOT EXISTS OrganizerRequests (
        RequestID INTEGER PRIMARY KEY AUTOINCREMENT,
        FIO TEXT NOT NULL,
        Email TEXT NOT NULL,
        Phone TEXT NOT NULL,
        Password TEXT NOT NULL,
        Message TEXT,
        Status TEXT DEFAULT 'Pending',
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        ProcessedBy INTEGER,
        ProcessedAt DATETIME
    )`);

    // ========================================
    // 5. ПРОТОКОЛЫ
    // ========================================
    db.run(`CREATE TABLE IF NOT EXISTS Protocols (
        ProtoID INTEGER PRIMARY KEY AUTOINCREMENT,
        CompID INTEGER,
        Category TEXT,
        Place INTEGER,
        UserID INTEGER,
        FIO TEXT,
        Weight REAL DEFAULT 0,
        Gender TEXT DEFAULT 'Мужской',
        WinsLeft INTEGER DEFAULT 0,
        WinsRight INTEGER DEFAULT 0,
        LossesLeft INTEGER DEFAULT 0,
        LossesRight INTEGER DEFAULT 0,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (CompID) REFERENCES Competitions(CompID),
        FOREIGN KEY (UserID) REFERENCES Users(UserID)
    )`);


    // ========================================
    // МИГРАЦИЯ: Добавляем поле Gender если его нет
    // ========================================
    db.all("PRAGMA table_info(Users)", (err, rows) => {
        if (err) {
            console.error("Ошибка проверки структуры:", err);
            return;
        }
        const hasGender = rows.some(row => row.name === 'Gender');
        if (!hasGender) {
            db.run("ALTER TABLE Users ADD COLUMN Gender TEXT DEFAULT 'Мужской'", (err) => {
                if (err) {
                    console.error("Ошибка добавления Gender:", err);
                } else {
                    console.log("✅ Добавлено поле Gender в таблицу Users");
                }
            });
        } else {
            console.log("✅ Поле Gender уже существует");
        }
    });

    // ========================================
    // МИГРАЦИЯ: Добавляем OrganizerFIO если нет
    // ========================================
    db.all("PRAGMA table_info(Competitions)", (err, rows) => {
        if (err) return;
        const hasOrganizerFIO = rows.some(row => row.name === 'OrganizerFIO');
        if (!hasOrganizerFIO) {
            db.run("ALTER TABLE Competitions ADD COLUMN OrganizerFIO TEXT NOT NULL DEFAULT 'Неизвестно'");
            console.log("✅ Добавлена колонка OrganizerFIO");
        }
    });

    // ========================================
    // МИГРАЦИЯ: Добавляем Weight и Gender в Protocols
    // ========================================
    db.all("PRAGMA table_info(Protocols)", (err, rows) => {
        if (err) return;
        const hasWeight = rows.some(row => row.name === 'Weight');
        if (!hasWeight) {
            db.run("ALTER TABLE Protocols ADD COLUMN Weight REAL DEFAULT 0", (err) => {
                if (err) console.error("Ошибка добавления Weight:", err);
                else console.log("✅ Добавлена колонка Weight в Protocols");
            });
        }
        const hasGender = rows.some(row => row.name === 'Gender');
        if (!hasGender) {
            db.run("ALTER TABLE Protocols ADD COLUMN Gender TEXT DEFAULT 'Мужской'", (err) => {
                if (err) console.error("Ошибка добавления Gender:", err);
                else console.log("✅ Добавлена колонка Gender в Protocols");
            });
        }
    });

    // ========================================
    // ТЕСТОВЫЕ ДАННЫЕ
    // ========================================

    // ========================================
    // ТЕСТОВЫЕ ДАННЫЕ (последовательно через serialize)
    // ========================================

    // Админ
    db.run(`INSERT OR IGNORE INTO Users (FIO, Password, Role, Email, Weight, Gender)
           VALUES ('adm', '123123', 'Admin', 'adm@localhost.com', 80, 'Мужской')`);
    console.log("✅ Администратор: adm@localhost.com / 123123");

    // Организатор
    db.run(`INSERT OR IGNORE INTO Users (FIO, Password, Role, Email, Phone, Rank, Weight, Gender)
           VALUES ('org', '123123', 'Organizer', 'org@test.by', '+375291234567', 'МС', 85, 'Мужской')`);
    console.log("✅ Организатор: org@test.by / 123123");

    // Атлеты (8 мужчин + 4 женщины)
    const testAthletes = [
        {fio: 'Иванов Иван', weight: 68, rank: 'КМС', gender: 'Мужской', email: 'ivan@test.by', phone: '+375291111111'},
        {fio: 'Петров Пётр', weight: 74, rank: '1 разряд', gender: 'Мужской', email: 'petrov@test.by', phone: '+375292222222'},
        {fio: 'Сидоров Сидор', weight: 82, rank: 'МС', gender: 'Мужской', email: 'sidor@test.by', phone: '+375293333333'},
        {fio: 'Козлов Дмитрий', weight: 90, rank: 'МС', gender: 'Мужской', email: 'kozlov@test.by', phone: '+375294444444'},
        {fio: 'Смирнов Алексей', weight: 105, rank: 'МСМК', gender: 'Мужской', email: 'alex@test.by', phone: '+375295555555'},
        {fio: 'Николаев Артём', weight: 78, rank: 'КМС', gender: 'Мужской', email: 'nikolaev@test.by', phone: '+375296666666'},
        {fio: 'Фёдоров Максим', weight: 88, rank: '1 разряд', gender: 'Мужской', email: 'fedorov@test.by', phone: '+375297777777'},
        {fio: 'Орлов Виктор', weight: 98, rank: 'МСМК', gender: 'Мужской', email: 'orlov@test.by', phone: '+375298888888'},
        {fio: 'Петрова Анна', weight: 55, rank: '1 разряд', gender: 'Женский', email: 'anna@test.by', phone: '+375299999999'},
        {fio: 'Козлова Елена', weight: 62, rank: 'КМС', gender: 'Женский', email: 'elena@test.by', phone: '+375291112222'},
        {fio: 'Новикова Мария', weight: 68, rank: 'КМС', gender: 'Женский', email: 'novikova@test.by', phone: '+375291133333'},
        {fio: 'Морокова Ольга', weight: 75, rank: 'МС', gender: 'Женский', email: 'morokova@test.by', phone: '+375291144444'}
    ];

    const athStmt = db.prepare(`INSERT OR IGNORE INTO Users (FIO, Password, Weight, Rank, SkillLevel, Role, Email, Phone, Gender)
                                VALUES (?, '123', ?, ?, ?, 'User', ?, ?, ?)`);
    testAthletes.forEach(a => {
        let skill = 50;
        if (a.rank === 'МСМК') skill = 95 + Math.floor(Math.random() * 6);
        else if (a.rank === 'МС') skill = 85 + Math.floor(Math.random() * 10);
        else if (a.rank === 'КМС') skill = 70 + Math.floor(Math.random() * 15);
        else skill = 40 + Math.floor(Math.random() * 30);
        athStmt.run(a.fio, a.weight, a.rank, skill, a.email, a.phone, a.gender);
        console.log(`✅ Атлет: ${a.fio} (${a.gender}) — ${a.weight}кг, ${a.rank}`);
    });
    athStmt.finalize();

    // Турнир 1 — открытый для регистрации
    db.run(`INSERT OR IGNORE INTO Competitions
           (Title, Location, EventDate, OrganizerID, OrganizerFIO, Status, Categories, Level, LevelRank, MaxParticipants)
           VALUES ('Кубок Минска 2025', 'Минск, Дворец спорта', '2025-12-15', 2, 'org', 'Registration',
                   'Женщины До 60кг,Женщины До 70кг,Женщины Свыше 70кг,Мужчины До 70кг,Мужчины До 80кг,Мужчины До 90кг,Мужчины Свыше 90кг',
                   'Городские', 2, 64)`);
    console.log("✅ Турнир: Кубок Минска 2025 (Registration)");

    // Турнир 2 — завершённый, с протоколом
    db.run(`INSERT OR IGNORE INTO Competitions
           (Title, Location, EventDate, OrganizerID, OrganizerFIO, Status, Categories, Level, LevelRank, MaxParticipants, IsCompleted)
           VALUES ('Чемпионат РБ 2025', 'Гродно, СК Олимпийский', '2025-06-20', 2, 'org', 'Completed',
                   'Женщины До 60кг,Женщины До 70кг,Женщины Свыше 70кг,Мужчины До 70кг,Мужчины До 80кг,Мужчины До 90кг,Мужчины Свыше 90кг',
                   'Республиканские', 3, 128, 1)`);
    console.log("✅ Турнир: Чемпионат РБ 2025 (Completed)");

    // Заполняем протокол для завершённого турнира (CompID = 2)
    const categories = ['Женщины До 60кг', 'Женщины До 70кг', 'Женщины Свыше 70кг',
                       'Мужчины До 70кг', 'Мужчины До 80кг', 'Мужчины До 90кг', 'Мужчины Свыше 90кг'];

    db.all("SELECT * FROM Users WHERE Role = 'User' ORDER BY Gender, Weight", [], (err, athletes) => {
        if (!athletes || athletes.length === 0) return;

        const assigned = {};
        athletes.forEach(a => {
            for (let cat of categories) {
                const genderMatch = (a.Gender === 'Женский' && cat.includes('Женщины')) ||
                                   (a.Gender === 'Мужской' && cat.includes('Мужчины'));
                if (!genderMatch) continue;
                const nums = cat.match(/\d+/g);
                if (!nums) continue;
                if (cat.includes('До') && nums.length === 1 && a.Weight <= parseInt(nums[0])) {
                    if (!assigned[cat]) assigned[cat] = [];
                    assigned[cat].push(a); break;
                } else if (cat.includes('Свыше') && a.Weight > parseInt(nums[0])) {
                    if (!assigned[cat]) assigned[cat] = [];
                    assigned[cat].push(a); break;
                }
            }
        });

        const stmt = db.prepare(`INSERT INTO Protocols (CompID, Category, UserID, FIO, Weight, Gender, WinsLeft, WinsRight, LossesLeft, LossesRight)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (let cat of categories) {
            const aths = assigned[cat];
            if (!aths || aths.length === 0) continue;
            const withResults = aths.map(a => ({
                ...a, winsL: Math.floor(Math.random() * aths.length), winsR: Math.floor(Math.random() * aths.length),
                lossesL: Math.floor(Math.random() * 3), lossesR: Math.floor(Math.random() * 3)
            }));
            withResults.sort((a, b) => (b.winsL + b.winsR) - (a.winsL + a.winsR));
            withResults.forEach(a => {
                stmt.run(2, cat, a.UserID, a.FIO, a.Weight, a.Gender, a.winsL, a.winsR, a.lossesL, a.lossesR);
            });
            console.log(`  📋 ${cat}: ${aths.length} участников`);
        }
        stmt.finalize();
        console.log("✅ Протокол Чемпионата РБ 2025 заполнен");
    });

    // Заявки атлетов на открытый турнир (IsPaid = 1 чтобы были в подтверждённых)
    const appStmt = db.prepare(`INSERT OR IGNORE INTO Applications (UserID, CompID, IsPaid, Status, Category) VALUES (?, 1, 1, 'Approved', ?)`);
    const catMap = {};
    testAthletes.forEach(a => {
        for (let cat of categories) {
            const genderMatch = (a.gender === 'Женский' && cat.includes('Женщины')) ||
                               (a.gender === 'Мужской' && cat.includes('Мужчины'));
            if (!genderMatch) continue;
            const nums = cat.match(/\d+/g);
            if (!nums) continue;
            if (cat.includes('До') && nums.length === 1 && a.weight <= parseInt(nums[0])) {
                catMap[a.email] = cat; break;
            } else if (cat.includes('Свыше') && a.weight > parseInt(nums[0])) {
                catMap[a.email] = cat; break;
            }
        }
    });
    db.all("SELECT UserID, Email FROM Users WHERE Role = 'User'", [], (err, users) => {
        users.forEach(u => {
            if (catMap[u.Email]) {
                appStmt.run(u.UserID, catMap[u.Email]);
            }
        });
        appStmt.finalize();
        console.log("✅ Заявки атлетов на Кубок Минска 2025 созданы (IsPaid=1)");
    });

    console.log("\\n✅ База данных ARM BY полностью инициализирована!");
});

module.exports = db;