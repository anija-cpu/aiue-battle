const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
    console.log("connected:", socket.id);

    // =====================
    // ルーム作成
    // =====================
    socket.on("createRoom", (roomId, playerName) => {
        if (!roomId) return;
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                playerNames: {},
                playerChars: {},
                answers: {},
                hits: {},
                wordLengths: {},   // 各プレイヤーの有効文字数
                scores: {},        // 累積得点（セッション内で維持）
                started: false,
                theme: null,
                themeSelected: false,
                turnOrder: [],
                currentTurnIndex: 0,
                eliminated: [],
                rematchVotes: [],
                timerDuration: 0,  // 0 = 無制限
                targetScore: 0,    // 0 = 無制限（勝利ポイント）
                turnTimer: null,
                mode: 'battle-royale', // 'battle-royale' or 'team-deathmatch'
                teams: {},             // { A: [socketId, ...], B: [...], ... }
                teamLeaders: {},       // { A: socketId, B: socketId, ... }
                teamAnswers: {},       // { A: [...], B: [...] }
                teamHits: {},          // { A: [bool,...], B: [bool,...] }
                teamScores: {},        // { A: 0, B: 0, ... }
                teamTurnIndexes: {},   // { A: 0, B: 0, ... } チーム内のターン
                teamMemberOrders: {},
            };
        }
        socket.join(roomId);
        socket.roomId = roomId;
        rooms[roomId].players.push(socket.id);
        rooms[roomId].playerNames[socket.id] = playerName || "プレイヤー1";
        socket.emit("roomCreated", roomId);
        io.to(roomId).emit("roomInfo", {
            players: rooms[roomId].players,
            playerNames: rooms[roomId].playerNames
        });
    });

    // =====================
    // ルーム参加
    // =====================
    socket.on("joinRoom", (roomId, playerName) => {
        const room = rooms[roomId];
        if (!room) { socket.emit("errorMessage", "部屋が存在しません"); return; }
        if (room.players.length >= 8) { socket.emit("errorMessage", "部屋が満員です"); return; }
        if (room.started) { socket.emit("errorMessage", "ゲームはすでに開始されています"); return; }
        socket.join(roomId);
        socket.roomId = roomId;
        room.players.push(socket.id);
        room.playerNames[socket.id] = playerName || "プレイヤー";
        socket.emit("joinedRoom", roomId);
        io.to(roomId).emit("roomInfo", {
            players: room.players,
            playerNames: room.playerNames
        });
    });

    // =====================
    // 観戦参加
    // =====================
    socket.on("watchRoom", (roomId, playerName) => {
        const room = rooms[roomId];
        if (!room) { socket.emit("errorMessage", "部屋が存在しません"); return; }
        socket.join(roomId);
        socket.roomId = roomId;
        socket.isSpectator = true;
        socket.emit("joinedAsSpectator", {
            roomId,
            playerNames: room.playerNames,
            players: room.players,
            started: room.started,
            theme: room.theme
        });
    });

    // =====================
    // タイマー設定（部屋主のみ）
    // =====================
    socket.on("setTimerDuration", (seconds) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.players[0] !== socket.id) return;
        room.timerDuration = parseInt(seconds) || 0;
    });

    // =====================
    // 勝利ポイント設定（部屋主のみ）
    // =====================
    socket.on("setTargetScore", (pts) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.players[0] !== socket.id) return;
        room.targetScore = parseInt(pts) || 0;
    });

    // =====================
    // ゲーム開始（部屋主が押す）
    // =====================
    socket.on("startGame", () => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.players[0] !== socket.id) return;
        if (room.players.length < 2) { socket.emit("errorMessage", "2人以上必要です"); return; }
        if (room.started) return;

        if (room.mode === 'team-deathmatch') {
            
            // チームモード開始
            io.to(socket.roomId).emit("ready", {
                turnOrder: room.players,
                playerNames: room.playerNames,
                mode: 'team-deathmatch',
            });
        } else {
            const shuffled = [...room.players].sort(() => Math.random() - 0.5);
            room.turnOrder = shuffled;
            room.currentTurnIndex = 0;
            room.themeSelected = false;

            io.to(socket.roomId).emit("ready", {
                turnOrder: room.turnOrder,
                playerNames: room.playerNames,
                mode: 'battle-royale',
            });
        }
    });

    // =====================
    // お題選択
    // =====================
    socket.on("selectTheme", (theme) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.themeSelected) return;
        room.themeSelected = true;
        room.theme = theme;
        io.to(socket.roomId).emit("themeDecided", { theme });
    });

    // =====================
    // 単語登録
    // =====================
    socket.on("setAnswer", (answerArray) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (!Array.isArray(answerArray) || answerArray.length !== 7) return;

        room.answers[socket.id] = answerArray;
        room.hits[socket.id] = Array(7).fill(false);
        // 有効文字数（×以外）を記録
        room.wordLengths[socket.id] = answerArray.filter(k => k !== "×").length;
        socket.emit("answerSaved");

        // 全員揃ったらゲーム開始
        const allSet = room.players.every(id => room.answers[id]);
        if (allSet) {
            room.started = true;
            room.eliminated = [];
            const firstTurn = room.turnOrder[0];

            room.players.forEach(id => {
                io.to(id).emit("gameStart", {
                    firstTurn,
                    turnOrder: room.turnOrder,
                    playerNames: room.playerNames,
                    players: room.players,
                    opponentLengths: getOpponentLengths(room, id),
                    theme: room.theme,
                    scores: { ...room.scores },
                    timerDuration: room.timerDuration,
                    targetScore: room.targetScore,
                    playerChars: room.playerChars,
                });
            });

            sendToSpectators(socket.roomId, room, "spectatorGameStart", {
                turnOrder: room.turnOrder,
                playerNames: room.playerNames,
                players: room.players,
                lengths: getLengths(room),
                theme: room.theme
            });

            // タイマー開始
            startTurnTimer(room, socket.roomId);
        }
    });

    // =====================
    // 攻撃
    // =====================
    socket.on("attack", (data) => {
        const room = rooms[socket.roomId];
        if (!room || !room.started) return;

        const attacker = socket.id;
        const currentTurn = room.turnOrder[room.currentTurnIndex];
        if (attacker !== currentTurn) return;

        // タイマーを即座にクリア
        clearTurnTimer(room);

        const kana = data.kana;
        let hitAny = false;
        let hitSelf = false;
        let hitSelfIndexes = [];
        const hitResults = {};

        room.players.forEach(id => {
            if (room.eliminated.includes(id)) return;
            const answer = room.answers[id];
            const indexes = [];
            answer.forEach((k, i) => {
                if (k === kana) {
                    room.hits[id][i] = true;
                    indexes.push(i);
                }
            });
            if (indexes.length > 0) {
                hitResults[id] = indexes;
                if (id === attacker) {
                    hitSelf = true;
                    hitSelfIndexes = indexes;
                } else {
                    hitAny = true;
                }
            }
        });

        // 脱落判定
        const newlyEliminated = [];
        room.players.forEach(id => {
            if (room.eliminated.includes(id)) return;
            if (id === attacker) return;
            const answer = room.answers[id];
            const allOpen = answer.every((k, i) => k === "×" || room.hits[id][i]);
            if (allOpen) {
                room.eliminated.push(id);
                newlyEliminated.push(id);
            }
        });

        const turnChanged = hitSelf || !hitAny;
        if (turnChanged) advanceTurn(room);

        const nextTurn = room.turnOrder[room.currentTurnIndex];

        socket.emit("attackResult", {
    kana, hitAny, hitSelf, hitSelfIndexes, hitResults,
    turnChanged, nextTurn, newlyEliminated,
    eliminatedNames: newlyEliminated.map(eid => room.playerNames[eid])
});

room.players.forEach(id => {
    if (id === attacker) return;
    io.to(id).emit("attacked", {
        kana, attacker, hitAny, hitSelf, hitSelfIndexes, hitResults,
        turnChanged, nextTurn, newlyEliminated,
        eliminatedNames: newlyEliminated.map(eid => room.playerNames[eid])
    });
});

        sendToSpectators(socket.roomId, room, "spectatorAttack", {
            kana, attacker, players: room.players,
            hitAny, hitSelf, hitResults, turnChanged, nextTurn,
            newlyEliminated, playerNames: room.playerNames
        });

        // 勝者判定
        const alive = room.players.filter(id => !room.eliminated.includes(id));
        if (alive.length === 1) {
            const winner = alive[0];
            room.started = false;
            clearTurnTimer(room);

            // 得点：勝者の有効文字数を加算
            const winnerScore = room.wordLengths[winner] || 0;
            room.scores[winner] = (room.scores[winner] || 0) + winnerScore;

            io.to(socket.roomId).emit("gameEnd", {
                winner,
                winnerName: room.playerNames[winner],
                winnerScore,
                scores: { ...room.scores },
                targetScore: room.targetScore,
            });

            // 勝利ポイント達成チェック
            if (room.targetScore > 0 && room.scores[winner] >= room.targetScore) {
                // スコアをリセットして次セッションへ
                room.scores = {};
                io.to(socket.roomId).emit("matchEnd", {
                    winner,
                    winnerName: room.playerNames[winner],
                    targetScore: room.targetScore,
                });
            }
        } else {
            // 次のターンのタイマー開始
            startTurnTimer(room, socket.roomId);
        }
    });

    socket.on("selectChar", (charId) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    room.playerChars[socket.id] = charId;
    io.to(socket.roomId).emit("charUpdate", { playerChars: room.playerChars });
    });

    socket.on("getRoomList", () => {
    const list = Object.entries(rooms)
        .filter(([id, room]) => !room.started && room.players.length > 0)
        .map(([id, room]) => ({
            roomId: id,
            hostName: room.playerNames[room.players[0]] || "？",
            playerCount: room.players.length,
            maxPlayers: 8,
        }));
    socket.emit("roomList", list);
    });

    // =====================
    // 再戦
    // =====================
    socket.on("rematch", () => {
        const room = rooms[socket.roomId];
        if (!room) return;
        room.rematchVotes = room.rematchVotes || [];
        if (room.rematchVotes.includes(socket.id)) return;
        room.rematchVotes.push(socket.id);
        io.to(socket.roomId).emit("rematchVoteUpdate", {
            votes: room.rematchVotes.length,
            total: room.players.length
        });
        if (room.rematchVotes.length === room.players.length) {
            room.answers = {};
            room.hits = {};
            room.wordLengths = {};
            room.started = false;
            room.rematchVotes = [];
            room.themeSelected = false;
            room.theme = null;
            room.eliminated = [];
            room.turnOrder = [...room.players].sort(() => Math.random() - 0.5);
            room.currentTurnIndex = 0;
            // scores はリセットしない（累積）
            io.to(socket.roomId).emit("rematchReady");
            io.to(socket.roomId).emit("ready", {
                turnOrder: room.turnOrder,
                playerNames: room.playerNames
            });
        }
    });
    
    // =====================
    // モード設定（部屋主のみ）
    // =====================
    socket.on("setMode", (mode) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.players[0] !== socket.id) return;
        room.mode = mode;
        io.to(socket.roomId).emit("modeUpdated", { mode });
    });

    // =====================
    // チーム・役割選択
    // =====================
    socket.on("selectTeam", ({ team, role, targetId }) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        
        // ホスト以外は自分のみ変更可能
        const actualTarget = (room.players[0] === socket.id) ? targetId : socket.id;

        // 既存チームから対象を削除
        Object.keys(room.teams).forEach(t => {
            room.teams[t] = (room.teams[t] || []).filter(id => id !== actualTarget);
            if (room.teamLeaders[t] === actualTarget) delete room.teamLeaders[t];
        });

        // リーダーは1人だけ
        if (role === 'leader') {
            if (room.teamLeaders[team]) {
                socket.emit("errorMessage", "そのチームにはすでにリーダーがいます");
                return;
            }
            room.teamLeaders[team] = actualTarget;
        }

        if (!room.teams[team]) room.teams[team] = [];
        room.teams[team].push(actualTarget);

        // 対象のsocketのteam/roleを更新
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.id === actualTarget);
        if (targetSocket) {
            targetSocket.team = team;
            targetSocket.teamRole = role;
        }

        io.to(socket.roomId).emit("teamUpdated", {
            teams: room.teams,
            teamLeaders: room.teamLeaders,
            playerNames: room.playerNames,
            playerChars: room.playerChars,
            allPlayers: room.players,
        });
    });

    socket.on("randomAssign", () => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.players[0] !== socket.id) return;

        // アクティブなチームを取得
        const activeTeams = ['A','B','C','D'].filter(t => room.teams[t] !== undefined);
        if (activeTeams.length < 2) activeTeams.push('A', 'B');

        // チームをリセット
        activeTeams.forEach(t => {
            room.teams[t] = [];
            delete room.teamLeaders[t];
        });

        // プレイヤーをシャッフル
        const shuffled = [...room.players].sort(() => Math.random() - 0.5);

        // 均等に割り当て
        shuffled.forEach((id, i) => {
            const team = activeTeams[i % activeTeams.length];
            if (!room.teams[team]) room.teams[team] = [];

            // 各チーム最初の1人をリーダーに
            if (!room.teamLeaders[team]) {
                room.teamLeaders[team] = id;
                room.teams[team].push(id);
                const s = [...io.sockets.sockets.values()].find(s => s.id === id);
                if (s) { s.team = team; s.teamRole = 'leader'; }
            } else {
                room.teams[team].push(id);
                const s = [...io.sockets.sockets.values()].find(s => s.id === id);
                if (s) { s.team = team; s.teamRole = 'member'; }
            }
        });

        io.to(socket.roomId).emit("teamUpdated", {
            teams: room.teams,
            teamLeaders: room.teamLeaders,
            playerNames: room.playerNames,
            playerChars: room.playerChars,
            allPlayers: room.players,
        });
    });

    socket.on("addTeam", (team) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        if (room.players[0] !== socket.id) return;
        if (!room.teams[team]) room.teams[team] = [];
        io.to(socket.roomId).emit("teamAdded", { team });
    });

    socket.on('teamAdded', (data) => {
        const card = document.querySelector(`.teamCard[data-team="${data.team}"]`);
        if (card) card.style.display = 'flex';
        if (data.team === 'C') {
            document.getElementById('addTeamC').hidden = true;
            document.getElementById('addTeamD').hidden = false;
        }
        if (data.team === 'D') {
            document.getElementById('addTeamD').hidden = true;
     }
    });

    // =====================
    // チームデスマッチ：リーダーが単語設定
    // =====================
    socket.on("setTeamAnswer", (answerArray) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const team = socket.team;
        if (!team) return;
        if (room.teamLeaders[team] !== socket.id) return;
        if (!Array.isArray(answerArray) || answerArray.length !== 7) return;

        room.teamAnswers[team] = answerArray;
        room.teamHits[team] = Array(7).fill(false);

        // 全チームの単語が揃ったら開始
        const activeTeams = Object.keys(room.teams).filter(t => room.teams[t].length > 0 && room.teamLeaders[t]);
        const allSet = activeTeams.every(t => room.teamAnswers[t]);
        if (allSet) {
            room.started = true;
            room.eliminated = [];

            // 各チームのメンバーターン順を初期化
            activeTeams.forEach(t => {
                const members = room.teams[t].filter(id => room.teamLeaders[t] !== id);
                room.teamTurnIndexes[t] = 0;
                room.teamMemberOrders[t] = members;
            });

            // 全プレイヤーにゲーム開始通知
            room.players.forEach(id => {
                io.to(id).emit("teamGameStart", {
                    teams: room.teams,
                    teamLeaders: room.teamLeaders,
                    playerNames: room.playerNames,
                    playerChars: room.playerChars,
                    teamAnswerLengths: getTeamAnswerLengths(room, activeTeams),
                    activeTeams,
                    teamScores: room.teamScores,
                    targetScore: room.targetScore,
                    timerDuration: room.timerDuration,
                    myTeam: socket.team,
                });
            });
        } else {
            socket.emit("waitingTeamAnswers");
        }
    });

    // =====================
    // チームデスマッチ：メンバーが攻撃
    // =====================
    socket.on("teamAttack", ({ kana }) => {
        const room = rooms[socket.roomId];
        if (!room || !room.started) return;
        const myTeam = socket.team;
        if (!myTeam) return;

        // 自分のターンか確認
        const memberOrder = room.teamMemberOrders[myTeam];
        const currentMember = memberOrder[room.teamTurnIndexes[myTeam] % memberOrder.length];
        if (socket.id !== currentMember) return;

        clearTurnTimer(room);

        // 自チームの単語に対してヒット判定
        const answer = room.teamAnswers[myTeam];
        const hits = room.teamHits[myTeam];
        let hitAny = false;
        const hitIndexes = [];

        answer.forEach((k, i) => {
            if (k === kana && !hits[i]) {
                hits[i] = true;
                hitIndexes.push(i);
                hitAny = true;
            }
        });

        // ターン交代判定（ミスしたら次のメンバーへ）
        const turnChanged = !hitAny;
        if (turnChanged) {
            room.teamTurnIndexes[myTeam] = (room.teamTurnIndexes[myTeam] + 1) % memberOrder.length;
        }

        const nextMember = memberOrder[room.teamTurnIndexes[myTeam] % memberOrder.length];

        // 全員に結果通知
        io.to(socket.roomId).emit("teamAttackResult", {
            kana,
            team: myTeam,
            attacker: socket.id,
            hitAny,
            hitIndexes,
            turnChanged,
            nextMember,
            teamHits: room.teamHits,
        });

        // ヒントをリセット
        room.currentHints = room.currentHints || {};
        room.currentHints[myTeam] = [];

        // 勝利判定：自チームの単語を全部当てた
        const allOpen = answer.every((k, i) => k === "×" || hits[i]);
        if (allOpen) {
            room.started = false;
            clearTurnTimer(room);

            const score = answer.filter(k => k !== "×").length;
            room.teamScores[myTeam] = (room.teamScores[myTeam] || 0) + score;

            io.to(socket.roomId).emit("teamGameEnd", {
                winnerTeam: myTeam,
                winnerScore: score,
                teamScores: room.teamScores,
                targetScore: room.targetScore,
                playerNames: room.playerNames,
            });

            if (room.targetScore > 0 && room.teamScores[myTeam] >= room.targetScore) {
                room.teamScores = {};
                io.to(socket.roomId).emit("teamMatchEnd", {
                    winnerTeam: myTeam,
                    targetScore: room.targetScore,
                });
            }
            return;
        }

        startTurnTimer(room, socket.roomId);
    });

    // =====================
    // リーダーが絵文字ヒント送信
    // =====================
    socket.on("sendHint", (emojis) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const myTeam = socket.team;
        if (!myTeam) return;
        if (room.teamLeaders[myTeam] !== socket.id) return;
        if (!Array.isArray(emojis) || emojis.length === 0 || emojis.length > 3) return;

        io.to(socket.roomId).emit("hintReceived", {
            team: myTeam,
            emojis,
            leaderName: room.playerNames[socket.id],
        });
    });

    // =====================
    // 切断
    // =====================
    socket.on("disconnect", () => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room) return;
        clearTurnTimer(room);
        room.players = room.players.filter(id => id !== socket.id);
        delete room.answers[socket.id];
        delete room.hits[socket.id];
        room.turnOrder = room.turnOrder.filter(id => id !== socket.id);
        io.to(roomId).emit("playerLeft", { playerNames: room.playerNames });
        if (room.players.length === 0) delete rooms[roomId];
    });
});

// =====================
// ヘルパー関数
// =====================
function advanceTurn(room) {
    const alive = room.players.filter(id => !room.eliminated.includes(id));
    if (alive.length === 0) return;
    let next = (room.currentTurnIndex + 1) % room.turnOrder.length;
    while (room.eliminated.includes(room.turnOrder[next])) {
        next = (next + 1) % room.turnOrder.length;
    }
    room.currentTurnIndex = next;
}

function startTurnTimer(room, roomId) {
    clearTurnTimer(room);
    if (!room.timerDuration || room.timerDuration <= 0) return;

    // 全クライアントにタイマー開始を通知
    io.to(roomId).emit("timerStart", { duration: room.timerDuration });

    room.turnTimer = setTimeout(() => {
        if (!room.started) return;

        advanceTurn(room);
        const nextTurn = room.turnOrder[room.currentTurnIndex];

        io.to(roomId).emit("turnTimeout", {
            nextTurn,
            playerNames: room.playerNames
        });

        // 次のターンのタイマー開始
        startTurnTimer(room, roomId);
    }, room.timerDuration * 1000);
}

function clearTurnTimer(room) {
    if (room && room.turnTimer) {
        clearTimeout(room.turnTimer);
        room.turnTimer = null;
    }
}

function getOpponentLengths(room, myId) {
    const result = {};
    room.players.forEach(id => {
        if (id !== myId) result[id] = room.answers[id].length;
    });
    return result;
}

function getLengths(room) {
    const result = {};
    room.players.forEach(id => {
        result[id] = room.answers[id] ? room.answers[id].length : 7;
    });
    return result;
}

function sendToSpectators(roomId, room, event, data) {
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (!sockets) return;
    [...sockets].filter(id => !room.players.includes(id)).forEach(id => {
        io.to(id).emit(event, data);
    });
}

function getTeamAnswerLengths(room, activeTeams) {
    const result = {};
    activeTeams.forEach(t => {
        result[t] = room.teamAnswers[t] ? room.teamAnswers[t].length : 7;
    });
    return result;
}

server.listen(3000, () => {
    console.log("server running on port 3000");
});