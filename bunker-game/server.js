const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const gameData = require('./data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

const rooms = {};

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateCharacter() {
    return {
        biology: getRandomItem(gameData.biology),
        age: getRandomItem(gameData.ages),
        phobia: getRandomItem(gameData.phobias),
        health: getRandomItem(gameData.health),
        fact1: getRandomItem(gameData.fact1),
        fact2: getRandomItem(gameData.fact2),
        hobby: getRandomItem(gameData.hobbies),
        luggage: getRandomItem(gameData.luggage),
        specialCondition: getRandomItem(gameData.specialConditions),
        revealedCards: []
    };
}

// 🔥 ФИКС: теперь ВСЕ игроки видят открытые карты
function getPublicPlayerData(player) {
    const visible = {};

    if (player.character && player.character.revealedCards) {
        player.character.revealedCards.forEach(function(key) {
            visible[key] = player.character[key];
        });
    }

    return {
        id: player.id,
        nickname: player.nickname,
        isAlive: player.isAlive,
        isHost: player.isHost,
        revealedCards: visible,
        hasRevealedThisTurn: player.hasRevealedThisTurn,
        socketId: player.socketId,
        character: !player.isAlive ? player.character : null
    };
}

io.on('connection', function(socket) {
    console.log('🔗 Подключился:', socket.id);

    socket.on('reconnect_player', function(data) {
        const roomId = data.roomId;
        const nickname = data.nickname;
        const room = rooms[roomId];

        if (room && room.gameState !== 'LOBBY') {
            const existingPlayer = room.players.find(function(p) {
                return p.nickname === nickname && p.wasInRoom;
            });

            if (existingPlayer && !existingPlayer.socketId) {
                existingPlayer.socketId = socket.id;
                socket.join(roomId);

                socket.emit('game_restored', {
                    roomId: roomId,
                    scenario: room.scenario,
                    player: existingPlayer,
                    players: room.players.map(getPublicPlayerData),
                    gameState: room.gameState,
                    round: room.round,
                    currentTurnIndex: room.currentTurnIndex,
                    closedRoomOpened: room.closedRoomOpened
                });
            }
        }
    });

    socket.on('vote', function(data) {
    const room = rooms[data.roomId];
    if (!room || room.gameState !== 'VOTING') return;

    const voter = room.players.find(p => p.socketId === socket.id);
    if (!voter || !voter.isAlive) return;

    room.votes[voter.id] = data.targetId;

    const alivePlayers = room.players.filter(p => p.isAlive);

    // если все проголосовали
    if (Object.keys(room.votes).length === alivePlayers.length) {

        const voteCount = {};

        Object.values(room.votes).forEach(id => {
            voteCount[id] = (voteCount[id] || 0) + 1;
        });

        // ищем кого выгнали
        let maxVotes = 0;
        let eliminatedId = null;

        for (let id in voteCount) {
            if (voteCount[id] > maxVotes) {
                maxVotes = voteCount[id];
                eliminatedId = id;
            }
        }

        const eliminatedPlayer = room.players.find(p => p.id === eliminatedId);

        if (eliminatedPlayer) {
            eliminatedPlayer.isAlive = false;
        }

        room.gameState = 'RESULT';

        io.to(data.roomId).emit('voting_result', {
            eliminatedId,
            players: room.players.map(getPublicPlayerData)
        });
    }
});

    socket.on('create_room', function(nickname) {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const scenario = getRandomItem(gameData.scenarios);

        rooms[roomId] = {
            id: roomId,
            scenario: scenario,
            players: [],
            gameState: 'LOBBY',
            round: 1,
            currentTurnIndex: 0,
            closedRoomOpened: false,
            votes: {},
            turnRevealed: {}
        };

        socket.join(roomId);

        const player = {
            id: socket.id,
            socketId: socket.id,
            nickname: nickname,
            character: generateCharacter(),
            isAlive: true,
            isHost: true,
            wasInRoom: true,
            hasRevealedThisTurn: false
        };

        rooms[roomId].players.push(player);

        socket.emit('room_created', {
            roomId: roomId,
            scenario: scenario,
            player: player,
            players: [getPublicPlayerData(player)],
            gameState: 'LOBBY'
        });

        console.log('✅ Комната создана:', roomId, 'Игрок:', nickname);
    });

    socket.on('join_room', function(data) {
        const roomId = data.roomId;
        const nickname = data.nickname;
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error', 'Комната не найдена');
            return;
        }

        if (room.gameState !== 'LOBBY') {
            socket.emit('error', 'Игра уже началась, вход закрыт');
            return;
        }

        if (room.players.length >= 8) {
            socket.emit('error', 'Комната переполнена');
            return;
        }

        socket.join(roomId);

        const player = {
            id: socket.id,
            socketId: socket.id,
            nickname: nickname,
            character: generateCharacter(),
            isAlive: true,
            isHost: false,
            wasInRoom: true,
            hasRevealedThisTurn: false
        };

        room.players.push(player);

        socket.emit('room_joined', {
            roomId: roomId,
            scenario: room.scenario,
            player: player,
            players: room.players.map(getPublicPlayerData),
            gameState: 'LOBBY'
        });

        io.to(roomId).emit('players_updated', {
            players: room.players.map(getPublicPlayerData)
        });

        console.log('✅ Игрок присоединился:', nickname, 'Комната:', roomId);
    });

    socket.on('start_game', function(roomId) {
        const room = rooms[roomId];

        const player = room.players.find(function(p) {
            return p.socketId === socket.id;
        });

        if (player && player.isHost && room.gameState === 'LOBBY' && room.players.length >= 4) {
            room.gameState = 'PLAYING';
            room.round = 1;
            room.currentTurnIndex = 0;
            room.turnRevealed = {};

            io.to(roomId).emit('game_started', {
                scenario: room.scenario,
                round: room.round,
                currentTurnIndex: room.currentTurnIndex,
                currentPlayerId: room.players[0].id,
                players: room.players.map(getPublicPlayerData)
            });

            console.log('🎮 Игра началась в комнате:', roomId);
        }
    });

    socket.on('reveal_card', function(data) {
        const roomId = data.roomId;
        const cardKey = data.cardKey;
        const room = rooms[roomId];

        if (room.gameState !== 'PLAYING') return;

        const player = room.players.find(function(p) {
            return p.socketId === socket.id;
        });

        if (!player || !player.isAlive) return;

        const currentPlayer = room.players[room.currentTurnIndex];
        if (!currentPlayer || currentPlayer.id !== player.id) return;

        if (player.hasRevealedThisTurn) return;

        if (!player.character.revealedCards) {
            player.character.revealedCards = [];
        }

        if (player.character.revealedCards.includes(cardKey)) return;

        player.character.revealedCards.push(cardKey);
        player.hasRevealedThisTurn = true;
        room.turnRevealed[player.id] = true;

        io.to(roomId).emit('card_revealed', {
            playerId: player.id,
            cardKey: cardKey,
            cardValue: player.character[cardKey],
            players: room.players.map(getPublicPlayerData)
        });
    });

    socket.on('end_turn', function(roomId) {
        const room = rooms[roomId];

        if (room.gameState !== 'PLAYING') return;

        let nextIndex = (room.currentTurnIndex + 1) % room.players.length;

        const alivePlayers = room.players.filter(p => p.isAlive);
        const allHaveMoved = alivePlayers.every(p => room.turnRevealed[p.id]);

        if (allHaveMoved) {
            if (room.round >= 3) {
                room.gameState = 'VOTING';
                room.votes = {};

                io.to(roomId).emit('voting_started', {
                    players: room.players.map(getPublicPlayerData)
                });
            } else {
                room.round++;
                room.turnRevealed = {};

                room.players.forEach(p => p.hasRevealedThisTurn = false);

                room.currentTurnIndex = 0;

                io.to(roomId).emit('round_started', {
                    round: room.round,
                    currentTurnIndex: room.currentTurnIndex,
                    currentPlayerId: room.players[0].id,
                    players: room.players.map(getPublicPlayerData)
                });
            }
        } else {
            room.currentTurnIndex = nextIndex;

            io.to(roomId).emit('turn_changed', {
                currentTurnIndex: room.currentTurnIndex,
                currentPlayerId: room.players[nextIndex].id,
                players: room.players.map(getPublicPlayerData)
            });
        }
    });

    socket.on('disconnect', function() {
        console.log('❌ Отключился:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
    console.log('🚀 Сервер запущен: http://localhost:' + PORT);
});