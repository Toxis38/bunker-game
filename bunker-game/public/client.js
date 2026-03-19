// public/client.js
const socket = io();
let myPlayer = null;
let roomId = null;
let gameState = 'LOBBY';
let players = [];
let currentTurnIndex = 0;
let round = 1;
let closedRoomOpened = false;

const screens = {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    end: document.getElementById('end-screen')
};

const elements = {
    nickname: document.getElementById('nickname'),
    roomCodeInput: document.getElementById('room-code-input'),
    roomCodeDisplay: document.getElementById('room-code-display'),
    scenarioTitle: document.getElementById('scenario-title'),
    scenarioDesc: document.getElementById('scenario-desc'),
    lobbyPlayersList: document.getElementById('lobby-players-list'),
    playerCount: document.getElementById('player-count'),
    startGameBtn: document.getElementById('start-game-btn'),
    startRequirement: document.getElementById('start-requirement'),
    scenarioTitleGame: document.getElementById('scenario-title-game'),
    scenarioDescGame: document.getElementById('scenario-desc-game'),
    scenarioDuration: document.getElementById('scenario-duration'),
    roundDisplay: document.getElementById('round-display'),
    turnDisplay: document.getElementById('turn-display'),
    closedRoomAlert: document.getElementById('closed-room-alert'),
    closedRoomItems: document.getElementById('closed-room-items'),
    myCardsGrid: document.getElementById('my-cards-grid'),
    gamePlayersList: document.getElementById('game-players-list'),
    votingPanel: document.getElementById('voting-panel'),
    voteButtons: document.getElementById('vote-buttons'),
    turnControls: document.getElementById('turn-controls'),
    endTurnBtn: document.getElementById('end-turn-btn'),
    endGameBtn: document.getElementById('end-game-btn'),
    endResult: document.getElementById('end-result')
};

const CARD_KEYS = ['biology', 'age', 'phobia', 'health', 'fact1', 'fact2', 'hobby', 'luggage'];
const CARD_LABELS = {
    biology: '🧬 Профессия',
    age: '🎂 Возраст',
    phobia: '😨 Фобия',
    health: '❤️ Здоровье',
    fact1: '📌 Факт #1',
    fact2: '📌 Факт #2',
    hobby: '🎯 Хобби',
    luggage: '🎒 Багаж'
};

function showScreen(screenName) {
    Object.values(screens).forEach(function(s) {
        if (s) {
            s.classList.remove('active');
            s.style.display = 'none';
        }
    });
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
        screens[screenName].style.display = 'flex';
    }
}

function copyRoomCode() {
    if (roomId) {
        navigator.clipboard.writeText(roomId);
        alert('✅ Код комнаты скопирован: ' + roomId);
    }
}

function createRoom() {
    const nickname = elements.nickname.value.trim();
    if (!nickname) {
        alert('⚠️ Введите имя!');
        return;
    }
    console.log('🔵 Создание комнаты:', nickname);
    socket.emit('create_room', nickname);
}

function joinRoom() {
    const nickname = elements.nickname.value.trim();
    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
    if (!nickname || !roomCode) {
        alert('⚠️ Введите имя и код комнаты!');
        return;
    }
    console.log('🔵 Вход в комнату:', roomCode, nickname);
    socket.emit('join_room', { roomId: roomCode, nickname });
}

socket.on('room_created', function(data) {
    console.log('✅ Комната создана:', data);
    roomId = data.roomId;
    myPlayer = data.player;
    players = data.players;
    gameState = data.gameState;
    localStorage.setItem('bunker_room', roomId);
    localStorage.setItem('bunker_nickname', myPlayer.nickname);
    setupLobby(data.scenario);
    showScreen('lobby');
});

socket.on('room_joined', function(data) {
    console.log('✅ В комнате:', data);
    roomId = data.roomId;
    myPlayer = data.player;
    players = data.players;
    gameState = data.gameState;
    localStorage.setItem('bunker_room', roomId);
    localStorage.setItem('bunker_nickname', myPlayer.nickname);
    setupLobby(data.scenario);
    showScreen('lobby');
});

socket.on('error', function(message) {
    console.error('❌ Ошибка:', message);
    alert('❌ ' + message);
});

socket.on('players_updated', function(data) {
    players = data.players;
    if (gameState === 'LOBBY') {
        updateLobbyPlayersList();
        checkStartRequirement();
    } else if (gameState === 'PLAYING' || gameState === 'VOTING') {
        updateGamePlayersList();
    }
});

socket.on('player_disconnected', function(data) {
    const player = players.find(function(p) { return p.id === data.playerId; });
    if (player) {
        alert('🔌 ' + player.nickname + ' отключился');
    }
});

window.addEventListener('load', function() {
    const savedRoom = localStorage.getItem('bunker_room');
    const savedNick = localStorage.getItem('bunker_nickname');
    if (savedRoom && savedNick) {
        console.log('🔄 Восстановление сессии...', savedRoom, savedNick);
        socket.emit('reconnect_player', { roomId: savedRoom, nickname: savedNick });
    }
});

socket.on('game_restored', function(data) {
    console.log('✅ Сессия восстановлена:', data);
    roomId = data.roomId;
    myPlayer = data.player;
    players = data.players;
    gameState = data.gameState;
    round = data.round;
    currentTurnIndex = data.currentTurnIndex;
    closedRoomOpened = data.closedRoomOpened;
    localStorage.setItem('bunker_room', roomId);
    localStorage.setItem('bunker_nickname', myPlayer.nickname);
    
    if (gameState === 'LOBBY') {
        setupLobby(data.scenario);
        showScreen('lobby');
    } else {
        setupGame(data.scenario);
        showScreen('game');
        if (gameState === 'PLAYING') updateTurnDisplay();
        else if (gameState === 'VOTING') showVotingPanel();
        else if (gameState === 'ENDED') showEndScreen(data);
    }
});

function setupLobby(scenario) {
    elements.roomCodeDisplay.textContent = 'ROOM: ' + roomId;
    elements.scenarioTitle.textContent = scenario.title;
    elements.scenarioDesc.textContent = scenario.desc;
    updateLobbyPlayersList();
    checkStartRequirement();
}

function updateLobbyPlayersList() {
    if (!elements.lobbyPlayersList) return;
    elements.lobbyPlayersList.innerHTML = '';
    if (elements.playerCount) elements.playerCount.textContent = players.length;
    
    players.forEach(function(player) {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = 
            '<div class="avatar">' + player.nickname[0].toUpperCase() + '</div>' +
            '<div class="nickname">' + player.nickname + (player.isHost ? ' 👑' : '') + '</div>' +
            '<div class="status' + (player.isHost ? ' host' : '') + '">' + 
            (player.isHost ? 'Хост' : 'Игрок') + '</div>';
        elements.lobbyPlayersList.appendChild(item);
    });
}

function checkStartRequirement() {
    if (!elements.startGameBtn || !elements.startRequirement) return;
    const aliveCount = players.filter(function(p) { return p.isAlive; }).length;
    const isHost = myPlayer ? myPlayer.isHost : false;
    const inLobby = gameState === 'LOBBY';
    const canStart = aliveCount >= 4 && isHost && inLobby;
    
    elements.startGameBtn.disabled = !canStart;
    elements.startRequirement.classList.toggle('met', aliveCount >= 4);
    elements.startRequirement.textContent = aliveCount >= 4
        ? '✅ ' + aliveCount + '/8 игроков — можно начинать!'
        : '⚠️ Минимум 4 игрока для старта (' + aliveCount + '/4)';
}

function startGame() {
    if (myPlayer && myPlayer.isHost && players.length >= 4) {
        socket.emit('start_game', roomId);
    }
}

socket.on('game_started', function(data) {
    console.log('🎮 Игра началась:', data);
    gameState = 'PLAYING';
    round = data.round;
    currentTurnIndex = data.currentTurnIndex;
    players = data.players;
    setupGame(data.scenario);
    showScreen('game');
    updateTurnDisplay();
});

function setupGame(scenario) {
    document.body.classList.add('game-active');
    document.body.className = 'theme-' + (scenario.theme || 'default') + ' game-active';
    elements.scenarioTitleGame.textContent = scenario.title;
    elements.scenarioDescGame.textContent = scenario.desc;
    elements.scenarioDuration.textContent = scenario.duration;
    elements.roundDisplay.textContent = round;
    renderMyCards();
    updateGamePlayersList();
    
    if (elements.endGameBtn) {
        elements.endGameBtn.classList.toggle('hidden', !myPlayer || !myPlayer.isHost);
    }
}

function createCard(key, value, isOpened) {
    const card = document.createElement('div');
    card.className = 'card ' + (isOpened ? 'flipped' : '');

    card.innerHTML = `
        <div class="card-inner">
            <div class="card-face card-front">
                🔒 ${CARD_LABELS[key]}
            </div>
            <div class="card-face card-back">
                ${value || ''}
            </div>
        </div>
    `;

    return card;
}

function isMyTurn() {
    if (gameState !== 'PLAYING') return false;
    const currentPlayer = players[currentTurnIndex];
    return currentPlayer && currentPlayer.id === myPlayer.id && currentPlayer.isAlive;
}

function updateTurnDisplay() {
    if (!elements.turnDisplay || !elements.endTurnBtn) return;
    
    const currentPlayer = players[currentTurnIndex];
    const isMyTurnNow = isMyTurn();
    
    elements.turnDisplay.innerHTML = 'Ход: <b>' + 
        (isMyTurnNow ? 'Ваш' : (currentPlayer ? currentPlayer.nickname : '...')) + '</b>';
    
    const canEndTurn = isMyTurnNow && myPlayer && myPlayer.hasRevealedThisTurn;
    elements.endTurnBtn.disabled = !canEndTurn;
    
    document.querySelectorAll('.card').forEach(function(card) {
        const key = card.dataset.key;
        
        if (isMyTurnNow && myPlayer && !myPlayer.hasRevealedThisTurn) {
            card.style.opacity = '1';
            card.style.cursor = 'pointer';
            card.classList.add('clickable');
        } else {
            card.style.opacity = '1';
            card.style.cursor = 'default';
            card.classList.remove('clickable');
        }
    });
    
    updateGamePlayersList();
}

function updateGamePlayersList() {
    if (!elements.gamePlayersList) return;
    elements.gamePlayersList.innerHTML = '';
    
    players.forEach(function(player, index) {
        const isCurrentTurn = index === currentTurnIndex && gameState === 'PLAYING';
        const isMe = player.id === myPlayer.id;
        
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card' + 
            (isCurrentTurn ? ' current-turn' : '') + 
            (!player.isAlive ? ' dead' : '');
        
        let revealedCardsHTML = '';
        const cardsToShow = !player.isAlive ? player.character : player.revealedCards;
        
        if (cardsToShow && Object.keys(cardsToShow).length > 0) {
            revealedCardsHTML = Object.entries(cardsToShow)
                .filter(function(entry) { return CARD_KEYS.includes(entry[0]); })
                .map(function(entry) {
                    return '<div class="revealed-card">' +
                        '<span class="label">' + CARD_LABELS[entry[0]].split(' ')[1] + ':</span>' +
                        entry[1] + '</div>';
                }).join('');
        }
        
        playerCard.innerHTML = 
            '<div class="player-header">' +
                '<div class="player-nickname' + (isMe ? ' you' : '') + '">' + 
                    player.nickname + (isMe ? ' (Вы)' : '') + (player.isHost ? ' 👑' : '') + 
                '</div>' +
                '<div class="player-status' + (player.isAlive ? ' alive' : ' dead') + 
                    (isCurrentTurn ? ' turn' : '') + '">' +
                    (player.isAlive ? (isCurrentTurn ? '🔄 Ход' : '🟢 Жив') : '💀 Выбыл') +
                '</div>' +
            '</div>' +
            (revealedCardsHTML ? '<div class="revealed-cards">' + revealedCardsHTML + '</div>' : 
                '<div class="revealed-cards"><em>Карты скрыты</em></div>') +
            (!player.isAlive && player.character && player.character.specialCondition ?
                '<div class="special-condition">⚡ Эффект: ' + player.character.specialCondition + '</div>' : '');
        
        elements.gamePlayersList.appendChild(playerCard);
    });
}

socket.on('card_revealed', function(data) {
    setTimeout(() => {
    renderPlayers();
    renderPlayersTable();
}, 50);
    players = data.players;
    updateGamePlayersList();
    
    const updatedMyPlayer = players.find(function(p) { return p.id === myPlayer.id; });
    if (updatedMyPlayer) {
        myPlayer = updatedMyPlayer;
    }
    
    if (data.playerId === myPlayer.id) {
        myPlayer.hasRevealedThisTurn = true;
        if (elements.endTurnBtn) elements.endTurnBtn.disabled = false;
        updateTurnDisplay();
        renderMyCards();
    }
});

function renderVoting() {
    const container = document.getElementById('game-area');
    container.innerHTML = '<h2>Голосование</h2>';

    players.filter(p => p.isAlive).forEach(p => {
        const btn = document.createElement('button');
        btn.innerText = 'Выгнать ' + p.nickname;

        btn.onclick = () => {
            socket.emit('vote', {
                roomId,
                targetId: p.id
            });
        };

        container.appendChild(btn);
    });
}

function endTurn() {
    if (gameState === 'PLAYING' && isMyTurn() && myPlayer && myPlayer.hasRevealedThisTurn) {
        socket.emit('end_turn', roomId);
        if (elements.endTurnBtn) elements.endTurnBtn.disabled = true;
    }
}

socket.on('turn_changed', function(data) {
    currentTurnIndex = data.currentTurnIndex;
    players = data.players;
    
    if (data.currentPlayerId === myPlayer.id) {
        myPlayer.hasRevealedThisTurn = false;
        if (elements.endTurnBtn) elements.endTurnBtn.disabled = true;
    }
    
    updateTurnDisplay();
});

socket.on('voting_started', function(data) {
    gameState = 'VOTING';
    players = data.players;
    showVotingPanel();
});

function showVotingPanel() {
    if (!elements.votingPanel || !elements.turnControls || !elements.voteButtons) return;
    elements.votingPanel.classList.remove('hidden');
    elements.turnControls.classList.add('hidden');
    elements.voteButtons.innerHTML = '';
    
    players.filter(function(p) { return p.isAlive && p.id !== myPlayer.id; }).forEach(function(player) {
        const btn = document.createElement('button');
        btn.className = 'btn secondary';
        btn.textContent = '🗑️ Изгнать ' + player.nickname;
        btn.onclick = function() {
            socket.emit('vote', { roomId: roomId, targetId: player.id });
            elements.voteButtons.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
        };
        elements.voteButtons.appendChild(btn);
    });
    
    updateGamePlayersList();
}

socket.on('player_kicked', function(data) {
    const kickedPlayer = players.find(function(p) { return p.id === data.playerId; });
    const index = players.findIndex(function(p) { return p.id === data.playerId; });
    
    if (index !== -1) {
        players[index] = Object.assign({}, players[index], { 
            isAlive: false, 
            character: data.character 
        });
    }
    
    updateGamePlayersList();
    
    if (elements.votingPanel) elements.votingPanel.classList.add('hidden');
});

socket.on('round_started', function(data) {
    gameState = 'PLAYING';
    round = data.round;
    currentTurnIndex = data.currentTurnIndex;
    closedRoomOpened = data.closedRoomOpened;
    players = data.players;
    
    if (elements.roundDisplay) elements.roundDisplay.textContent = round;
    
    if (closedRoomOpened && elements.closedRoomAlert) {
        elements.closedRoomAlert.classList.remove('hidden');
    }
    
    updateTurnDisplay();
    renderMyCards();
});

socket.on('game_ended', function(data) {
    gameState = 'ENDED';
    players = data.players;
    showEndScreen(data);
});

function endGame() {
    if (myPlayer && myPlayer.isHost && confirm('⚠️ Завершить игру для всех?')) {
        socket.emit('end_game', roomId);
    }
}

function showEndScreen(data) {
    document.body.classList.remove('game-active');
    showScreen('end');
    
    let resultHTML = '';
    if (data.winner) {
        resultHTML = '<h2>🏆 Победитель: ' + data.winner + '</h2>' +
            '<p>Выжил в апокалипсисе!</p>';
    } else {
        resultHTML = '<h2>🏁 Игра завершена</h2>';
    }
    
    resultHTML += '<h3>📊 Итоги:</h3><ul>';
    players.forEach(function(p) {
        resultHTML += '<li class="' + (p.isAlive ? 'alive' : 'dead') + '">' + 
            p.nickname + ': ' + (p.isAlive ? '✅ Выжил' : '❌ Выбыл') + '</li>';
    });
    resultHTML += '</ul>';
    
    if (elements.endResult) elements.endResult.innerHTML = resultHTML;
    localStorage.removeItem('bunker_room');
    localStorage.removeItem('bunker_nickname');
}

window.addEventListener('beforeunload', function() {
    if (roomId && myPlayer && myPlayer.nickname && gameState !== 'ENDED') {
        localStorage.setItem('bunker_room', roomId);
        localStorage.setItem('bunker_nickname', myPlayer.nickname);
    }
});

socket.on('disconnect', function() {
    alert('❌ Потеряно соединение с сервером');
});

socket.on('connect', function() {
    console.log('✅ Соединение с сервером установлено');
});
function renderPlayersTable() {
    const table = document.getElementById('players-table');
    if (!table) return;

    table.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'table-row header';

    header.innerHTML = `
        <div class="cell name">Игрок</div>
        ${CARD_KEYS.map(k => `<div class="cell">${CARD_LABELS[k].split(' ')[1]}</div>`).join('')}
    `;

    table.appendChild(header);

    players.forEach(player => {
        const row = document.createElement('div');
        row.className = 'table-row';

        let cells = `<div class="cell name">${player.nickname}</div>`;

        CARD_KEYS.forEach(key => {
            let value = player.revealedCards?.[key];

            if (!player.isAlive && player.character) {
                value = player.character[key];
            }

            cells += `
                <div class="cell card-cell ${value ? 'open' : 'closed'}"
                     style="background-image:url('/images/cards/${key}.jpg')">
                    ${value ? value : '🔒'}
                </div>
            `;
        });

        row.innerHTML = cells;
        table.appendChild(row);
    });
}