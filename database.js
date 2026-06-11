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
    // ТЕСТОВЫЕ ДАННЫЕ
    // ========================================
    
    // Админ по умолчанию (пол не указываем)
    const adminFio = 'adm';
    const adminPass = '123123';
    const adminEmail = 'adm@localhost.com';
    
    db.get("SELECT * FROM Users WHERE Email = ?", [adminEmail], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO Users (FIO, Password, Role, Email)
                   VALUES (?, ?, 'Admin', ?)`, [adminFio, adminPass, adminEmail]);
            console.log(`✅ Создан администратор: ${adminEmail} / ${adminPass}`);
        }
    });

    // Тестовый организатор (пол не указываем)
    db.get("SELECT * FROM Users WHERE Email = ?", ['org@test.by'], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO Users (FIO, Password, Role, Email, Phone, Rank, Weight)
                   VALUES ('Организатор Test', '123', 'Organizer', 'org@test.by', '+375291234567', 'МС', 85)`);
            console.log("✅ Создан тестовый организатор: org@test.by / 123");
        }
    });

    // Тестовые атлеты (с указанием пола)
    const testAthletes = [
        {fio: 'Иванов Иван', weight: 75, rank: 'КМС', gender: 'Мужской', email: 'ivan@test.by', phone: '+375291111111'},
        {fio: 'Петрова Анна', weight: 65, rank: '1 разряд', gender: 'Женский', email: 'anna@test.by', phone: '+375292222222'},
        {fio: 'Сидоров Сидор', weight: 85, rank: 'МС', gender: 'Мужской', email: 'sidor@test.by', phone: '+375293333333'},
        {fio: 'Козлова Елена', weight: 58, rank: 'КМС', gender: 'Женский', email: 'elena@test.by', phone: '+375294444444'},
        {fio: 'Смирнов Алексей', weight: 95, rank: 'МСМК', gender: 'Мужской', email: 'alex@test.by', phone: '+375295555555'}
    ];

    testAthletes.forEach((athlete) => {
        db.get("SELECT * FROM Users WHERE Email = ?", [athlete.email], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO Users (FIO, Password, Weight, Rank, Role, Email, Phone, Gender)
                       VALUES (?, '123', ?, ?, 'User', ?, ?, ?)`,
                    [athlete.fio, athlete.weight, athlete.rank, athlete.email, athlete.phone, athlete.gender]);
                console.log(`✅ Создан тестовый атлет: ${athlete.fio} (${athlete.gender})`);
            }
        });
    });

    console.log("✅ База данных ARM BY полностью инициализирована!");
    console.log("📊 Таблицы: Users, Competitions, Applications, OrganizerRequests, Protocols");
    console.log("🏆 Уровни соревнований: Районные (1), Городские (2), Республиканские (3)");
    console.log("👥 Пользователи теперь имеют поле Gender (Мужской/Женский)");
});

module.exports = db;