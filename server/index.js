// ================= НАЛАШТУВАННЯ СЕРВЕРА =================

// Підключаємо необхідні бібліотеки
const express = require('express'); // Фреймворк для веб-сервера
const http = require('http');       // Стандартний модуль Node.js для HTTP (потрібен для Socket.io)
const { Server } = require("socket.io"); // Бібліотека для веб-сокетів (real-time зв'язок)
const cors = require('cors');       // Дозволяє запити з інших доменів (наприклад, з твого React на localhost:3000)
const { WORD_PACKS } = require('./words');
const MAX_ROOMS = 100;
const app = express();
app.use(cors()); // Дозволяємо всім стукатись на сервер
const TEAM_PRESETS = [
    { name: "🔴 Червоні", color: "#ff6b6b" },
    { name: "🔵 Сині",    color: "#4ecdc4" },
    { name: "🟢 Зелені",  color: "#2ecc71" },
    { name: "🟡 Жовті",   color: "#f1c40f" }
];

// Створюємо HTTP сервер на базі Express
const server = http.createServer(app);

// Налаштовуємо Socket.io
const io = new Server(server, {
    cors: { 
        origin: "*", // Дозволяємо підключення з будь-якого сайту/порту
        methods: ["GET", "POST"] 
    }
});

// ================= ГЛОБАЛЬНІ ЗМІННІ ТА ХЕЛПЕРИ =================

// "База даних" у пам'яті. 
// Ключ - ID кімнати (напр. 'X7A1'), Значення - об'єкт з даними гри.
// УВАГА: При перезавантаженні сервера всі кімнати зникнуть.
const rooms = {};

// Генерує випадковий код кімнати з 4 символів (напр. "A1B2")
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Алгоритм перемішування масиву (Fisher-Yates shuffle)
// Використовується, щоб слова випадали у випадковому порядку
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- ФУНКЦІЯ ОЧИЩЕННЯ + ВИЗНАЧЕННЯ НАСТУПНОГО ГРАВЦЯ ---
function getSafeRoom(room) {
    const { deleteTimeout, timer, deck, ...safeData } = room;
    
    let nextExplainerId = null;
    
    // 👇 НОВА ЛОГІКА ДЛЯ МАСИВУ КОМАНД
    if (room.teams && room.teams[room.currentTeamIndex]) {
        const currentTeamObj = room.teams[room.currentTeamIndex];
        
        if (currentTeamObj.players.length > 0) {
            // Безпечний індекс (щоб не вийти за межі масиву)
            const safeIndex = currentTeamObj.playerIndex % currentTeamObj.players.length;
            const player = currentTeamObj.players[safeIndex];
            if (player) nextExplainerId = player.id;
        }
    }

    return { ...safeData, nextExplainerId };
}

// ================= ОСНОВНА ЛОГІКА SOCKET.IO =================

// Ця функція спрацьовує КОЖНОГО разу, коли хтось відкриває сторінку і підключається
io.on('connection', (socket) => { 
    console.log(`User connected: ${socket.id}`); // socket.id - унікальний ID підключення (змінюється при оновленні сторінки)

        socket.on("create_room", () => {
        // 1. Лимит комнат (защита от перегрузки)
        if (Object.keys(rooms).length >= MAX_ROOMS) {
            socket.emit("error_message", "Сервер перевантажений. Спробуйте пізніше.");
            return;
        }

        // 2. Генерация ID
        let roomId = generateRoomId();
        while (rooms[roomId]) {
            roomId = generateRoomId();
        }

        // 3. Создание объекта комнаты
        rooms[roomId] = {
            hostId: socket.id,
            isLocked: false,
            
            settings: {
                roundTime: 60,
                winScore: 30,
                difficulty: 'normal',
                teamsCount: 2 // По стандарту ставим 2, но структура готова к 1
            },

            // 👇 ГЛАВНОЕ ИЗМЕНЕНИЕ: МАССИВ КОМАНД 👇
            // Мы берем первые 2 пресета (Красные и Синие) и создаем из них объекты
            teams: TEAM_PRESETS.slice(0, 2).map((preset, index) => ({
                id: index,          // ID команды: 0, 1, 2...
                name: preset.name,
                color: preset.color,
                players: [],        // Список игроков этой команды
                score: 0,           // Счет этой команды
                playerIndex: 0      // Чья очередь объяснять в этой команде
            })),

            currentTeamIndex: 0, // Индекс команды, которая сейчас ходит (0)

            // Остальные поля (общие для комнаты)
            spectators: [],
            roundHistory: [],
            roundScore: 0,
            
            activePlayerId: null, // Кто сейчас объясняет (конкретный сокет)
            status: 'lobby',
            deck: [],
            currentWord: null,
            timer: null,
            timeLeft: 60,
            deleteTimeout: null
        };

        socket.join(roomId);
        socket.emit("room_created", roomId);
    });
  // 2. ВХІД У КІМНАТУ (ВИПРАВЛЕНО ПІД НОВІ КОМАНДИ)
    socket.on("join_room", ({ roomId, name }) => {
        const room = rooms[roomId];
        if (room) {
            if (room.deleteTimeout) {
                clearTimeout(room.deleteTimeout);
                room.deleteTimeout = null;
            }

            socket.join(roomId);
            const safeName = name ? name.trim().slice(0, 30) : "Анонім";
            
            // 👇 НОВА ЛОГІКА ПОШУКУ ГРАВЦЯ У ВСІХ КОМАНДАХ 👇
            let existingPlayer = null;
            
            if (room.teams) {
                room.teams.forEach(team => {
                    const found = team.players.find(p => p.name === safeName);
                    if (found) existingPlayer = found;
                });
            }

            // Якщо гравця немає в жодній команді — працюємо зі списком глядачів
            if (!existingPlayer) {
                const existingSpec = room.spectators.find(p => p.name === safeName);
                if (existingSpec) {
                    existingSpec.id = socket.id; // Оновлюємо ID
                } else {
                    room.spectators.push({ id: socket.id, name: safeName });
                }
            }
            
            // Відправляємо дані клієнту
            socket.emit("update_live_history", room.roundHistory);
            io.to(roomId).emit("update_teams", getSafeRoom(room)); 
            
            if (room.status === 'game') {
                 if (room.currentWord) socket.emit("game_started", { word: room.currentWord, explainerId: room.activePlayerId });
                 socket.emit("timer_update", room.timeLeft);
            }
            if (room.status === 'review') {
                socket.emit("round_ended", room.roundHistory);
            }
        }
    });
   // --- 7. ПОЧАТОК РАУНДУ (ВИПРАВЛЕНО) ---
    // --- 7. ПОЧАТОК РАУНДУ (ВИПРАВЛЕНО) ---
    socket.on("request_start", ({ roomId }) => {
        const room = rooms[roomId];
        
        if (room) {
            // 👇 БЕРЕМО КОМАНДУ З МАСИВУ ЗА ІНДЕКСОМ
            const currentTeamObj = room.teams[room.currentTeamIndex];
            if (!currentTeamObj || currentTeamObj.players.length === 0) return; 

            // Визначаємо, хто має пояснювати
            let pIndex = currentTeamObj.playerIndex;
            if (pIndex >= currentTeamObj.players.length) pIndex = 0;

            const targetPlayer = currentTeamObj.players[pIndex];

            // Перевірка прав
            if (socket.id === room.hostId || socket.id === targetPlayer.id) {
                
                if (room.timer) clearInterval(room.timer);

                room.activePlayerId = targetPlayer.id;
                room.status = 'game';
                room.isLocked = true;
                room.roundHistory = []; 
                room.roundScore = 0;    
                
                // Колода слів
                if (!room.deck || room.deck.length === 0) {
                     try {
                        const difficulty = (room.settings && room.settings.difficulty) ? room.settings.difficulty : 'normal';
                        // @ts-ignore
                        const pack = (WORD_PACKS && WORD_PACKS[difficulty]) ? WORD_PACKS[difficulty] : ["Error"];
                        room.deck = shuffleArray([...pack]);
                    } catch (e) { room.deck = ["Error"]; }
                }
                
                const firstWord = room.deck.pop();
                room.currentWord = firstWord; 
                room.timeLeft = room.settings.roundTime; 

                io.to(roomId).emit("update_teams", getSafeRoom(room));
                io.to(roomId).emit("game_started", { word: firstWord, explainerId: room.activePlayerId });
                io.to(roomId).emit("timer_update", room.timeLeft);
                io.to(roomId).emit("update_live_history", []);

                room.timer = setInterval(() => {
                    room.timeLeft--; 
                    io.to(roomId).emit("timer_update", room.timeLeft);

                    if (room.timeLeft <= 0) {
                        clearInterval(room.timer);
                        room.status = 'review';
                        if (room.currentWord) {
                            room.roundHistory.push({ word: room.currentWord, status: 'none' });
                        }
                        io.to(roomId).emit("round_ended", room.roundHistory);
                    }
                }, 1000);
            }
        }
    });

// --- ЗМІНА НАЛАШТУВАНЬ (ОНОВЛЕНО ДЛЯ КОМАНД) ---
    socket.on("update_settings", ({ roomId, key, value }) => {
        const room = rooms[roomId];
        
        if (room && socket.id === room.hostId) {
            
            // 1. ЛОГІКА ЗМІНИ КІЛЬКОСТІ КОМАНД
            if (key === 'teamsCount') {
                const newCount = Number(value);
                if (newCount < 1 || newCount > 4) return; // Валідація (1-4 команди)

                const currentCount = room.teams.length;

                if (newCount > currentCount) {
                    // 👉 ДОДАЄМО КОМАНДИ
                    for (let i = currentCount; i < newCount; i++) {
                        room.teams.push({
                            id: i,
                            name: TEAM_PRESETS[i].name,
                            color: TEAM_PRESETS[i].color,
                            players: [],
                            score: 0,
                            playerIndex: 0
                        });
                    }
                } else if (newCount < currentCount) {
                    // 🗑️ ВИДАЛЯЄМО КОМАНДИ
                    // Всіх гравців із видалених команд кидаємо в глядачі
                    for (let i = newCount; i < currentCount; i++) {
                        const removedTeam = room.teams[i];
                        removedTeam.players.forEach(p => {
                            // Додаємо в глядачі, якщо їх там ще немає
                            if (!room.spectators.find(s => s.id === p.id)) {
                                room.spectators.push(p);
                            }
                        });
                    }
                    // Обрізаємо масив
                    room.teams = room.teams.slice(0, newCount);
                    
                    // Якщо хід був у видаленої команди, скидаємо на першу
                    if (room.currentTeamIndex >= newCount) {
                        room.currentTeamIndex = 0;
                    }
                }
                room.settings.teamsCount = newCount;
            } 
            // 2. ІНШІ НАЛАШТУВАННЯ (Difficulty, RoundTime...)
            else {
                room.settings[key] = value;
                
                if (key === 'difficulty') {
                    room.deck = []; // Скидаємо колоду при зміні складності
                }
                if (key === 'roundTime' && room.status === 'lobby') {
                    room.timeLeft = value;
                    io.to(roomId).emit("timer_update", room.timeLeft);
                }
            }

            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
    socket.on("next_word", ({roomId, action}) => {
        const room = rooms[roomId];
        if (room && room.status === 'game' && room.teams) {
            room.roundHistory.push({ word: room.currentWord, status: action });
            
            if (action === 'guessed') room.roundScore++;
            if (action === 'skipped') room.roundScore--;

            // --- FIX START ---
            // 1. Знаходимо поточну команду
            const activeTeam = room.teams[room.currentTeamIndex];
            
            // 2. Рахуємо "живий" рахунок (поточний збережений + за цей раунд)
            // Ми не зберігаємо це в базу поки що, тільки для відображення
            const currentTotalScore = activeTeam.score + room.roundScore;

            // 3. Формуємо масив рахунків для клієнта
            // Ми беремо реальні бали всіх команд, але для активної підміняємо на "живі"
            const liveScores = room.teams.map((t, i) => 
                i === room.currentTeamIndex ? currentTotalScore : t.score
            );
            
            io.to(roomId).emit("update_score", liveScores);
            // --- FIX END ---
            
            io.to(roomId).emit("update_live_history", room.roundHistory);

            if (room.deck.length > 0) {
                const nextWord = room.deck.pop();
                room.currentWord = nextWord;
                io.to(roomId).emit("update_word", nextWord);
            } else {
                clearInterval(room.timer);
                room.status = 'review';
                io.to(roomId).emit("round_ended", room.roundHistory);
            }
        }
    });

socket.on("change_word_status", ({roomId, index}) => {
        const room = rooms[roomId];
        if (room && room.status === 'review' && room.teams) { // Додав перевірку teams
            const item = room.roundHistory[index];
            if (!item) return;

            if (item.status === 'guessed') item.status = 'skipped';
            else if (item.status === 'skipped') item.status = 'none';
            else item.status = 'guessed';

            let newRoundScore = 0;
            room.roundHistory.forEach(w => {
                if (w.status === 'guessed') newRoundScore++;
                if (w.status === 'skipped') newRoundScore--;
            });
            room.roundScore = newRoundScore;

            // --- FIX START ---
            const activeTeam = room.teams[room.currentTeamIndex];
            const currentTotalScore = activeTeam.score + newRoundScore;

            const liveScores = room.teams.map((t, i) => 
                i === room.currentTeamIndex ? currentTotalScore : t.score
            );

            io.to(roomId).emit("review_update", room.roundHistory);
            io.to(roomId).emit("update_score", liveScores);
            // --- FIX END ---
        }
    });
   // 5. ПІДТВЕРДЖЕННЯ (ЗМІНА ЧЕРГИ)
   socket.on("confirm_round_results", ({ roomId, finalHistory }) => {
    const room = rooms[roomId];

    // Додаємо перевірку на наявність teams
    if (room && room.teams) {
        
        // --- 1. ПІДРАХУНОК БАЛІВ ---
        let finalRoundPoints = 0;
        finalHistory.forEach(item => {
            if (item.status === 'guessed') finalRoundPoints += 1;
            if (item.status === 'skipped') finalRoundPoints -= 1;
        });

        // Визначаємо, яка команда зараз грала
        // room.currentTeamIndex має бути 0, 1, 2...
        const activeTeam = room.teams[room.currentTeamIndex];

        // Додаємо бали прямо в об'єкт команди
        activeTeam.score += finalRoundPoints;


        // --- 2. ЗСУВАЄМО ЧЕРГУ ГРАВЦІВ У ЦІЙ КОМАНДІ ---
        // Замістьвикористовуємо властивість всередині команди
        activeTeam.nextPlayerIndex++;

        // Якщо дійшли до кінця списку гравців цієї команди - починаємо з початку
        if (activeTeam.nextPlayerIndex >= activeTeam.players.length) {
            activeTeam.nextPlayerIndex = 0;
        }


        // --- 3. МІНЯЄМО КОМАНДУ (Універсальна логіка) ---
        // Ця формула працює для будь-якої кількості команд:
        // (0 + 1) % 2 = 1
        // (1 + 1) % 2 = 0
        // (0 + 1) % 1 = 0 (якщо одна команда)
        room.currentTeamIndex = (room.currentTeamIndex + 1) % room.teams.length;

        room.status = 'lobby';

        io.to(roomId).emit("update_teams", getSafeRoom(room));
        
        // Якщо фронтенд чекає "update_score", відправляємо йому масив рахунків
        const scores = room.teams.map(t => t.score);
        io.to(roomId).emit("update_score", scores);
        
        io.to(roomId).emit("results_confirmed");
    }
});

// 6. ПРИЄДНАННЯ ДО КОМАНДИ (FIXED: З ПІДТРИМКОЮ F5)
    socket.on("join_team", ({ roomId, teamIndex, name }) => {
        const room = rooms[roomId];
        if (room) {
            const safeName = name ? name.trim() : "";
            if (!safeName) return;

            // 1. Шукаємо гравця у ВАЖКОМУ МАСИВІ КОМАНД
            let existingPlayer = null;
            let existingTeam = null;

            // Пробігаємось по всіх командах, щоб знайти "себе"
            room.teams.forEach(t => {
                const found = t.players.find(p => p.name === safeName);
                if (found) {
                    existingPlayer = found;
                    existingTeam = t; // Запам'ятовуємо, в якій команді він був
                }
            });

            // 2. Перевірка замка (якщо це НЕ реконнект старого гравця)
            if (room.isLocked && !existingPlayer) {
                socket.emit("error_message", "Команди заблоковані хостом 🔒");
                return; 
            }

            // 3. Видаляємо зі спектаторів (в будь-якому випадку)
            room.spectators = room.spectators.filter(p => p.name !== safeName);

            const targetTeamId = Number(teamIndex);
            const targetTeam = room.teams[targetTeamId];

            if (!targetTeam) return;

            // --- ФУНКЦІЯ ВІДНОВЛЕННЯ (ADAPTED) ---
            // Це те, що я забув! Відновлює права після F5
            const restorePlayerRole = (playerObj) => {
                const oldId = playerObj.id;
                playerObj.id = socket.id; // Оновлюємо ID на новий

                // Відновлення ХОСТА
                if (room.hostId === oldId) {
                    room.hostId = socket.id;
                }

                // Відновлення ВЕДУЧОГО (Критично для гри)
                if (room.activePlayerId === oldId) {
                    room.activePlayerId = socket.id;
                    
                    // Якщо гра йде - відправляємо йому слово знову!
                    if (room.status === 'game' || room.status === 'paused') {
                        socket.emit("game_started", { word: room.currentWord, explainerId: socket.id });
                        socket.emit("update_live_history", room.roundHistory);
                        socket.emit("timer_update", room.timeLeft);
                    }
                }
            };

            // СЦЕНАРІЙ А: Гравець вже є в ЦІЙ ЖЕ команді (F5 / Reconnect)
            if (existingPlayer && existingTeam && existingTeam.id === targetTeamId) {
                restorePlayerRole(existingPlayer);
            } 
            // СЦЕНАРІЙ Б: Новий гравець АБО перехід в іншу команду
            else {
                // Якщо він був в іншій команді — видаляємо звідти
                if (existingTeam) {
                    const oldId = existingPlayer.id; // Зберігаємо старий ID для передачі прав хоста
                    existingTeam.players = existingTeam.players.filter(p => p.name !== safeName);
                    
                    // Якщо він був хостом, переносимо права на новий сокет
                    if (room.hostId === oldId) room.hostId = socket.id;
                }

                // Створюємо нового і додаємо
                const newPlayer = { id: socket.id, name: safeName };
                targetTeam.players.push(newPlayer);
            }

            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
// --- ПЕРЕХІД У ГЛЯДАЧІ ---
  socket.on("join_spectators", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (room) {
        // 1. Перевірка замка (без змін)
        if (room.isLocked) {
            socket.emit("error_message", "Лобі заблоковано хостом 🔒");
            return;
        }

        // --- 2. ВИДАЛЯЄМО З УСІХ КОМАНД (НОВЕ) ---
        if (room.teams) {
            room.teams.forEach(team => {
                // Фільтруємо гравців у кожній команді
                team.players = team.players.filter(p => p.id !== socket.id);
                
                // ВАЖЛИВО: Якщо ми видалили гравця, треба перевірити, 
                // чи не зламався індекс черги (nextPlayerIndex).
                // Якщо він вказує за межі масиву - скидаємо на 0.
                if (team.nextPlayerIndex >= team.players.length) {
                    team.nextPlayerIndex = 0;
                }
            });
        }
        
        // 3. Додаємо в глядачі (без змін)
        if (!room.spectators.find(p => p.id === socket.id)) {
            room.spectators.push({ id: socket.id, name });
        }

        // 4. Скидання активного (без змін)
        if (room.activePlayerId === socket.id) room.activePlayerId = null;
        if (room.nextExplainerId === socket.id) room.nextExplainerId = null; // до речі, це поле теж треба буде перевірити пізніше, як воно рахується

        io.to(roomId).emit("update_teams", getSafeRoom(room));
    }
});

// 5. ПІДТВЕРДЖЕННЯ РЕЗУЛЬТАТІВ + ПЕРЕВІРКА "ФІНАЛЬНОГО КОЛА"
socket.on("confirm_results", ({ roomId }) => {
    const room = rooms[roomId];
    
    // Перевірка на валідність
    if (room && room.teams && (socket.id === room.hostId || socket.id === room.activePlayerId)) {
        
        // 1. Рахуємо бали за раунд
        const roundPoints = room.roundHistory.reduce((acc, item) => {
            if (item.status === 'guessed') return acc + 1;
            if (item.status === 'skipped') return acc - 1;
            return acc;
        }, 0);

        // Знаходимо поточну команду і додаємо бали
        const activeTeam = room.teams[room.currentTeamIndex];
        activeTeam.score += roundPoints;

        // 2. Зсуваємо чергу гравців ВСЕРЕДИНІ цієї команди
        if (activeTeam.players.length > 0) {
            activeTeam.nextPlayerIndex = (activeTeam.nextPlayerIndex + 1) % activeTeam.players.length;
        }

        // 3. ВИЗНАЧАЄМО НАСТУПНУ КОМАНДУ
        let nextTeamIndex = (room.currentTeamIndex + 1) % room.teams.length;
        let attempts = 0;

        // Пропускаємо порожні команди
        while (room.teams[nextTeamIndex].players.length === 0 && attempts < room.teams.length) {
            nextTeamIndex = (nextTeamIndex + 1) % room.teams.length;
            attempts++;
        }

        // Оновлюємо індекс поточної команди
        room.currentTeamIndex = nextTeamIndex;

        // =========================================================================
        // 👇 ПРАВИЛО ФІНАЛЬНОГО РАУНДУ (Fair Play) 👇
        // Ми перевіряємо умову перемоги ТІЛЬКИ тоді, коли коло замкнулося (дійшли до команди 0)
        // АБО якщо в грі всього одна команда (соло режим).
        // =========================================================================
        
        const isCycleComplete = (room.currentTeamIndex === 0);
        const isSoloMode = (room.teams.length === 1);

        // Прапорець, чи гра закінчена
        let gameEnded = false;

        if (isCycleComplete || isSoloMode) {
             const target = room.settings.winScore;
        
             // Знаходимо всі команди, які досягли цілі
             const winners = room.teams
                 .map((t, index) => ({ index, score: t.score })) 
                 .filter(t => t.score >= target);
     
             if (winners.length > 0) {
                 gameEnded = true;
                 room.status = 'victory';
                 
                 // Сортуємо за спаданням балів (хто набрав більше — той переміг)
                 winners.sort((a, b) => b.score - a.score);
     
                 // Перевірка на нічию (якщо у топ-2 однакові бали)
                 if (winners.length > 1 && winners[0].score === winners[1].score) {
                     room.winner = 'draw'; 
                     // Якщо нічия, можна теоретично продовжити гру, але поки зробимо Draw
                 } else {
                     room.winner = winners[0].index; 
                 }
             }
        }

        // Якщо гра НЕ закінчилась — повертаємось в лобі
        if (!gameEnded) {
            room.status = 'lobby';
        }

        // =========================================================================

        // Очищення даних раунду
        room.roundHistory = [];
        room.roundScore = 0;
        room.timer = null;
        room.activePlayerId = null; 

        // Відправляємо оновлення всім
        io.to(roomId).emit("update_teams", getSafeRoom(room));
        io.to(roomId).emit("update_score", room.teams.map(t => t.score));
        
        // Якщо потрібно показати перемогу
        if (room.status === 'victory') {
             // Можна відправити окрему подію, але клієнт і так зреагує на update_teams (status: victory)
             io.to(roomId).emit("game_over", { winner: room.winner });
        } else {
            io.to(roomId).emit("results_confirmed");
        }
    }
});

   // --- ОНОВЛЕНО: РЕСТАРТ ГРИ (Універсальний) ---
    socket.on("restart_game", ({ roomId }) => {
        const room = rooms[roomId];
        
        if (room && socket.id === room.hostId && room.teams) {
            if (room.timer) clearInterval(room.timer);
            
            // 1. Проходимо по всіх командах і скидаємо їхні параметри
            room.teams.forEach(team => {
                team.score = 0;           // Обнуляємо рахунок
                team.nextPlayerIndex = 0; // Скидаємо чергу гравців на початок
            });

            // 2. Скидаємо глобальні налаштування кімнати
            room.status = 'lobby';       
            room.currentTeamIndex = 0;    // Починає перша команда (індекс 0)
            room.winner = null;
            room.activePlayerId = null;
            room.roundHistory = [];
            room.roundScore = 0;

            // 3. Відправляємо оновлення
            // Формуємо масив нулів [0, 0, 0...] для клієнта
            const scores = room.teams.map(t => t.score);
            
            io.to(roomId).emit("update_score", scores); 
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });

  // --- ПЕРЕМІШУВАННЯ ГРАВЦІВ (SHUFFLE) ---
   socket.on("shuffle_teams", ({ roomId }) => {
    const room = rooms[roomId];

    // Перевіряємо: Хост + Замок ВІДКРИТИЙ + Наявність команд
    if (room && socket.id === room.hostId && !room.isLocked && room.teams && room.teams.length > 0) {
        
        // 1. Збираємо всіх активних гравців з УСІХ команд
        // flatMap - зручний метод, який бере масиви players з кожної команди і зливає в один список
        const allPlayers = room.teams.flatMap(t => t.players);

        // Якщо гравців менше 2, немає сенсу мішати
        if (allPlayers.length < 2) return;

        // 2. Перемішуємо масив (твоя функція shuffleArray)
        const shuffled = shuffleArray(allPlayers);

        // 3. Очищаємо поточні списки гравців у командах
        room.teams.forEach(t => {
            t.players = [];
            t.nextPlayerIndex = 0; // 4. Одразу скидаємо чергу
        });

        // 5. Роздаємо гравців по колу ("як карти")
        // i % room.teams.length — це дасть нам індекси 0, 1, 2, 0, 1, 2...
        shuffled.forEach((player, i) => {
            const teamIndex = i % room.teams.length;
            room.teams[teamIndex].players.push(player);
        });

        // Скидаємо глобальні статуси
        room.activePlayerId = null;
        room.nextExplainerId = null;

        // 6. Відправляємо всім оновлені списки
        io.to(roomId).emit("update_teams", getSafeRoom(room));
    }
});
    // --- 👑 АДМІНСЬКІ ФУНКЦІЇ (ВІДНОВЛЕНО) ---

    // 1. ПЕРЕДАЧА ХОСТА
    socket.on("transfer_host", ({ roomId, targetId }) => {
        const room = rooms[roomId];
        // Проверяем, что это делает текущий хост
        if (room && socket.id === room.hostId) {
            room.hostId = targetId;
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
socket.on("set_explainer", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    
    // Перевіряємо, чи є масив teams
    if (room && socket.id === room.hostId && room.teams) {
        
        let found = false;

        // 1. Проходимо по всіх командах циклом
        for (let i = 0; i < room.teams.length; i++) {
            const pIndex = room.teams[i].players.findIndex(p => p.id === targetId);

            if (pIndex !== -1) {
                // Знайшли гравця!
                
                // Встановлюємо, що зараз хід цієї команди (індекс 0, 1, 2...)
                room.currentTeamIndex = i; 
                
                // Встановлюємо чергу саме всередині цієї команди
                room.teams[i].nextPlayerIndex = pIndex;
                
                found = true;
                break; // Перериваємо цикл, бо гравець знайдений
            }
        }

        // Якщо гравця не знайшли в жодній команді — нічого не робимо
        if (!found) return;

        // 2. Якщо це відбувається ПРЯМО ПІД ЧАС ГРИ, миттєво змінюємо активного
        if (room.status === 'game') {
            room.activePlayerId = targetId;
            // Відправляємо новому ведучому слово
            io.to(targetId).emit("game_started", { word: room.currentWord, explainerId: targetId });
        }

        // Оновлюємо всіх
        io.to(roomId).emit("update_teams", getSafeRoom(room));
    }
});

 // --- ОНОВЛЕНО: РЕСТАРТ ГРИ (Універсальний) ---
    socket.on("restart_game", ({ roomId }) => {
        const room = rooms[roomId];
        
        if (room && socket.id === room.hostId && room.teams) {
            if (room.timer) clearInterval(room.timer);
            
            // 1. Проходимо по всіх командах і скидаємо їхні параметри
            room.teams.forEach(team => {
                team.score = 0;           // Обнуляємо рахунок
                team.nextPlayerIndex = 0; // Скидаємо чергу гравців на початок
            });

            // 2. Скидаємо глобальні налаштування кімнати
            room.status = 'lobby';       
            room.currentTeamIndex = 0;    // Починає перша команда (індекс 0)
            room.winner = null;
            room.activePlayerId = null;
            room.roundHistory = [];
            room.roundScore = 0;

            // 3. Відправляємо оновлення
            // Формуємо масив нулів [0, 0, 0...] для клієнта
            const scores = room.teams.map(t => t.score);
            
            io.to(roomId).emit("update_score", scores); 
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
// 2. КІК ГРАВЦЯ (Універсальний)
    socket.on("kick_player", ({ roomId, targetId }) => {
        const room = rooms[roomId];
        
        if (room && socket.id === room.hostId) {
            
            // 1. Повідомляємо гравця (це важливо зробити ДО видалення, поки сокет ще "слухає")
            io.to(targetId).emit("kicked");
            
            // 2. Видаляємо з глядачів
            if (room.spectators) {
                room.spectators = room.spectators.filter(p => p.id !== targetId);
            }

            // 3. Видаляємо з команд (Універсально)
            if (room.teams) {
                room.teams.forEach(team => {
                    // Фільтруємо масив гравців
                    team.players = team.players.filter(p => p.id !== targetId);
                    
                    // БЕЗПЕКА: Якщо ми кікнули когось, і список скоротився,
                    // перевіряємо, чи індекс черги не виліз за межі масиву.
                    if (team.nextPlayerIndex >= team.players.length) {
                        team.nextPlayerIndex = 0;
                    }
                });
            }
            
            // 4. Якщо кікнули того, хто зараз пояснює — скидаємо роль
            if (room.activePlayerId === targetId) {
                room.activePlayerId = null;
                // Можна також зупинити таймер, якщо гра йде
                if (room.timer) {
                    clearInterval(room.timer);
                    room.timer = null;
                }
            }

            // Оновлюємо всіх, хто залишився
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
    // 3. БЛОКУВАННЯ КОМАНД (ЗАМОЧОК)
    socket.on("toggle_lock", ({ roomId }) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId) {
            room.isLocked = !room.isLocked; // Переключаем true/false
            
            console.log(`Room ${roomId} locked: ${room.isLocked}`); // Лог для проверки
            io.to(roomId).emit("update_teams", getSafeRoom(room));
        }
    });
// --- ⏸️ ПАУЗА ГРИ ---
    socket.on("toggle_pause", ({ roomId }) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId) {
            
            if (room.status === 'game') {
                // СТАВИМО НА ПАУЗУ
                if (room.timer) clearInterval(room.timer); // Зупиняємо годинник
                room.status = 'paused';
                io.to(roomId).emit("update_teams", getSafeRoom(room));
                
            } else if (room.status === 'paused') {
                // ЗНІМАЄМО З ПАУЗИ
                room.status = 'game';
                io.to(roomId).emit("update_teams", getSafeRoom(room));

                // Запускаємо таймер знову
                room.timer = setInterval(() => {
                    room.timeLeft--; 
                    io.to(roomId).emit("timer_update", room.timeLeft);

                    if (room.timeLeft <= 0) {
                        clearInterval(room.timer);
                        room.status = 'review';
                        if (room.currentWord) {
                            room.roundHistory.push({ word: room.currentWord, status: 'none' });
                        }
                        io.to(roomId).emit("round_ended", room.roundHistory);
                    }
                }, 1000);
            }
        }
    });
    // --- 7. ВІДКЛЮЧЕННЯ (DISCONNECT) ---
    // Найскладніша частина через проблему "F5" (оновлення сторінки)
   // 7. ВІДКЛЮЧЕННЯ (DISCONNECT)
   socket.on('disconnect', () => {
        const disconnectedId = socket.id;

        // Даємо 5 секунд на можливе перепідключення (F5)
        setTimeout(() => {
            for (const roomId in rooms) {
                const room = rooms[roomId];
                if (!room) continue;

                let stateChanged = false; // Прапорець, чи треба оновлювати клієнтів

                // 1. --- ВИДАЛЕННЯ СПЕКТАТОРА ---
                if (room.spectators) {
                    const initialSpecCount = room.spectators.length;
                    room.spectators = room.spectators.filter(p => p.id !== disconnectedId);
                    
                    if (room.spectators.length !== initialSpecCount) {
                        stateChanged = true;
                    }
                }

                // 2. --- ВИДАЛЕННЯ З КОМАНД (Універсальне) ---
                if (room.teams) {
                    room.teams.forEach(team => {
                        const initialTeamCount = team.players.length;
                        
                        // Фільтруємо гравців
                        team.players = team.players.filter(p => p.id !== disconnectedId);
                        
                        // Якщо когось видалили
                        if (team.players.length !== initialTeamCount) {
                            stateChanged = true;

                            // Безпека індексу черги
                            if (team.nextPlayerIndex >= team.players.length) {
                                team.nextPlayerIndex = 0;
                            }
                        }
                    });
                }

                // Якщо гравець був або глядачем, або гравцем — оновлюємо всіх
                if (stateChanged) {
                    io.to(roomId).emit("update_teams", getSafeRoom(room));
                }

                // 3. --- ВИДАЛЕННЯ ПОРОЖНЬОЇ КІМНАТИ (Універсальне) ---
                
                // Рахуємо загальну кількість гравців у всіх командах
                const totalPlayers = room.teams 
                    ? room.teams.reduce((sum, team) => sum + team.players.length, 0) 
                    : 0;

                // Якщо гравців 0 (глядачі можуть залишатися, але без гравців гра мертва)
                if (totalPlayers === 0) {
                    if (room.timer) clearInterval(room.timer);
                    
                    if (!room.deleteTimeout) {
                        console.log(`⏳ Кімната ${roomId} порожня (0 гравців). Видалення через 30 сек...`);
                        
                        room.deleteTimeout = setTimeout(() => {
                            // Перевіряємо ще раз перед фінальним видаленням
                            const targetRoom = rooms[roomId];
                            
                            if (targetRoom) {
                                // Знову рахуємо гравців (раптом хтось зайшов за ці 30 сек)
                                const currentPlayers = targetRoom.teams 
                                    ? targetRoom.teams.reduce((sum, t) => sum + t.players.length, 0) 
                                    : 0;

                                if (currentPlayers === 0) {
                                    delete rooms[roomId];
                                    console.log(`🗑️ Кімната ${roomId} остаточно видалена.`);
                                } else {
                                    // Хтось зайшов, скасовуємо видалення
                                    targetRoom.deleteTimeout = null;
                                }
                            }
                        }, 30000);
                    }
                }
            }
        }, 5000); 
    });

// ... тут твій код disconnect ...
    // Це кінець блоку disconnect:
    }); 

// ================================================================
// ВСЕ ЩО НИЖЧЕ — МАЄ БУТИ ЗА МЕЖАМИ io.on
// ================================================================

// Інтервал очищення (оновлений і виправлений)
setInterval(() => {
    // const now = Date.now(); // Можна прибрати, якщо не використовується
    for (const roomId in rooms) {
        const room = rooms[roomId];
        
        // Перевірка на існування кімнати
        if (!room) continue;

        // 1. Рахуємо гравців у командах (безпечно)
        const totalPlayers = room.teams 
            ? room.teams.reduce((sum, team) => sum + team.players.length, 0) 
            : 0;

        // 2. Рахуємо глядачів
        const totalSpectators = room.spectators ? room.spectators.length : 0;

        // Якщо кімната абсолютно порожня
        if (totalPlayers === 0 && totalSpectators === 0) {
             console.log(`🧹 Auto-cleaning room ${roomId}`);
             
             // Очищаємо таймери, щоб не висіли в пам'яті
             if (room.timer) clearInterval(room.timer);
             if (room.deleteTimeout) clearTimeout(room.deleteTimeout);
             
             delete rooms[roomId];
        }
    }
}, 1000 * 60 * 10); // Кожні 10 хвилин

// Запуск сервера
server.listen(3001, () => {
    console.log('SERVER STARTED ON 3001');
});